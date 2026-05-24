/**
 * Zero-dependency glob pattern matching with brace/range expansion,
 * glob-to-regex conversion, glob detection, and parent extraction.
 *
 * Replaces picomatch/braces with a fully iterative implementation.
 *
 * @module utils/glob
 */

/** Characters that indicate a string contains glob patterns. */
const GLOB_CHARS: ReadonlySet<string> = new Set(["*", "?", "[", "]", "{", "}"]);

/** Path separator used for matching (always forward slash). */
const SEP = "/";

/** Escaped path separator regex fragment. */
const SEP_RE = "\\/";

/**
 * Detects whether a string contains glob pattern characters.
 *
 * Checks for unescaped `*`, `?`, `[`, `]`, `{`, `}` characters.
 *
 * @param str - The string to test.
 * @returns `true` if the string contains glob characters.
 */
export const isGlob = (str: string): boolean => {
  const len = str.length;
  let i = 0;
  while (i < len) {
    if (str[i] === "\\" && i + 1 < len) {
      // Skip escaped character
      i += 2;
      continue;
    }
    if (GLOB_CHARS.has(str[i] as string)) {
      return true;
    }
    i += 1;
  }
  return false;
};

/**
 * Extracts the non-glob parent directory from a glob pattern.
 *
 * Examples:
 * - `"src/*.ts"` → `"src"`
 * - `"src/**\/*.ts"` → `"src"`
 * - `"*.ts"` → `"."`
 * - `"file.ts"` → `"."`
 *
 * @param str - The glob pattern.
 * @returns The parent directory path.
 */
export const globParent = (str: string): string => {
  const normalized = str.replace(/\\/g, SEP);
  const parts = normalized.split(SEP);

  // If there's no separator, the parent is always "."
  if (!normalized.includes(SEP)) {
    return ".";
  }

  const parentParts: Array<string> = [];
  const partsLen = parts.length;
  let i = 0;
  while (i < partsLen) {
    const part = parts[i] as string;
    if (isGlob(part)) {
      break;
    }
    parentParts.push(part);
    i += 1;
  }

  if (parentParts.length === 0) {
    return ".";
  }

  const result = parentParts.join(SEP);
  return result === "" ? "." : result;
};

/**
 * Expand a numeric or alphabetic range pattern.
 *
 * Handles:
 * - Numeric ranges: `{1..5}` → `['1','2','3','4','5']`
 * - Alpha ranges: `{a..e}` → `['a','b','c','d','e']`
 * - Reverse ranges: `{5..1}` → `['5','4','3','2','1']`
 *
 * Returns the original pattern wrapped in an array if not a valid range.
 *
 * @param pattern - The range pattern (with or without braces).
 * @returns An array of expanded values.
 */
export const expandRange = (pattern: string): ReadonlyArray<string> => {
  // Require outer braces for range expansion
  if (!pattern.startsWith("{") || !pattern.endsWith("}")) {
    return [pattern];
  }

  const inner = pattern.slice(1, -1);

  const dotDotIdx = inner.indexOf("..");
  if (dotDotIdx === -1) {
    return [pattern];
  }

  const left = inner.slice(0, dotDotIdx);
  const right = inner.slice(dotDotIdx + 2);

  if (left === "" || right === "") {
    return [pattern];
  }

  // Try numeric range
  const leftNum = Number(left);
  const rightNum = Number(right);
  if (!Number.isNaN(leftNum) && !Number.isNaN(rightNum)) {
    return expandNumericRange(leftNum, rightNum);
  }

  // Try alpha range (single characters)
  if (left.length === 1 && right.length === 1) {
    return expandAlphaRange(left, right);
  }

  return [pattern];
};

/**
 * Expand a numeric range iteratively.
 *
 * @param start - Start number.
 * @param end - End number.
 * @returns Array of stringified numbers.
 */
const expandNumericRange = (
  start: number,
  end: number,
): ReadonlyArray<string> => {
  const result: Array<string> = [];
  const step = start <= end ? 1 : -1;
  let current = start;

  // Safety: limit range size to prevent memory issues
  const size = Math.abs(end - start) + 1;
  if (size > 10_000) {
    return ["{" + String(start) + ".." + String(end) + "}"];
  }

  while (step > 0 ? current <= end : current >= end) {
    result.push(String(current));
    current += step;
  }
  return result;
};

/**
 * Expand an alphabetic range iteratively.
 *
 * @param start - Start character.
 * @param end - End character.
 * @returns Array of characters.
 */
const expandAlphaRange = (
  start: string,
  end: string,
): ReadonlyArray<string> => {
  const startCode = start.charCodeAt(0);
  const endCode = end.charCodeAt(0);
  const step = startCode <= endCode ? 1 : -1;
  const result: Array<string> = [];
  let current = startCode;

  while (step > 0 ? current <= endCode : current >= endCode) {
    result.push(String.fromCharCode(current));
    current += step;
  }
  return result;
};

