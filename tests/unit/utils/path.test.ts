/**
 * Tests for src/utils/path.ts
 *
 * Covers normalization, absolute detection, relative path computation,
 * directory/basename/extension extraction, filename sanitization,
 * and case-difference warnings.
 */
import { describe, it, expect } from "vitest";
import {
  normalizePath,
  isAbsolute,
  relativePath,
  getDirectory,
  getBaseName,
  getExtension,
  sanitizeFileName,
  warnOnCaseDifference,
} from "../../../src/utils/path";

describe("path utilities", () => {
  describe("normalizePath", () => {
    it("should return forward-slash paths unchanged", () => {
      expect(normalizePath("/foo/bar/baz.ts")).toBe("/foo/bar/baz.ts");
    });

    it("should convert backslashes to forward slashes", () => {
      expect(normalizePath("foo\\bar\\baz.ts")).toBe("foo/bar/baz.ts");
    });

    it("should handle UNC paths", () => {
      expect(normalizePath("\\\\server\\share\\file.txt")).toBe(
        "//server/share/file.txt",
      );
    });

    it("should handle drive letters", () => {
      expect(normalizePath("C:\\Users\\docs\\file.txt")).toBe(
        "C:/Users/docs/file.txt",
      );
    });

    it("should handle mixed separators", () => {
      expect(normalizePath("foo/bar\\baz/qux\\file.ts")).toBe(
        "foo/bar/baz/qux/file.ts",
      );
    });

    it("should handle empty string", () => {
      expect(normalizePath("")).toBe("");
    });

    it("should handle a single backslash", () => {
      expect(normalizePath("\\")).toBe("/");
    });

    it("should handle a single forward slash", () => {
      expect(normalizePath("/")).toBe("/");
    });

    it("should handle path with only backslashes", () => {
      expect(normalizePath("\\\\\\")).toBe("///");
    });
  });

  describe("isAbsolute", () => {
    it("should return true for Unix absolute paths", () => {
      expect(isAbsolute("/foo/bar")).toBe(true);
    });

    it("should return true for Windows drive letter paths", () => {
      expect(isAbsolute("C:/foo")).toBe(true);
    });

    it("should return true for Windows drive letter paths with backslashes", () => {
      expect(isAbsolute("C:\\foo")).toBe(true);
    });

    it("should return true for lowercase drive letters", () => {
      expect(isAbsolute("d:/projects")).toBe(true);
    });

    it("should return false for relative paths", () => {
      expect(isAbsolute("foo/bar")).toBe(false);
    });

    it("should return false for dot-relative paths", () => {
      expect(isAbsolute("./foo")).toBe(false);
    });

    it("should return false for parent-relative paths", () => {
      expect(isAbsolute("../foo")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isAbsolute("")).toBe(false);
    });

    it("should return true for UNC paths", () => {
      expect(isAbsolute("\\\\server\\share")).toBe(true);
    });

    it("should return true for root slash only", () => {
      expect(isAbsolute("/")).toBe(true);
    });
  });

  describe("relativePath", () => {
    it("should compute a basic relative path", () => {
      expect(relativePath("/a/b/c", "/a/b/d")).toBe("../d");
    });

    it("should return '.' when from and to are the same", () => {
      expect(relativePath("/a/b/c", "/a/b/c")).toBe(".");
    });

    it("should handle going up multiple directories", () => {
      expect(relativePath("/a/b/c", "/a/x/y")).toBe("../../x/y");
    });

    it("should handle to being a child of from", () => {
      expect(relativePath("/a/b", "/a/b/c/d")).toBe("c/d");
    });

    it("should handle from being deeper than to", () => {
      expect(relativePath("/a/b/c/d", "/a/b")).toBe("../..");
    });

    it("should handle completely different paths", () => {
      expect(relativePath("/x/y", "/a/b")).toBe("../../a/b");
    });

    it("should handle backslash paths", () => {
      expect(relativePath("\\a\\b\\c", "\\a\\b\\d")).toBe("../d");
    });

    it("should handle empty from and to", () => {
      expect(relativePath("", "")).toBe(".");
    });

    it("should handle from empty, to non-empty", () => {
      expect(relativePath("", "a/b")).toBe("a/b");
    });

    it("should handle from non-empty, to empty", () => {
      expect(relativePath("a/b", "")).toBe("../..");
    });
  });

  describe("getDirectory", () => {
    it("should return directory for a normal path", () => {
      expect(getDirectory("/foo/bar/baz.ts")).toBe("/foo/bar");
    });

    it("should return '.' for a filename with no directory", () => {
      expect(getDirectory("baz.ts")).toBe(".");
    });

    it("should return '/' for a file in root", () => {
      expect(getDirectory("/baz.ts")).toBe("/");
    });

    it("should handle backslash paths", () => {
      expect(getDirectory("C:\\Users\\file.txt")).toBe("C:/Users");
    });

    it("should handle nested directories", () => {
      expect(getDirectory("/a/b/c/d/e.js")).toBe("/a/b/c/d");
    });

    it("should handle empty string", () => {
      expect(getDirectory("")).toBe(".");
    });
  });

  describe("getBaseName", () => {
    it("should return filename from a path", () => {
      expect(getBaseName("/foo/bar/baz.ts")).toBe("baz.ts");
    });

    it("should return the input if no directory separator", () => {
      expect(getBaseName("baz.ts")).toBe("baz.ts");
    });

    it("should handle backslash paths", () => {
      expect(getBaseName("C:\\Users\\file.txt")).toBe("file.txt");
    });

    it("should return empty string for trailing slash", () => {
      expect(getBaseName("/foo/bar/")).toBe("");
    });

    it("should handle empty string", () => {
      expect(getBaseName("")).toBe("");
    });
  });

  describe("getExtension", () => {
    it("should return the extension with dot", () => {
      expect(getExtension("file.ts")).toBe(".ts");
    });

    it("should return the last extension for multiple dots", () => {
      expect(getExtension("file.test.ts")).toBe(".ts");
    });

    it("should return empty string for no extension", () => {
      expect(getExtension("Makefile")).toBe("");
    });

    it("should return empty string for dotfiles", () => {
      expect(getExtension(".gitignore")).toBe("");
    });

    it("should handle path with directories", () => {
      expect(getExtension("/foo/bar/baz.js")).toBe(".js");
    });

    it("should handle empty string", () => {
      expect(getExtension("")).toBe("");
    });

    it("should handle backslash paths", () => {
      expect(getExtension("C:\\Users\\file.txt")).toBe(".txt");
    });
  });

  describe("sanitizeFileName", () => {
    it("should return normal filenames unchanged", () => {
      expect(sanitizeFileName("hello.txt")).toBe("hello.txt");
    });

    it("should prefix reserved name CON", () => {
      expect(sanitizeFileName("CON")).toBe("_CON");
    });

    it("should prefix reserved name PRN", () => {
      expect(sanitizeFileName("PRN.txt")).toBe("_PRN.txt");
    });

    it("should prefix reserved name AUX", () => {
      expect(sanitizeFileName("AUX")).toBe("_AUX");
    });

    it("should prefix reserved name NUL", () => {
      expect(sanitizeFileName("NUL")).toBe("_NUL");
    });

    it("should prefix reserved name COM1 (case-insensitive)", () => {
      expect(sanitizeFileName("com1")).toBe("_com1");
    });

    it("should prefix reserved name LPT1", () => {
      expect(sanitizeFileName("LPT1")).toBe("_LPT1");
    });

    it("should prefix reserved name COM9 with extension", () => {
      expect(sanitizeFileName("COM9.txt")).toBe("_COM9.txt");
    });

    it("should replace < with underscore", () => {
      expect(sanitizeFileName("file<name.txt")).toBe("file_name.txt");
    });

    it("should replace > with underscore", () => {
      expect(sanitizeFileName("file>name.txt")).toBe("file_name.txt");
    });

    it("should replace | with underscore", () => {
      expect(sanitizeFileName("file|name.txt")).toBe("file_name.txt");
    });

    it("should replace ? with underscore", () => {
      expect(sanitizeFileName("file?name.txt")).toBe("file_name.txt");
    });

    it("should replace * with underscore", () => {
      expect(sanitizeFileName("file*name.txt")).toBe("file_name.txt");
    });

    it("should replace : with underscore", () => {
      expect(sanitizeFileName("file:name.txt")).toBe("file_name.txt");
    });

    it('should replace " with underscore', () => {
      expect(sanitizeFileName('file"name.txt')).toBe("file_name.txt");
    });

    it("should replace multiple reserved characters", () => {
      expect(sanitizeFileName("a<b>c|d.txt")).toBe("a_b_c_d.txt");
    });

    it("should handle empty string", () => {
      expect(sanitizeFileName("")).toBe("");
    });

    it("should not prefix non-reserved names that contain reserved substrings", () => {
      expect(sanitizeFileName("CONSOLE.txt")).toBe("CONSOLE.txt");
    });

    it("should handle reserved name LPT9", () => {
      expect(sanitizeFileName("LPT9")).toBe("_LPT9");
    });
  });

  describe("warnOnCaseDifference", () => {
    it("should return null for identical strings", () => {
      expect(warnOnCaseDifference("foo", "foo")).toBeNull();
    });

    it("should return null for completely different strings", () => {
      expect(warnOnCaseDifference("foo", "bar")).toBeNull();
    });

    it("should return a warning for case-only difference", () => {
      const result = warnOnCaseDifference("MyFile", "myfile");
      expect(result).toBeTypeOf("string");
      expect(result).toContain("MyFile");
      expect(result).toContain("myfile");
    });

    it("should return a warning for single character case difference", () => {
      const result = warnOnCaseDifference("A", "a");
      expect(result).not.toBeNull();
    });

    it("should return null for empty strings", () => {
      expect(warnOnCaseDifference("", "")).toBeNull();
    });

    it("should return null when one is empty and other is not", () => {
      expect(warnOnCaseDifference("", "a")).toBeNull();
    });

    it("should include case-insensitive filesystem warning in message", () => {
      const result = warnOnCaseDifference("Foo", "foo");
      expect(result).toContain("case-insensitive");
    });
  });
});
