/**
 * Core Parser class for the Steamroller JavaScript parser.
 *
 * Consumes a token stream from the Lexer and produces an ESTree-compatible
 * AST. Implements full statement parsing with dispatch based on current
 * token type, and basic expression parsing for statement contexts.
 *
 * @module parser/parser
 */

import type * as AST from '../ast/types.js';
import type { Token } from './token.js';
import { Lexer } from './lexer.js';
import { TokenType } from './token-types.js';
import { tokenTypeName } from './token-types.js';
import type { ParserContext } from './statements.js';
import {
  parseBlockStatement,
  parseEmptyStatement,
  parseDebuggerStatement,
  parseReturnStatement,
  parseThrowStatement,
  parseBreakStatement,
  parseContinueStatement,
  parseIfStatement,
  parseWhileStatement,
  parseDoWhileStatement,
  parseForStatement,
  parseSwitchStatement,
  parseTryStatement,
  parseWithStatement,
  parseLabeledStatement,
  parseVariableDeclaration,
  parseExpressionStatement,
} from './statements.js';

/**
 * Options for the parser.
 */
export interface ParseOptions {
  /** Whether to parse as module or script. Defaults to 'module'. */
  readonly sourceType?: 'module' | 'script';
  /** Whether to allow a hashbang (#!) at the start of the source. */
  readonly allowHashBang?: boolean;
  /** The ECMAScript version to target. Defaults to 2024. */
  readonly ecmaVersion?: number;
}

/**
 * The core Parser class that transforms source text into an AST.
 *
 * Internal state fields are mutable (documented exception for parser
 * state machine pattern).
 */
export class Parser implements ParserContext {
  /** The lexer producing the token stream. */
  private lexer: Lexer;
  /** Whether parsing as module or script. */
  private sourceType: 'module' | 'script';
  /** Whether `in` operator is allowed in current expression context. */
  allowIn: boolean = true;

  /**
   * Create a new Parser for the given source text.
   *
   * @param source - The source text to parse.
   * @param options - Optional parse configuration.
   */
  constructor(source: string, options?: ParseOptions) {
    const sourceType = options?.sourceType ?? 'module';
    const allowHashBang = options?.allowHashBang ?? false;
    const isStrict = sourceType === 'module';

    this.sourceType = sourceType;
    this.lexer = new Lexer(source, isStrict, allowHashBang);
  }

  /**
   * Get the current token.
   */
  get token(): Token {
    return this.lexer.token;
  }

  /**
   * Whether a line terminator preceded the current token.
   */
  get hadLineTerminatorBefore(): boolean {
    return this.lexer.hadLineTerminatorBefore;
  }

  /**
   * Advance to the next token and return the previous one.
   *
   * @returns The previous token.
   */
  next(): Token {
    return this.lexer.next();
  }

  /**
   * Expect and consume a specific token type.
   *
   * @param type - The expected token type.
   * @returns The consumed token.
   */
  expect(type: number): Token {
    return this.lexer.expect(type);
  }

  /**
   * Check if current token is a specific type.
   *
   * @param type - The token type to check.
   * @returns True if current token matches.
   */
  is(type: number): boolean {
    return this.lexer.is(type);
  }

  /**
   * Consume a token if it matches the type.
   *
   * @param type - The token type to try to consume.
   * @returns True if consumed.
   */
  eat(type: number): boolean {
    return this.lexer.eat(type);
  }

  /**
   * Parse the complete program.
   *
   * Iteratively parses statements and declarations until EOF is reached,
   * producing a Program AST node.
   *
   * @returns The root Program AST node.
   */
  parseProgram(): AST.Program {
    const start = this.lexer.token.start;
    const body: Array<AST.Statement | AST.ModuleDeclaration> = [];

    // Parse statements/declarations until EOF
    while (!this.lexer.is(TokenType.EOF)) {
      const stmt = this.parseStatement();
      body.push(stmt);
    }

    const end = this.lexer.token.end;

    return Object.freeze({
      type: 'Program' as const,
      start,
      end,
      body: Object.freeze(body),
      sourceType: this.sourceType,
    });
  }

