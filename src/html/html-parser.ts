/**
 * @module html/html-parser
 * @description Hand-written HTML/XML tokenizer and tree builder.
 * Supports two modes:
 * - HTML mode (lenient): void elements, optional closing tags, raw text elements,
 *   case-insensitive tags, unquoted attributes
 * - XML mode (strict): well-formedness, case-sensitive, namespace support,
 *   CDATA sections, processing instructions
 * Includes position tracking and error recovery.
 */

import type {
  HtmlDocument,
  Element,
  Attribute,
  Text,
  Comment,
  CdataSection,
  ProcessingInstruction,
  Doctype,
  HtmlChildNode,
  HtmlPosition,
  HtmlLocation,
} from "./html-ast.js";

// ============================================================
// Parse options
// ============================================================

/** Options for the HTML/XML parser. */
export interface ParseHtmlOptions {
  /** Parsing mode: 'html' for lenient, 'xml' for strict. */
  readonly mode: "html" | "xml";
  /** Whether to recover from parse errors instead of throwing. */
  readonly recover?: boolean;
}

// ============================================================
// Parse errors
// ============================================================

/** A parse error collected during error-recovery mode. */
export interface HtmlParseError {
  readonly message: string;
  readonly loc: HtmlPosition;
}

// ============================================================
// Constants
// ============================================================

/** HTML void elements that have no closing tag. */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Elements whose closing tag is optional and auto-close when certain siblings appear. */
const OPTIONAL_CLOSE_ELEMENTS = new Set([
  "p",
  "li",
  "td",
  "th",
  "tr",
  "thead",
  "tbody",
  "tfoot",
  "dt",
  "dd",
  "option",
  "optgroup",
  "colgroup",
  "caption",
]);

/** Elements that close a <p> tag when opened. */
const P_CLOSING_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
]);

/** Raw text elements whose content is not parsed as HTML. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

/** Escapable raw text elements. */
const ESCAPABLE_RAW_TEXT_ELEMENTS = new Set(["textarea", "title"]);

// ============================================================
// Parser
// ============================================================

/**
 * Parse an HTML or XML string into an HtmlDocument AST.
 *
 * @param source - The HTML/XML source code.
 * @param options - Parser options.
 * @returns The parsed HtmlDocument AST.
 */
export const parseHtml = (
  source: string,
  options: ParseHtmlOptions = { mode: "html" },
): HtmlDocument => {
  const parser = new HtmlParser(source, options);
  return parser.parse();
};

/**
 * Compute a position from an offset into the source.
 */
