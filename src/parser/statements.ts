/**
 * Statement parsing functions for the Steamroller parser.
 *
 * Provides parsing logic for all JavaScript statement types including
 * control flow, loops, variable declarations, and compound statements.
 * Works with the Parser class by accepting a ParserContext interface
 * that abstracts lexer operations and expression parsing.
 *
 * @module parser/statements
 */

import type * as AST from "../ast/types.js";
import type { Token } from "./token.js";
import { TokenType } from "./token-types.js";

/**
 * Context interface required by statement parsing functions.
 * Abstracts the parser/lexer operations needed for statement parsing.
 */
export interface ParserContext {
  /** The current token. */
  readonly token: Token;
  /** Whether a line terminator preceded the current token. */
  readonly hadLineTerminatorBefore: boolean;
  /** Whether `in` operator is allowed in expressions (false in for-loop headers). */
  allowIn: boolean;
  /** Whether TypeScript mode is enabled. */
  readonly typescriptEnabled?: boolean;
  /** Advance to the next token and return the previous one. */
  next(): Token;
  /** Expect and consume a specific token type. */
  expect(type: number): Token;
  /** Check if current token is a specific type. */
  is(type: number): boolean;
  /** Consume a token if it matches the type, returns true if consumed. */
  eat(type: number): boolean;
  /** Parse an expression (delegated to expression parser). */
  parseExpression(): AST.Expression;
  /** Parse an assignment expression (single, no comma). */
  parseAssignmentExpression(): AST.Expression;
  /** Parse a statement (recursive via parser). */
  parseStatement(): AST.Statement | AST.ModuleDeclaration;
  /** Parse a pattern for destructuring. */
  parseBindingPattern(): AST.Pattern;
}

/**
 * Parse a block statement: { stmt* }
 *
 * @param ctx - The parser context.
 * @returns A BlockStatement AST node.
 */
export const parseBlockStatement = (ctx: ParserContext): AST.BlockStatement => {
  const start = ctx.token.start;
  ctx.expect(TokenType.LeftBrace);

  const body: Array<AST.Statement> = [];
  while (!ctx.is(TokenType.RightBrace) && !ctx.is(TokenType.EOF)) {
    body.push(ctx.parseStatement() as AST.Statement);
  }

  const end = ctx.token.end;
  ctx.expect(TokenType.RightBrace);

  return Object.freeze({
    type: "BlockStatement" as const,
    start,
    end,
    body: Object.freeze(body),
  });
};

/**
 * Parse an empty statement: ;
 *
 * @param ctx - The parser context.
 * @returns An EmptyStatement AST node.
 */
export const parseEmptyStatement = (ctx: ParserContext): AST.EmptyStatement => {
  const token = ctx.token;
  ctx.next();
  return Object.freeze({
    type: "EmptyStatement" as const,
    start: token.start,
    end: token.end,
  });
};

/**
 * Parse a debugger statement: debugger;
 *
 * @param ctx - The parser context.
 * @returns A DebuggerStatement AST node.
 */
export const parseDebuggerStatement = (
  ctx: ParserContext,
): AST.DebuggerStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'debugger'
  const end = ctx.token.end;
  consumeSemicolon(ctx);
  return Object.freeze({
    type: "DebuggerStatement" as const,
    start,
    end: end,
  });
};

/**
 * Parse a return statement: return [expr];
 *
 * Handles ASI: if a line terminator follows `return`, the argument is null.
 *
 * @param ctx - The parser context.
 * @returns A ReturnStatement AST node.
 */
export const parseReturnStatement = (
  ctx: ParserContext,
): AST.ReturnStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'return'

  let argument: AST.Expression | null = null;
  // ASI: if line terminator before next token, or next is ; or } or EOF
  if (
    !ctx.hadLineTerminatorBefore &&
    !ctx.is(TokenType.Semicolon) &&
    !ctx.is(TokenType.RightBrace) &&
    !ctx.is(TokenType.EOF)
  ) {
    argument = ctx.parseExpression();
  }

  const end = argument !== null ? argument.end : start + 6; // 'return'.length
  consumeSemicolon(ctx);

  return Object.freeze({
    type: "ReturnStatement" as const,
    start,
    end,
    argument,
  });
};

