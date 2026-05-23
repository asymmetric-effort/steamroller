import { describe, it, expect } from "vitest";
import { createToken } from "../../../src/parser/token.js";
import type { Token } from "../../../src/parser/token.js";
import { TokenType } from "../../../src/parser/token-types.js";

describe("Token interface", () => {
  it("should represent an identifier token", () => {
    const token: Token = {
      type: TokenType.Identifier,
      start: 0,
      end: 3,
      value: "foo",
      raw: "foo",
    };
    expect(token.type).toBe(TokenType.Identifier);
    expect(token.start).toBe(0);
    expect(token.end).toBe(3);
    expect(token.value).toBe("foo");
    expect(token.raw).toBe("foo");
  });

  it("should represent a numeric literal token", () => {
    const token: Token = {
      type: TokenType.NumericLiteral,
      start: 4,
      end: 6,
      value: 42,
      raw: "42",
    };
    expect(token.type).toBe(TokenType.NumericLiteral);
    expect(token.value).toBe(42);
  });

  it("should represent a string literal token", () => {
    const token: Token = {
      type: TokenType.StringLiteral,
      start: 0,
      end: 7,
      value: "hello",
      raw: '"hello"',
    };
    expect(token.type).toBe(TokenType.StringLiteral);
    expect(token.value).toBe("hello");
    expect(token.raw).toBe('"hello"');
  });

  it("should represent a boolean literal token (true)", () => {
    const token: Token = {
      type: TokenType.True,
      start: 0,
      end: 4,
      value: true,
      raw: "true",
    };
    expect(token.type).toBe(TokenType.True);
    expect(token.value).toBe(true);
  });

  it("should represent a boolean literal token (false)", () => {
    const token: Token = {
      type: TokenType.False,
      start: 0,
      end: 5,
      value: false,
      raw: "false",
    };
    expect(token.type).toBe(TokenType.False);
    expect(token.value).toBe(false);
  });

  it("should represent a null literal token", () => {
    const token: Token = {
      type: TokenType.Null,
      start: 0,
      end: 4,
      value: null,
      raw: "null",
    };
    expect(token.type).toBe(TokenType.Null);
    expect(token.value).toBeNull();
  });

  it("should represent a regexp literal token", () => {
    const regex = /abc/gi;
    const token: Token = {
      type: TokenType.RegExpLiteral,
      start: 0,
      end: 8,
      value: regex,
      raw: "/abc/gi",
    };
    expect(token.type).toBe(TokenType.RegExpLiteral);
    expect(token.value).toBe(regex);
  });

  it("should represent a bigint literal token", () => {
    const token: Token = {
      type: TokenType.BigIntLiteral,
      start: 0,
      end: 4,
      value: BigInt(123),
      raw: "123n",
    };
    expect(token.type).toBe(TokenType.BigIntLiteral);
    expect(token.value).toBe(BigInt(123));
  });

  it("should represent an EOF token", () => {
    const token: Token = {
      type: TokenType.EOF,
      start: 100,
      end: 100,
      value: "",
      raw: "",
    };
    expect(token.type).toBe(TokenType.EOF);
    expect(token.start).toBe(100);
    expect(token.end).toBe(100);
  });

  it("should represent a punctuator token", () => {
    const token: Token = {
      type: TokenType.LeftBrace,
      start: 5,
      end: 6,
      value: "{",
      raw: "{",
    };
    expect(token.type).toBe(TokenType.LeftBrace);
    expect(token.value).toBe("{");
  });

  it("should represent a keyword token", () => {
    const token: Token = {
      type: TokenType.Function,
      start: 0,
      end: 8,
      value: "function",
      raw: "function",
    };
    expect(token.type).toBe(TokenType.Function);
    expect(token.value).toBe("function");
  });

  it("should represent an operator token", () => {
    const token: Token = {
      type: TokenType.PlusEquals,
      start: 10,
      end: 12,
      value: "+=",
      raw: "+=",
    };
    expect(token.type).toBe(TokenType.PlusEquals);
    expect(token.value).toBe("+=");
  });

  it("should represent a comment token", () => {
    const token: Token = {
      type: TokenType.LineComment,
      start: 0,
      end: 12,
      value: " a comment",
      raw: "// a comment",
    };
    expect(token.type).toBe(TokenType.LineComment);
    expect(token.raw).toBe("// a comment");
  });

  it("should represent a template literal token", () => {
    const token: Token = {
      type: TokenType.TemplateHead,
      start: 0,
      end: 8,
      value: "hello ",
      raw: "`hello ${",
    };
    expect(token.type).toBe(TokenType.TemplateHead);
  });
});

describe("createToken", () => {
  it("should create a token with the given properties", () => {
    const token = createToken(TokenType.Identifier, 0, 3, "foo", "foo");
    expect(token.type).toBe(TokenType.Identifier);
    expect(token.start).toBe(0);
    expect(token.end).toBe(3);
    expect(token.value).toBe("foo");
    expect(token.raw).toBe("foo");
  });

  it("should create a frozen token", () => {
    const token = createToken(TokenType.NumericLiteral, 0, 2, 42, "42");
    expect(Object.isFrozen(token)).toBe(true);
  });

  it("should reject modifications to a frozen token", () => {
    const token = createToken(TokenType.Identifier, 0, 3, "foo", "foo");
    expect(() => {
      (token as { type: number }).type = TokenType.NumericLiteral;
    }).toThrow();
  });

  it("should create an EOF token", () => {
    const token = createToken(TokenType.EOF, 50, 50, "", "");
    expect(token.type).toBe(TokenType.EOF);
    expect(token.start).toBe(50);
    expect(token.end).toBe(50);
  });

  it("should create a token with null value", () => {
    const token = createToken(TokenType.Null, 0, 4, null, "null");
    expect(token.value).toBeNull();
  });

  it("should create a token with boolean value", () => {
    const tokenTrue = createToken(TokenType.True, 0, 4, true, "true");
    expect(tokenTrue.value).toBe(true);

    const tokenFalse = createToken(TokenType.False, 0, 5, false, "false");
    expect(tokenFalse.value).toBe(false);
  });

  it("should create a token with RegExp value", () => {
    const regex = /test/i;
    const token = createToken(TokenType.RegExpLiteral, 0, 7, regex, "/test/i");
    expect(token.value).toBe(regex);
  });

  it("should create a token with bigint value", () => {
    const token = createToken(TokenType.BigIntLiteral, 0, 2, BigInt(9), "9n");
    expect(token.value).toBe(BigInt(9));
  });
});
