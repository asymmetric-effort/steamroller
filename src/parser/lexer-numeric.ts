/**
 * Numeric literal scanner for the Steamroller lexer.
 *
 * Scans all JavaScript numeric literal forms from source text at a given
 * position: decimal, hex, octal, binary, BigInt, numeric separators,
 * exponential notation, and legacy octal.
 *
 * @module parser/lexer-numeric
 */

import type { Token } from './token.js';
import { TokenType } from './token-types.js';
import { createToken } from './token.js';

/**
 * Result of scanning a numeric literal from source text.
 */
export interface ScanResult {
  /** The produced token (NumericLiteral or BigIntLiteral). */
  readonly token: Token;
  /** Byte offset immediately after the last character of the token. */
  readonly end: number;
}

/**
 * Returns true if the character code represents an ASCII decimal digit (0-9).
 */
const isDecimalDigit = (code: number): boolean =>
  code >= 0x30 && code <= 0x39; /* '0'..'9' */

/**
 * Returns true if the character code represents an ASCII hex digit (0-9, a-f, A-F).
 */
const isHexDigit = (code: number): boolean =>
  (code >= 0x30 && code <= 0x39) ||
  (code >= 0x41 && code <= 0x46) ||
  (code >= 0x61 && code <= 0x66);

/**
 * Returns true if the character code represents an ASCII octal digit (0-7).
 */
const isOctalDigit = (code: number): boolean =>
  code >= 0x30 && code <= 0x37; /* '0'..'7' */

/**
 * Returns true if the character code represents an ASCII binary digit (0 or 1).
 */
const isBinaryDigit = (code: number): boolean =>
  code === 0x30 || code === 0x31; /* '0' or '1' */

/**
 * Validates numeric separator (`_`) placement within a digit sequence.
 * Throws if the separator appears at the start, end, or consecutively.
 */
const validateSeparators = (raw: string, digitsStart: number, digitsEnd: number): void => {
  for (let i = digitsStart; i < digitsEnd; i++) {
    if (raw.charCodeAt(i) === 0x5f) {
      /* underscore */
      if (i === digitsStart) {
        throw new SyntaxError('Numeric separator cannot appear at the start of a number');
      }
      if (i === digitsEnd - 1) {
        throw new SyntaxError('Numeric separator cannot appear at the end of a number');
      }
      if (raw.charCodeAt(i + 1) === 0x5f) {
        throw new SyntaxError('Numeric separator must not be consecutive');
      }
    }
  }
};

/**
 * Scans digits of a given radix, allowing numeric separators (`_`).
 * Returns the position after the last consumed character.
 */
const scanDigits = (
  source: string,
  pos: number,
  predicate: (code: number) => boolean,
): number => {
  const start = pos;
  while (pos < source.length) {
    const code = source.charCodeAt(pos);
    if (predicate(code)) {
      pos++;
    } else if (code === 0x5f) {
      /* underscore */
      pos++;
    } else {
      break;
    }
  }
  if (pos === start) {
    throw new SyntaxError('Expected digit after numeric prefix');
  }
  validateSeparators(source, start, pos);
  return pos;
};

/**
 * Scan a numeric literal starting at `start` in `source`.
 *
 * @param source - The full source text.
 * @param start  - The byte offset of the first character of the numeric literal.
 * @param strict - Whether strict mode is active (affects legacy octal).
 * @returns A {@link ScanResult} with the token and the position after it.
 * @throws {SyntaxError} On invalid numeric literals.
 */