/**
 * Parse a throw statement: throw expr;
 *
 * Throw requires an expression on the same line (no ASI before expression).
 *
 * @param ctx - The parser context.
 * @returns A ThrowStatement AST node.
 * @throws {SyntaxError} If no expression follows throw on the same line.
 */
export const parseThrowStatement = (ctx: ParserContext): AST.ThrowStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'throw'

  if (ctx.hadLineTerminatorBefore) {
    throw new SyntaxError(`Illegal newline after throw at position ${start}`);
  }

  const argument = ctx.parseExpression();
  const end = argument.end;
  consumeSemicolon(ctx);

  return Object.freeze({
    type: "ThrowStatement" as const,
    start,
    end,
    argument,
  });
};

/**
 * Parse a break statement: break [label];
 *
 * Handles ASI: if a line terminator follows `break`, the label is null.
 *
 * @param ctx - The parser context.
 * @returns A BreakStatement AST node.
 */
export const parseBreakStatement = (ctx: ParserContext): AST.BreakStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'break'

  let label: AST.Identifier | null = null;
  if (!ctx.hadLineTerminatorBefore && ctx.is(TokenType.Identifier)) {
    const labelToken = ctx.token;
    ctx.next();
    label = Object.freeze({
      type: "Identifier" as const,
      start: labelToken.start,
      end: labelToken.end,
      name: labelToken.value as string,
    });
  }

  const end = label !== null ? label.end : start + 5; // 'break'.length
  consumeSemicolon(ctx);

  return Object.freeze({
    type: "BreakStatement" as const,
    start,
    end,
    label,
  });
};

/**
 * Parse a continue statement: continue [label];
 *
 * Handles ASI: if a line terminator follows `continue`, the label is null.
 *
 * @param ctx - The parser context.
 * @returns A ContinueStatement AST node.
 */
export const parseContinueStatement = (
  ctx: ParserContext,
): AST.ContinueStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'continue'

  let label: AST.Identifier | null = null;
  if (!ctx.hadLineTerminatorBefore && ctx.is(TokenType.Identifier)) {
    const labelToken = ctx.token;
    ctx.next();
    label = Object.freeze({
      type: "Identifier" as const,
      start: labelToken.start,
      end: labelToken.end,
      name: labelToken.value as string,
    });
  }

  const end = label !== null ? label.end : start + 8; // 'continue'.length
  consumeSemicolon(ctx);

  return Object.freeze({
    type: "ContinueStatement" as const,
    start,
    end,
    label,
  });
};

/**
 * Parse an if statement: if (test) consequent [else alternate]
 *
 * @param ctx - The parser context.
 * @returns An IfStatement AST node.
 */
export const parseIfStatement = (ctx: ParserContext): AST.IfStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'if'
  ctx.expect(TokenType.LeftParen);
  const test = ctx.parseExpression();
  ctx.expect(TokenType.RightParen);
  const consequent = ctx.parseStatement() as AST.Statement;

  let alternate: AST.Statement | null = null;
  if (ctx.is(TokenType.Else)) {
    ctx.next(); // consume 'else'
    alternate = ctx.parseStatement() as AST.Statement;
  }

  const end = alternate !== null ? alternate.end : consequent.end;

  return Object.freeze({
    type: "IfStatement" as const,
    start,
    end,
    test,
    consequent,
    alternate,
  });
};

/**
 * Parse a while statement: while (test) body
 *
 * @param ctx - The parser context.
 * @returns A WhileStatement AST node.
 */
export const parseWhileStatement = (ctx: ParserContext): AST.WhileStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'while'
  ctx.expect(TokenType.LeftParen);
  const test = ctx.parseExpression();
  ctx.expect(TokenType.RightParen);
  const body = ctx.parseStatement() as AST.Statement;

  return Object.freeze({
    type: "WhileStatement" as const,
    start,
    end: body.end,
    test,
    body,
  });
};

