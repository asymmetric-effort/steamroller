/**
 * Whitespace, comment, and ASI handling for the Steamroller lexer.
 *
 * Provides Unicode-aware whitespace/line-terminator detection, single-line
 * and block comment scanning, hashbang support, PURE annotation detection,
 * and automatic semicolon insertion (ASI) logic.
 *
 * @module parser/lexer-whitespace
 */

import { TokenType } from './token-types.js';

/**
 * Check if a character code is whitespace (Unicode-aware).
 *
 * Matches ECMAScript WhiteSpace: U+0009 (TAB), U+000B (VT), U+000C (FF),
 * U+0020 (SP), U+00A0 (NBSP), U+FEFF (BOM), and Unicode category Zs.
 *
 * Line terminators are NOT whitespace in this classification.
 *
 * @param charCode - The Unicode code point to test.
 * @returns True if the code point is a whitespace character.
 */
export const isWhitespace = (charCode: number): boolean => {
  if (charCode === 0x20 || charCode === 0x09) {
    return true;
  }
  if (charCode === 0x0B || charCode === 0x0C) {
    return true;
  }
  if (charCode === 0xA0 || charCode === 0xFEFF) {
    return true;
  }
  // Unicode category Zs (space separators)
  if (
    charCode === 0x1680 ||
    (charCode >= 0x2000 && charCode <= 0x200A) ||
    charCode === 0x202F ||
    charCode === 0x205F ||
    charCode === 0x3000
  ) {
    return true;
  }
  return false;
};

/**
 * Check if a character code is a line terminator.
 *
 * Matches ECMAScript LineTerminator: U+000A (LF), U+000D (CR),
 * U+2028 (LS), U+2029 (PS).
 *
 * @param charCode - The Unicode code point to test.
 * @returns True if the code point is a line terminator.
 */
export const isLineTerminator = (charCode: number): boolean => {
  return (
    charCode === 0x0A ||
    charCode === 0x0D ||
    charCode === 0x2028 ||
    charCode === 0x2029
  );
};

/**
 * Result of skipping whitespace in source text.
 */
export interface SkipWhitespaceResult {
  /** Position after all skipped whitespace. */
  readonly end: number;
  /** Whether a line terminator was encountered. */
  readonly hadLineTerminator: boolean;
}

/**
 * Skip whitespace from a position, reporting line terminator presence.
 *
 * Iteratively advances past whitespace and line terminators. Treats
 * CR+LF (U+000D U+000A) as a single line terminator.
 *
 * @param source - The source text.
 * @param pos    - The starting position.
 * @returns The new position and whether a line terminator was crossed.
 */
export const skipWhitespace = (source: string, pos: number): SkipWhitespaceResult => {
  const len = source.length;
  let hadLineTerminator = false;
  let i = pos;

  while (i < len) {
    const ch = source.charCodeAt(i);
    if (isWhitespace(ch)) {
      i++;
    } else if (isLineTerminator(ch)) {
      hadLineTerminator = true;
      // Handle CRLF as single terminator
      if (ch === 0x0D && i + 1 < len && source.charCodeAt(i + 1) === 0x0A) {
        i += 2;
      } else {
        i++;
      }
    } else {
      break;
    }
  }

  return Object.freeze({ end: i, hadLineTerminator });
};

/**
 * Result of scanning a single-line comment.
 */
export interface LineCommentResult {
  /** Position after the comment (at the line terminator or EOF). */
  readonly end: number;
  /** The comment text (excluding the leading //). */
  readonly value: string;
}

/**
 * Scan a single-line comment starting at the given position.
 *
 * The `start` parameter points to the first `/` of the `//` sequence.
 * Advances to the next line terminator or end of source.
 *
 * @param source - The source text.
 * @param start  - Position of the first `/` character.
 * @returns The end position and comment text.
 */
export const scanLineComment = (source: string, start: number): LineCommentResult => {
  const len = source.length;
  // Skip past the //
  let i = start + 2;

  while (i < len) {
    const ch = source.charCodeAt(i);
    if (isLineTerminator(ch)) {
      break;
    }
    i++;
  }

  const value = source.slice(start + 2, i);
  return Object.freeze({ end: i, value });
};

/**
 * Result of scanning a block comment.
 */
export interface BlockCommentResult {
  /** Position after the closing * /. */
  readonly end: number;
  /** The comment text (excluding the delimiters). */
  readonly value: string;
  /** Whether the comment spans multiple lines. */
  readonly hadLineTerminator: boolean;
}

/**
 * Scan a block comment starting at the given position.
 *
 * The `start` parameter points to the `/` of the opening `/*` sequence.
 * Scans until the closing `* /` or throws if unterminated.
 *
 * @param source - The source text.
 * @param start  - Position of the `/` character.
 * @returns The end position, comment text, and line terminator flag.
 * @throws Error if the block comment is unterminated.
 */
