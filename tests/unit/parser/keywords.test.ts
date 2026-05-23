import { describe, it, expect } from "vitest";
import {
  lookupKeyword,
  isKeyword,
  isReservedWord,
  isStrictReservedWord,
  isContextualKeyword,
} from "../../../src/parser/keywords.js";
import type { KeywordInfo } from "../../../src/parser/keywords.js";
import { TokenType } from "../../../src/parser/token-types.js";

describe("lookupKeyword", () => {
  describe("reserved keywords", () => {
    const reservedWords: ReadonlyArray<[string, number]> = [
      ["break", TokenType.Break],
      ["case", TokenType.Case],
      ["catch", TokenType.Catch],
      ["continue", TokenType.Continue],
      ["debugger", TokenType.Debugger],
      ["default", TokenType.Default],
      ["delete", TokenType.Delete],
      ["do", TokenType.Do],
      ["else", TokenType.Else],
      ["finally", TokenType.Finally],
      ["for", TokenType.For],
      ["function", TokenType.Function],
      ["if", TokenType.If],
      ["in", TokenType.In],
      ["instanceof", TokenType.Instanceof],
      ["new", TokenType.New],
      ["return", TokenType.Return],
      ["switch", TokenType.Switch],
      ["this", TokenType.This],
      ["throw", TokenType.Throw],
      ["try", TokenType.Try],
      ["typeof", TokenType.Typeof],
      ["var", TokenType.Var],
      ["void", TokenType.Void],
      ["while", TokenType.While],
      ["with", TokenType.With],
    ];

    for (let i = 0; i < reservedWords.length; i++) {
      const [word, expectedType] = reservedWords[i];
      it(`should return reserved info for "${word}"`, () => {
        const info = lookupKeyword(word);
        expect(info).toBeDefined();
        expect(info!.tokenType).toBe(expectedType);
        expect(info!.isReserved).toBe(true);
        expect(info!.isStrictReserved).toBe(false);
        expect(info!.isContextual).toBe(false);
      });
    }
  });

  describe("ES6+ reserved keywords", () => {
    const es6Words: ReadonlyArray<[string, number]> = [
      ["class", TokenType.Class],
      ["const", TokenType.Const],
      ["export", TokenType.Export],
      ["extends", TokenType.Extends],
      ["import", TokenType.Import],
      ["super", TokenType.Super],
    ];

    for (let i = 0; i < es6Words.length; i++) {
      const [word, expectedType] = es6Words[i];
      it(`should return reserved info for "${word}"`, () => {
        const info = lookupKeyword(word);
        expect(info).toBeDefined();
        expect(info!.tokenType).toBe(expectedType);
        expect(info!.isReserved).toBe(true);
        expect(info!.isStrictReserved).toBe(false);
        expect(info!.isContextual).toBe(false);
      });
    }
  });

  describe("literal keywords", () => {
    const literals: ReadonlyArray<[string, number]> = [
      ["true", TokenType.True],
      ["false", TokenType.False],
      ["null", TokenType.Null],
    ];

    for (let i = 0; i < literals.length; i++) {
      const [word, expectedType] = literals[i];
      it(`should return reserved info for "${word}"`, () => {
        const info = lookupKeyword(word);
        expect(info).toBeDefined();
        expect(info!.tokenType).toBe(expectedType);
        expect(info!.isReserved).toBe(true);
        expect(info!.isStrictReserved).toBe(false);
        expect(info!.isContextual).toBe(false);
      });
    }
  });

  describe("contextual keywords", () => {
    const contextualWords: ReadonlyArray<[string, number]> = [
      ["async", TokenType.Async],
      ["await", TokenType.Await],
      ["of", TokenType.Of],
      ["from", TokenType.From],
      ["as", TokenType.As],
      ["get", TokenType.Get],
      ["set", TokenType.Set],
    ];

    for (let i = 0; i < contextualWords.length; i++) {
      const [word, expectedType] = contextualWords[i];
      it(`should return contextual info for "${word}"`, () => {
        const info = lookupKeyword(word);
        expect(info).toBeDefined();
        expect(info!.tokenType).toBe(expectedType);
        expect(info!.isReserved).toBe(false);
        expect(info!.isStrictReserved).toBe(false);
        expect(info!.isContextual).toBe(true);
      });
    }
  });

  describe("strict-mode reserved words", () => {
    const strictWords: ReadonlyArray<[string, number]> = [
      ["yield", TokenType.Yield],
      ["let", TokenType.Let],
      ["static", TokenType.Static],
      ["implements", TokenType.Identifier],
      ["interface", TokenType.Identifier],
      ["package", TokenType.Identifier],
      ["private", TokenType.Identifier],
      ["protected", TokenType.Identifier],
      ["public", TokenType.Identifier],
    ];

    for (let i = 0; i < strictWords.length; i++) {
      const [word, expectedType] = strictWords[i];
      it(`should return strict-reserved info for "${word}"`, () => {
        const info = lookupKeyword(word);
        expect(info).toBeDefined();
        expect(info!.tokenType).toBe(expectedType);
        expect(info!.isReserved).toBe(false);
        expect(info!.isStrictReserved).toBe(true);
        expect(info!.isContextual).toBe(false);
      });
    }
  });

  describe("non-keywords", () => {
    const nonKeywords: ReadonlyArray<string> = [
      "foo",
      "bar",
      "myVariable",
      "console",
      "Math",
      "undefined",
      "NaN",
      "Infinity",
      "arguments",
      "eval",
      "",
      " ",
      "IF",
      "BREAK",
      "True",
      "False",
      "NULL",
      "Class",
    ];

    for (let i = 0; i < nonKeywords.length; i++) {
      const word = nonKeywords[i];
      it(`should return undefined for "${word}"`, () => {
        expect(lookupKeyword(word)).toBeUndefined();
      });
    }
  });
});

