/**
 * Decorator parsing module for the Steamroller parser.
 *
 * Handles Stage 3 decorator syntax: @expression annotations before
 * class declarations and class members (methods, fields, accessors).
 *
 * Supported decorator expression forms:
 * - Simple identifier: @foo
 * - Member expression: @foo.bar.baz
 * - Call expression: @foo(args) or @foo.bar(args)
 *
 * @module parser/decorators
 */

import type * as AST from "../ast/types.js";
import type { Lexer } from "./lexer.js";
import { TokenType } from "./token-types.js";

/**
 * Parse a list of decorators (zero or more @ annotations).
 *
 * Iteratively consumes @ tokens followed by decorator expressions
 * until the current token is no longer @.
 *
 * @param lexer - The lexer instance.
 * @param parseArgs - Function to parse call expression arguments.
 * @returns A frozen array of Decorator AST nodes.
 */
export const parseDecorators = (
  lexer: Lexer,
  parseArgs: () => ReadonlyArray<AST.Expression | AST.SpreadElement>,
): ReadonlyArray<AST.Decorator> => {
  const decorators: Array<AST.Decorator> = [];

  while (lexer.is(TokenType.At)) {
    const start = lexer.token.start;
    lexer.next(); // consume @

    const expr = parseDecoratorExpression(lexer, parseArgs);

    decorators.push(
      Object.freeze({
        type: "Decorator" as const,
        expression: expr,
        start,
        end: expr.end,
      }),
    );
  }

  return Object.freeze(decorators);
};

/**
 * Parse the expression part of a decorator.
 *
 * Restricted to:
 * - Identifier: @foo
 * - MemberExpression (dot access only): @foo.bar.baz
 * - CallExpression: @foo(args) or @foo.bar(args)
 *
 * Uses an iterative approach (no recursion) to parse dot-separated
 * member chains followed by an optional call.
 *
 * @param lexer - The lexer instance.
 * @param parseArgs - Function to parse call expression arguments.
 * @returns The parsed Expression AST node.
 */
const parseDecoratorExpression = (
  lexer: Lexer,
  parseArgs: () => ReadonlyArray<AST.Expression | AST.SpreadElement>,
): AST.Expression => {
  // Parse the initial identifier
  if (!lexer.is(TokenType.Identifier)) {
    throw new SyntaxError(
      `Expected identifier after @ at position ${lexer.token.start}`,
    );
  }

  const identToken = lexer.next();
  let expr: AST.Expression = Object.freeze({
    type: "Identifier" as const,
    name: identToken.value as string,
    start: identToken.start,
    end: identToken.end,
  });

  // Iteratively parse member access: .bar.baz
  while (lexer.is(TokenType.Dot)) {
    lexer.next(); // consume dot

    if (!lexer.is(TokenType.Identifier)) {
      throw new SyntaxError(
        `Expected identifier after '.' in decorator at position ${lexer.token.start}`,
      );
    }

    const propToken = lexer.next();
    const property: AST.Identifier = Object.freeze({
      type: "Identifier" as const,
      name: propToken.value as string,
      start: propToken.start,
      end: propToken.end,
    });

    expr = Object.freeze({
      type: "MemberExpression" as const,
      object: expr,
      property,
      computed: false,
      optional: false,
      start: expr.start,
      end: propToken.end,
    });
  }

  // Optionally parse call expression: (args)
  if (lexer.is(TokenType.LeftParen)) {
    const callStart = expr.start;
    lexer.next(); // consume (

    const args = parseArgs();

    const closeToken = lexer.expect(TokenType.RightParen);

    expr = Object.freeze({
      type: "CallExpression" as const,
      callee: expr,
      arguments: args,
      optional: false,
      start: callStart,
      end: closeToken.end,
    });
  }

  return expr;
};
