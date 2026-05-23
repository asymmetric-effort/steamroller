/**
 * String and template literal scanning for the Steamroller lexer.
 *
 * Handles tokenization of single-quoted strings, double-quoted strings,
 * and template literals (including head/middle/tail segmentation for
 * template substitutions). Supports all ECMAScript escape sequences.
 *
 * @module parser/lexer-string
 */

import type { Token } from "./token.js";
import { createToken } from "./token.js";
import { TokenType } from "./token-types.js";

/**
 * Result of scanning a string or template literal.
 */
export interface ScanResult {
  /** The produced token. */
  readonly token: Token;
  /** The position after the last consumed character. */
  readonly end: number;
}

/**
 * Result of decoding a single escape sequence.
 */
export interface EscapeResult {
  /** The decoded character(s). */
  readonly char: string;
  /** Number of source characters consumed (including the backslash). */
  readonly length: number;
}

/**
 * Check whether a character code is a hex digit (0-9, a-f, A-F).
 *
 * @param code - The character code to check.
 * @returns True if the code is a valid hex digit.
 */
const isHexDigit = (code: number): boolean => {
  return (
    (code >= 0x30 && code <= 0x39) || // 0-9
    (code >= 0x41 && code <= 0x46) || // A-F
    (code >= 0x61 && code <= 0x66)    // a-f
  );
};

/**
 * Check whether a character code is an octal digit (0-7).
 *
 * @param code - The character code to check.
 * @returns True if the code is a valid octal digit.
 */
const isOctalDigit = (code: number): boolean => {
  return code >= 0x30 && code <= 0x37;
};

/**
 * Check whether a character is a line terminator.
 *
 * @param code - The character code to check.
 * @returns True if the code is LF, CR, LS, or PS.
 */
const isLineTerminator = (code: number): boolean => {
  return code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029;
};

/**
 * Decode a single escape sequence starting at a backslash.
 *
 * Handles standard escapes (\\n, \\r, \\t, etc.), hex escapes (\\xNN),
 * Unicode escapes (\\uNNNN and \\u{N...}), octal escapes (sloppy mode
 * only), and line continuations.
 *
 * @param source - The full source string.
 * @param pos - Position of the backslash character.
 * @param strict - Whether strict mode is active (rejects octal escapes).
 * @returns The decoded character and the number of source characters consumed.
 * @throws {SyntaxError} On invalid escape sequences.
 */
export const decodeEscapeSequence = (
  source: string,
  pos: number,
  strict: boolean,
): EscapeResult => {
  const ch = source[pos + 1];

  if (ch === undefined) {
    throw new SyntaxError("Unexpected end of input after backslash");
  }

  const code = source.charCodeAt(pos + 1);

  // Simple single-character escapes
  switch (ch) {
    case "n":
      return { char: "\n", length: 2 };
    case "r":
      return { char: "\r", length: 2 };
    case "t":
      return { char: "\t", length: 2 };
    case "b":
      return { char: "\b", length: 2 };
    case "f":
      return { char: "\f", length: 2 };
    case "v":
      return { char: "\v", length: 2 };
    case "0": {
      // \0 is a null escape, but \00, \01, etc. are octal
      const nextCode = source.charCodeAt(pos + 2);
      if (isOctalDigit(nextCode)) {
        return decodeOctalEscape(source, pos, strict);
      }
      return { char: "\0", length: 2 };
    }
    case "\\":
      return { char: "\\", length: 2 };
    case "'":
      return { char: "'", length: 2 };
    case '"':
      return { char: '"', length: 2 };
    case "`":
      return { char: "`", length: 2 };
    case "$":
      return { char: "$", length: 2 };
    case "x":
      return decodeHexEscape(source, pos);
    case "u":
      return decodeUnicodeEscape(source, pos);
    default:
      break;
  }

  // Line continuation: backslash before line terminator
  if (isLineTerminator(code)) {
    // CR+LF counts as a single line terminator
    if (code === 0x0d && source.charCodeAt(pos + 2) === 0x0a) {
      return { char: "", length: 3 };
    }
    return { char: "", length: 2 };
  }

  // Octal escapes (1-7 starting digit)
  if (isOctalDigit(code)) {
    return decodeOctalEscape(source, pos, strict);
  }

  // In strict mode, \8 and \9 are illegal
  if (strict && (ch === "8" || ch === "9")) {
    throw new SyntaxError(`Invalid escape sequence \\${ch} in strict mode`);
  }

  // Non-escape character: identity escape
  return { char: ch, length: 2 };
};

