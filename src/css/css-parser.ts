/**
 * @module css/css-parser
 * @description Hand-written CSS parser that produces a CSS AST.
 * Includes a tokenizer and recursive-descent parser supporting:
 * - Selectors (element, class, id, attribute, pseudo-class, pseudo-element, combinators)
 * - Declaration blocks with property:value pairs
 * - At-rules (@media, @keyframes, @import, @font-face, @layer, @container, @supports, @charset)
 * - CSS custom properties (--var-name, var())
 * - CSS Nesting (& selector)
 * - CSS Modules (:local(), :global(), composes:)
 */

import type {
  Stylesheet,
  Rule,
  Declaration,
  AtRule,
  SelectorList,
  Selector,
  SelectorPart,
  CSSTopLevelNode,
  DeclarationOrNested,
  Comment,
  CSSPosition,
} from "./css-ast.js";

// ============================================================
// Token types
// ============================================================

/** CSS token types produced by the tokenizer. */
export type CSSTokenType =
  | "ident"
  | "string"
  | "number"
  | "hash"
  | "at-keyword"
  | "function"
  | "whitespace"
  | "comment"
  | "delim"
  | "colon"
  | "semicolon"
  | "comma"
  | "open-brace"
  | "close-brace"
  | "open-paren"
  | "close-paren"
  | "open-bracket"
  | "close-bracket"
  | "eof";

