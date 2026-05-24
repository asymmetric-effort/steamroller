/**
 * Core Lexer class for the Steamroller parser.
 *
 * Orchestrates all scanning modules (numeric, string, regex, punctuator,
 * whitespace) into a unified token stream. Provides lookahead via
 * save/restore state, and convenience methods for token consumption.
 *
 * Internal state is mutable (documented exception for parser state machine).
 *
 * @module parser/lexer
 */

import type { Token } from "./token.js";
import { createToken } from "./token.js";
import { TokenType } from "./token-types.js";
import { lookupKeyword } from "./keywords.js";
import { scanNumericLiteral } from "./lexer-numeric.js";
import { scanStringLiteral, scanTemplateLiteral } from "./lexer-string.js";
import { isRegExpStart, scanRegExpLiteral } from "./lexer-regex.js";
import { scanPunctuator } from "./lexer-punctuator.js";
import {
  skipWhitespace,
  scanLineComment,
  scanBlockComment,
  scanHashbang,
  isLineTerminator,
} from "./lexer-whitespace.js";
import { tokenTypeName } from "./token-types.js";

/**
 * Snapshot of lexer state for save/restore lookahead.
 */
export interface LexerState {
  readonly pos: number;
  readonly token: Token;
  readonly hadLineTerminatorBefore: boolean;
  readonly previousTokenType: number;
  readonly templateDepth: number;
  readonly inAsync: boolean;
  readonly inGenerator: boolean;
}

/**
 * Returns true if the character code can start an identifier.
 *
 * Covers ASCII letters, underscore, dollar sign, and common Unicode
 * identifier start characters (basic multilingual plane letters).
 *
 * @param code - The character code to test.
 * @returns True if the code can start an identifier.
 */
const isIdentifierStart = (code: number): boolean => {
  // $ (0x24), _ (0x5F), A-Z (0x41-0x5A), a-z (0x61-0x7A)
  if (code === 0x24 || code === 0x5f) {
    return true;
  }
  if (code >= 0x41 && code <= 0x5a) {
    return true;
  }
  if (code >= 0x61 && code <= 0x7a) {
    return true;
  }
  // Basic Unicode letter detection (Latin Extended, Greek, Cyrillic, etc.)
  if (code >= 0xc0 && code !== 0xd7 && code !== 0xf7) {
    return true;
  }
  return false;
};

/**
 * Returns true if the character code can continue an identifier.
 *
 * Includes identifier start characters plus digits and zero-width
 * joiners/non-joiners.
 *
 * @param code - The character code to test.
 * @returns True if the code can continue an identifier.
 */
const isIdentifierPart = (code: number): boolean => {
  if (isIdentifierStart(code)) {
    return true;
  }
  // 0-9 (0x30-0x39)
  if (code >= 0x30 && code <= 0x39) {
    return true;
  }
  // Zero-width non-joiner (0x200C) and zero-width joiner (0x200D)
  if (code === 0x200c || code === 0x200d) {
    return true;
  }
  return false;
};

/**
 * Returns true if the character code is an ASCII digit (0-9).
 *
 * @param code - The character code to test.
 * @returns True if 0-9.
 */
const isDigit = (code: number): boolean => {
  return code >= 0x30 && code <= 0x39;
};

/**
 * Create an EOF token at the given position.
 *
 * @param pos - The position in source at EOF.
 * @returns A frozen EOF token.
 */
const createEofToken = (pos: number): Token => {
  return createToken(TokenType.EOF, pos, pos, "", "");
};

/**
 * The core Lexer class that produces a token stream from source text.
 *
 * All internal state fields are mutable (documented exception for
 * parser state machine pattern). External consumers interact only
 * through the public API which returns immutable Token objects.
 */
export class Lexer {
  /** The full source text being lexed. */
  private source: string;
  /** Current byte offset in source. */
  private pos: number;
  /** The current (most recently scanned) token. */
  private currentToken: Token;
  /** Whether a line terminator was encountered before the current token. */
  private hadLineTerminator: boolean;
  /** Whether strict mode is active. */
  private strict: boolean;
  /** Nesting depth of template literal substitutions. */
  private templateDepth: number;
  /** The token type of the previous token (for regex disambiguation). */
  private previousTokenType: number;
  /** Whether the hashbang at source start has been processed. */
  private hashbangProcessed: boolean;
  /** Whether the current parsing context is inside an async function. */
  private _inAsync: boolean;
  /** Whether the current parsing context is inside a generator function. */
  private _inGenerator: boolean;

