/**
 * Tests for src/utils/ast-utils.ts
 *
 * Covers isReference() and locateCharacter() with happy and
 * sad paths for >=98% branch/line coverage.
 */
import { describe, it, expect } from "vitest";
import {
  isReference,
  locateCharacter,
  type AstNode,
} from "../../../src/utils/ast-utils";

describe("isReference", () => {
  describe("MemberExpression", () => {
    it("returns true when node is the object", () => {
      const node: AstNode = { type: "Identifier", name: "foo" };
      const parent: AstNode = {
        type: "MemberExpression",
        object: node,
        property: { type: "Identifier", name: "bar" },
      };
      expect(isReference(node, parent)).toBe(true);
    });

    it("returns false when node is a non-computed property", () => {
      const node: AstNode = { type: "Identifier", name: "bar" };
      const parent: AstNode = {
        type: "MemberExpression",
        object: { type: "Identifier", name: "foo" },
        property: node,
        computed: false,
      };
      expect(isReference(node, parent)).toBe(false);
    });

    it("returns true when node is a computed property", () => {
      const node: AstNode = { type: "Identifier", name: "bar" };
      const parent: AstNode = {
        type: "MemberExpression",
        object: { type: "Identifier", name: "foo" },
        property: node,
        computed: true,
      };
      expect(isReference(node, parent)).toBe(true);
    });

    it("returns false when node is unrelated to object and non-computed property", () => {
      const node: AstNode = { type: "Identifier", name: "baz" };
      const parent: AstNode = {
        type: "MemberExpression",
        object: { type: "Identifier", name: "foo" },
        property: { type: "Identifier", name: "bar" },
        computed: false,
      };
      expect(isReference(node, parent)).toBe(false);
    });
  });

  describe("Property", () => {
    it("returns false when node is a non-computed key", () => {
      const node: AstNode = { type: "Identifier", name: "key" };
      const parent: AstNode = {
        type: "Property",
        key: node,
        computed: false,
      };
      expect(isReference(node, parent)).toBe(false);
    });

    it("returns true when node is a computed key", () => {
      const node: AstNode = { type: "Identifier", name: "key" };
      const parent: AstNode = {
        type: "Property",
        key: node,
        computed: true,
      };
      expect(isReference(node, parent)).toBe(true);
    });

    it("returns true when node is the value (not the key)", () => {
      const node: AstNode = { type: "Identifier", name: "val" };
      const parent: AstNode = {
        type: "Property",
        key: { type: "Identifier", name: "key" },
        computed: false,
      };
      expect(isReference(node, parent)).toBe(true);
    });
  });

  describe("MethodDefinition", () => {
    it("returns false when node is a non-computed key", () => {
      const node: AstNode = { type: "Identifier", name: "method" };
      const parent: AstNode = {
        type: "MethodDefinition",
        key: node,
        computed: false,
      };
      expect(isReference(node, parent)).toBe(false);
    });

    it("returns true when node is a computed key", () => {
      const node: AstNode = { type: "Identifier", name: "method" };
      const parent: AstNode = {
        type: "MethodDefinition",
        key: node,
        computed: true,
      };
      expect(isReference(node, parent)).toBe(true);
    });

    it("returns true when node is not the key", () => {
      const node: AstNode = { type: "Identifier", name: "other" };
      const parent: AstNode = {
        type: "MethodDefinition",
        key: { type: "Identifier", name: "method" },
        computed: false,
      };
      expect(isReference(node, parent)).toBe(true);
    });
  });

  describe("LabeledStatement", () => {
    it("returns false when node is the label", () => {
      const node: AstNode = { type: "Identifier", name: "loop" };
      const parent: AstNode = {
        type: "LabeledStatement",
        label: node,
      };
      expect(isReference(node, parent)).toBe(false);
    });

    it("returns true when node is not the label", () => {
      const node: AstNode = { type: "Identifier", name: "other" };
      const parent: AstNode = {
        type: "LabeledStatement",
        label: { type: "Identifier", name: "loop" },
      };
      expect(isReference(node, parent)).toBe(true);
    });
  });

  describe("BreakStatement", () => {
    it("returns false when node is the label", () => {
      const node: AstNode = { type: "Identifier", name: "loop" };
      const parent: AstNode = {
        type: "BreakStatement",
        label: node,
      };
      expect(isReference(node, parent)).toBe(false);
    });

    it("returns true when node is not the label", () => {
      const node: AstNode = { type: "Identifier", name: "other" };
      const parent: AstNode = {
        type: "BreakStatement",
        label: { type: "Identifier", name: "loop" },
      };
      expect(isReference(node, parent)).toBe(true);
    });
  });

  describe("ContinueStatement", () => {
    it("returns false when node is the label", () => {
      const node: AstNode = { type: "Identifier", name: "loop" };
      const parent: AstNode = {
        type: "ContinueStatement",
        label: node,
      };
      expect(isReference(node, parent)).toBe(false);
    });

    it("returns true when node is not the label", () => {
      const node: AstNode = { type: "Identifier", name: "other" };
      const parent: AstNode = {
        type: "ContinueStatement",
        label: { type: "Identifier", name: "loop" },
      };
      expect(isReference(node, parent)).toBe(true);
    });
  });

  describe("VariableDeclarator", () => {
    it("returns false when node is the left (declaration target)", () => {
      const node: AstNode = { type: "Identifier", name: "x" };
      const parent: AstNode = {
        type: "VariableDeclarator",
        left: node,
      };
      expect(isReference(node, parent)).toBe(false);
    });

    it("returns true when node is not the left", () => {
      const node: AstNode = { type: "Identifier", name: "y" };
      const parent: AstNode = {
        type: "VariableDeclarator",
        left: { type: "Identifier", name: "x" },
      };
      expect(isReference(node, parent)).toBe(true);
    });
  });

  describe("other parent types", () => {
    it("returns true for ExpressionStatement", () => {
      const node: AstNode = { type: "Identifier", name: "foo" };
      const parent: AstNode = { type: "ExpressionStatement" };
      expect(isReference(node, parent)).toBe(true);
    });

    it("returns true for CallExpression", () => {
      const node: AstNode = { type: "Identifier", name: "fn" };
      const parent: AstNode = { type: "CallExpression" };
      expect(isReference(node, parent)).toBe(true);
    });

    it("returns true for ReturnStatement", () => {
      const node: AstNode = { type: "Identifier", name: "result" };
      const parent: AstNode = { type: "ReturnStatement" };
      expect(isReference(node, parent)).toBe(true);
    });

    it("returns true for AssignmentExpression", () => {
      const node: AstNode = { type: "Identifier", name: "x" };
      const parent: AstNode = { type: "AssignmentExpression" };
      expect(isReference(node, parent)).toBe(true);
    });
  });
});

