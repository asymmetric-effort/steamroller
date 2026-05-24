/**
 * Function expression, arrow function, and class expression parsing.
 *
 * Handles:
 * - Function expressions (named/anonymous, async, generator)
 * - Arrow functions (concise body and block body, async)
 * - Class expressions (named/anonymous, with extends)
 * - Parameter list parsing (defaults, rest elements)
 *
 * @module parser/function-class-expr
 */

import type * as AST from "../ast/types.js";
import type { Lexer } from "./lexer.js";
import { TokenType } from "./token-types.js";

/**
 * Context interface required by function/class expression parsers.
 * Decouples from the full expression parser to avoid circular dependencies.
 */
export interface ExprContext {
  readonly lexer: Lexer;
  readonly parseAssignmentExpression: (
    lexer: Lexer,
    allowIn: boolean,
  ) => AST.Expression;
  readonly parseBlockStatementFromLexer: (lexer: Lexer) => AST.BlockStatement;
}

/**
 * Parse a function expression.
 *
 * Handles: function [name]([params]) { body }
 *          function* [name]([params]) { body }
 *
 * The 'function' keyword should already be the current token.
 *
 * @param ctx - The expression context.
 * @param isAsync - Whether this is an async function expression.
 * @returns The FunctionExpression AST node.
 */
export const parseFunctionExpression = (
  ctx: ExprContext,
  isAsync: boolean,
): AST.FunctionExpression => {
  const start = isAsync ? ctx.lexer.token.start - 6 : ctx.lexer.token.start;

  // Consume 'function' keyword
  ctx.lexer.expect(TokenType.Function);

  // Check for generator: function*
  let generator = false;
  if (ctx.lexer.is(TokenType.Star)) {
    generator = true;
    ctx.lexer.next();
  }

  // Optional name
  let id: AST.Identifier | null = null;
  if (ctx.lexer.is(TokenType.Identifier)) {
    const nameToken = ctx.lexer.next();
    id = Object.freeze({
      type: "Identifier" as const,
      name: nameToken.value as string,
      start: nameToken.start,
      end: nameToken.end,
    });
  }

  // Parse parameters
  const params = parseParams(ctx);

  // Save previous context and set async/generator flags for body parsing
  const prevAsync = ctx.lexer.inAsync;
  const prevGenerator = ctx.lexer.inGenerator;
  ctx.lexer.inAsync = isAsync;
  ctx.lexer.inGenerator = generator;

  // Parse body
  const body = ctx.parseBlockStatementFromLexer(ctx.lexer);

  // Restore previous context
  ctx.lexer.inAsync = prevAsync;
  ctx.lexer.inGenerator = prevGenerator;

  return Object.freeze({
    type: "FunctionExpression" as const,
    id,
    params: Object.freeze(params),
    body,
    generator,
    async: isAsync,
    start,
    end: body.end,
  });
};

/**
 * Parse an arrow function expression.
 *
 * Handles: (params) => expr
 *          (params) => { body }
 *          param => expr
 *          param => { body }
 *          async (params) => expr
 *          async param => expr
 *
 * The params have already been parsed and the `=>` is the current token.
 *
 * @param ctx - The expression context.
 * @param params - The parameter patterns already parsed.
 * @param isAsync - Whether this is an async arrow function.
 * @param start - The start position of the arrow function.
 * @returns The ArrowFunctionExpression AST node.
 */
