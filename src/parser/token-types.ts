/**
 * Token type definitions for the Steamroller lexer.
 *
 * Each token type is assigned a unique numeric value, grouped by category
 * with intentional gaps between groups to allow future additions without
 * renumbering existing types.
 *
 * @module parser/token-types
 */

/**
 * Enumeration of all lexer token types.
 *
 * Groups:
 * - 0: Special (EOF)
 * - 1-9: Identifiers and literals
 * - 10-35: Reserved keywords (ES5)
 * - 36-41: ES6+ keywords
 * - 42-51: Contextual keywords
 * - 52-54: Literal keywords
 * - 60-75: Punctuators
 * - 80-95: Assignment operators
 * - 100-116: Binary/unary operators
 * - 120-127: Comparison operators
 * - 130-131: Increment/decrement
 * - 140-142: Comments and template literals
 * - 150-151: JSX tokens
 */
export const TokenType = {
  // Special
  EOF: 0,

  // Identifiers and literals
  Identifier: 1,
  NumericLiteral: 2,
  StringLiteral: 3,
  RegExpLiteral: 4,
  TemplateLiteral: 5,
  TemplateHead: 6,
  TemplateMiddle: 7,
  TemplateTail: 8,
  BigIntLiteral: 9,

  // Keywords (reserved)
  Break: 10,
  Case: 11,
  Catch: 12,
  Continue: 13,
  Debugger: 14,
  Default: 15,
  Delete: 16,
  Do: 17,
  Else: 18,
  Finally: 19,
  For: 20,
  Function: 21,
  If: 22,
  In: 23,
  Instanceof: 24,
  New: 25,
  Return: 26,
  Switch: 27,
  This: 28,
  Throw: 29,
  Try: 30,
  Typeof: 31,
  Var: 32,
  Void: 33,
  While: 34,
  With: 35,

  // ES6+ keywords
  Class: 36,
  Const: 37,
  Export: 38,
  Extends: 39,
  Import: 40,
  Super: 41,

  // Contextual keywords
  Async: 42,
  Await: 43,
  Yield: 44,
  Let: 45,
  Of: 46,
  From: 47,
  As: 48,
  Get: 49,
  Set: 50,
  Static: 51,

  // Literal keywords
  True: 52,
  False: 53,
  Null: 54,

  // Punctuators
  LeftBrace: 60,
  RightBrace: 61,
  LeftParen: 62,
  RightParen: 63,
  LeftBracket: 64,
  RightBracket: 65,
  Dot: 66,
  Ellipsis: 67,
  Semicolon: 68,
  Comma: 69,
  Colon: 70,
  QuestionMark: 71,
  QuestionDot: 72,
  Arrow: 73,
  Hash: 74,
  At: 75,

  // Assignment operators
  Equals: 80,
  PlusEquals: 81,
  MinusEquals: 82,
  StarEquals: 83,
  SlashEquals: 84,
  PercentEquals: 85,
  StarStarEquals: 86,
  AmpersandEquals: 87,
  PipeEquals: 88,
  CaretEquals: 89,
  LeftShiftEquals: 90,
  RightShiftEquals: 91,
  UnsignedRightShiftEquals: 92,
  AmpersandAmpersandEquals: 93,
  PipePipeEquals: 94,
  QuestionQuestionEquals: 95,

  // Binary/unary operators
  Plus: 100,
  Minus: 101,
  Star: 102,
  Slash: 103,
  Percent: 104,
  StarStar: 105,
  Ampersand: 106,
  Pipe: 107,
  Caret: 108,
  Tilde: 109,
  LeftShift: 110,
  RightShift: 111,
  UnsignedRightShift: 112,
  AmpersandAmpersand: 113,
  PipePipe: 114,
  QuestionQuestion: 115,
  Exclamation: 116,

  // Comparison
  EqualsEquals: 120,
  ExclamationEquals: 121,
  EqualsEqualsEquals: 122,
  ExclamationEqualsEquals: 123,
  LessThan: 124,
  GreaterThan: 125,
  LessThanEquals: 126,
  GreaterThanEquals: 127,

  // Increment/decrement
  PlusPlus: 130,
  MinusMinus: 131,

  // Comment
  LineComment: 140,
  BlockComment: 141,

  // Template
  TemplateNoSub: 142,

  // JSX
  JSXText: 150,
  JSXIdentifier: 151,

  // TypeScript keywords
  TSType: 160,
  TSInterface: 161,
  TSEnum: 162,
  TSNamespace: 163,
  TSDeclare: 164,
  TSReadonly: 165,
  TSAbstract: 166,
  TSOverride: 167,
  TSSatisfies: 168,
  TSKeyof: 169,
  TSInfer: 170,
  TSIs: 171,
  TSAsserts: 172,
  TSOut: 173,
  TSModule: 174,
} as const;

/** Union type of all valid token type numeric values. */
export type TokenTypeValue = (typeof TokenType)[keyof typeof TokenType];

/**
 * Returns the name of a token type given its numeric value.
 *
 * Uses an iterative scan of the TokenType object entries.
 *
 * @param value - The numeric token type value to look up.
 * @returns The string name of the token type, or "Unknown" if not found.
 */
export const tokenTypeName = (value: number): string => {
  const entries = Object.entries(TokenType);
  for (let i = 0; i < entries.length; i++) {
    const [name, v] = entries[i];
    if (v === value) {
      return name;
    }
  }
  return "Unknown";
};
