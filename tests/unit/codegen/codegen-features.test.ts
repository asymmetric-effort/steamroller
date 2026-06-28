import { describe, it, expect } from "bun:test";
import {
  normalizeGeneratedCode,
  getVarKeyword,
  wrapFunction,
} from "../../../src/codegen/generated-code";
import type { GeneratedCodeOptions } from "../../../src/codegen/generated-code";
import {
  deconflictChunk,
  generateUniqueName,
} from "../../../src/codegen/deconflict";

describe("generatedCode presets", () => {
  describe("normalizeGeneratedCode", () => {
    it("returns ES5 preset when no input provided", () => {
      const result = normalizeGeneratedCode();
      expect(result).toEqual({
        arrowFunctions: false,
        constBindings: false,
        objectShorthand: false,
        reservedNamesAsProps: true,
        symbols: false,
      });
    });

    it('returns ES5 preset when "es5" string provided', () => {
      const result = normalizeGeneratedCode("es5");
      expect(result).toEqual({
        arrowFunctions: false,
        constBindings: false,
        objectShorthand: false,
        reservedNamesAsProps: true,
        symbols: false,
      });
    });

    it('returns ES2015 preset when "es2015" string provided', () => {
      const result = normalizeGeneratedCode("es2015");
      expect(result).toEqual({
        arrowFunctions: true,
        constBindings: true,
        objectShorthand: true,
        reservedNamesAsProps: true,
        symbols: true,
      });
    });

    it("merges partial overrides with ES5 defaults", () => {
      const result = normalizeGeneratedCode({ arrowFunctions: true });
      expect(result).toEqual({
        arrowFunctions: true,
        constBindings: false,
        objectShorthand: false,
        reservedNamesAsProps: true,
        symbols: false,
      });
    });

    it("merges multiple partial overrides", () => {
      const result = normalizeGeneratedCode({
        constBindings: true,
        symbols: true,
      });
      expect(result).toEqual({
        arrowFunctions: false,
        constBindings: true,
        objectShorthand: false,
        reservedNamesAsProps: true,
        symbols: true,
      });
    });

    it("allows overriding reservedNamesAsProps to false", () => {
      const result = normalizeGeneratedCode({ reservedNamesAsProps: false });
      expect(result.reservedNamesAsProps).toBe(false);
    });

    it("returns undefined input as ES5", () => {
      const result = normalizeGeneratedCode(undefined);
      expect(result.arrowFunctions).toBe(false);
      expect(result.constBindings).toBe(false);
    });
  });

  describe("getVarKeyword", () => {
    it('returns "const" when constBindings is true', () => {
      const options: GeneratedCodeOptions = {
        arrowFunctions: true,
        constBindings: true,
        objectShorthand: true,
        reservedNamesAsProps: true,
        symbols: true,
      };
      expect(getVarKeyword(options)).toBe("const");
    });

    it('returns "var" when constBindings is false', () => {
      const options: GeneratedCodeOptions = {
        arrowFunctions: false,
        constBindings: false,
        objectShorthand: false,
        reservedNamesAsProps: true,
        symbols: false,
      };
      expect(getVarKeyword(options)).toBe("var");
    });
  });

  describe("wrapFunction", () => {
    it("generates arrow function when arrowFunctions is true", () => {
      const options: GeneratedCodeOptions = {
        arrowFunctions: true,
        constBindings: true,
        objectShorthand: true,
        reservedNamesAsProps: true,
        symbols: true,
      };
      const result = wrapFunction("x, y", "x + y", options);
      expect(result).toBe("(x, y) => x + y");
    });

    it("generates traditional function when arrowFunctions is false", () => {
      const options: GeneratedCodeOptions = {
        arrowFunctions: false,
        constBindings: false,
        objectShorthand: false,
        reservedNamesAsProps: true,
        symbols: false,
      };
      const result = wrapFunction("x, y", "return x + y;", options);
      expect(result).toBe("function(x, y) { return x + y; }");
    });

    it("handles empty params", () => {
      const options: GeneratedCodeOptions = {
        arrowFunctions: true,
        constBindings: true,
        objectShorthand: true,
        reservedNamesAsProps: true,
        symbols: true,
      };
      const result = wrapFunction("", "42", options);
      expect(result).toBe("() => 42");
    });
  });
});

