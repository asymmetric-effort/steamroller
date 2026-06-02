import { describe, it, expect } from "vitest";
import { minify } from "../../../src/minify/minifier.js";

describe("minify", () => {
  describe("comment removal", () => {
    it("removes single-line comments", () => {
      const code = "const x = 1; // this is a comment\nconst y = 2;";
      const result = minify(code);
      expect(result).not.toContain("// this is a comment");
      expect(result).toContain("const x = 1");
      expect(result).toContain("const y = 2");
    });

    it("removes multi-line comments", () => {
      const code =
        "const x = 1; /* this is\na multi-line\ncomment */ const y = 2;";
      const result = minify(code);
      expect(result).not.toContain("multi-line");
      expect(result).toContain("const x = 1");
      expect(result).toContain("const y = 2");
    });

    it("preserves legal comments (/*! ... */)", () => {
      const code =
        "/*! Copyright 2024 */\nconst x = 1;\n/* regular comment */\nconst y = 2;";
      const result = minify(code);
      expect(result).toContain("/*! Copyright 2024 */");
      expect(result).not.toContain("regular comment");
    });

    it("does not remove comments inside strings", () => {
      const code = 'const x = "// not a comment";';
      const result = minify(code);
      expect(result).toContain("// not a comment");
    });

    it("does not remove comment-like patterns inside template literals", () => {
      const code = "const x = `/* not a comment */`;";
      const result = minify(code);
      expect(result).toContain("/* not a comment */");
    });
  });

  describe("whitespace collapse", () => {
    it("collapses multiple spaces into one", () => {
      const code = "const    x   =   1;";
      const result = minify(code);
      expect(result).toBe("const x = 1;");
    });

    it("collapses newlines into spaces", () => {
      const code = "const x = 1;\n\n\nconst y = 2;";
      const result = minify(code);
      expect(result).toBe("const x = 1; const y = 2;");
    });

    it("collapses tabs and mixed whitespace", () => {
      const code = "const\t\t  x\n  =\t1;";
      const result = minify(code);
      expect(result).toBe("const x = 1;");
    });

    it("preserves whitespace inside strings", () => {
      const code = 'const x = "  hello   world  ";';
      const result = minify(code);
      expect(result).toContain("  hello   world  ");
    });

    it("trims leading and trailing whitespace", () => {
      const code = "  const x = 1;  ";
      const result = minify(code);
      expect(result).toBe("const x = 1;");
    });
  });

  describe("unnecessary semicolons", () => {
    it("removes semicolons before closing braces", () => {
      const code = "function f() { return 1; }";
      const result = minify(code);
      expect(result).toContain("return 1 }");
    });

    it("does not remove semicolons in other positions", () => {
      const code = "const x = 1; const y = 2;";
      const result = minify(code);
      expect(result).toContain("const x = 1;");
    });

    it("does not remove semicolons inside strings", () => {
      const code = 'const x = "a; }";';
      const result = minify(code);
      expect(result).toContain("a; }");
    });
  });

  describe("variable mangling", () => {
    it("renames local variables inside functions", () => {
      const code = "function test() { var longName = 1; return longName; }";
      const result = minify(code, { mangle: true });
      expect(result).not.toContain("longName");
      // The variable should have been renamed to a short name
      expect(result).toContain("return");
      expect(result).toContain("function");
    });

    it("renames let and const inside blocks", () => {
      const code =
        "function test() { let counter = 0; const value = 10; return counter + value; }";
      const result = minify(code, { mangle: true });
      expect(result).not.toContain("counter");
      expect(result).not.toContain("value");
    });

    it("does not rename reserved words", () => {
      const code =
        "function test() { var result = console.log(true); return result; }";
      const result = minify(code, { mangle: true });
      expect(result).toContain("console");
      expect(result).toContain("true");
      expect(result).toContain("return");
    });

    it("does not rename top-level variables", () => {
      const code = "const topLevel = 42;";
      const result = minify(code, { mangle: true });
      expect(result).toContain("topLevel");
    });

    it("generates sequential short names", () => {
      const code =
        "function test() { var alpha = 1; var beta = 2; var gamma = 3; return alpha + beta + gamma; }";
      const result = minify(code, { mangle: true });
      expect(result).not.toContain("alpha");
      expect(result).not.toContain("beta");
      expect(result).not.toContain("gamma");
    });
  });

  describe("unnecessary parentheses removal", () => {
    it("removes parens around simple return values", () => {
      const code = "function f() { return (x); }";
      const result = minify(code);
      expect(result).toContain("return x");
    });

    it("removes parens in typeof expressions", () => {
      const code = "typeof(x)";
      const result = minify(code);
      expect(result).toContain("typeof x");
    });

    it("removes double parentheses", () => {
      const code = "const x = ((a + b));";
      const result = minify(code);
      expect(result).toContain("(a + b)");
      expect(result).not.toContain("((a + b))");
    });
  });

  describe("syntactic validity", () => {
    it("produces syntactically valid code for a function", () => {
      const code = `
        // A function
        function greet(name) {
          /* Build greeting */
          const greeting = "Hello, " + name;
          return greeting;
        }
      `;
      const result = minify(code);
      // Should parse without throwing
      expect(() => new Function(result)).not.toThrow();
    });

    it("produces syntactically valid code with mangling", () => {
      const code = `
        function add(x, y) {
          var sum = x + y;
          return sum;
        }
      `;
      const result = minify(code, { mangle: true });
      expect(() => new Function(result)).not.toThrow();
    });

    it("produces syntactically valid code for arrow functions", () => {
      const code = `
        const add = (a, b) => {
          const result = a + b;
          return result;
        };
      `;
      const result = minify(code);
      expect(() => new Function(result)).not.toThrow();
    });

    it("handles empty input", () => {
      const result = minify("");
      expect(result).toBe("");
    });

    it("handles code with only comments", () => {
      const code = "// just a comment\n/* another one */";
      const result = minify(code);
      expect(result).toBe("");
    });

    it("handles code with escaped quotes in strings", () => {
      const code = 'const x = "hello \\"world\\"";';
      const result = minify(code);
      expect(result).toContain('\\"world\\"');
    });
  });

  describe("options", () => {
    it("respects removeComments: false", () => {
      const code = "const x = 1; // comment";
      const result = minify(code, { removeComments: false });
      expect(result).toContain("// comment");
    });

    it("respects collapseWhitespace: false", () => {
      const code = "const    x = 1;";
      const result = minify(code, { collapseWhitespace: false });
      expect(result).toContain("const    x = 1;");
    });

    it("respects removeUnnecessarySemicolons: false", () => {
      const code = "function f() { return 1; }";
      const result = minify(code, { removeUnnecessarySemicolons: false });
      expect(result).toContain("return 1; }");
    });

    it("applies all transformations together", () => {
      const code = `
        // Calculate sum
        function sum(a, b) {
          /* add them */
          var result = a + b;
          return (result);
        }
      `;
      const result = minify(code, { mangle: true });
      expect(result).not.toContain("// Calculate");
      expect(result).not.toContain("add them");
      expect(result).not.toContain("  ");
      expect(result).toContain("return");
    });
  });
});
