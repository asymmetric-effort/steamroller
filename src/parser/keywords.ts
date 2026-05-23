/**
 * Keyword detection and classification for the Steamroller lexer.
 *
 * Provides O(1) lookup of JavaScript/TypeScript keywords using a Map,
 * including reserved words, contextual keywords, and strict-mode
 * reserved words.
 *
 * @module parser/keywords
 */

import { TokenType } from "./token-types.js";

/**
 * Information about a keyword, including its token type and
 * classification flags.
 */
export interface KeywordInfo {
  /** The numeric token type value from {@link TokenType}. */
  readonly tokenType: number;
  /** Whether the word is a reserved keyword in all contexts. */
  readonly isReserved: boolean;
  /** Whether the word is reserved only in strict mode. */
  readonly isStrictReserved: boolean;
  /** Whether the word is a contextual keyword. */
  readonly isContextual: boolean;
}

/**
 * Helper to create a reserved keyword entry.
 */
const reserved = (tokenType: number): KeywordInfo => ({
  tokenType,
  isReserved: true,
  isStrictReserved: false,
  isContextual: false,
});

/**
 * Helper to create a contextual keyword entry.
 */
const contextual = (tokenType: number): KeywordInfo => ({
  tokenType,
  isReserved: false,
  isStrictReserved: false,
  isContextual: true,
});

/**
 * Helper to create a strict-mode reserved word entry.
 * These are contextual keywords that become reserved in strict mode.
 */
const strictReserved = (tokenType: number): KeywordInfo => ({
  tokenType,
  isReserved: false,
  isStrictReserved: true,
  isContextual: false,
});

/**
 * Internal keyword lookup map. Populated eagerly at module load time.
 */
const keywordMap: ReadonlyMap<string, KeywordInfo> = new Map<string, KeywordInfo>([
  // Reserved keywords (ES5)
  ["break", reserved(TokenType.Break)],
  ["case", reserved(TokenType.Case)],
  ["catch", reserved(TokenType.Catch)],
  ["continue", reserved(TokenType.Continue)],
  ["debugger", reserved(TokenType.Debugger)],
  ["default", reserved(TokenType.Default)],
  ["delete", reserved(TokenType.Delete)],
  ["do", reserved(TokenType.Do)],
  ["else", reserved(TokenType.Else)],
  ["finally", reserved(TokenType.Finally)],
  ["for", reserved(TokenType.For)],
  ["function", reserved(TokenType.Function)],
  ["if", reserved(TokenType.If)],
  ["in", reserved(TokenType.In)],
  ["instanceof", reserved(TokenType.Instanceof)],
  ["new", reserved(TokenType.New)],
  ["return", reserved(TokenType.Return)],
  ["switch", reserved(TokenType.Switch)],
  ["this", reserved(TokenType.This)],
  ["throw", reserved(TokenType.Throw)],
  ["try", reserved(TokenType.Try)],
  ["typeof", reserved(TokenType.Typeof)],
  ["var", reserved(TokenType.Var)],
  ["void", reserved(TokenType.Void)],
  ["while", reserved(TokenType.While)],
  ["with", reserved(TokenType.With)],

  // ES6+ reserved keywords
  ["class", reserved(TokenType.Class)],
  ["const", reserved(TokenType.Const)],
  ["export", reserved(TokenType.Export)],
  ["extends", reserved(TokenType.Extends)],
  ["import", reserved(TokenType.Import)],
  ["super", reserved(TokenType.Super)],

  // Literal keywords (reserved)
  ["true", reserved(TokenType.True)],
  ["false", reserved(TokenType.False)],
  ["null", reserved(TokenType.Null)],

  // Contextual keywords
  ["async", contextual(TokenType.Async)],
  ["await", contextual(TokenType.Await)],
  ["of", contextual(TokenType.Of)],
  ["from", contextual(TokenType.From)],
  ["as", contextual(TokenType.As)],
  ["get", contextual(TokenType.Get)],
  ["set", contextual(TokenType.Set)],

  // Strict-mode reserved words
  // These use their own token types where available; otherwise they
  // map to Identifier (0 is not used — they have dedicated types).
  ["yield", strictReserved(TokenType.Yield)],
  ["let", strictReserved(TokenType.Let)],
  ["static", strictReserved(TokenType.Static)],
  ["implements", strictReserved(TokenType.Identifier)],
  ["interface", strictReserved(TokenType.Identifier)],
  ["package", strictReserved(TokenType.Identifier)],
  ["private", strictReserved(TokenType.Identifier)],
  ["protected", strictReserved(TokenType.Identifier)],
  ["public", strictReserved(TokenType.Identifier)],
]);

/**
 * Look up a word in the keyword map.
 *
 * @param word - The identifier string to look up.
 * @returns The {@link KeywordInfo} for the word, or `undefined` if it
 *   is not a keyword.
 */
export const lookupKeyword = (word: string): KeywordInfo | undefined => {
  return keywordMap.get(word);
};

/**
 * Check whether a word is any kind of keyword (reserved, contextual,
 * or strict-mode reserved).
 *
 * @param word - The identifier string to check.
 * @returns `true` if the word is a keyword.
 */
export const isKeyword = (word: string): boolean => {
  return keywordMap.has(word);
};

/**
 * Check whether a word is a reserved keyword in all contexts.
 *
 * @param word - The identifier string to check.
 * @returns `true` if the word is unconditionally reserved.
 */
export const isReservedWord = (word: string): boolean => {
  const info = keywordMap.get(word);
  return info?.isReserved === true;
};

/**
 * Check whether a word is reserved only in strict mode.
 *
 * @param word - The identifier string to check.
 * @returns `true` if the word is a strict-mode reserved word.
 */
export const isStrictReservedWord = (word: string): boolean => {
  const info = keywordMap.get(word);
  return info?.isStrictReserved === true;
};

/**
 * Check whether a word is a contextual keyword.
 *
 * @param word - The identifier string to check.
 * @returns `true` if the word is a contextual keyword.
 */
export const isContextualKeyword = (word: string): boolean => {
  const info = keywordMap.get(word);
  return info?.isContextual === true;
};
