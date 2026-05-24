/**
 * Enhanced error handling and diagnostics for the Steamroller parser.
 *
 * Provides structured parse errors with source locations, code frames,
 * and a recoverable parsing mode that collects multiple errors while
 * producing a partial AST.
 *
 * @module parser/diagnostics
 */

import { generateCodeFrame } from "../utils/errors.js";
import { TokenType } from "./token-types.js";
import type { Lexer } from "./lexer.js";

/**
 * Source location with line and column information.
 */
export interface SourceLoc {
  readonly line: number;
  readonly column: number;
}

/**
 * A structured parse error with position, location, and code frame.
 */
export interface ParseError {
  readonly message: string;
  readonly pos: number;
  readonly loc: SourceLoc;
  readonly frame: string;
}

/**
 * Compute line and column from a byte offset in a source string.
 *
 * Uses an iterative scan of newline characters.
 *
 * @param source - The full source text.
 * @param pos - The byte offset (0-based).
 * @returns A SourceLoc with 1-based line and 0-based column.
 */
export const positionToLineColumn = (
  source: string,
  pos: number,
): SourceLoc => {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < pos && i < source.length; i++) {
    if (source.charCodeAt(i) === 0x0a) {
      line++;
      lastNewline = i;
    }
  }
  const column = pos - lastNewline - 1;
  return { line, column };
};

/**
 * Create a structured SyntaxError with enhanced diagnostics.
 *
 * The returned error includes:
 * - A message with line:column info appended.
 * - A `pos` property with the byte offset.
 * - A `loc` property with line/column.
 * - A `frame` property with a code frame.
 *
 * @param message - The base error message.
 * @param pos - The byte offset in the source where the error occurred.
 * @param source - The full source text for generating a code frame.
 * @returns A SyntaxError augmented with diagnostic metadata.
 */
export const createParseError = (
  message: string,
  pos: number,
  source: string,
): SyntaxError & ParseError => {
  const loc = positionToLineColumn(source, pos);
  const frame = generateCodeFrame(source, loc.line, loc.column);
  const fullMessage = `${message} (${loc.line}:${loc.column})`;

  const error = new SyntaxError(fullMessage) as SyntaxError & ParseError;
  Object.defineProperty(error, "pos", {
    value: pos,
    enumerable: true,
    writable: false,
    configurable: true,
  });
  Object.defineProperty(error, "loc", {
    value: loc,
    enumerable: true,
    writable: false,
    configurable: true,
  });
  Object.defineProperty(error, "frame", {
    value: frame,
    enumerable: true,
    writable: false,
    configurable: true,
  });

  return error;
};

/** Token types that represent statement boundaries for error recovery. */
const STATEMENT_BOUNDARY_TYPES: ReadonlyArray<number> = Object.freeze([
  TokenType.Semicolon,
  TokenType.RightBrace,
  TokenType.Function,
  TokenType.Class,
  TokenType.Const,
  TokenType.Let,
  TokenType.Var,
  TokenType.If,
  TokenType.For,
  TokenType.While,
  TokenType.Do,
  TokenType.Return,
  TokenType.Throw,
  TokenType.Try,
  TokenType.Switch,
  TokenType.Import,
  TokenType.Export,
]);

/**
 * Skip tokens in the lexer until a statement boundary is found.
 *
 * Used for error recovery: after encountering a parse error, the parser
 * skips tokens until it finds a likely statement start or delimiter,
 * then continues parsing from there.
 *
 * @param lexer - The lexer instance to advance.
 */
export const skipToStatementBoundary = (lexer: Lexer): void => {
  while (!lexer.is(TokenType.EOF)) {
    const tokenType = lexer.token.type;

    // If we find a semicolon, consume it and stop
    if (tokenType === TokenType.Semicolon) {
      lexer.next();
      return;
    }

    // If we find a right brace, stop without consuming (may be block end)
    if (tokenType === TokenType.RightBrace) {
      return;
    }

    // If we hit a keyword that starts a statement, stop without consuming
    for (let i = 2; i < STATEMENT_BOUNDARY_TYPES.length; i++) {
      if (tokenType === STATEMENT_BOUNDARY_TYPES[i]) {
        return;
      }
    }

    lexer.next();
  }
};

/**
 * Collector for recoverable parse errors.
 *
 * Accumulates errors without throwing, allowing the parser to continue
 * and report multiple issues from a single parse pass.
 */
export class ErrorCollector {
  /** The list of collected errors. */
  readonly errors: Array<ParseError> = [];

  /**
   * Record an error without throwing.
   *
   * @param message - The error message.
   * @param pos - The byte offset.
   * @param source - The full source text.
   */
  addError(message: string, pos: number, source: string): void {
    const loc = positionToLineColumn(source, pos);
    const frame = generateCodeFrame(source, loc.line, loc.column);
    this.errors.push({
      message: `${message} (${loc.line}:${loc.column})`,
      pos,
      loc,
      frame,
    });
  }

  /**
   * Whether any errors have been collected.
   */
  get hasErrors(): boolean {
    return this.errors.length > 0;
  }
}
