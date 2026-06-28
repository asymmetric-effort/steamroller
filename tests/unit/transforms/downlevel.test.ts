/**
 * Tests for src/transforms/downlevel.ts
 *
 * Verifies AST-based syntax downleveling for ES5 and ES2015 targets.
 */
import { describe, it, expect } from "bun:test";
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

      it("should NOT transform arrow functions inside strings", () => {
        const input = 'const s = "() => foo";';
        const result = downlevelCode(input, "es5");
        expect(result).toContain('"() => foo"');
        expect(result).not.toContain("function");
      });

      it("should capture this in arrow functions that reference this", () => {
        const input = "const fn = () => { return this.x; };";
        const result = downlevelCode(input, "es5");
        expect(result).not.toContain("=>");
        expect(result).toContain("_this");
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
        expect(result).toContain("name");
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

      it("should handle template literals with nested expressions", () => {
        const input = "const s = `result: ${a + b}`;";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("a + b");
        expect(result).not.toContain("`");
        expect(result).not.toContain("${");
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

    describe("default parameters -> void 0 checks", () => {
      it("should convert default parameter to void 0 check", () => {
        const input = "function greet(name = 'world') { return name; }";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("function greet(name)");
        expect(result).toContain("if (name === void 0) name = 'world'");
      });

      it("should handle default params with complex expressions containing , and )", () => {
        const input = "function calc(a, b = Math.max(1, 2)) { return a + b; }";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("function calc(a, b)");
        expect(result).toContain("if (b === void 0) b = Math.max(1, 2)");
        expect(result).not.toContain("= Math.max(1, 2))");
      });
    });

    describe("rest parameters -> arguments slicing", () => {
      it("should convert rest parameters to arguments slicing", () => {
        const input = "function f(...args) { return args; }";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("[].slice.call(arguments)");
        expect(result).not.toContain("...");
      });

      it("should handle rest parameters with other params before", () => {
        const input =
          "function f(a, b, ...rest) { return [a, b].concat(rest); }";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("function f(a, b)");
        expect(result).toContain("[].slice.call(arguments, 2)");
        expect(result).not.toContain("...");
      });
    });

    describe("shorthand properties -> explicit key-value", () => {
      it("should convert shorthand properties to explicit key-value", () => {
        const input = "const obj = {x, y};";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("x: x");
        expect(result).toContain("y: y");
      });
    });

    describe("spread in arrays -> concat", () => {
      it("should convert spread in arrays to concat", () => {
        const input = "const arr = [...a, ...b];";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("[].concat(a, b)");
        expect(result).not.toContain("...");
      });
    });

    describe("spread in calls -> apply", () => {
      it("should convert spread in function calls to apply", () => {
        const input = "f(...args);";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("f.apply(void 0, args)");
        expect(result).not.toContain("...");
      });

      it("should handle spread in new expressions", () => {
        const input = "new Foo(...args);";
        const result = downlevelCode(input, "es5");
        expect(result).toContain("Function.prototype.bind.apply");
        expect(result).not.toContain("...");
      });
    });
  });

  describe("es2015 target", () => {
    describe("optional chaining -> null checks", () => {
      it("should convert simple optional chaining", () => {
        const input = "const x = a?.b;";
        const result = downlevelCode(input, "es2015");
        expect(result).toContain("=== null");
        expect(result).toContain("=== void 0");
        expect(result).toContain("void 0");
        expect(result).toContain("a.b");
        expect(result).not.toContain("?.");
      });

      it("should convert nested optional chaining", () => {
        const input = "const x = a?.b?.c;";
        const result = downlevelCode(input, "es2015");
        expect(result).not.toContain("?.");
        expect(result).toContain("=== null");
        expect(result).toContain("=== void 0");
      });

      it("should handle optional chaining on computed properties", () => {
        const input = "const x = a?.[b];";
        const result = downlevelCode(input, "es2015");
        expect(result).not.toContain("?.");
        expect(result).toContain("[b]");
        expect(result).toContain("=== null");
      });

      it("should handle optional method calls", () => {
        const input = "const x = a?.b();";
        const result = downlevelCode(input, "es2015");
        expect(result).not.toContain("?.");
        expect(result).toContain("=== null");
        expect(result).toContain(".b()");
      });

      it("should handle chained optional: a?.b?.c?.d", () => {
        const input = "const x = a?.b?.c?.d;";
        const result = downlevelCode(input, "es2015");
        expect(result).not.toContain("?.");
        expect(result).toContain("=== null");
        expect(result).toContain("=== void 0");
      });
    });

    describe("nullish coalescing -> ternary", () => {
      it("should convert ?? to ternary null/void 0 check with temp var", () => {
        const input = "const x = a ?? b;";
        const result = downlevelCode(input, "es2015");
        expect(result).toContain("!== null");
        expect(result).toContain("!== void 0");
        expect(result).not.toContain("??");
        // Uses temp var pattern
        expect(result).toContain("_tmp");
      });

      it("should convert ?? with property access on left side", () => {
        const input = "const x = obj.value ?? fallback;";
        const result = downlevelCode(input, "es2015");
        expect(result).toContain("!== null");
        expect(result).toContain("!== void 0");
        expect(result).not.toContain("??");
      });

      it("should avoid double eval with complex left side", () => {
        const input = "const x = getVal() ?? fallback;";
        const result = downlevelCode(input, "es2015");
        expect(result).not.toContain("??");
        // Should use temp var to avoid calling getVal() twice
        expect(result).toContain("_tmp");
        expect(result).toContain("!== null");
      });
    });

    describe("logical assignment", () => {
      it("should convert ??= to null/void 0 check with assignment", () => {
        const input = "a ??= b;";
        const result = downlevelCode(input, "es2015");
        expect(result).not.toContain("??=");
        expect(result).toContain("!== null");
        expect(result).toContain("a = b");
      });

      it("should convert ||= to logical or with assignment", () => {
        const input = "a ||= b;";
        const result = downlevelCode(input, "es2015");
        expect(result).not.toContain("||=");
        expect(result).toContain("||");
        expect(result).toContain("a = b");
      });

      it("should convert &&= to logical and with assignment", () => {
        const input = "a &&= b;";
        const result = downlevelCode(input, "es2015");
        expect(result).not.toContain("&&=");
        expect(result).toContain("&&");
        expect(result).toContain("a = b");
      });
    });

    describe("numeric separators", () => {
      it("should remove numeric separators", () => {
        const input = "const x = 1_000_000;";
        const result = downlevelCode(input, "es2015");
        expect(result).toContain("1000000");
        expect(result).not.toContain("_");
      });

      it("should handle numeric separators in different positions", () => {
        const input = "const x = 0xFF_FF;";
        const result = downlevelCode(input, "es2015");
        expect(result).not.toContain("_");
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
      expect(result).toContain("=== null");
    });
  });
});
