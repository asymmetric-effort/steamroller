/**
 * Operator expression parsing using iterative Pratt parsing.
 *
 * Implements binary, logical, unary, update, conditional, and assignment
 * expression parsing with correct operator precedence and associativity.
 *
 * Uses iterative approach (while loops) instead of recursive descent
 * to avoid stack overflow on deeply nested expressions.
 *
 * @module parser/operators
 */

import type * as AST from "../ast/types.js";
import type { Lexer } from "./lexer.js";
import { TokenType } from "./token-types.js";

/**
 * Precedence levels for binary and logical operators.
 * Higher values indicate tighter binding.
 */
const PRECEDENCE: Readonly<Record<number, number>> = Object.freeze({
  [TokenType.PipePipe]: 1,
  [TokenType.AmpersandAmpersand]: 2,
  [TokenType.QuestionQuestion]: 1,
  [TokenType.Pipe]: 3,
  [TokenType.Caret]: 4,
  [TokenType.Ampersand]: 5,
  [TokenType.EqualsEquals]: 6,
  [TokenType.ExclamationEquals]: 6,
  [TokenType.EqualsEqualsEquals]: 6,
  [TokenType.ExclamationEqualsEquals]: 6,
  [TokenType.LessThan]: 7,
  [TokenType.GreaterThan]: 7,
  [TokenType.LessThanEquals]: 7,
  [TokenType.GreaterThanEquals]: 7,
  [TokenType.Instanceof]: 7,
  [TokenType.In]: 7,
  [TokenType.LeftShift]: 8,
  [TokenType.RightShift]: 8,
  [TokenType.UnsignedRightShift]: 8,
  [TokenType.Plus]: 9,
  [TokenType.Minus]: 9,
  [TokenType.Star]: 10,
  [TokenType.Slash]: 10,
  [TokenType.Percent]: 10,
  [TokenType.StarStar]: 11,
});

/**
 * Maps token types to ESTree binary operator strings.
 */
const BINARY_OPERATORS: Readonly<Record<number, AST.BinaryOperator>> =
  Object.freeze({
    [TokenType.Plus]: "+",
    [TokenType.Minus]: "-",
    [TokenType.Star]: "*",
    [TokenType.Slash]: "/",
    [TokenType.Percent]: "%",
    [TokenType.StarStar]: "**",
    [TokenType.Pipe]: "|",
    [TokenType.Caret]: "^",
    [TokenType.Ampersand]: "&",
    [TokenType.LeftShift]: "<<",
    [TokenType.RightShift]: ">>",
    [TokenType.UnsignedRightShift]: ">>>",
    [TokenType.EqualsEquals]: "==",
    [TokenType.ExclamationEquals]: "!=",
    [TokenType.EqualsEqualsEquals]: "===",
    [TokenType.ExclamationEqualsEquals]: "!==",
    [TokenType.LessThan]: "<",
    [TokenType.GreaterThan]: ">",
    [TokenType.LessThanEquals]: "<=",
    [TokenType.GreaterThanEquals]: ">=",
    [TokenType.Instanceof]: "instanceof",
    [TokenType.In]: "in",
  });

/**
 * Maps token types to ESTree logical operator strings.
 */
const LOGICAL_OPERATOR_MAP: Readonly<Record<number, AST.LogicalOperator>> =
  Object.freeze({
    [TokenType.PipePipe]: "||",
    [TokenType.AmpersandAmpersand]: "&&",
    [TokenType.QuestionQuestion]: "??",
  });

/**
 * Set of token types that are logical operators.
 */
const LOGICAL_OPERATORS: ReadonlySet<number> = new Set([
  TokenType.PipePipe,
  TokenType.AmpersandAmpersand,
  TokenType.QuestionQuestion,
]);

/**
 * Maps token types to ESTree assignment operator strings.
 */
const ASSIGNMENT_OPERATORS: Readonly<Record<number, AST.AssignmentOperator>> =
  Object.freeze({
    [TokenType.Equals]: "=",
    [TokenType.PlusEquals]: "+=",
    [TokenType.MinusEquals]: "-=",
    [TokenType.StarEquals]: "*=",
    [TokenType.SlashEquals]: "/=",
    [TokenType.PercentEquals]: "%=",
    [TokenType.StarStarEquals]: "**=",
    [TokenType.AmpersandEquals]: "&=",
    [TokenType.PipeEquals]: "|=",
    [TokenType.CaretEquals]: "^=",
    [TokenType.LeftShiftEquals]: "<<=",
    [TokenType.RightShiftEquals]: ">>=",
    [TokenType.UnsignedRightShiftEquals]: ">>>=",
    [TokenType.AmpersandAmpersandEquals]: "&&=",
    [TokenType.PipePipeEquals]: "||=",
    [TokenType.QuestionQuestionEquals]: "??=",
  });

/**
 * Maps unary prefix operator token types to their string representation.
 */