/**
 * Decode a hex escape sequence (\\xNN).
 *
 * @param source - The full source string.
 * @param pos - Position of the backslash.
 * @returns The decoded character and length consumed.
 * @throws {SyntaxError} If the hex digits are invalid.
 */
const decodeHexEscape = (source: string, pos: number): EscapeResult => {
  const hex = source.slice(pos + 2, pos + 4);
  if (hex.length < 2 || !isHexDigit(hex.charCodeAt(0)) || !isHexDigit(hex.charCodeAt(1))) {
    throw new SyntaxError("Invalid hex escape sequence");
  }
  return { char: String.fromCharCode(parseInt(hex, 16)), length: 4 };
};

/**
 * Decode a Unicode escape sequence (\\uNNNN or \\u{N...}).
 *
 * @param source - The full source string.
 * @param pos - Position of the backslash.
 * @returns The decoded character and length consumed.
 * @throws {SyntaxError} If the Unicode escape is invalid.
 */
const decodeUnicodeEscape = (source: string, pos: number): EscapeResult => {
  if (source[pos + 2] === "{") {
    // \u{N...} code point escape
    let end = pos + 3;
    while (end < source.length && source[end] !== "}") {
      if (!isHexDigit(source.charCodeAt(end))) {
        throw new SyntaxError("Invalid Unicode code point escape");
      }
      end++;
    }
    if (end >= source.length) {
      throw new SyntaxError("Unterminated Unicode code point escape");
    }
    const hexStr = source.slice(pos + 3, end);
    if (hexStr.length === 0) {
      throw new SyntaxError("Invalid Unicode code point escape");
    }
    const codePoint = parseInt(hexStr, 16);
    if (codePoint > 0x10ffff) {
      throw new SyntaxError("Unicode code point out of range");
    }
    return { char: String.fromCodePoint(codePoint), length: end - pos + 1 };
  }

  // \uNNNN fixed-length escape
  const hex = source.slice(pos + 2, pos + 6);
  if (hex.length < 4) {
    throw new SyntaxError("Invalid Unicode escape sequence");
  }
  for (let i = 0; i < 4; i++) {
    if (!isHexDigit(hex.charCodeAt(i))) {
      throw new SyntaxError("Invalid Unicode escape sequence");
    }
  }
  return { char: String.fromCharCode(parseInt(hex, 16)), length: 6 };
};

/**
 * Decode an octal escape sequence (\\0-\\377).
 *
 * @param source - The full source string.
 * @param pos - Position of the backslash.
 * @param strict - Whether strict mode is active.
 * @returns The decoded character and length consumed.
 * @throws {SyntaxError} If octal escapes are used in strict mode.
 */
const decodeOctalEscape = (source: string, pos: number, strict: boolean): EscapeResult => {
  if (strict) {
    throw new SyntaxError("Octal escape sequences are not allowed in strict mode");
  }

  const first = source.charCodeAt(pos + 1) - 0x30;
  let value = first;
  let length = 2;

  // Up to 3 octal digits, but value must be <= 255
  const second = source.charCodeAt(pos + 2);
  if (isOctalDigit(second)) {
    value = value * 8 + (second - 0x30);
    length = 3;

    const third = source.charCodeAt(pos + 3);
    if (isOctalDigit(third) && first <= 3) {
      value = value * 8 + (third - 0x30);
      length = 4;
    }
  }

  return { char: String.fromCharCode(value), length };
};