export const parseArrowFunction = (
  ctx: ExprContext,
  params: ReadonlyArray<AST.Pattern>,
  isAsync: boolean,
  start: number,
): AST.ArrowFunctionExpression => {
  // Consume '=>'
  ctx.lexer.expect(TokenType.Arrow);

  // Save previous context and set async flag for body parsing
  const prevAsync = ctx.lexer.inAsync;
  const prevGenerator = ctx.lexer.inGenerator;
  ctx.lexer.inAsync = isAsync;
  ctx.lexer.inGenerator = false;

  // Determine body type: block or expression
  if (ctx.lexer.is(TokenType.LeftBrace)) {
    // Block body: () => { ... }
    const body = ctx.parseBlockStatementFromLexer(ctx.lexer);

    // Restore previous context
    ctx.lexer.inAsync = prevAsync;
    ctx.lexer.inGenerator = prevGenerator;

    return Object.freeze({
      type: "ArrowFunctionExpression" as const,
      id: null,
      params,
      body,
      expression: false,
      generator: false as const,
      async: isAsync,
      start,
      end: body.end,
    });
  }

  // Concise body: () => expr
  const body = ctx.parseAssignmentExpression(ctx.lexer, true);

  // Restore previous context
  ctx.lexer.inAsync = prevAsync;
  ctx.lexer.inGenerator = prevGenerator;

  return Object.freeze({
    type: "ArrowFunctionExpression" as const,
    id: null,
    params,
    body,
    expression: true,
    generator: false as const,
    async: isAsync,
    start,
    end: body.end,
  });
};

/**
 * Check whether the current position looks like arrow function parameters
 * followed by `=>`. Uses lexer save/restore for lookahead.
 *
 * Handles two cases:
 * 1. Single identifier followed by `=>`
 * 2. `(...)` followed by `=>`
 *
 * @param lexer - The lexer instance.
 * @returns True if this appears to be an arrow function.
 */
export const isArrowAfterParen = (lexer: Lexer): boolean => {
  // We've already consumed '('. We need to find the matching ')' and check for '=>'.
  const saved = lexer.saveState();
  let depth = 1;

  while (depth > 0 && !lexer.is(TokenType.EOF)) {
    if (lexer.is(TokenType.LeftParen)) {
      depth++;
    } else if (lexer.is(TokenType.RightParen)) {
      depth--;
      if (depth === 0) {
        break;
      }
    }
    lexer.next();
  }

  if (lexer.is(TokenType.EOF)) {
    lexer.restoreState(saved);
    return false;
  }

  // Consume the closing ')'
  lexer.next();

  // Check if next is '=>'
  const isArrow = lexer.is(TokenType.Arrow);
  lexer.restoreState(saved);
  return isArrow;
};

/**
 * Check whether a single identifier is followed by `=>`.
 *
 * @param lexer - The lexer instance.
 * @returns True if the current identifier is an arrow param.
 */
export const isArrowAfterIdent = (lexer: Lexer): boolean => {
  const saved = lexer.saveState();
  lexer.next(); // consume identifier
  const isArrow = lexer.is(TokenType.Arrow);
  lexer.restoreState(saved);
  return isArrow;
};

/**
 * Parse a class expression.
 *
 * Handles: class [Name] [extends SuperClass] { body }
 *
 * The 'class' keyword should be the current token.
 *
 * @param ctx - The expression context.
 * @returns The ClassExpression AST node.
 */
export const parseClassExpression = (ctx: ExprContext): AST.ClassExpression => {
  const start = ctx.lexer.token.start;

  // Consume 'class' keyword
  ctx.lexer.expect(TokenType.Class);

  // Optional name
  let id: AST.Identifier | null = null;
  if (ctx.lexer.is(TokenType.Identifier)) {
    const nameToken = ctx.lexer.next();
    id = Object.freeze({
      type: "Identifier" as const,
      name: nameToken.value as string,
      start: nameToken.start,
      end: nameToken.end,
    });
  }

  // Optional extends clause
  let superClass: AST.Expression | null = null;
  if (ctx.lexer.is(TokenType.Extends)) {
    ctx.lexer.next();
    superClass = ctx.parseAssignmentExpression(ctx.lexer, true);
  }

  // Parse class body
  const body = parseClassBody(ctx);

  return Object.freeze({
    type: "ClassExpression" as const,
    id,
    superClass,
    body,
    start,
    end: body.end,
  });
};

/**
 * Parse a class body: { members }
 *
 * @param ctx - The expression context.
 * @returns The ClassBody AST node.
 */
