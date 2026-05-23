/**
 * Punctuator and operator scanner for the Steamroller lexer.
 *
 * Scans all JavaScript punctuators and operators from source text at a
 * given position using greedy/longest-match semantics: for example,
 * `>>>` is scanned as a single UnsignedRightShift token, not three
 * separate GreaterThan tokens.
 *
 * @module parser/lexer-punctuator
 */

import type { Token } from './token.js';
import { TokenType } from './token-types.js';
import { createToken } from './token.js';

/**
 * Result of scanning a punctuator or operator from source text.
 */
export interface ScanResult {
  /** The produced token. */
  readonly token: Token;
  /** Byte offset immediately after the last character of the token. */
  readonly end: number;
}

/**
 * Build a ScanResult from the given parameters.
 *
 * @param type  - The token type value.
 * @param start - Start offset in source.
 * @param end   - End offset in source.
 * @param raw   - The raw source text of the token.
 * @returns A frozen ScanResult.
 */
const result = (type: number, start: number, end: number, raw: string): ScanResult =>
  Object.freeze({
    token: createToken(type, start, end, raw, raw),
    end,
  });

/**
 * Scan a punctuator or operator starting at `start` in `source`.
 *
 * Uses greedy/longest-match: `>>>` before `>>` before `>`, etc.
 * Returns null if the character at `start` is not a punctuator.
 *
 * @param source - The full source text.
 * @param start  - The byte offset to begin scanning.
 * @returns A ScanResult if a punctuator was found, or null otherwise.
 */