describe("isKeyword", () => {
  it("should return true for reserved words", () => {
    expect(isKeyword("break")).toBe(true);
    expect(isKeyword("if")).toBe(true);
    expect(isKeyword("return")).toBe(true);
  });

  it("should return true for contextual keywords", () => {
    expect(isKeyword("async")).toBe(true);
    expect(isKeyword("await")).toBe(true);
    expect(isKeyword("get")).toBe(true);
  });

  it("should return true for strict-mode reserved words", () => {
    expect(isKeyword("yield")).toBe(true);
    expect(isKeyword("let")).toBe(true);
    expect(isKeyword("implements")).toBe(true);
  });

  it("should return true for literal keywords", () => {
    expect(isKeyword("true")).toBe(true);
    expect(isKeyword("false")).toBe(true);
    expect(isKeyword("null")).toBe(true);
  });

  it("should return false for non-keywords", () => {
    expect(isKeyword("foo")).toBe(false);
    expect(isKeyword("")).toBe(false);
    expect(isKeyword("IF")).toBe(false);
    expect(isKeyword("undefined")).toBe(false);
  });
});

describe("isReservedWord", () => {
  it("should return true for reserved words", () => {
    expect(isReservedWord("break")).toBe(true);
    expect(isReservedWord("class")).toBe(true);
    expect(isReservedWord("true")).toBe(true);
    expect(isReservedWord("null")).toBe(true);
  });

  it("should return false for contextual keywords", () => {
    expect(isReservedWord("async")).toBe(false);
    expect(isReservedWord("await")).toBe(false);
    expect(isReservedWord("get")).toBe(false);
  });

  it("should return false for strict-mode reserved words", () => {
    expect(isReservedWord("yield")).toBe(false);
    expect(isReservedWord("let")).toBe(false);
    expect(isReservedWord("implements")).toBe(false);
  });

  it("should return false for non-keywords", () => {
    expect(isReservedWord("foo")).toBe(false);
    expect(isReservedWord("")).toBe(false);
  });
});

describe("isStrictReservedWord", () => {
  it("should return true for strict-mode reserved words", () => {
    expect(isStrictReservedWord("yield")).toBe(true);
    expect(isStrictReservedWord("let")).toBe(true);
    expect(isStrictReservedWord("static")).toBe(true);
    expect(isStrictReservedWord("implements")).toBe(true);
    expect(isStrictReservedWord("interface")).toBe(true);
    expect(isStrictReservedWord("package")).toBe(true);
    expect(isStrictReservedWord("private")).toBe(true);
    expect(isStrictReservedWord("protected")).toBe(true);
    expect(isStrictReservedWord("public")).toBe(true);
  });

  it("should return false for reserved words", () => {
    expect(isStrictReservedWord("break")).toBe(false);
    expect(isStrictReservedWord("class")).toBe(false);
  });

  it("should return false for contextual keywords", () => {
    expect(isStrictReservedWord("async")).toBe(false);
    expect(isStrictReservedWord("get")).toBe(false);
  });

  it("should return false for non-keywords", () => {
    expect(isStrictReservedWord("foo")).toBe(false);
    expect(isStrictReservedWord("")).toBe(false);
  });
});

describe("isContextualKeyword", () => {
  it("should return true for contextual keywords", () => {
    expect(isContextualKeyword("async")).toBe(true);
    expect(isContextualKeyword("await")).toBe(true);
    expect(isContextualKeyword("of")).toBe(true);
    expect(isContextualKeyword("from")).toBe(true);
    expect(isContextualKeyword("as")).toBe(true);
    expect(isContextualKeyword("get")).toBe(true);
    expect(isContextualKeyword("set")).toBe(true);
  });

  it("should return false for reserved words", () => {
    expect(isContextualKeyword("break")).toBe(false);
    expect(isContextualKeyword("class")).toBe(false);
    expect(isContextualKeyword("true")).toBe(false);
  });

  it("should return false for strict-mode reserved words", () => {
    expect(isContextualKeyword("yield")).toBe(false);
    expect(isContextualKeyword("let")).toBe(false);
    expect(isContextualKeyword("static")).toBe(false);
  });

  it("should return false for non-keywords", () => {
    expect(isContextualKeyword("foo")).toBe(false);
    expect(isContextualKeyword("")).toBe(false);
  });
});

describe("KeywordInfo interface", () => {
  it("should have all required properties", () => {
    const info: KeywordInfo = {
      tokenType: TokenType.Break,
      isReserved: true,
      isStrictReserved: false,
      isContextual: false,
    };
    expect(info.tokenType).toBe(TokenType.Break);
    expect(info.isReserved).toBe(true);
    expect(info.isStrictReserved).toBe(false);
    expect(info.isContextual).toBe(false);
  });
});
