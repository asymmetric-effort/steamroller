/**
 * Core Parser class for the Steamroller JavaScript parser.
 *
 * Consumes a token stream from the Lexer and produces an ESTree-compatible
 * AST. Currently implements Program node with module/script source type
 * selection. Statement parsing will be expanded by subsequent issues.
 *
 * @module parser/parser
 */

import type * as AST from '../ast/types.js';
import { Lexer } from './lexer.js';
import { TokenType } from './token-types.js';
import { tokenTypeName } from './token-types.js';
import { parseExpression } from './expressions.js';

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
export class Parser {
  /** The lexer producing the token stream. */
  private lexer: Lexer;
  /** Whether parsing as module or script. */
  private sourceType: 'module' | 'script';

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
   * Parse a single statement or module declaration.
   *
   * Handles empty statements and expression statements. Full statement
   * parsing (control flow, declarations) will be implemented by issues
   * #19 and #22.
   *
   * @returns The parsed statement or module declaration AST node.
   * @throws {SyntaxError} For unrecognized tokens (statement parsing not
   *   yet implemented).
   */
  parseStatement(): AST.Statement | AST.ModuleDeclaration {
    const token = this.lexer.token;

    // Handle empty statements (bare semicolons)
    if (token.type === TokenType.Semicolon) {
      this.lexer.next();
      return Object.freeze({
        type: 'EmptyStatement' as const,
        start: token.start,
        end: token.end,
      });
    }

    // Expression statement (fallback for expressions)
    return this.parseExpressionStatement();
  }

  /**
   * Parse an expression statement.
   *
   * Parses an expression followed by an optional semicolon.
   *
   * @returns An ExpressionStatement AST node.
   */
  private parseExpressionStatement(): AST.ExpressionStatement {
    const expression = parseExpression(this.lexer);
    const start = expression.start;

    // Consume optional semicolon
    let end = expression.end;
    if (this.lexer.is(TokenType.Semicolon)) {
      const semi = this.lexer.next();
      end = semi.end;
    }

    return Object.freeze({
      type: 'ExpressionStatement' as const,
      start,
      end,
      expression,
    });
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
