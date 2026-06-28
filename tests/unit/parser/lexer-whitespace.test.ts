import { describe, it, expect } from "bun:test";
import {
  isWhitespace,
  isLineTerminator,
  skipWhitespace,
  scanLineComment,
  scanBlockComment,
  scanHashbang,
  getPureAnnotation,
  isRestrictedProduction,
  shouldInsertSemicolon,
} from "../../../src/parser/lexer-whitespace.js";
import type {
  PureAnnotation,
  AsiContext,
} from "../../../src/parser/lexer-whitespace.js";
import { TokenType } from "../../../src/parser/token-types.js";

describe("isWhitespace", () => {
  it("should return true for space (0x20)", () => {
    expect(isWhitespace(0x20)).toBe(true);
  });

  it("should return true for tab (0x09)", () => {
    expect(isWhitespace(0x09)).toBe(true);
  });

  it("should return true for vertical tab (0x0B)", () => {
    expect(isWhitespace(0x0b)).toBe(true);
  });

  it("should return true for form feed (0x0C)", () => {
    expect(isWhitespace(0x0c)).toBe(true);
  });

  it("should return true for no-break space (0xA0)", () => {
    expect(isWhitespace(0xa0)).toBe(true);
  });

  it("should return true for BOM (0xFEFF)", () => {
    expect(isWhitespace(0xfeff)).toBe(true);
  });

  it("should return true for Unicode Zs category: ogham space (0x1680)", () => {
    expect(isWhitespace(0x1680)).toBe(true);
  });

  it("should return true for Unicode Zs category: en space (0x2000)", () => {
    expect(isWhitespace(0x2000)).toBe(true);
  });

  it("should return true for Unicode Zs category: hair space (0x200A)", () => {
    expect(isWhitespace(0x200a)).toBe(true);
  });

  it("should return true for Unicode Zs category: narrow no-break space (0x202F)", () => {
    expect(isWhitespace(0x202f)).toBe(true);
  });

  it("should return true for Unicode Zs category: medium mathematical space (0x205F)", () => {
    expect(isWhitespace(0x205f)).toBe(true);
  });

  it("should return true for Unicode Zs category: ideographic space (0x3000)", () => {
    expect(isWhitespace(0x3000)).toBe(true);
  });

  it("should return false for letter A (0x41)", () => {
    expect(isWhitespace(0x41)).toBe(false);
  });

  it("should return false for digit 0 (0x30)", () => {
    expect(isWhitespace(0x30)).toBe(false);
  });

  it("should return false for line feed (0x0A)", () => {
    expect(isWhitespace(0x0a)).toBe(false);
  });

  it("should return false for carriage return (0x0D)", () => {
    expect(isWhitespace(0x0d)).toBe(false);
  });

  it("should return false for line separator (0x2028)", () => {
    expect(isWhitespace(0x2028)).toBe(false);
  });

  it("should return false for paragraph separator (0x2029)", () => {
    expect(isWhitespace(0x2029)).toBe(false);
  });

  it("should return false for null (0x00)", () => {
    expect(isWhitespace(0x00)).toBe(false);
  });

  it("should return false for exclamation mark (0x21)", () => {
    expect(isWhitespace(0x21)).toBe(false);
  });
});

describe("isLineTerminator", () => {
  it("should return true for LF (0x0A)", () => {
    expect(isLineTerminator(0x0a)).toBe(true);
  });

  it("should return true for CR (0x0D)", () => {
    expect(isLineTerminator(0x0d)).toBe(true);
  });

  it("should return true for line separator (0x2028)", () => {
    expect(isLineTerminator(0x2028)).toBe(true);
  });

  it("should return true for paragraph separator (0x2029)", () => {
    expect(isLineTerminator(0x2029)).toBe(true);
  });

  it("should return false for space (0x20)", () => {
    expect(isLineTerminator(0x20)).toBe(false);
  });

  it("should return false for tab (0x09)", () => {
    expect(isLineTerminator(0x09)).toBe(false);
  });

  it("should return false for letter A (0x41)", () => {
    expect(isLineTerminator(0x41)).toBe(false);
  });

  it("should return false for null (0x00)", () => {
    expect(isLineTerminator(0x00)).toBe(false);
  });

  it("should return false for vertical tab (0x0B)", () => {
    expect(isLineTerminator(0x0b)).toBe(false);
  });
});