  /**
   * Create a new Lexer for the given source text.
   *
   * @param source - The source text to lex.
   * @param strict - Whether strict mode is active (e.g., module mode).
   * @param allowHashBang - Whether to allow a hashbang (#!) at source start.
   */
  constructor(source: string, strict: boolean, allowHashBang: boolean = false) {
    this.source = source;
    this.pos = 0;
    this.hadLineTerminator = false;
    this.strict = strict;
    this.templateDepth = 0;
    this.previousTokenType = -1;
    this.hashbangProcessed = false;
    this._inAsync = false;
    this._inGenerator = false;

    // Handle hashbang if allowed and present
    if (allowHashBang) {
      const hashbangResult = scanHashbang(source);
      if (hashbangResult !== null) {
        this.pos = hashbangResult.end;
        this.hashbangProcessed = true;
      }
    }

    // Scan the first token
    this.currentToken = this.scan();
  }

  /**
   * Get the current token without advancing.
   */
  get token(): Token {
    return this.currentToken;
  }

  /**
   * Whether a line terminator was encountered before the current token.
   */
  get hadLineTerminatorBefore(): boolean {
    return this.hadLineTerminator;
  }

  /**
   * Whether the parser is currently inside an async function body.
   */
  get inAsync(): boolean {
    return this._inAsync;
  }

  /**
   * Set whether the parser is inside an async function body.
   */
  set inAsync(value: boolean) {
    this._inAsync = value;
  }

  /**
   * Whether the parser is currently inside a generator function body.
   */
  get inGenerator(): boolean {
    return this._inGenerator;
  }

  /**
   * Set whether the parser is inside a generator function body.
   */
  set inGenerator(value: boolean) {
    this._inGenerator = value;
  }

  /**
   * Advance to the next token and return the previous one.
   *
   * @returns The token that was current before advancing.
   */
  next(): Token {
    const previous = this.currentToken;
    this.previousTokenType = previous.type;
    this.currentToken = this.scan();
    return previous;
  }

  /**
   * Expect the current token to be a specific type, consume it, and
   * return it. Throws a SyntaxError if the token type does not match.
   *
   * @param type - The expected token type number.
   * @returns The consumed token.
   * @throws {SyntaxError} If the current token type does not match.
   */
  expect(type: number): Token {
    if (this.currentToken.type !== type) {
      const expected = tokenTypeName(type);
      const actual = tokenTypeName(this.currentToken.type);
      throw new SyntaxError(
        `Expected ${expected} but found ${actual} at position ${this.currentToken.start}`,
      );
    }
    return this.next();
  }

  /**
   * Check if the current token is a specific type.
   *
   * @param type - The token type to check.
   * @returns True if the current token matches the type.
   */
  is(type: number): boolean {
    return this.currentToken.type === type;
  }

  /**
   * Consume the current token if it matches the given type.
   *
   * @param type - The token type to try to consume.
   * @returns True if the token was consumed, false otherwise.
   */
  eat(type: number): boolean {
    if (this.currentToken.type === type) {
      this.next();
      return true;
    }
    return false;
  }

  /**
   * Save the current lexer state for lookahead.
   *
   * @returns A frozen snapshot of the current state.
   */
  saveState(): LexerState {
    return Object.freeze({
      pos: this.pos,
      token: this.currentToken,
      hadLineTerminatorBefore: this.hadLineTerminator,
      previousTokenType: this.previousTokenType,
      templateDepth: this.templateDepth,
      inAsync: this._inAsync,
      inGenerator: this._inGenerator,
    });
  }

  /**
   * Restore the lexer to a previously saved state.
   *
   * @param state - The state snapshot to restore.
   */
  restoreState(state: LexerState): void {
    this.pos = state.pos;
    this.currentToken = state.token;
    this.hadLineTerminator = state.hadLineTerminatorBefore;
    this.previousTokenType = state.previousTokenType;
    this.templateDepth = state.templateDepth;
    this._inAsync = state.inAsync;
    this._inGenerator = state.inGenerator;
  }