  /**
   * Parse a single statement, dispatching based on current token type.
   *
   * @returns The parsed statement AST node.
   */
  parseStatement(): AST.Statement {
    const tokenType = this.lexer.token.type;

    switch (tokenType) {
      case TokenType.Semicolon:
        return parseEmptyStatement(this);
      case TokenType.LeftBrace:
        return parseBlockStatement(this);
      case TokenType.If:
        return parseIfStatement(this);
      case TokenType.While:
        return parseWhileStatement(this);
      case TokenType.Do:
        return parseDoWhileStatement(this);
      case TokenType.For:
        return parseForStatement(this);
      case TokenType.Break:
        return parseBreakStatement(this);
      case TokenType.Continue:
        return parseContinueStatement(this);
      case TokenType.Return:
        return parseReturnStatement(this);
      case TokenType.Throw:
        return parseThrowStatement(this);
      case TokenType.Switch:
        return parseSwitchStatement(this);
      case TokenType.Try:
        return parseTryStatement(this);
      case TokenType.With:
        return parseWithStatement(this);
      case TokenType.Debugger:
        return parseDebuggerStatement(this);
      case TokenType.Var:
      case TokenType.Let:
      case TokenType.Const:
        return parseVariableDeclaration(this);
      case TokenType.Identifier: {
        // Check for labeled statement: identifier followed by colon
        const state = this.lexer.saveState();
        const identToken = this.lexer.token;
        this.lexer.next();
        if (this.lexer.is(TokenType.Colon)) {
          return parseLabeledStatement(this, identToken);
        }
        // Not a label, restore and parse as expression statement
        this.lexer.restoreState(state);
        return parseExpressionStatement(this);
      }
      default:
        // Expression statement (for identifiers, literals, unary ops, etc.)
        return parseExpressionStatement(this);
    }
  }

  /**
   * Parse an expression (comma expression allowed).
   *
   * Parses assignment expressions separated by commas. If more than one
   * is found, wraps in a SequenceExpression.
   *
   * @returns The parsed expression AST node.
   */
  parseExpression(): AST.Expression {
    const expr = this.parseAssignmentExpression();

    if (!this.lexer.is(TokenType.Comma)) {
      return expr;
    }

    const expressions: Array<AST.Expression> = [expr];
    while (this.lexer.is(TokenType.Comma)) {
      this.lexer.next();
      expressions.push(this.parseAssignmentExpression());
    }

    return Object.freeze({
      type: 'SequenceExpression' as const,
      start: expressions[0].start,
      end: expressions[expressions.length - 1].end,
      expressions: Object.freeze(expressions),
    });
  }

  /**
   * Parse an assignment expression.
   *
   * Currently handles primary expressions, unary prefix ops, binary ops
   * with precedence, member access, call expressions, and assignments.
   * Full expression parsing will be expanded in subsequent issues.
   *
   * @returns The parsed expression AST node.
   */
  parseAssignmentExpression(): AST.Expression {
    const left = this.parseConditionalExpression();

    // Check for assignment operators
    if (isAssignmentOperator(this.lexer.token.type)) {
      const opToken = this.lexer.token;
      const operator = getAssignmentOperator(opToken.type);
      this.lexer.next();
      const right = this.parseAssignmentExpression();
      return Object.freeze({
        type: 'AssignmentExpression' as const,
        start: left.start,
        end: right.end,
        operator,
        left: left as AST.Pattern | AST.Expression,
        right,
      });
    }

    return left;
  }

  /**
   * Parse a conditional (ternary) expression.
   *
   * @returns The parsed expression AST node.
   */
  private parseConditionalExpression(): AST.Expression {
    const expr = this.parseBinaryExpression(0);

    if (this.lexer.is(TokenType.QuestionMark)) {
      this.lexer.next();
      const consequent = this.parseAssignmentExpression();
      this.lexer.expect(TokenType.Colon);
      const alternate = this.parseAssignmentExpression();
      return Object.freeze({
        type: 'ConditionalExpression' as const,
        start: expr.start,
        end: alternate.end,
        test: expr,
        consequent,
        alternate,
      });
    }

    return expr;
  }

  /**
   * Parse a binary expression with operator precedence climbing.
   *
   * Uses an iterative approach with precedence levels.
   *
   * @param minPrecedence - The minimum precedence level to parse.
   * @returns The parsed expression AST node.
   */
  private parseBinaryExpression(minPrecedence: number): AST.Expression {
    let left = this.parseUnaryExpression();

    // Iterative precedence climbing
    while (true) {
      const tokenType = this.lexer.token.type;
      // Skip `in` operator when not allowed (e.g., in for-loop headers)
      if (tokenType === TokenType.In && !this.allowIn) {
        break;
      }
      const precedence = getBinaryPrecedence(tokenType);
      if (precedence <= minPrecedence) {
        break;
      }

      const opToken = this.lexer.token;
      const isLogical = isLogicalOperator(opToken.type);
      this.lexer.next();
      const right = this.parseBinaryExpression(precedence);

      if (isLogical) {
        left = Object.freeze({
          type: 'LogicalExpression' as const,
          start: left.start,
          end: right.end,
          operator: getLogicalOperator(opToken.type),
          left,
          right,
        });
      } else {
        left = Object.freeze({
          type: 'BinaryExpression' as const,
          start: left.start,
          end: right.end,
          operator: getBinaryOperator(opToken.type),
          left,
          right,
        });
      }
    }

    return left;
  }

