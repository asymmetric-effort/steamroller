/**
 * @module tests/unit/tree-shaking/treeshake-options
 * @description Unit tests for tree-shaking deoptimization, options normalization,
 * and experimental side effect logging.
 */

import { describe, it, expect } from "vitest";
import {
  detectEvalUsage,
  detectArgumentsUsage,
  deoptimizeScope,
} from "../../../src/tree-shaking/deoptimize.js";
import {
  normalizeTreeshakeOptions,
  normalizeModuleSideEffects,
  getPreset,
} from "../../../src/tree-shaking/options.js";
import {
  logFirstSideEffect,
  generateCodeFrame,
  positionFromOffset,
  FIRST_SIDE_EFFECT,
} from "../../../src/tree-shaking/log-side-effects.js";
import { Scope } from "../../../src/tree-shaking/scope.js";
import type { Program } from "../../../src/ast/types.js";

// ============================================================
// Test Helpers
// ============================================================

const createProgram = (body: ReadonlyArray<Record<string, unknown>>): Program =>
  ({
    type: "Program",
    body,
    sourceType: "module",
    start: 0,
    end: 100,
  }) as unknown as Program;

const id = (name: string): Record<string, unknown> => ({
  type: "Identifier",
  name,
  start: 0,
  end: name.length,
});

// ============================================================
// Issue #46: eval/arguments deoptimization
// ============================================================

