/**
 * Tests for the glob pattern matching utility.
 *
 * @module tests/unit/utils/glob
 */

import { describe, it, expect } from "vitest";
import {
  isGlob,
  globParent,
  expandRange,
  expandBraces,
  globToRegex,
  matchGlob,
} from "../../../src/utils/glob.js";

describe("isGlob", () => {
  it("returns true for patterns with *", () => {
    expect(isGlob("*.ts")).toBe(true);
    expect(isGlob("src/*")).toBe(true);
  });

  it("returns true for patterns with **", () => {
    expect(isGlob("src/**/*.ts")).toBe(true);
  });

  it("returns true for patterns with ?", () => {
    expect(isGlob("file?.ts")).toBe(true);
  });

  it("returns true for patterns with [", () => {
    expect(isGlob("[abc].ts")).toBe(true);
  });

  it("returns true for patterns with ]", () => {
    expect(isGlob("a]b")).toBe(true);
  });

  it("returns true for patterns with {", () => {
    expect(isGlob("{a,b}.ts")).toBe(true);
  });

  it("returns true for patterns with }", () => {
    expect(isGlob("a}b")).toBe(true);
  });

  it("returns false for plain paths", () => {
    expect(isGlob("src/index.ts")).toBe(false);
    expect(isGlob("package.json")).toBe(false);
    expect(isGlob("")).toBe(false);
  });

  it("returns false for escaped glob characters", () => {
    expect(isGlob("file\\*.ts")).toBe(false);
    expect(isGlob("file\\?.ts")).toBe(false);
    expect(isGlob("file\\[a\\].ts")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isGlob("")).toBe(false);
  });

  it("handles escaped backslash at end of string", () => {
    expect(isGlob("file\\")).toBe(false);
  });
});

describe("globParent", () => {
  it("returns parent directory before glob", () => {
    expect(globParent("src/*.ts")).toBe("src");
  });

  it("handles nested directories", () => {
    expect(globParent("src/utils/*.ts")).toBe("src/utils");
  });

  it("handles ** pattern", () => {
    expect(globParent("src/**/*.ts")).toBe("src");
  });

  it("returns . for patterns starting with glob", () => {
    expect(globParent("*.ts")).toBe(".");
    expect(globParent("**/*.ts")).toBe(".");
  });

  it("returns . for plain file names", () => {
    expect(globParent("file.ts")).toBe(".");
  });

  it("handles patterns with no directory separator", () => {
    expect(globParent("index.ts")).toBe(".");
  });

  it("handles backslash separators by normalizing", () => {
    expect(globParent("src\\utils\\*.ts")).toBe("src/utils");
  });

  it("handles deep paths with late globs", () => {
    expect(globParent("a/b/c/d/*.ts")).toBe("a/b/c/d");
  });

  it("returns . for empty string input", () => {
    expect(globParent("")).toBe(".");
  });

  it("handles path starting with /", () => {
    expect(globParent("/src/*.ts")).toBe("/src");
  });

  it("handles root-level glob pattern", () => {
    expect(globParent("/*.ts")).toBe(".");
  });
});

