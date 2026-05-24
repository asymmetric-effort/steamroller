/**
 * Expression parsing module for the Steamroller parser.
 *
 * Handles primary/literal expressions including identifiers, literals,
 * this, arrays, objects, template literals, and parenthesized expressions.
 * Also provides assignment, sequence, binary, unary, update, and
 * conditional expression parsing via Pratt parsing (issue #29).
 *
 * Function/arrow/class expressions will be implemented by issue #27.
 * Member/call expressions are handled by the member-call module.
 *
 * @module parser/expressions
 */

import type * as AST from "../ast/types.js";
import type { Lexer } from "./lexer.js";
import { TokenType } from "./token-types.js";
import { tokenTypeName } from "./token-types.js";
import {
  parseBinaryExpression,
  parseUnaryExpression,
  parseConditionalExpression,
  parseAssignment,
  setPrimaryExpressionParser,
} from "./operators.js";
import {
  parseMemberCallExpression,
  parseNewExpression,
  parseSuperExpression,
} from "./member-call.js";

/**
 * Parse a full expression, handling sequence expressions (comma-separated).
 *
 * @param lexer - The lexer instance to consume tokens from.
 * @param allowIn - Whether the `in` operator is permitted. Defaults to true.
 * @returns The parsed Expression AST node.
 */
export const parseExpression = (
  lexer: Lexer,
  allowIn: boolean = true,
): AST.Expression => {
  const expr = parseAssignmentExpression(lexer, allowIn);

  // Check for sequence expression (comma-separated)
  if (!lexer.is(TokenType.Comma)) {
    return expr;
  }

  const expressions: Array<AST.Expression> = [expr];
  const start = expr.start;

  while (lexer.is(TokenType.Comma)) {
    lexer.next();
    const next = parseAssignmentExpression(lexer, allowIn);
    expressions.push(next);
  }

  const end = expressions[expressions.length - 1].end;

  return Object.freeze({
    type: "SequenceExpression" as const,
    start,
    end,
    expressions: Object.freeze(expressions),
  });
};

/**
 * Parse an assignment expression with full operator support.
 *
 * Pipeline: unary -> binary (Pratt) -> conditional -> assignment check.
 * If `allowIn` is false (for-loop init), the `in` operator is excluded
 * from binary precedence.
 *
 * @param lexer - The lexer instance.
 * @param allowIn - Whether the `in` operator is permitted. Defaults to true.
 * @returns The parsed Expression AST node.
 */
export const parseAssignmentExpression = (
  lexer: Lexer,
  allowIn: boolean = true,
): AST.Expression => {
  // Parse unary (prefix operators + primary with member/call + postfix)
  const unary = parseUnaryExpression(lexer, () =>
    parseLeftHandSideExpression(lexer),
  );

  // Parse binary/logical with Pratt precedence
  const binary = parseBinaryExpression(lexer, unary, 1, allowIn);

  // Parse conditional (ternary)
  const conditional = parseConditionalExpression(lexer, binary, () =>
    parseAssignmentExpression(lexer, allowIn),
  );

  // Check for assignment
  const assignment = parseAssignment(lexer, conditional, () =>
    parseAssignmentExpression(lexer, allowIn),
  );

  if (assignment !== null) {
    return assignment;
  }

  return conditional;
};

/**
 * Parse a primary expression (literals, identifiers, this, arrays,
 * objects, templates, parenthesized expressions).
 *
 * @param lexer - The lexer instance.
 * @returns The parsed Expression AST node.
 * @throws {SyntaxError} For unexpected tokens.
 */
