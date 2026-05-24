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

import type { Token } from "./token.js";
import { TokenType } from "./token-types.js";
import { createToken } from "./token.js";

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
const result = (
  type: number,
  start: number,
  end: number,
  raw: string,
): ScanResult =>
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
export const scanPunctuator = (
  source: string,
  start: number,
): ScanResult | null => {
  const c0 = source.charCodeAt(start);
  const c1 = start + 1 < source.length ? source.charCodeAt(start + 1) : -1;
  const c2 = start + 2 < source.length ? source.charCodeAt(start + 2) : -1;
  const c3 = start + 3 < source.length ? source.charCodeAt(start + 3) : -1;

  switch (c0) {
    // + ++ +=
    case 0x2b: {
      if (c1 === 0x2b)
        return result(TokenType.PlusPlus, start, start + 2, "++");
      if (c1 === 0x3d)
        return result(TokenType.PlusEquals, start, start + 2, "+=");
      return result(TokenType.Plus, start, start + 1, "+");
    }

    // - -- -=
    case 0x2d: {
      if (c1 === 0x2d)
        return result(TokenType.MinusMinus, start, start + 2, "--");
      if (c1 === 0x3d)
        return result(TokenType.MinusEquals, start, start + 2, "-=");
      return result(TokenType.Minus, start, start + 1, "-");
    }

    // * ** *= **=
    case 0x2a: {
      if (c1 === 0x2a) {
        if (c2 === 0x3d)
          return result(TokenType.StarStarEquals, start, start + 3, "**=");
        return result(TokenType.StarStar, start, start + 2, "**");
      }
      if (c1 === 0x3d)
        return result(TokenType.StarEquals, start, start + 2, "*=");
      return result(TokenType.Star, start, start + 1, "*");
    }

    // / /=
    case 0x2f: {
      if (c1 === 0x3d)
        return result(TokenType.SlashEquals, start, start + 2, "/=");
      return result(TokenType.Slash, start, start + 1, "/");
    }

    // % %=
    case 0x25: {
      if (c1 === 0x3d)
        return result(TokenType.PercentEquals, start, start + 2, "%=");
      return result(TokenType.Percent, start, start + 1, "%");
    }

    // = == === =>
    case 0x3d: {
      if (c1 === 0x3d) {
        if (c2 === 0x3d)
          return result(TokenType.EqualsEqualsEquals, start, start + 3, "===");
        return result(TokenType.EqualsEquals, start, start + 2, "==");
      }
      if (c1 === 0x3e) return result(TokenType.Arrow, start, start + 2, "=>");
      return result(TokenType.Equals, start, start + 1, "=");
    }

    // ! != !==
    case 0x21: {
      if (c1 === 0x3d) {
        if (c2 === 0x3d)
          return result(
            TokenType.ExclamationEqualsEquals,
            start,
            start + 3,
            "!==",
          );
        return result(TokenType.ExclamationEquals, start, start + 2, "!=");
      }
      return result(TokenType.Exclamation, start, start + 1, "!");
    }

    // < <= << <<=
    case 0x3c: {
      if (c1 === 0x3c) {
        if (c2 === 0x3d)
          return result(TokenType.LeftShiftEquals, start, start + 3, "<<=");
        return result(TokenType.LeftShift, start, start + 2, "<<");
      }
      if (c1 === 0x3d)
        return result(TokenType.LessThanEquals, start, start + 2, "<=");
      return result(TokenType.LessThan, start, start + 1, "<");
    }

    // > >= >> >>> >>= >>>=
    case 0x3e: {
      if (c1 === 0x3e) {
        if (c2 === 0x3e) {
          if (c3 === 0x3d)
            return result(
              TokenType.UnsignedRightShiftEquals,
              start,
              start + 4,
              ">>>=",
            );
          return result(TokenType.UnsignedRightShift, start, start + 3, ">>>");
        }
        if (c2 === 0x3d)
          return result(TokenType.RightShiftEquals, start, start + 3, ">>=");
        return result(TokenType.RightShift, start, start + 2, ">>");
      }
      if (c1 === 0x3d)
        return result(TokenType.GreaterThanEquals, start, start + 2, ">=");
      return result(TokenType.GreaterThan, start, start + 1, ">");
    }

    // & && &= &&=
    case 0x26: {
      if (c1 === 0x26) {
        if (c2 === 0x3d)
          return result(
            TokenType.AmpersandAmpersandEquals,
            start,
            start + 3,
            "&&=",
          );
        return result(TokenType.AmpersandAmpersand, start, start + 2, "&&");
      }
      if (c1 === 0x3d)
        return result(TokenType.AmpersandEquals, start, start + 2, "&=");
      return result(TokenType.Ampersand, start, start + 1, "&");
    }

    // | || |= ||=
    case 0x7c: {
      if (c1 === 0x7c) {
        if (c2 === 0x3d)
          return result(TokenType.PipePipeEquals, start, start + 3, "||=");
        return result(TokenType.PipePipe, start, start + 2, "||");
      }
      if (c1 === 0x3d)
        return result(TokenType.PipeEquals, start, start + 2, "|=");
      return result(TokenType.Pipe, start, start + 1, "|");
    }

    // ^ ^=
    case 0x5e: {
      if (c1 === 0x3d)
        return result(TokenType.CaretEquals, start, start + 2, "^=");
      return result(TokenType.Caret, start, start + 1, "^");
    }

    // ~
    case 0x7e:
      return result(TokenType.Tilde, start, start + 1, "~");

    // ? ?. ?? ??=
    case 0x3f: {
      if (c1 === 0x3f) {
        if (c2 === 0x3d)
          return result(
            TokenType.QuestionQuestionEquals,
            start,
            start + 3,
            "??=",
          );
        return result(TokenType.QuestionQuestion, start, start + 2, "??");
      }
      if (c1 === 0x2e) {
        // ?. is QuestionDot only if the next char is NOT a digit
        // (to avoid treating ?.5 as optional chaining)
        if (c2 >= 0x30 && c2 <= 0x39) {
          return result(TokenType.QuestionMark, start, start + 1, "?");
        }
        return result(TokenType.QuestionDot, start, start + 2, "?.");
      }
      return result(TokenType.QuestionMark, start, start + 1, "?");
    }

    // . ...
    case 0x2e: {
      if (c1 === 0x2e && c2 === 0x2e)
        return result(TokenType.Ellipsis, start, start + 3, "...");
      return result(TokenType.Dot, start, start + 1, ".");
    }

    // ( ) [ ] { }
    case 0x28:
      return result(TokenType.LeftParen, start, start + 1, "(");
    case 0x29:
      return result(TokenType.RightParen, start, start + 1, ")");
    case 0x5b:
      return result(TokenType.LeftBracket, start, start + 1, "[");
    case 0x5d:
      return result(TokenType.RightBracket, start, start + 1, "]");
    case 0x7b:
      return result(TokenType.LeftBrace, start, start + 1, "{");
    case 0x7d:
      return result(TokenType.RightBrace, start, start + 1, "}");

    // , ; : # @
    case 0x2c:
      return result(TokenType.Comma, start, start + 1, ",");
    case 0x3b:
      return result(TokenType.Semicolon, start, start + 1, ";");
    case 0x3a:
      return result(TokenType.Colon, start, start + 1, ":");
    case 0x23:
      return result(TokenType.Hash, start, start + 1, "#");
    case 0x40:
      return result(TokenType.At, start, start + 1, "@");

    default:
      return null;
  }
};
