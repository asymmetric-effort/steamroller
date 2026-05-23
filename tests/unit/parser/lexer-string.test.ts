import { describe, it, expect } from "vitest";
import {
  scanStringLiteral,
  scanTemplateLiteral,
  decodeEscapeSequence,
} from "../../../src/parser/lexer-string.js";
import { TokenType } from "../../../src/parser/token-types.js";

describe("decodeEscapeSequence", () => {
  describe("simple escape sequences", () => {
    it("should decode \\n", () => {
      const result = decodeEscapeSequence("\\n", 0, false);
      expect(result.char).toBe("\n");
      expect(result.length).toBe(2);
    });

    it("should decode \\r", () => {
      const result = decodeEscapeSequence("\\r", 0, false);
      expect(result.char).toBe("\r");
      expect(result.length).toBe(2);
    });

    it("should decode \\t", () => {
      const result = decodeEscapeSequence("\\t", 0, false);
      expect(result.char).toBe("\t");
      expect(result.length).toBe(2);
    });

    it("should decode \\b", () => {
      const result = decodeEscapeSequence("\\b", 0, false);
      expect(result.char).toBe("\b");
      expect(result.length).toBe(2);
    });

    it("should decode \\f", () => {
      const result = decodeEscapeSequence("\\f", 0, false);
      expect(result.char).toBe("\f");
      expect(result.length).toBe(2);
    });

    it("should decode \\v", () => {
      const result = decodeEscapeSequence("\\v", 0, false);
      expect(result.char).toBe("\v");
      expect(result.length).toBe(2);
    });

    it("should decode \\0 (null)", () => {
      const result = decodeEscapeSequence("\\0", 0, false);
      expect(result.char).toBe("\0");
      expect(result.length).toBe(2);
    });

    it("should decode \\0 followed by non-octal digit", () => {
      const result = decodeEscapeSequence("\\09", 0, false);
      expect(result.char).toBe("\0");
      expect(result.length).toBe(2);
    });

    it("should decode \\\\", () => {
      const result = decodeEscapeSequence("\\\\", 0, false);
      expect(result.char).toBe("\\");
      expect(result.length).toBe(2);
    });

    it("should decode \\'", () => {
      const result = decodeEscapeSequence("\\'", 0, false);
      expect(result.char).toBe("'");
      expect(result.length).toBe(2);
    });

    it('should decode \\"', () => {
      const result = decodeEscapeSequence('\\"', 0, false);
      expect(result.char).toBe('"');
      expect(result.length).toBe(2);
    });

    it("should decode \\`", () => {
      const result = decodeEscapeSequence("\\`", 0, false);
      expect(result.char).toBe("`");
      expect(result.length).toBe(2);
    });

    it("should decode \\$", () => {
      const result = decodeEscapeSequence("\\$", 0, false);
      expect(result.char).toBe("$");
      expect(result.length).toBe(2);
    });
  });

  describe("hex escapes", () => {
    it("should decode \\x41 as 'A'", () => {
      const result = decodeEscapeSequence("\\x41", 0, false);
      expect(result.char).toBe("A");
      expect(result.length).toBe(4);
    });

    it("should decode \\xFF", () => {
      const result = decodeEscapeSequence("\\xFF", 0, false);
      expect(result.char).toBe("\xFF");
      expect(result.length).toBe(4);
    });

    it("should decode \\x00", () => {
      const result = decodeEscapeSequence("\\x00", 0, false);
      expect(result.char).toBe("\x00");
      expect(result.length).toBe(4);
    });

    it("should throw on invalid hex escape (too short)", () => {
      expect(() => decodeEscapeSequence("\\xG", 0, false)).toThrow(SyntaxError);
    });

    it("should throw on hex escape with only one digit", () => {
      expect(() => decodeEscapeSequence("\\xA", 0, false)).toThrow(SyntaxError);
    });

    it("should throw on hex escape with invalid second digit", () => {
      expect(() => decodeEscapeSequence("\\xAG", 0, false)).toThrow(SyntaxError);
    });
  });

  describe("unicode escapes", () => {
    it("should decode \\u0041 as 'A'", () => {
      const result = decodeEscapeSequence("\\u0041", 0, false);
      expect(result.char).toBe("A");
      expect(result.length).toBe(6);
    });

    it("should decode \\u00e9 as 'e' with acute", () => {
      const result = decodeEscapeSequence("\\u00e9", 0, false);
      expect(result.char).toBe("\u00e9");
      expect(result.length).toBe(6);
    });

    it("should throw on unicode escape with too few digits", () => {
      expect(() => decodeEscapeSequence("\\u041", 0, false)).toThrow(SyntaxError);
    });

    it("should throw on unicode escape with invalid digits", () => {
      expect(() => decodeEscapeSequence("\\uGGGG", 0, false)).toThrow(SyntaxError);
    });
  });

  describe("unicode code point escapes", () => {
    it("should decode \\u{41} as 'A'", () => {
      const result = decodeEscapeSequence("\\u{41}", 0, false);
      expect(result.char).toBe("A");
      expect(result.length).toBe(6);
    });

    it("should decode \\u{1F600} as emoji", () => {
      const result = decodeEscapeSequence("\\u{1F600}", 0, false);
      expect(result.char).toBe("\u{1F600}");
      expect(result.length).toBe(9);
    });

    it("should decode \\u{0} as null character", () => {
      const result = decodeEscapeSequence("\\u{0}", 0, false);
      expect(result.char).toBe("\0");
      expect(result.length).toBe(5);
    });

    it("should throw on code point out of range", () => {
      expect(() => decodeEscapeSequence("\\u{110000}", 0, false)).toThrow(SyntaxError);
    });

    it("should throw on unterminated code point escape", () => {
      expect(() => decodeEscapeSequence("\\u{41", 0, false)).toThrow(SyntaxError);
    });

    it("should throw on empty code point escape", () => {
      expect(() => decodeEscapeSequence("\\u{}", 0, false)).toThrow(SyntaxError);
    });

    it("should throw on invalid hex in code point escape", () => {
      expect(() => decodeEscapeSequence("\\u{GG}", 0, false)).toThrow(SyntaxError);
    });
  });

  describe("octal escapes", () => {
    it("should decode \\1 in sloppy mode", () => {
      const result = decodeEscapeSequence("\\1", 0, false);
      expect(result.char).toBe("\x01");
      expect(result.length).toBe(2);
    });

    it("should decode \\77 in sloppy mode", () => {
      const result = decodeEscapeSequence("\\77", 0, false);
      expect(result.char).toBe("?");
      expect(result.length).toBe(3);
    });

    it("should decode \\377 in sloppy mode (max value)", () => {
      const result = decodeEscapeSequence("\\377", 0, false);
      expect(result.char).toBe("\xFF");
      expect(result.length).toBe(4);
    });

    it("should decode \\0 followed by octal digit as octal in sloppy mode", () => {
      const result = decodeEscapeSequence("\\01", 0, false);
      expect(result.char).toBe("\x01");
      expect(result.length).toBe(3);
    });

    it("should decode three-digit octal \\177", () => {
      const result = decodeEscapeSequence("\\177", 0, false);
      expect(result.char).toBe("\x7F");
      expect(result.length).toBe(4);
    });

    it("should decode two-digit octal when third is not octal", () => {
      const result = decodeEscapeSequence("\\129", 0, false);
      expect(result.char).toBe("\n");
      expect(result.length).toBe(3);
    });

    it("should limit three-digit octals to leading digits 0-3", () => {
      // \4xx only reads two digits since 4*64 > 255
      const result = decodeEscapeSequence("\\477", 0, false);
      expect(result.char).toBe(String.fromCharCode(4 * 8 + 7));
      expect(result.length).toBe(3);
    });

    it("should reject octal escapes in strict mode", () => {
      expect(() => decodeEscapeSequence("\\1", 0, true)).toThrow(SyntaxError);
    });

    it("should reject \\0 followed by octal digit in strict mode", () => {
      expect(() => decodeEscapeSequence("\\01", 0, true)).toThrow(SyntaxError);
    });
  });

  describe("line continuation", () => {
    it("should handle backslash before LF", () => {
      const result = decodeEscapeSequence("\\\n", 0, false);
      expect(result.char).toBe("");
      expect(result.length).toBe(2);
    });

    it("should handle backslash before CR", () => {
      const result = decodeEscapeSequence("\\\r", 0, false);
      expect(result.char).toBe("");
      expect(result.length).toBe(2);
    });

    it("should handle backslash before CRLF", () => {
      const result = decodeEscapeSequence("\\\r\n", 0, false);
      expect(result.char).toBe("");
      expect(result.length).toBe(3);
    });

    it("should handle backslash before LS (U+2028)", () => {
      const result = decodeEscapeSequence("\\\u2028", 0, false);
      expect(result.char).toBe("");
      expect(result.length).toBe(2);
    });

    it("should handle backslash before PS (U+2029)", () => {
      const result = decodeEscapeSequence("\\\u2029", 0, false);
      expect(result.char).toBe("");
      expect(result.length).toBe(2);
    });
  });

  describe("identity escapes", () => {
    it("should pass through unknown escape characters", () => {
      const result = decodeEscapeSequence("\\a", 0, false);
      expect(result.char).toBe("a");
      expect(result.length).toBe(2);
    });

    it("should reject \\8 in strict mode", () => {
      expect(() => decodeEscapeSequence("\\8", 0, true)).toThrow(SyntaxError);
    });

    it("should reject \\9 in strict mode", () => {
      expect(() => decodeEscapeSequence("\\9", 0, true)).toThrow(SyntaxError);
    });

    it("should allow \\8 in sloppy mode", () => {
      const result = decodeEscapeSequence("\\8", 0, false);
      expect(result.char).toBe("8");
      expect(result.length).toBe(2);
    });

    it("should allow \\9 in sloppy mode", () => {
      const result = decodeEscapeSequence("\\9", 0, false);
      expect(result.char).toBe("9");
      expect(result.length).toBe(2);
    });
  });

  describe("edge cases", () => {
    it("should throw on backslash at end of input", () => {
      expect(() => decodeEscapeSequence("\\", 0, false)).toThrow(SyntaxError);
    });

    it("should decode escape at non-zero position", () => {
      const result = decodeEscapeSequence("abc\\n", 3, false);
      expect(result.char).toBe("\n");
      expect(result.length).toBe(2);
    });
  });
});

