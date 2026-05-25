/**
 * Parser performance optimization utilities.
 *
 * Provides lookup-table-based character classification for hot paths
 * in the lexer, avoiding expensive Set lookups and string comparisons.
 *
 * @module parser/perf-hints
 */

/**
 * Create a 128-entry Uint8Array lookup table for ASCII character classification.
 *
 * Each entry is 1 if the character is in the provided set, 0 otherwise.
 *
 * @param chars - A string containing all characters to mark as valid.
 * @returns A Uint8Array of length 128 serving as a lookup table.
 */
export const createCharLookupTable = (chars: string): Uint8Array => {
  const table = new Uint8Array(128);
  for (let i = 0; i < chars.length; i++) {
    const code = chars.charCodeAt(i);
    if (code < 128) {
      table[code] = 1;
    }
  }
  return table;
};

/** Characters valid at the start of an identifier (a-z, A-Z, _, $). */
const IDENTIFIER_START_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$";

/** Characters valid in the body of an identifier (start chars + digits). */
const IDENTIFIER_PART_CHARS = IDENTIFIER_START_CHARS + "0123456789";

/** Lookup table for identifier start characters. */
const identifierStartTable: Uint8Array = createCharLookupTable(
  IDENTIFIER_START_CHARS,
);

/** Lookup table for identifier part characters. */
const identifierPartTable: Uint8Array = createCharLookupTable(
  IDENTIFIER_PART_CHARS,
);

/**
 * Check if a character code is valid at the start of an identifier.
 *
 * Uses a pre-computed lookup table for O(1) performance.
 * Non-ASCII codes (>= 128) are not considered identifier starts by this function.
 *
 * @param code - The character code to check.
 * @returns True if the code represents a valid identifier start character.
 */
export const isIdentifierStart = (code: number): boolean => {
  if (code >= 128 || code < 0) {
    return false;
  }
  return identifierStartTable[code] === 1;
};

/**
 * Check if a character code is valid within the body of an identifier.
 *
 * Uses a pre-computed lookup table for O(1) performance.
 * Non-ASCII codes (>= 128) are not considered identifier parts by this function.
 *
 * @param code - The character code to check.
 * @returns True if the code represents a valid identifier part character.
 */
export const isIdentifierPart = (code: number): boolean => {
  if (code >= 128 || code < 0) {
    return false;
  }
  return identifierPartTable[code] === 1;
};

/** Whitespace character codes for fast checking. */
const WHITESPACE_CHARS = " \t\n\r\v\f";

/** Lookup table for whitespace characters. */
const whitespaceTable: Uint8Array = createCharLookupTable(WHITESPACE_CHARS);

/**
 * Check if a character code represents a whitespace character.
 *
 * @param code - The character code to check.
 * @returns True if the code is a whitespace character.
 */
export const isWhitespace = (code: number): boolean => {
  if (code >= 128 || code < 0) {
    return false;
  }
  return whitespaceTable[code] === 1;
};

/** Digit character codes for fast checking. */
const DIGIT_CHARS = "0123456789";

/** Lookup table for digit characters. */
const digitTable: Uint8Array = createCharLookupTable(DIGIT_CHARS);

/**
 * Check if a character code represents a digit (0-9).
 *
 * @param code - The character code to check.
 * @returns True if the code is a digit character.
 */
export const isDigit = (code: number): boolean => {
  if (code >= 128 || code < 0) {
    return false;
  }
  return digitTable[code] === 1;
};
