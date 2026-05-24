import { describe, it, expect } from "vitest";
import {
  detectLineEnding,
  normalizeLineEndings,
  splitLines,
  countLines,
  getLineOffsets,
} from "../../../src/utils/line-endings.js";

describe("detectLineEnding", () => {
  it("returns LF for LF-only source", () => {
    expect(detectLineEnding("a\nb\nc")).toBe("\n");
  });

  it("returns CRLF for CRLF-only source", () => {
    expect(detectLineEnding("a\r\nb\r\nc")).toBe("\r\n");
  });

  it("returns LF when LF count exceeds CRLF count", () => {
    expect(detectLineEnding("a\nb\nc\r\nd")).toBe("\n");
  });

  it("returns CRLF when CRLF count exceeds LF count", () => {
    expect(detectLineEnding("a\r\nb\r\nc\nd")).toBe("\r\n");
  });

  it("returns LF for empty string", () => {
    expect(detectLineEnding("")).toBe("\n");
  });

  it("returns LF when source has no line endings", () => {
    expect(detectLineEnding("hello world")).toBe("\n");
  });

  it("returns LF when LF and CRLF counts are equal", () => {
    expect(detectLineEnding("a\nb\r\nc")).toBe("\n");
  });

  it("counts standalone CR toward CRLF side", () => {
    /* 1 LF, 1 CRLF, 1 CR → CRLF side = 2, LF side = 0 (the \n in CRLF is not standalone) */
    expect(detectLineEnding("a\r\nb\rc")).toBe("\r\n");
  });

  it("handles source with only CR line endings", () => {
    expect(detectLineEnding("a\rb\rc")).toBe("\r\n");
  });

  it("handles single LF", () => {
    expect(detectLineEnding("\n")).toBe("\n");
  });

  it("handles single CRLF", () => {
    expect(detectLineEnding("\r\n")).toBe("\r\n");
  });
});

describe("normalizeLineEndings", () => {
  it("converts CRLF to LF by default", () => {
    expect(normalizeLineEndings("a\r\nb\r\nc")).toBe("a\nb\nc");
  });

  it("converts LF to CRLF when target is CRLF", () => {
    expect(normalizeLineEndings("a\nb\nc", "\r\n")).toBe("a\r\nb\r\nc");
  });

  it("normalizes mixed line endings to LF", () => {
    expect(normalizeLineEndings("a\r\nb\nc\rd")).toBe("a\nb\nc\nd");
  });

  it("normalizes mixed line endings to CRLF", () => {
    expect(normalizeLineEndings("a\r\nb\nc\rd", "\r\n")).toBe(
      "a\r\nb\r\nc\r\nd",
    );
  });

  it("leaves already-normalized LF source unchanged", () => {
    const source = "a\nb\nc";
    expect(normalizeLineEndings(source)).toBe(source);
  });

  it("leaves already-normalized CRLF source unchanged", () => {
    const source = "a\r\nb\r\nc";
    expect(normalizeLineEndings(source, "\r\n")).toBe(source);
  });

  it("handles empty string", () => {
    expect(normalizeLineEndings("")).toBe("");
    expect(normalizeLineEndings("", "\r\n")).toBe("");
  });

  it("handles source with no line endings", () => {
    expect(normalizeLineEndings("hello")).toBe("hello");
  });

  it("handles standalone CR", () => {
    expect(normalizeLineEndings("a\rb\rc")).toBe("a\nb\nc");
  });

  it("handles standalone CR with CRLF target", () => {
    expect(normalizeLineEndings("a\rb", "\r\n")).toBe("a\r\nb");
  });
});

