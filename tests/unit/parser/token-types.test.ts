import { describe, it, expect } from "bun:test";
import { TokenType, tokenTypeName } from "../../../src/parser/token-types.js";
import type { TokenTypeValue } from "../../../src/parser/token-types.js";

describe("TokenType", () => {
  it("should be a frozen (const) object", () => {
    // `as const` makes the object readonly at the type level;
    // verify the values are plain numbers.
    expect(typeof TokenType.EOF).toBe("number");
  });

  it("should have EOF equal to 0", () => {
    expect(TokenType.EOF).toBe(0);
  });

  it("should assign unique numeric values to every token type", () => {
    const values = Object.values(TokenType);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it("should contain only number values", () => {
    const values = Object.values(TokenType);
    for (let i = 0; i < values.length; i++) {
      expect(typeof values[i]).toBe("number");
    }
  });

  describe("identifier and literal range (1-9)", () => {
    const expected: ReadonlyArray<[string, number]> = [
      ["Identifier", 1],
      ["NumericLiteral", 2],
      ["StringLiteral", 3],
      ["RegExpLiteral", 4],
      ["TemplateLiteral", 5],
      ["TemplateHead", 6],
      ["TemplateMiddle", 7],
      ["TemplateTail", 8],
      ["BigIntLiteral", 9],
    ];

    for (let i = 0; i < expected.length; i++) {
      const [name, value] = expected[i];
      it(`should map ${name} to ${value}`, () => {
        expect(TokenType[name as keyof typeof TokenType]).toBe(value);
      });
    }
  });

  describe("reserved keyword range (10-35)", () => {
    const reserved: ReadonlyArray<[string, number]> = [
      ["Break", 10],
      ["Case", 11],
      ["Catch", 12],
      ["Continue", 13],
      ["Debugger", 14],
      ["Default", 15],
      ["Delete", 16],
      ["Do", 17],
      ["Else", 18],
      ["Finally", 19],
      ["For", 20],
      ["Function", 21],
      ["If", 22],
      ["In", 23],
      ["Instanceof", 24],
      ["New", 25],
      ["Return", 26],
      ["Switch", 27],
      ["This", 28],
      ["Throw", 29],
      ["Try", 30],
      ["Typeof", 31],
      ["Var", 32],
      ["Void", 33],
      ["While", 34],
      ["With", 35],
    ];

    for (let i = 0; i < reserved.length; i++) {
      const [name, value] = reserved[i];
      it(`should map ${name} to ${value}`, () => {
        expect(TokenType[name as keyof typeof TokenType]).toBe(value);
      });
    }
  });

  describe("ES6+ keyword range (36-41)", () => {
    const es6: ReadonlyArray<[string, number]> = [
      ["Class", 36],
      ["Const", 37],
      ["Export", 38],
      ["Extends", 39],
      ["Import", 40],
      ["Super", 41],
    ];

    for (let i = 0; i < es6.length; i++) {
      const [name, value] = es6[i];
      it(`should map ${name} to ${value}`, () => {
        expect(TokenType[name as keyof typeof TokenType]).toBe(value);
      });
    }
  });

  describe("contextual keyword range (42-51)", () => {
    const contextual: ReadonlyArray<[string, number]> = [
      ["Async", 42],
      ["Await", 43],
      ["Yield", 44],
      ["Let", 45],
      ["Of", 46],
      ["From", 47],
      ["As", 48],
      ["Get", 49],
      ["Set", 50],
      ["Static", 51],
    ];

    for (let i = 0; i < contextual.length; i++) {
      const [name, value] = contextual[i];
      it(`should map ${name} to ${value}`, () => {
        expect(TokenType[name as keyof typeof TokenType]).toBe(value);
      });
    }
  });

  describe("literal keyword range (52-54)", () => {
    it("should map True to 52", () => {
      expect(TokenType.True).toBe(52);
    });
    it("should map False to 53", () => {
      expect(TokenType.False).toBe(53);
    });
    it("should map Null to 54", () => {
      expect(TokenType.Null).toBe(54);
    });
  });

  describe("punctuator range (60-75)", () => {
    const punctuators: ReadonlyArray<[string, number]> = [
      ["LeftBrace", 60],
      ["RightBrace", 61],
      ["LeftParen", 62],
      ["RightParen", 63],
      ["LeftBracket", 64],
      ["RightBracket", 65],
      ["Dot", 66],
      ["Ellipsis", 67],
      ["Semicolon", 68],
      ["Comma", 69],
      ["Colon", 70],
      ["QuestionMark", 71],
      ["QuestionDot", 72],
      ["Arrow", 73],
      ["Hash", 74],
      ["At", 75],
    ];

    for (let i = 0; i < punctuators.length; i++) {
      const [name, value] = punctuators[i];
      it(`should map ${name} to ${value}`, () => {
        expect(TokenType[name as keyof typeof TokenType]).toBe(value);
      });
    }
  });

  describe("assignment operator range (80-95)", () => {
    const assignments: ReadonlyArray<[string, number]> = [
      ["Equals", 80],
      ["PlusEquals", 81],
      ["MinusEquals", 82],
      ["StarEquals", 83],
      ["SlashEquals", 84],
      ["PercentEquals", 85],
      ["StarStarEquals", 86],
      ["AmpersandEquals", 87],
      ["PipeEquals", 88],
      ["CaretEquals", 89],
      ["LeftShiftEquals", 90],
      ["RightShiftEquals", 91],
      ["UnsignedRightShiftEquals", 92],
      ["AmpersandAmpersandEquals", 93],
      ["PipePipeEquals", 94],
      ["QuestionQuestionEquals", 95],
    ];

    for (let i = 0; i < assignments.length; i++) {
      const [name, value] = assignments[i];
      it(`should map ${name} to ${value}`, () => {
        expect(TokenType[name as keyof typeof TokenType]).toBe(value);
      });
    }
  });

  describe("binary/unary operator range (100-116)", () => {
    const operators: ReadonlyArray<[string, number]> = [
      ["Plus", 100],
      ["Minus", 101],
      ["Star", 102],
      ["Slash", 103],
      ["Percent", 104],
      ["StarStar", 105],
      ["Ampersand", 106],
      ["Pipe", 107],
      ["Caret", 108],
      ["Tilde", 109],
      ["LeftShift", 110],
      ["RightShift", 111],
      ["UnsignedRightShift", 112],
      ["AmpersandAmpersand", 113],
      ["PipePipe", 114],
      ["QuestionQuestion", 115],
      ["Exclamation", 116],
    ];

    for (let i = 0; i < operators.length; i++) {
      const [name, value] = operators[i];
      it(`should map ${name} to ${value}`, () => {
        expect(TokenType[name as keyof typeof TokenType]).toBe(value);
      });
    }
  });

  describe("comparison operator range (120-127)", () => {
    const comparisons: ReadonlyArray<[string, number]> = [
      ["EqualsEquals", 120],
      ["ExclamationEquals", 121],
      ["EqualsEqualsEquals", 122],
      ["ExclamationEqualsEquals", 123],
      ["LessThan", 124],
      ["GreaterThan", 125],
      ["LessThanEquals", 126],
      ["GreaterThanEquals", 127],
    ];

    for (let i = 0; i < comparisons.length; i++) {
      const [name, value] = comparisons[i];
      it(`should map ${name} to ${value}`, () => {
        expect(TokenType[name as keyof typeof TokenType]).toBe(value);
      });
    }
  });

  describe("increment/decrement (130-131)", () => {
    it("should map PlusPlus to 130", () => {
      expect(TokenType.PlusPlus).toBe(130);
    });
    it("should map MinusMinus to 131", () => {
      expect(TokenType.MinusMinus).toBe(131);
    });
  });

  describe("comment and template (140-142)", () => {
    it("should map LineComment to 140", () => {
      expect(TokenType.LineComment).toBe(140);
    });
    it("should map BlockComment to 141", () => {
      expect(TokenType.BlockComment).toBe(141);
    });
    it("should map TemplateNoSub to 142", () => {
      expect(TokenType.TemplateNoSub).toBe(142);
    });
  });

  describe("JSX tokens (150-151)", () => {
    it("should map JSXText to 150", () => {
      expect(TokenType.JSXText).toBe(150);
    });
    it("should map JSXIdentifier to 151", () => {
      expect(TokenType.JSXIdentifier).toBe(151);
    });
  });
});

describe("TokenTypeValue", () => {
  it("should accept valid token type values", () => {
    const value: TokenTypeValue = TokenType.EOF;
    expect(value).toBe(0);
  });

  it("should accept any member of the TokenType object", () => {
    const values: ReadonlyArray<TokenTypeValue> = [
      TokenType.Identifier,
      TokenType.Break,
      TokenType.LeftBrace,
      TokenType.Plus,
      TokenType.EqualsEquals,
      TokenType.JSXText,
    ];
    expect(values.length).toBe(6);
  });
});

describe("tokenTypeName", () => {
  it("should return 'EOF' for value 0", () => {
    expect(tokenTypeName(0)).toBe("EOF");
  });

  it("should return 'Identifier' for value 1", () => {
    expect(tokenTypeName(1)).toBe("Identifier");
  });

  it("should return the correct name for every token type", () => {
    const entries = Object.entries(TokenType);
    for (let i = 0; i < entries.length; i++) {
      const [name, value] = entries[i];
      expect(tokenTypeName(value)).toBe(name);
    }
  });

  it("should return 'Unknown' for a value that does not exist", () => {
    expect(tokenTypeName(-1)).toBe("Unknown");
    expect(tokenTypeName(999)).toBe("Unknown");
    expect(tokenTypeName(55)).toBe("Unknown");
  });

  it("should return 'Unknown' for NaN", () => {
    expect(tokenTypeName(NaN)).toBe("Unknown");
  });
});
