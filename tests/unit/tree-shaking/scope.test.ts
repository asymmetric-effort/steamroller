/**
 * @module tests/unit/tree-shaking/scope
 * @description Unit tests for scope analysis.
 */

import { describe, it, expect } from "vitest";
import { Scope, analyzeScopes } from "../../../src/tree-shaking/scope.js";
import type { Program } from "../../../src/ast/types.js";

/**
 * Helper to create a minimal Program AST node.
 */
const createProgram = (body: ReadonlyArray<Record<string, unknown>>): Program =>
  ({
    type: "Program",
    body,
    sourceType: "module",
    start: 0,
    end: 100,
  }) as unknown as Program;

/**
 * Helper to create an Identifier node.
 */
const id = (name: string): Record<string, unknown> => ({
  type: "Identifier",
  name,
  start: 0,
  end: name.length,
});

/**
 * Helper to create a VariableDeclaration.
 */
const varDecl = (
  kind: "var" | "let" | "const",
  name: string,
  init: Record<string, unknown> | null = null,
): Record<string, unknown> => ({
  type: "VariableDeclaration",
  kind,
  declarations: [
    {
      type: "VariableDeclarator",
      id: id(name),
      init,
      start: 0,
      end: 10,
    },
  ],
  start: 0,
  end: 20,
});

/**
 * Helper to create a FunctionDeclaration.
 */
const funcDecl = (
  name: string,
  params: Array<Record<string, unknown>>,
  bodyStatements: Array<Record<string, unknown>>,
): Record<string, unknown> => ({
  type: "FunctionDeclaration",
  id: id(name),
  params,
  body: {
    type: "BlockStatement",
    body: bodyStatements,
    start: 0,
    end: 50,
  },
  generator: false,
  async: false,
  start: 0,
  end: 60,
});

/**
 * Helper to create an ExpressionStatement with an identifier reference.
 */
const exprStmt = (expr: Record<string, unknown>): Record<string, unknown> => ({
  type: "ExpressionStatement",
  expression: expr,
  start: 0,
  end: 10,
});

describe("Scope", () => {
  describe("constructor", () => {
    it("creates root scope with null parent", () => {
      const scope = new Scope(null, false);
      expect(scope.parent).toBeNull();
      expect(scope.children).toHaveLength(0);
      expect(scope.bindings.size).toBe(0);
      expect(scope.references).toHaveLength(0);
      expect(scope.isBlockScope).toBe(false);
    });

    it("adds child to parent on construction", () => {
      const parent = new Scope(null, false);
      const child = new Scope(parent, true);
      expect(child.parent).toBe(parent);
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]).toBe(child);
    });

    it("creates block scope", () => {
      const scope = new Scope(null, true);
      expect(scope.isBlockScope).toBe(true);
    });
  });

  describe("addBinding", () => {
    it("adds a binding to the scope", () => {
      const scope = new Scope(null, false);
      const node = { type: "Identifier", name: "x", start: 0, end: 1 };
      const binding = scope.addBinding("x", "const", node);
      expect(binding.name).toBe("x");
      expect(binding.kind).toBe("const");
      expect(binding.node).toBe(node);
      expect(binding.scope).toBe(scope);
      expect(binding.references).toHaveLength(0);
      expect(binding.isIncluded).toBe(false);
      expect(scope.bindings.get("x")).toBe(binding);
    });
  });

  describe("addReference", () => {
    it("adds a reference to the scope", () => {
      const scope = new Scope(null, false);
      const node = { type: "Identifier", name: "x", start: 0, end: 1 };
      const ref = scope.addReference("x", node);
      expect(ref.name).toBe("x");
      expect(ref.node).toBe(node);
      expect(ref.scope).toBe(scope);
      expect(ref.binding).toBeNull();
      expect(scope.references).toHaveLength(1);
      expect(scope.references[0]).toBe(ref);
    });
  });

  describe("resolve", () => {
    it("resolves binding in current scope", () => {
      const scope = new Scope(null, false);
      const node = { type: "Identifier", name: "x", start: 0, end: 1 };
      const binding = scope.addBinding("x", "const", node);
      expect(scope.resolve("x")).toBe(binding);
    });

    it("resolves binding from parent scope", () => {
      const parent = new Scope(null, false);
      const child = new Scope(parent, true);
      const node = { type: "Identifier", name: "x", start: 0, end: 1 };
      const binding = parent.addBinding("x", "const", node);
      expect(child.resolve("x")).toBe(binding);
    });

    it("returns null for unresolved names", () => {
      const scope = new Scope(null, false);
      expect(scope.resolve("unknown")).toBeNull();
    });

    it("resolves to nearest scope (shadowing)", () => {
      const parent = new Scope(null, false);
      const child = new Scope(parent, true);
      const parentNode = { type: "Identifier", name: "x", start: 0, end: 1 };
      const childNode = { type: "Identifier", name: "x", start: 5, end: 6 };
      parent.addBinding("x", "const", parentNode);
      const childBinding = child.addBinding("x", "let", childNode);
      expect(child.resolve("x")).toBe(childBinding);
    });
  });

  describe("findFunctionScope", () => {
    it("returns self if not a block scope", () => {
      const scope = new Scope(null, false);
      expect(scope.findFunctionScope()).toBe(scope);
    });

    it("walks up past block scopes to function scope", () => {
      const funcScope = new Scope(null, false);
      const block1 = new Scope(funcScope, true);
      const block2 = new Scope(block1, true);
      expect(block2.findFunctionScope()).toBe(funcScope);
    });
  });
});

