/**
 * Line ending detection, normalization, and offset tracking.
 * Handles LF (\n), CRLF (\r\n), and CR (\r) line endings
 * with source map compatibility.
 */

type LineEnding = "\n" | "\r\n";

/**
 * Detect the predominant line ending in source text.
 * Returns '\n' (LF) as the default when the source has no
 * line endings or when LF and CRLF counts are equal.
 */
export const detectLineEnding = (source: string): LineEnding => {
  const crlfCount = countMatches(source, "\r\n");
  const totalLfCount = countMatches(source, "\n");
  const lfOnly = totalLfCount - crlfCount;
  const crCount = countCrOnly(source);

  /* CR-only counts toward CRLF "camp" since both use \r */
  const crlfSide = crlfCount + crCount;

  if (crlfSide > lfOnly) {
    return "\r\n";
  }
  return "\n";
};

/**
 * Normalize all line endings in source to the given target.
 * Default target is '\n' (LF), matching rollup behaviour.
 */
export const normalizeLineEndings = (
  source: string,
  target: LineEnding = "\n",
): string => {
  /* Replace CRLF first, then standalone CR, to avoid double-replacing */
  const unified = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (target === "\n") {
    return unified;
  }
  return unified.replace(/\n/g, target);
};

/**
 * Split source by any line ending type, preserving empty trailing lines.
 * A trailing newline produces an empty final element (matching
 * the behaviour of splitting "a\n" → ["a", ""]).
 */
export const splitLines = (source: string): ReadonlyArray<string> => {
  return source.split(/\r\n|\r|\n/);
};

/**
 * Count the number of lines in source, accounting for
 * LF, CRLF, and CR line endings.
 * An empty string is considered to have 1 line.
 */
export const countLines = (source: string): number => {
  return splitLines(source).length;
};

/**
 * Return byte offsets of each line start in UTF-16 code units
 * (matching JavaScript string indexing). The first offset is
 * always 0. CRLF is treated as a single line terminator but
 * occupies 2 code units in the offset calculation.
 */
export const getLineOffsets = (source: string): ReadonlyArray<number> => {
  const offsets: Array<number> = [0];
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\r") {
      if (i + 1 < source.length && source[i + 1] === "\n") {
        offsets.push(i + 2);
        i++; /* skip the \n of CRLF */
      } else {
        offsets.push(i + 1);
      }
    } else if (ch === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
};

/* ---- internal helpers ---- */

/**
 * Count non-overlapping occurrences of a substring.
 * Iterative to avoid recursion.
 */
const countMatches = (haystack: string, needle: string): number => {
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) {
      break;
    }
    count++;
    pos = idx + needle.length;
  }
  return count;
};

/**
 * Count standalone \r characters (not followed by \n).
 */
const countCrOnly = (source: string): number => {
  let count = 0;
  for (let i = 0; i < source.length; i++) {
    if (
      source[i] === "\r" &&
      (i + 1 >= source.length || source[i + 1] !== "\n")
    ) {
      count++;
    }
  }
  return count;
};