  /**
   * The main scanning method. Skips whitespace and comments, then
   * dispatches to the appropriate scanner based on the next character.
   *
   * @returns The next token in the source.
   */
  private scan(): Token {
    // Skip whitespace and comments iteratively
    const skipResult = this.skipWhitespaceAndComments();
    this.hadLineTerminator = skipResult;

    // Check for EOF
    if (this.pos >= this.source.length) {
      return createEofToken(this.pos);
    }

    // Handle template continuation when inside ${...}
    // When we see a } and templateDepth > 0, we scan the rest of the template
    const code = this.source.charCodeAt(this.pos);

    // Dispatch based on the first character
    // Identifiers and keywords: a-z, A-Z, _, $, and Unicode
    if (isIdentifierStart(code)) {
      return this.scanIdentifierOrKeyword();
    }

    // Numeric literals: 0-9 or . followed by digit
    if (isDigit(code)) {
      const result = scanNumericLiteral(this.source, this.pos, this.strict);
      this.pos = result.end;
      return result.token;
    }

    // String literals: ' or "
    if (code === 0x27 || code === 0x22) {
      const result = scanStringLiteral(this.source, this.pos, this.strict);
      this.pos = result.end;
      return result.token;
    }

    // Template literals: `
    if (code === 0x60) {
      const result = scanTemplateLiteral(this.source, this.pos, true);
      this.pos = result.end;
      // If we got a TemplateHead, increment template depth
      if (result.token.type === TokenType.TemplateHead) {
        this.templateDepth++;
      }
      return result.token;
    }

    // Dot followed by digit is a numeric literal (.5)
    if (code === 0x2e) {
      const nextCode =
        this.pos + 1 < this.source.length
          ? this.source.charCodeAt(this.pos + 1)
          : -1;
      if (isDigit(nextCode)) {
        const result = scanNumericLiteral(this.source, this.pos, this.strict);
        this.pos = result.end;
        return result.token;
      }
    }

    // Slash: could be division, regex, or already handled as comment
    if (code === 0x2f) {
      // Check if this is a regex
      if (isRegExpStart(this.previousTokenType)) {
        const result = scanRegExpLiteral(this.source, this.pos);
        this.pos = result.end;
        return result.token;
      }
      // Otherwise fall through to punctuator scanner (handles / and /=)
    }

    // Right brace inside template: continue scanning the template
    if (code === 0x7d && this.templateDepth > 0) {
      this.templateDepth--;
      const result = scanTemplateLiteral(this.source, this.pos, false);
      this.pos = result.end;
      // If we got a TemplateMiddle, increment depth back
      if (result.token.type === TokenType.TemplateMiddle) {
        this.templateDepth++;
      }
      return result.token;
    }

    // Punctuators and operators
    const punctResult = scanPunctuator(this.source, this.pos);
    if (punctResult !== null) {
      this.pos = punctResult.end;
      return punctResult.token;
    }

    // Unknown character
    throw new SyntaxError(
      `Unexpected character '${this.source[this.pos]}' at position ${this.pos}`,
    );
  }

  /**
   * Scan an identifier or keyword token.
   *
   * Reads identifier characters, then checks if the result is a keyword.
   *
   * @returns The identifier or keyword token.
   */
  private scanIdentifierOrKeyword(): Token {
    const start = this.pos;
    this.pos++;

    while (this.pos < this.source.length) {
      const code = this.source.charCodeAt(this.pos);
      if (isIdentifierPart(code)) {
        this.pos++;
      } else {
        break;
      }
    }

    const raw = this.source.slice(start, this.pos);
    const keywordInfo = lookupKeyword(raw);

    if (keywordInfo !== undefined) {
      // In strict mode, strict-reserved words use their dedicated token type
      if (keywordInfo.isStrictReserved && this.strict) {
        return createToken(keywordInfo.tokenType, start, this.pos, raw, raw);
      }
      // Reserved keywords and contextual keywords
      if (keywordInfo.isReserved || keywordInfo.isContextual) {
        // Special handling for literal keywords
        if (keywordInfo.tokenType === TokenType.True) {
          return createToken(TokenType.True, start, this.pos, true, raw);
        }
        if (keywordInfo.tokenType === TokenType.False) {
          return createToken(TokenType.False, start, this.pos, false, raw);
        }
        if (keywordInfo.tokenType === TokenType.Null) {
          return createToken(TokenType.Null, start, this.pos, null, raw);
        }
        return createToken(keywordInfo.tokenType, start, this.pos, raw, raw);
      }
      // Strict-reserved words in non-strict mode are identifiers
      // (but still with their special token type when available)
      if (keywordInfo.isStrictReserved) {
        return createToken(keywordInfo.tokenType, start, this.pos, raw, raw);
      }
    }

    return createToken(TokenType.Identifier, start, this.pos, raw, raw);
  }

  /**
   * Skip whitespace and comments iteratively, tracking whether any
   * line terminators were encountered.
   *
   * @returns True if a line terminator was encountered.
   */
  private skipWhitespaceAndComments(): boolean {
    let hadLT = false;

    while (this.pos < this.source.length) {
      // Skip whitespace (including line terminators)
      const wsResult = skipWhitespace(this.source, this.pos);
      if (wsResult.hadLineTerminator) {
        hadLT = true;
      }
      this.pos = wsResult.end;

      // Check if at a comment
      if (this.pos >= this.source.length) {
        break;
      }

      const c0 = this.source.charCodeAt(this.pos);
      if (c0 !== 0x2f) {
        // Not a slash, done skipping
        break;
      }

      const c1 =
        this.pos + 1 < this.source.length
          ? this.source.charCodeAt(this.pos + 1)
          : -1;

      if (c1 === 0x2f) {
        // Line comment //
        const result = scanLineComment(this.source, this.pos);
        this.pos = result.end;
        // The line terminator after the comment will be caught by the next
        // whitespace skip iteration
        continue;
      }

      if (c1 === 0x2a) {
        // Block comment /* */
        const result = scanBlockComment(this.source, this.pos);
        if (result.hadLineTerminator) {
          hadLT = true;
        }
        this.pos = result.end;
        continue;
      }

      // Just a slash, not a comment
      break;
    }

    return hadLT;
  }
}
