/**
 * JSX parsing module for the Steamroller parser.
 *
 * Handles JSX elements, fragments, attributes, spread attributes,
 * expression containers, text content, member expressions, and
 * namespaced names.
 *
 * JSX parsing is enabled via the `jsx` option in ParseOptions.
 * When `<` is encountered in expression position and JSX is enabled,
 * this module attempts to parse a JSX element or fragment.
 *
 * @module parser/jsx
 */

import type * as AST from "../ast/types.js";
import type { Lexer } from "./lexer.js";
import { TokenType } from "./token-types.js";

/**
 * Context required for JSX parsing, providing access to the lexer
 * and the expression parser for embedded expressions.
 */
export interface JSXParserContext {
  readonly lexer: Lexer;
  readonly parseAssignmentExpression: () => AST.Expression;
}

/**
 * Check if a character code is valid for a JSX identifier start.
 * JSX identifiers allow letters, underscore, and dollar sign.
 *
 * @param code - The character code to test.
 * @returns True if valid JSX identifier start.
 */
const isJSXIdentStart = (code: number): boolean => {
  if (code === 0x24 || code === 0x5f) return true; // $ _
  if (code >= 0x41 && code <= 0x5a) return true; // A-Z
  if (code >= 0x61 && code <= 0x7a) return true; // a-z
  if (code >= 0xc0 && code !== 0xd7 && code !== 0xf7) return true;
  return false;
};

/**
 * Check if a character code is valid for JSX identifier continuation.
 * JSX identifiers additionally allow digits and hyphens.
 *
 * @param code - The character code to test.
 * @returns True if valid JSX identifier part.
 */
const isJSXIdentPart = (code: number): boolean => {
  if (isJSXIdentStart(code)) return true;
  if (code >= 0x30 && code <= 0x39) return true; // 0-9
  if (code === 0x2d) return true; // hyphen
  return false;
};

/**
 * Read a JSX identifier name directly from source.
 * JSX identifiers can contain hyphens unlike JS identifiers.
 *
 * @param source - The full source string.
 * @param startPos - The position to begin reading from.
 * @returns The identifier name and end position.
 */
const readJSXIdentifier = (
  source: string,
  startPos: number,
): { readonly name: string; readonly endPos: number } => {
  let pos = startPos;
  if (pos >= source.length || !isJSXIdentStart(source.charCodeAt(pos))) {
    return { name: "", endPos: pos };
  }
  pos++;
  while (pos < source.length && isJSXIdentPart(source.charCodeAt(pos))) {
    pos++;
  }
  return { name: source.slice(startPos, pos), endPos: pos };
};

/**
 * Parse a JSX element or fragment starting at `<`.
 *
 * Determines whether this is a fragment (`<>`) or named element (`<Tag`),
 * then delegates to the appropriate parser.
 *
 * @param ctx - The JSX parser context.
 * @returns The parsed JSXElement or JSXFragment.
 */
export const parseJSXElementOrFragment = (
  ctx: JSXParserContext,
): AST.JSXElement | AST.JSXFragment => {
  const lexer = ctx.lexer;
  const source = lexer.source;
  const start = lexer.token.start;

  // Consume the `<` token
  lexer.next();

  // Check for fragment: <>
  if (lexer.is(TokenType.GreaterThan)) {
    return parseJSXFragment(ctx, start);
  }

  // Parse element
  return parseJSXElement(ctx, start);
};

/**
 * Parse a JSX fragment: <>children</>
 *
 * Current token should be `>` (the closing of `<>`).
 *
 * @param ctx - The JSX parser context.
 * @param start - The start position of the opening `<`.
 * @returns The parsed JSXFragment.
 */