export const parsePrimaryExpression = (lexer: Lexer): AST.Expression => {
  const token = lexer.token;

  switch (token.type) {
    case TokenType.NumericLiteral:
      return parseNumericLiteral(lexer);

    case TokenType.StringLiteral:
      return parseStringLiteral(lexer);

    case TokenType.True:
    case TokenType.False:
      return parseBooleanLiteral(lexer);

    case TokenType.Null:
      return parseNullLiteral(lexer);

    case TokenType.RegExpLiteral:
      return parseRegExpLiteral(lexer);

    case TokenType.BigIntLiteral:
      return parseBigIntLiteral(lexer);

    case TokenType.Identifier:
      return parseIdentifier(lexer);

    case TokenType.This:
      return parseThisExpression(lexer);

    case TokenType.LeftBracket:
      return parseArrayExpression(lexer);

    case TokenType.LeftBrace:
      return parseObjectExpression(lexer);

    case TokenType.TemplateLiteral:
    case TokenType.TemplateNoSub:
      return parseTemplateLiteral(lexer);

    case TokenType.TemplateHead:
      return parseTemplateLiteral(lexer);

    case TokenType.LeftParen:
      return parseParenthesizedExpression(lexer);

    case TokenType.Function:
      return parseFunctionExpressionStub(lexer);

    case TokenType.Class:
      return parseClassExpressionStub(lexer);

    default: {
      const name = tokenTypeName(token.type);
      throw new SyntaxError(
        `Unexpected token ${name} at position ${token.start}`,
      );
    }
  }
};

/**
 * Parse a left-hand side expression.
 *
 * Handles new expressions, super, and extends primary expressions
 * with member access, call expressions, and optional chaining.
 *
 * @param lexer - The lexer instance.
 * @returns The parsed Expression AST node.
 */
const parseLeftHandSideExpression = (lexer: Lexer): AST.Expression => {
  // Handle 'new' expression
  if (lexer.is(TokenType.New)) {
    const newExpr = parseNewExpression(
      lexer,
      () => parsePrimaryExpression(lexer),
      () => parseAssignmentExpression(lexer),
    );
    // After new, continue with member/call chain
    return parseMemberCallExpression(lexer, newExpr, () =>
      parseAssignmentExpression(lexer),
    );
  }

  // Handle 'super' expression
  if (lexer.is(TokenType.Super)) {
    const superExpr = parseSuperExpression(lexer, () =>
      parseAssignmentExpression(lexer),
    );
    // After super.prop or super(), continue with member/call chain
    return parseMemberCallExpression(lexer, superExpr, () =>
      parseAssignmentExpression(lexer),
    );
  }

  // Handle 'import' for import() and import.meta
  if (lexer.is(TokenType.Import)) {
    const saved = lexer.saveState();
    const importStart = lexer.token.start;
    lexer.next();

    // import.meta
    if (lexer.is(TokenType.Dot)) {
      lexer.next();
      if (
        lexer.is(TokenType.Identifier) &&
        (lexer.token.value as string) === "meta"
      ) {
        const metaToken = lexer.next();
        const metaProp: AST.MetaProperty = Object.freeze({
          type: "MetaProperty" as const,
          start: importStart,
          end: metaToken.end,
          meta: Object.freeze({
            type: "Identifier" as const,
            start: importStart,
            end: importStart + 6,
            name: "import",
          }),
          property: Object.freeze({
            type: "Identifier" as const,
            start: metaToken.start,
            end: metaToken.end,
            name: "meta",
          }),
        });
        return parseMemberCallExpression(lexer, metaProp, () =>
          parseAssignmentExpression(lexer),
        );
      }
      // Not import.meta, restore
      lexer.restoreState(saved);
    }

    // import() dynamic import
    if (lexer.is(TokenType.LeftParen)) {
      lexer.next();
      const source = parseAssignmentExpression(lexer);
      const closeParen = lexer.expect(TokenType.RightParen);
      const importExpr: AST.ImportExpression = Object.freeze({
        type: "ImportExpression" as const,
        start: importStart,
        end: closeParen.end,
        source,
      });
      return parseMemberCallExpression(lexer, importExpr, () =>
        parseAssignmentExpression(lexer),
      );
    }

    // Not import() or import.meta, restore for statement-level import
    lexer.restoreState(saved);
  }

  // Parse primary expression and extend with member/call
  const primary = parsePrimaryExpression(lexer);
  return parseMemberCallExpression(lexer, primary, () =>
    parseAssignmentExpression(lexer),
  );
};

/**
 * Parse a numeric literal.
 *
 * @param lexer - The lexer instance.
 * @returns A Literal AST node.
 */
const parseNumericLiteral = (lexer: Lexer): AST.Literal => {
  const token = lexer.next();
  return Object.freeze({
    type: "Literal" as const,
    start: token.start,
    end: token.end,
    value: token.value as number,
    raw: token.raw,
  });
};

