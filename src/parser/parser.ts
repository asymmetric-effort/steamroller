/**
 * Core Parser class for the Steamroller JavaScript parser.
 *
 * Consumes a token stream from the Lexer and produces an ESTree-compatible
 * AST. Currently implements Program node with module/script source type
 * selection. Statement parsing will be expanded by subsequent issues.
 *
 * @module parser/parser
 */

import type * as AST from "../ast/types.js";
import { Lexer } from "./lexer.js";
import { TokenType } from "./token-types.js";
import { tokenTypeName } from "./token-types.js";
import {
  parseFunctionDeclaration,
  parseClassDeclaration,
  parseImportDeclaration,
  parseExportDeclaration,
} from "./declarations.js";
import type { ParserContext } from "./declarations.js";

/**
 * Options for the parser.
 */
export interface ParseOptions {
  /** Whether to parse as module or script. Defaults to 'module'. */
  readonly sourceType?: "module" | "script";
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
  lexer: Lexer;
  /** Whether parsing as module or script. */
  sourceType: "module" | "script";

  /**
   * Create a new Parser for the given source text.
   *
   * @param source - The source text to parse.
   * @param options - Optional parse configuration.
   */
  constructor(source: string, options?: ParseOptions) {
    const sourceType = options?.sourceType ?? "module";
    const allowHashBang = options?.allowHashBang ?? false;
    const isStrict = sourceType === "module";

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
      type: "Program" as const,
      start,
      end,
      body: Object.freeze(body),
      sourceType: this.sourceType,
    });
  }

  /**
   * Parse a single statement or module declaration.
   *
   * Delegates to specialized parsers for declarations (function, class,
   * import, export). Other statement types will be added by subsequent issues.
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
        type: "EmptyStatement" as const,
        start: token.start,
        end: token.end,
      });
    }

    // Function declaration
    if (token.type === TokenType.Function) {
      return parseFunctionDeclaration(this, false);
    }

    // Async function declaration
    if (token.type === TokenType.Async) {
      const saved = this.lexer.saveState();
      this.lexer.next();
      if (this.lexer.is(TokenType.Function)) {
        return parseFunctionDeclaration(this, true);
      }
      this.lexer.restoreState(saved);
    }

    // Class declaration
    if (token.type === TokenType.Class) {
      return parseClassDeclaration(this);
    }

    // Import declaration (module only)
    if (token.type === TokenType.Import) {
      return parseImportDeclaration(this);
    }

    // Export declaration (module only)
    if (token.type === TokenType.Export) {
      return parseExportDeclaration(this);
    }

    const typeName = tokenTypeName(token.type);
    throw new SyntaxError(
      `Statement parsing not yet implemented for ${typeName} at position ${token.start}`,
    );
  }

  /**
   * Parse a block statement: { ... }
   *
   * @returns The BlockStatement AST node.
   */
  parseBlockStatement(): AST.BlockStatement {
    const start = this.lexer.token.start;
    this.lexer.expect(TokenType.LeftBrace);

    const body: Array<AST.Statement> = [];
    while (
      !this.lexer.is(TokenType.RightBrace) &&
      !this.lexer.is(TokenType.EOF)
    ) {
      const stmt = this.parseStatement() as AST.Statement;
      body.push(stmt);
    }

    const endToken = this.lexer.expect(TokenType.RightBrace);

    return Object.freeze({
      type: "BlockStatement" as const,
      body: Object.freeze(body),
      start,
      end: endToken.end,
    });
  }

  /**
   * Parse an expression (placeholder for full expression parsing).
   *
   * Currently handles identifiers and literals for use by declaration parsers.
   *
   * @returns The Expression AST node.
   */
  parseExpression(): AST.Expression {
    const token = this.lexer.token;

    if (token.type === TokenType.Identifier) {
      this.lexer.next();
      return Object.freeze({
        type: "Identifier" as const,
        name: token.value as string,
        start: token.start,
        end: token.end,
      });
    }

    if (
      token.type === TokenType.NumericLiteral ||
      token.type === TokenType.StringLiteral
    ) {
      this.lexer.next();
      return Object.freeze({
        type: "Literal" as const,
        value: token.value as string | number,
        raw: token.raw,
        start: token.start,
        end: token.end,
      });
    }

    if (token.type === TokenType.True || token.type === TokenType.False) {
      this.lexer.next();
      return Object.freeze({
        type: "Literal" as const,
        value: token.value as boolean,
        raw: token.raw,
        start: token.start,
        end: token.end,
      });
    }

    if (token.type === TokenType.Null) {
      this.lexer.next();
      return Object.freeze({
        type: "Literal" as const,
        value: null,
        raw: token.raw,
        start: token.start,
        end: token.end,
      });
    }

    throw new SyntaxError(
      `Expression parsing not yet implemented for ${tokenTypeName(token.type)} at position ${token.start}`,
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