const parseJSXFragment = (
  ctx: JSXParserContext,
  start: number,
): AST.JSXFragment => {
  const lexer = ctx.lexer;
  const openEnd = lexer.token.end;

  const openingFragment: AST.JSXOpeningFragment = Object.freeze({
    type: "JSXOpeningFragment" as const,
    start,
    end: openEnd,
  });

  // Position right after > for children parsing
  lexer.setPosition(openEnd);

  // Parse children until we hit `</>`
  const children = parseJSXChildren(ctx);

  // Parse closing fragment `</>`
  // We must handle `</` as raw source to avoid regex disambiguation issues
  const closeStart = lexer.token.start;
  const source = lexer.source;
  if (
    source.charCodeAt(closeStart) !== 0x3c ||
    source.charCodeAt(closeStart + 1) !== 0x2f
  ) {
    throw new SyntaxError(`Expected '</>' at position ${closeStart}`);
  }
  // Skip past `</`
  let closePos = closeStart + 2;
  // Expect `>`
  if (source.charCodeAt(closePos) !== 0x3e) {
    throw new SyntaxError(
      `Expected '>' in closing fragment at position ${closePos}`,
    );
  }
  closePos++;
  const closeEnd = closePos;
  lexer.setPosition(closePos);

  const closingFragment: AST.JSXClosingFragment = Object.freeze({
    type: "JSXClosingFragment" as const,
    start: closeStart,
    end: closeEnd,
  });

  return Object.freeze({
    type: "JSXFragment" as const,
    start,
    end: closeEnd,
    openingFragment,
    closingFragment,
    children: Object.freeze(children),
  });
};

/**
 * Parse a JSX element: <Tag attrs>children</Tag> or <Tag attrs />
 *
 * The `<` has already been consumed. Parses the element name, attributes,
 * determines if self-closing, and if not, parses children and closing tag.
 *
 * @param ctx - The JSX parser context.
 * @param start - The start position of the opening `<`.
 * @returns The parsed JSXElement.
 */
const parseJSXElement = (
  ctx: JSXParserContext,
  start: number,
): AST.JSXElement => {
  const lexer = ctx.lexer;
  const source = lexer.source;

  // Parse element name (identifier, member expression, or namespaced)
  const name = parseJSXElementName(ctx);

  // Parse attributes
  const attributes = parseJSXAttributes(ctx);

  // Check for self-closing: />
  const selfClosing = lexer.is(TokenType.Slash);
  if (selfClosing) {
    lexer.next(); // consume /
  }

  if (!lexer.is(TokenType.GreaterThan)) {
    throw new SyntaxError(
      `Expected '>' after JSX opening element at position ${lexer.token.start}`,
    );
  }
  const openEnd = lexer.token.end;
  // Don't call lexer.next() here - instead use setPosition to control where children start

  const openingElement: AST.JSXOpeningElement = Object.freeze({
    type: "JSXOpeningElement" as const,
    start,
    end: openEnd,
    name,
    attributes: Object.freeze(attributes),
    selfClosing,
  });

  if (selfClosing) {
    lexer.next(); // consume > for self-closing
    return Object.freeze({
      type: "JSXElement" as const,
      start,
      end: openEnd,
      openingElement,
      closingElement: null,
      children: Object.freeze([]),
    });
  }

  // For non-self-closing, position right after > for children parsing
  lexer.setPosition(openEnd);

  // Parse children
  const children = parseJSXChildren(ctx);

  // Parse closing tag: </Tag>
  // Handle `</` as raw source to avoid regex disambiguation issues
  const closeStart = lexer.token.start;
  const closeSrc = lexer.source;
  if (
    closeSrc.charCodeAt(closeStart) !== 0x3c ||
    closeSrc.charCodeAt(closeStart + 1) !== 0x2f
  ) {
    throw new SyntaxError(`Expected closing tag at position ${closeStart}`);
  }
  // Skip past `</` and rescan from there
  lexer.setPosition(closeStart + 2);

  const closingName = parseJSXElementName(ctx);
  const closeEnd = lexer.token.end;

  if (!lexer.is(TokenType.GreaterThan)) {
    throw new SyntaxError(
      `Expected '>' after JSX closing element at position ${lexer.token.start}`,
    );
  }
  lexer.next(); // consume >

  // Validate matching tags
  const openName = jsxNameToString(name);
  const closeName = jsxNameToString(closingName);
  if (openName !== closeName) {
    throw new SyntaxError(
      `JSX element tag mismatch: opening <${openName}> but closing </${closeName}> at position ${closeStart}`,
    );
  }

  const closingElement: AST.JSXClosingElement = Object.freeze({
    type: "JSXClosingElement" as const,
    start: closeStart,
    end: closeEnd,
    name: closingName,
  });

  return Object.freeze({
    type: "JSXElement" as const,
    start,
    end: closeEnd,
    openingElement,
    closingElement,
    children: Object.freeze(children),
  });
};