/**
 * Parse a string literal.
 *
 * @param lexer - The lexer instance.
 * @returns A Literal AST node.
 */
const parseStringLiteral = (lexer: Lexer): AST.Literal => {
  const token = lexer.next();
  return Object.freeze({
    type: "Literal" as const,
    start: token.start,
    end: token.end,
    value: token.value as string,
    raw: token.raw,
  });
};

/**
 * Parse a boolean literal (true or false).
 *
 * @param lexer - The lexer instance.
 * @returns A Literal AST node.
 */
const parseBooleanLiteral = (lexer: Lexer): AST.Literal => {
  const token = lexer.next();
  return Object.freeze({
    type: "Literal" as const,
    start: token.start,
    end: token.end,
    value: token.value as boolean,
    raw: token.raw,
  });
};

/**
 * Parse a null literal.
 *
 * @param lexer - The lexer instance.
 * @returns A Literal AST node.
 */
const parseNullLiteral = (lexer: Lexer): AST.Literal => {
  const token = lexer.next();
  return Object.freeze({
    type: "Literal" as const,
    start: token.start,
    end: token.end,
    value: null,
    raw: token.raw,
  });
};

/**
 * Parse a regular expression literal.
 *
 * @param lexer - The lexer instance.
 * @returns A Literal AST node with regex property.
 */
const parseRegExpLiteral = (lexer: Lexer): AST.Literal => {
  const token = lexer.next();
  const raw = token.raw;

  // Extract pattern and flags from raw: /pattern/flags
  const lastSlash = raw.lastIndexOf("/");
  const pattern = raw.slice(1, lastSlash);
  const flags = raw.slice(lastSlash + 1);

  return Object.freeze({
    type: "Literal" as const,
    start: token.start,
    end: token.end,
    value: token.value as RegExp,
    raw,
    regex: Object.freeze({ pattern, flags }),
  });
};

/**
 * Parse a BigInt literal.
 *
 * @param lexer - The lexer instance.
 * @returns A Literal AST node with bigint property.
 */
const parseBigIntLiteral = (lexer: Lexer): AST.Literal => {
  const token = lexer.next();
  const raw = token.raw;
  // BigInt raw ends with 'n', the bigint string is the raw without 'n'
  const bigintStr = raw.slice(0, raw.length - 1);

  return Object.freeze({
    type: "Literal" as const,
    start: token.start,
    end: token.end,
    value: token.value as bigint,
    raw,
    bigint: bigintStr,
  });
};

/**
 * Parse an identifier reference.
 *
 * @param lexer - The lexer instance.
 * @returns An Identifier AST node.
 */
const parseIdentifier = (lexer: Lexer): AST.Identifier => {
  const token = lexer.next();
  return Object.freeze({
    type: "Identifier" as const,
    start: token.start,
    end: token.end,
    name: token.value as string,
  });
};

/**
 * Parse a `this` expression.
 *
 * @param lexer - The lexer instance.
 * @returns A ThisExpression AST node.
 */
const parseThisExpression = (lexer: Lexer): AST.ThisExpression => {
  const token = lexer.next();
  return Object.freeze({
    type: "ThisExpression" as const,
    start: token.start,
    end: token.end,
  });
};

/**
 * Parse an array expression: [elem, elem, ...rest]
 * Supports holes (elision), spread elements.
 *
 * @param lexer - The lexer instance.
 * @returns An ArrayExpression AST node.
 * @throws {SyntaxError} For unterminated arrays.
 */