describe("variable name deconfliction", () => {
  describe("deconflictChunk", () => {
    it("does not rename when there are no collisions", () => {
      const result = deconflictChunk(
        [
          { moduleId: "mod1", names: ["foo"] },
          { moduleId: "mod2", names: ["bar"] },
        ],
        "es",
      );
      expect(result.renames.size).toBe(0);
      expect(result.allNames.has("foo")).toBe(true);
      expect(result.allNames.has("bar")).toBe(true);
    });

    it("renames when two modules have the same variable name", () => {
      const result = deconflictChunk(
        [
          { moduleId: "mod1", names: ["helper"] },
          { moduleId: "mod2", names: ["helper"] },
        ],
        "es",
      );
      // Both should be renamed since count > 1
      expect(result.renames.size).toBe(2);
      const mod1Renames = result.renames.get("mod1");
      const mod2Renames = result.renames.get("mod2");
      expect(mod1Renames?.get("helper")).toBe("helper$1");
      expect(mod2Renames?.get("helper")).toBe("helper$2");
    });

    it("renames variables that conflict with reserved words", () => {
      const result = deconflictChunk(
        [{ moduleId: "mod1", names: ["class", "myVar"] }],
        "es",
      );
      const mod1Renames = result.renames.get("mod1");
      expect(mod1Renames?.get("class")).toBe("class$1");
      // myVar should not be renamed (no collision)
      expect(mod1Renames?.has("myVar")).toBe(false);
    });

    it("avoids format-specific globals for cjs", () => {
      const result = deconflictChunk(
        [{ moduleId: "mod1", names: ["exports", "safeVar"] }],
        "cjs",
      );
      const mod1Renames = result.renames.get("mod1");
      expect(mod1Renames?.get("exports")).toBe("exports$1");
      expect(mod1Renames?.has("safeVar")).toBe(false);
    });

    it("avoids format-specific globals for amd", () => {
      const result = deconflictChunk(
        [{ moduleId: "mod1", names: ["define"] }],
        "amd",
      );
      const mod1Renames = result.renames.get("mod1");
      expect(mod1Renames?.get("define")).toBe("define$1");
    });

    it("avoids format-specific globals for umd", () => {
      const result = deconflictChunk(
        [{ moduleId: "mod1", names: ["module"] }],
        "umd",
      );
      const mod1Renames = result.renames.get("mod1");
      expect(mod1Renames?.get("module")).toBe("module$1");
    });

    it("handles unknown format gracefully", () => {
      const result = deconflictChunk(
        [{ moduleId: "mod1", names: ["safeVar"] }],
        "unknown-format",
      );
      expect(result.renames.size).toBe(0);
    });

    it("avoids global names like undefined and console", () => {
      const result = deconflictChunk(
        [{ moduleId: "mod1", names: ["undefined", "console"] }],
        "es",
      );
      const mod1Renames = result.renames.get("mod1");
      expect(mod1Renames?.get("undefined")).toBe("undefined$1");
      expect(mod1Renames?.get("console")).toBe("console$1");
    });

    it("handles multiple collisions with incrementing suffixes", () => {
      const result = deconflictChunk(
        [
          { moduleId: "mod1", names: ["x"] },
          { moduleId: "mod2", names: ["x"] },
          { moduleId: "mod3", names: ["x"] },
        ],
        "es",
      );
      const mod1 = result.renames.get("mod1");
      const mod2 = result.renames.get("mod2");
      const mod3 = result.renames.get("mod3");
      expect(mod1?.get("x")).toBe("x$1");
      expect(mod2?.get("x")).toBe("x$2");
      expect(mod3?.get("x")).toBe("x$3");
    });

    it("handles empty module bindings", () => {
      const result = deconflictChunk([], "es");
      expect(result.renames.size).toBe(0);
    });
  });

  describe("generateUniqueName", () => {
    it("appends $1 when base is not in used names", () => {
      const used = new Set(["foo", "bar"]);
      expect(generateUniqueName("baz", used)).toBe("baz$1");
    });

    it("increments suffix until unique", () => {
      const used = new Set(["foo", "foo$1", "foo$2"]);
      expect(generateUniqueName("foo", used)).toBe("foo$3");
    });

    it("handles large number of conflicts", () => {
      const used = new Set<string>();
      for (let i = 1; i <= 100; i++) {
        used.add(`x$${i}`);
      }
      expect(generateUniqueName("x", used)).toBe("x$101");
    });

    it("works with empty used set", () => {
      const used = new Set<string>();
      expect(generateUniqueName("name", used)).toBe("name$1");
    });
  });
});