describe("expandRange", () => {
  it("expands numeric range ascending", () => {
    expect(expandRange("{1..5}")).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("expands numeric range descending", () => {
    expect(expandRange("{5..1}")).toEqual(["5", "4", "3", "2", "1"]);
  });

  it("expands single-element numeric range", () => {
    expect(expandRange("{3..3}")).toEqual(["3"]);
  });

  it("expands alpha range ascending", () => {
    expect(expandRange("{a..e}")).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("expands alpha range descending", () => {
    expect(expandRange("{e..a}")).toEqual(["e", "d", "c", "b", "a"]);
  });

  it("expands single-element alpha range", () => {
    expect(expandRange("{a..a}")).toEqual(["a"]);
  });

  it("handles negative numbers", () => {
    expect(expandRange("{-2..2}")).toEqual(["-2", "-1", "0", "1", "2"]);
  });

  it("returns original for non-range patterns", () => {
    expect(expandRange("abc")).toEqual(["abc"]);
    expect(expandRange("{abc}")).toEqual(["{abc}"]);
  });

  it("returns original for empty sides", () => {
    expect(expandRange("{..5}")).toEqual(["{..5}"]);
    expect(expandRange("{5..}")).toEqual(["{5..}"]);
  });

  it("returns original for multi-char alpha", () => {
    expect(expandRange("{ab..cd}")).toEqual(["{ab..cd}"]);
  });

  it("handles pattern without braces", () => {
    expect(expandRange("1..5")).toEqual(["1..5"]);
  });

  it("returns original for excessively large ranges", () => {
    const result = expandRange("{1..100000}");
    expect(result).toEqual(["{1..100000}"]);
  });
});

describe("expandBraces", () => {
  it("expands simple alternatives", () => {
    const result = expandBraces("{a,b,c}");
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("expands with prefix and suffix", () => {
    const result = expandBraces("file.{ts,js}");
    expect(result).toEqual(["file.ts", "file.js"]);
  });

  it("expands nested braces", () => {
    const result = expandBraces("{a,{b,c}}");
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("expands multiple brace groups", () => {
    const result = expandBraces("{a,b}{c,d}");
    expect(result).toEqual(["ac", "ad", "bc", "bd"]);
  });

  it("handles range patterns inside braces", () => {
    const result = expandBraces("{1..3}");
    expect(result).toEqual(["1", "2", "3"]);
  });

  it("handles alpha range inside braces", () => {
    const result = expandBraces("{a..c}");
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("returns original for no braces", () => {
    const result = expandBraces("hello");
    expect(result).toEqual(["hello"]);
  });

  it("handles unmatched opening brace", () => {
    const result = expandBraces("{abc");
    expect(result).toEqual(["{abc"]);
  });

  it("returns original for empty pattern", () => {
    const result = expandBraces("");
    expect(result).toEqual([""]);
  });

  it("expands deeply nested braces", () => {
    const result = expandBraces("{a,{b,{c,d}}}");
    expect(result).toEqual(["a", "b", "c", "d"]);
  });

  it("handles braces with prefix/suffix and range", () => {
    const result = expandBraces("file{1..3}.ts");
    expect(result).toEqual(["file1.ts", "file2.ts", "file3.ts"]);
  });

  it("handles single item in braces (no comma)", () => {
    const result = expandBraces("{a}");
    expect(result).toEqual(["a"]);
  });

  it("handles empty alternatives", () => {
    const result = expandBraces("{a,}");
    expect(result).toEqual(["a", ""]);
  });

  it("handles escaped braces", () => {
    const result = expandBraces("\\{a,b\\}");
    expect(result).toEqual(["\\{a,b\\}"]);
  });

  it("handles commas with nested braces", () => {
    const result = expandBraces("{a,b,{c,d},e}");
    // Queue-based BFS: a, b, e are resolved first; {c,d} re-enters queue
    expect(result).toEqual(["a", "b", "e", "c", "d"]);
  });
});

describe("expandBraces (additional coverage)", () => {
  it("handles single item with no comma as literal pass-through", () => {
    const result = expandBraces("{abc}");
    expect(result).toEqual(["abc"]);
  });

  it("handles nested braces that would cause infinite loop", () => {
    // Pattern where stripping braces yields the same string
    const result = expandBraces("{a}");
    expect(result).toEqual(["a"]);
  });
});

describe("expandBraces (edge cases)", () => {
  it("handles escaped commas inside braces via splitBraceContent", () => {
    // JS string: {a\,b,c} — the \, is an escaped comma (not a separator)
    const input = "{a\\,b,c}";
    const result = expandBraces(input);
    expect(result).toEqual(["a\\,b", "c"]);
  });

  it("handles escaped closing brace in findClosingBrace", () => {
    // JS string: {a,b\}} — the \} is escaped, real close is the last }
    const input = "{a,b\\}}";
    const result = expandBraces(input);
    expect(result).toEqual(["a", "b\\}"]);
  });

  it("handles content that looks like range but has empty left", () => {
    const result = expandBraces("{..5}");
    expect(result).toEqual(["..5"]);
  });

  it("handles content that looks like range with empty right", () => {
    const result = expandBraces("{5..}");
    expect(result).toEqual(["5.."]);
  });

  it("handles brace content with multi-char non-numeric non-alpha range", () => {
    const result = expandBraces("{ab..cd}");
    expect(result).toEqual(["ab..cd"]);
  });

  it("handles escaped open brace in findClosingBrace", () => {
    // JS string: {a\{x,b} — the \{ is escaped brace inside
    const input = "{a\\{x,b}";
    const result = expandBraces(input);
    expect(result).toEqual(["a\\{x", "b"]);
  });
});

describe("globToRegex", () => {
  it("converts * to match non-separator characters", () => {
    const re = globToRegex("*.ts");
    expect(re.test("file.ts")).toBe(true);
    expect(re.test("index.ts")).toBe(true);
    expect(re.test("src/file.ts")).toBe(false);
  });

  it("converts ** to match any characters including separator", () => {
    const re = globToRegex("**/*.ts");
    expect(re.test("src/file.ts")).toBe(true);
    expect(re.test("src/utils/file.ts")).toBe(true);
    expect(re.test("file.ts")).toBe(true);
  });

  it("converts ? to match single non-separator character", () => {
    const re = globToRegex("file?.ts");
    expect(re.test("file1.ts")).toBe(true);
    expect(re.test("fileA.ts")).toBe(true);
    expect(re.test("file.ts")).toBe(false);
    expect(re.test("file12.ts")).toBe(false);
  });

  it("handles character classes [abc]", () => {
    const re = globToRegex("[abc].ts");
    expect(re.test("a.ts")).toBe(true);
    expect(re.test("b.ts")).toBe(true);
    expect(re.test("d.ts")).toBe(false);
  });

  it("handles negated character classes [^abc]", () => {
    const re = globToRegex("[^abc].ts");
    expect(re.test("d.ts")).toBe(true);
    expect(re.test("a.ts")).toBe(false);
  });

  it("handles negated character classes with ! syntax [!abc]", () => {
    const re = globToRegex("[!abc].ts");
    expect(re.test("d.ts")).toBe(true);
    expect(re.test("a.ts")).toBe(false);
  });

  it("handles brace expansion in patterns", () => {
    const re = globToRegex("*.{ts,js}");
    expect(re.test("file.ts")).toBe(true);
    expect(re.test("file.js")).toBe(true);
    expect(re.test("file.py")).toBe(false);
  });

  it("anchors the regex to full string", () => {
    const re = globToRegex("file.ts");
    expect(re.test("file.ts")).toBe(true);
    expect(re.test("xfile.ts")).toBe(false);
    expect(re.test("file.tsx")).toBe(false);
  });

  it("handles ** at end of pattern", () => {
    const re = globToRegex("src/**");
    expect(re.test("src/file.ts")).toBe(true);
    expect(re.test("src/a/b/c.ts")).toBe(true);
  });

  it("handles nested ** patterns", () => {
    const re = globToRegex("src/**/test/**/*.ts");
    expect(re.test("src/test/file.ts")).toBe(true);
    expect(re.test("src/utils/test/unit/file.ts")).toBe(true);
  });

  it("escapes regex special characters in literal parts", () => {
    const re = globToRegex("file.test.ts");
    expect(re.test("file.test.ts")).toBe(true);
    expect(re.test("filextest.ts")).toBe(false);
  });

  it("handles unmatched bracket as literal", () => {
    const re = globToRegex("[file.ts");
    expect(re.test("[file.ts")).toBe(true);
  });

  it("handles escaped characters", () => {
    const re = globToRegex("file\\*.ts");
    expect(re.test("file*.ts")).toBe(true);
    expect(re.test("fileX.ts")).toBe(false);
  });

  it("handles path separators", () => {
    const re = globToRegex("src/utils/file.ts");
    expect(re.test("src/utils/file.ts")).toBe(true);
  });

  it("handles regex special chars $, +, (, ), |", () => {
    const re = globToRegex("file(1).ts");
    expect(re.test("file(1).ts")).toBe(true);
  });

  it("handles pattern with ^ and $", () => {
    const re = globToRegex("$file^.ts");
    expect(re.test("$file^.ts")).toBe(true);
  });

  it("treats backslash before non-special char as path separator", () => {
    const re = globToRegex("src\\utils\\file.ts");
    expect(re.test("src/utils/file.ts")).toBe(true);
  });

  it("handles character class with escaped char inside", () => {
    const re = globToRegex("[a\\]b].ts");
    expect(re.test("a.ts")).toBe(true);
    expect(re.test("].ts")).toBe(true);
  });

  it("handles character class with character range [0-9]", () => {
    const re = globToRegex("file[0-9].ts");
    expect(re.test("file5.ts")).toBe(true);
    expect(re.test("fileX.ts")).toBe(false);
  });

  it("handles character class with range [a-z]", () => {
    const re = globToRegex("[a-z].ts");
    expect(re.test("m.ts")).toBe(true);
    expect(re.test("M.ts")).toBe(false);
  });

  it("handles escaped char inside character class", () => {
    const re = globToRegex("[a\\\\b].ts");
    expect(re.test("a.ts")).toBe(true);
  });

  it("handles **/ with backslash separator", () => {
    const re = globToRegex("src/**\\*.ts");
    expect(re.test("src/utils/file.ts")).toBe(true);
  });

  it("handles escaped backslash", () => {
    const re = globToRegex("file\\\\.ts");
    expect(re.test("file\\.ts")).toBe(true);
  });

  it("handles + in pattern", () => {
    const re = globToRegex("file+.ts");
    expect(re.test("file+.ts")).toBe(true);
    expect(re.test("fileee.ts")).toBe(false);
  });

  it("handles negated char class with ^ prefix followed by ]", () => {
    // [^]x] — findCharClassEnd sees ^ then ], treats ] as literal in class
    // classContent = "^]x", output regex class = [^]x]
    // In JS regex [^] matches any char, so [^]x] = any-char followed by x]
    const re = globToRegex("[^]x]y.ts");
    expect(re.test("Zx]y.ts")).toBe(true);
  });

  it("handles pipe | in pattern", () => {
    const re = globToRegex("a|b.ts");
    expect(re.test("a|b.ts")).toBe(true);
  });
});

describe("matchGlob", () => {
  it("matches simple wildcard patterns", () => {
    expect(matchGlob("*.ts", "index.ts")).toBe(true);
    expect(matchGlob("*.ts", "index.js")).toBe(false);
  });

  it("matches globstar patterns", () => {
    expect(matchGlob("src/**/*.ts", "src/utils/file.ts")).toBe(true);
    expect(matchGlob("src/**/*.ts", "src/file.ts")).toBe(true);
    expect(matchGlob("src/**/*.ts", "lib/file.ts")).toBe(false);
  });

  it("matches question mark patterns", () => {
    expect(matchGlob("file?.ts", "file1.ts")).toBe(true);
    expect(matchGlob("file?.ts", "file.ts")).toBe(false);
  });

  it("matches character class patterns", () => {
    expect(matchGlob("[abc].ts", "a.ts")).toBe(true);
    expect(matchGlob("[abc].ts", "x.ts")).toBe(false);
  });

  it("matches brace expansion patterns", () => {
    expect(matchGlob("*.{ts,js,tsx}", "file.ts")).toBe(true);
    expect(matchGlob("*.{ts,js,tsx}", "file.tsx")).toBe(true);
    expect(matchGlob("*.{ts,js,tsx}", "file.py")).toBe(false);
  });

  it("normalizes backslash separators in input", () => {
    expect(matchGlob("src/*.ts", "src\\file.ts")).toBe(true);
  });

  it("handles empty pattern", () => {
    expect(matchGlob("", "")).toBe(true);
    expect(matchGlob("", "file.ts")).toBe(false);
  });

  it("handles empty input", () => {
    expect(matchGlob("*", "")).toBe(true);
    expect(matchGlob("?", "")).toBe(false);
  });

  it("handles exact file matches", () => {
    expect(matchGlob("package.json", "package.json")).toBe(true);
    expect(matchGlob("package.json", "other.json")).toBe(false);
  });

  it("handles complex patterns", () => {
    expect(
      matchGlob("src/**/test/*.{spec,test}.ts", "src/utils/test/foo.spec.ts"),
    ).toBe(true);
    expect(
      matchGlob("src/**/test/*.{spec,test}.ts", "src/utils/test/foo.test.ts"),
    ).toBe(true);
    expect(
      matchGlob("src/**/test/*.{spec,test}.ts", "src/utils/test/foo.ts"),
    ).toBe(false);
  });

  it("matches range patterns in braces", () => {
    expect(matchGlob("file{1..3}.ts", "file1.ts")).toBe(true);
    expect(matchGlob("file{1..3}.ts", "file2.ts")).toBe(true);
    expect(matchGlob("file{1..3}.ts", "file3.ts")).toBe(true);
    expect(matchGlob("file{1..3}.ts", "file4.ts")).toBe(false);
  });

  it("handles no-match scenarios", () => {
    expect(matchGlob("*.ts", "")).toBe(false);
    expect(matchGlob("src/*.ts", "lib/file.ts")).toBe(false);
    expect(matchGlob("src/file.ts", "src/other.ts")).toBe(false);
  });
});