const parseArrayExpression = (lexer: Lexer): AST.ArrayExpression => {
  const startToken = lexer.next(); // consume [
  const start = startToken.start;
  const elements: Array<AST.Expression | AST.SpreadElement | null> = [];

  while (!lexer.is(TokenType.RightBracket)) {
    if (lexer.is(TokenType.EOF)) {
      throw new SyntaxError(
        `Unterminated array expression at position ${start}`,
      );
    }

    // Handle holes (elision): [,, a]
    if (lexer.is(TokenType.Comma)) {
      elements.push(null);
      lexer.next();
      continue;
    }

    // Handle spread element
    if (lexer.is(TokenType.Ellipsis)) {
      const spreadStart = lexer.token.start;
      lexer.next();
      const argument = parseAssignmentExpression(lexer);
      elements.push(
        Object.freeze({
          type: "SpreadElement" as const,
          start: spreadStart,
          end: argument.end,
          argument,
        }),
      );
    } else {
      const elem = parseAssignmentExpression(lexer);
      elements.push(elem);
    }

    // Consume trailing comma or expect closing bracket
    if (!lexer.is(TokenType.RightBracket)) {
      if (lexer.is(TokenType.Comma)) {
        lexer.next();
      } else {
        throw new SyntaxError(
          `Expected ',' or ']' in array expression at position ${lexer.token.start}`,
        );
      }
    }
  }

  const endToken = lexer.next(); // consume ]
  const end = endToken.end;

  return Object.freeze({
    type: "ArrayExpression" as const,
    start,
    end,
    elements: Object.freeze(elements),
  });
};

/**
 * Parse an object expression: { key: value, ...obj }
 * Supports shorthand, computed, methods, getters, setters, spread.
 *
 * @param lexer - The lexer instance.
 * @returns An ObjectExpression AST node.
 * @throws {SyntaxError} For unterminated objects.
 */
const parseObjectExpression = (lexer: Lexer): AST.ObjectExpression => {
  const startToken = lexer.next(); // consume {
  const start = startToken.start;
  const properties: Array<AST.Property | AST.SpreadElement> = [];

  while (!lexer.is(TokenType.RightBrace)) {
    if (lexer.is(TokenType.EOF)) {
      throw new SyntaxError(
        `Unterminated object expression at position ${start}`,
      );
    }

    // Spread property
    if (lexer.is(TokenType.Ellipsis)) {
      const spreadStart = lexer.token.start;
      lexer.next();
      const argument = parseAssignmentExpression(lexer);
      properties.push(
        Object.freeze({
          type: "SpreadElement" as const,
          start: spreadStart,
          end: argument.end,
          argument,
        }),
      );
    } else {
      const prop = parseObjectProperty(lexer);
      properties.push(prop);
    }

    // Consume trailing comma or expect closing brace
    if (!lexer.is(TokenType.RightBrace)) {
      if (lexer.is(TokenType.Comma)) {
        lexer.next();
      } else {
        throw new SyntaxError(
          `Expected ',' or '}' in object expression at position ${lexer.token.start}`,
        );
      }
    }
  }

  const endToken = lexer.next(); // consume }
  const end = endToken.end;

  return Object.freeze({
    type: "ObjectExpression" as const,
    start,
    end,
    properties: Object.freeze(properties),
  });
};

/**
 * Parse a single object property.
 * Handles: key: value, shorthand, computed, method, get/set.
 *
 * @param lexer - The lexer instance.
 * @returns A Property AST node.
 */