describe("deoptimize", () => {
  describe("detectEvalUsage", () => {
    it("returns true when eval() is called directly", () => {
      const ast = createProgram([
        {
          type: "ExpressionStatement",
          expression: {
            type: "CallExpression",
            callee: id("eval"),
            arguments: [{ type: "Literal", value: "x + 1", start: 5, end: 12 }],
            start: 0,
            end: 13,
          },
          start: 0,
          end: 14,
        },
      ]);
      expect(detectEvalUsage(ast)).toBe(true);
    });

    it("returns false when eval is not called", () => {
      const ast = createProgram([
        {
          type: "ExpressionStatement",
          expression: {
            type: "CallExpression",
            callee: id("console"),
            arguments: [],
            start: 0,
            end: 10,
          },
          start: 0,
          end: 11,
        },
      ]);
      expect(detectEvalUsage(ast)).toBe(false);
    });

    it("returns false for an empty program", () => {
      const ast = createProgram([]);
      expect(detectEvalUsage(ast)).toBe(false);
    });

    it("detects eval in nested function body", () => {
      const ast = createProgram([
        {
          type: "FunctionDeclaration",
          id: id("foo"),
          params: [],
          body: {
            type: "BlockStatement",
            body: [
              {
                type: "ExpressionStatement",
                expression: {
                  type: "CallExpression",
                  callee: id("eval"),
                  arguments: [
                    { type: "Literal", value: "code", start: 30, end: 36 },
                  ],
                  start: 25,
                  end: 37,
                },
                start: 25,
                end: 38,
              },
            ],
            start: 15,
            end: 40,
          },
          start: 0,
          end: 40,
        },
      ]);
      expect(detectEvalUsage(ast)).toBe(true);
    });

    it("returns false when eval is used as an identifier but not called", () => {
      const ast = createProgram([
        {
          type: "ExpressionStatement",
          expression: id("eval"),
          start: 0,
          end: 4,
        },
      ]);
      expect(detectEvalUsage(ast)).toBe(false);
    });

    it("returns false when a different function is called with eval-like argument", () => {
      const ast = createProgram([
        {
          type: "ExpressionStatement",
          expression: {
            type: "CallExpression",
            callee: id("notEval"),
            arguments: [id("eval")],
            start: 0,
            end: 15,
          },
          start: 0,
          end: 16,
        },
      ]);
      expect(detectEvalUsage(ast)).toBe(false);
    });
  });

  describe("detectArgumentsUsage", () => {
    it("returns true when arguments is referenced in a non-arrow function", () => {
      const ast = createProgram([
        {
          type: "FunctionDeclaration",
          id: id("foo"),
          params: [],
          body: {
            type: "BlockStatement",
            body: [
              {
                type: "ExpressionStatement",
                expression: id("arguments"),
                start: 20,
                end: 29,
              },
            ],
            start: 15,
            end: 30,
          },
          start: 0,
          end: 30,
        },
      ]);
      expect(detectArgumentsUsage(ast)).toBe(true);
    });

    it("returns false when arguments is at module level", () => {
      const ast = createProgram([
        {
          type: "ExpressionStatement",
          expression: id("arguments"),
          start: 0,
          end: 9,
        },
      ]);
      expect(detectArgumentsUsage(ast)).toBe(false);
    });

    it("returns false for arrow function using arguments", () => {
      // Arrow functions don't have their own arguments, so references
      // to `arguments` inside an arrow at module level are not in a non-arrow function
      const ast = createProgram([
        {
          type: "ExpressionStatement",
          expression: {
            type: "ArrowFunctionExpression",
            params: [],
            body: {
              type: "BlockStatement",
              body: [
                {
                  type: "ExpressionStatement",
                  expression: id("arguments"),
                  start: 20,
                  end: 29,
                },
              ],
              start: 15,
              end: 30,
            },
            start: 5,
            end: 30,
          },
          start: 0,
          end: 31,
        },
      ]);
      expect(detectArgumentsUsage(ast)).toBe(false);
    });

    it("returns true for function expression using arguments", () => {
      const ast = createProgram([
        {
          type: "ExpressionStatement",
          expression: {
            type: "FunctionExpression",
            id: null,
            params: [],
            body: {
              type: "BlockStatement",
              body: [
                {
                  type: "ExpressionStatement",
                  expression: id("arguments"),
                  start: 20,
                  end: 29,
                },
              ],
              start: 15,
              end: 30,
            },
            start: 5,
            end: 30,
          },
          start: 0,
          end: 31,
        },
      ]);
      expect(detectArgumentsUsage(ast)).toBe(true);
    });

    it("returns false when arguments is not referenced anywhere", () => {
      const ast = createProgram([
        {
          type: "FunctionDeclaration",
          id: id("foo"),
          params: [id("a")],
          body: {
            type: "BlockStatement",
            body: [
              {
                type: "ExpressionStatement",
                expression: id("a"),
                start: 20,
                end: 21,
              },
            ],
            start: 15,
            end: 25,
          },
          start: 0,
          end: 25,
        },
      ]);
      expect(detectArgumentsUsage(ast)).toBe(false);
    });
  });

  describe("deoptimizeScope", () => {
    it("marks all bindings in scope and parent scopes for eval", () => {
      const parentScope = new Scope(null, false);
      parentScope.addBinding("x", "const", {
        type: "Identifier",
        start: 0,
        end: 1,
      } as unknown as import("../../../src/ast/types.js").BaseNode);
      parentScope.addBinding("y", "const", {
        type: "Identifier",
        start: 2,
        end: 3,
      } as unknown as import("../../../src/ast/types.js").BaseNode);

      const childScope = new Scope(parentScope, false);
      childScope.addBinding("z", "const", {
        type: "Identifier",
        start: 4,
        end: 5,
      } as unknown as import("../../../src/ast/types.js").BaseNode);

      expect(parentScope.bindings.get("x")!.isIncluded).toBe(false);
      expect(parentScope.bindings.get("y")!.isIncluded).toBe(false);
      expect(childScope.bindings.get("z")!.isIncluded).toBe(false);

      deoptimizeScope(childScope, "eval");

      expect(parentScope.bindings.get("x")!.isIncluded).toBe(true);
      expect(parentScope.bindings.get("y")!.isIncluded).toBe(true);
      expect(childScope.bindings.get("z")!.isIncluded).toBe(true);
    });

    it("marks only current scope bindings for arguments", () => {
      const parentScope = new Scope(null, false);
      parentScope.addBinding("x", "const", {
        type: "Identifier",
        start: 0,
        end: 1,
      } as unknown as import("../../../src/ast/types.js").BaseNode);

      const childScope = new Scope(parentScope, false);
      childScope.addBinding("a", "param", {
        type: "Identifier",
        start: 2,
        end: 3,
      } as unknown as import("../../../src/ast/types.js").BaseNode);
      childScope.addBinding("b", "param", {
        type: "Identifier",
        start: 4,
        end: 5,
      } as unknown as import("../../../src/ast/types.js").BaseNode);

      deoptimizeScope(childScope, "arguments");

      expect(parentScope.bindings.get("x")!.isIncluded).toBe(false);
      expect(childScope.bindings.get("a")!.isIncluded).toBe(true);
      expect(childScope.bindings.get("b")!.isIncluded).toBe(true);
    });

    it("handles scope with no bindings without error", () => {
      const scope = new Scope(null, false);
      expect(() => deoptimizeScope(scope, "eval")).not.toThrow();
      expect(() => deoptimizeScope(scope, "arguments")).not.toThrow();
    });

    it("handles deeply nested scope chain for eval", () => {
      const root = new Scope(null, false);
      root.addBinding("r", "const", {
        type: "Identifier",
        start: 0,
        end: 1,
      } as unknown as import("../../../src/ast/types.js").BaseNode);

      const mid = new Scope(root, false);
      mid.addBinding("m", "const", {
        type: "Identifier",
        start: 2,
        end: 3,
      } as unknown as import("../../../src/ast/types.js").BaseNode);

      const leaf = new Scope(mid, false);
      leaf.addBinding("l", "const", {
        type: "Identifier",
        start: 4,
        end: 5,
      } as unknown as import("../../../src/ast/types.js").BaseNode);

      deoptimizeScope(leaf, "eval");

      expect(root.bindings.get("r")!.isIncluded).toBe(true);
      expect(mid.bindings.get("m")!.isIncluded).toBe(true);
      expect(leaf.bindings.get("l")!.isIncluded).toBe(true);
    });
  });
});

