/**
 * @module tests/unit/tree-shaking/pure
 * @description Unit tests for pure annotation collection and manual pure function matching.
 */

import { describe, it, expect } from "bun:test";
import {
  collectPureAnnotations,
  isPureCall,
  matchesManualPureFunction,
  expressionToString,
  collectNoSideEffectsFunctions,
} from "../../../src/tree-shaking/pure.js";
import type * as AST from "../../../src/ast/types.js";

/** Helper to create a minimal Program AST node. */
const makeProgram = (
  body: ReadonlyArray<AST.Statement | AST.ModuleDeclaration> = [],
): AST.Program => ({
  type: "Program",
  body,
  sourceType: "module",
  start: 0,
  end: 0,
});

/** Helper to create an Identifier node. */
const makeIdentifier = (name: string): AST.Identifier => ({
  type: "Identifier",
  name,
  start: 0,
  end: 0,
});

/** Helper to create a MemberExpression node. */
const makeMemberExpression = (
  object: AST.Expression,
  property: AST.Identifier,
  computed = false,
): AST.MemberExpression => ({
  type: "MemberExpression",
  object,
  property,
  computed,
  optional: false,
  start: 0,
  end: 0,
});

describe("tree-shaking/pure", () => {
  // ==========================================================
  // collectPureAnnotations
  // ==========================================================

  describe("collectPureAnnotations", () => {
    it("finds @__PURE__ before a call expression", () => {
      const source = "const x = /*@__PURE__*/ foo();";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      // The annotation should point to the 'f' in 'foo()'
      const expectedPos = source.indexOf("foo()");
      expect(annotations.has(expectedPos)).toBe(true);
      expect(annotations.size).toBe(1);
    });

    it("finds #__PURE__ variant", () => {
      const source = "const x = /*#__PURE__*/ bar();";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      const expectedPos = source.indexOf("bar()");
      expect(annotations.has(expectedPos)).toBe(true);
      expect(annotations.size).toBe(1);
    });

    it("finds @__NO_SIDE_EFFECTS__ annotation", () => {
      const source = "/*@__NO_SIDE_EFFECTS__*/ function pure() {}";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      const expectedPos = source.indexOf("function");
      expect(annotations.has(expectedPos)).toBe(true);
      expect(annotations.size).toBe(1);
    });

    it("handles whitespace between annotation and expression", () => {
      const source = "const x = /*@__PURE__*/   \n  foo();";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      const expectedPos = source.indexOf("foo()");
      expect(annotations.has(expectedPos)).toBe(true);
      expect(annotations.size).toBe(1);
    });

    it("handles tabs between annotation and expression", () => {
      const source = "const x = /*@__PURE__*/\t\tfoo();";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      const expectedPos = source.indexOf("foo()");
      expect(annotations.has(expectedPos)).toBe(true);
    });

    it("collects multiple annotations in one file", () => {
      const source =
        "const a = /*@__PURE__*/ foo(); const b = /*#__PURE__*/ bar();";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      expect(annotations.size).toBe(2);
      expect(annotations.has(source.indexOf("foo()"))).toBe(true);
      expect(annotations.has(source.indexOf("bar()"))).toBe(true);
    });

    it("ignores non-pure block comments", () => {
      const source = "/* regular comment */ foo(); /*@__PURE__*/ bar();";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      expect(annotations.size).toBe(1);
      expect(annotations.has(source.indexOf("bar()"))).toBe(true);
    });

    it("ignores comments with extra text around annotation", () => {
      const source = "/* maybe @__PURE__ not sure */ foo();";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      expect(annotations.size).toBe(0);
    });

    it("returns empty set for source with no annotations", () => {
      const source = "const x = foo(); const y = bar();";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      expect(annotations.size).toBe(0);
    });

    it("handles annotation at end of source with no following expression", () => {
      const source = "const x = 1; /*@__PURE__*/";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      // No position added since there is nothing after the comment
      expect(annotations.size).toBe(0);
    });

    it("handles annotation with whitespace-only content trimmed to match", () => {
      const source = "const x = /* @__PURE__ */ foo();";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      const expectedPos = source.indexOf("foo()");
      expect(annotations.has(expectedPos)).toBe(true);
    });

    it("handles unclosed block comment gracefully", () => {
      const source = "const x = /*@__PURE__ foo();";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      expect(annotations.size).toBe(0);
    });

    it("handles empty source string", () => {
      const source = "";
      const program = makeProgram();
      const annotations = collectPureAnnotations(source, program);

      expect(annotations.size).toBe(0);
    });
  });

  // ==========================================================
  // isPureCall
  // ==========================================================

  describe("isPureCall", () => {
    it("returns true for annotated position", () => {
      const annotations = new Set([10, 25, 42]);
      expect(isPureCall(10, annotations)).toBe(true);
      expect(isPureCall(25, annotations)).toBe(true);
      expect(isPureCall(42, annotations)).toBe(true);
    });

    it("returns false for non-annotated position", () => {
      const annotations = new Set([10, 25, 42]);
      expect(isPureCall(0, annotations)).toBe(false);
      expect(isPureCall(11, annotations)).toBe(false);
      expect(isPureCall(100, annotations)).toBe(false);
    });

    it("returns false for empty annotation set", () => {
      const annotations = new Set<number>();
      expect(isPureCall(0, annotations)).toBe(false);
      expect(isPureCall(42, annotations)).toBe(false);
    });
  });

  // ==========================================================
  // expressionToString
  // ==========================================================

  describe("expressionToString", () => {
    it("converts Identifier to name string", () => {
      const expr = makeIdentifier("foo");
      expect(expressionToString(expr)).toBe("foo");
    });

    it("converts simple MemberExpression to dotted string", () => {
      const expr = makeMemberExpression(
        makeIdentifier("Object"),
        makeIdentifier("freeze"),
      );
      expect(expressionToString(expr)).toBe("Object.freeze");
    });

    it("converts deeply nested MemberExpression chain", () => {
      const expr = makeMemberExpression(
        makeMemberExpression(makeIdentifier("a"), makeIdentifier("b")),
        makeIdentifier("c"),
      );
      expect(expressionToString(expr)).toBe("a.b.c");
    });

    it("returns null for computed MemberExpression", () => {
      const expr = makeMemberExpression(
        makeIdentifier("arr"),
        makeIdentifier("0"),
        true,
      );
      expect(expressionToString(expr)).toBe(null);
    });

    it("returns null for computed property in chain", () => {
      const expr = makeMemberExpression(
        makeMemberExpression(
          makeIdentifier("a"),
          makeIdentifier("b"),
          true, // computed
        ),
        makeIdentifier("c"),
      );
      expect(expressionToString(expr)).toBe(null);
    });

    it("returns null for non-Identifier, non-MemberExpression", () => {
      const expr: AST.Literal = {
        type: "Literal",
        value: 42,
        start: 0,
        end: 0,
      };
      expect(expressionToString(expr)).toBe(null);
    });

    it("returns null when object in chain is not Identifier", () => {
      const callExpr: AST.CallExpression = {
        type: "CallExpression",
        callee: makeIdentifier("getObj"),
        arguments: [],
        optional: false,
        start: 0,
        end: 0,
      };
      const expr: AST.MemberExpression = {
        type: "MemberExpression",
        object: callExpr,
        property: makeIdentifier("prop"),
        computed: false,
        optional: false,
        start: 0,
        end: 0,
      };
      expect(expressionToString(expr)).toBe(null);
    });
  });

  // ==========================================================
  // matchesManualPureFunction
  // ==========================================================

  describe("matchesManualPureFunction", () => {
    it("matches an Identifier callee", () => {
      const callee = makeIdentifier("myPure");
      const result = matchesManualPureFunction(callee, ["myPure", "otherFn"]);
      expect(result).toBe(true);
    });

    it("matches a MemberExpression callee", () => {
      const callee = makeMemberExpression(
        makeIdentifier("Object"),
        makeIdentifier("freeze"),
      );
      const result = matchesManualPureFunction(callee, [
        "Object.freeze",
        "Math.max",
      ]);
      expect(result).toBe(true);
    });

    it("returns false when callee is not in the list", () => {
      const callee = makeIdentifier("impure");
      const result = matchesManualPureFunction(callee, [
        "Object.freeze",
        "Math.max",
      ]);
      expect(result).toBe(false);
    });

    it("returns false for computed property access", () => {
      const callee = makeMemberExpression(
        makeIdentifier("obj"),
        makeIdentifier("method"),
        true,
      );
      const result = matchesManualPureFunction(callee, ["obj.method"]);
      expect(result).toBe(false);
    });

    it("returns false for empty manual list", () => {
      const callee = makeIdentifier("anything");
      const result = matchesManualPureFunction(callee, []);
      expect(result).toBe(false);
    });

    it("matches deeply nested member expression", () => {
      const callee = makeMemberExpression(
        makeMemberExpression(makeIdentifier("a"), makeIdentifier("b")),
        makeIdentifier("c"),
      );
      const result = matchesManualPureFunction(callee, ["a.b.c"]);
      expect(result).toBe(true);
    });
  });

  // ==========================================================
  // collectNoSideEffectsFunctions
  // ==========================================================

  describe("collectNoSideEffectsFunctions", () => {
    it("finds function declaration after @__NO_SIDE_EFFECTS__ annotation", () => {
      const source = "/*@__NO_SIDE_EFFECTS__*/ function pure() { return 1; }";
      const funcStart = source.indexOf("function");
      const program: AST.Program = {
        type: "Program",
        body: [
          {
            type: "FunctionDeclaration",
            id: {
              type: "Identifier",
              name: "pure",
              start: funcStart + 9,
              end: funcStart + 13,
            },
            params: [],
            body: {
              type: "BlockStatement",
              body: [],
              start: funcStart + 16,
              end: funcStart + 30,
            },
            generator: false,
            async: false,
            start: funcStart,
            end: funcStart + 30,
          },
        ],
        sourceType: "module",
        start: 0,
        end: source.length,
      };

      const results = collectNoSideEffectsFunctions(source, program);
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("pure");
      expect(results[0].start).toBe(funcStart);
    });

    it("returns empty array when no annotations present", () => {
      const source = "function impure() { sideEffect(); }";
      const program: AST.Program = {
        type: "Program",
        body: [
          {
            type: "FunctionDeclaration",
            id: { type: "Identifier", name: "impure", start: 9, end: 15 },
            params: [],
            body: {
              type: "BlockStatement",
              body: [],
              start: 18,
              end: 35,
            },
            generator: false,
            async: false,
            start: 0,
            end: 35,
          },
        ],
        sourceType: "module",
        start: 0,
        end: source.length,
      };

      const results = collectNoSideEffectsFunctions(source, program);
      expect(results.length).toBe(0);
    });

    it("handles exported function declarations", () => {
      const source =
        "/*@__NO_SIDE_EFFECTS__*/ export function pure() { return 1; }";
      const exportStart = source.indexOf("export");
      const funcStart = source.indexOf("function");
      const program: AST.Program = {
        type: "Program",
        body: [
          {
            type: "ExportNamedDeclaration",
            declaration: {
              type: "FunctionDeclaration",
              id: {
                type: "Identifier",
                name: "pure",
                start: funcStart + 9,
                end: funcStart + 13,
              },
              params: [],
              body: {
                type: "BlockStatement",
                body: [],
                start: funcStart + 16,
                end: funcStart + 30,
              },
              generator: false,
              async: false,
              start: funcStart,
              end: funcStart + 30,
            },
            specifiers: [],
            source: null,
            start: exportStart,
            end: source.length,
          },
        ],
        sourceType: "module",
        start: 0,
        end: source.length,
      };

      const results = collectNoSideEffectsFunctions(source, program);
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("pure");
    });

    it("ignores function without id", () => {
      const source = "/*@__NO_SIDE_EFFECTS__*/ export default function() {}";
      const funcStart = source.indexOf("function");
      const program: AST.Program = {
        type: "Program",
        body: [
          {
            type: "FunctionDeclaration",
            id: null,
            params: [],
            body: {
              type: "BlockStatement",
              body: [],
              start: funcStart + 11,
              end: funcStart + 13,
            },
            generator: false,
            async: false,
            start: funcStart,
            end: funcStart + 13,
          },
        ],
        sourceType: "module",
        start: 0,
        end: source.length,
      };

      const results = collectNoSideEffectsFunctions(source, program);
      expect(results.length).toBe(0);
    });

    it("handles empty program body", () => {
      const source = "/*@__NO_SIDE_EFFECTS__*/";
      const program = makeProgram();

      const results = collectNoSideEffectsFunctions(source, program);
      expect(results.length).toBe(0);
    });

    it("handles export named function with NO_SIDE_EFFECTS annotation", () => {
      const source =
        "/*@__NO_SIDE_EFFECTS__*/ export function pure() { return 1; }";
      const funcStart = source.indexOf("function");
      const exportStart = source.indexOf("export");
      const program: AST.Program = {
        type: "Program",
        body: [
          {
            type: "ExportNamedDeclaration",
            declaration: {
              type: "FunctionDeclaration",
              id: {
                type: "Identifier",
                name: "pure",
                start: funcStart + 9,
                end: funcStart + 13,
              },
              params: [],
              body: {
                type: "BlockStatement",
                body: [],
                start: funcStart + 16,
                end: funcStart + 30,
              },
              generator: false,
              async: false,
              start: funcStart,
              end: funcStart + 30,
            } as unknown as AST.FunctionDeclaration,
            specifiers: [],
            source: null,
            start: exportStart,
            end: funcStart + 30,
          } as unknown as AST.ExportNamedDeclaration,
        ],
        sourceType: "module",
        start: 0,
        end: source.length,
      };

      const results = collectNoSideEffectsFunctions(source, program);
      expect(results.length).toBe(1);
      expect(results[0].name).toBe("pure");
    });

    it("handles expressionToString with computed member expression", () => {
      const expr: AST.MemberExpression = {
        type: "MemberExpression",
        object: {
          type: "Identifier",
          name: "obj",
          start: 0,
          end: 3,
        } as AST.Identifier,
        property: {
          type: "Identifier",
          name: "prop",
          start: 4,
          end: 8,
        } as AST.Identifier,
        computed: true,
        optional: false,
        start: 0,
        end: 9,
      } as AST.MemberExpression;
      const result = expressionToString(expr);
      expect(result).toBeNull();
    });

    it("handles expressionToString with non-identifier member property", () => {
      const expr: AST.MemberExpression = {
        type: "MemberExpression",
        object: {
          type: "Identifier",
          name: "obj",
          start: 0,
          end: 3,
        } as AST.Identifier,
        property: {
          type: "Literal",
          value: 1,
          start: 4,
          end: 5,
        } as AST.Literal,
        computed: false,
        optional: false,
        start: 0,
        end: 6,
      } as AST.MemberExpression;
      const result = expressionToString(expr);
      expect(result).toBeNull();
    });
  });
});