describe("skipWhitespace", () => {
  it("should skip spaces", () => {
    const result = skipWhitespace("   abc", 0);
    expect(result.end).toBe(3);
    expect(result.hadLineTerminator).toBe(false);
  });

  it("should skip tabs", () => {
    const result = skipWhitespace("\t\tabc", 0);
    expect(result.end).toBe(2);
    expect(result.hadLineTerminator).toBe(false);
  });

  it("should skip mixed spaces and tabs", () => {
    const result = skipWhitespace(" \t \t abc", 0);
    expect(result.end).toBe(5);
    expect(result.hadLineTerminator).toBe(false);
  });

  it("should report line terminator presence with LF", () => {
    const result = skipWhitespace("  \n  abc", 0);
    expect(result.end).toBe(5);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should report line terminator presence with CR", () => {
    const result = skipWhitespace("  \r  abc", 0);
    expect(result.end).toBe(5);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should handle CRLF as a single line terminator", () => {
    const result = skipWhitespace("\r\nabc", 0);
    expect(result.end).toBe(2);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should handle line separator (U+2028)", () => {
    const result = skipWhitespace("\u2028abc", 0);
    expect(result.end).toBe(1);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should handle paragraph separator (U+2029)", () => {
    const result = skipWhitespace("\u2029abc", 0);
    expect(result.end).toBe(1);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should handle mixed whitespace and line terminators", () => {
    const result = skipWhitespace(" \t\n \t\r\n  abc", 0);
    expect(result.end).toBe(9);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should return same position if no whitespace", () => {
    const result = skipWhitespace("abc", 0);
    expect(result.end).toBe(0);
    expect(result.hadLineTerminator).toBe(false);
  });

  it("should handle empty string", () => {
    const result = skipWhitespace("", 0);
    expect(result.end).toBe(0);
    expect(result.hadLineTerminator).toBe(false);
  });

  it("should start from a non-zero position", () => {
    const result = skipWhitespace("abc   def", 3);
    expect(result.end).toBe(6);
    expect(result.hadLineTerminator).toBe(false);
  });

  it("should handle all whitespace with no non-whitespace", () => {
    const result = skipWhitespace("   ", 0);
    expect(result.end).toBe(3);
    expect(result.hadLineTerminator).toBe(false);
  });

  it("should handle multiple consecutive line terminators", () => {
    const result = skipWhitespace("\n\n\n", 0);
    expect(result.end).toBe(3);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should handle position at end of string", () => {
    const result = skipWhitespace("abc", 3);
    expect(result.end).toBe(3);
    expect(result.hadLineTerminator).toBe(false);
  });

  it("should skip BOM character", () => {
    const result = skipWhitespace("\uFEFF abc", 0);
    expect(result.end).toBe(2);
    expect(result.hadLineTerminator).toBe(false);
  });

  it("should skip no-break space", () => {
    const result = skipWhitespace("\u00A0abc", 0);
    expect(result.end).toBe(1);
    expect(result.hadLineTerminator).toBe(false);
  });
});