// ============================================================
// Issue #50: Tree-shaking presets and options
// ============================================================

describe("options", () => {
  describe("getPreset", () => {
    it("returns smallest preset values", () => {
      const preset = getPreset("smallest");
      expect(preset.annotations).toBe(true);
      expect(preset.correctVarValueBeforeDeclaration).toBe(true);
      expect(preset.manualPureFunctions).toEqual([]);
      expect(preset.moduleSideEffects).toBe(false);
      expect(preset.propertyReadSideEffects).toBe(false);
      expect(preset.tryCatchDeoptimization).toBe(false);
      expect(preset.unknownGlobalSideEffects).toBe(false);
    });

    it("returns safest preset values", () => {
      const preset = getPreset("safest");
      expect(preset.annotations).toBe(true);
      expect(preset.correctVarValueBeforeDeclaration).toBe(true);
      expect(preset.moduleSideEffects).toBe(true);
      expect(preset.propertyReadSideEffects).toBe(true);
      expect(preset.tryCatchDeoptimization).toBe(true);
      expect(preset.unknownGlobalSideEffects).toBe(true);
    });

    it("returns recommended preset values", () => {
      const preset = getPreset("recommended");
      expect(preset.annotations).toBe(true);
      expect(preset.correctVarValueBeforeDeclaration).toBe(false);
      expect(preset.moduleSideEffects).toBe(true);
      expect(preset.propertyReadSideEffects).toBe(true);
      expect(preset.tryCatchDeoptimization).toBe(true);
      expect(preset.unknownGlobalSideEffects).toBe(false);
    });
  });

  describe("normalizeTreeshakeOptions", () => {
    it("returns false when input is false", () => {
      expect(normalizeTreeshakeOptions(false)).toBe(false);
    });

    it("uses recommended preset when input is true", () => {
      const result = normalizeTreeshakeOptions(true);
      expect(result).not.toBe(false);
      if (result === false) return;
      expect(result.annotations).toBe(true);
      expect(result.correctVarValueBeforeDeclaration).toBe(false);
      expect(result.tryCatchDeoptimization).toBe(true);
      expect(result.unknownGlobalSideEffects).toBe(false);
    });

    it("uses recommended preset when input is undefined", () => {
      const result = normalizeTreeshakeOptions(undefined);
      expect(result).not.toBe(false);
      if (result === false) return;
      expect(result.correctVarValueBeforeDeclaration).toBe(false);
      expect(result.unknownGlobalSideEffects).toBe(false);
    });

    it("normalizes smallest preset string", () => {
      const result = normalizeTreeshakeOptions("smallest");
      expect(result).not.toBe(false);
      if (result === false) return;
      expect(result.correctVarValueBeforeDeclaration).toBe(true);
      expect(result.propertyReadSideEffects).toBe(false);
      expect(result.tryCatchDeoptimization).toBe(false);
      expect(result.unknownGlobalSideEffects).toBe(false);
      expect(result.moduleSideEffects("any", false)).toBe(false);
    });

    it("normalizes safest preset string", () => {
      const result = normalizeTreeshakeOptions("safest");
      expect(result).not.toBe(false);
      if (result === false) return;
      expect(result.propertyReadSideEffects).toBe(true);
      expect(result.tryCatchDeoptimization).toBe(true);
      expect(result.unknownGlobalSideEffects).toBe(true);
      expect(result.moduleSideEffects("any", false)).toBe(true);
    });

    it("merges partial options over recommended preset", () => {
      const result = normalizeTreeshakeOptions({
        propertyReadSideEffects: "always",
        manualPureFunctions: ["myPure"],
      });
      expect(result).not.toBe(false);
      if (result === false) return;
      expect(result.propertyReadSideEffects).toBe("always");
      expect(result.manualPureFunctions).toEqual(["myPure"]);
      // Should inherit remaining from recommended
      expect(result.annotations).toBe(true);
      expect(result.correctVarValueBeforeDeclaration).toBe(false);
      expect(result.tryCatchDeoptimization).toBe(true);
    });

    it("merges partial options over specified preset", () => {
      const result = normalizeTreeshakeOptions({
        preset: "smallest",
        unknownGlobalSideEffects: true,
      });
      expect(result).not.toBe(false);
      if (result === false) return;
      expect(result.unknownGlobalSideEffects).toBe(true);
      // Other values from smallest
      expect(result.correctVarValueBeforeDeclaration).toBe(true);
      expect(result.propertyReadSideEffects).toBe(false);
      expect(result.tryCatchDeoptimization).toBe(false);
    });

    it("normalizes moduleSideEffects boolean correctly", () => {
      const result = normalizeTreeshakeOptions({ moduleSideEffects: false });
      expect(result).not.toBe(false);
      if (result === false) return;
      expect(result.moduleSideEffects("any-module", false)).toBe(false);
    });
  });

  describe("normalizeModuleSideEffects", () => {
    it("returns always-true for undefined", () => {
      const fn = normalizeModuleSideEffects(undefined);
      expect(fn("any", false)).toBe(true);
      expect(fn("any", true)).toBe(true);
    });

    it("returns always-true for true", () => {
      const fn = normalizeModuleSideEffects(true);
      expect(fn("any", true)).toBe(true);
    });

    it("returns always-false for false", () => {
      const fn = normalizeModuleSideEffects(false);
      expect(fn("any", false)).toBe(false);
    });

    it("returns !external for no-external", () => {
      const fn = normalizeModuleSideEffects("no-external");
      expect(fn("mod", false)).toBe(true);
      expect(fn("mod", true)).toBe(false);
    });

    it("returns set-based lookup for array", () => {
      const fn = normalizeModuleSideEffects(["a", "b"]);
      expect(fn("a", false)).toBe(true);
      expect(fn("b", false)).toBe(true);
      expect(fn("c", false)).toBe(false);
    });

    it("passes through a function directly", () => {
      const custom = (id: string) => id.startsWith("keep");
      const fn = normalizeModuleSideEffects(custom);
      expect(fn("keep-me", false)).toBe(true);
      expect(fn("remove-me", false)).toBe(false);
    });
  });
});

