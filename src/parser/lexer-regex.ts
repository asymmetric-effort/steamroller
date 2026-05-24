/**
 * Regular expression literal tokenization for the Steamroller lexer.
 *
 * Handles scanning regex patterns with flag validation, character class
 * handling, and context-dependent `/` disambiguation (regex vs division).
 *
 * @module parser/lexer-regex
 */

import type { Token } from './token.js';
import { TokenType } from './token-types.js';
import { createToken } from './token.js';

/**
 * Result of scanning a regex literal from source.
 */
export interface ScanResult {
  /** The scanned regex token. */
  readonly token: Token;
  /** The byte offset past the last character of the token (exclusive). */
  readonly end: number;
}

/** Set of valid ES2024 regex flag characters. */
const VALID_FLAGS = new Set(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y']);

/**
 * Token types after which `/` is the division operator (not a regex start).
 *
 * These are token types that can end an expression, meaning a subsequent
 * `/` would be interpreted as division.
 */
const DIVISION_PREDECESSORS: ReadonlySet<number> = new Set([
  TokenType.Identifier,
  TokenType.NumericLiteral,
  TokenType.StringLiteral,
  TokenType.RegExpLiteral,
  TokenType.TemplateLiteral,
  TokenType.TemplateNoSub,
  TokenType.BigIntLiteral,
  TokenType.RightParen,
  TokenType.RightBracket,
  TokenType.RightBrace,
  TokenType.PlusPlus,
  TokenType.MinusMinus,
  TokenType.True,
  TokenType.False,
  TokenType.Null,
  TokenType.This,
  TokenType.Super,
]);

/**
 * Determine whether `/` at the current position starts a regex literal
 * or is a division operator.
 *
 * Uses the previous token type to disambiguate: after expression-producing
 * tokens, `/` is division; otherwise, `/` starts a regex.
 *
 * @param previousTokenType - The numeric type of the token preceding `/`.
 *   Pass -1 (or any non-expression type) when there is no preceding token
 *   (start of input).
 * @returns `true` if `/` starts a regex literal, `false` if division.
 */
export const isRegExpStart = (previousTokenType: number): boolean => {
  return !DIVISION_PREDECESSORS.has(previousTokenType);
};

/**
 * Validate regex flags string for duplicates and mutual exclusivity.
 *
 * @param flags - The flags string to validate.
 * @param start - Source offset of the regex start (for error messages).
 * @throws {SyntaxError} On invalid, duplicate, or conflicting flags.
 */
const validateFlags = (flags: string, start: number): void => {
  const seen = new Set<string>();
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (!VALID_FLAGS.has(flag)) {
      throw new SyntaxError(
        `Invalid regular expression flag '${flag}' at position ${start}`,
      );
    }
    if (seen.has(flag)) {
      throw new SyntaxError(
        `Duplicate regular expression flag '${flag}' at position ${start}`,
      );
    }
    seen.add(flag);
  }
  if (seen.has('u') && seen.has('v')) {
    throw new SyntaxError(
      `Regular expression flags 'u' and 'v' are mutually exclusive at position ${start}`,
    );
  }
};

/**
 * Scan a regular expression literal starting from the opening `/`.
 *
 * Handles character classes (`[...]`) where `/` is not a pattern terminator,
 * backslash escapes, and post-pattern flag characters.
 *
 * @param source - The full source string.
 * @param start  - The byte offset of the opening `/` character.
 * @returns A {@link ScanResult} with the token and end offset.
 * @throws {SyntaxError} On unterminated regex or invalid flags.
 */
export const scanRegExpLiteral = (
  source: string,
  start: number,
): ScanResult => {
  const length = source.length;
  let pos = start + 1; // skip opening /
  let inCharClass = false;

  // Handle empty regex special case: // is a line comment, not a regex.
  // An empty regex literal is not valid in JS (it would be a comment).
  if (pos < length && source[pos] === '/') {
    throw new SyntaxError(
      `Empty regular expression pattern at position ${start}`,
    );
  }

  // Scan the pattern body
  while (pos < length) {
    const ch = source[pos];

    if (ch === '\\') {
      // Escape: skip the next character
      pos += 1;
      if (pos >= length) {
        throw new SyntaxError(
          `Unterminated regular expression at position ${start}`,
        );
      }
      pos += 1;
      continue;
    }

    if (inCharClass) {
      if (ch === ']') {
        inCharClass = false;
      }
      pos += 1;
      continue;
    }

    if (ch === '[') {
      inCharClass = true;
      pos += 1;
      continue;
    }

    if (ch === '/') {
      // End of pattern
      break;
    }

    // Newline terminates regex (unterminated)
    if (ch === '\n' || ch === '\r') {
      throw new SyntaxError(
        `Unterminated regular expression at position ${start}`,
      );
    }

    pos += 1;
  }

  if (pos >= length) {
    throw new SyntaxError(
      `Unterminated regular expression at position ${start}`,
    );
  }

  // pos is at closing /
  const patternEnd = pos;
  pos += 1; // skip closing /

  // Scan flags
  const flagStart = pos;
  while (pos < length && /[a-zA-Z]/.test(source[pos])) {
    pos += 1;
  }

  const pattern = source.slice(start + 1, patternEnd);
  const flags = source.slice(flagStart, pos);

  validateFlags(flags, start);

  const raw = source.slice(start, pos);

  // Attempt to construct a native RegExp. If the runtime does not support
  // certain flags (e.g. 'v' on older engines), fall back to storing the
  // raw source string as the token value. The lexer validates flag syntax
  // independently; runtime support is a separate concern.
  let value: string | RegExp;
  try {
    value = new RegExp(pattern, flags);
  } catch {
    value = raw;
  }

  const token = createToken(TokenType.RegExpLiteral, start, pos, value, raw);

  return Object.freeze({ token, end: pos });
};