describe("scanLineComment", () => {
  it("should scan a simple line comment", () => {
    const result = scanLineComment("// hello world\nmore", 0);
    expect(result.end).toBe(14);
    expect(result.value).toBe(" hello world");
  });

  it("should scan a line comment to end of file", () => {
    const result = scanLineComment("// comment", 0);
    expect(result.end).toBe(10);
    expect(result.value).toBe(" comment");
  });

  it("should scan an empty line comment", () => {
    const result = scanLineComment("//\nmore", 0);
    expect(result.end).toBe(2);
    expect(result.value).toBe("");
  });

  it("should scan an empty line comment at EOF", () => {
    const result = scanLineComment("//", 0);
    expect(result.end).toBe(2);
    expect(result.value).toBe("");
  });

  it("should stop at CR", () => {
    const result = scanLineComment("// hello\rmore", 0);
    expect(result.end).toBe(8);
    expect(result.value).toBe(" hello");
  });

  it("should stop at CRLF", () => {
    const result = scanLineComment("// hello\r\nmore", 0);
    expect(result.end).toBe(8);
    expect(result.value).toBe(" hello");
  });

  it("should stop at line separator (U+2028)", () => {
    const result = scanLineComment("// hello\u2028more", 0);
    expect(result.end).toBe(8);
    expect(result.value).toBe(" hello");
  });

  it("should stop at paragraph separator (U+2029)", () => {
    const result = scanLineComment("// hello\u2029more", 0);
    expect(result.end).toBe(8);
    expect(result.value).toBe(" hello");
  });

  it("should scan a line comment at a non-zero start", () => {
    const result = scanLineComment("x; // comment\nnext", 3);
    expect(result.end).toBe(13);
    expect(result.value).toBe(" comment");
  });

  it("should handle comment with special characters", () => {
    const result = scanLineComment("// @ts-ignore", 0);
    expect(result.value).toBe(" @ts-ignore");
  });
});

describe("scanBlockComment", () => {
  it("should scan a simple block comment", () => {
    const result = scanBlockComment("/* hello */", 0);
    expect(result.end).toBe(11);
    expect(result.value).toBe(" hello ");
    expect(result.hadLineTerminator).toBe(false);
  });

  it("should scan a block comment with no content", () => {
    const result = scanBlockComment("/**/", 0);
    expect(result.end).toBe(4);
    expect(result.value).toBe("");
    expect(result.hadLineTerminator).toBe(false);
  });

  it("should scan a multi-line block comment", () => {
    const result = scanBlockComment("/* line1\nline2 */", 0);
    expect(result.end).toBe(17);
    expect(result.value).toBe(" line1\nline2 ");
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should detect CR line terminator", () => {
    const result = scanBlockComment("/* line1\rline2 */", 0);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should detect CRLF line terminator", () => {
    const result = scanBlockComment("/* line1\r\nline2 */", 0);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should detect line separator (U+2028)", () => {
    const result = scanBlockComment("/* line1\u2028line2 */", 0);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should detect paragraph separator (U+2029)", () => {
    const result = scanBlockComment("/* line1\u2029line2 */", 0);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should throw on unterminated block comment", () => {
    expect(() => scanBlockComment("/* unterminated", 0)).toThrow(
      "Unterminated block comment at position 0",
    );
  });

  it("should throw on unterminated block comment with only opening", () => {
    expect(() => scanBlockComment("/*", 0)).toThrow(
      "Unterminated block comment at position 0",
    );
  });

  it("should scan a block comment at a non-zero start", () => {
    const result = scanBlockComment("x = /* comment */ y", 4);
    expect(result.end).toBe(17);
    expect(result.value).toBe(" comment ");
  });

  it("should handle block comment with stars inside", () => {
    const result = scanBlockComment("/*** star ***/", 0);
    expect(result.end).toBe(14);
    expect(result.value).toBe("** star **");
  });

  it("should handle block comment with a star not followed by slash", () => {
    const result = scanBlockComment("/* a * b */", 0);
    expect(result.end).toBe(11);
    expect(result.value).toBe(" a * b ");
  });

  it("should throw on block comment ending with star but no slash", () => {
    expect(() => scanBlockComment("/* hello *", 0)).toThrow(
      "Unterminated block comment at position 0",
    );
  });

  it("should handle CRLF inside block comment (counted as one terminator crossing)", () => {
    const result = scanBlockComment("/*\r\n*/", 0);
    expect(result.end).toBe(6);
    expect(result.hadLineTerminator).toBe(true);
  });

  it("should report position in error for non-zero start", () => {
    expect(() => scanBlockComment("abc /* oops", 4)).toThrow(
      "Unterminated block comment at position 4",
    );
  });
});