/**
 * Convert a JSX name node to a string for tag matching.
 *
 * @param name - The JSX name node.
 * @returns The string representation.
 */
const jsxNameToString = (
  name: AST.JSXIdentifier | AST.JSXMemberExpression | AST.JSXNamespacedName,
): string => {
  if (name.type === "JSXIdentifier") {
    return name.name;
  }
  if (name.type === "JSXNamespacedName") {
    return `${name.namespace.name}:${name.name.name}`;
  }
  // JSXMemberExpression
  const parts: Array<string> = [];
  let current: AST.JSXIdentifier | AST.JSXMemberExpression = name;
  // Iteratively collect parts from right to left
  const stack: Array<string> = [];
  while (current.type === "JSXMemberExpression") {
    stack.push(current.property.name);
    current = current.object;
  }
  stack.push(current.name);
  stack.reverse();
  return stack.join(".");
};

/**
 * Parse a JSX element name: identifier, member expression, or namespaced name.
 *
 * @param ctx - The JSX parser context.
 * @returns The parsed name node.
 */
const parseJSXElementName = (
  ctx: JSXParserContext,
): AST.JSXIdentifier | AST.JSXMemberExpression | AST.JSXNamespacedName => {
  const lexer = ctx.lexer;
  const source = lexer.source;
  const startPos = lexer.token.start;

  // Read initial identifier using raw source scanning
  const { name, endPos } = readJSXIdentifier(source, startPos);
  if (name === "") {
    throw new SyntaxError(`Expected JSX identifier at position ${startPos}`);
  }

  // Advance lexer past the identifier
  lexer.setPosition(endPos);

  let result:
    AST.JSXIdentifier | AST.JSXMemberExpression | AST.JSXNamespacedName =
    Object.freeze({
      type: "JSXIdentifier" as const,
      start: startPos,
      end: endPos,
      name,
    });

  // Check for namespaced name: ns:tag
  if (lexer.is(TokenType.Colon)) {
    const nsIdent = result as AST.JSXIdentifier;
    lexer.next(); // consume :
    const nameStart = lexer.token.start;
    const sub = readJSXIdentifier(source, nameStart);
    if (sub.name === "") {
      throw new SyntaxError(
        `Expected JSX identifier after ':' at position ${nameStart}`,
      );
    }
    lexer.setPosition(sub.endPos);
    const nameIdent: AST.JSXIdentifier = Object.freeze({
      type: "JSXIdentifier" as const,
      start: nameStart,
      end: sub.endPos,
      name: sub.name,
    });
    return Object.freeze({
      type: "JSXNamespacedName" as const,
      start: startPos,
      end: sub.endPos,
      namespace: nsIdent,
      name: nameIdent,
    });
  }

  // Check for member expression: Obj.Prop.Sub
  while (lexer.is(TokenType.Dot)) {
    lexer.next(); // consume .
    const propStart = lexer.token.start;
    const prop = readJSXIdentifier(source, propStart);
    if (prop.name === "") {
      throw new SyntaxError(
        `Expected JSX identifier after '.' at position ${propStart}`,
      );
    }
    lexer.setPosition(prop.endPos);
    const propIdent: AST.JSXIdentifier = Object.freeze({
      type: "JSXIdentifier" as const,
      start: propStart,
      end: prop.endPos,
      name: prop.name,
    });
    result = Object.freeze({
      type: "JSXMemberExpression" as const,
      start: startPos,
      end: prop.endPos,
      object: result as AST.JSXIdentifier | AST.JSXMemberExpression,
      property: propIdent,
    });
  }

  return result;
};