  /**
   * Parse a unary expression (prefix operators).
   *
   * @returns The parsed expression AST node.
   */
  private parseUnaryExpression(): AST.Expression {
    const token = this.lexer.token;

    // Prefix unary operators
    if (isUnaryOperator(token.type)) {
      const operator = getUnaryOperator(token.type);
      this.lexer.next();
      const argument = this.parseUnaryExpression();
      return Object.freeze({
        type: 'UnaryExpression' as const,
        start: token.start,
        end: argument.end,
        operator,
        prefix: true,
        argument,
      });
    }

    // Prefix update operators (++ / --)
    if (token.type === TokenType.PlusPlus || token.type === TokenType.MinusMinus) {
      const operator = token.type === TokenType.PlusPlus ? '++' : '--';
      this.lexer.next();
      const argument = this.parseUnaryExpression();
      return Object.freeze({
        type: 'UpdateExpression' as const,
        start: token.start,
        end: argument.end,
        operator: operator as AST.UpdateOperator,
        argument,
        prefix: true,
      });
    }

    return this.parsePostfixExpression();
  }

  /**
   * Parse postfix expressions (++, --).
   *
   * @returns The parsed expression AST node.
   */
  private parsePostfixExpression(): AST.Expression {
    const expr = this.parseCallExpression();

    if (!this.lexer.hadLineTerminatorBefore) {
      if (this.lexer.is(TokenType.PlusPlus) || this.lexer.is(TokenType.MinusMinus)) {
        const opToken = this.lexer.token;
        const operator = opToken.type === TokenType.PlusPlus ? '++' : '--';
        this.lexer.next();
        return Object.freeze({
          type: 'UpdateExpression' as const,
          start: expr.start,
          end: opToken.end,
          operator: operator as AST.UpdateOperator,
          argument: expr,
          prefix: false,
        });
      }
    }

    return expr;
  }

  /**
   * Parse call and member expressions iteratively.
   *
   * @returns The parsed expression AST node.
   */
  private parseCallExpression(): AST.Expression {
    let expr = this.parsePrimaryExpression();

    while (true) {
      if (this.lexer.is(TokenType.Dot)) {
        this.lexer.next();
        const propToken = this.lexer.token;
        // Allow keywords as property names
        this.lexer.next();
        const property: AST.Identifier = Object.freeze({
          type: 'Identifier' as const,
          start: propToken.start,
          end: propToken.end,
          name: propToken.value as string,
        });
        expr = Object.freeze({
          type: 'MemberExpression' as const,
          start: expr.start,
          end: property.end,
          object: expr,
          property,
          computed: false,
          optional: false,
        });
      } else if (this.lexer.is(TokenType.LeftBracket)) {
        this.lexer.next();
        const property = this.parseExpression();
        const endToken = this.lexer.expect(TokenType.RightBracket);
        expr = Object.freeze({
          type: 'MemberExpression' as const,
          start: expr.start,
          end: endToken.end,
          object: expr,
          property,
          computed: true,
          optional: false,
        });
      } else if (this.lexer.is(TokenType.LeftParen)) {
        this.lexer.next();
        const args: Array<AST.Expression | AST.SpreadElement> = [];
        while (!this.lexer.is(TokenType.RightParen) && !this.lexer.is(TokenType.EOF)) {
          if (args.length > 0) {
            this.lexer.expect(TokenType.Comma);
          }
          if (this.lexer.is(TokenType.Ellipsis)) {
            const spreadStart = this.lexer.token.start;
            this.lexer.next();
            const argument = this.parseAssignmentExpression();
            args.push(Object.freeze({
              type: 'SpreadElement' as const,
              start: spreadStart,
              end: argument.end,
              argument,
            }));
          } else {
            args.push(this.parseAssignmentExpression());
          }
        }
        const endToken = this.lexer.expect(TokenType.RightParen);
        expr = Object.freeze({
          type: 'CallExpression' as const,
          start: expr.start,
          end: endToken.end,
          callee: expr,
          arguments: Object.freeze(args),
          optional: false,
        });
      } else {
        break;
      }
    }

    return expr;
  }