describe("scanHashbang", () => {
  it("should scan a valid hashbang at position 0", () => {
    const result = scanHashbang("#!/usr/bin/env node\nconsole.log(1)");
    expect(result).not.toBeNull();
    expect(result!.end).toBe(19);
    expect(result!.value).toBe("#!/usr/bin/env node");
  });

  it("should return null if source does not start with #!", () => {
    const result = scanHashbang("// not a hashbang");
    expect(result).toBeNull();
  });

  it("should return null for empty string", () => {
    const result = scanHashbang("");
    expect(result).toBeNull();
  });

  it("should return null if only # without !", () => {
    const result = scanHashbang("#foo");
    expect(result).toBeNull();
  });

  it("should scan hashbang to end of file if no newline", () => {
    const result = scanHashbang("#!/usr/bin/env node");
    expect(result).not.toBeNull();
    expect(result!.end).toBe(19);
    expect(result!.value).toBe("#!/usr/bin/env node");
  });

  it("should stop at CR", () => {
    const result = scanHashbang("#!/bin/sh\rcode");
    expect(result).not.toBeNull();
    expect(result!.end).toBe(9);
    expect(result!.value).toBe("#!/bin/sh");
  });

  it("should stop at line separator", () => {
    const result = scanHashbang("#!/bin/sh\u2028code");
    expect(result).not.toBeNull();
    expect(result!.end).toBe(9);
    expect(result!.value).toBe("#!/bin/sh");
  });

  it("should return null if source is only one character", () => {
    const result = scanHashbang("#");
    expect(result).toBeNull();
  });

  it("should handle hashbang with just #!", () => {
    const result = scanHashbang("#!");
    expect(result).not.toBeNull();
    expect(result!.end).toBe(2);
    expect(result!.value).toBe("#!");
  });
});

describe("getPureAnnotation", () => {
  it("should detect @__PURE__", () => {
    const result = getPureAnnotation("@__PURE__");
    expect(result).toBe("@__PURE__");
  });

  it("should detect #__PURE__", () => {
    const result = getPureAnnotation("#__PURE__");
    expect(result).toBe("#__PURE__");
  });

  it("should detect @__NO_SIDE_EFFECTS__", () => {
    const result = getPureAnnotation("@__NO_SIDE_EFFECTS__");
    expect(result).toBe("@__NO_SIDE_EFFECTS__");
  });

  it("should detect annotation with leading whitespace", () => {
    const result = getPureAnnotation("  @__PURE__");
    expect(result).toBe("@__PURE__");
  });

  it("should detect annotation with trailing whitespace", () => {
    const result = getPureAnnotation("@__PURE__  ");
    expect(result).toBe("@__PURE__");
  });

  it("should detect annotation with surrounding whitespace", () => {
    const result = getPureAnnotation("  #__PURE__  ");
    expect(result).toBe("#__PURE__");
  });

  it("should return null for ordinary comment text", () => {
    const result = getPureAnnotation(" this is a comment ");
    expect(result).toBeNull();
  });

  it("should return null for empty string", () => {
    const result = getPureAnnotation("");
    expect(result).toBeNull();
  });

  it("should return null for partial annotation", () => {
    const result = getPureAnnotation("@__PURE");
    expect(result).toBeNull();
  });

  it("should return null for annotation with extra text", () => {
    const result = getPureAnnotation("@__PURE__ extra");
    expect(result).toBeNull();
  });

  it("should return null for case-variant annotation", () => {
    const result = getPureAnnotation("@__pure__");
    expect(result).toBeNull();
  });
});