/**
 * Parse JSX attributes until `>` or `/` is encountered.
 *
 * @param ctx - The JSX parser context.
 * @returns Array of parsed attributes.
 */
const parseJSXAttributes = (
  ctx: JSXParserContext,
): Array<AST.JSXAttribute | AST.JSXSpreadAttribute> => {
  const lexer = ctx.lexer;
  const source = lexer.source;
  const attrs: Array<AST.JSXAttribute | AST.JSXSpreadAttribute> = [];

  while (
    !lexer.is(TokenType.GreaterThan) &&
    !lexer.is(TokenType.Slash) &&
    !lexer.is(TokenType.EOF)
  ) {
    // Spread attribute: {...expr}
    if (lexer.is(TokenType.LeftBrace)) {
      const spreadStart = lexer.token.start;
      lexer.next(); // consume {
      if (!lexer.is(TokenType.Ellipsis)) {
        throw new SyntaxError(
          `Expected '...' in JSX spread attribute at position ${lexer.token.start}`,
        );
      }
      lexer.next(); // consume ...
      const argument = ctx.parseAssignmentExpression();
      const spreadEnd = lexer.token.end;
      if (!lexer.is(TokenType.RightBrace)) {
        throw new SyntaxError(
          `Expected '}' after JSX spread attribute at position ${lexer.token.start}`,
        );
      }
      lexer.next(); // consume }
      attrs.push(
        Object.freeze({
          type: "JSXSpreadAttribute" as const,
          start: spreadStart,
          end: spreadEnd,
          argument,
        }),
      );
      continue;
    }

    // Named attribute: name="value" or name={expr}
    const attrStart = lexer.token.start;
    const attrNameResult = readJSXIdentifier(source, attrStart);
    if (attrNameResult.name === "") {
      // Not an attribute, break out
      break;
    }
    lexer.setPosition(attrNameResult.endPos);

    let attrName: AST.JSXIdentifier | AST.JSXNamespacedName = Object.freeze({
      type: "JSXIdentifier" as const,
      start: attrStart,
      end: attrNameResult.endPos,
      name: attrNameResult.name,
    });

    // Check for namespaced attribute: ns:name
    if (lexer.is(TokenType.Colon)) {
      const nsIdent = attrName as AST.JSXIdentifier;
      lexer.next(); // consume :
      const subStart = lexer.token.start;
      const sub = readJSXIdentifier(source, subStart);
      if (sub.name === "") {
        throw new SyntaxError(
          `Expected identifier after ':' in JSX attribute at position ${subStart}`,
        );
      }
      lexer.setPosition(sub.endPos);
      const subIdent: AST.JSXIdentifier = Object.freeze({
        type: "JSXIdentifier" as const,
        start: subStart,
        end: sub.endPos,
        name: sub.name,
      });
      attrName = Object.freeze({
        type: "JSXNamespacedName" as const,
        start: attrStart,
        end: sub.endPos,
        namespace: nsIdent,
        name: subIdent,
      });
    }

    // Check for value: = "string" or ={expr}
    let value:
      | AST.Literal
      | AST.JSXExpressionContainer
      | AST.JSXElement
      | AST.JSXFragment
      | null = null;
    if (lexer.is(TokenType.Equals)) {
      lexer.next(); // consume =

      if (lexer.is(TokenType.StringLiteral)) {
        // String value
        const strToken = lexer.next();
        value = Object.freeze({
          type: "Literal" as const,
          start: strToken.start,
          end: strToken.end,
          value: strToken.value as string,
          raw: strToken.raw,
        });
      } else if (lexer.is(TokenType.LeftBrace)) {
        // Expression container value
        value = parseJSXExpressionContainer(ctx);
      } else if (lexer.is(TokenType.LessThan)) {
        // JSX element as value
        value = parseJSXElementOrFragment(ctx);
      } else {
        throw new SyntaxError(
          `Expected attribute value at position ${lexer.token.start}`,
        );
      }
    }

    const attrEnd = value !== null ? value.end : attrName.end;
    attrs.push(
      Object.freeze({
        type: "JSXAttribute" as const,
        start: attrStart,
        end: attrEnd,
        name: attrName,
        value,
      }),
    );
  }

  return attrs;
};