/**
 * Parse a do-while statement: do body while (test);
 *
 * @param ctx - The parser context.
 * @returns A DoWhileStatement AST node.
 */
export const parseDoWhileStatement = (
  ctx: ParserContext,
): AST.DoWhileStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'do'
  const body = ctx.parseStatement() as AST.Statement;
  ctx.expect(TokenType.While);
  ctx.expect(TokenType.LeftParen);
  const test = ctx.parseExpression();
  const endToken = ctx.expect(TokenType.RightParen);
  consumeSemicolon(ctx);

  return Object.freeze({
    type: "DoWhileStatement" as const,
    start,
    end: endToken.end,
    body,
    test,
  });
};

/**
 * Parse a for statement: for (...) body
 *
 * Distinguishes between for, for-in, and for-of forms by lookahead.
 *
 * @param ctx - The parser context.
 * @returns A ForStatement, ForInStatement, or ForOfStatement AST node.
 */
export const parseForStatement = (
  ctx: ParserContext,
): AST.ForStatement | AST.ForInStatement | AST.ForOfStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'for'

  // Check for `for await`
  const isAwait = ctx.is(TokenType.Await);
  if (isAwait) {
    ctx.next(); // consume 'await'
  }

  ctx.expect(TokenType.LeftParen);

  // Empty init: for (; ...)
  if (ctx.is(TokenType.Semicolon)) {
    return parseForRegular(ctx, start, null);
  }

  // var/let/const declaration as init
  if (
    ctx.is(TokenType.Var) ||
    ctx.is(TokenType.Let) ||
    ctx.is(TokenType.Const)
  ) {
    const decl = parseVariableDeclarationNoSemicolon(ctx);

    if (ctx.is(TokenType.In)) {
      ctx.next(); // consume 'in'
      const right = ctx.parseExpression();
      ctx.expect(TokenType.RightParen);
      const body = ctx.parseStatement() as AST.Statement;
      return Object.freeze({
        type: "ForInStatement" as const,
        start,
        end: body.end,
        left: decl,
        right,
        body,
      });
    }

    if (ctx.is(TokenType.Of)) {
      ctx.next(); // consume 'of'
      const right = ctx.parseAssignmentExpression();
      ctx.expect(TokenType.RightParen);
      const body = ctx.parseStatement() as AST.Statement;
      return Object.freeze({
        type: "ForOfStatement" as const,
        start,
        end: body.end,
        left: decl,
        right,
        body,
        await: isAwait,
      });
    }

    return parseForRegular(ctx, start, decl);
  }

  // Expression as init (disallow `in` operator to distinguish for-in)
  const prevAllowIn = ctx.allowIn;
  ctx.allowIn = false;
  const initExpr = ctx.parseExpression();
  ctx.allowIn = prevAllowIn;

  if (ctx.is(TokenType.In)) {
    ctx.next(); // consume 'in'
    const right = ctx.parseExpression();
    ctx.expect(TokenType.RightParen);
    const body = ctx.parseStatement() as AST.Statement;
    return Object.freeze({
      type: "ForInStatement" as const,
      start,
      end: body.end,
      left: initExpr as unknown as AST.Pattern,
      right,
      body,
    });
  }

  if (ctx.is(TokenType.Of)) {
    ctx.next(); // consume 'of'
    const right = ctx.parseAssignmentExpression();
    ctx.expect(TokenType.RightParen);
    const body = ctx.parseStatement() as AST.Statement;
    return Object.freeze({
      type: "ForOfStatement" as const,
      start,
      end: body.end,
      left: initExpr as unknown as AST.Pattern,
      right,
      body,
      await: isAwait,
    });
  }

  return parseForRegular(ctx, start, initExpr);
};

/**
 * Parse the remainder of a regular for statement (after init is parsed).
 *
 * @param ctx - The parser context.
 * @param start - Start position of the for keyword.
 * @param init - The already-parsed init expression or declaration (or null).
 * @returns A ForStatement AST node.
 */