const parseObjectProperty = (lexer: Lexer): AST.Property => {
  const propStart = lexer.token.start;

  // Check for getter/setter: get name() {} or set name(v) {}
  if (
    (lexer.is(TokenType.Get) || lexer.is(TokenType.Set)) &&
    !isFollowedByColon(lexer)
  ) {
    const kindToken = lexer.next();
    const kind = kindToken.value as string as "get" | "set";

    // Check if this is actually a shorthand property named "get"/"set"
    // If followed by comma, closing brace, or colon -> shorthand or regular property
    if (lexer.is(TokenType.Comma) || lexer.is(TokenType.RightBrace)) {
      // Shorthand: { get } or { set }
      const key: AST.Identifier = Object.freeze({
        type: "Identifier" as const,
        start: kindToken.start,
        end: kindToken.end,
        name: kind,
      });
      return Object.freeze({
        type: "Property" as const,
        start: propStart,
        end: kindToken.end,
        key,
        value: key,
        kind: "init" as const,
        method: false,
        shorthand: true,
        computed: false,
      });
    }

    // It's a getter/setter method
    const { key, computed } = parsePropertyKey(lexer);
    // Parse method value stub (empty block)
    lexer.expect(TokenType.LeftParen);
    // Skip params for now (stub)
    while (!lexer.is(TokenType.RightParen) && !lexer.is(TokenType.EOF)) {
      lexer.next();
    }
    lexer.expect(TokenType.RightParen);
    const bodyStart = lexer.token.start;
    lexer.expect(TokenType.LeftBrace);
    // Skip body
    let braceDepth = 1;
    while (braceDepth > 0 && !lexer.is(TokenType.EOF)) {
      if (lexer.is(TokenType.LeftBrace)) {
        braceDepth++;
      } else if (lexer.is(TokenType.RightBrace)) {
        braceDepth--;
        if (braceDepth === 0) {
          break;
        }
      }
      lexer.next();
    }
    const bodyEndToken = lexer.next(); // consume final }
    const bodyEnd = bodyEndToken.end;

    const body: AST.BlockStatement = Object.freeze({
      type: "BlockStatement" as const,
      start: bodyStart,
      end: bodyEnd,
      body: Object.freeze([]) as ReadonlyArray<AST.Statement>,
    });

    const value: AST.FunctionExpression = Object.freeze({
      type: "FunctionExpression" as const,
      start: bodyStart,
      end: bodyEnd,
      id: null,
      params: Object.freeze([]) as ReadonlyArray<AST.Pattern>,
      body,
      generator: false,
      async: false,
    });

    return Object.freeze({
      type: "Property" as const,
      start: propStart,
      end: bodyEnd,
      key,
      value,
      kind,
      method: false,
      shorthand: false,
      computed,
    });
  }

  // Computed property: [expr]: value
  const { key, computed } = parsePropertyKey(lexer);

  // Method shorthand: name() {}
  if (lexer.is(TokenType.LeftParen)) {
    const methodStart = lexer.token.start;
    lexer.next(); // consume (
    // Skip params (stub)
    while (!lexer.is(TokenType.RightParen) && !lexer.is(TokenType.EOF)) {
      lexer.next();
    }
    lexer.expect(TokenType.RightParen);
    const bodyStart = lexer.token.start;
    lexer.expect(TokenType.LeftBrace);
    let braceDepth = 1;
    while (braceDepth > 0 && !lexer.is(TokenType.EOF)) {
      if (lexer.is(TokenType.LeftBrace)) {
        braceDepth++;
      } else if (lexer.is(TokenType.RightBrace)) {
        braceDepth--;
        if (braceDepth === 0) {
          break;
        }
      }
      lexer.next();
    }
    const bodyEndToken = lexer.next(); // consume final }
    const bodyEnd = bodyEndToken.end;

    const body: AST.BlockStatement = Object.freeze({
      type: "BlockStatement" as const,
      start: bodyStart,
      end: bodyEnd,
      body: Object.freeze([]) as ReadonlyArray<AST.Statement>,
    });

    const value: AST.FunctionExpression = Object.freeze({
      type: "FunctionExpression" as const,
      start: methodStart,
      end: bodyEnd,
      id: null,
      params: Object.freeze([]) as ReadonlyArray<AST.Pattern>,
      body,
      generator: false,
      async: false,
    });

    return Object.freeze({
      type: "Property" as const,
      start: propStart,
      end: bodyEnd,
      key,
      value,
      kind: "init" as const,
      method: true,
      shorthand: false,
      computed,
    });
  }

  // Regular property: key: value
  if (lexer.is(TokenType.Colon)) {
    lexer.next(); // consume :
    const value = parseAssignmentExpression(lexer);
    return Object.freeze({
      type: "Property" as const,
      start: propStart,
      end: value.end,
      key,
      value,
      kind: "init" as const,
      method: false,
      shorthand: false,
      computed,
    });
  }

  // Shorthand property: { name }
  // key must be an Identifier
  return Object.freeze({
    type: "Property" as const,
    start: propStart,
    end: key.end,
    key,
    value: key,
    kind: "init" as const,
    method: false,
    shorthand: true,
    computed: false,
  });
};

/**
 * Check if the current get/set token is followed by a colon
 * (meaning it's a property key, not a getter/setter keyword).
 *
 * Uses lexer save/restore for lookahead.
 *
 * @param lexer - The lexer instance.
 * @returns True if next non-trivial token after current is a colon.
 */