/**
 * Check whether the content between braces is a range pattern.
 *
 * @param content - The content inside braces (without the braces).
 * @returns `true` if it matches a range like `a..z` or `1..10`.
 */
const isRangePattern = (content: string): boolean => {
  const dotDotIdx = content.indexOf("..");
  if (dotDotIdx === -1) {
    return false;
  }
  const left = content.slice(0, dotDotIdx);
  const right = content.slice(dotDotIdx + 2);
  if (left === "" || right === "") {
    return false;
  }
  // Numeric range
  const leftNum = Number(left);
  const rightNum = Number(right);
  if (!Number.isNaN(leftNum) && !Number.isNaN(rightNum)) {
    return true;
  }
  // Alpha range
  if (left.length === 1 && right.length === 1) {
    return true;
  }
  return false;
};

/**
 * Find the matching closing brace for an opening brace.
 * Handles nested braces iteratively.
 *
 * @param str - The string to search.
 * @param openIdx - The index of the opening brace.
 * @returns The index of the matching closing brace, or -1 if not found.
 */
const findClosingBrace = (str: string, openIdx: number): number => {
  let depth = 1;
  let i = openIdx + 1;
  const len = str.length;
  while (i < len) {
    const ch = str[i] as string;
    if (ch === "\\" && i + 1 < len) {
      i += 2;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
    i += 1;
  }
  return -1;
};

/**
 * Split a brace content by commas, respecting nested braces.
 *
 * @param content - The content inside braces (without the braces).
 * @returns Array of comma-separated segments.
 */
const splitBraceContent = (content: string): ReadonlyArray<string> => {
  const parts: Array<string> = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  const len = content.length;

  while (i < len) {
    const ch = content[i] as string;
    if (ch === "\\" && i + 1 < len) {
      i += 2;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      parts.push(content.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  parts.push(content.slice(start));
  return parts;
};

/**
 * Expand brace patterns iteratively using a queue-based approach.
 *
 * Supports:
 * - Simple alternatives: `{a,b,c}` → `['a', 'b', 'c']`
 * - Nested braces: `{a,{b,c}}` → `['a', 'b', 'c']`
 * - Multiple brace groups: `{a,b}{c,d}` → `['ac', 'ad', 'bc', 'bd']`
 * - Range patterns: `{1..3}` → `['1', '2', '3']`
 *
 * @param pattern - The pattern containing braces to expand.
 * @returns An array of expanded patterns.
 */
export const expandBraces = (pattern: string): ReadonlyArray<string> => {
  // Queue-based iterative expansion (no recursion)
  const queue: Array<string> = [pattern];
  const completed: Array<string> = [];

  while (queue.length > 0) {
    const current = queue.shift() as string;

    // Find the first unescaped opening brace
    const openIdx = findFirstUnescapedBrace(current);

    if (openIdx === -1) {
      // No more braces — this pattern is fully expanded
      completed.push(current);
      continue;
    }

    const closeIdx = findClosingBrace(current, openIdx);
    if (closeIdx === -1) {
      // Unmatched brace — treat as literal
      completed.push(current);
      continue;
    }

    const prefix = current.slice(0, openIdx);
    const content = current.slice(openIdx + 1, closeIdx);
    const suffix = current.slice(closeIdx + 1);

    // Check if this is a range pattern
    if (isRangePattern(content)) {
      const rangeValues = expandRange("{" + content + "}");
      const rangeLen = rangeValues.length;
      let ri = 0;
      while (ri < rangeLen) {
        queue.push(prefix + (rangeValues[ri] as string) + suffix);
        ri += 1;
      }
    } else {
      // Split by commas respecting nested braces
      const alternatives = splitBraceContent(content);

      // If no commas found, strip braces and re-queue for further expansion
      if (alternatives.length <= 1 && !content.includes(",")) {
        queue.push(prefix + content + suffix);
        continue;
      }

      const altLen = alternatives.length;
      let ai = 0;
      while (ai < altLen) {
        queue.push(prefix + (alternatives[ai] as string) + suffix);
        ai += 1;
      }
    }
  }

  return completed;
};

/**
 * Find the first unescaped opening brace in a string.
 *
 * @param str - The string to search.
 * @returns Index of the first unescaped `{`, or -1.
 */
const findFirstUnescapedBrace = (str: string): number => {
  const len = str.length;
  let i = 0;
  while (i < len) {
    if (str[i] === "\\" && i + 1 < len) {
      i += 2;
      continue;
    }
    if (str[i] === "{") {
      return i;
    }
    i += 1;
  }
  return -1;
};

/**
 * Escape a string for use in a regular expression.
 *
 * @param str - The string to escape.
 * @returns The escaped string.
 */
const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Convert a glob pattern to a regular expression.
 *
 * Supports:
 * - `*` matches any character except path separator
 * - `**` matches any character including path separator
 * - `?` matches exactly one character (not separator)
 * - `[abc]` character class
 * - `[^abc]` or `[!abc]` negated character class
 * - `{a,b,c}` brace expansion (alternatives)
 * - Escaped characters via backslash
 *
 * @param pattern - The glob pattern.
 * @returns A compiled regular expression.
 */
export const globToRegex = (pattern: string): RegExp => {
  // Handle brace expansion first
  const expanded = expandBraces(pattern);

  if (expanded.length > 1) {
    const regexParts: Array<string> = [];
    const expLen = expanded.length;
    let ei = 0;
    while (ei < expLen) {
      regexParts.push(singleGlobToRegexStr(expanded[ei] as string));
      ei += 1;
    }
    return new RegExp("^(?:" + regexParts.join("|") + ")$");
  }

  return new RegExp("^" + singleGlobToRegexStr(expanded[0] as string) + "$");
};

/**
 * Convert a single glob pattern (no brace alternatives) to a regex string.
 * Iterates character-by-character building the regex.
 *
 * @param pattern - A single glob pattern (braces already expanded).
 * @returns A regex source string (not anchored).
 */
const singleGlobToRegexStr = (pattern: string): string => {
  // Do NOT normalize backslashes globally — they serve as escape chars.
  // Only treat standalone backslashes (not escape sequences) as separators.
  const len = pattern.length;
  const parts: Array<string> = [];
  let i = 0;

  while (i < len) {
    const ch = pattern[i] as string;

    // Escaped character: backslash followed by another character
    if (ch === "\\" && i + 1 < len) {
      const nextCh = pattern[i + 1] as string;
      // If next char is a glob special char or regex special char, treat as escape
      if (
        GLOB_CHARS.has(nextCh) ||
        "^$+.()|".includes(nextCh) ||
        nextCh === "\\"
      ) {
        parts.push(escapeRegex(nextCh));
        i += 2;
        continue;
      }
      // Otherwise treat backslash as path separator
      parts.push(SEP_RE);
      i += 1;
      continue;
    }

    // Double star: **
    if (ch === "*" && i + 1 < len && pattern[i + 1] === "*") {
      // Check for **/ pattern (globstar)
      if (i + 2 < len && (pattern[i + 2] === SEP || pattern[i + 2] === "\\")) {
        // **/ matches zero or more directories
        parts.push("(?:.*" + SEP_RE + ")?");
        i += 3;
      } else {
        // ** at end or standalone — match everything
        parts.push(".*");
        i += 2;
      }
      continue;
    }

    // Single star: *
    if (ch === "*") {
      parts.push("[^" + SEP_RE + "]*");
      i += 1;
      continue;
    }

    // Question mark: ?
    if (ch === "?") {
      parts.push("[^" + SEP_RE + "]");
      i += 1;
      continue;
    }

    // Character class: [...]
    if (ch === "[") {
      const classEnd = findCharClassEnd(pattern, i);
      if (classEnd !== -1) {
        const classContent = pattern.slice(i + 1, classEnd);
        // Handle negation: [!...] or [^...]
        if (classContent.startsWith("!") || classContent.startsWith("^")) {
          parts.push("[^" + classContent.slice(1) + "]");
        } else {
          parts.push("[" + classContent + "]");
        }
        i = classEnd + 1;
        continue;
      }
      // Unmatched bracket — treat as literal
      parts.push(escapeRegex(ch));
      i += 1;
      continue;
    }

    // Path separator
    if (ch === SEP) {
      parts.push(SEP_RE);
      i += 1;
      continue;
    }

    // Dot (needs escaping in regex)
    if (ch === ".") {
      parts.push("\\.");
      i += 1;
      continue;
    }

    // Regular characters that are regex-special
    if ("^$+{}()|".includes(ch)) {
      parts.push(escapeRegex(ch));
      i += 1;
      continue;
    }

    // Normal character
    parts.push(ch);
    i += 1;
  }

  return parts.join("");
};

/**
 * Find the end of a character class `[...]`.
 *
 * @param str - The string containing the character class.
 * @param openIdx - The index of the opening `[`.
 * @returns The index of the closing `]`, or -1 if not found.
 */
const findCharClassEnd = (str: string, openIdx: number): number => {
  const len = str.length;
  let i = openIdx + 1;

  // Allow ] as first character in class (literal)
  if (i < len && (str[i] === "]" || str[i] === "^" || str[i] === "!")) {
    i += 1;
    // After negation, allow literal ]
    if (i < len && str[i] === "]") {
      i += 1;
    }
  }

  while (i < len) {
    const ch = str[i] as string;
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "]") {
      return i;
    }
    i += 1;
  }
  return -1;
};

/**
 * Test whether a string matches a glob pattern.
 *
 * Normalizes path separators to forward slashes before matching.
 *
 * @param pattern - The glob pattern.
 * @param input - The string to test.
 * @returns `true` if the input matches the pattern.
 */
export const matchGlob = (pattern: string, input: string): boolean => {
  const normalizedInput = input.replace(/\\/g, SEP);
  const regex = globToRegex(pattern);
  return regex.test(normalizedInput);
};