  /**
   * Parse a primary expression (literals, identifiers, grouped expressions).
   *
   * @returns The parsed expression AST node.
   */
  private parsePrimaryExpression(): AST.Expression {
    const token = this.lexer.token;

    switch (token.type) {
      case TokenType.Identifier:
      case TokenType.Let:
      case TokenType.Of:
      case TokenType.From:
      case TokenType.As:
      case TokenType.Get:
      case TokenType.Set:
      case TokenType.Static:
      case TokenType.Async:
      case TokenType.Yield:
      case TokenType.Await: {
        this.lexer.next();
        return Object.freeze({
          type: 'Identifier' as const,
          start: token.start,
          end: token.end,
          name: token.value as string,
        });
      }

      case TokenType.NumericLiteral:
      case TokenType.BigIntLiteral: {
        this.lexer.next();
        return Object.freeze({
          type: 'Literal' as const,
          start: token.start,
          end: token.end,
          value: token.value as number | bigint,
          raw: token.raw,
        });
      }

      case TokenType.StringLiteral: {
        this.lexer.next();
        return Object.freeze({
          type: 'Literal' as const,
          start: token.start,
          end: token.end,
          value: token.value as string,
          raw: token.raw,
        });
      }

      case TokenType.True:
      case TokenType.False: {
        this.lexer.next();
        return Object.freeze({
          type: 'Literal' as const,
          start: token.start,
          end: token.end,
          value: token.value as boolean,
          raw: token.raw,
        });
      }

      case TokenType.Null: {
        this.lexer.next();
        return Object.freeze({
          type: 'Literal' as const,
          start: token.start,
          end: token.end,
          value: null,
          raw: token.raw,
        });
      }

      case TokenType.This: {
        this.lexer.next();
        return Object.freeze({
          type: 'ThisExpression' as const,
          start: token.start,
          end: token.end,
        });
      }

      case TokenType.LeftParen: {
        this.lexer.next();
        const expr = this.parseExpression();
        this.lexer.expect(TokenType.RightParen);
        return expr;
      }

      case TokenType.LeftBracket: {
        return this.parseArrayExpression();
      }

      case TokenType.LeftBrace: {
        return this.parseObjectExpression();
      }

      case TokenType.New: {
        return this.parseNewExpression();
      }

      default: {
        const typeName = tokenTypeName(token.type);
        throw new SyntaxError(
          `Unexpected token ${typeName} at position ${token.start}`,
        );
      }
    }
  }

  /**
   * Parse an array expression: [elements]
   *
   * @returns The parsed ArrayExpression AST node.
   */
  private parseArrayExpression(): AST.ArrayExpression {
    const start = this.lexer.token.start;
    this.lexer.next(); // consume '['

    const elements: Array<AST.Expression | AST.SpreadElement | null> = [];
    while (!this.lexer.is(TokenType.RightBracket) && !this.lexer.is(TokenType.EOF)) {
      if (this.lexer.is(TokenType.Comma)) {
        elements.push(null);
        this.lexer.next();
        continue;
      }
      if (this.lexer.is(TokenType.Ellipsis)) {
        const spreadStart = this.lexer.token.start;
        this.lexer.next();
        const argument = this.parseAssignmentExpression();
        elements.push(Object.freeze({
          type: 'SpreadElement' as const,
          start: spreadStart,
          end: argument.end,
          argument,
        }));
      } else {
        elements.push(this.parseAssignmentExpression());
      }
      if (!this.lexer.is(TokenType.RightBracket)) {
        this.lexer.expect(TokenType.Comma);
      }
    }

    const endToken = this.lexer.expect(TokenType.RightBracket);

    return Object.freeze({
      type: 'ArrayExpression' as const,
      start,
      end: endToken.end,
      elements: Object.freeze(elements),
    });
  }