const UNARY_OPERATORS: Readonly<Record<number, AST.UnaryOperator>> =
  Object.freeze({
    [TokenType.Exclamation]: "!",
    [TokenType.Tilde]: "~",
    [TokenType.Plus]: "+",
    [TokenType.Minus]: "-",
    [TokenType.Typeof]: "typeof",
    [TokenType.Void]: "void",
    [TokenType.Delete]: "delete",
  });

/**
 * Set of token types that can be unary prefix operators.
 */
const UNARY_TOKEN_SET: ReadonlySet<number> = new Set([
  TokenType.Exclamation,
  TokenType.Tilde,
  TokenType.Plus,
  TokenType.Minus,
  TokenType.Typeof,
  TokenType.Void,
  TokenType.Delete,
]);

/**
 * Determines if a token type is a binary/logical operator with a
 * precedence value in the PRECEDENCE table.
 *
 * @param tokenType - The token type to check.
 * @param allowIn - Whether the `in` operator is permitted.
 * @returns The precedence level, or 0 if not an operator.
 */
const getOperatorPrecedence = (tokenType: number, allowIn: boolean): number => {
  if (tokenType === TokenType.In && !allowIn) {
    return 0;
  }
  return PRECEDENCE[tokenType] ?? 0;
};

/**
 * Parse a binary/logical expression using iterative Pratt parsing.
 *
 * Builds the expression tree by comparing precedence levels in a while
 * loop, handling both left-associative and right-associative (** only)
 * operators.
 *
 * @param lexer - The lexer instance to consume tokens from.
 * @param left - The initial left-hand side expression (typically a unary).
 * @param minPrecedence - The minimum precedence for operators to consume.
 * @param allowIn - Whether the `in` operator is allowed.
 * @returns The combined binary/logical expression.
 */
export const parseBinaryExpression = (
  lexer: Lexer,
  left: AST.Expression,
  minPrecedence: number,
  allowIn: boolean,
): AST.Expression => {
  return parseBinaryExpressionInner(lexer, left, minPrecedence, allowIn, 0);
};

/**
 * Nullish mixing context flags (bitmask).
 * 0 = no logical operators seen
 * 1 = has nullish (??)
 * 2 = has short-circuit (|| or &&)
 */
const NULLISH_FLAG = 1;
const SHORT_CIRCUIT_FLAG = 2;

/**
 * Inner Pratt parsing loop with nullish-mixing context tracking.
 *
 * The `logicalContext` tracks which kind of logical operators have been
 * encountered at this parsing level (not including parenthesized sub-exprs).
 * If both nullish and short-circuit are seen, a SyntaxError is thrown.
 */
const parseBinaryExpressionInner = (
  lexer: Lexer,
  left: AST.Expression,
  minPrecedence: number,
  allowIn: boolean,
  logicalContext: number,
): AST.Expression => {
  let result = left;
  let ctx = logicalContext;

  while (true) {
    const tokenType = lexer.token.type;
    const prec = getOperatorPrecedence(tokenType, allowIn);

    if (prec === 0 || prec < minPrecedence) {
      break;
    }

    // Track and validate nullish mixing
    if (LOGICAL_OPERATORS.has(tokenType)) {
      const flag =
        tokenType === TokenType.QuestionQuestion
          ? NULLISH_FLAG
          : SHORT_CIRCUIT_FLAG;
      if ((ctx & ~flag) !== 0) {
        throw new SyntaxError(
          `Cannot mix '??' with '||' or '&&' without parentheses at position ${lexer.token.start}`,
        );
      }
      ctx |= flag;
    }

    const opToken = lexer.next(); // consume operator
    const opType = opToken.type;

    // For right-associative ** use same precedence; for left-assoc use prec+1
    const nextMinPrec = opType === TokenType.StarStar ? prec : prec + 1;

    // Parse the right-hand side: unary then binary with higher min precedence
    // Pass the current logical context so nested operators at higher prec
    // still participate in mixing checks.
    const rightUnary = parseUnaryExpression(lexer, () =>
      parsePrimaryExpressionFn(lexer),
    );
    const right = parseBinaryExpressionInner(
      lexer,
      rightUnary,
      nextMinPrec,
      allowIn,
      ctx,
    );

    // Build the node
    if (LOGICAL_OPERATORS.has(opType)) {
      const operator = LOGICAL_OPERATOR_MAP[opType];
      result = Object.freeze({
        type: "LogicalExpression" as const,
        start: result.start,
        end: right.end,
        operator,
        left: result,
        right,
      });
    } else {
      const operator = BINARY_OPERATORS[opType];
      result = Object.freeze({
        type: "BinaryExpression" as const,
        start: result.start,
        end: right.end,
        operator,
        left: result,
        right,
      });
    }
  }

  return result;
};

/**
 * Parse a unary expression (prefix operators).
 *
 * Handles: !, ~, +, -, typeof, void, delete, ++, --
 * Uses an iterative approach with an explicit operator stack.
 *
 * @param lexer - The lexer instance.
 * @param parsePrimary - Function to parse primary expressions.
 * @returns The parsed unary/update expression, or a primary expression.
 */