const parseForRegular = (
  ctx: ParserContext,
  start: number,
  init: AST.VariableDeclaration | AST.Expression | null,
): AST.ForStatement => {
  ctx.expect(TokenType.Semicolon);

  const test: AST.Expression | null = ctx.is(TokenType.Semicolon)
    ? null
    : ctx.parseExpression();
  ctx.expect(TokenType.Semicolon);

  const update: AST.Expression | null = ctx.is(TokenType.RightParen)
    ? null
    : ctx.parseExpression();
  ctx.expect(TokenType.RightParen);

  const body = ctx.parseStatement() as AST.Statement;

  return Object.freeze({
    type: "ForStatement" as const,
    start,
    end: body.end,
    init,
    test,
    update,
    body,
  });
};

/**
 * Parse a switch statement: switch (discriminant) { cases }
 *
 * @param ctx - The parser context.
 * @returns A SwitchStatement AST node.
 */
export const parseSwitchStatement = (
  ctx: ParserContext,
): AST.SwitchStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'switch'
  ctx.expect(TokenType.LeftParen);
  const discriminant = ctx.parseExpression();
  ctx.expect(TokenType.RightParen);
  ctx.expect(TokenType.LeftBrace);

  const cases: Array<AST.SwitchCase> = [];
  while (!ctx.is(TokenType.RightBrace) && !ctx.is(TokenType.EOF)) {
    cases.push(parseSwitchCase(ctx));
  }

  const endToken = ctx.expect(TokenType.RightBrace);

  return Object.freeze({
    type: "SwitchStatement" as const,
    start,
    end: endToken.end,
    discriminant,
    cases: Object.freeze(cases),
  });
};

/**
 * Parse a single switch case or default clause.
 *
 * @param ctx - The parser context.
 * @returns A SwitchCase AST node.
 */
const parseSwitchCase = (ctx: ParserContext): AST.SwitchCase => {
  const start = ctx.token.start;
  let test: AST.Expression | null = null;

  if (ctx.is(TokenType.Case)) {
    ctx.next(); // consume 'case'
    test = ctx.parseExpression();
  } else {
    ctx.expect(TokenType.Default); // consume 'default'
  }

  ctx.expect(TokenType.Colon);

  const consequent: Array<AST.Statement> = [];
  while (
    !ctx.is(TokenType.Case) &&
    !ctx.is(TokenType.Default) &&
    !ctx.is(TokenType.RightBrace) &&
    !ctx.is(TokenType.EOF)
  ) {
    consequent.push(ctx.parseStatement() as AST.Statement);
  }

  const end =
    consequent.length > 0
      ? consequent[consequent.length - 1].end
      : ctx.token.start;

  return Object.freeze({
    type: "SwitchCase" as const,
    start,
    end,
    test,
    consequent: Object.freeze(consequent),
  });
};

/**
 * Parse a try statement: try { } [catch (param) { }] [finally { }]
 *
 * Supports optional catch binding (catch without parameter).
 *
 * @param ctx - The parser context.
 * @returns A TryStatement AST node.
 * @throws {SyntaxError} If neither catch nor finally is present.
 */
export const parseTryStatement = (ctx: ParserContext): AST.TryStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'try'

  const block = parseBlockStatement(ctx);

  let handler: AST.CatchClause | null = null;
  if (ctx.is(TokenType.Catch)) {
    handler = parseCatchClause(ctx);
  }

  let finalizer: AST.BlockStatement | null = null;
  if (ctx.is(TokenType.Finally)) {
    ctx.next(); // consume 'finally'
    finalizer = parseBlockStatement(ctx);
  }

  if (handler === null && finalizer === null) {
    throw new SyntaxError(
      `Missing catch or finally after try at position ${start}`,
    );
  }

  const end =
    finalizer !== null
      ? finalizer.end
      : handler !== null
        ? handler.end
        : block.end;

  return Object.freeze({
    type: "TryStatement" as const,
    start,
    end,
    block,
    handler,
    finalizer,
  });
};

/**
 * Parse a catch clause: catch [(param)] { body }
 *
 * @param ctx - The parser context.
 * @returns A CatchClause AST node.
 */