describe("locateCharacter", () => {
  it("returns line 1 column 0 for the first character", () => {
    expect(locateCharacter("hello", 0)).toEqual({ line: 1, column: 0 });
  });

  it("returns correct position within first line", () => {
    expect(locateCharacter("hello", 3)).toEqual({ line: 1, column: 3 });
  });

  it("returns correct position after a newline", () => {
    expect(locateCharacter("ab\ncd", 3)).toEqual({ line: 2, column: 0 });
  });

  it("returns correct position for second character on second line", () => {
    expect(locateCharacter("ab\ncd", 4)).toEqual({ line: 2, column: 1 });
  });

  it("handles multi-line source", () => {
    const source = "line1\nline2\nline3";
    expect(locateCharacter(source, 0)).toEqual({ line: 1, column: 0 });
    expect(locateCharacter(source, 5)).toEqual({ line: 1, column: 5 });
    expect(locateCharacter(source, 6)).toEqual({ line: 2, column: 0 });
    expect(locateCharacter(source, 11)).toEqual({ line: 2, column: 5 });
    expect(locateCharacter(source, 12)).toEqual({ line: 3, column: 0 });
    expect(locateCharacter(source, 16)).toEqual({ line: 3, column: 4 });
  });

  it("returns null for negative index", () => {
    expect(locateCharacter("hello", -1)).toBeNull();
  });

  it("returns null for index beyond source length", () => {
    expect(locateCharacter("hello", 6)).toBeNull();
  });

  it("handles index at exactly source length (end position)", () => {
    expect(locateCharacter("hello", 5)).toEqual({ line: 1, column: 5 });
  });

  it("returns line 1 column 0 for empty source with index 0", () => {
    expect(locateCharacter("", 0)).toEqual({ line: 1, column: 0 });
  });

  it("returns null for empty source with index 1", () => {
    expect(locateCharacter("", 1)).toBeNull();
  });

  it("handles the newline character itself", () => {
    expect(locateCharacter("a\nb", 1)).toEqual({ line: 1, column: 1 });
  });

  it("handles consecutive newlines", () => {
    const source = "a\n\nb";
    expect(locateCharacter(source, 0)).toEqual({ line: 1, column: 0 });
    expect(locateCharacter(source, 1)).toEqual({ line: 1, column: 1 });
    expect(locateCharacter(source, 2)).toEqual({ line: 2, column: 0 });
    expect(locateCharacter(source, 3)).toEqual({ line: 3, column: 0 });
  });

  it("handles source ending with newline", () => {
    const source = "abc\n";
    expect(locateCharacter(source, 3)).toEqual({ line: 1, column: 3 });
    expect(locateCharacter(source, 4)).toEqual({ line: 2, column: 0 });
  });

  it("handles single newline source", () => {
    expect(locateCharacter("\n", 0)).toEqual({ line: 1, column: 0 });
    expect(locateCharacter("\n", 1)).toEqual({ line: 2, column: 0 });
  });
});