export const parseUnaryExpression = (
  lexer: Lexer,
  parsePrimary: () => AST.Expression,
): AST.Expression => {
  // Collect prefix operators onto a stack
  const prefixStack: Array<{
    readonly type: "unary" | "update";
    readonly operator: string;
    readonly start: number;
  }> = [];

  while (true) {
    const tokenType = lexer.token.type;

    // Prefix ++ or --
    if (
      tokenType === TokenType.PlusPlus ||
      tokenType === TokenType.MinusMinus
    ) {
      const start = lexer.token.start;
      const op = tokenType === TokenType.PlusPlus ? "++" : "--";
      lexer.next();
      prefixStack.push({ type: "update", operator: op, start });
      continue;
    }

    // Unary operators: !, ~, +, -, typeof, void, delete
    if (UNARY_TOKEN_SET.has(tokenType)) {
      const start = lexer.token.start;
      const op = UNARY_OPERATORS[tokenType];
      lexer.next();
      prefixStack.push({ type: "unary", operator: op, start });
      continue;
    }

    break;
  }

  // Parse the operand (primary expression)
  let expr = parsePrimary();

  // Apply postfix ++ / -- (no line terminator between)
  expr = parsePostfixExpression(lexer, expr);

  // Wrap from innermost to outermost prefix operator
  for (let i = prefixStack.length - 1; i >= 0; i--) {
    const prefix = prefixStack[i];
    if (prefix.type === "update") {
      expr = Object.freeze({
        type: "UpdateExpression" as const,
        start: prefix.start,
        end: expr.end,
        operator: prefix.operator as AST.UpdateOperator,
        argument: expr,
        prefix: true,
      });
    } else {
      expr = Object.freeze({
        type: "UnaryExpression" as const,
        start: prefix.start,
        end: expr.end,
        operator: prefix.operator as AST.UnaryOperator,
        prefix: true,
        argument: expr,
      });
    }
  }

  return expr;
};

/**
 * Parse postfix update expressions (++ and --).
 *
 * Only applies if no line terminator precedes the ++ or -- token.
 *
 * @param lexer - The lexer instance.
 * @param expr - The expression to potentially wrap.
 * @returns The original expression or an UpdateExpression node.
 */
export const parsePostfixExpression = (
  lexer: Lexer,
  expr: AST.Expression,
): AST.Expression => {
  if (
    (lexer.token.type === TokenType.PlusPlus ||
      lexer.token.type === TokenType.MinusMinus) &&
    !lexer.hadLineTerminatorBefore
  ) {
    const op = lexer.token.type === TokenType.PlusPlus ? "++" : "--";
    const endToken = lexer.next();
    return Object.freeze({
      type: "UpdateExpression" as const,
      start: expr.start,
      end: endToken.end,
      operator: op as AST.UpdateOperator,
      argument: expr,
      prefix: false,
    });
  }
  return expr;
};

/**
 * Parse a conditional (ternary) expression: test ? consequent : alternate
 *
 * @param lexer - The lexer instance.
 * @param test - The test expression (already parsed).
 * @param parseAssign - Function to parse an assignment expression (for branches).
 * @returns The test expression unchanged, or a ConditionalExpression node.
 */
export const parseConditionalExpression = (
  lexer: Lexer,
  test: AST.Expression,
  parseAssign: () => AST.Expression,
): AST.Expression => {
  if (!lexer.is(TokenType.QuestionMark)) {
    return test;
  }

  lexer.next(); // consume ?
  const consequent = parseAssign();
  lexer.expect(TokenType.Colon);
  const alternate = parseAssign();

  return Object.freeze({
    type: "ConditionalExpression" as const,
    start: test.start,
    end: alternate.end,
    test,
    consequent,
    alternate,
  });
};

/**
 * Parse an assignment expression if the current token is an assignment operator.
 *
 * @param lexer - The lexer instance.
 * @param left - The left-hand side expression.
 * @param parseRight - Function to parse the right-hand side (assignment expression).
 * @returns An AssignmentExpression node, or null if not an assignment.
 */
export const parseAssignment = (
  lexer: Lexer,
  left: AST.Expression,
  parseRight: () => AST.Expression,
): AST.Expression | null => {
  const operator = ASSIGNMENT_OPERATORS[lexer.token.type];
  if (operator === undefined) {
    return null;
  }

  lexer.next(); // consume assignment operator
  const right = parseRight();

  return Object.freeze({
    type: "AssignmentExpression" as const,
    start: left.start,
    end: right.end,
    operator,
    left,
    right,
  });
};

/**
 * Internal reference to the primary expression parser.
 * Set by `setPrimaryExpressionParser` during module initialization.
 *
 * This avoids circular imports between operators.ts and expressions.ts.
 */
let parsePrimaryExpressionFn: (lexer: Lexer) => AST.Expression;

/**
 * Register the primary expression parser function.
 *
 * Called by expressions.ts during initialization to break the
 * circular dependency between operators and expressions modules.
 *
 * @param fn - The primary expression parser function.
 */
export const setPrimaryExpressionParser = (
  fn: (lexer: Lexer) => AST.Expression,
): void => {
  parsePrimaryExpressionFn = fn;
};
