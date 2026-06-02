/**
 * Tests for src/transforms/downlevel.ts
 *
 * Verifies regex-based syntax downleveling for ES5 and ES2015 targets.
 */
import { describe, it, expect } from "vitest";
import { downlevelCode } from "../../../src/transforms/downlevel.js";

describe("downlevelCode", () => {
  describe("es5 target", () => {
    describe("arrow functions -> regular functions", () => {
      it("should convert parenthesized block-body arrow to function", () => {
        const input = "const fn = (a, b) => { return a + b; };";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("function(a, b)");
        expect(result).not.toContain("=>");
      });

      it("should convert parenthesized expression-body arrow to function", () => {
        const input = "const fn = (x) => x * 2";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("function(x)");
        expect(result).toContain("return x * 2");
        expect(result).not.toContain("=>");
      });

      it("should convert no-args arrow to function", () => {
        const input = "const fn = () => { console.log('hi'); };";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("function()");
        expect(result).not.toContain("=>");
      });

      it("should convert single-param unparenthesized arrow to function", () => {
        const input = "const fn = x => x + 1";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("function(x)");
        expect(result).toContain("return x + 1");
        expect(result).not.toContain("=>");
      });
    });

    describe("template literals -> string concatenation", () => {
      it("should convert simple template literal to string", () => {
        const input = "const s = `hello world`;";
        const result = downlevelCode(input, "es5");
        expect(result).toContain('"hello world"');
        expect(result).not.toContain("`");
      });

      it("should convert template literal with expression to concatenation", () => {
        const input = "const s = `hello ${name}`;";
        const result = downlevelCode(input, "es5");
        expect(result).toContain('"hello "');
        expect(result).toContain("+ name");
        expect(result).not.toContain("`");
        expect(result).not.toContain("${");
      });

      it("should convert template literal with multiple expressions", () => {
        const input = "const s = `${a} and ${b}`;";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("a");
        expect(result).toContain("b");
        expect(result).toContain('" and "');
        expect(result).not.toContain("`");
      });
    });

    describe("const/let -> var", () => {
      it("should convert const to var", () => {
        const input = "const x = 1;";
        const result = downlevelCode(input, "es5");
        expect(result).toBe("var x = 1;");
      });

      it("should convert let to var", () => {
        const input = "let y = 2;";
        const result = downlevelCode(input, "es5");
        expect(result).toBe("var y = 2;");
      });

      it("should convert both const and let in same code", () => {
        const input = "const a = 1;\nlet b = 2;";
        const result = downlevelCode(input, "es5");
        expect(result).toBe("var a = 1;\nvar b = 2;");
      });
    });

    describe("default parameters -> || fallbacks", () => {
      it("should convert default parameter to || pattern", () => {
        const input = "function greet(name = 'world') { return name; }";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("function greet(name)");
        expect(result).toContain("name = name || 'world'");
      });
    });
  });

  describe("es2015 target", () => {
    describe("optional chaining -> && chains", () => {
      it("should convert simple optional chaining", () => {
        const input = "const x = a?.b;";
        const result = downlevelCode(input, "es2015");
        expect(result).toContain("a && a.b");
        expect(result).not.toContain("?.");
      });

      it("should convert nested optional chaining", () => {
        const input = "const x = a?.b?.c;";
        const result = downlevelCode(input, "es2015");
        expect(result).not.toContain("?.");
        // Should produce a chain of && checks
        expect(result).toContain("&&");
      });
    });

    describe("nullish coalescing -> ternary", () => {
      it("should convert ?? to ternary null/void 0 check", () => {
        const input = "const x = a ?? b;";
        const result = downlevelCode(input, "es2015");
        expect(result).toContain("a !== null");
        expect(result).toContain("a !== void 0");
        expect(result).toContain("? a : b");
        expect(result).not.toContain("??");
      });

      it("should convert ?? with property access on left side", () => {
        const input = "const x = obj.value ?? fallback;";
        const result = downlevelCode(input, "es2015");
        expect(result).toContain("obj.value !== null");
        expect(result).toContain("obj.value !== void 0");
        expect(result).toContain("? obj.value : fallback");
      });
    });

    it("should NOT convert arrow functions for es2015 target", () => {
      const input = "const fn = (x) => x * 2;";
      const result = downlevelCode(input, "es2015");
      expect(result).toContain("=>");
    });

    it("should NOT convert const/let for es2015 target", () => {
      const input = "const x = 1;\nlet y = 2;";
      const result = downlevelCode(input, "es2015");
      expect(result).toContain("const");
      expect(result).toContain("let");
    });

    it("should NOT convert template literals for es2015 target", () => {
      const input = "const s = `hello ${name}`;";
      const result = downlevelCode(input, "es2015");
      expect(result).toContain("`");
    });
  });

  describe("esnext target", () => {
    it("should not transform anything for esnext", () => {
      const input = "const fn = (x) => x?.y ?? z;";
      const result = downlevelCode(input, "esnext");
      expect(result).toBe(input);
    });
  });

  describe("es5 includes es2015 transforms", () => {
    it("should convert nullish coalescing when targeting es5", () => {
      const input = "const x = a ?? b;";
      const result = downlevelCode(input, "es5");
      expect(result).not.toContain("??");
      expect(result).toContain("!== null");
    });

    it("should convert optional chaining when targeting es5", () => {
      const input = "const x = a?.b;";
      const result = downlevelCode(input, "es5");
      expect(result).not.toContain("?.");
      expect(result).toContain("&&");
    });
  });
});