// ============================================================
// Issue #53: experimentalLogSideEffects
// ============================================================

describe("log-side-effects", () => {
  describe("FIRST_SIDE_EFFECT", () => {
    it("has the correct error code value", () => {
      expect(FIRST_SIDE_EFFECT).toBe("FIRST_SIDE_EFFECT");
    });
  });

  describe("positionFromOffset", () => {
    it("computes line 1 column 0 for offset 0", () => {
      const result = positionFromOffset("hello\nworld", 0);
      expect(result.line).toBe(1);
      expect(result.column).toBe(0);
    });

    it("computes correct position mid-first-line", () => {
      const result = positionFromOffset("hello\nworld", 3);
      expect(result.line).toBe(1);
      expect(result.column).toBe(3);
    });

    it("computes correct position on second line", () => {
      const result = positionFromOffset("hello\nworld", 7);
      expect(result.line).toBe(2);
      expect(result.column).toBe(1);
    });

    it("computes correct position on third line", () => {
      const result = positionFromOffset("a\nb\nc", 4);
      expect(result.line).toBe(3);
      expect(result.column).toBe(0);
    });
  });

  describe("generateCodeFrame", () => {
    it("generates a frame with caret at correct position", () => {
      const source = "const x = 1;\nconsole.log(x);\nconst y = 2;";
      const frame = generateCodeFrame(source, 2, 0);
      expect(frame).toContain("> 2 |");
      expect(frame).toContain("console.log(x);");
      expect(frame).toContain("^");
    });

    it("shows context lines around the target", () => {
      const source = "line1\nline2\nline3\nline4\nline5";
      const frame = generateCodeFrame(source, 3, 0);
      expect(frame).toContain("line1");
      expect(frame).toContain("line2");
      expect(frame).toContain("line3");
      expect(frame).toContain("line4");
    });

    it("handles first line correctly", () => {
      const source = "first\nsecond\nthird";
      const frame = generateCodeFrame(source, 1, 2);
      expect(frame).toContain("> 1 |");
      expect(frame).toContain("first");
      expect(frame).toContain("^");
    });
  });

  describe("logFirstSideEffect", () => {
    it("returns null when sideEffectNodes is empty", () => {
      const result = logFirstSideEffect("module.js", [], "const x = 1;");
      expect(result).toBeNull();
    });

    it("returns a log entry with correct structure for first node", () => {
      const source = "const x = 1;\nconsole.log(x);";
      const nodes = [
        { type: "ExpressionStatement", start: 13, end: 28 },
      ] as unknown as ReadonlyArray<
        import("../../../src/ast/types.js").BaseNode
      >;

      const result = logFirstSideEffect("test.js", nodes, source);

      expect(result).not.toBeNull();
      expect(result!.code).toBe(FIRST_SIDE_EFFECT);
      expect(result!.id).toBe("test.js");
      expect(result!.pos).toBe(13);
      expect(result!.loc.file).toBe("test.js");
      expect(result!.loc.line).toBe(2);
      expect(result!.loc.column).toBe(0);
      expect(result!.frame).toContain("console.log(x);");
      expect(result!.message).toContain("test.js");
      expect(result!.message).toContain("line 2");
    });

    it("only logs the first side effect even with multiple nodes", () => {
      const source = "a();\nb();\nc();";
      const nodes = [
        { type: "ExpressionStatement", start: 0, end: 3 },
        { type: "ExpressionStatement", start: 5, end: 8 },
        { type: "ExpressionStatement", start: 10, end: 13 },
      ] as unknown as ReadonlyArray<
        import("../../../src/ast/types.js").BaseNode
      >;

      const result = logFirstSideEffect("multi.js", nodes, source);

      expect(result).not.toBeNull();
      expect(result!.pos).toBe(0);
      expect(result!.loc.line).toBe(1);
    });

    it("includes module ID in the message", () => {
      const source = "sideEffect();";
      const nodes = [
        { type: "ExpressionStatement", start: 0, end: 13 },
      ] as unknown as ReadonlyArray<
        import("../../../src/ast/types.js").BaseNode
      >;

      const result = logFirstSideEffect("/path/to/module.js", nodes, source);
      expect(result!.message).toContain("/path/to/module.js");
    });
  });
});
