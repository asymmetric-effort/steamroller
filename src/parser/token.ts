/**
 * Token interface for the Steamroller lexer.
 *
 * Represents a single lexical token produced by the scanner, with
 * positional information and the parsed value.
 *
 * @module parser/token
 */

/**
 * A single lexical token produced by the lexer.
 *
 * All properties are readonly to enforce immutability after creation.
 */
export interface Token {
  /** The numeric token type (see {@link TokenType}). */
  readonly type: number;
  /** Byte offset of the first character (inclusive). */
  readonly start: number;
  /** Byte offset past the last character (exclusive). */
  readonly end: number;
  /** The parsed semantic value of the token. */
  readonly value: string | number | boolean | null | RegExp | bigint;
  /** The original source text of the token. */
  readonly raw: string;
}

/**
 * Create a new Token object.
 *
 * @param type  - The numeric token type.
 * @param start - Start offset in the source.
 * @param end   - End offset in the source.
 * @param value - The parsed value.
 * @param raw   - The raw source text.
 * @returns A frozen Token object.
 */
export const createToken = (
  type: number,
  start: number,
  end: number,
  value: string | number | boolean | null | RegExp | bigint,
  raw: string,
): Token => {
  return Object.freeze({ type, start, end, value, raw });
};