export const scanPunctuator = (source: string, start: number): ScanResult | null => {
  const c0 = source.charCodeAt(start);
  const c1 = start + 1 < source.length ? source.charCodeAt(start + 1) : -1;
  const c2 = start + 2 < source.length ? source.charCodeAt(start + 2) : -1;
  const c3 = start + 3 < source.length ? source.charCodeAt(start + 3) : -1;

  switch (c0) {
    // + ++ +=
    case 0x2B: {
      if (c1 === 0x2B) return result(TokenType.PlusPlus, start, start + 2, '++');
      if (c1 === 0x3D) return result(TokenType.PlusEquals, start, start + 2, '+=');
      return result(TokenType.Plus, start, start + 1, '+');
    }

    // - -- -=
    case 0x2D: {
      if (c1 === 0x2D) return result(TokenType.MinusMinus, start, start + 2, '--');
      if (c1 === 0x3D) return result(TokenType.MinusEquals, start, start + 2, '-=');
      return result(TokenType.Minus, start, start + 1, '-');
    }

    // * ** *= **=
    case 0x2A: {
      if (c1 === 0x2A) {
        if (c2 === 0x3D) return result(TokenType.StarStarEquals, start, start + 3, '**=');
        return result(TokenType.StarStar, start, start + 2, '**');
      }
      if (c1 === 0x3D) return result(TokenType.StarEquals, start, start + 2, '*=');
      return result(TokenType.Star, start, start + 1, '*');
    }

    // / /=
    case 0x2F: {
      if (c1 === 0x3D) return result(TokenType.SlashEquals, start, start + 2, '/=');
      return result(TokenType.Slash, start, start + 1, '/');
    }

    // % %=
    case 0x25: {
      if (c1 === 0x3D) return result(TokenType.PercentEquals, start, start + 2, '%=');
      return result(TokenType.Percent, start, start + 1, '%');
    }

    // = == === =>
    case 0x3D: {
      if (c1 === 0x3D) {
        if (c2 === 0x3D) return result(TokenType.EqualsEqualsEquals, start, start + 3, '===');
        return result(TokenType.EqualsEquals, start, start + 2, '==');
      }
      if (c1 === 0x3E) return result(TokenType.Arrow, start, start + 2, '=>');
      return result(TokenType.Equals, start, start + 1, '=');
    }

    // ! != !==
    case 0x21: {
      if (c1 === 0x3D) {
        if (c2 === 0x3D) return result(TokenType.ExclamationEqualsEquals, start, start + 3, '!==');
        return result(TokenType.ExclamationEquals, start, start + 2, '!=');
      }
      return result(TokenType.Exclamation, start, start + 1, '!');
    }

    // < <= << <<=
    case 0x3C: {
      if (c1 === 0x3C) {
        if (c2 === 0x3D) return result(TokenType.LeftShiftEquals, start, start + 3, '<<=');
        return result(TokenType.LeftShift, start, start + 2, '<<');
      }
      if (c1 === 0x3D) return result(TokenType.LessThanEquals, start, start + 2, '<=');
      return result(TokenType.LessThan, start, start + 1, '<');
    }

    // > >= >> >>> >>= >>>=
    case 0x3E: {
      if (c1 === 0x3E) {
        if (c2 === 0x3E) {
          if (c3 === 0x3D) return result(TokenType.UnsignedRightShiftEquals, start, start + 4, '>>>=');
          return result(TokenType.UnsignedRightShift, start, start + 3, '>>>');
        }
        if (c2 === 0x3D) return result(TokenType.RightShiftEquals, start, start + 3, '>>=');
        return result(TokenType.RightShift, start, start + 2, '>>');
      }
      if (c1 === 0x3D) return result(TokenType.GreaterThanEquals, start, start + 2, '>=');
      return result(TokenType.GreaterThan, start, start + 1, '>');
    }

    // & && &= &&=
    case 0x26: {
      if (c1 === 0x26) {
        if (c2 === 0x3D) return result(TokenType.AmpersandAmpersandEquals, start, start + 3, '&&=');
        return result(TokenType.AmpersandAmpersand, start, start + 2, '&&');
      }
      if (c1 === 0x3D) return result(TokenType.AmpersandEquals, start, start + 2, '&=');
      return result(TokenType.Ampersand, start, start + 1, '&');
    }

    // | || |= ||=
    case 0x7C: {
      if (c1 === 0x7C) {
        if (c2 === 0x3D) return result(TokenType.PipePipeEquals, start, start + 3, '||=');
        return result(TokenType.PipePipe, start, start + 2, '||');
      }
      if (c1 === 0x3D) return result(TokenType.PipeEquals, start, start + 2, '|=');
      return result(TokenType.Pipe, start, start + 1, '|');
    }

    // ^ ^=
    case 0x5E: {
      if (c1 === 0x3D) return result(TokenType.CaretEquals, start, start + 2, '^=');
      return result(TokenType.Caret, start, start + 1, '^');
    }

    // ~
    case 0x7E:
      return result(TokenType.Tilde, start, start + 1, '~');

    // ? ?. ?? ??=
    case 0x3F: {
      if (c1 === 0x3F) {
        if (c2 === 0x3D) return result(TokenType.QuestionQuestionEquals, start, start + 3, '??=');
        return result(TokenType.QuestionQuestion, start, start + 2, '??');
      }
      if (c1 === 0x2E) {
        // ?. is QuestionDot only if the next char is NOT a digit
        // (to avoid treating ?.5 as optional chaining)
        if (c2 >= 0x30 && c2 <= 0x39) {
          return result(TokenType.QuestionMark, start, start + 1, '?');
        }
        return result(TokenType.QuestionDot, start, start + 2, '?.');
      }
      return result(TokenType.QuestionMark, start, start + 1, '?');
    }

    // . ...
    case 0x2E: {
      if (c1 === 0x2E && c2 === 0x2E) return result(TokenType.Ellipsis, start, start + 3, '...');
      return result(TokenType.Dot, start, start + 1, '.');
    }

    // ( ) [ ] { }
    case 0x28:
      return result(TokenType.LeftParen, start, start + 1, '(');
    case 0x29:
      return result(TokenType.RightParen, start, start + 1, ')');
    case 0x5B:
      return result(TokenType.LeftBracket, start, start + 1, '[');
    case 0x5D:
      return result(TokenType.RightBracket, start, start + 1, ']');
    case 0x7B:
      return result(TokenType.LeftBrace, start, start + 1, '{');
    case 0x7D:
      return result(TokenType.RightBrace, start, start + 1, '}');

    // , ; : # @
    case 0x2C:
      return result(TokenType.Comma, start, start + 1, ',');
    case 0x3B:
      return result(TokenType.Semicolon, start, start + 1, ';');
    case 0x3A:
      return result(TokenType.Colon, start, start + 1, ':');
    case 0x23:
      return result(TokenType.Hash, start, start + 1, '#');
    case 0x40:
      return result(TokenType.At, start, start + 1, '@');

    default:
      return null;
  }
};