const parseClassBody = (ctx: ExprContext): AST.ClassBody => {
  const start = ctx.lexer.token.start;
  ctx.lexer.expect(TokenType.LeftBrace);

  const members: Array<
    AST.MethodDefinition | AST.PropertyDefinition | AST.StaticBlock
  > = [];

  while (!ctx.lexer.is(TokenType.RightBrace) && !ctx.lexer.is(TokenType.EOF)) {
    // Skip semicolons
    if (ctx.lexer.is(TokenType.Semicolon)) {
      ctx.lexer.next();
      continue;
    }

    const member = parseClassMember(ctx);
    members.push(member);
  }

  const endToken = ctx.lexer.expect(TokenType.RightBrace);

  return Object.freeze({
    type: "ClassBody" as const,
    body: Object.freeze(members),
    start,
    end: endToken.end,
  });
};

/**
 * Parse a single class member (method or property).
 *
 * @param ctx - The expression context.
 * @returns A MethodDefinition, PropertyDefinition, or StaticBlock node.
 */
const parseClassMember = (
  ctx: ExprContext,
): AST.MethodDefinition | AST.PropertyDefinition | AST.StaticBlock => {
  const memberStart = ctx.lexer.token.start;
  let isStatic = false;
  let kind: "constructor" | "method" | "get" | "set" = "method";

  // Check for static keyword
  if (ctx.lexer.is(TokenType.Static)) {
    const staticToken = ctx.lexer.next();

    // Static block: static { ... }
    if (ctx.lexer.is(TokenType.LeftBrace)) {
      const body = ctx.parseBlockStatementFromLexer(ctx.lexer);
      return Object.freeze({
        type: "StaticBlock" as const,
        body: body.body as unknown as ReadonlyArray<AST.Statement>,
        start: staticToken.start,
        end: body.end,
      });
    }

    isStatic = true;
  }

  // Check for get/set
  if (ctx.lexer.is(TokenType.Get)) {
    const saved = ctx.lexer.saveState();
    ctx.lexer.next();
    if (
      !ctx.lexer.is(TokenType.LeftParen) &&
      !ctx.lexer.is(TokenType.Equals) &&
      !ctx.lexer.is(TokenType.Semicolon)
    ) {
      kind = "get";
    } else {
      ctx.lexer.restoreState(saved);
    }
  } else if (ctx.lexer.is(TokenType.Set)) {
    const saved = ctx.lexer.saveState();
    ctx.lexer.next();
    if (
      !ctx.lexer.is(TokenType.LeftParen) &&
      !ctx.lexer.is(TokenType.Equals) &&
      !ctx.lexer.is(TokenType.Semicolon)
    ) {
      kind = "set";
    } else {
      ctx.lexer.restoreState(saved);
    }
  }

  // Parse the key
  let key: AST.Expression;
  let computed = false;

  if (ctx.lexer.is(TokenType.LeftBracket)) {
    computed = true;
    ctx.lexer.next();
    key = ctx.parseAssignmentExpression(ctx.lexer, true);
    ctx.lexer.expect(TokenType.RightBracket);
  } else if (
    ctx.lexer.is(TokenType.Identifier) ||
    isKeywordToken(ctx.lexer.token.type)
  ) {
    const keyToken = ctx.lexer.next();
    const keyName = keyToken.value as string;
    if (keyName === "constructor" && !isStatic) {
      kind = "constructor";
    }
    key = Object.freeze({
      type: "Identifier" as const,
      name: keyName,
      start: keyToken.start,
      end: keyToken.end,
    });
  } else if (
    ctx.lexer.is(TokenType.NumericLiteral) ||
    ctx.lexer.is(TokenType.StringLiteral)
  ) {
    const litToken = ctx.lexer.next();
    key = Object.freeze({
      type: "Literal" as const,
      value: litToken.value as string | number,
      raw: litToken.raw,
      start: litToken.start,
      end: litToken.end,
    });
  } else {
    throw new SyntaxError(
      `Unexpected token in class member at position ${ctx.lexer.token.start}`,
    );
  }

  // Method definition
  if (ctx.lexer.is(TokenType.LeftParen)) {
    const params = parseParams(ctx);
    const body = ctx.parseBlockStatementFromLexer(ctx.lexer);

    const value: AST.FunctionExpression = Object.freeze({
      type: "FunctionExpression" as const,
      id: null,
      params: Object.freeze(params),
      body,
      generator: false,
      async: false,
      start: params.length > 0 ? (params[0] as AST.BaseNode).start : body.start,
      end: body.end,
    });

    return Object.freeze({
      type: "MethodDefinition" as const,
      key,
      value,
      kind,
      computed,
      static: isStatic,
      start: memberStart,
      end: body.end,
    });
  }

  // Property definition
  let propValue: AST.Expression | null = null;
  if (ctx.lexer.is(TokenType.Equals)) {
    ctx.lexer.next();
    propValue = ctx.parseAssignmentExpression(ctx.lexer, true);
  }

  const propEnd = propValue ? propValue.end : key.end;

  // Consume optional semicolon
  if (ctx.lexer.is(TokenType.Semicolon)) {
    ctx.lexer.next();
  }

  return Object.freeze({
    type: "PropertyDefinition" as const,
    key,
    value: propValue,
    computed,
    static: isStatic,
    start: memberStart,
    end: propEnd,
  });
};