const isFollowedByColon = (lexer: Lexer): boolean => {
  const state = lexer.saveState();
  lexer.next(); // consume the get/set token
  const result = lexer.is(TokenType.Colon);
  lexer.restoreState(state);
  return result;
};

/**
 * Parse a property key (identifier, string, number, or computed [expr]).
 *
 * @param lexer - The lexer instance.
 * @returns The key Expression and whether it was computed.
 */
const parsePropertyKey = (
  lexer: Lexer,
): { readonly key: AST.Expression; readonly computed: boolean } => {
  // Computed property key: [expr]
  if (lexer.is(TokenType.LeftBracket)) {
    lexer.next(); // consume [
    const key = parseAssignmentExpression(lexer);
    if (lexer.is(TokenType.EOF)) {
      throw new SyntaxError(
        `Unterminated computed property key at position ${key.start}`,
      );
    }
    lexer.expect(TokenType.RightBracket);
    return { key, computed: true };
  }

  // String literal key
  if (lexer.is(TokenType.StringLiteral)) {
    const token = lexer.next();
    const key: AST.Literal = Object.freeze({
      type: "Literal" as const,
      start: token.start,
      end: token.end,
      value: token.value as string,
      raw: token.raw,
    });
    return { key, computed: false };
  }

  // Numeric literal key
  if (lexer.is(TokenType.NumericLiteral)) {
    const token = lexer.next();
    const key: AST.Literal = Object.freeze({
      type: "Literal" as const,
      start: token.start,
      end: token.end,
      value: token.value as number,
      raw: token.raw,
    });
    return { key, computed: false };
  }

  // Identifier key (includes contextual keywords used as property names)
  const token = lexer.next();
  const key: AST.Identifier = Object.freeze({
    type: "Identifier" as const,
    start: token.start,
    end: token.end,
    name: token.value as string,
  });
  return { key, computed: false };
};

/**
 * Parse a template literal (no-substitution or with expressions).
 *
 * Handles:
 * - TemplateNoSub: `text` (no expressions)
 * - TemplateHead + TemplateMiddle* + TemplateTail (with expressions)
 *
 * @param lexer - The lexer instance.
 * @returns A TemplateLiteral AST node.
 */
const parseTemplateLiteral = (lexer: Lexer): AST.TemplateLiteral => {
  const start = lexer.token.start;
  const quasis: Array<AST.TemplateElement> = [];
  const expressions: Array<AST.Expression> = [];

  if (
    lexer.is(TokenType.TemplateLiteral) ||
    lexer.is(TokenType.TemplateNoSub)
  ) {
    // No-substitution template: `text`
    const token = lexer.next();
    // raw is the full backtick-quoted string, extract inner text
    const raw = token.raw;
    const innerRaw = raw.slice(1, raw.length - 1); // remove backticks
    const cooked = token.value as string;

    const element: AST.TemplateElement = Object.freeze({
      type: "TemplateElement" as const,
      start: token.start,
      end: token.end,
      tail: true,
      value: Object.freeze({ raw: innerRaw, cooked }),
    });
    quasis.push(element);

    return Object.freeze({
      type: "TemplateLiteral" as const,
      start,
      end: token.end,
      quasis: Object.freeze(quasis),
      expressions: Object.freeze(expressions),
    });
  }

  // Template with substitutions: `head${expr}middle${expr}tail`
  // First token is TemplateHead
  const headToken = lexer.next();
  const headRaw = headToken.raw;
  // TemplateHead raw is like `text${  - extract text between ` and ${
  const headInner = headRaw.slice(1, headRaw.length - 2); // remove ` and ${
  const headCooked = headToken.value as string;

  quasis.push(
    Object.freeze({
      type: "TemplateElement" as const,
      start: headToken.start,
      end: headToken.end,
      tail: false,
      value: Object.freeze({ raw: headInner, cooked: headCooked }),
    }),
  );

  // Parse expression, then TemplateMiddle or TemplateTail
  while (true) {
    const expr = parseExpression(lexer);
    expressions.push(expr);

    // The lexer should now produce a TemplateMiddle or TemplateTail
    const templateToken = lexer.token;

    if (lexer.is(TokenType.TemplateTail)) {
      const tailToken = lexer.next();
      const tailRaw = tailToken.raw;
      // TemplateTail raw is like }text` - extract between } and `
      const tailInner = tailRaw.slice(1, tailRaw.length - 1);
      const tailCooked = tailToken.value as string;

      quasis.push(
        Object.freeze({
          type: "TemplateElement" as const,
          start: tailToken.start,
          end: tailToken.end,
          tail: true,
          value: Object.freeze({ raw: tailInner, cooked: tailCooked }),
        }),
      );
      break;
    } else if (lexer.is(TokenType.TemplateMiddle)) {
      const midToken = lexer.next();
      const midRaw = midToken.raw;
      // TemplateMiddle raw is like }text${ - extract between } and ${
      const midInner = midRaw.slice(1, midRaw.length - 2);
      const midCooked = midToken.value as string;

      quasis.push(
        Object.freeze({
          type: "TemplateElement" as const,
          start: midToken.start,
          end: midToken.end,
          tail: false,
          value: Object.freeze({ raw: midInner, cooked: midCooked }),
        }),
      );
    } else {
      throw new SyntaxError(
        `Expected template continuation at position ${templateToken.start}`,
      );
    }
  }

  const end = quasis[quasis.length - 1].end;

  return Object.freeze({
    type: "TemplateLiteral" as const,
    start,
    end,
    quasis: Object.freeze(quasis),
    expressions: Object.freeze(expressions),
  });
};

