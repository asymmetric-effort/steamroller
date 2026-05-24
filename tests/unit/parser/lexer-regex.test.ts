import { describe, it, expect } from "vitest";
import {
  scanRegExpLiteral,
  isRegExpStart,
} from "../../../src/parser/lexer-regex.js";
import type { ScanResult } from "../../../src/parser/lexer-regex.js";
import { TokenType } from "../../../src/parser/token-types.js";

describe("scanRegExpLiteral", () => {
  describe("simple patterns", () => {
    it("should scan a simple regex /abc/", () => {
      const result = scanRegExpLiteral("/abc/", 0);
      expect(result.token.type).toBe(TokenType.RegExpLiteral);
      expect(result.token.raw).toBe("/abc/");
      expect(result.token.start).toBe(0);
      expect(result.token.end).toBe(5);
      expect(result.end).toBe(5);
      expect(result.token.value).toEqual(/abc/);
    });

    it("should scan a regex with a non-zero start offset", () => {
      const source = "x = /abc/;";
      const result = scanRegExpLiteral(source, 4);
      expect(result.token.raw).toBe("/abc/");
      expect(result.token.start).toBe(4);
      expect(result.token.end).toBe(9);
      expect(result.end).toBe(9);
    });

    it("should scan a single-character pattern /a/", () => {
      const result = scanRegExpLiteral("/a/", 0);
      expect(result.token.raw).toBe("/a/");
      expect(result.token.value).toEqual(/a/);
    });

    it("should scan a dot pattern /./", () => {
      const result = scanRegExpLiteral("/./", 0);
      expect(result.token.raw).toBe("/./");
      expect(result.token.value).toEqual(/./);
    });
  });

  describe("flags", () => {
    it("should scan regex with g flag: /abc/g", () => {
      const result = scanRegExpLiteral("/abc/g", 0);
      expect(result.token.raw).toBe("/abc/g");
      expect(result.token.value).toEqual(/abc/g);
      expect(result.end).toBe(6);
    });

    it("should scan regex with gi flags: /abc/gi", () => {
      const result = scanRegExpLiteral("/abc/gi", 0);
      expect(result.token.raw).toBe("/abc/gi");
      expect(result.token.value).toEqual(/abc/gi);
    });

    it("should scan regex with all valid flags except v: /a/dgimsuy", () => {
      const result = scanRegExpLiteral("/a/dgimsy", 0);
      expect(result.token.raw).toBe("/a/dgimsy");
      expect(result.end).toBe(9);
    });

    it("should scan regex with d flag (hasIndices): /a/d", () => {
      const result = scanRegExpLiteral("/a/d", 0);
      expect(result.token.raw).toBe("/a/d");
      expect(result.token.value).toEqual(/a/d);
    });

    it("should scan regex with s flag (dotAll): /a/s", () => {
      const result = scanRegExpLiteral("/a/s", 0);
      expect(result.token.raw).toBe("/a/s");
      expect(result.token.value).toEqual(/a/s);
    });

    it("should scan regex with u flag (unicode): /a/u", () => {
      const result = scanRegExpLiteral("/a/u", 0);
      expect(result.token.raw).toBe("/a/u");
      expect(result.token.value).toEqual(/a/u);
    });

    it("should scan regex with v flag (unicodeSets): /a/v", () => {
      const result = scanRegExpLiteral("/a/v", 0);
      expect(result.token.raw).toBe("/a/v");
      expect(result.end).toBe(4);
      // Value may be a RegExp or the raw string if the runtime lacks v-flag support
      expect(
        result.token.value instanceof RegExp || result.token.value === "/a/v",
      ).toBe(true);
    });

    it("should scan regex with y flag (sticky): /a/y", () => {
      const result = scanRegExpLiteral("/a/y", 0);
      expect(result.token.raw).toBe("/a/y");
      expect(result.token.value).toEqual(/a/y);
    });

    it("should scan regex with m flag (multiline): /a/m", () => {
      const result = scanRegExpLiteral("/a/m", 0);
      expect(result.token.raw).toBe("/a/m");
      expect(result.token.value).toEqual(/a/m);
    });

    it("should scan regex with i flag (ignoreCase): /a/i", () => {
      const result = scanRegExpLiteral("/a/i", 0);
      expect(result.token.raw).toBe("/a/i");
      expect(result.token.value).toEqual(/a/i);
    });

    it("should throw on duplicate flag: /a/gg", () => {
      expect(() => scanRegExpLiteral("/a/gg", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("/a/gg", 0)).toThrow(/Duplicate/);
    });

    it("should throw on duplicate flag in mixed set: /a/gig", () => {
      expect(() => scanRegExpLiteral("/a/gig", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("/a/gig", 0)).toThrow(/Duplicate/);
    });

    it("should throw on u and v together: /a/uv", () => {
      expect(() => scanRegExpLiteral("/a/uv", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("/a/uv", 0)).toThrow(/mutually exclusive/);
    });

    it("should throw on v and u together: /a/vu", () => {
      expect(() => scanRegExpLiteral("/a/vu", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("/a/vu", 0)).toThrow(/mutually exclusive/);
    });

    it("should throw on invalid flag: /a/z", () => {
      expect(() => scanRegExpLiteral("/a/z", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("/a/z", 0)).toThrow(/Invalid.*flag/);
    });

    it("should throw on invalid flag character: /a/x", () => {
      expect(() => scanRegExpLiteral("/a/x", 0)).toThrow(SyntaxError);
    });

    it("should throw on invalid uppercase flag: /a/G", () => {
      expect(() => scanRegExpLiteral("/a/G", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("/a/G", 0)).toThrow(/Invalid.*flag/);
    });

    it("should scan regex with no flags followed by other chars", () => {
      const result = scanRegExpLiteral("/abc/;", 0);
      expect(result.token.raw).toBe("/abc/");
      expect(result.end).toBe(5);
    });

    it("should stop flag scanning at non-alpha character", () => {
      const result = scanRegExpLiteral("/abc/g.test", 0);
      expect(result.token.raw).toBe("/abc/g");
      expect(result.end).toBe(6);
    });
  });

  describe("character classes", () => {
    it("should scan regex with character class: /[abc]/", () => {
      const result = scanRegExpLiteral("/[abc]/", 0);
      expect(result.token.raw).toBe("/[abc]/");
      expect(result.token.value).toEqual(/[abc]/);
    });

    it("should handle slash inside character class: /[/]/", () => {
      const result = scanRegExpLiteral("/[/]/", 0);
      expect(result.token.raw).toBe("/[/]/");
      expect(result.end).toBe(5);
    });

    it("should handle multiple slashes inside character class: /[//]/", () => {
      const result = scanRegExpLiteral("/[//]/", 0);
      expect(result.token.raw).toBe("/[//]/");
      expect(result.end).toBe(6);
    });

    it("should handle nested brackets: /[\\]]/", () => {
      const result = scanRegExpLiteral("/[\\]]/", 0);
      expect(result.token.raw).toBe("/[\\]]/");
      expect(result.end).toBe(6);
    });

    it("should handle character class at end of pattern: /a[bc]/", () => {
      const result = scanRegExpLiteral("/a[bc]/", 0);
      expect(result.token.raw).toBe("/a[bc]/");
    });

    it("should handle character class range: /[a-z]/", () => {
      const result = scanRegExpLiteral("/[a-z]/", 0);
      expect(result.token.raw).toBe("/[a-z]/");
      expect(result.token.value).toEqual(/[a-z]/);
    });

    it("should handle negated character class: /[^abc]/", () => {
      const result = scanRegExpLiteral("/[^abc]/", 0);
      expect(result.token.raw).toBe("/[^abc]/");
      expect(result.token.value).toEqual(/[^abc]/);
    });
  });

  describe("escape sequences", () => {
    it("should handle escaped digit: /\\d+/", () => {
      const result = scanRegExpLiteral("/\\d+/", 0);
      expect(result.token.raw).toBe("/\\d+/");
      expect(result.token.value).toEqual(/\d+/);
    });

    it("should handle escaped word: /\\w+/", () => {
      const result = scanRegExpLiteral("/\\w+/", 0);
      expect(result.token.raw).toBe("/\\w+/");
    });

    it("should handle escaped slash: /\\//  ", () => {
      const result = scanRegExpLiteral("/\\//", 0);
      expect(result.token.raw).toBe("/\\//");
      expect(result.end).toBe(4);
    });

    it("should handle escaped backslash: /\\\\/", () => {
      const result = scanRegExpLiteral("/\\\\/", 0);
      expect(result.token.raw).toBe("/\\\\/");
    });

    it("should handle escaped bracket in pattern: /\\[/", () => {
      const result = scanRegExpLiteral("/\\[/", 0);
      expect(result.token.raw).toBe("/\\[/");
    });

    it("should throw on escape at end of source", () => {
      expect(() => scanRegExpLiteral("/abc\\", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("/abc\\", 0)).toThrow(/Unterminated/);
    });
  });

  describe("error cases", () => {
    it("should throw on empty regex pattern (//)", () => {
      expect(() => scanRegExpLiteral("//", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("//", 0)).toThrow(/Empty/);
    });

    it("should throw on unterminated regex at end of source", () => {
      expect(() => scanRegExpLiteral("/abc", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("/abc", 0)).toThrow(/Unterminated/);
    });

    it("should throw on unterminated regex with newline", () => {
      expect(() => scanRegExpLiteral("/abc\n/", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("/abc\n/", 0)).toThrow(/Unterminated/);
    });

    it("should throw on unterminated regex with carriage return", () => {
      expect(() => scanRegExpLiteral("/abc\r/", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("/abc\r/", 0)).toThrow(/Unterminated/);
    });

    it("should throw on unterminated regex with only opening slash", () => {
      expect(() => scanRegExpLiteral("/", 0)).toThrow(SyntaxError);
    });

    it("should throw on unterminated character class", () => {
      expect(() => scanRegExpLiteral("/[abc", 0)).toThrow(SyntaxError);
      expect(() => scanRegExpLiteral("/[abc", 0)).toThrow(/Unterminated/);
    });
  });

  describe("complex patterns", () => {
    it("should scan regex with quantifiers: /a{1,3}/", () => {
      const result = scanRegExpLiteral("/a{1,3}/", 0);
      expect(result.token.raw).toBe("/a{1,3}/");
      expect(result.token.value).toEqual(/a{1,3}/);
    });

    it("should scan regex with alternation: /a|b/", () => {
      const result = scanRegExpLiteral("/a|b/", 0);
      expect(result.token.raw).toBe("/a|b/");
      expect(result.token.value).toEqual(/a|b/);
    });

    it("should scan regex with groups: /(abc)/", () => {
      const result = scanRegExpLiteral("/(abc)/", 0);
      expect(result.token.raw).toBe("/(abc)/");
      expect(result.token.value).toEqual(/(abc)/);
    });

    it("should scan regex with named capture group: /(?<name>abc)/", () => {
      const result = scanRegExpLiteral("/(?<name>abc)/", 0);
      expect(result.token.raw).toBe("/(?<name>abc)/");
      expect(result.token.value).toEqual(/(?<name>abc)/);
    });

    it("should scan regex with lookbehind: /(?<=abc)def/", () => {
      const result = scanRegExpLiteral("/(?<=abc)def/", 0);
      expect(result.token.raw).toBe("/(?<=abc)def/");
      expect(result.token.value).toEqual(/(?<=abc)def/);
    });

    it("should scan regex with negative lookbehind: /(?<!abc)def/", () => {
      const result = scanRegExpLiteral("/(?<!abc)def/", 0);
      expect(result.token.raw).toBe("/(?<!abc)def/");
    });

    it("should scan regex with unicode property escape: /\\p{Letter}/u", () => {
      const result = scanRegExpLiteral("/\\p{Letter}/u", 0);
      expect(result.token.raw).toBe("/\\p{Letter}/u");
    });

    it("should scan regex with anchors: /^abc$/", () => {
      const result = scanRegExpLiteral("/^abc$/", 0);
      expect(result.token.raw).toBe("/^abc$/");
      expect(result.token.value).toEqual(/^abc$/);
    });

    it("should scan regex with multiple character classes and flags", () => {
      const result = scanRegExpLiteral("/[a-z][0-9]+/gi", 0);
      expect(result.token.raw).toBe("/[a-z][0-9]+/gi");
      expect(result.token.value).toEqual(/[a-z][0-9]+/gi);
    });

    it("should scan regex with escaped chars inside character class", () => {
      const result = scanRegExpLiteral("/[\\d\\w]/", 0);
      expect(result.token.raw).toBe("/[\\d\\w]/");
    });

    it("should scan a complex real-world regex", () => {
      const result = scanRegExpLiteral(
        "/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/i",
        0,
      );
      expect(result.token.raw).toBe(
        "/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/i",
      );
    });
  });

  describe("token properties", () => {
    it("should produce a frozen ScanResult", () => {
      const result = scanRegExpLiteral("/abc/", 0);
      expect(Object.isFrozen(result)).toBe(true);
    });

    it("should produce a frozen token", () => {
      const result = scanRegExpLiteral("/abc/", 0);
      expect(Object.isFrozen(result.token)).toBe(true);
    });

    it("should have correct token type", () => {
      const result = scanRegExpLiteral("/abc/g", 0);
      expect(result.token.type).toBe(TokenType.RegExpLiteral);
    });
  });
});

describe("isRegExpStart", () => {
  describe("returns false (division) after expression-producing tokens", () => {
    it("should return false after Identifier", () => {
      expect(isRegExpStart(TokenType.Identifier)).toBe(false);
    });

    it("should return false after NumericLiteral", () => {
      expect(isRegExpStart(TokenType.NumericLiteral)).toBe(false);
    });

    it("should return false after StringLiteral", () => {
      expect(isRegExpStart(TokenType.StringLiteral)).toBe(false);
    });

    it("should return false after RegExpLiteral", () => {
      expect(isRegExpStart(TokenType.RegExpLiteral)).toBe(false);
    });

    it("should return false after RightParen", () => {
      expect(isRegExpStart(TokenType.RightParen)).toBe(false);
    });

    it("should return false after RightBracket", () => {
      expect(isRegExpStart(TokenType.RightBracket)).toBe(false);
    });

    it("should return false after RightBrace", () => {
      expect(isRegExpStart(TokenType.RightBrace)).toBe(false);
    });

    it("should return false after PlusPlus", () => {
      expect(isRegExpStart(TokenType.PlusPlus)).toBe(false);
    });

    it("should return false after MinusMinus", () => {
      expect(isRegExpStart(TokenType.MinusMinus)).toBe(false);
    });

    it("should return false after True", () => {
      expect(isRegExpStart(TokenType.True)).toBe(false);
    });

    it("should return false after False", () => {
      expect(isRegExpStart(TokenType.False)).toBe(false);
    });

    it("should return false after Null", () => {
      expect(isRegExpStart(TokenType.Null)).toBe(false);
    });

    it("should return false after This", () => {
      expect(isRegExpStart(TokenType.This)).toBe(false);
    });

    it("should return false after Super", () => {
      expect(isRegExpStart(TokenType.Super)).toBe(false);
    });

    it("should return false after TemplateLiteral", () => {
      expect(isRegExpStart(TokenType.TemplateLiteral)).toBe(false);
    });

    it("should return false after TemplateNoSub", () => {
      expect(isRegExpStart(TokenType.TemplateNoSub)).toBe(false);
    });

    it("should return false after BigIntLiteral", () => {
      expect(isRegExpStart(TokenType.BigIntLiteral)).toBe(false);
    });
  });

  describe("returns true (regex) after non-expression tokens", () => {
    it("should return true after Plus (operator)", () => {
      expect(isRegExpStart(TokenType.Plus)).toBe(true);
    });

    it("should return true after Minus (operator)", () => {
      expect(isRegExpStart(TokenType.Minus)).toBe(true);
    });

    it("should return true after Star (operator)", () => {
      expect(isRegExpStart(TokenType.Star)).toBe(true);
    });

    it("should return true after Slash (operator)", () => {
      expect(isRegExpStart(TokenType.Slash)).toBe(true);
    });

    it("should return true after LeftParen", () => {
      expect(isRegExpStart(TokenType.LeftParen)).toBe(true);
    });

    it("should return true after LeftBracket", () => {
      expect(isRegExpStart(TokenType.LeftBracket)).toBe(true);
    });

    it("should return true after LeftBrace", () => {
      expect(isRegExpStart(TokenType.LeftBrace)).toBe(true);
    });

    it("should return true after Equals", () => {
      expect(isRegExpStart(TokenType.Equals)).toBe(true);
    });

    it("should return true after Comma", () => {
      expect(isRegExpStart(TokenType.Comma)).toBe(true);
    });

    it("should return true after Semicolon", () => {
      expect(isRegExpStart(TokenType.Semicolon)).toBe(true);
    });

    it("should return true after Colon", () => {
      expect(isRegExpStart(TokenType.Colon)).toBe(true);
    });

    it("should return true after Return keyword", () => {
      expect(isRegExpStart(TokenType.Return)).toBe(true);
    });

    it("should return true after If keyword", () => {
      expect(isRegExpStart(TokenType.If)).toBe(true);
    });

    it("should return true after Typeof keyword", () => {
      expect(isRegExpStart(TokenType.Typeof)).toBe(true);
    });

    it("should return true after Delete keyword", () => {
      expect(isRegExpStart(TokenType.Delete)).toBe(true);
    });

    it("should return true after Void keyword", () => {
      expect(isRegExpStart(TokenType.Void)).toBe(true);
    });

    it("should return true after New keyword", () => {
      expect(isRegExpStart(TokenType.New)).toBe(true);
    });

    it("should return true after Throw keyword", () => {
      expect(isRegExpStart(TokenType.Throw)).toBe(true);
    });

    it("should return true after Case keyword", () => {
      expect(isRegExpStart(TokenType.Case)).toBe(true);
    });

    it("should return true after In keyword", () => {
      expect(isRegExpStart(TokenType.In)).toBe(true);
    });

    it("should return true after Instanceof keyword", () => {
      expect(isRegExpStart(TokenType.Instanceof)).toBe(true);
    });

    it("should return true after EOF (start of input)", () => {
      expect(isRegExpStart(TokenType.EOF)).toBe(true);
    });

    it("should return true after Exclamation", () => {
      expect(isRegExpStart(TokenType.Exclamation)).toBe(true);
    });

    it("should return true after EqualsEquals", () => {
      expect(isRegExpStart(TokenType.EqualsEquals)).toBe(true);
    });

    it("should return true after ExclamationEquals", () => {
      expect(isRegExpStart(TokenType.ExclamationEquals)).toBe(true);
    });

    it("should return true after EqualsEqualsEquals", () => {
      expect(isRegExpStart(TokenType.EqualsEqualsEquals)).toBe(true);
    });

    it("should return true after LessThan", () => {
      expect(isRegExpStart(TokenType.LessThan)).toBe(true);
    });

    it("should return true after GreaterThan", () => {
      expect(isRegExpStart(TokenType.GreaterThan)).toBe(true);
    });

    it("should return true after Arrow", () => {
      expect(isRegExpStart(TokenType.Arrow)).toBe(true);
    });

    it("should return true for unknown/negative token type (-1)", () => {
      expect(isRegExpStart(-1)).toBe(true);
    });

    it("should return true after assignment operators", () => {
      expect(isRegExpStart(TokenType.PlusEquals)).toBe(true);
      expect(isRegExpStart(TokenType.MinusEquals)).toBe(true);
      expect(isRegExpStart(TokenType.StarEquals)).toBe(true);
      expect(isRegExpStart(TokenType.SlashEquals)).toBe(true);
    });

    it("should return true after logical operators", () => {
      expect(isRegExpStart(TokenType.AmpersandAmpersand)).toBe(true);
      expect(isRegExpStart(TokenType.PipePipe)).toBe(true);
      expect(isRegExpStart(TokenType.QuestionQuestion)).toBe(true);
    });

    it("should return true after QuestionMark (ternary)", () => {
      expect(isRegExpStart(TokenType.QuestionMark)).toBe(true);
    });
  });
});