const positionFromOffset = (source: string, offset: number): HtmlPosition => {
  let line = 1;
  let column = 0;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) {
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
 * Create a location span from two offsets.
 */
const locationFromOffsets = (
  source: string,
  start: number,
  end: number,
): HtmlLocation => ({
  start: positionFromOffset(source, start),
  end: positionFromOffset(source, end),
});

/**
 * Hand-written HTML/XML parser with tokenizer and tree builder.
 */
class HtmlParser {
  private readonly source: string;
  private readonly mode: "html" | "xml";
  private readonly recover: boolean;
  private readonly errors: Array<HtmlParseError>;
  private pos: number;

  constructor(source: string, options: ParseHtmlOptions) {
    this.source = source;
    this.mode = options.mode;
    this.recover = options.recover ?? false;
    this.errors = [];
    this.pos = 0;
  }

  parse(): HtmlDocument {
    const startPos = this.pos;
    let doctype: Doctype | undefined;
    const children: Array<HtmlChildNode> = [];

    while (this.pos < this.source.length) {
      if (this.startsWith("<!DOCTYPE") || this.startsWith("<!doctype")) {
        doctype = this.parseDoctype();
      } else if (this.startsWith("<!--")) {
        children.push(this.parseComment());
      } else if (this.mode === "xml" && this.startsWith("<![CDATA[")) {
        children.push(this.parseCdata());
      } else if (this.startsWith("<?")) {
        children.push(this.parseProcessingInstruction());
      } else if (this.startsWith("</")) {
        // Stray closing tag at top level - skip in recovery mode
        if (this.recover) {
          this.addError("Unexpected closing tag at document level");
          this.skipPastChar(">");
        } else {
          throw new Error(
            `Unexpected closing tag at document level at offset ${this.pos}`,
          );
        }
      } else if (this.startsWith("<")) {
        children.push(this.parseElement([]));
      } else {
        children.push(this.parseText("<"));
      }
    }

    return {
      type: "HtmlDocument",
      mode: this.mode,
      doctype,
      children,
      loc: locationFromOffsets(this.source, startPos, this.pos),
    };
  }

  // --------------------------------------------------------
  // Doctype
  // --------------------------------------------------------

  private parseDoctype(): Doctype {
    const start = this.pos;
    // skip <!DOCTYPE or <!doctype
    this.pos += 9;
    this.skipWhitespace();

    // Name
    const name = this.readWhile(
      (ch) =>
        ch !== ">" && ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r",
    );
    this.skipWhitespace();

    let publicId: string | undefined;
    let systemId: string | undefined;

    // PUBLIC or SYSTEM
    if (this.startsWithCaseInsensitive("PUBLIC")) {
      this.pos += 6;
      this.skipWhitespace();
      publicId = this.readQuotedString();
      this.skipWhitespace();
      if (this.pos < this.source.length && this.source[this.pos] !== ">") {
        systemId = this.readQuotedString();
      }
    } else if (this.startsWithCaseInsensitive("SYSTEM")) {
      this.pos += 6;
      this.skipWhitespace();
      systemId = this.readQuotedString();
    }

    this.skipWhitespace();
    if (this.pos < this.source.length && this.source[this.pos] === ">") {
      this.pos++;
    }

    return {
      type: "Doctype",
      name,
      publicId,
      systemId,
      loc: locationFromOffsets(this.source, start, this.pos),
    };
  }

  // --------------------------------------------------------
  // Comments
  // --------------------------------------------------------

  private parseComment(): Comment {
    const start = this.pos;
    this.pos += 4; // skip <!--
    const valueStart = this.pos;

    while (this.pos < this.source.length && !this.startsWith("-->")) {
      this.pos++;
    }

    const value = this.source.slice(valueStart, this.pos);
    if (this.startsWith("-->")) {
      this.pos += 3;
    }

    return {
      type: "Comment",
      value,
      loc: locationFromOffsets(this.source, start, this.pos),
    };
  }

  // --------------------------------------------------------
  // CDATA
  // --------------------------------------------------------

  private parseCdata(): CdataSection {
    const start = this.pos;
    this.pos += 9; // skip <![CDATA[
    const valueStart = this.pos;

    while (this.pos < this.source.length && !this.startsWith("]]>")) {
      this.pos++;
    }

    const value = this.source.slice(valueStart, this.pos);
    if (this.startsWith("]]>")) {
      this.pos += 3;
    }

    return {
      type: "CdataSection",
      value,
      loc: locationFromOffsets(this.source, start, this.pos),
    };
  }

  // --------------------------------------------------------
  // Processing Instructions
  // --------------------------------------------------------

  private parseProcessingInstruction(): ProcessingInstruction {
    const start = this.pos;
    this.pos += 2; // skip <?
    this.skipWhitespace();

    const target = this.readWhile(
      (ch) =>
        ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r" && ch !== "?",
    );
    this.skipWhitespace();

    const dataStart = this.pos;
    while (this.pos < this.source.length && !this.startsWith("?>")) {
      this.pos++;
    }
    const data = this.source.slice(dataStart, this.pos).trim();

    if (this.startsWith("?>")) {
      this.pos += 2;
    }

    return {
      type: "ProcessingInstruction",
      target,
      data,
      loc: locationFromOffsets(this.source, start, this.pos),
    };
  }

  // --------------------------------------------------------
  // Elements
  // --------------------------------------------------------

  private parseElement(ancestors: ReadonlyArray<string>): Element {
    const start = this.pos;
    this.pos++; // skip <

    // Tag name (possibly with namespace prefix in XML mode)
    const rawTagName = this.readTagName();
    const tagName =
      this.mode === "html" ? rawTagName.toLowerCase() : rawTagName;

    let namespace: string | undefined;
    if (this.mode === "xml" && tagName.includes(":")) {
      const colonIndex = tagName.indexOf(":");
      namespace = tagName.slice(0, colonIndex);
    }

    // Attributes
    const attributes = this.parseAttributes();

    // Self-closing />
    this.skipWhitespace();
    let selfClosing = false;
    if (this.pos < this.source.length && this.source[this.pos] === "/") {
      selfClosing = true;
      this.pos++;
    }
    if (this.pos < this.source.length && this.source[this.pos] === ">") {
      this.pos++;
    }

    // Void elements in HTML mode never have children
    if (this.mode === "html" && VOID_ELEMENTS.has(tagName)) {
      return {
        type: "Element",
        tagName,
        namespace,
        attributes,
        children: [],
        selfClosing: selfClosing || true,
        loc: locationFromOffsets(this.source, start, this.pos),
      };
    }

    // Self-closing elements have no children
    if (selfClosing) {
      return {
        type: "Element",
        tagName,
        namespace,
        attributes,
        children: [],
        selfClosing: true,
        loc: locationFromOffsets(this.source, start, this.pos),
      };
    }

    // Raw text elements (script, style) - read content as text until closing tag
    if (
      this.mode === "html" &&
      (RAW_TEXT_ELEMENTS.has(tagName) ||
        ESCAPABLE_RAW_TEXT_ELEMENTS.has(tagName))
    ) {
      const children = this.parseRawTextContent(tagName);
      return {
        type: "Element",
        tagName,
        namespace,
        attributes,
        children,
        selfClosing: false,
        loc: locationFromOffsets(this.source, start, this.pos),
      };
    }

    // Parse children
    const children = this.parseChildren(tagName, ancestors);

    return {
      type: "Element",
      tagName,
      namespace,
      attributes,
      children,
      selfClosing: false,
      loc: locationFromOffsets(this.source, start, this.pos),
    };
  }

  private parseChildren(
    parentTag: string,
    ancestors: ReadonlyArray<string>,
  ): Array<HtmlChildNode> {
    const children: Array<HtmlChildNode> = [];
    const newAncestors = [...ancestors, parentTag];

    while (this.pos < this.source.length) {
      // Check for closing tag of current element
      if (this.startsWith("</")) {
        const saved = this.pos;
        this.pos += 2;
        const closingName = this.readTagName();
        this.pos = saved; // restore

        const normalizedClosing =
          this.mode === "html" ? closingName.toLowerCase() : closingName;

        if (normalizedClosing === parentTag) {
          // Consume the closing tag
          this.consumeClosingTag();
          return children;
        }

        // In HTML mode, check if this closing tag belongs to an ancestor
        if (this.mode === "html") {
          if (
            OPTIONAL_CLOSE_ELEMENTS.has(parentTag) &&
            newAncestors.includes(normalizedClosing)
          ) {
            // Don't consume the closing tag; let the ancestor handle it
            return children;
          }

          // Stray closing tag - recover or throw
          if (this.recover) {
            this.addError(`Unexpected closing tag </${normalizedClosing}>`);
            this.consumeClosingTag();
            continue;
          } else {
            // Check if it matches any ancestor; if so, implicitly close
            if (newAncestors.includes(normalizedClosing)) {
              return children;
            }
            throw new Error(
              `Unexpected closing tag </${normalizedClosing}> at offset ${this.pos}`,
            );
          }
        } else {
          // XML mode: strict matching
          if (this.recover) {
            this.addError(
              `Expected closing tag </${parentTag}> but found </${normalizedClosing}>`,
            );
            this.consumeClosingTag();
            continue;
          }
          throw new Error(
            `Expected closing tag </${parentTag}> but found </${normalizedClosing}> at offset ${this.pos}`,
          );
        }
      }

      if (this.startsWith("<!--")) {
        children.push(this.parseComment());
      } else if (this.mode === "xml" && this.startsWith("<![CDATA[")) {
        children.push(this.parseCdata());
      } else if (this.startsWith("<?")) {
        children.push(this.parseProcessingInstruction());
      } else if (this.startsWith("<")) {
        // In HTML mode, check if opening a new element should auto-close the current one
        if (this.mode === "html") {
          const saved = this.pos;
          this.pos++; // skip <
          const nextTagName = this.readTagName().toLowerCase();
          this.pos = saved; // restore

          // Auto-close <p> when certain block elements open
          if (parentTag === "p" && P_CLOSING_TAGS.has(nextTagName)) {
            return children;
          }

          // Auto-close <li> when another <li> opens
          if (parentTag === "li" && nextTagName === "li") {
            return children;
          }

          // Auto-close <td>/<th> when another <td>/<th> opens
          if (
            (parentTag === "td" || parentTag === "th") &&
            (nextTagName === "td" || nextTagName === "th")
          ) {
            return children;
          }

          // Auto-close <tr> when another <tr> opens
          if (parentTag === "tr" && nextTagName === "tr") {
            return children;
          }

          // Auto-close <dt>/<dd> when another <dt>/<dd> opens
          if (
            (parentTag === "dt" || parentTag === "dd") &&
            (nextTagName === "dt" || nextTagName === "dd")
          ) {
            return children;
          }

          // Auto-close <option> when another <option> opens
          if (parentTag === "option" && nextTagName === "option") {
            return children;
          }
        }

        children.push(this.parseElement(newAncestors));
      } else {
        children.push(this.parseText("<"));
      }
    }

    // Reached end of input without closing tag
    if (this.mode === "html" && OPTIONAL_CLOSE_ELEMENTS.has(parentTag)) {
      return children;
    }

    if (this.recover) {
      this.addError(`Unclosed element <${parentTag}>`);
      return children;
    }

    // In HTML mode, be lenient about unclosed tags at EOF
    if (this.mode === "html") {
      return children;
    }

    throw new Error(`Unclosed element <${parentTag}>`);
  }

  private parseRawTextContent(tagName: string): Array<HtmlChildNode> {
    const closingTag = `</${tagName}`;
    const textStart = this.pos;

    while (this.pos < this.source.length) {
      if (this.startsWithCaseInsensitive(closingTag)) {
        // Verify the closing tag is complete
        const afterTag = this.pos + closingTag.length;
        if (
          afterTag < this.source.length &&
          (this.source[afterTag] === ">" ||
            this.source[afterTag] === " " ||
            this.source[afterTag] === "\t" ||
            this.source[afterTag] === "\n" ||
            this.source[afterTag] === "\r")
        ) {
          break;
        }
      }
      this.pos++;
    }

    const children: Array<HtmlChildNode> = [];
    const textContent = this.source.slice(textStart, this.pos);
    if (textContent.length > 0) {
      children.push({
        type: "Text",
        value: textContent,
        loc: locationFromOffsets(this.source, textStart, this.pos),
      });
    }

    // Consume the closing tag
    if (this.pos < this.source.length) {
      this.consumeClosingTag();
    }

    return children;
  }

  private consumeClosingTag(): void {
    if (!this.startsWith("</")) {
      return;
    }
    this.pos += 2;
    this.readTagName();
    this.skipWhitespace();
    if (this.pos < this.source.length && this.source[this.pos] === ">") {
      this.pos++;
    }
  }

  // --------------------------------------------------------
  // Attributes
  // --------------------------------------------------------

  private parseAttributes(): Array<Attribute> {
    const attrs: Array<Attribute> = [];

    while (this.pos < this.source.length) {
      this.skipWhitespace();

      const ch = this.source[this.pos];
      if (ch === ">" || ch === "/" || this.pos >= this.source.length) {
        break;
      }

      attrs.push(this.parseAttribute());
    }

    return attrs;
  }

  private parseAttribute(): Attribute {
    const start = this.pos;

    // Attribute name (may include namespace prefix in XML)
    const name = this.readWhile(
      (ch) =>
        ch !== "=" &&
        ch !== ">" &&
        ch !== "/" &&
        ch !== " " &&
        ch !== "\t" &&
        ch !== "\n" &&
        ch !== "\r",
    );

    let namespace: string | undefined;
    if (this.mode === "xml" && name.includes(":")) {
      const colonIndex = name.indexOf(":");
      namespace = name.slice(0, colonIndex);
    }

    this.skipWhitespace();

    // Check for =
    if (this.pos >= this.source.length || this.source[this.pos] !== "=") {
      // Boolean attribute (no value)
      return {
        type: "Attribute",
        name,
        namespace,
        value: null,
        quote: null,
        loc: locationFromOffsets(this.source, start, this.pos),
      };
    }

    this.pos++; // skip =
    this.skipWhitespace();

    // Value
    let value: string;
    let quote: "'" | '"' | null = null;

    if (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === '"' || ch === "'") {
        quote = ch as "'" | '"';
        this.pos++; // skip opening quote
        const valueStart = this.pos;
        while (this.pos < this.source.length && this.source[this.pos] !== ch) {
          this.pos++;
        }
        value = this.source.slice(valueStart, this.pos);
        if (this.pos < this.source.length) {
          this.pos++; // skip closing quote
        }
      } else {
        // Unquoted attribute value (HTML mode only)
        value = this.readWhile(
          (c) =>
            c !== " " &&
            c !== "\t" &&
            c !== "\n" &&
            c !== "\r" &&
            c !== ">" &&
            c !== "/" &&
            c !== '"' &&
            c !== "'" &&
            c !== "=",
        );
      }
    } else {
      value = "";
    }

    return {
      type: "Attribute",
      name,
      namespace,
      value,
      quote,
      loc: locationFromOffsets(this.source, start, this.pos),
    };
  }

  // --------------------------------------------------------
  // Text
  // --------------------------------------------------------

  private parseText(stopChar: string): Text {
    const start = this.pos;
    while (
      this.pos < this.source.length &&
      this.source[this.pos] !== stopChar
    ) {
      this.pos++;
    }
    return {
      type: "Text",
      value: this.source.slice(start, this.pos),
      loc: locationFromOffsets(this.source, start, this.pos),
    };
  }

  // --------------------------------------------------------
  // Utilities
  // --------------------------------------------------------

  private readTagName(): string {
    return this.readWhile(
      (ch) =>
        ch !== " " &&
        ch !== "\t" &&
        ch !== "\n" &&
        ch !== "\r" &&
        ch !== ">" &&
        ch !== "/" &&
        ch !== "=",
    );
  }

  private readWhile(pred: (ch: string) => boolean): string {
    const start = this.pos;
    while (this.pos < this.source.length && pred(this.source[this.pos])) {
      this.pos++;
    }
    return this.source.slice(start, this.pos);
  }

  private readQuotedString(): string {
    if (this.pos >= this.source.length) {
      return "";
    }
    const quote = this.source[this.pos];
    if (quote !== '"' && quote !== "'") {
      return "";
    }
    this.pos++; // skip opening quote
    const start = this.pos;
    while (this.pos < this.source.length && this.source[this.pos] !== quote) {
      this.pos++;
    }
    const value = this.source.slice(start, this.pos);
    if (this.pos < this.source.length) {
      this.pos++; // skip closing quote
    }
    return value;
  }

  private skipWhitespace(): void {
    while (this.pos < this.source.length) {
      const ch = this.source[this.pos];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
        this.pos++;
      } else {
        break;
      }
    }
  }

  private skipPastChar(ch: string): void {
    while (this.pos < this.source.length && this.source[this.pos] !== ch) {
      this.pos++;
    }
    if (this.pos < this.source.length) {
      this.pos++;
    }
  }

  private startsWith(str: string): boolean {
    return this.source.startsWith(str, this.pos);
  }

  private startsWithCaseInsensitive(str: string): boolean {
    if (this.pos + str.length > this.source.length) {
      return false;
    }
    const slice = this.source.slice(this.pos, this.pos + str.length);
    return slice.toLowerCase() === str.toLowerCase();
  }

  private addError(message: string): void {
    this.errors.push({
      message,
      loc: positionFromOffset(this.source, this.pos),
    });
  }
}