describe("analyzeScopes", () => {
  describe("module scope - top-level declarations", () => {
    it("registers const declarations at module scope", () => {
      const ast = createProgram([varDecl("const", "x")]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("x")).toBe(true);
      expect(scope.bindings.get("x")!.kind).toBe("const");
    });

    it("registers let declarations at module scope", () => {
      const ast = createProgram([varDecl("let", "y")]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("y")).toBe(true);
      expect(scope.bindings.get("y")!.kind).toBe("let");
    });

    it("registers var declarations at module scope", () => {
      const ast = createProgram([varDecl("var", "z")]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("z")).toBe(true);
      expect(scope.bindings.get("z")!.kind).toBe("var");
    });

    it("registers multiple declarations", () => {
      const ast = createProgram([
        varDecl("const", "a"),
        varDecl("const", "b"),
        varDecl("let", "c"),
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.size).toBe(3);
      expect(scope.bindings.has("a")).toBe(true);
      expect(scope.bindings.has("b")).toBe(true);
      expect(scope.bindings.has("c")).toBe(true);
    });
  });

  describe("function scope", () => {
    it("creates a new scope for function declarations", () => {
      const ast = createProgram([
        funcDecl("foo", [], [varDecl("const", "inner")]),
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("foo")).toBe(true);
      expect(scope.bindings.get("foo")!.kind).toBe("function");
      expect(scope.children).toHaveLength(1);
      const funcScope = scope.children[0];
      expect(funcScope.bindings.has("inner")).toBe(true);
    });

    it("adds function parameters to function scope", () => {
      const ast = createProgram([funcDecl("add", [id("a"), id("b")], [])]);
      const scope = analyzeScopes(ast);
      const funcScope = scope.children[0];
      expect(funcScope.bindings.has("a")).toBe(true);
      expect(funcScope.bindings.get("a")!.kind).toBe("param");
      expect(funcScope.bindings.has("b")).toBe(true);
      expect(funcScope.bindings.get("b")!.kind).toBe("param");
    });

    it("handles arrow function expressions", () => {
      const ast = createProgram([
        varDecl("const", "fn", {
          type: "ArrowFunctionExpression",
          id: null,
          params: [id("x")],
          body: {
            type: "BlockStatement",
            body: [exprStmt(id("x"))],
            start: 0,
            end: 20,
          },
          expression: false,
          generator: false,
          async: false,
          start: 0,
          end: 30,
        }),
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("fn")).toBe(true);
      // Arrow creates a function scope child
      expect(scope.children).toHaveLength(1);
      const arrowScope = scope.children[0];
      expect(arrowScope.bindings.has("x")).toBe(true);
      expect(arrowScope.bindings.get("x")!.kind).toBe("param");
    });

    it("handles function expression with name", () => {
      const ast = createProgram([
        varDecl("const", "fn", {
          type: "FunctionExpression",
          id: id("myFunc"),
          params: [],
          body: {
            type: "BlockStatement",
            body: [exprStmt(id("myFunc"))],
            start: 0,
            end: 20,
          },
          generator: false,
          async: false,
          start: 0,
          end: 30,
        }),
      ]);
      const scope = analyzeScopes(ast);
      // Named function expression name is in its own scope
      const funcScope = scope.children[0];
      expect(funcScope.bindings.has("myFunc")).toBe(true);
      expect(funcScope.bindings.get("myFunc")!.kind).toBe("function");
    });
  });

  describe("block scope", () => {
    it("creates a new scope for block statements", () => {
      const ast = createProgram([
        {
          type: "BlockStatement",
          body: [varDecl("let", "blockVar")],
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.children).toHaveLength(1);
      const blockScope = scope.children[0];
      expect(blockScope.isBlockScope).toBe(true);
      expect(blockScope.bindings.has("blockVar")).toBe(true);
    });

    it("let/const stays in block scope", () => {
      const ast = createProgram([
        {
          type: "BlockStatement",
          body: [varDecl("let", "x"), varDecl("const", "y")],
          start: 0,
          end: 40,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("x")).toBe(false);
      expect(scope.bindings.has("y")).toBe(false);
      const blockScope = scope.children[0];
      expect(blockScope.bindings.has("x")).toBe(true);
      expect(blockScope.bindings.has("y")).toBe(true);
    });

    it("var hoists to function scope through block", () => {
      const ast = createProgram([
        funcDecl(
          "test",
          [],
          [
            {
              type: "BlockStatement",
              body: [varDecl("var", "hoisted")],
              start: 0,
              end: 30,
            },
          ],
        ),
      ]);
      const scope = analyzeScopes(ast);
      const funcScope = scope.children[0];
      // var hoists to function scope, not block scope
      expect(funcScope.bindings.has("hoisted")).toBe(true);
      expect(funcScope.bindings.get("hoisted")!.kind).toBe("var");
    });

    it("var hoists to module scope when not in a function", () => {
      const ast = createProgram([
        {
          type: "BlockStatement",
          body: [varDecl("var", "topVar")],
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      // var should hoist to module scope
      expect(scope.bindings.has("topVar")).toBe(true);
      expect(scope.bindings.get("topVar")!.kind).toBe("var");
    });
  });

  describe("references and resolution", () => {
    it("resolves references to correct bindings", () => {
      const ast = createProgram([varDecl("const", "x"), exprStmt(id("x"))]);
      const scope = analyzeScopes(ast);
      expect(scope.references).toHaveLength(1);
      expect(scope.references[0].name).toBe("x");
      expect(scope.references[0].binding).toBe(scope.bindings.get("x")!);
    });

    it("unresolved references (globals) have null binding", () => {
      const ast = createProgram([exprStmt(id("console"))]);
      const scope = analyzeScopes(ast);
      expect(scope.references).toHaveLength(1);
      expect(scope.references[0].name).toBe("console");
      expect(scope.references[0].binding).toBeNull();
    });

    it("references in function resolve to outer scope", () => {
      const ast = createProgram([
        varDecl("const", "outer"),
        funcDecl("test", [], [exprStmt(id("outer"))]),
      ]);
      const scope = analyzeScopes(ast);
      const funcScope = scope.children[0];
      expect(funcScope.references).toHaveLength(1);
      expect(funcScope.references[0].name).toBe("outer");
      expect(funcScope.references[0].binding).toBe(
        scope.bindings.get("outer")!,
      );
    });

    it("nested scopes shadow outer names", () => {
      const ast = createProgram([
        varDecl("const", "x"),
        funcDecl("test", [], [varDecl("const", "x"), exprStmt(id("x"))]),
      ]);
      const scope = analyzeScopes(ast);
      const funcScope = scope.children[0];
      expect(funcScope.references).toHaveLength(1);
      expect(funcScope.references[0].binding).toBe(
        funcScope.bindings.get("x")!,
      );
      // Inner x shadows outer x
      expect(funcScope.references[0].binding).not.toBe(
        scope.bindings.get("x")!,
      );
    });

    it("tracks binding references bidirectionally", () => {
      const ast = createProgram([
        varDecl("const", "x"),
        exprStmt(id("x")),
        exprStmt(id("x")),
      ]);
      const scope = analyzeScopes(ast);
      const binding = scope.bindings.get("x")!;
      expect(binding.references).toHaveLength(2);
      expect(binding.references[0].name).toBe("x");
      expect(binding.references[1].name).toBe("x");
    });
  });

  describe("import bindings", () => {
    it("registers import specifiers at module scope", () => {
      const ast = createProgram([
        {
          type: "ImportDeclaration",
          specifiers: [
            {
              type: "ImportSpecifier",
              imported: id("foo"),
              local: id("foo"),
              start: 0,
              end: 10,
            },
          ],
          source: { type: "Literal", value: "./module", start: 0, end: 10 },
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("foo")).toBe(true);
      expect(scope.bindings.get("foo")!.kind).toBe("import");
    });

    it("registers default import at module scope", () => {
      const ast = createProgram([
        {
          type: "ImportDeclaration",
          specifiers: [
            {
              type: "ImportDefaultSpecifier",
              local: id("mod"),
              start: 0,
              end: 10,
            },
          ],
          source: { type: "Literal", value: "./module", start: 0, end: 10 },
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("mod")).toBe(true);
      expect(scope.bindings.get("mod")!.kind).toBe("import");
    });

    it("registers namespace import at module scope", () => {
      const ast = createProgram([
        {
          type: "ImportDeclaration",
          specifiers: [
            {
              type: "ImportNamespaceSpecifier",
              local: id("ns"),
              start: 0,
              end: 10,
            },
          ],
          source: { type: "Literal", value: "./module", start: 0, end: 10 },
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("ns")).toBe(true);
      expect(scope.bindings.get("ns")!.kind).toBe("import");
    });
  });

  describe("destructuring patterns", () => {
    it("handles object destructuring", () => {
      const ast = createProgram([
        {
          type: "VariableDeclaration",
          kind: "const",
          declarations: [
            {
              type: "VariableDeclarator",
              id: {
                type: "ObjectPattern",
                properties: [
                  {
                    type: "Property",
                    key: id("a"),
                    value: id("a"),
                    kind: "init",
                    method: false,
                    shorthand: true,
                    computed: false,
                    start: 0,
                    end: 5,
                  },
                  {
                    type: "Property",
                    key: id("b"),
                    value: id("b"),
                    kind: "init",
                    method: false,
                    shorthand: true,
                    computed: false,
                    start: 0,
                    end: 5,
                  },
                ],
                start: 0,
                end: 10,
              },
              init: id("obj"),
              start: 0,
              end: 20,
            },
          ],
          start: 0,
          end: 25,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("a")).toBe(true);
      expect(scope.bindings.has("b")).toBe(true);
      expect(scope.bindings.get("a")!.kind).toBe("const");
      expect(scope.bindings.get("b")!.kind).toBe("const");
    });

    it("handles array destructuring", () => {
      const ast = createProgram([
        {
          type: "VariableDeclaration",
          kind: "let",
          declarations: [
            {
              type: "VariableDeclarator",
              id: {
                type: "ArrayPattern",
                elements: [id("first"), id("second")],
                start: 0,
                end: 15,
              },
              init: id("arr"),
              start: 0,
              end: 20,
            },
          ],
          start: 0,
          end: 25,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("first")).toBe(true);
      expect(scope.bindings.has("second")).toBe(true);
      expect(scope.bindings.get("first")!.kind).toBe("let");
    });

    it("handles rest element in destructuring", () => {
      const ast = createProgram([
        {
          type: "VariableDeclaration",
          kind: "const",
          declarations: [
            {
              type: "VariableDeclarator",
              id: {
                type: "ArrayPattern",
                elements: [
                  id("head"),
                  {
                    type: "RestElement",
                    argument: id("tail"),
                    start: 0,
                    end: 8,
                  },
                ],
                start: 0,
                end: 20,
              },
              init: id("list"),
              start: 0,
              end: 25,
            },
          ],
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("head")).toBe(true);
      expect(scope.bindings.has("tail")).toBe(true);
    });

    it("handles nested destructuring", () => {
      const ast = createProgram([
        {
          type: "VariableDeclaration",
          kind: "const",
          declarations: [
            {
              type: "VariableDeclarator",
              id: {
                type: "ObjectPattern",
                properties: [
                  {
                    type: "Property",
                    key: id("nested"),
                    value: {
                      type: "ObjectPattern",
                      properties: [
                        {
                          type: "Property",
                          key: id("deep"),
                          value: id("deep"),
                          kind: "init",
                          method: false,
                          shorthand: true,
                          computed: false,
                          start: 0,
                          end: 5,
                        },
                      ],
                      start: 0,
                      end: 10,
                    },
                    kind: "init",
                    method: false,
                    shorthand: false,
                    computed: false,
                    start: 0,
                    end: 15,
                  },
                ],
                start: 0,
                end: 20,
              },
              init: id("obj"),
              start: 0,
              end: 25,
            },
          ],
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("deep")).toBe(true);
      // "nested" is a key, not a binding
      expect(scope.bindings.has("nested")).toBe(false);
    });

    it("handles destructured function parameters", () => {
      const ast = createProgram([
        funcDecl(
          "test",
          [
            {
              type: "ObjectPattern",
              properties: [
                {
                  type: "Property",
                  key: id("x"),
                  value: id("x"),
                  kind: "init",
                  method: false,
                  shorthand: true,
                  computed: false,
                  start: 0,
                  end: 5,
                },
                {
                  type: "Property",
                  key: id("y"),
                  value: id("y"),
                  kind: "init",
                  method: false,
                  shorthand: true,
                  computed: false,
                  start: 0,
                  end: 5,
                },
              ],
              start: 0,
              end: 10,
            },
          ],
          [exprStmt(id("x"))],
        ),
      ]);
      const scope = analyzeScopes(ast);
      const funcScope = scope.children[0];
      expect(funcScope.bindings.has("x")).toBe(true);
      expect(funcScope.bindings.has("y")).toBe(true);
      expect(funcScope.bindings.get("x")!.kind).toBe("param");
    });
  });

  describe("class declarations", () => {
    it("registers class declarations at current scope", () => {
      const ast = createProgram([
        {
          type: "ClassDeclaration",
          id: id("MyClass"),
          superClass: null,
          body: {
            type: "ClassBody",
            body: [],
            start: 0,
            end: 20,
          },
          decorators: [],
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("MyClass")).toBe(true);
      expect(scope.bindings.get("MyClass")!.kind).toBe("class");
    });
  });

  describe("for loops", () => {
    it("creates block scope for for-statement with let", () => {
      const ast = createProgram([
        {
          type: "ForStatement",
          init: varDecl("let", "i"),
          test: null,
          update: null,
          body: {
            type: "BlockStatement",
            body: [exprStmt(id("i"))],
            start: 0,
            end: 20,
          },
          start: 0,
          end: 40,
        },
      ]);
      const scope = analyzeScopes(ast);
      // for creates a block scope
      expect(scope.children).toHaveLength(1);
      const forScope = scope.children[0];
      expect(forScope.isBlockScope).toBe(true);
      expect(forScope.bindings.has("i")).toBe(true);
      expect(forScope.bindings.get("i")!.kind).toBe("let");
    });

    it("var in for-loop hoists to function/module scope", () => {
      const ast = createProgram([
        {
          type: "ForStatement",
          init: varDecl("var", "i"),
          test: null,
          update: null,
          body: {
            type: "BlockStatement",
            body: [],
            start: 0,
            end: 10,
          },
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("i")).toBe(true);
      expect(scope.bindings.get("i")!.kind).toBe("var");
    });

    it("creates block scope for for-in with let", () => {
      const ast = createProgram([
        {
          type: "ForInStatement",
          left: varDecl("let", "key"),
          right: id("obj"),
          body: {
            type: "BlockStatement",
            body: [],
            start: 0,
            end: 10,
          },
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.children).toHaveLength(1);
      const forScope = scope.children[0];
      expect(forScope.bindings.has("key")).toBe(true);
    });

    it("creates block scope for for-of with const", () => {
      const ast = createProgram([
        {
          type: "ForOfStatement",
          left: varDecl("const", "item"),
          right: id("items"),
          body: {
            type: "BlockStatement",
            body: [],
            start: 0,
            end: 10,
          },
          await: false,
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.children).toHaveLength(1);
      const forScope = scope.children[0];
      expect(forScope.bindings.has("item")).toBe(true);
      expect(forScope.bindings.get("item")!.kind).toBe("const");
    });
  });

  describe("catch clause", () => {
    it("creates scope for catch parameter", () => {
      const ast = createProgram([
        {
          type: "TryStatement",
          block: {
            type: "BlockStatement",
            body: [],
            start: 0,
            end: 10,
          },
          handler: {
            type: "CatchClause",
            param: id("err"),
            body: {
              type: "BlockStatement",
              body: [exprStmt(id("err"))],
              start: 0,
              end: 20,
            },
            start: 0,
            end: 25,
          },
          finalizer: null,
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      // TryStatement > CatchClause creates a scope
      // Find the catch scope
      const findCatchScope = (s: Scope): Scope | null => {
        if (s.bindings.has("err")) {
          return s;
        }
        for (let i = 0; i < s.children.length; i++) {
          const found = findCatchScope(s.children[i]);
          if (found !== null) {
            return found;
          }
        }
        return null;
      };
      const catchScope = findCatchScope(scope);
      expect(catchScope).not.toBeNull();
      expect(catchScope!.bindings.get("err")!.kind).toBe("param");
    });
  });

  describe("member expressions", () => {
    it("does not treat property access as reference", () => {
      const ast = createProgram([
        varDecl("const", "obj"),
        exprStmt({
          type: "MemberExpression",
          object: id("obj"),
          property: id("prop"),
          computed: false,
          optional: false,
          start: 0,
          end: 10,
        }),
      ]);
      const scope = analyzeScopes(ast);
      // "obj" should be a reference, but "prop" should NOT be
      const refNames = scope.references.map((r) => r.name);
      expect(refNames).toContain("obj");
      expect(refNames).not.toContain("prop");
    });

    it("treats computed property as reference", () => {
      const ast = createProgram([
        varDecl("const", "obj"),
        varDecl("const", "key"),
        exprStmt({
          type: "MemberExpression",
          object: id("obj"),
          property: id("key"),
          computed: true,
          optional: false,
          start: 0,
          end: 10,
        }),
      ]);
      const scope = analyzeScopes(ast);
      const refNames = scope.references.map((r) => r.name);
      expect(refNames).toContain("obj");
      expect(refNames).toContain("key");
    });
  });

  describe("arrow function expression body", () => {
    it("handles expression body", () => {
      const ast = createProgram([
        varDecl("const", "x"),
        varDecl("const", "fn", {
          type: "ArrowFunctionExpression",
          id: null,
          params: [id("a")],
          body: id("x"),
          expression: true,
          generator: false,
          async: false,
          start: 0,
          end: 20,
        }),
      ]);
      const scope = analyzeScopes(ast);
      const arrowScope = scope.children[0];
      expect(arrowScope.bindings.has("a")).toBe(true);
      expect(arrowScope.references).toHaveLength(1);
      expect(arrowScope.references[0].name).toBe("x");
      expect(arrowScope.references[0].binding).toBe(scope.bindings.get("x")!);
    });
  });

  describe("edge cases", () => {
    it("handles empty program", () => {
      const ast = createProgram([]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.size).toBe(0);
      expect(scope.children).toHaveLength(0);
      expect(scope.references).toHaveLength(0);
    });

    it("handles assignment pattern default values", () => {
      const ast = createProgram([
        {
          type: "VariableDeclaration",
          kind: "const",
          declarations: [
            {
              type: "VariableDeclarator",
              id: {
                type: "AssignmentPattern",
                left: id("x"),
                right: {
                  type: "Literal",
                  value: 42,
                  start: 0,
                  end: 2,
                },
                start: 0,
                end: 10,
              },
              init: null,
              start: 0,
              end: 15,
            },
          ],
          start: 0,
          end: 20,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.bindings.has("x")).toBe(true);
    });

    it("handles multiple references to the same binding", () => {
      const ast = createProgram([
        varDecl("const", "x"),
        exprStmt(id("x")),
        exprStmt(id("x")),
        exprStmt(id("x")),
      ]);
      const scope = analyzeScopes(ast);
      const binding = scope.bindings.get("x")!;
      expect(binding.references).toHaveLength(3);
    });

    it("class expression id is not treated as a reference", () => {
      const ast = createProgram([
        varDecl("const", "C", {
          type: "ClassExpression",
          id: id("InternalName"),
          superClass: null,
          body: {
            type: "ClassBody",
            body: [],
            start: 0,
            end: 10,
          },
          decorators: [],
          start: 0,
          end: 20,
        }),
      ]);
      const scope = analyzeScopes(ast);
      // InternalName should not appear as a reference
      const refNames = scope.references.map((r) => r.name);
      expect(refNames).not.toContain("InternalName");
    });

    it("handles switch statement as block scope", () => {
      const ast = createProgram([
        {
          type: "SwitchStatement",
          discriminant: id("x"),
          cases: [
            {
              type: "SwitchCase",
              test: { type: "Literal", value: 1, start: 0, end: 1 },
              consequent: [varDecl("let", "result")],
              start: 0,
              end: 20,
            },
          ],
          start: 0,
          end: 40,
        },
      ]);
      const scope = analyzeScopes(ast);
      expect(scope.children).toHaveLength(1);
      const switchScope = scope.children[0];
      expect(switchScope.isBlockScope).toBe(true);
    });

    it("handles catch clause without param", () => {
      const ast = createProgram([
        {
          type: "TryStatement",
          block: {
            type: "BlockStatement",
            body: [],
            start: 0,
            end: 10,
          },
          handler: {
            type: "CatchClause",
            param: null,
            body: {
              type: "BlockStatement",
              body: [exprStmt(id("recover"))],
              start: 0,
              end: 20,
            },
            start: 0,
            end: 25,
          },
          finalizer: null,
          start: 0,
          end: 30,
        },
      ]);
      const scope = analyzeScopes(ast);
      // Should not throw, catch scope should exist without param bindings
      const allRefs: Array<string> = [];
      const collectRefs = (s: Scope): void => {
        for (let i = 0; i < s.references.length; i++) {
          allRefs.push(s.references[i].name);
        }
        for (let i = 0; i < s.children.length; i++) {
          collectRefs(s.children[i]);
        }
      };
      collectRefs(scope);
      expect(allRefs).toContain("recover");
    });
  });
});