export const scanNumericLiteral = (
  source: string,
  start: number,
  strict: boolean,
): ScanResult => {
  let pos = start;
  const first = source.charCodeAt(pos);

  /* ---- Leading dot: .5 style ---- */
  if (first === 0x2e) {
    /* '.' */
    return scanDecimalAfterDot(source, start, pos, strict);
  }

  /* ---- 0x, 0o, 0b, legacy octal, or plain 0 ---- */
  if (first === 0x30) {
    /* '0' */
    const next = pos + 1 < source.length ? source.charCodeAt(pos + 1) : -1;

    /* Hex */
    if (next === 0x78 || next === 0x58) {
      /* 'x' or 'X' */
      pos += 2;
      pos = scanDigits(source, pos, isHexDigit);
      return finishInteger(source, start, pos, 16, strict);
    }

    /* Octal (ES6) */
    if (next === 0x6f || next === 0x4f) {
      /* 'o' or 'O' */
      pos += 2;
      pos = scanDigits(source, pos, isOctalDigit);
      return finishInteger(source, start, pos, 8, strict);
    }

    /* Binary */
    if (next === 0x62 || next === 0x42) {
      /* 'b' or 'B' */
      pos += 2;
      pos = scanDigits(source, pos, isBinaryDigit);
      return finishInteger(source, start, pos, 2, strict);
    }

    /* Legacy octal: 0 followed by octal digit (no prefix) */
    if (next >= 0x30 && next <= 0x37) {
      /* '0'..'7' */
      if (strict) {
        throw new SyntaxError('Legacy octal literals are not allowed in strict mode');
      }
      pos++;
      while (pos < source.length && isOctalDigit(source.charCodeAt(pos))) {
        pos++;
      }
      const raw = source.slice(start, pos);
      const value = parseInt(raw, 8);
      const token = createToken(TokenType.NumericLiteral, start, pos, value, raw);
      return Object.freeze({ token, end: pos });
    }

    /* Just 0, possibly followed by dot, exponent, bigint, or nothing */
    pos++;
  } else {
    /* ---- Decimal integer part ---- */
    pos = scanDigits(source, pos, isDecimalDigit);
  }

  /* ---- Fractional part ---- */
  if (pos < source.length && source.charCodeAt(pos) === 0x2e) {
    /* '.' */
    pos++;
    if (pos < source.length && isDecimalDigit(source.charCodeAt(pos))) {
      pos = scanDigits(source, pos, isDecimalDigit);
    }
    /* Now scan optional exponent */
    pos = scanOptionalExponent(source, pos);
    const raw = source.slice(start, pos);
    const value = parseFloat(raw.replace(/_/g, ''));
    const token = createToken(TokenType.NumericLiteral, start, pos, value, raw);
    return Object.freeze({ token, end: pos });
  }

  /* ---- Exponent ---- */
  const posAfterExp = scanOptionalExponent(source, pos);
  if (posAfterExp !== pos) {
    pos = posAfterExp;
    const raw = source.slice(start, pos);
    const value = parseFloat(raw.replace(/_/g, ''));
    const token = createToken(TokenType.NumericLiteral, start, pos, value, raw);
    return Object.freeze({ token, end: pos });
  }

  /* ---- BigInt (decimal only here, hex/oct/bin handled above) ---- */
  if (pos < source.length && source.charCodeAt(pos) === 0x6e) {
    /* 'n' */
    const raw = source.slice(start, pos + 1);
    const digitStr = source.slice(start, pos).replace(/_/g, '');
    const value = BigInt(digitStr);
    pos++;
    const token = createToken(TokenType.BigIntLiteral, start, pos, value, raw);
    return Object.freeze({ token, end: pos });
  }

  /* ---- Plain decimal integer ---- */
  const raw = source.slice(start, pos);
  const value = parseFloat(raw.replace(/_/g, ''));
  const token = createToken(TokenType.NumericLiteral, start, pos, value, raw);
  return Object.freeze({ token, end: pos });
};

/**
 * Scans the fractional and optional exponent part after a leading dot.
 */
const scanDecimalAfterDot = (
  source: string,
  start: number,
  dotPos: number,
  _strict: boolean,
): ScanResult => {
  let pos = dotPos + 1;
  pos = scanDigits(source, pos, isDecimalDigit);
  pos = scanOptionalExponent(source, pos);
  const raw = source.slice(start, pos);
  const value = parseFloat(raw.replace(/_/g, ''));
  const token = createToken(TokenType.NumericLiteral, start, pos, value, raw);
  return Object.freeze({ token, end: pos });
};

/**
 * Scans an optional exponent part (e/E followed by optional +/- and digits).
 * Returns the position after the exponent, or the original position if none.
 */
const scanOptionalExponent = (source: string, pos: number): number => {
  if (pos >= source.length) {
    return pos;
  }
  const code = source.charCodeAt(pos);
  if (code !== 0x65 && code !== 0x45) {
    /* 'e' or 'E' */
    return pos;
  }
  let next = pos + 1;
  if (next < source.length) {
    const sign = source.charCodeAt(next);
    if (sign === 0x2b || sign === 0x2d) {
      /* '+' or '-' */
      next++;
    }
  }
  next = scanDigits(source, next, isDecimalDigit);
  return next;
};

/**
 * Finishes an integer literal (hex, octal, binary) and checks for BigInt suffix.
 */
const finishInteger = (
  source: string,
  start: number,
  pos: number,
  radix: number,
  _strict: boolean,
): ScanResult => {
  /* BigInt suffix */
  if (pos < source.length && source.charCodeAt(pos) === 0x6e) {
    /* 'n' */
    const raw = source.slice(start, pos + 1);
    /* Strip prefix (0x, 0o, 0b) and separators for BigInt parsing */
    const digitStr = source.slice(start, pos).replace(/_/g, '');
    const value = BigInt(digitStr);
    pos++;
    const token = createToken(TokenType.BigIntLiteral, start, pos, value, raw);
    return Object.freeze({ token, end: pos });
  }

  const raw = source.slice(start, pos);
  const digitStr = raw.slice(2).replace(/_/g, '');
  const value = parseInt(digitStr, radix);
  const token = createToken(TokenType.NumericLiteral, start, pos, value, raw);
  return Object.freeze({ token, end: pos });
};