const parseCatchClause = (ctx: ParserContext): AST.CatchClause => {
  const start = ctx.token.start;
  ctx.next(); // consume 'catch'

  let param: AST.Pattern | null = null;
  if (ctx.is(TokenType.LeftParen)) {
    ctx.next(); // consume '('
    param = ctx.parseBindingPattern();
    ctx.expect(TokenType.RightParen);
  }

  const body = parseBlockStatement(ctx);

  return Object.freeze({
    type: "CatchClause" as const,
    start,
    end: body.end,
    param,
    body,
  });
};

/**
 * Parse a with statement: with (object) body
 *
 * @param ctx - The parser context.
 * @returns A WithStatement AST node.
 */
export const parseWithStatement = (ctx: ParserContext): AST.WithStatement => {
  const start = ctx.token.start;
  ctx.next(); // consume 'with'
  ctx.expect(TokenType.LeftParen);
  const object = ctx.parseExpression();
  ctx.expect(TokenType.RightParen);
  const body = ctx.parseStatement() as AST.Statement;

  return Object.freeze({
    type: "WithStatement" as const,
    start,
    end: body.end,
    object,
    body,
  });
};

/**
 * Parse a labeled statement: label: stmt
 *
 * Called when an identifier followed by colon is detected.
 *
 * @param ctx - The parser context.
 * @param labelToken - The identifier token representing the label.
 * @returns A LabeledStatement AST node.
 */
export const parseLabeledStatement = (
  ctx: ParserContext,
  labelToken: Token,
): AST.LabeledStatement => {
  const start = labelToken.start;
  const label: AST.Identifier = Object.freeze({
    type: "Identifier" as const,
    start: labelToken.start,
    end: labelToken.end,
    name: labelToken.value as string,
  });

  ctx.next(); // consume ':'
  const body = ctx.parseStatement() as AST.Statement;

  return Object.freeze({
    type: "LabeledStatement" as const,
    start,
    end: body.end,
    label,
    body,
  });
};

/**
 * Parse a variable declaration: var/let/const declarators;
 *
 * @param ctx - The parser context.
 * @returns A VariableDeclaration AST node.
 */
export const parseVariableDeclaration = (
  ctx: ParserContext,
): AST.VariableDeclaration => {
  const decl = parseVariableDeclarationNoSemicolon(ctx);
  consumeSemicolon(ctx);
  return decl;
};

/**
 * Parse a variable declaration without consuming the trailing semicolon.
 * Used internally for for-loop headers.
 *
 * @param ctx - The parser context.
 * @returns A VariableDeclaration AST node.
 */
const parseVariableDeclarationNoSemicolon = (
  ctx: ParserContext,
): AST.VariableDeclaration => {
  const start = ctx.token.start;
  const kindToken = ctx.token;
  const kind = kindToken.value as "var" | "let" | "const";
  ctx.next(); // consume var/let/const

  const declarations: Array<AST.VariableDeclarator> = [];
  declarations.push(parseVariableDeclarator(ctx));

  while (ctx.is(TokenType.Comma)) {
    ctx.next(); // consume ','
    declarations.push(parseVariableDeclarator(ctx));
  }

  const end = declarations[declarations.length - 1].end;

  return Object.freeze({
    type: "VariableDeclaration" as const,
    start,
    end,
    declarations: Object.freeze(declarations),
    kind,
  });
};

/**
 * Parse a single variable declarator: pattern [= initializer]
 *
 * @param ctx - The parser context.
 * @returns A VariableDeclarator AST node.
 */
const parseVariableDeclarator = (
  ctx: ParserContext,
): AST.VariableDeclarator => {
  const id = ctx.parseBindingPattern();
  let init: AST.Expression | null = null;

  // In TypeScript mode, skip optional `!` (definite assignment) and type annotation
  if (ctx.typescriptEnabled) {
    // Skip `!` definite assignment assertion
    if (ctx.is(TokenType.Exclamation)) {
      ctx.next();
    }
    // Skip type annotation: `: Type`
    if (ctx.is(TokenType.Colon)) {
      skipTypeAnnotation(ctx);
    }
  }

  if (ctx.is(TokenType.Equals)) {
    ctx.next(); // consume '='
    init = ctx.parseAssignmentExpression();
  }

  const end = init !== null ? init.end : id.end;

  return Object.freeze({
    type: "VariableDeclarator" as const,
    start: id.start,
    end,
    id,
    init,
  });
};