export const scanBlockComment = (source: string, start: number): BlockCommentResult => {
  const len = source.length;
  // Skip past /*
  let i = start + 2;
  let hadLineTerminator = false;

  while (i < len) {
    const ch = source.charCodeAt(i);
    if (ch === 0x2A /* * */ && i + 1 < len && source.charCodeAt(i + 1) === 0x2F /* / */) {
      const value = source.slice(start + 2, i);
      return Object.freeze({ end: i + 2, value, hadLineTerminator });
    }
    if (isLineTerminator(ch)) {
      hadLineTerminator = true;
      // Handle CRLF as single terminator
      if (ch === 0x0D && i + 1 < len && source.charCodeAt(i + 1) === 0x0A) {
        i += 2;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  throw new Error(`Unterminated block comment at position ${start}`);
};

/**
 * Result of scanning a hashbang line.
 */
export interface HashbangResult {
  /** Position after the hashbang line (at the line terminator or EOF). */
  readonly end: number;
  /** The hashbang text including the #! prefix. */
  readonly value: string;
}

/**
 * Scan a hashbang (#!) comment at the very start of source.
 *
 * A hashbang is only valid at position 0. Returns null if the source
 * does not start with `#!`.
 *
 * @param source - The source text.
 * @returns The hashbang result, or null if none present.
 */
export const scanHashbang = (source: string): HashbangResult | null => {
  if (source.length < 2 || source.charCodeAt(0) !== 0x23 /* # */ || source.charCodeAt(1) !== 0x21 /* ! */) {
    return null;
  }

  const len = source.length;
  let i = 2;

  while (i < len) {
    const ch = source.charCodeAt(i);
    if (isLineTerminator(ch)) {
      break;
    }
    i++;
  }

  const value = source.slice(0, i);
  return Object.freeze({ end: i, value });
};

/**
 * Recognized PURE annotation strings found in block comments.
 */
export type PureAnnotation = '@__PURE__' | '#__PURE__' | '@__NO_SIDE_EFFECTS__';

/**
 * Check if a block comment contains a PURE annotation.
 *
 * Used by bundlers (webpack, rollup, esbuild) to mark calls as
 * side-effect-free for tree-shaking.
 *
 * @param commentValue - The comment text (without delimiters).
 * @returns The annotation string, or null if none found.
 */
export const getPureAnnotation = (commentValue: string): PureAnnotation | null => {
  const trimmed = commentValue.trim();
  if (trimmed === '@__PURE__' || trimmed === '#__PURE__' || trimmed === '@__NO_SIDE_EFFECTS__') {
    return trimmed as PureAnnotation;
  }
  return null;
};

/**
 * Context needed for automatic semicolon insertion decisions.
 */
export interface AsiContext {
  /** Whether a line terminator preceded the current token. */
  readonly hadLineTerminatorBefore: boolean;
  /** The token type of the current token. */
  readonly currentTokenType: number;
  /** The token type of the previous token. */
  readonly previousTokenType: number;
}

/**
 * Set of token types that begin restricted productions.
 *
 * In these productions, a line terminator between the keyword and its
 * operand triggers ASI (e.g., `return\nvalue` becomes `return; value`).
 */
const RESTRICTED_TOKENS = new Set([
  TokenType.Return,
  TokenType.Throw,
  TokenType.Break,
  TokenType.Continue,
  TokenType.Yield,
]);

/**
 * Check if a token type starts a restricted production.
 *
 * @param tokenType - The numeric token type to check.
 * @returns True if the token type is a restricted production keyword.
 */
export const isRestrictedProduction = (tokenType: number): boolean => {
  return RESTRICTED_TOKENS.has(tokenType);
};

/**
 * Determine if ASI should insert a semicolon.
 *
 * Implements the ECMAScript ASI rules:
 * 1. Current token is EOF.
 * 2. Current token is `}` (closing brace).
 * 3. A line terminator appears before the current token, and the
 *    grammar cannot parse the current token as a continuation.
 *
 * @param context - The ASI context with token and line terminator info.
 * @returns True if a semicolon should be automatically inserted.
 */
export const shouldInsertSemicolon = (context: AsiContext): boolean => {
  // Rule 3: EOF always triggers ASI
  if (context.currentTokenType === TokenType.EOF) {
    return true;
  }

  // Rule 2: closing brace with a line terminator before it
  if (context.currentTokenType === TokenType.RightBrace && context.hadLineTerminatorBefore) {
    return true;
  }

  // Rule 1: line terminator before current token
  if (context.hadLineTerminatorBefore) {
    return true;
  }

  return false;
};