/**
 * Parse a function parameter list: (param1, param2 = default, ...rest)
 *
 * Handles simple identifiers, default values (= expr), and rest elements (...x).
 *
 * @param ctx - The expression context.
 * @returns Array of Pattern nodes representing the parameters.
 */
export const parseParams = (ctx: ExprContext): Array<AST.Pattern> => {
  ctx.lexer.expect(TokenType.LeftParen);

  const params: Array<AST.Pattern> = [];

  while (!ctx.lexer.is(TokenType.RightParen) && !ctx.lexer.is(TokenType.EOF)) {
    if (params.length > 0) {
      ctx.lexer.expect(TokenType.Comma);
    }

    // Rest element: ...param
    if (ctx.lexer.is(TokenType.Ellipsis)) {
      const restStart = ctx.lexer.token.start;
      ctx.lexer.next();
      const argToken = ctx.lexer.expect(TokenType.Identifier);
      const argument: AST.Identifier = Object.freeze({
        type: "Identifier" as const,
        name: argToken.value as string,
        start: argToken.start,
        end: argToken.end,
      });
      params.push(
        Object.freeze({
          type: "RestElement" as const,
          argument,
          start: restStart,
          end: argument.end,
        }),
      );
      // Rest must be last parameter
      break;
    }

    // Simple identifier parameter
    const paramToken = ctx.lexer.expect(TokenType.Identifier);
    const paramId: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      name: paramToken.value as string,
      start: paramToken.start,
      end: paramToken.end,
    });

    // Check for default value
    if (ctx.lexer.is(TokenType.Equals)) {
      const assignStart = paramId.start;
      ctx.lexer.next();
      const right = ctx.parseAssignmentExpression(ctx.lexer, true);
      params.push(
        Object.freeze({
          type: "AssignmentPattern" as const,
          left: paramId,
          right,
          start: assignStart,
          end: right.end,
        }),
      );
    } else {
      params.push(paramId);
    }
  }

  ctx.lexer.expect(TokenType.RightParen);
  return params;
};

/**
 * Check if a token type represents a keyword that can be used as an
 * identifier in some contexts.
 *
 * @param type - The token type to check.
 * @returns True if the token is a keyword that can serve as identifier.
 */
const isKeywordToken = (type: number): boolean => {
  return (
    (type >= TokenType.Break && type <= TokenType.With) ||
    (type >= TokenType.Class && type <= TokenType.Super) ||
    (type >= TokenType.Async && type <= TokenType.Static)
  );
};