describe("scanStringLiteral", () => {
  describe("double-quoted strings", () => {
    it("should scan an empty double-quoted string", () => {
      const result = scanStringLiteral('""', 0, false);
      expect(result.token.type).toBe(TokenType.StringLiteral);
      expect(result.token.value).toBe("");
      expect(result.token.raw).toBe('""');
      expect(result.token.start).toBe(0);
      expect(result.token.end).toBe(2);
      expect(result.end).toBe(2);
    });

    it("should scan a simple double-quoted string", () => {
      const result = scanStringLiteral('"hello"', 0, false);
      expect(result.token.value).toBe("hello");
      expect(result.token.raw).toBe('"hello"');
      expect(result.end).toBe(7);
    });

    it("should scan a string with escape sequences", () => {
      const result = scanStringLiteral('"a\\nb"', 0, false);
      expect(result.token.value).toBe("a\nb");
    });

    it("should scan a string at a non-zero offset", () => {
      const result = scanStringLiteral('x = "abc"', 4, false);
      expect(result.token.value).toBe("abc");
      expect(result.token.start).toBe(4);
      expect(result.token.end).toBe(9);
      expect(result.end).toBe(9);
    });
  });

  describe("single-quoted strings", () => {
    it("should scan an empty single-quoted string", () => {
      const result = scanStringLiteral("''", 0, false);
      expect(result.token.value).toBe("");
      expect(result.token.raw).toBe("''");
      expect(result.end).toBe(2);
    });

    it("should scan a simple single-quoted string", () => {
      const result = scanStringLiteral("'hello'", 0, false);
      expect(result.token.value).toBe("hello");
      expect(result.token.raw).toBe("'hello'");
    });

    it("should scan a single-quoted string with escaped quote", () => {
      const result = scanStringLiteral("'it\\'s'", 0, false);
      expect(result.token.value).toBe("it's");
    });
  });

  describe("escape sequences in strings", () => {
    it("should handle all simple escapes", () => {
      const result = scanStringLiteral('"\\n\\r\\t\\b\\f\\v\\0\\\\\\\'"', 0, false);
      expect(result.token.value).toBe("\n\r\t\b\f\v\0\\'");
    });

    it("should handle hex escapes", () => {
      const result = scanStringLiteral('"\\xFF"', 0, false);
      expect(result.token.value).toBe("\xFF");
    });

    it("should handle unicode escapes", () => {
      const result = scanStringLiteral('"\\u0041"', 0, false);
      expect(result.token.value).toBe("A");
    });

    it("should handle unicode code point escapes", () => {
      const result = scanStringLiteral('"\\u{1F600}"', 0, false);
      expect(result.token.value).toBe("\u{1F600}");
    });

    it("should handle octal escapes in sloppy mode", () => {
      const result = scanStringLiteral('"\\101"', 0, false);
      expect(result.token.value).toBe("A");
    });

    it("should reject octal escapes in strict mode", () => {
      expect(() => scanStringLiteral('"\\101"', 0, true)).toThrow(SyntaxError);
    });

    it("should handle line continuation", () => {
      const result = scanStringLiteral('"line\\\ncontinued"', 0, false);
      expect(result.token.value).toBe("linecontinued");
    });

    it("should handle escaped double quote in double-quoted string", () => {
      const result = scanStringLiteral('"say \\"hi\\""', 0, false);
      expect(result.token.value).toBe('say "hi"');
    });
  });

  describe("error cases", () => {
    it("should throw on unterminated string (EOF)", () => {
      expect(() => scanStringLiteral('"hello', 0, false)).toThrow(SyntaxError);
    });

    it("should throw on unterminated single-quoted string", () => {
      expect(() => scanStringLiteral("'hello", 0, false)).toThrow(SyntaxError);
    });

    it("should throw on string with unescaped newline", () => {
      expect(() => scanStringLiteral('"hello\nworld"', 0, false)).toThrow(SyntaxError);
    });

    it("should throw on string with unescaped CR", () => {
      expect(() => scanStringLiteral('"hello\rworld"', 0, false)).toThrow(SyntaxError);
    });

    it("should throw on string with unescaped LS", () => {
      expect(() => scanStringLiteral('"hello\u2028world"', 0, false)).toThrow(SyntaxError);
    });

    it("should throw on string with unescaped PS", () => {
      expect(() => scanStringLiteral('"hello\u2029world"', 0, false)).toThrow(SyntaxError);
    });

    it("should throw on invalid hex escape in string", () => {
      expect(() => scanStringLiteral('"\\xGG"', 0, false)).toThrow(SyntaxError);
    });

    it("should throw on invalid unicode escape in string", () => {
      expect(() => scanStringLiteral('"\\uZZZZ"', 0, false)).toThrow(SyntaxError);
    });
  });

  describe("string with multiple escapes", () => {
    it("should handle a complex string with many escape types", () => {
      const result = scanStringLiteral('"\\t\\x41\\u0042\\u{43}"', 0, false);
      expect(result.token.value).toBe("\tABC");
    });
  });
});