/**
 * Parse JSX children between opening and closing tags.
 *
 * Children can be: text, {expression}, or nested JSX elements/fragments.
 * Parsing stops when `</` is encountered.
 *
 * This function reads directly from source to handle JSX text content
 * which is not tokenizable by the normal JS lexer.
 *
 * @param ctx - The JSX parser context.
 * @returns Array of child nodes.
 */
const parseJSXChildren = (
  ctx: JSXParserContext,
): Array<
  AST.JSXElement | AST.JSXFragment | AST.JSXExpressionContainer | AST.JSXText
> => {
  const lexer = ctx.lexer;
  const source = lexer.source;
  const children: Array<
    AST.JSXElement | AST.JSXFragment | AST.JSXExpressionContainer | AST.JSXText
  > = [];

  // Use raw source position from the current token as our read cursor
  let pos = lexer.token.start;

  while (pos < source.length) {
    const ch = source.charCodeAt(pos);

    // Check for `<` - either closing tag `</` or nested element `<`
    if (ch === 0x3c) {
      // Check for closing tag: `</`
      if (pos + 1 < source.length && source.charCodeAt(pos + 1) === 0x2f) {
        // Set lexer position so the caller can see we're at `</`
        lexer.setPosition(pos);
        break;
      }
      // Nested JSX element or fragment
      lexer.setPosition(pos);
      children.push(parseJSXElementOrFragment(ctx));
      pos = lexer.token.start;
      continue;
    }

    // Expression container: {expr}
    if (ch === 0x7b) {
      lexer.setPosition(pos);
      children.push(parseJSXExpressionContainer(ctx));
      pos = lexer.token.start;
      continue;
    }

    // JSX text: everything until `<` or `{`
    const textStart = pos;
    while (pos < source.length) {
      const c = source.charCodeAt(pos);
      if (c === 0x3c || c === 0x7b) break; // < or {
      pos++;
    }

    if (pos > textStart) {
      const raw = source.slice(textStart, pos);
      children.push(
        Object.freeze({
          type: "JSXText" as const,
          start: textStart,
          end: pos,
          value: raw,
          raw,
        }),
      );
    }
  }

  // If we're at EOF, set the lexer there
  if (pos >= source.length) {
    lexer.setPosition(pos);
  }

  return children;
};

/**
 * Parse a JSX expression container: {expr} or {}
 *
 * @param ctx - The JSX parser context.
 * @returns The parsed JSXExpressionContainer.
 */
const parseJSXExpressionContainer = (
  ctx: JSXParserContext,
): AST.JSXExpressionContainer => {
  const lexer = ctx.lexer;
  const start = lexer.token.start;
  lexer.next(); // consume {

  // Check for empty expression: {}
  if (lexer.is(TokenType.RightBrace)) {
    const end = lexer.token.end;
    lexer.next(); // consume }
    const emptyExpr: AST.JSXEmptyExpression = Object.freeze({
      type: "JSXEmptyExpression" as const,
      start: start + 1,
      end: end - 1,
    });
    return Object.freeze({
      type: "JSXExpressionContainer" as const,
      start,
      end,
      expression: emptyExpr,
    });
  }

  const expression = ctx.parseAssignmentExpression();

  if (!lexer.is(TokenType.RightBrace)) {
    throw new SyntaxError(
      `Expected '}' in JSX expression container at position ${lexer.token.start}`,
    );
  }
  const end = lexer.token.end;
  lexer.next(); // consume }

  return Object.freeze({
    type: "JSXExpressionContainer" as const,
    start,
    end,
    expression,
  });
};