/**
 * Skip a TypeScript type annotation by consuming tokens until we reach
 * a delimiter that ends the type context (=, ;, ,, ), ], }, EOF).
 *
 * This is a simple bracket-balanced skipper that handles nested generics,
 * braces, brackets, and parens.
 */
const skipTypeAnnotation = (ctx: ParserContext): void => {
  ctx.next(); // consume ':'
  let depth = 0;

  while (!ctx.is(TokenType.EOF)) {
    if (
      depth === 0 &&
      (ctx.is(TokenType.Equals) ||
        ctx.is(TokenType.Semicolon) ||
        ctx.is(TokenType.Comma) ||
        ctx.is(TokenType.RightParen) ||
        ctx.is(TokenType.RightBracket) ||
        ctx.is(TokenType.RightBrace))
    ) {
      return;
    }

    // Handle ASI
    if (depth === 0 && ctx.hadLineTerminatorBefore) {
      // Check if the current token could start a new statement
      const t = ctx.token.type;
      if (
        t === TokenType.Var ||
        t === TokenType.Let ||
        t === TokenType.Const ||
        t === TokenType.Function ||
        t === TokenType.Class ||
        t === TokenType.Return ||
        t === TokenType.If ||
        t === TokenType.For ||
        t === TokenType.While ||
        t === TokenType.Import ||
        t === TokenType.Export
      ) {
        return;
      }
    }

    if (
      ctx.is(TokenType.LessThan) ||
      ctx.is(TokenType.LeftParen) ||
      ctx.is(TokenType.LeftBracket) ||
      ctx.is(TokenType.LeftBrace)
    ) {
      depth++;
    } else if (
      ctx.is(TokenType.GreaterThan) ||
      ctx.is(TokenType.RightParen) ||
      ctx.is(TokenType.RightBracket) ||
      ctx.is(TokenType.RightBrace)
    ) {
      depth--;
      if (depth < 0) {
        return;
      }
    }

    ctx.next();
  }
};

/**
 * Parse an expression statement: expr;
 *
 * Handles ASI and directives (string literal expression statements).
 *
 * @param ctx - The parser context.
 * @returns An ExpressionStatement AST node.
 */
export const parseExpressionStatement = (
  ctx: ParserContext,
): AST.ExpressionStatement => {
  const start = ctx.token.start;
  const expression = ctx.parseExpression();
  const end = expression.end;
  consumeSemicolon(ctx);

  // Check for directive (string literal expression statement)
  const directive =
    expression.type === "Literal" && typeof expression.value === "string"
      ? expression.value
      : undefined;

  const node: AST.ExpressionStatement = {
    type: "ExpressionStatement" as const,
    start,
    end,
    expression,
    ...(directive !== undefined ? { directive } : {}),
  };

  return Object.freeze(node);
};

/**
 * Consume a semicolon, applying Automatic Semicolon Insertion rules.
 *
 * A semicolon is consumed if present. Otherwise ASI applies when:
 * - A line terminator preceded the current token
 * - The current token is }
 * - The current token is EOF
 *
 * @param ctx - The parser context.
 * @throws {SyntaxError} If no semicolon and ASI does not apply.
 */
const consumeSemicolon = (ctx: ParserContext): void => {
  if (ctx.is(TokenType.Semicolon)) {
    ctx.next();
    return;
  }
  // ASI: line terminator before current token, or at } or EOF
  if (
    ctx.hadLineTerminatorBefore ||
    ctx.is(TokenType.RightBrace) ||
    ctx.is(TokenType.EOF)
  ) {
    return;
  }
  throw new SyntaxError(`Expected semicolon at position ${ctx.token.start}`);
};