/**
 * Parse a tagged template expression: tag`template`
 * Called when an identifier or expression is followed by a template.
 *
 * @param lexer - The lexer instance.
 * @param tag - The tag expression.
 * @returns A TaggedTemplateExpression AST node.
 */
export const parseTaggedTemplate = (
  lexer: Lexer,
  tag: AST.Expression,
): AST.TaggedTemplateExpression => {
  const quasi = parseTemplateLiteral(lexer);
  return Object.freeze({
    type: "TaggedTemplateExpression" as const,
    start: tag.start,
    end: quasi.end,
    tag,
    quasi,
  });
};

/**
 * Parse a parenthesized expression: (expr)
 * Returns the inner expression directly (no wrapper node).
 *
 * @param lexer - The lexer instance.
 * @returns The inner Expression AST node.
 * @throws {SyntaxError} For unterminated parenthesized expressions.
 */
const parseParenthesizedExpression = (lexer: Lexer): AST.Expression => {
  const start = lexer.token.start;
  lexer.next(); // consume (

  if (lexer.is(TokenType.RightParen)) {
    // Empty parens - could be arrow function params, error for now
    throw new SyntaxError(`Unexpected ')' at position ${lexer.token.start}`);
  }

  if (lexer.is(TokenType.EOF)) {
    throw new SyntaxError(
      `Unterminated parenthesized expression at position ${start}`,
    );
  }

  const expr = parseExpression(lexer);

  if (lexer.is(TokenType.EOF)) {
    throw new SyntaxError(
      `Unterminated parenthesized expression at position ${start}`,
    );
  }

  lexer.expect(TokenType.RightParen);
  return expr;
};

/**
 * Stub for function expression parsing.
 * Will be implemented by issue #27.
 *
 * @param lexer - The lexer instance.
 * @returns A FunctionExpression AST node (stub with empty body).
 * @throws {SyntaxError} Always — not yet implemented.
 */
const parseFunctionExpressionStub = (lexer: Lexer): AST.FunctionExpression => {
  throw new SyntaxError(
    `Function expressions not yet implemented at position ${lexer.token.start}`,
  );
};

/**
 * Stub for class expression parsing.
 * Will be implemented by issue #27.
 *
 * @param lexer - The lexer instance.
 * @returns A ClassExpression AST node (stub).
 * @throws {SyntaxError} Always — not yet implemented.
 */
const parseClassExpressionStub = (lexer: Lexer): AST.ClassExpression => {
  throw new SyntaxError(
    `Class expressions not yet implemented at position ${lexer.token.start}`,
  );
};

// Register left-hand side expression parser with the operators module to
// break the circular dependency. This includes member/call/new parsing.
setPrimaryExpressionParser(parseLeftHandSideExpression);