describe("scanTemplateLiteral", () => {
  describe("no-substitution templates", () => {
    it("should scan an empty template", () => {
      const result = scanTemplateLiteral("``", 0, true);
      expect(result.token.type).toBe(TokenType.TemplateNoSub);
      expect(result.token.value).toBe("");
      expect(result.token.raw).toBe("``");
      expect(result.token.start).toBe(0);
      expect(result.token.end).toBe(2);
      expect(result.end).toBe(2);
    });

    it("should scan a simple template with no substitutions", () => {
      const result = scanTemplateLiteral("`hello`", 0, true);
      expect(result.token.type).toBe(TokenType.TemplateNoSub);
      expect(result.token.value).toBe("hello");
      expect(result.token.raw).toBe("`hello`");
    });

    it("should scan a template with escape sequences", () => {
      const result = scanTemplateLiteral("`a\\nb`", 0, true);
      expect(result.token.type).toBe(TokenType.TemplateNoSub);
      expect(result.token.value).toBe("a\nb");
    });

    it("should handle newlines in template literals", () => {
      const result = scanTemplateLiteral("`line1\nline2`", 0, true);
      expect(result.token.value).toBe("line1\nline2");
    });

    it("should normalize CR to LF in templates", () => {
      const result = scanTemplateLiteral("`line1\rline2`", 0, true);
      expect(result.token.value).toBe("line1\nline2");
    });

    it("should normalize CRLF to LF in templates", () => {
      const result = scanTemplateLiteral("`line1\r\nline2`", 0, true);
      expect(result.token.value).toBe("line1\nline2");
    });

    it("should handle a dollar sign without brace", () => {
      const result = scanTemplateLiteral("`$100`", 0, true);
      expect(result.token.type).toBe(TokenType.TemplateNoSub);
      expect(result.token.value).toBe("$100");
    });
  });

  describe("template with substitutions", () => {
    it("should scan a template head", () => {
      const result = scanTemplateLiteral("`hello ${name}`", 0, true);
      expect(result.token.type).toBe(TokenType.TemplateHead);
      expect(result.token.value).toBe("hello ");
      expect(result.token.raw).toBe("`hello ${");
      expect(result.end).toBe(9);
    });

    it("should scan a template tail after substitution", () => {
      // Simulates continuing after the } of ${name}
      const source = "} world`";
      const result = scanTemplateLiteral(source, 0, false);
      expect(result.token.type).toBe(TokenType.TemplateTail);
      expect(result.token.value).toBe(" world");
      expect(result.token.raw).toBe("} world`");
    });

    it("should scan a template middle", () => {
      // Simulates continuing after the } between two substitutions
      const source = "} middle ${";
      const result = scanTemplateLiteral(source, 0, false);
      expect(result.token.type).toBe(TokenType.TemplateMiddle);
      expect(result.token.value).toBe(" middle ");
      expect(result.token.raw).toBe("} middle ${");
    });

    it("should scan template with only substitution: `${x}`", () => {
      const head = scanTemplateLiteral("`${x}`", 0, true);
      expect(head.token.type).toBe(TokenType.TemplateHead);
      expect(head.token.value).toBe("");
      expect(head.token.raw).toBe("`${");
      expect(head.end).toBe(3);
    });

    it("should scan template tail with empty content", () => {
      const source = "}`";
      const result = scanTemplateLiteral(source, 0, false);
      expect(result.token.type).toBe(TokenType.TemplateTail);
      expect(result.token.value).toBe("");
    });

    it("should scan template head with escape before substitution", () => {
      const result = scanTemplateLiteral("`\\n${x}`", 0, true);
      expect(result.token.type).toBe(TokenType.TemplateHead);
      expect(result.token.value).toBe("\n");
    });
  });

  describe("escape sequences in templates", () => {
    it("should handle \\n in template", () => {
      const result = scanTemplateLiteral("`a\\nb`", 0, true);
      expect(result.token.value).toBe("a\nb");
    });

    it("should handle hex escape in template", () => {
      const result = scanTemplateLiteral("`\\x41`", 0, true);
      expect(result.token.value).toBe("A");
    });

    it("should handle unicode escape in template", () => {
      const result = scanTemplateLiteral("`\\u0042`", 0, true);
      expect(result.token.value).toBe("B");
    });

    it("should handle code point escape in template", () => {
      const result = scanTemplateLiteral("`\\u{43}`", 0, true);
      expect(result.token.value).toBe("C");
    });

    it("should handle escaped backtick in template", () => {
      const result = scanTemplateLiteral("`\\``", 0, true);
      expect(result.token.value).toBe("`");
    });

    it("should handle escaped dollar-brace in template", () => {
      const result = scanTemplateLiteral("`\\${x}`", 0, true);
      expect(result.token.type).toBe(TokenType.TemplateNoSub);
      expect(result.token.value).toBe("${x}");
    });

    it("should handle octal escapes in templates (non-strict)", () => {
      const result = scanTemplateLiteral("`\\101`", 0, true);
      expect(result.token.value).toBe("A");
    });

    it("should handle line continuation in template", () => {
      const result = scanTemplateLiteral("`line\\\ncontinued`", 0, true);
      expect(result.token.value).toBe("linecontinued");
    });
  });

  describe("raw value preservation", () => {
    it("should preserve raw source text including delimiters", () => {
      const result = scanTemplateLiteral("`hello`", 0, true);
      expect(result.token.raw).toBe("`hello`");
    });

    it("should preserve raw source text for template head", () => {
      const result = scanTemplateLiteral("`hello ${", 0, true);
      expect(result.token.raw).toBe("`hello ${");
    });

    it("should preserve raw source text for template tail", () => {
      const result = scanTemplateLiteral("} world`", 0, false);
      expect(result.token.raw).toBe("} world`");
    });

    it("should preserve raw text with escape sequences", () => {
      const result = scanTemplateLiteral("`\\n`", 0, true);
      expect(result.token.raw).toBe("`\\n`");
      expect(result.token.value).toBe("\n");
    });
  });

  describe("error cases", () => {
    it("should throw on unterminated template", () => {
      expect(() => scanTemplateLiteral("`hello", 0, true)).toThrow(SyntaxError);
    });

    it("should throw on unterminated template after escape", () => {
      expect(() => scanTemplateLiteral("`hello\\", 0, true)).toThrow(SyntaxError);
    });

    it("should throw on invalid hex escape in template", () => {
      expect(() => scanTemplateLiteral("`\\xGG`", 0, true)).toThrow(SyntaxError);
    });

    it("should throw on invalid unicode escape in template", () => {
      expect(() => scanTemplateLiteral("`\\uZZZZ`", 0, true)).toThrow(SyntaxError);
    });

    it("should throw on unterminated template tail", () => {
      expect(() => scanTemplateLiteral("} hello", 0, false)).toThrow(SyntaxError);
    });
  });

  describe("multiple substitutions simulation", () => {
    it("should correctly scan head, then middle, then tail", () => {
      // Template: `a${x}b${y}c`
      const source = "`a${x}b${y}c`";

      // Scan head: `a${
      const head = scanTemplateLiteral(source, 0, true);
      expect(head.token.type).toBe(TokenType.TemplateHead);
      expect(head.token.value).toBe("a");
      expect(head.end).toBe(4); // past ${

      // In a real lexer, we'd scan x, then encounter } at position 5
      // Scan middle from }: }b${
      const middleSource = source.slice(5); // "}b${y}c`"
      const middle = scanTemplateLiteral(middleSource, 0, false);
      expect(middle.token.type).toBe(TokenType.TemplateMiddle);
      expect(middle.token.value).toBe("b");
      expect(middle.end).toBe(4); // past ${

      // Scan tail from }: }c`
      const tailSource = middleSource.slice(5); // "}c`"
      const tail = scanTemplateLiteral(tailSource, 0, false);
      expect(tail.token.type).toBe(TokenType.TemplateTail);
      expect(tail.token.value).toBe("c");
    });
  });

  describe("template at non-zero offset", () => {
    it("should scan template starting at non-zero position", () => {
      const result = scanTemplateLiteral("x = `abc`", 4, true);
      expect(result.token.type).toBe(TokenType.TemplateNoSub);
      expect(result.token.value).toBe("abc");
      expect(result.token.start).toBe(4);
      expect(result.token.end).toBe(9);
      expect(result.end).toBe(9);
    });
  });
});
