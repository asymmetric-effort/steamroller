import { describe, it, expect } from "bun:test";
import { minify } from "../../../src/minify/minifier.js";
import type { MinifyResult } from "../../../src/minify/minifier.js";

describe("minify", () => {
  describe("basic functionality", () => {
    it("handles empty input", () => {
      const result = minify("");
      expect(result).toBe("");
    });

    it("handles whitespace-only input", () => {
      const result = minify("   \n\t  ");
      expect(result).toBe("");
    });

    it("minifies a simple variable declaration", () => {
      const result = minify("var x = 1;");
      expect(result).toContain("var x=1");
    });

    it("removes comments", () => {
      const code = "var x = 1; // a comment\n/* block comment */\nvar y = 2;";
      const result = minify(code);
      expect(result).not.toContain("a comment");
      expect(result).not.toContain("block comment");
    });

    it("collapses whitespace", () => {
      const result = minify("var   x   =   1  ;");
      expect(result).not.toContain("   ");
    });
  });

  describe("dead code elimination", () => {
    it("removes unreachable code after return", () => {
      const result = minify("function f() { return 1; var x = 2; }");
      expect(result).not.toContain("var x");
    });

    it("removes always-false branches", () => {
      const result = minify("if (false) { console.log(1); }");
      expect(result).toBe("");
    });

    it("can be disabled", () => {
      const result = minify("function f() { return 1; var x = 2; }", {
        deadCode: false,
      });
      expect(result).toContain("var");
    });
  });

  describe("constant folding", () => {
    it("folds 1 + 2 to 3", () => {
      const result = minify("var x = 1 + 2;");
      expect(result).toContain("3");
    });

    it("folds string concatenation", () => {
      const result = minify('var x = "a" + "b";');
      expect(result).toContain('"ab"');
    });

    it("folds conditional with constant test", () => {
      const result = minify("var x = true ? 1 : 2;");
      expect(result).toContain("1");
      expect(result).not.toContain("?");
    });

    it("can be disabled", () => {
      const result = minify("var x = 1 + 2;", { constantFold: false });
      expect(result).toContain("+");
    });
  });

  describe("expression simplification", () => {
    it("replaces true with !0", () => {
      const result = minify("var x = true;", { constantFold: false });
      expect(result).toContain("!0");
    });

    it("replaces false with !1", () => {
      const result = minify("var x = false;", { constantFold: false });
      expect(result).toContain("!1");
    });

    it("replaces undefined with void 0", () => {
      const result = minify("var x = undefined;", { constantFold: false });
      expect(result).toContain("void 0");
    });

    it("can be disabled", () => {
      const result = minify("var x = undefined;", {
        simplify: false,
        constantFold: false,
      });
      // Without simplification, undefined remains
      expect(result).toMatch(/\bundefined\b/);
    });
  });

  describe("name mangling", () => {
    it("renames local variables to short names", () => {
      const result = minify(
        "function test() { var longVariable = 1; return longVariable; }",
      );
      expect(result).not.toContain("longVariable");
    });

    it("does not rename top-level variables", () => {
      const result = minify("var topLevel = 42;");
      expect(result).toContain("topLevel");
    });

    it("preserves reserved names", () => {
      const result = minify("function f() { var myVar = 1; return myVar; }", {
        reserved: ["myVar"],
      });
      expect(result).toContain("myVar");
    });

    it("can be disabled", () => {
      const result = minify(
        "function test() { var longVariable = 1; return longVariable; }",
        { mangle: false },
      );
      expect(result).toContain("longVariable");
    });
  });

  describe("code compression", () => {
    it("compresses arrow bodies", () => {
      const result = minify("var f = () => { return 1; };");
      expect(result).toContain("=>1");
      expect(result).not.toContain("return");
    });

    it("can be disabled", () => {
      const result = minify("var f = () => { return 1; };", {
        compress: false,
      });
      expect(result).toContain("return");
    });
  });

  describe("full pipeline integration", () => {
    it("produces valid output for a complex function", () => {
      const code = `
        function greet(name) {
          // Build greeting
          var prefix = "Hello";
          var greeting = prefix + ", " + name;
          return greeting;
        }
      `;
      const result = minify(code);
      // Should be significantly shorter
      expect(result.length).toBeLessThan(code.length);
      expect(result).toContain("function");
    });

    it("handles multiple passes working together", () => {
      const code = `
        function calculate(x) {
          var base = 1 + 2;
          if (true) {
            var result = base * x;
            return result;
          } else {
            return 0;
          }
        }
      `;
      const result = minify(code);
      // DCE removes else branch
      // Constant folding: 1 + 2 -> 3
      // Mangling: renames locals
      expect(result).toContain("3");
      expect(result).not.toContain("else");
    });

    it("handles arrow functions with all optimizations", () => {
      const code = `
        var add = (first, second) => {
          var sum = first + second;
          return sum;
        };
      `;
      const result = minify(code);
      expect(result.length).toBeLessThan(code.length);
    });

    it("handles classes", () => {
      const code = `
        class MyClass {
          constructor(value) {
            this.value = value;
          }
          getValue() {
            return this.value;
          }
        }
      `;
      const result = minify(code);
      expect(result).toContain("class");
      expect(result).toContain("constructor");
    });

    it("handles exports", () => {
      const code = `
        export function helper(x) {
          var doubled = x * 2;
          return doubled;
        }
      `;
      const result = minify(code);
      expect(result).toContain("export");
      expect(result).toContain("helper"); // exported name preserved
    });

    it("handles imports", () => {
      const code = 'import { foo } from "bar";';
      const result = minify(code);
      expect(result).toContain("import");
      expect(result).toContain("foo");
    });

    it("produces syntactically valid code", () => {
      const code = `
        function calculate(x, y) {
          var sum = x + y;
          var product = x * y;
          if (sum > product) {
            return sum;
          } else {
            return product;
          }
        }
      `;
      const result = minify(code);
      // Should parse without error
      expect(() => new Function(result)).not.toThrow();
    });

    it("handles property mangling", () => {
      const code = `
        function f() {
          var obj = {};
          obj._internal = 1;
          obj._secret = 2;
          return obj._internal + obj._secret;
        }
      `;
      const result = minify(code, { mangleProperties: true });
      expect(result).not.toContain("_internal");
      expect(result).not.toContain("_secret");
    });
  });

  describe("options defaults", () => {
    it("enables all passes except mangleProperties by default", () => {
      const code = `
        function f() {
          var x = 1 + 2;
          var longName = true;
          if (longName) {
            return x;
          }
        }
      `;
      const result = minify(code);
      // constant folding: 1 + 2 -> 3
      expect(result).toContain("3");
      // mangling: longName renamed
      expect(result).not.toContain("longName");
    });
  });

  describe("source map generation", () => {
    it("returns { code, map } when sourceMap is true", () => {
      const result = minify("var x = 1 + 2;", { sourceMap: true });
      expect(result).toHaveProperty("code");
      expect(result).toHaveProperty("map");
      const r = result as MinifyResult;
      expect(r.map.version).toBe(3);
      expect(typeof r.map.mappings).toBe("string");
    });

    it("returns a string when sourceMap is false or omitted", () => {
      const result1 = minify("var x = 1;");
      expect(typeof result1).toBe("string");

      const result2 = minify("var x = 1;", { sourceMap: false });
      expect(typeof result2).toBe("string");
    });

    it("returns empty map for empty input with sourceMap", () => {
      const result = minify("", { sourceMap: true }) as MinifyResult;
      expect(result.code).toBe("");
      expect(result.map.version).toBe(3);
      expect(result.map.mappings).toBe("");
    });

    it("includes source content in the map when sourceMap is true", () => {
      const code = "var x = 1 + 2;";
      const result = minify(code, { sourceMap: true }) as MinifyResult;
      expect(result.map.sourcesContent).toContain(code);
    });

    it("uses sourceMapSource for the source file name", () => {
      const result = minify("var x = 1;", {
        sourceMap: true,
        sourceMapSource: "my-file.js",
      }) as MinifyResult;
      expect(result.map.sources).toContain("my-file.js");
    });

    it("defaults source name to input.js", () => {
      const result = minify("var x = 1;", {
        sourceMap: true,
      }) as MinifyResult;
      expect(result.map.sources).toContain("input.js");
    });

    it("produces a map with non-empty mappings for non-trivial code", () => {
      const code = `
        var x = 1 + 2;
        var y = 3 * 4;
      `;
      const result = minify(code, {
        sourceMap: true,
        mangle: false,
      }) as MinifyResult;
      expect(result.code.length).toBeGreaterThan(0);
      expect(result.map.mappings.length).toBeGreaterThan(0);
    });

    it("source map has valid structure with all required fields", () => {
      const result = minify("function f(a) { return a + 1; }", {
        sourceMap: true,
      }) as MinifyResult;
      expect(result.map).toHaveProperty("version", 3);
      expect(Array.isArray(result.map.sources)).toBe(true);
      expect(Array.isArray(result.map.sourcesContent)).toBe(true);
      expect(Array.isArray(result.map.names)).toBe(true);
      expect(typeof result.map.mappings).toBe("string");
    });
  });
});