  /**
   * Parse an object expression: { properties }
   *
   * @returns The parsed ObjectExpression AST node.
   */
  private parseObjectExpression(): AST.ObjectExpression {
    const start = this.lexer.token.start;
    this.lexer.next(); // consume '{'

    const properties: Array<AST.Property | AST.SpreadElement> = [];
    while (!this.lexer.is(TokenType.RightBrace) && !this.lexer.is(TokenType.EOF)) {
      if (properties.length > 0) {
        this.lexer.expect(TokenType.Comma);
        if (this.lexer.is(TokenType.RightBrace)) {
          break; // trailing comma
        }
      }

      if (this.lexer.is(TokenType.Ellipsis)) {
        const spreadStart = this.lexer.token.start;
        this.lexer.next();
        const argument = this.parseAssignmentExpression();
        properties.push(Object.freeze({
          type: 'SpreadElement' as const,
          start: spreadStart,
          end: argument.end,
          argument,
        }));
        continue;
      }

      // Parse property key
      const keyToken = this.lexer.token;
      const key: AST.Expression = this.parsePrimaryExpression();

      // Shorthand property: { x }
      if (!this.lexer.is(TokenType.Colon) && key.type === 'Identifier') {
        properties.push(Object.freeze({
          type: 'Property' as const,
          start: key.start,
          end: key.end,
          key,
          value: key,
          kind: 'init' as const,
          method: false,
          shorthand: true,
          computed: false,
        }));
        continue;
      }

      // Regular property: key: value
      this.lexer.expect(TokenType.Colon);
      const value = this.parseAssignmentExpression();
      properties.push(Object.freeze({
        type: 'Property' as const,
        start: keyToken.start,
        end: value.end,
        key,
        value,
        kind: 'init' as const,
        method: false,
        shorthand: false,
        computed: false,
      }));
    }

    const endToken = this.lexer.expect(TokenType.RightBrace);

    return Object.freeze({
      type: 'ObjectExpression' as const,
      start,
      end: endToken.end,
      properties: Object.freeze(properties),
    });
  }

  /**
   * Parse a new expression: new Callee(args)
   *
   * @returns The parsed NewExpression AST node.
   */
  private parseNewExpression(): AST.NewExpression {
    const start = this.lexer.token.start;
    this.lexer.next(); // consume 'new'

    const callee = this.parsePrimaryExpression();
    const args: Array<AST.Expression | AST.SpreadElement> = [];

    if (this.lexer.is(TokenType.LeftParen)) {
      this.lexer.next();
      while (!this.lexer.is(TokenType.RightParen) && !this.lexer.is(TokenType.EOF)) {
        if (args.length > 0) {
          this.lexer.expect(TokenType.Comma);
        }
        args.push(this.parseAssignmentExpression());
      }
      const endToken = this.lexer.expect(TokenType.RightParen);
      return Object.freeze({
        type: 'NewExpression' as const,
        start,
        end: endToken.end,
        callee,
        arguments: Object.freeze(args),
      });
    }

    return Object.freeze({
      type: 'NewExpression' as const,
      start,
      end: callee.end,
      callee,
      arguments: Object.freeze(args),
    });
  }

  /**
   * Parse a binding pattern (identifier or destructuring).
   * Currently supports identifiers only; full destructuring in later issue.
   *
   * @returns The parsed Pattern AST node.
   */
  parseBindingPattern(): AST.Pattern {
    const token = this.lexer.token;
    if (token.type === TokenType.Identifier ||
        token.type === TokenType.Let ||
        token.type === TokenType.Yield ||
        token.type === TokenType.Await) {
      this.lexer.next();
      return Object.freeze({
        type: 'Identifier' as const,
        start: token.start,
        end: token.end,
        name: token.value as string,
      });
    }
    throw new SyntaxError(
      `Expected binding pattern at position ${token.start}`,
    );
  }
}

/**
 * Parse source text into an AST Program node.
 *
 * This is the primary public API for parsing JavaScript source code.
 *
 * @param source - The source text to parse.
 * @param options - Optional parse configuration.
 * @returns The root Program AST node.
 */
export const parse = (source: string, options?: ParseOptions): AST.Program => {
  const parser = new Parser(source, options);
  return parser.parseProgram();
};

// ============================================================
// Operator helpers
// ============================================================

/**
 * Check if a token type is an assignment operator.
 *
 * @param type - The token type to check.
 * @returns True if the token is an assignment operator.
 */
const isAssignmentOperator = (type: number): boolean => {
  return type >= TokenType.Equals && type <= TokenType.QuestionQuestionEquals;
};

/**
 * Get the assignment operator string for a token type.
 *
 * @param type - The token type.
 * @returns The operator string.
 */
const getAssignmentOperator = (type: number): AST.AssignmentOperator => {
  const operators: ReadonlyArray<AST.AssignmentOperator> = [
    '=', '+=', '-=', '*=', '/=', '%=', '**=',
    '&=', '|=', '^=', '<<=', '>>=', '>>>=',
    '&&=', '||=', '??=',
  ];
  return operators[type - TokenType.Equals];
};

