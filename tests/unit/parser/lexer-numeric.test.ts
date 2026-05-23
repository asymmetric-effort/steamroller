import { describe, it, expect } from 'vitest';
import { scanNumericLiteral } from '../../../src/parser/lexer-numeric.js';
import type { ScanResult } from '../../../src/parser/lexer-numeric.js';
import { TokenType } from '../../../src/parser/token-types.js';

describe('scanNumericLiteral', () => {
  /* ------------------------------------------------------------------ */
  /*  Helper                                                            */
  /* ------------------------------------------------------------------ */

  const scan = (src: string, strict = false, start = 0): ScanResult =>
    scanNumericLiteral(src, start, strict);

  /* ------------------------------------------------------------------ */
  /*  Decimal integers                                                  */
  /* ------------------------------------------------------------------ */

  describe('decimal integers', () => {
    it('should scan zero', () => {
      const r = scan('0');
      expect(r.token.type).toBe(TokenType.NumericLiteral);
      expect(r.token.value).toBe(0);
      expect(r.token.raw).toBe('0');
      expect(r.end).toBe(1);
      expect(r.token.start).toBe(0);
      expect(r.token.end).toBe(1);
    });

    it('should scan single digit', () => {
      const r = scan('7');
      expect(r.token.value).toBe(7);
      expect(r.end).toBe(1);
    });

    it('should scan multi-digit integer', () => {
      const r = scan('42');
      expect(r.token.value).toBe(42);
      expect(r.token.raw).toBe('42');
      expect(r.end).toBe(2);
    });

    it('should scan large integer', () => {
      const r = scan('9007199254740991');
      expect(r.token.value).toBe(9007199254740991);
      expect(r.end).toBe(16);
    });

    it('should stop at non-digit character', () => {
      const r = scan('123abc');
      expect(r.token.value).toBe(123);
      expect(r.end).toBe(3);
    });

    it('should scan from a non-zero start offset', () => {
      const r = scan('xx99yy', false, 2);
      expect(r.token.value).toBe(99);
      expect(r.token.start).toBe(2);
      expect(r.token.end).toBe(4);
      expect(r.end).toBe(4);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Floating point                                                    */
  /* ------------------------------------------------------------------ */

  describe('floating point', () => {
    it('should scan basic float', () => {
      const r = scan('3.14');
      expect(r.token.type).toBe(TokenType.NumericLiteral);
      expect(r.token.value).toBe(3.14);
      expect(r.token.raw).toBe('3.14');
      expect(r.end).toBe(4);
    });

    it('should scan leading dot', () => {
      const r = scan('.5');
      expect(r.token.value).toBe(0.5);
      expect(r.token.raw).toBe('.5');
      expect(r.end).toBe(2);
    });

    it('should scan trailing dot', () => {
      const r = scan('5.');
      expect(r.token.value).toBe(5);
      expect(r.token.raw).toBe('5.');
      expect(r.end).toBe(2);
    });

    it('should scan 0.0', () => {
      const r = scan('0.0');
      expect(r.token.value).toBe(0);
      expect(r.end).toBe(3);
    });

    it('should scan float with multiple decimal digits', () => {
      const r = scan('123.456789');
      expect(r.token.value).toBe(123.456789);
      expect(r.end).toBe(10);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Hexadecimal                                                       */
  /* ------------------------------------------------------------------ */

  describe('hexadecimal', () => {
    it('should scan lowercase prefix 0x', () => {
      const r = scan('0xff');
      expect(r.token.type).toBe(TokenType.NumericLiteral);
      expect(r.token.value).toBe(255);
      expect(r.token.raw).toBe('0xff');
      expect(r.end).toBe(4);
    });

    it('should scan uppercase prefix 0X', () => {
      const r = scan('0XFF');
      expect(r.token.value).toBe(255);
      expect(r.end).toBe(4);
    });

    it('should scan mixed-case hex digits', () => {
      const r = scan('0xAbCd');
      expect(r.token.value).toBe(0xabcd);
      expect(r.end).toBe(6);
    });

    it('should scan 0x0', () => {
      const r = scan('0x0');
      expect(r.token.value).toBe(0);
      expect(r.end).toBe(3);
    });

    it('should throw on missing hex digits', () => {
      expect(() => scan('0x')).toThrow(SyntaxError);
    });

    it('should throw on 0x followed by non-hex', () => {
      expect(() => scan('0xGG')).toThrow(SyntaxError);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Octal (ES6 0o prefix)                                             */
  /* ------------------------------------------------------------------ */

  describe('octal (ES6)', () => {
    it('should scan lowercase prefix 0o', () => {
      const r = scan('0o77');
      expect(r.token.type).toBe(TokenType.NumericLiteral);
      expect(r.token.value).toBe(63);
      expect(r.token.raw).toBe('0o77');
      expect(r.end).toBe(4);
    });

    it('should scan uppercase prefix 0O', () => {
      const r = scan('0O77');
      expect(r.token.value).toBe(63);
      expect(r.end).toBe(4);
    });

    it('should throw on missing octal digits', () => {
      expect(() => scan('0o')).toThrow(SyntaxError);
    });

    it('should throw on invalid octal digit', () => {
      expect(() => scan('0o89')).toThrow(SyntaxError);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Binary                                                            */
  /* ------------------------------------------------------------------ */

  describe('binary', () => {
    it('should scan lowercase prefix 0b', () => {
      const r = scan('0b1010');
      expect(r.token.type).toBe(TokenType.NumericLiteral);
      expect(r.token.value).toBe(10);
      expect(r.token.raw).toBe('0b1010');
      expect(r.end).toBe(6);
    });

    it('should scan uppercase prefix 0B', () => {
      const r = scan('0B1010');
      expect(r.token.value).toBe(10);
      expect(r.end).toBe(6);
    });

    it('should throw on missing binary digits', () => {
      expect(() => scan('0b')).toThrow(SyntaxError);
    });

    it('should throw on invalid binary digit', () => {
      expect(() => scan('0b2')).toThrow(SyntaxError);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  BigInt                                                            */
  /* ------------------------------------------------------------------ */

  describe('BigInt', () => {
    it('should scan decimal BigInt', () => {
      const r = scan('42n');
      expect(r.token.type).toBe(TokenType.BigIntLiteral);
      expect(r.token.value).toBe(BigInt(42));
      expect(r.token.raw).toBe('42n');
      expect(r.end).toBe(3);
    });

    it('should scan zero BigInt', () => {
      const r = scan('0n');
      expect(r.token.type).toBe(TokenType.BigIntLiteral);
      expect(r.token.value).toBe(BigInt(0));
      expect(r.end).toBe(2);
    });

    it('should scan hex BigInt', () => {
      const r = scan('0xFFn');
      expect(r.token.type).toBe(TokenType.BigIntLiteral);
      expect(r.token.value).toBe(BigInt(0xff));
      expect(r.token.raw).toBe('0xFFn');
      expect(r.end).toBe(5);
    });

    it('should scan octal BigInt', () => {
      const r = scan('0o77n');
      expect(r.token.type).toBe(TokenType.BigIntLiteral);
      expect(r.token.value).toBe(BigInt(63));
      expect(r.end).toBe(5);
    });

    it('should scan binary BigInt', () => {
      const r = scan('0b1010n');
      expect(r.token.type).toBe(TokenType.BigIntLiteral);
      expect(r.token.value).toBe(BigInt(10));
      expect(r.end).toBe(7);
    });

    it('should scan large BigInt', () => {
      const r = scan('999999999999999999999n');
      expect(r.token.type).toBe(TokenType.BigIntLiteral);
      expect(r.token.value).toBe(BigInt('999999999999999999999'));
      expect(r.end).toBe(22);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Numeric separators                                                */
  /* ------------------------------------------------------------------ */

  describe('numeric separators', () => {
    it('should scan decimal with separators', () => {
      const r = scan('1_000_000');
      expect(r.token.value).toBe(1_000_000);
      expect(r.token.raw).toBe('1_000_000');
      expect(r.end).toBe(9);
    });

    it('should scan hex with separators', () => {
      const r = scan('0xFF_FF');
      expect(r.token.value).toBe(0xffff);
      expect(r.end).toBe(7);
    });

    it('should scan octal with separators', () => {
      const r = scan('0o7_7');
      expect(r.token.value).toBe(63);
      expect(r.end).toBe(5);
    });

    it('should scan binary with separators', () => {
      const r = scan('0b1010_0101');
      expect(r.token.value).toBe(0b10100101);
      expect(r.end).toBe(11);
    });

    it('should scan float with separators in integer part', () => {
      const r = scan('1_000.5');
      expect(r.token.value).toBe(1000.5);
      expect(r.end).toBe(7);
    });

    it('should scan float with separators in fractional part', () => {
      const r = scan('3.14_15');
      expect(r.token.value).toBe(3.1415);
      expect(r.end).toBe(7);
    });

    it('should scan BigInt with separators', () => {
      const r = scan('1_000n');
      expect(r.token.type).toBe(TokenType.BigIntLiteral);
      expect(r.token.value).toBe(BigInt(1000));
      expect(r.end).toBe(6);
    });

    it('should scan exponent with separators in mantissa', () => {
      const r = scan('1_0e2');
      expect(r.token.value).toBe(1000);
      expect(r.end).toBe(5);
    });

    it('should throw on leading separator in decimal', () => {
      expect(() => scan('_100')).toThrow();
    });

    it('should throw on trailing separator in decimal', () => {
      expect(() => scan('100_')).toThrow(SyntaxError);
    });

    it('should throw on consecutive separators', () => {
      expect(() => scan('1__0')).toThrow(SyntaxError);
    });

    it('should throw on leading separator in hex digits', () => {
      expect(() => scan('0x_FF')).toThrow(SyntaxError);
    });

    it('should throw on trailing separator in hex digits', () => {
      expect(() => scan('0xFF_')).toThrow(SyntaxError);
    });

    it('should throw on leading separator in octal digits', () => {
      expect(() => scan('0o_7')).toThrow(SyntaxError);
    });

    it('should throw on leading separator in binary digits', () => {
      expect(() => scan('0b_1')).toThrow(SyntaxError);
    });

    it('should throw on trailing separator in fractional part', () => {
      expect(() => scan('3.14_')).toThrow(SyntaxError);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Exponential notation                                              */
  /* ------------------------------------------------------------------ */

  describe('exponential notation', () => {
    it('should scan lowercase e', () => {
      const r = scan('1e10');
      expect(r.token.type).toBe(TokenType.NumericLiteral);
      expect(r.token.value).toBe(1e10);
      expect(r.token.raw).toBe('1e10');
      expect(r.end).toBe(4);
    });

    it('should scan uppercase E', () => {
      const r = scan('1E10');
      expect(r.token.value).toBe(1e10);
      expect(r.end).toBe(4);
    });

    it('should scan negative exponent', () => {
      const r = scan('2.5E-3');
      expect(r.token.value).toBe(2.5e-3);
      expect(r.token.raw).toBe('2.5E-3');
      expect(r.end).toBe(6);
    });

    it('should scan positive exponent with plus sign', () => {
      const r = scan('5e+2');
      expect(r.token.value).toBe(500);
      expect(r.end).toBe(4);
    });

    it('should scan exponent on integer', () => {
      const r = scan('3e0');
      expect(r.token.value).toBe(3);
      expect(r.end).toBe(3);
    });

    it('should scan exponent on float with leading dot', () => {
      const r = scan('.5e2');
      expect(r.token.value).toBe(50);
      expect(r.end).toBe(4);
    });

    it('should scan zero exponent', () => {
      const r = scan('42e0');
      expect(r.token.value).toBe(42);
      expect(r.end).toBe(4);
    });

    it('should throw when exponent has no digits', () => {
      expect(() => scan('1e')).toThrow(SyntaxError);
    });

    it('should throw when exponent sign has no digits', () => {
      expect(() => scan('1e+')).toThrow(SyntaxError);
    });

    it('should throw when exponent sign has no digits (minus)', () => {
      expect(() => scan('1e-')).toThrow(SyntaxError);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Legacy octal                                                      */
  /* ------------------------------------------------------------------ */

  describe('legacy octal', () => {
    it('should scan legacy octal in sloppy mode', () => {
      const r = scan('077', false);
      expect(r.token.type).toBe(TokenType.NumericLiteral);
      expect(r.token.value).toBe(63);
      expect(r.token.raw).toBe('077');
      expect(r.end).toBe(3);
    });

    it('should scan single digit legacy octal', () => {
      const r = scan('01', false);
      expect(r.token.value).toBe(1);
      expect(r.end).toBe(2);
    });

    it('should throw legacy octal in strict mode', () => {
      expect(() => scan('077', true)).toThrow(SyntaxError);
    });

    it('should throw legacy octal 01 in strict mode', () => {
      expect(() => scan('01', true)).toThrow(SyntaxError);
    });

    it('should stop at non-octal digit in legacy octal', () => {
      const r = scan('078', false);
      expect(r.token.value).toBe(7);
      expect(r.token.raw).toBe('07');
      expect(r.end).toBe(2);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  BigInt with decimal/exponent (should throw)                       */
  /* ------------------------------------------------------------------ */

  describe('BigInt with decimal/exponent rejection', () => {
    it('should not produce BigInt for float (dot prevents bigint suffix)', () => {
      /* 3.14n is not valid JS – the scanner sees 3.14 as float, then
         the 'n' is NOT consumed (it's not a digit), so no BigInt. */
      const r = scan('3.14n');
      expect(r.token.type).toBe(TokenType.NumericLiteral);
      expect(r.token.value).toBe(3.14);
      expect(r.end).toBe(4); /* ends at 'n' — 'n' not consumed */
    });

    it('should not produce BigInt for exponent notation', () => {
      /* 1e2n — scanner sees 1e2 as exponent float, 'n' not consumed */
      const r = scan('1e2n');
      expect(r.token.type).toBe(TokenType.NumericLiteral);
      expect(r.token.value).toBe(100);
      expect(r.end).toBe(3); /* 'n' not consumed */
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Frozen results                                                    */
  /* ------------------------------------------------------------------ */

  describe('result immutability', () => {
    it('should return a frozen ScanResult', () => {
      const r = scan('42');
      expect(Object.isFrozen(r)).toBe(true);
    });

    it('should return a frozen token', () => {
      const r = scan('42');
      expect(Object.isFrozen(r.token)).toBe(true);
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Edge cases                                                        */
  /* ------------------------------------------------------------------ */

  describe('edge cases', () => {
    it('should scan 0 followed by non-numeric', () => {
      const r = scan('0 ');
      expect(r.token.value).toBe(0);
      expect(r.end).toBe(1);
    });

    it('should scan 0 at end of source', () => {
      const r = scan('0');
      expect(r.token.value).toBe(0);
      expect(r.end).toBe(1);
    });

    it('should scan 0 followed by dot', () => {
      const r = scan('0.5');
      expect(r.token.value).toBe(0.5);
      expect(r.end).toBe(3);
    });

    it('should scan 0 followed by e', () => {
      const r = scan('0e1');
      expect(r.token.value).toBe(0);
      expect(r.end).toBe(3);
    });

    it('should scan number at middle of source', () => {
      const r = scan('abc123def', false, 3);
      expect(r.token.value).toBe(123);
      expect(r.token.start).toBe(3);
      expect(r.token.end).toBe(6);
      expect(r.end).toBe(6);
    });

    it('should scan leading dot float from offset', () => {
      const r = scan('x.5y', false, 1);
      expect(r.token.value).toBe(0.5);
      expect(r.token.start).toBe(1);
      expect(r.end).toBe(3);
    });

    it('should scan hex BigInt with separators', () => {
      const r = scan('0xFF_FFn');
      expect(r.token.type).toBe(TokenType.BigIntLiteral);
      expect(r.token.value).toBe(BigInt(0xffff));
      expect(r.end).toBe(8);
    });

    it('should handle trailing dot after 0 (0.)', () => {
      const r = scan('0.');
      expect(r.token.value).toBe(0);
      expect(r.end).toBe(2);
    });

    it('should scan exponent after trailing dot (5.e2)', () => {
      const r = scan('5.e2');
      expect(r.token.value).toBe(500);
      expect(r.end).toBe(4);
    });

    it('should scan float with exponent after fraction', () => {
      const r = scan('1.5e3');
      expect(r.token.value).toBe(1500);
      expect(r.end).toBe(5);
    });

    it('should scan binary BigInt with separators', () => {
      const r = scan('0b1_0n');
      expect(r.token.type).toBe(TokenType.BigIntLiteral);
      expect(r.token.value).toBe(BigInt(2));
      expect(r.end).toBe(6);
    });

    it('should scan octal BigInt with separators', () => {
      const r = scan('0o7_7n');
      expect(r.token.type).toBe(TokenType.BigIntLiteral);
      expect(r.token.value).toBe(BigInt(63));
      expect(r.end).toBe(6);
    });
  });
});
