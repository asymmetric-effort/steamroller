/**
 * Tests for the punctuator and operator scanner.
 *
 * Covers all single-char punctuators, two-char operators, three-char
 * operators, four-char operators (>>>=), greedy/longest-match behaviour,
 * and non-punctuator rejection.
 *
 * @module tests/unit/parser/lexer-punctuator
 */

import { describe, it, expect } from 'vitest';
import { scanPunctuator } from '../../../src/parser/lexer-punctuator.js';
import type { ScanResult } from '../../../src/parser/lexer-punctuator.js';
import { TokenType } from '../../../src/parser/token-types.js';

/** Helper: assert a scan result matches expectations. */
const expectToken = (
  result: ScanResult | null,
  type: number,
  raw: string,
  start: number,
  end: number,
): void => {
  expect(result).not.toBeNull();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const r = result!;
  expect(r.token.type).toBe(type);
  expect(r.token.raw).toBe(raw);
  expect(r.token.value).toBe(raw);
  expect(r.token.start).toBe(start);
  expect(r.token.end).toBe(end);
  expect(r.end).toBe(end);
};

describe('scanPunctuator', () => {
  // ── Single-char punctuators ──────────────────────────────────────

  describe('single-char punctuators', () => {
    const singles: ReadonlyArray<readonly [string, number]> = [
      ['(', TokenType.LeftParen],
      [')', TokenType.RightParen],
      ['[', TokenType.LeftBracket],
      [']', TokenType.RightBracket],
      ['{', TokenType.LeftBrace],
      ['}', TokenType.RightBrace],
      [',', TokenType.Comma],
      [';', TokenType.Semicolon],
      [':', TokenType.Colon],
      ['#', TokenType.Hash],
      ['@', TokenType.At],
      ['~', TokenType.Tilde],
      ['.', TokenType.Dot],
      ['?', TokenType.QuestionMark],
      ['+', TokenType.Plus],
      ['-', TokenType.Minus],
      ['*', TokenType.Star],
      ['/', TokenType.Slash],
      ['%', TokenType.Percent],
      ['=', TokenType.Equals],
      ['!', TokenType.Exclamation],
      ['<', TokenType.LessThan],
      ['>', TokenType.GreaterThan],
      ['&', TokenType.Ampersand],
      ['|', TokenType.Pipe],
      ['^', TokenType.Caret],
    ];

    for (let i = 0; i < singles.length; i++) {
      const [raw, type] = singles[i];
      it(`scans "${raw}" as a single-char token`, () => {
        expectToken(scanPunctuator(raw, 0), type, raw, 0, 1);
      });
    }
  });

  // ── Two-char operators ───────────────────────────────────────────

  describe('two-char operators', () => {
    const doubles: ReadonlyArray<readonly [string, number]> = [
      ['++', TokenType.PlusPlus],
      ['+=', TokenType.PlusEquals],
      ['--', TokenType.MinusMinus],
      ['-=', TokenType.MinusEquals],
      ['**', TokenType.StarStar],
      ['*=', TokenType.StarEquals],
      ['/=', TokenType.SlashEquals],
      ['%=', TokenType.PercentEquals],
      ['==', TokenType.EqualsEquals],
      ['=>', TokenType.Arrow],
      ['!=', TokenType.ExclamationEquals],
      ['<=', TokenType.LessThanEquals],
      ['<<', TokenType.LeftShift],
      ['>=', TokenType.GreaterThanEquals],
      ['>>', TokenType.RightShift],
      ['&&', TokenType.AmpersandAmpersand],
      ['&=', TokenType.AmpersandEquals],
      ['||', TokenType.PipePipe],
      ['|=', TokenType.PipeEquals],
      ['^=', TokenType.CaretEquals],
      ['?.', TokenType.QuestionDot],
      ['??', TokenType.QuestionQuestion],
    ];

    for (let i = 0; i < doubles.length; i++) {
      const [raw, type] = doubles[i];
      it(`scans "${raw}"`, () => {
        expectToken(scanPunctuator(raw, 0), type, raw, 0, 2);
      });
    }
  });

  // ── Three-char operators ─────────────────────────────────────────

  describe('three-char operators', () => {
    const triples: ReadonlyArray<readonly [string, number]> = [
      ['===', TokenType.EqualsEqualsEquals],
      ['!==', TokenType.ExclamationEqualsEquals],
      ['>>>', TokenType.UnsignedRightShift],
      ['<<=', TokenType.LeftShiftEquals],
      ['>>=', TokenType.RightShiftEquals],
      ['**=', TokenType.StarStarEquals],
      ['&&=', TokenType.AmpersandAmpersandEquals],
      ['||=', TokenType.PipePipeEquals],
      ['??=', TokenType.QuestionQuestionEquals],
      ['...', TokenType.Ellipsis],
    ];

    for (let i = 0; i < triples.length; i++) {
      const [raw, type] = triples[i];
      it(`scans "${raw}"`, () => {
        expectToken(scanPunctuator(raw, 0), type, raw, 0, 3);
      });
    }
  });

  // ── Four-char operator ───────────────────────────────────────────

  describe('four-char operator', () => {
    it('scans ">>>="', () => {
      expectToken(scanPunctuator('>>>=', 0), TokenType.UnsignedRightShiftEquals, '>>>=', 0, 4);
    });
  });

  // ── Greedy / longest-match ───────────────────────────────────────

  describe('greedy matching', () => {
    it('scans ">>>" as UnsignedRightShift, not GreaterThan + RightShift', () => {
      const r = scanPunctuator('>>>x', 0);
      expectToken(r, TokenType.UnsignedRightShift, '>>>', 0, 3);
    });

    it('scans ">>>=" as UnsignedRightShiftEquals, not UnsignedRightShift + Equals', () => {
      const r = scanPunctuator('>>>=x', 0);
      expectToken(r, TokenType.UnsignedRightShiftEquals, '>>>=', 0, 4);
    });

    it('scans ">>" as RightShift, not two GreaterThan', () => {
      const r = scanPunctuator('>>x', 0);
      expectToken(r, TokenType.RightShift, '>>', 0, 2);
    });

    it('scans "===" as StrictEquals, not EqualsEquals + Equals', () => {
      const r = scanPunctuator('===x', 0);
      expectToken(r, TokenType.EqualsEqualsEquals, '===', 0, 3);
    });

    it('scans "!==" as StrictNotEquals, not ExclamationEquals + Equals', () => {
      const r = scanPunctuator('!==x', 0);
      expectToken(r, TokenType.ExclamationEqualsEquals, '!==', 0, 3);
    });

    it('scans "**=" as StarStarEquals, not StarStar + Equals', () => {
      const r = scanPunctuator('**=x', 0);
      expectToken(r, TokenType.StarStarEquals, '**=', 0, 3);
    });

    it('scans "&&=" as AmpersandAmpersandEquals', () => {
      const r = scanPunctuator('&&=x', 0);
      expectToken(r, TokenType.AmpersandAmpersandEquals, '&&=', 0, 3);
    });

    it('scans "||=" as PipePipeEquals', () => {
      const r = scanPunctuator('||=x', 0);
      expectToken(r, TokenType.PipePipeEquals, '||=', 0, 3);
    });

    it('scans "??=" as QuestionQuestionEquals', () => {
      const r = scanPunctuator('??=x', 0);
      expectToken(r, TokenType.QuestionQuestionEquals, '??=', 0, 3);
    });

    it('scans "..." as Ellipsis, not three Dots', () => {
      const r = scanPunctuator('...x', 0);
      expectToken(r, TokenType.Ellipsis, '...', 0, 3);
    });

    it('scans ".." as a single Dot (no two-dot operator)', () => {
      const r = scanPunctuator('..x', 0);
      expectToken(r, TokenType.Dot, '.', 0, 1);
    });
  });

  // ── QuestionDot vs QuestionMark + Dot ────────────────────────────

  describe('?. disambiguation', () => {
    it('scans "?." as QuestionDot', () => {
      expectToken(scanPunctuator('?.x', 0), TokenType.QuestionDot, '?.', 0, 2);
    });

    it('scans "?." at end of source as QuestionDot', () => {
      expectToken(scanPunctuator('?.', 0), TokenType.QuestionDot, '?.', 0, 2);
    });

    it('scans "?.5" as QuestionMark (not QuestionDot before digit)', () => {
      const r = scanPunctuator('?.5', 0);
      expectToken(r, TokenType.QuestionMark, '?', 0, 1);
    });

    it('scans "?.0" as QuestionMark (not QuestionDot before digit)', () => {
      const r = scanPunctuator('?.0', 0);
      expectToken(r, TokenType.QuestionMark, '?', 0, 1);
    });

    it('scans "?.9" as QuestionMark (not QuestionDot before digit)', () => {
      const r = scanPunctuator('?.9', 0);
      expectToken(r, TokenType.QuestionMark, '?', 0, 1);
    });
  });

  // ── Non-punctuator returns null ──────────────────────────────────

  describe('non-punctuator input', () => {
    it('returns null for alphabetic character', () => {
      expect(scanPunctuator('abc', 0)).toBeNull();
    });

    it('returns null for digit', () => {
      expect(scanPunctuator('123', 0)).toBeNull();
    });

    it('returns null for whitespace', () => {
      expect(scanPunctuator(' ', 0)).toBeNull();
    });

    it('returns null for newline', () => {
      expect(scanPunctuator('\n', 0)).toBeNull();
    });

    it('returns null for tab', () => {
      expect(scanPunctuator('\t', 0)).toBeNull();
    });

    it('returns null for underscore', () => {
      expect(scanPunctuator('_foo', 0)).toBeNull();
    });

    it('returns null for dollar sign', () => {
      expect(scanPunctuator('$foo', 0)).toBeNull();
    });

    it('returns null for double-quote', () => {
      expect(scanPunctuator('"hello"', 0)).toBeNull();
    });

    it('returns null for single-quote', () => {
      expect(scanPunctuator("'hello'", 0)).toBeNull();
    });

    it('returns null for backtick', () => {
      expect(scanPunctuator('`hello`', 0)).toBeNull();
    });
  });

  // ── Start position tracking ──────────────────────────────────────

  describe('start position tracking', () => {
    it('scans from a non-zero start position', () => {
      const source = 'abc + def';
      expectToken(scanPunctuator(source, 4), TokenType.Plus, '+', 4, 5);
    });

    it('scans multi-char operator from a non-zero start', () => {
      const source = 'x === y';
      expectToken(scanPunctuator(source, 2), TokenType.EqualsEqualsEquals, '===', 2, 5);
    });

    it('scans four-char operator from a non-zero start', () => {
      const source = 'a >>>= b';
      expectToken(scanPunctuator(source, 2), TokenType.UnsignedRightShiftEquals, '>>>=', 2, 6);
    });

    it('returns null when start is at a non-punctuator character', () => {
      const source = '+ abc';
      expect(scanPunctuator(source, 2)).toBeNull();
    });

    it('scans single-char at end of source', () => {
      const source = 'x+';
      expectToken(scanPunctuator(source, 1), TokenType.Plus, '+', 1, 2);
    });

    it('handles operator at very end of source (no lookahead available)', () => {
      const source = 'x>';
      expectToken(scanPunctuator(source, 1), TokenType.GreaterThan, '>', 1, 2);
    });
  });

  // ── Token immutability ───────────────────────────────────────────

  describe('token immutability', () => {
    it('produces frozen tokens', () => {
      const r = scanPunctuator('+', 0);
      expect(r).not.toBeNull();
      expect(Object.isFrozen(r!.token)).toBe(true);
    });

    it('produces frozen scan results', () => {
      const r = scanPunctuator('+', 0);
      expect(r).not.toBeNull();
      expect(Object.isFrozen(r)).toBe(true);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles single > at end of source', () => {
      expectToken(scanPunctuator('>', 0), TokenType.GreaterThan, '>', 0, 1);
    });

    it('handles >> at end of source', () => {
      expectToken(scanPunctuator('>>', 0), TokenType.RightShift, '>>', 0, 2);
    });

    it('handles >>> at end of source', () => {
      expectToken(scanPunctuator('>>>', 0), TokenType.UnsignedRightShift, '>>>', 0, 3);
    });

    it('handles single < at end of source', () => {
      expectToken(scanPunctuator('<', 0), TokenType.LessThan, '<', 0, 1);
    });

    it('handles single = at end of source', () => {
      expectToken(scanPunctuator('=', 0), TokenType.Equals, '=', 0, 1);
    });

    it('handles single ! at end of source', () => {
      expectToken(scanPunctuator('!', 0), TokenType.Exclamation, '!', 0, 1);
    });

    it('handles single ? at end of source', () => {
      expectToken(scanPunctuator('?', 0), TokenType.QuestionMark, '?', 0, 1);
    });

    it('handles single & at end of source', () => {
      expectToken(scanPunctuator('&', 0), TokenType.Ampersand, '&', 0, 1);
    });

    it('handles single | at end of source', () => {
      expectToken(scanPunctuator('|', 0), TokenType.Pipe, '|', 0, 1);
    });

    it('handles single ^ at end of source', () => {
      expectToken(scanPunctuator('^', 0), TokenType.Caret, '^', 0, 1);
    });

    it('handles == followed by non-= char', () => {
      expectToken(scanPunctuator('==x', 0), TokenType.EqualsEquals, '==', 0, 2);
    });

    it('handles != followed by non-= char', () => {
      expectToken(scanPunctuator('!=x', 0), TokenType.ExclamationEquals, '!=', 0, 2);
    });

    it('handles ** followed by non-= char', () => {
      expectToken(scanPunctuator('**x', 0), TokenType.StarStar, '**', 0, 2);
    });

    it('handles && followed by non-= char', () => {
      expectToken(scanPunctuator('&&x', 0), TokenType.AmpersandAmpersand, '&&', 0, 2);
    });

    it('handles || followed by non-= char', () => {
      expectToken(scanPunctuator('||x', 0), TokenType.PipePipe, '||', 0, 2);
    });

    it('handles ?? followed by non-= char', () => {
      expectToken(scanPunctuator('??x', 0), TokenType.QuestionQuestion, '??', 0, 2);
    });

    it('handles << followed by non-= char', () => {
      expectToken(scanPunctuator('<<x', 0), TokenType.LeftShift, '<<', 0, 2);
    });

    it('handles >> followed by non-= and non-> char', () => {
      expectToken(scanPunctuator('>>x', 0), TokenType.RightShift, '>>', 0, 2);
    });

    it('handles >>=', () => {
      expectToken(scanPunctuator('>>=', 0), TokenType.RightShiftEquals, '>>=', 0, 3);
    });

    it('returns null for empty string at start 0', () => {
      expect(scanPunctuator('', 0)).toBeNull();
    });
  });
});