/**
 * Get the precedence level of a binary operator token.
 *
 * @param type - The token type.
 * @returns The precedence level (0 if not a binary operator).
 */
const getBinaryPrecedence = (type: number): number => {
  switch (type) {
    case TokenType.PipePipe: return 2;
    case TokenType.AmpersandAmpersand: return 3;
    case TokenType.QuestionQuestion: return 2;
    case TokenType.Pipe: return 4;
    case TokenType.Caret: return 5;
    case TokenType.Ampersand: return 6;
    case TokenType.EqualsEquals:
    case TokenType.ExclamationEquals:
    case TokenType.EqualsEqualsEquals:
    case TokenType.ExclamationEqualsEquals: return 7;
    case TokenType.LessThan:
    case TokenType.GreaterThan:
    case TokenType.LessThanEquals:
    case TokenType.GreaterThanEquals:
    case TokenType.Instanceof:
    case TokenType.In: return 8;
    case TokenType.LeftShift:
    case TokenType.RightShift:
    case TokenType.UnsignedRightShift: return 9;
    case TokenType.Plus:
    case TokenType.Minus: return 10;
    case TokenType.Star:
    case TokenType.Slash:
    case TokenType.Percent: return 11;
    case TokenType.StarStar: return 12;
    default: return 0;
  }
};

/**
 * Check if a token type is a logical operator.
 *
 * @param type - The token type.
 * @returns True if logical operator (||, &&, ??).
 */
const isLogicalOperator = (type: number): boolean => {
  return type === TokenType.PipePipe ||
         type === TokenType.AmpersandAmpersand ||
         type === TokenType.QuestionQuestion;
};

/**
 * Get the logical operator string for a token type.
 *
 * @param type - The token type.
 * @returns The operator string.
 */
const getLogicalOperator = (type: number): AST.LogicalOperator => {
  switch (type) {
    case TokenType.PipePipe: return '||';
    case TokenType.AmpersandAmpersand: return '&&';
    case TokenType.QuestionQuestion: return '??';
    default: return '||';
  }
};

/**
 * Get the binary operator string for a token type.
 *
 * @param type - The token type.
 * @returns The operator string.
 */
const getBinaryOperator = (type: number): AST.BinaryOperator => {
  switch (type) {
    case TokenType.Plus: return '+';
    case TokenType.Minus: return '-';
    case TokenType.Star: return '*';
    case TokenType.Slash: return '/';
    case TokenType.Percent: return '%';
    case TokenType.StarStar: return '**';
    case TokenType.Ampersand: return '&';
    case TokenType.Pipe: return '|';
    case TokenType.Caret: return '^';
    case TokenType.LeftShift: return '<<';
    case TokenType.RightShift: return '>>';
    case TokenType.UnsignedRightShift: return '>>>';
    case TokenType.EqualsEquals: return '==';
    case TokenType.ExclamationEquals: return '!=';
    case TokenType.EqualsEqualsEquals: return '===';
    case TokenType.ExclamationEqualsEquals: return '!==';
    case TokenType.LessThan: return '<';
    case TokenType.GreaterThan: return '>';
    case TokenType.LessThanEquals: return '<=';
    case TokenType.GreaterThanEquals: return '>=';
    case TokenType.In: return 'in';
    case TokenType.Instanceof: return 'instanceof';
    default: return '+';
  }
};

/**
 * Check if a token type is a unary prefix operator.
 *
 * @param type - The token type.
 * @returns True if it's a unary prefix operator.
 */
const isUnaryOperator = (type: number): boolean => {
  return type === TokenType.Minus ||
         type === TokenType.Plus ||
         type === TokenType.Exclamation ||
         type === TokenType.Tilde ||
         type === TokenType.Typeof ||
         type === TokenType.Void ||
         type === TokenType.Delete;
};

/**
 * Get the unary operator string for a token type.
 *
 * @param type - The token type.
 * @returns The operator string.
 */
const getUnaryOperator = (type: number): AST.UnaryOperator => {
  switch (type) {
    case TokenType.Minus: return '-';
    case TokenType.Plus: return '+';
    case TokenType.Exclamation: return '!';
    case TokenType.Tilde: return '~';
    case TokenType.Typeof: return 'typeof';
    case TokenType.Void: return 'void';
    case TokenType.Delete: return 'delete';
    default: return '-';
  }
};