/** A single CSS token. */
export interface CSSToken {
  readonly type: CSSTokenType;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

// ============================================================
// Tokenizer
// ============================================================

/**
 * Tokenize a CSS source string into an array of tokens.
 *
 * @param source - The CSS source code.
 * @returns Array of CSS tokens.
 */
export const tokenize = (source: string): ReadonlyArray<CSSToken> => {
  const tokens: Array<CSSToken> = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source[i];

    // Whitespace
    if (
      ch === " " ||
      ch === "\t" ||
      ch === "\n" ||
      ch === "\r" ||
      ch === "\f"
    ) {
      const start = i;
      while (
        i < len &&
        (source[i] === " " ||
          source[i] === "\t" ||
          source[i] === "\n" ||
          source[i] === "\r" ||
          source[i] === "\f")
      ) {
        i++;
      }
      tokens.push({
        type: "whitespace",
        value: source.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Comments
    if (ch === "/" && i + 1 < len && source[i + 1] === "*") {
      const start = i;
      i += 2;
      while (
        i < len &&
        !(source[i] === "*" && i + 1 < len && source[i + 1] === "/")
      ) {
        i++;
      }
      if (i < len) {
        i += 2; // skip */
      }
      tokens.push({
        type: "comment",
        value: source.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Strings
    if (ch === '"' || ch === "'") {
      const start = i;
      const quote = ch;
      i++;
      while (i < len && source[i] !== quote) {
        if (source[i] === "\\") {
          i++;
        }
        i++;
      }
      if (i < len) {
        i++; // skip closing quote
      }
      tokens.push({
        type: "string",
        value: source.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Hash (#hex colors or IDs)
    if (ch === "#") {
      const start = i;
      i++;
      while (i < len && isNameChar(source[i])) {
        i++;
      }
      tokens.push({
        type: "hash",
        value: source.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // At-keywords (@media, @import, etc.)
    if (ch === "@") {
      const start = i;
      i++;
      while (i < len && isNameChar(source[i])) {
        i++;
      }
      tokens.push({
        type: "at-keyword",
        value: source.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Numbers (with optional unit)
    if (isDigit(ch) || (ch === "." && i + 1 < len && isDigit(source[i + 1]))) {
      const start = i;
      if (ch === "-" || ch === "+") {
        i++;
      }
      while (i < len && isDigit(source[i])) {
        i++;
      }
      if (i < len && source[i] === ".") {
        i++;
        while (i < len && isDigit(source[i])) {
          i++;
        }
      }
      // Unit suffix (%, px, em, etc.)
      while (i < len && isNameChar(source[i])) {
        i++;
      }
      tokens.push({
        type: "number",
        value: source.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Identifiers and functions
    if (isNameStart(ch) || ch === "-" || ch === "_") {
      const start = i;
      // Handle -- custom properties
      if (ch === "-" && i + 1 < len && source[i + 1] === "-") {
        i += 2;
        while (i < len && isNameChar(source[i])) {
          i++;
        }
        tokens.push({
          type: "ident",
          value: source.slice(start, i),
          start,
          end: i,
        });
        continue;
      }
      // Handle single - followed by nothing name-like (it's a delim)
      if (
        ch === "-" &&
        (i + 1 >= len || (!isNameStart(source[i + 1]) && source[i + 1] !== "-"))
      ) {
        tokens.push({ type: "delim", value: ch, start: i, end: i + 1 });
        i++;
        continue;
      }
      while (i < len && isNameChar(source[i])) {
        i++;
      }
      // Check if it's a function (followed by open paren)
      if (i < len && source[i] === "(") {
        tokens.push({
          type: "function",
          value: source.slice(start, i),
          start,
          end: i,
        });
        continue;
      }
      tokens.push({
        type: "ident",
        value: source.slice(start, i),
        start,
        end: i,
      });
      continue;
    }

    // Single-character tokens
    const start = i;
    i++;
    switch (ch) {
      case ":":
        tokens.push({ type: "colon", value: ch, start, end: i });
        break;
      case ";":
        tokens.push({ type: "semicolon", value: ch, start, end: i });
        break;
      case ",":
        tokens.push({ type: "comma", value: ch, start, end: i });
        break;
      case "{":
        tokens.push({ type: "open-brace", value: ch, start, end: i });
        break;
      case "}":
        tokens.push({ type: "close-brace", value: ch, start, end: i });
        break;
      case "(":
        tokens.push({ type: "open-paren", value: ch, start, end: i });
        break;
      case ")":
        tokens.push({ type: "close-paren", value: ch, start, end: i });
        break;
      case "[":
        tokens.push({ type: "open-bracket", value: ch, start, end: i });
        break;
      case "]":
        tokens.push({ type: "close-bracket", value: ch, start, end: i });
        break;
      default:
        tokens.push({ type: "delim", value: ch, start, end: i });
        break;
    }
  }

  tokens.push({ type: "eof", value: "", start: len, end: len });
  return tokens;
};

const isDigit = (ch: string): boolean => ch >= "0" && ch <= "9";
const isNameStart = (ch: string): boolean =>
  (ch >= "a" && ch <= "z") ||
  (ch >= "A" && ch <= "Z") ||
  ch === "_" ||
  ch.charCodeAt(0) > 127;
const isNameChar = (ch: string): boolean =>
  isNameStart(ch) || isDigit(ch) || ch === "-";

// ============================================================
// Parser
// ============================================================

/**
 * Parse a CSS source string into a Stylesheet AST.
 *
 * @param source - The CSS source code.
 * @returns The parsed Stylesheet AST.
 */
export const parseCSS = (source: string): Stylesheet => {
  const tokens = tokenize(source);
  const parser = new CSSParser(tokens, source);
  return parser.parseStylesheet();
};

/**
 * Compute line/column position from an offset into the source string.
 *
 * @param source - The source code.
 * @param offset - The character offset.
 * @returns A CSSPosition with line, column, and offset.
 */
const positionFromOffset = (source: string, offset: number): CSSPosition => {
  let line = 1;
  let column = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      column = 0;
    } else {
      column++;
    }
  }
  return { offset, line, column };
};

/**
 * Recursive-descent CSS parser.
 */
class CSSParser {
  private readonly tokens: ReadonlyArray<CSSToken>;
  private readonly source: string;
  private pos: number;

  constructor(tokens: ReadonlyArray<CSSToken>, source: string) {
    this.tokens = tokens;
    this.source = source;
    this.pos = 0;
  }

  private peek(): CSSToken {
    return this.tokens[this.pos];
  }

  private advance(): CSSToken {
    const tok = this.tokens[this.pos];
    this.pos++;
    return tok;
  }

  private skipWhitespaceAndComments(): ReadonlyArray<Comment> {
    const comments: Array<Comment> = [];
    while (this.pos < this.tokens.length) {
      const tok = this.peek();
      if (tok.type === "whitespace") {
        this.advance();
      } else if (tok.type === "comment") {
        const ct = this.advance();
        comments.push({
          type: "Comment",
          value: ct.value.slice(2, -2),
          loc: {
            start: positionFromOffset(this.source, ct.start),
            end: positionFromOffset(this.source, ct.end),
          },
        });
      } else {
        break;
      }
    }
    return comments;
  }

  private expect(type: CSSTokenType): CSSToken {
    const tok = this.peek();
    if (tok.type !== type) {
      throw new Error(
        `CSS parse error: expected ${type} but got ${tok.type} ("${tok.value}") at offset ${tok.start}`,
      );
    }
    return this.advance();
  }

  parseStylesheet(): Stylesheet {
    const startOffset = this.peek().start;
    const rules: Array<CSSTopLevelNode> = [];

    while (this.peek().type !== "eof") {
      const comments = this.skipWhitespaceAndComments();
      for (const c of comments) {
        rules.push(c);
      }
      if (this.peek().type === "eof") {
        break;
      }
      rules.push(this.parseTopLevel());
    }

    return {
      type: "Stylesheet",
      rules,
      loc: {
        start: positionFromOffset(this.source, startOffset),
        end: positionFromOffset(this.source, this.source.length),
      },
    };
  }

  private parseTopLevel(): CSSTopLevelNode {
    const tok = this.peek();
    if (tok.type === "at-keyword") {
      return this.parseAtRule();
    }
    return this.parseRule();
  }

  private parseAtRule(): AtRule {
    const startTok = this.expect("at-keyword");
    const name = startTok.value.slice(1); // remove @
    this.skipWhitespaceAndComments();

    // Collect params
    let params = "";
    while (
      this.peek().type !== "open-brace" &&
      this.peek().type !== "semicolon" &&
      this.peek().type !== "eof"
    ) {
      params += this.advance().value;
    }
    params = params.trim();

    let rules: Array<CSSTopLevelNode | DeclarationOrNested> | undefined;
    if (this.peek().type === "open-brace") {
      this.advance(); // skip {
      rules = [];
      this.skipWhitespaceAndComments();

      // Parse block content - could be rules, declarations, or keyframes
      while (this.peek().type !== "close-brace" && this.peek().type !== "eof") {
        const comments = this.skipWhitespaceAndComments();
        for (const c of comments) {
          rules.push(c);
        }
        if (this.peek().type === "close-brace" || this.peek().type === "eof") {
          break;
        }

        // Determine if the next thing is a declaration or a nested rule/at-rule
        if (this.peek().type === "at-keyword") {
          rules.push(this.parseAtRule());
        } else if (this.isDeclarationStart()) {
          rules.push(this.parseDeclaration());
        } else {
          rules.push(this.parseRule());
        }
        this.skipWhitespaceAndComments();
      }

      if (this.peek().type === "close-brace") {
        this.advance();
      }
    } else if (this.peek().type === "semicolon") {
      this.advance();
    }

    return {
      type: "AtRule",
      name,
      params,
      rules,
      loc: {
        start: positionFromOffset(this.source, startTok.start),
        end: positionFromOffset(
          this.source,
          this.tokens[this.pos - 1]?.end ?? startTok.end,
        ),
      },
    };
  }

  /**
   * Determine if the current position is a declaration (property: value)
   * rather than a selector for a nested rule.
   */
  private isDeclarationStart(): boolean {
    // Save position and look ahead
    const saved = this.pos;
    let result = false;

    try {
      // Skip the potential property name
      const tok = this.peek();
      // Custom property (--xxx) is always a declaration
      if (tok.type === "ident" && tok.value.startsWith("--")) {
        // Look for colon
        this.advance();
        this.skipWhitespaceAndComments();
        if (this.peek().type === "colon") {
          result = true;
        }
        return result;
      }

      // Regular property: ident followed by colon
      if (tok.type === "ident") {
        this.advance();
        this.skipWhitespaceAndComments();
        if (this.peek().type === "colon") {
          // Check it's not a pseudo-selector (::, or : followed by a known pseudo)
          const afterColon = this.pos + 1;
          if (
            afterColon < this.tokens.length &&
            this.tokens[afterColon].type === "colon"
          ) {
            // Double colon - pseudo-element, not a declaration
            result = false;
          } else {
            result = true;
          }
        }
        return result;
      }

      return false;
    } finally {
      this.pos = saved;
    }
  }

  private parseRule(): Rule {
    const startOffset = this.peek().start;
    const selectors = this.parseSelectorList();
    this.skipWhitespaceAndComments();
    this.expect("open-brace");
    this.skipWhitespaceAndComments();

    const declarations: Array<DeclarationOrNested> = [];

    while (this.peek().type !== "close-brace" && this.peek().type !== "eof") {
      const comments = this.skipWhitespaceAndComments();
      for (const c of comments) {
        declarations.push(c);
      }
      if (this.peek().type === "close-brace" || this.peek().type === "eof") {
        break;
      }

      if (this.peek().type === "at-keyword") {
        declarations.push(this.parseAtRule());
      } else if (this.isDeclarationStart()) {
        declarations.push(this.parseDeclaration());
      } else {
        // Nested rule (CSS nesting)
        declarations.push(this.parseRule());
      }
      this.skipWhitespaceAndComments();
    }

    const endTok =
      this.peek().type === "close-brace" ? this.advance() : this.peek();

    return {
      type: "Rule",
      selectors,
      declarations,
      loc: {
        start: positionFromOffset(this.source, startOffset),
        end: positionFromOffset(this.source, endTok.end),
      },
    };
  }

  private parseSelectorList(): SelectorList {
    const startOffset = this.peek().start;
    const selectors: Array<Selector> = [this.parseSelector()];

    while (this.peek().type === "comma") {
      this.advance();
      this.skipWhitespaceAndComments();
      selectors.push(this.parseSelector());
    }

    return {
      type: "SelectorList",
      selectors,
      loc: {
        start: positionFromOffset(this.source, startOffset),
        end: positionFromOffset(
          this.source,
          this.tokens[this.pos - 1]?.end ?? startOffset,
        ),
      },
    };
  }

  private parseSelector(): Selector {
    const startOffset = this.peek().start;
    const parts: Array<SelectorPart> = [];

    while (
      this.peek().type !== "open-brace" &&
      this.peek().type !== "comma" &&
      this.peek().type !== "eof" &&
      this.peek().type !== "close-paren"
    ) {
      const tok = this.peek();

      // Whitespace can be a descendant combinator
      if (tok.type === "whitespace") {
        this.advance();
        // Check if next token continues the selector
        const next = this.peek();
        if (
          next.type === "open-brace" ||
          next.type === "comma" ||
          next.type === "eof" ||
          next.type === "close-paren"
        ) {
          break;
        }
        // Check if the next non-whitespace is a combinator
        if (
          next.type === "delim" &&
          (next.value === ">" || next.value === "+" || next.value === "~")
        ) {
          continue; // let the combinator handler pick it up
        }
        // It's a descendant combinator
        if (parts.length > 0) {
          parts.push({ type: "Combinator", value: " " });
        }
        continue;
      }

      if (tok.type === "comment") {
        this.advance();
        continue;
      }

      // Class selector
      if (tok.type === "delim" && tok.value === ".") {
        this.advance();
        const name = this.advance();
        parts.push({ type: "ClassSelector", name: name.value });
        continue;
      }

      // ID selector (hash)
      if (tok.type === "hash") {
        this.advance();
        parts.push({ type: "IdSelector", name: tok.value.slice(1) });
        continue;
      }

      // Universal selector
      if (tok.type === "delim" && tok.value === "*") {
        this.advance();
        parts.push({ type: "UniversalSelector" });
        continue;
      }

      // Nesting selector
      if (tok.type === "delim" && tok.value === "&") {
        this.advance();
        parts.push({ type: "NestingSelector" });
        continue;
      }

      // Combinators
      if (
        tok.type === "delim" &&
        (tok.value === ">" || tok.value === "+" || tok.value === "~")
      ) {
        this.advance();
        this.skipWhitespaceAndComments();
        parts.push({ type: "Combinator", value: tok.value as ">" | "+" | "~" });
        continue;
      }

      // Pseudo-element (::)
      if (
        tok.type === "colon" &&
        this.pos + 1 < this.tokens.length &&
        this.tokens[this.pos + 1].type === "colon"
      ) {
        this.advance(); // first :
        this.advance(); // second :
        const name = this.advance();
        let args: string | undefined;
        if (
          this.peek().type === "open-paren" ||
          this.peek().type === "function"
        ) {
          args = this.consumeParenContent();
        }
        parts.push({ type: "PseudoElementSelector", name: name.value, args });
        continue;
      }

      // Pseudo-class (:)
      if (tok.type === "colon") {
        this.advance();
        const nameTok = this.advance();
        let args: string | undefined;
        if (this.peek().type === "open-paren") {
          args = this.consumeParenContent();
        }
        parts.push({ type: "PseudoClassSelector", name: nameTok.value, args });
        continue;
      }

      // Attribute selector ([...])
      if (tok.type === "open-bracket") {
        parts.push(this.parseAttributeSelector());
        continue;
      }

      // Function in selector (e.g. :local(), :global())
      if (tok.type === "function") {
        const funcName = tok.value;
        this.advance();
        const args = this.consumeParenContent();
        parts.push({ type: "PseudoClassSelector", name: funcName, args });
        continue;
      }

      // Element selector (ident)
      if (tok.type === "ident") {
        this.advance();
        parts.push({ type: "ElementSelector", name: tok.value });
        continue;
      }

      // Number in selector (for keyframes like "50%")
      if (tok.type === "number") {
        this.advance();
        parts.push({ type: "ElementSelector", name: tok.value });
        continue;
      }

      // Unknown token - skip
      this.advance();
    }

    return {
      type: "Selector",
      parts,
      loc: {
        start: positionFromOffset(this.source, startOffset),
        end: positionFromOffset(
          this.source,
          this.tokens[this.pos - 1]?.end ?? startOffset,
        ),
      },
    };
  }

  private parseAttributeSelector(): SelectorPart {
    this.expect("open-bracket");
    this.skipWhitespaceAndComments();
    const name = this.advance().value;
    this.skipWhitespaceAndComments();

    let operator: string | undefined;
    let value: string | undefined;
    let flags: string | undefined;

    // Check for operator
    if (this.peek().type !== "close-bracket") {
      // Collect operator
      operator = "";
      while (
        this.peek().type !== "close-bracket" &&
        this.peek().type !== "eof" &&
        this.peek().type !== "string" &&
        this.peek().type !== "ident"
      ) {
        operator += this.advance().value;
      }
      operator = operator.trim();

      this.skipWhitespaceAndComments();
      // Collect value
      if (this.peek().type === "string") {
        const strTok = this.advance();
        value = strTok.value.slice(1, -1); // remove quotes
      } else if (this.peek().type !== "close-bracket") {
        value = this.advance().value;
      }

      this.skipWhitespaceAndComments();
      // Flags (e.g., `i` for case-insensitive)
      if (this.peek().type === "ident") {
        flags = this.advance().value;
      }
    }

    this.skipWhitespaceAndComments();
    if (this.peek().type === "close-bracket") {
      this.advance();
    }

    return { type: "AttributeSelector", name, operator, value, flags };
  }

  /**
   * Consume content inside parentheses, returning the inner text.
   * Handles nested parens.
   */
  private consumeParenContent(): string {
    this.expect("open-paren");
    let depth = 1;
    let content = "";
    while (depth > 0 && this.peek().type !== "eof") {
      const tok = this.peek();
      if (tok.type === "open-paren") {
        depth++;
      } else if (tok.type === "close-paren") {
        depth--;
        if (depth === 0) {
          this.advance();
          break;
        }
      }
      content += this.advance().value;
    }
    return content.trim();
  }

  private parseDeclaration(): Declaration {
    const startOffset = this.peek().start;
    const propertyTok = this.advance();
    const property = propertyTok.value;
    this.skipWhitespaceAndComments();
    this.expect("colon");
    this.skipWhitespaceAndComments();

    // Collect value tokens until ; or }
    let value = "";
    let important = false;
    while (
      this.peek().type !== "semicolon" &&
      this.peek().type !== "close-brace" &&
      this.peek().type !== "eof"
    ) {
      const tok = this.peek();
      // Check for !important
      if (tok.type === "delim" && tok.value === "!") {
        this.advance();
        this.skipWhitespaceAndComments();
        if (this.peek().type === "ident" && this.peek().value === "important") {
          this.advance();
          important = true;
          continue;
        }
        value += "!";
        continue;
      }
      value += this.advance().value;
    }

    if (this.peek().type === "semicolon") {
      this.advance();
    }

    return {
      type: "Declaration",
      property,
      value: value.trim(),
      important,
      loc: {
        start: positionFromOffset(this.source, startOffset),
        end: positionFromOffset(
          this.source,
          this.tokens[this.pos - 1]?.end ?? startOffset,
        ),
      },
    };
  }
}