describe("isRestrictedProduction", () => {
  it("should return true for Return", () => {
    expect(isRestrictedProduction(TokenType.Return)).toBe(true);
  });

  it("should return true for Throw", () => {
    expect(isRestrictedProduction(TokenType.Throw)).toBe(true);
  });

  it("should return true for Break", () => {
    expect(isRestrictedProduction(TokenType.Break)).toBe(true);
  });

  it("should return true for Continue", () => {
    expect(isRestrictedProduction(TokenType.Continue)).toBe(true);
  });

  it("should return true for Yield", () => {
    expect(isRestrictedProduction(TokenType.Yield)).toBe(true);
  });

  it("should return false for Identifier", () => {
    expect(isRestrictedProduction(TokenType.Identifier)).toBe(false);
  });

  it("should return false for If", () => {
    expect(isRestrictedProduction(TokenType.If)).toBe(false);
  });

  it("should return false for While", () => {
    expect(isRestrictedProduction(TokenType.While)).toBe(false);
  });

  it("should return false for Function", () => {
    expect(isRestrictedProduction(TokenType.Function)).toBe(false);
  });

  it("should return false for EOF", () => {
    expect(isRestrictedProduction(TokenType.EOF)).toBe(false);
  });

  it("should return false for Semicolon", () => {
    expect(isRestrictedProduction(TokenType.Semicolon)).toBe(false);
  });
});

describe("shouldInsertSemicolon", () => {
  it("should return true when current token is EOF", () => {
    const context: AsiContext = {
      hadLineTerminatorBefore: false,
      currentTokenType: TokenType.EOF,
      previousTokenType: TokenType.Identifier,
    };
    expect(shouldInsertSemicolon(context)).toBe(true);
  });

  it("should return true when current token is EOF with line terminator", () => {
    const context: AsiContext = {
      hadLineTerminatorBefore: true,
      currentTokenType: TokenType.EOF,
      previousTokenType: TokenType.Identifier,
    };
    expect(shouldInsertSemicolon(context)).toBe(true);
  });

  it("should return true when current token is } with line terminator before", () => {
    const context: AsiContext = {
      hadLineTerminatorBefore: true,
      currentTokenType: TokenType.RightBrace,
      previousTokenType: TokenType.Identifier,
    };
    expect(shouldInsertSemicolon(context)).toBe(true);
  });

  it("should return false when current token is } without line terminator before", () => {
    const context: AsiContext = {
      hadLineTerminatorBefore: false,
      currentTokenType: TokenType.RightBrace,
      previousTokenType: TokenType.Identifier,
    };
    expect(shouldInsertSemicolon(context)).toBe(false);
  });

  it("should return true when line terminator before any token", () => {
    const context: AsiContext = {
      hadLineTerminatorBefore: true,
      currentTokenType: TokenType.Identifier,
      previousTokenType: TokenType.Identifier,
    };
    expect(shouldInsertSemicolon(context)).toBe(true);
  });

  it("should return false when no line terminator and not EOF or }", () => {
    const context: AsiContext = {
      hadLineTerminatorBefore: false,
      currentTokenType: TokenType.Identifier,
      previousTokenType: TokenType.Identifier,
    };
    expect(shouldInsertSemicolon(context)).toBe(false);
  });

  it("should return false when no line terminator and current is semicolon", () => {
    const context: AsiContext = {
      hadLineTerminatorBefore: false,
      currentTokenType: TokenType.Semicolon,
      previousTokenType: TokenType.Identifier,
    };
    expect(shouldInsertSemicolon(context)).toBe(false);
  });

  it("should return true with line terminator before numeric literal", () => {
    const context: AsiContext = {
      hadLineTerminatorBefore: true,
      currentTokenType: TokenType.NumericLiteral,
      previousTokenType: TokenType.Return,
    };
    expect(shouldInsertSemicolon(context)).toBe(true);
  });

  it("should return false when no line terminator and current is plus", () => {
    const context: AsiContext = {
      hadLineTerminatorBefore: false,
      currentTokenType: TokenType.Plus,
      previousTokenType: TokenType.Identifier,
    };
    expect(shouldInsertSemicolon(context)).toBe(false);
  });

  it("should return true when line terminator before left brace", () => {
    const context: AsiContext = {
      hadLineTerminatorBefore: true,
      currentTokenType: TokenType.LeftBrace,
      previousTokenType: TokenType.Identifier,
    };
    expect(shouldInsertSemicolon(context)).toBe(true);
  });
});