describe("splitLines", () => {
  it("splits LF source", () => {
    expect(splitLines("a\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("splits CRLF source", () => {
    expect(splitLines("a\r\nb\r\nc")).toEqual(["a", "b", "c"]);
  });

  it("splits mixed line endings", () => {
    expect(splitLines("a\nb\r\nc\rd")).toEqual(["a", "b", "c", "d"]);
  });

  it("preserves empty trailing line from trailing LF", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b", ""]);
  });

  it("preserves empty trailing line from trailing CRLF", () => {
    expect(splitLines("a\r\nb\r\n")).toEqual(["a", "b", ""]);
  });

  it("returns single element when no newlines", () => {
    expect(splitLines("hello")).toEqual(["hello"]);
  });

  it("returns two empty strings for empty string", () => {
    /* ''.split(/.../) returns [''] */
    expect(splitLines("")).toEqual([""]);
  });

  it("handles multiple consecutive newlines", () => {
    expect(splitLines("a\n\nb")).toEqual(["a", "", "b"]);
  });

  it("handles CR-only line endings", () => {
    expect(splitLines("a\rb\rc")).toEqual(["a", "b", "c"]);
  });
});

describe("countLines", () => {
  it("counts lines in LF source", () => {
    expect(countLines("a\nb\nc")).toBe(3);
  });

  it("counts lines in CRLF source", () => {
    expect(countLines("a\r\nb\r\nc")).toBe(3);
  });

  it("counts lines in mixed source", () => {
    expect(countLines("a\nb\r\nc\rd")).toBe(4);
  });

  it("returns 1 for empty string", () => {
    expect(countLines("")).toBe(1);
  });

  it("returns 1 for source with no newlines", () => {
    expect(countLines("hello")).toBe(1);
  });

  it("counts trailing newline as extra line", () => {
    expect(countLines("a\n")).toBe(2);
  });

  it("counts multiple consecutive newlines", () => {
    expect(countLines("\n\n")).toBe(3);
  });
});

describe("getLineOffsets", () => {
  it("returns [0] for empty string", () => {
    expect(getLineOffsets("")).toEqual([0]);
  });

  it("returns correct offsets for LF source", () => {
    /* 'a\nb\nc' → line 1 at 0, line 2 at 2, line 3 at 4 */
    expect(getLineOffsets("a\nb\nc")).toEqual([0, 2, 4]);
  });

  it("returns correct offsets for CRLF source (2 code units per line ending)", () => {
    /* 'a\r\nb\r\nc' → line 1 at 0, line 2 at 3, line 3 at 6 */
    expect(getLineOffsets("a\r\nb\r\nc")).toEqual([0, 3, 6]);
  });

  it("returns correct offsets for CR-only source", () => {
    /* 'a\rb\rc' → line 1 at 0, line 2 at 2, line 3 at 4 */
    expect(getLineOffsets("a\rb\rc")).toEqual([0, 2, 4]);
  });

  it("returns correct offsets for mixed line endings", () => {
    /* 'a\nb\r\nc\rd' → line 1 at 0, line 2 at 2 (after \n), line 3 at 5 (after \r\n), line 4 at 7 (after \r) */
    expect(getLineOffsets("a\nb\r\nc\rd")).toEqual([0, 2, 5, 7]);
  });

  it("handles trailing newline", () => {
    /* 'a\n' → line 1 at 0, line 2 at 2 */
    expect(getLineOffsets("a\n")).toEqual([0, 2]);
  });

  it("handles source with no newlines", () => {
    expect(getLineOffsets("hello")).toEqual([0]);
  });

  it("handles consecutive newlines", () => {
    /* '\n\n' → line 1 at 0, line 2 at 1, line 3 at 2 */
    expect(getLineOffsets("\n\n")).toEqual([0, 1, 2]);
  });

  it("handles consecutive CRLF", () => {
    /* '\r\n\r\n' → line 1 at 0, line 2 at 2, line 3 at 4 */
    expect(getLineOffsets("\r\n\r\n")).toEqual([0, 2, 4]);
  });

  it("handles longer lines with CRLF", () => {
    /* 'hello\r\nworld' → line 1 at 0, line 2 at 7 */
    expect(getLineOffsets("hello\r\nworld")).toEqual([0, 7]);
  });
});