/**
 * Scan a string literal (single-quoted or double-quoted).
 *
 * The `start` parameter should point to the opening quote character.
 * On success, the returned `end` points past the closing quote.
 *
 * @param source - The full source string.
 * @param start - Position of the opening quote character.
 * @param strict - Whether strict mode is active.
 * @returns The scanned token and end position.
 * @throws {SyntaxError} On unterminated strings or invalid escapes.
 */
export const scanStringLiteral = (
  source: string,
  start: number,
  strict: boolean,
): ScanResult => {
  const quote = source[start];
  const parts: Array<string> = [];
  let pos = start + 1;

  while (pos < source.length) {
    const ch = source[pos];
    const code = source.charCodeAt(pos);

    if (ch === quote) {
      // Found closing quote
      const value = parts.join("");
      const raw = source.slice(start, pos + 1);
      const token = createToken(TokenType.StringLiteral, start, pos + 1, value, raw);
      return { token, end: pos + 1 };
    }

    if (ch === "\\") {
      const escape = decodeEscapeSequence(source, pos, strict);
      parts.push(escape.char);
      pos += escape.length;
      continue;
    }

    // Unescaped line terminators are not allowed in string literals
    if (isLineTerminator(code)) {
      throw new SyntaxError("Unterminated string literal");
    }

    parts.push(ch);
    pos++;
  }

  throw new SyntaxError("Unterminated string literal");
};

/**
 * Scan a template literal or template part.
 *
 * When `isHead` is true, `start` points at the opening backtick.
 * When `isHead` is false, `start` points at the `}` that closes a
 * substitution expression, and scanning continues as a template middle
 * or tail.
 *
 * Returns one of:
 * - `TemplateLiteral` (or `TemplateNoSub`): no substitutions found
 * - `TemplateHead`: opening segment before the first `${`
 * - `TemplateMiddle`: segment between `}` and the next `${`
 * - `TemplateTail`: closing segment after the last `}`
 *
 * @param source - The full source string.
 * @param start - Position of the opening backtick or closing `}`.
 * @param isHead - True if starting from a backtick, false if continuing after `}`.
 * @returns The scanned token and end position.
 * @throws {SyntaxError} On unterminated templates or invalid escapes.
 */
export const scanTemplateLiteral = (
  source: string,
  start: number,
  isHead: boolean,
): ScanResult => {
  const cookedParts: Array<string> = [];
  const rawParts: Array<string> = [];
  let pos = start + 1;

  while (pos < source.length) {
    const ch = source[pos];
    const code = source.charCodeAt(pos);

    // End of template
    if (ch === "`") {
      const cooked = cookedParts.join("");
      const rawContent = source.slice(start + 1, pos);
      const raw = source.slice(start, pos + 1);
      const tokenType = isHead ? TokenType.TemplateNoSub : TokenType.TemplateTail;
      const token = createToken(tokenType, start, pos + 1, cooked, raw);
      return { token, end: pos + 1 };
    }

    // Start of substitution: ${
    if (ch === "$" && source[pos + 1] === "{") {
      const cooked = cookedParts.join("");
      const raw = source.slice(start, pos + 2);
      const tokenType = isHead ? TokenType.TemplateHead : TokenType.TemplateMiddle;
      const token = createToken(tokenType, start, pos + 2, cooked, raw);
      return { token, end: pos + 2 };
    }

    // Escape sequence
    if (ch === "\\") {
      const rawStart = pos;
      const escape = decodeEscapeSequence(source, pos, false);
      rawParts.push(source.slice(rawStart, rawStart + escape.length));
      cookedParts.push(escape.char);
      pos += escape.length;
      continue;
    }

    // Line terminators are allowed in template literals
    // Normalize CR and CRLF to LF
    if (code === 0x0d) {
      if (source.charCodeAt(pos + 1) === 0x0a) {
        cookedParts.push("\n");
        pos += 2;
      } else {
        cookedParts.push("\n");
        pos++;
      }
      continue;
    }

    cookedParts.push(ch);
    pos++;
  }

  throw new SyntaxError("Unterminated template literal");
};
