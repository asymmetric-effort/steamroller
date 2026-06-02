/**
 * @module tests/unit/tree-shaking/side-effects
 * @description Unit tests for side effect detection.
 */

import { describe, it, expect } from "vitest";
import {
  hasExpressionSideEffects,
  hasStatementSideEffects,
  analyzeModuleSideEffects,
  isKnownPureCall,
} from "../../../src/tree-shaking/side-effects.js";
import { Scope } from "../../../src/tree-shaking/scope.js";
import type * as AST from "../../../src/ast/types.js";

/**
 * Create a minimal scope for testing.
 */
const createScope = (): Scope => new Scope(null, false);

/**
 * Empty pure annotations set.
 */
const NO_ANNOTATIONS: ReadonlySet<number> = new Set();

/**
 * Helper to create an Identifier expression node.
 */
const identifier = (name: string): AST.Identifier =>
  ({ type: "Identifier", name, start: 0, end: name.length }) as AST.Identifier;

/**
 * Helper to create a Literal node.
 */
const literal = (value: string | number | boolean | null): AST.Literal =>
  ({ type: "Literal", value, start: 0, end: 1 }) as AST.Literal;

/**
 * Helper to create a MemberExpression node.
 */
const memberExpr = (objName: string, propName: string): AST.MemberExpression =>
  ({
    type: "MemberExpression",
    object: identifier(objName),
    property: identifier(propName),
    computed: false,
    optional: false,
    start: 0,
    end: 10,
  }) as AST.MemberExpression;

/**
 * Helper to create a CallExpression node.
 */
const callExpr = (
  callee: AST.Expression,
  args: ReadonlyArray<AST.Expression> = [],
  start = 0,
): AST.CallExpression =>
  ({
    type: "CallExpression",
    callee,
    arguments: args,
    optional: false,
    start,
    end: start + 10,
  }) as AST.CallExpression;

/**
 * Helper to create an AssignmentExpression node.
 */
const assignExpr = (
  left: AST.Expression,
  right: AST.Expression,
): AST.AssignmentExpression =>
  ({
    type: "AssignmentExpression",
    operator: "=",
    left,
    right,
    start: 0,
    end: 10,
  }) as AST.AssignmentExpression;

/**
 * Helper to create an UpdateExpression node.
 */
const updateExpr = (argument: AST.Expression): AST.UpdateExpression =>
  ({
    type: "UpdateExpression",
    operator: "++",
    argument,
    prefix: true,
    start: 0,
    end: 5,
  }) as AST.UpdateExpression;

/**
 * Helper to create a NewExpression node.
 */
const newExpr = (
  callee: AST.Expression,
  args: ReadonlyArray<AST.Expression> = [],
  start = 0,
): AST.NewExpression =>
  ({
    type: "NewExpression",
    callee,
    arguments: args,
    start,
    end: start + 10,
  }) as AST.NewExpression;

/**
 * Helper to create a UnaryExpression node.
 */
const unaryExpr = (
  operator: AST.UnaryOperator,
  argument: AST.Expression,
): AST.UnaryExpression =>
  ({
    type: "UnaryExpression",
    operator,
    prefix: true,
    argument,
    start: 0,
    end: 10,
  }) as AST.UnaryExpression;

/**
 * Helper to create an ArrowFunctionExpression node.
 */
const arrowFunc = (): AST.ArrowFunctionExpression =>
  ({
    type: "ArrowFunctionExpression",
    id: null,
    params: [],
    body: literal(1),
    expression: true,
    generator: false,
    async: false,
    start: 0,
    end: 10,
  }) as unknown as AST.ArrowFunctionExpression;

/**
 * Helper to create a FunctionExpression node.
 */
const funcExpr = (): AST.FunctionExpression =>
  ({
    type: "FunctionExpression",
    id: null,
    params: [],
    body: { type: "BlockStatement", body: [], start: 0, end: 5 },
    generator: false,
    async: false,
    start: 0,
    end: 10,
  }) as unknown as AST.FunctionExpression;

/**
 * Helper to create an ExpressionStatement node.
 */
const exprStatement = (expression: AST.Expression): AST.ExpressionStatement =>
  ({
    type: "ExpressionStatement",
    expression,
    start: 0,
    end: 10,
  }) as AST.ExpressionStatement;

/**
 * Helper to create a VariableDeclaration node.
 */
const varDecl = (
  kind: "var" | "let" | "const",
  name: string,
  init: AST.Expression | null = null,
): AST.VariableDeclaration =>
  ({
    type: "VariableDeclaration",
    kind,
    declarations: [
      {
        type: "VariableDeclarator",
        id: identifier(name),
        init,
        start: 0,
        end: 10,
      },
    ],
    start: 0,
    end: 15,
  }) as unknown as AST.VariableDeclaration;

/**
 * Helper to create a Program node.
 */
const program = (
  body: ReadonlyArray<AST.Statement | AST.ModuleDeclaration>,
): AST.Program =>
  ({
    type: "Program",
    body,
    sourceType: "module",
    start: 0,
    end: 100,
  }) as AST.Program;

/**
 * Helper to create an ImportDeclaration.
 */
const importDecl = (source: string): AST.ImportDeclaration =>
  ({
    type: "ImportDeclaration",
    specifiers: [],
    source: { type: "Literal", value: source, start: 0, end: 10 },
    start: 0,
    end: 20,
  }) as unknown as AST.ImportDeclaration;

describe("side-effects", () => {
  describe("hasExpressionSideEffects", () => {
    describe("pure expressions (no side effects)", () => {
      it("should return 'none' for identifier", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          identifier("x"),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for numeric literal", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          literal(42),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for string literal", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          literal("hello"),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for boolean literal", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          literal(true),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for null literal", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          literal(null),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for arrow function", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          arrowFunc(),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for function expression", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          funcExpr(),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for ThisExpression", () => {
        const scope = createScope();
        const node = {
          type: "ThisExpression",
          start: 0,
          end: 4,
        } as AST.ThisExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'none' for template literal without tag", () => {
        const scope = createScope();
        const node = {
          type: "TemplateLiteral",
          quasis: [
            {
              type: "TemplateElement",
              tail: true,
              value: { raw: "hi", cooked: "hi" },
              start: 0,
              end: 4,
            },
          ],
          expressions: [],
          start: 0,
          end: 6,
        } as unknown as AST.TemplateLiteral;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'none' for pure binary expression", () => {
        const scope = createScope();
        const node = {
          type: "BinaryExpression",
          operator: "+",
          left: literal(1),
          right: literal(2),
          start: 0,
          end: 5,
        } as AST.BinaryExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'none' for pure unary expression (typeof)", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          unaryExpr("typeof", identifier("x")),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for void expression", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          unaryExpr("void", literal(0)),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for logical expression with pure operands", () => {
        const scope = createScope();
        const node = {
          type: "LogicalExpression",
          operator: "&&",
          left: literal(true),
          right: literal(false),
          start: 0,
          end: 10,
        } as AST.LogicalExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'none' for conditional with pure branches", () => {
        const scope = createScope();
        const node = {
          type: "ConditionalExpression",
          test: literal(true),
          consequent: literal(1),
          alternate: literal(2),
          start: 0,
          end: 10,
        } as AST.ConditionalExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'none' for MetaProperty", () => {
        const scope = createScope();
        const node = {
          type: "MetaProperty",
          meta: identifier("import"),
          property: identifier("meta"),
          start: 0,
          end: 11,
        } as unknown as AST.MetaProperty;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });
    });

    describe("impure expressions (definite side effects)", () => {
      it("should return 'definite' for assignment expression", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          assignExpr(identifier("x"), literal(1)),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("definite");
      });

      it("should return 'definite' for update expression", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          updateExpr(identifier("x")),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("definite");
      });

      it("should return 'definite' for new expression", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          newExpr(identifier("Foo")),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("definite");
      });

      it("should return 'definite' for call expression", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          callExpr(identifier("foo")),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("definite");
      });

      it("should return 'definite' for delete expression", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          unaryExpr("delete", memberExpr("obj", "prop")),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("definite");
      });

      it("should return 'definite' for yield expression", () => {
        const scope = createScope();
        const node = {
          type: "YieldExpression",
          argument: literal(1),
          delegate: false,
          start: 0,
          end: 7,
        } as AST.YieldExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for await expression", () => {
        const scope = createScope();
        const node = {
          type: "AwaitExpression",
          argument: identifier("promise"),
          start: 0,
          end: 13,
        } as AST.AwaitExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for dynamic import", () => {
        const scope = createScope();
        const node = {
          type: "ImportExpression",
          source: literal("./module"),
          start: 0,
          end: 20,
        } as AST.ImportExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for tagged template", () => {
        const scope = createScope();
        const node = {
          type: "TaggedTemplateExpression",
          tag: identifier("html"),
          quasi: {
            type: "TemplateLiteral",
            quasis: [],
            expressions: [],
            start: 0,
            end: 4,
          },
          start: 0,
          end: 10,
        } as unknown as AST.TaggedTemplateExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });
    });

    describe("possible side effects", () => {
      it("should return 'possible' for member expression (getter)", () => {
        const scope = createScope();
        const result = hasExpressionSideEffects(
          memberExpr("obj", "prop"),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("possible");
      });

      it("should return 'possible' for spread in array", () => {
        const scope = createScope();
        const node = {
          type: "ArrayExpression",
          elements: [
            {
              type: "SpreadElement",
              argument: identifier("arr"),
              start: 0,
              end: 6,
            },
          ],
          start: 0,
          end: 8,
        } as unknown as AST.ArrayExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("possible");
      });

      it("should return 'possible' for spread in object", () => {
        const scope = createScope();
        const node = {
          type: "ObjectExpression",
          properties: [
            {
              type: "SpreadElement",
              argument: identifier("obj"),
              start: 0,
              end: 6,
            },
          ],
          start: 0,
          end: 8,
        } as unknown as AST.ObjectExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("possible");
      });
    });

    describe("PURE annotations", () => {
      it("should return 'none' for call with PURE annotation", () => {
        const scope = createScope();
        const annotations = new Set([5]);
        const result = hasExpressionSideEffects(
          callExpr(identifier("sideEffectFn"), [], 5),
          scope,
          annotations,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for new with PURE annotation", () => {
        const scope = createScope();
        const annotations = new Set([10]);
        const result = hasExpressionSideEffects(
          newExpr(identifier("MyClass"), [], 10),
          scope,
          annotations,
        );
        expect(result).toBe("none");
      });

      it("should return 'definite' for call without matching PURE annotation", () => {
        const scope = createScope();
        const annotations = new Set([99]);
        const result = hasExpressionSideEffects(
          callExpr(identifier("fn"), [], 0),
          scope,
          annotations,
        );
        expect(result).toBe("definite");
      });
    });

    describe("class expressions", () => {
      it("should return 'none' for simple class expression", () => {
        const scope = createScope();
        const node = {
          type: "ClassExpression",
          id: null,
          superClass: null,
          body: { type: "ClassBody", body: [], start: 0, end: 10 },
          decorators: [],
          start: 0,
          end: 12,
        } as unknown as AST.ClassExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'definite' for class with decorators", () => {
        const scope = createScope();
        const node = {
          type: "ClassExpression",
          id: null,
          superClass: null,
          body: { type: "ClassBody", body: [], start: 0, end: 10 },
          decorators: [
            {
              type: "Decorator",
              expression: identifier("dec"),
              start: 0,
              end: 4,
            },
          ],
          start: 0,
          end: 12,
        } as unknown as AST.ClassExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for class with static block", () => {
        const scope = createScope();
        const node = {
          type: "ClassExpression",
          id: null,
          superClass: null,
          body: {
            type: "ClassBody",
            body: [{ type: "StaticBlock", body: [], start: 0, end: 5 }],
            start: 0,
            end: 10,
          },
          decorators: [],
          start: 0,
          end: 12,
        } as unknown as AST.ClassExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should check superClass for side effects", () => {
        const scope = createScope();
        const node = {
          type: "ClassExpression",
          id: null,
          superClass: callExpr(identifier("getBase")),
          body: { type: "ClassBody", body: [], start: 0, end: 10 },
          decorators: [],
          start: 0,
          end: 12,
        } as unknown as AST.ClassExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });
    });

    describe("sequence expressions", () => {
      it("should return 'none' for sequence of pure expressions", () => {
        const scope = createScope();
        const node = {
          type: "SequenceExpression",
          expressions: [literal(1), literal(2), identifier("x")],
          start: 0,
          end: 10,
        } as unknown as AST.SequenceExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'definite' if any expression in sequence is impure", () => {
        const scope = createScope();
        const node = {
          type: "SequenceExpression",
          expressions: [literal(1), assignExpr(identifier("x"), literal(2))],
          start: 0,
          end: 10,
        } as unknown as AST.SequenceExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });
    });

    describe("chain expressions", () => {
      it("should analyze the inner expression of a chain", () => {
        const scope = createScope();
        const node = {
          type: "ChainExpression",
          expression: memberExpr("obj", "prop"),
          start: 0,
          end: 10,
        } as unknown as AST.ChainExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("possible");
      });
    });

    describe("array and object expressions", () => {
      it("should return 'none' for array of pure elements", () => {
        const scope = createScope();
        const node = {
          type: "ArrayExpression",
          elements: [literal(1), literal(2), identifier("x")],
          start: 0,
          end: 10,
        } as unknown as AST.ArrayExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'none' for object with pure values", () => {
        const scope = createScope();
        const node = {
          type: "ObjectExpression",
          properties: [
            {
              type: "Property",
              key: identifier("a"),
              value: literal(1),
              kind: "init",
              method: false,
              shorthand: false,
              computed: false,
              start: 0,
              end: 5,
            },
          ],
          start: 0,
          end: 8,
        } as unknown as AST.ObjectExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'none' for array with null elements", () => {
        const scope = createScope();
        const node = {
          type: "ArrayExpression",
          elements: [null, literal(1), null],
          start: 0,
          end: 10,
        } as unknown as AST.ArrayExpression;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });
    });

    describe("template literals with expressions", () => {
      it("should check template expressions for side effects", () => {
        const scope = createScope();
        const node = {
          type: "TemplateLiteral",
          quasis: [
            {
              type: "TemplateElement",
              tail: false,
              value: { raw: "a", cooked: "a" },
              start: 0,
              end: 1,
            },
            {
              type: "TemplateElement",
              tail: true,
              value: { raw: "b", cooked: "b" },
              start: 5,
              end: 6,
            },
          ],
          expressions: [callExpr(identifier("fn"))],
          start: 0,
          end: 10,
        } as unknown as AST.TemplateLiteral;
        const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });
    });
  });

  describe("hasStatementSideEffects", () => {
    describe("side-effect-free statements", () => {
      it("should return 'none' for empty statement", () => {
        const scope = createScope();
        const node = {
          type: "EmptyStatement",
          start: 0,
          end: 1,
        } as AST.EmptyStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'none' for debugger statement", () => {
        const scope = createScope();
        const node = {
          type: "DebuggerStatement",
          start: 0,
          end: 8,
        } as AST.DebuggerStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'none' for function declaration", () => {
        const scope = createScope();
        const node = {
          type: "FunctionDeclaration",
          id: identifier("foo"),
          params: [],
          body: { type: "BlockStatement", body: [], start: 0, end: 5 },
          generator: false,
          async: false,
          start: 0,
          end: 20,
        } as unknown as AST.FunctionDeclaration;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'none' for variable declaration with pure init", () => {
        const scope = createScope();
        const result = hasStatementSideEffects(
          varDecl("const", "x", literal(42)),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for variable declaration without init", () => {
        const scope = createScope();
        const result = hasStatementSideEffects(
          varDecl("let", "x", null),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("none");
      });

      it("should return 'none' for directive prologue", () => {
        const scope = createScope();
        const node = {
          type: "ExpressionStatement",
          expression: literal("use strict"),
          directive: "use strict",
          start: 0,
          end: 12,
        } as unknown as AST.ExpressionStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });
    });

    describe("statements with definite side effects", () => {
      it("should return 'definite' for return statement", () => {
        const scope = createScope();
        const node = {
          type: "ReturnStatement",
          argument: literal(1),
          start: 0,
          end: 9,
        } as AST.ReturnStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for throw statement", () => {
        const scope = createScope();
        const node = {
          type: "ThrowStatement",
          argument: newExpr(identifier("Error")),
          start: 0,
          end: 20,
        } as unknown as AST.ThrowStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for break statement", () => {
        const scope = createScope();
        const node = {
          type: "BreakStatement",
          label: null,
          start: 0,
          end: 6,
        } as AST.BreakStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for continue statement", () => {
        const scope = createScope();
        const node = {
          type: "ContinueStatement",
          label: null,
          start: 0,
          end: 9,
        } as AST.ContinueStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for expression statement with call", () => {
        const scope = createScope();
        const result = hasStatementSideEffects(
          exprStatement(callExpr(identifier("console"))),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("definite");
      });

      it("should return 'definite' for for-in statement", () => {
        const scope = createScope();
        const node = {
          type: "ForInStatement",
          left: identifier("k"),
          right: identifier("obj"),
          body: { type: "EmptyStatement", start: 0, end: 1 },
          start: 0,
          end: 20,
        } as unknown as AST.ForInStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for for-of statement", () => {
        const scope = createScope();
        const node = {
          type: "ForOfStatement",
          left: identifier("v"),
          right: identifier("arr"),
          body: { type: "EmptyStatement", start: 0, end: 1 },
          await: false,
          start: 0,
          end: 20,
        } as unknown as AST.ForOfStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'possible' for unknown statement type", () => {
        const scope = createScope();
        const node = {
          type: "UnknownStatement",
          start: 0,
          end: 5,
        } as unknown as AST.Statement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("possible");
      });

      it("should return 'definite' for with statement", () => {
        const scope = createScope();
        const node = {
          type: "WithStatement",
          object: identifier("obj"),
          body: { type: "EmptyStatement", start: 0, end: 1 },
          start: 0,
          end: 20,
        } as unknown as AST.WithStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for variable declaration with impure init", () => {
        const scope = createScope();
        const result = hasStatementSideEffects(
          varDecl("const", "x", callExpr(identifier("getVal"))),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("definite");
      });
    });

    describe("statements with possible side effects", () => {
      it("should return 'possible' for try statement", () => {
        const scope = createScope();
        const node = {
          type: "TryStatement",
          block: { type: "BlockStatement", body: [], start: 0, end: 5 },
          handler: null,
          finalizer: null,
          start: 0,
          end: 10,
        } as unknown as AST.TryStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("possible");
      });

      it("should return 'possible' for variable declaration with member access init", () => {
        const scope = createScope();
        const result = hasStatementSideEffects(
          varDecl("const", "x", memberExpr("obj", "prop")),
          scope,
          NO_ANNOTATIONS,
        );
        expect(result).toBe("possible");
      });
    });

    describe("compound statements", () => {
      it("should analyze if statement condition and branches", () => {
        const scope = createScope();
        const node = {
          type: "IfStatement",
          test: literal(true),
          consequent: exprStatement(literal(1)),
          alternate: null,
          start: 0,
          end: 20,
        } as unknown as AST.IfStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should analyze if statement with alternate", () => {
        const scope = createScope();
        const node = {
          type: "IfStatement",
          test: literal(true),
          consequent: exprStatement(literal(1)),
          alternate: exprStatement(callExpr(identifier("fn"))),
          start: 0,
          end: 30,
        } as unknown as AST.IfStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should detect impure test in if statement", () => {
        const scope = createScope();
        const node = {
          type: "IfStatement",
          test: callExpr(identifier("check")),
          consequent: exprStatement(literal(1)),
          alternate: null,
          start: 0,
          end: 20,
        } as unknown as AST.IfStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for if with impure consequent", () => {
        const scope = createScope();
        const node = {
          type: "IfStatement",
          test: literal(true),
          consequent: exprStatement(callExpr(identifier("fn"))),
          alternate: null,
          start: 0,
          end: 20,
        } as unknown as AST.IfStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should analyze while loop condition and body", () => {
        const scope = createScope();
        const node = {
          type: "WhileStatement",
          test: literal(true),
          body: { type: "EmptyStatement", start: 0, end: 1 },
          start: 0,
          end: 15,
        } as unknown as AST.WhileStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should analyze do-while loop", () => {
        const scope = createScope();
        const node = {
          type: "DoWhileStatement",
          test: literal(true),
          body: exprStatement(callExpr(identifier("fn"))),
          start: 0,
          end: 20,
        } as unknown as AST.DoWhileStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should analyze for loop parts", () => {
        const scope = createScope();
        const node = {
          type: "ForStatement",
          init: varDecl("let", "i", literal(0)),
          test: literal(true),
          update: updateExpr(identifier("i")),
          body: { type: "EmptyStatement", start: 0, end: 1 },
          start: 0,
          end: 30,
        } as unknown as AST.ForStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should analyze for loop with expression init", () => {
        const scope = createScope();
        const node = {
          type: "ForStatement",
          init: assignExpr(identifier("i"), literal(0)),
          test: null,
          update: null,
          body: { type: "EmptyStatement", start: 0, end: 1 },
          start: 0,
          end: 30,
        } as unknown as AST.ForStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should analyze block statement", () => {
        const scope = createScope();
        const node = {
          type: "BlockStatement",
          body: [exprStatement(literal(1)), exprStatement(literal(2))],
          start: 0,
          end: 10,
        } as unknown as AST.BlockStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should short-circuit block statement on definite", () => {
        const scope = createScope();
        const node = {
          type: "BlockStatement",
          body: [
            exprStatement(callExpr(identifier("fn"))),
            exprStatement(literal(1)),
          ],
          start: 0,
          end: 20,
        } as unknown as AST.BlockStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should analyze labeled statement body", () => {
        const scope = createScope();
        const node = {
          type: "LabeledStatement",
          label: identifier("loop"),
          body: { type: "EmptyStatement", start: 0, end: 1 },
          start: 0,
          end: 10,
        } as unknown as AST.LabeledStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should analyze switch statement", () => {
        const scope = createScope();
        const node = {
          type: "SwitchStatement",
          discriminant: identifier("x"),
          cases: [
            {
              type: "SwitchCase",
              test: literal(1),
              consequent: [exprStatement(literal("a"))],
              start: 0,
              end: 10,
            },
          ],
          start: 0,
          end: 30,
        } as unknown as AST.SwitchStatement;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });
    });

    describe("class declarations", () => {
      it("should return 'none' for simple class declaration", () => {
        const scope = createScope();
        const node = {
          type: "ClassDeclaration",
          id: identifier("Foo"),
          superClass: null,
          body: { type: "ClassBody", body: [], start: 0, end: 10 },
          decorators: [],
          start: 0,
          end: 20,
        } as unknown as AST.ClassDeclaration;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should return 'definite' for class with decorators", () => {
        const scope = createScope();
        const node = {
          type: "ClassDeclaration",
          id: identifier("Foo"),
          superClass: null,
          body: { type: "ClassBody", body: [], start: 0, end: 10 },
          decorators: [
            {
              type: "Decorator",
              expression: identifier("d"),
              start: 0,
              end: 2,
            },
          ],
          start: 0,
          end: 20,
        } as unknown as AST.ClassDeclaration;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'definite' for class with static block", () => {
        const scope = createScope();
        const node = {
          type: "ClassDeclaration",
          id: identifier("Foo"),
          superClass: null,
          body: {
            type: "ClassBody",
            body: [{ type: "StaticBlock", body: [], start: 0, end: 5 }],
            start: 0,
            end: 10,
          },
          decorators: [],
          start: 0,
          end: 20,
        } as unknown as AST.ClassDeclaration;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should detect side effects in static property initializers", () => {
        const scope = createScope();
        const node = {
          type: "ClassDeclaration",
          id: identifier("Foo"),
          superClass: null,
          body: {
            type: "ClassBody",
            body: [
              {
                type: "PropertyDefinition",
                key: identifier("x"),
                value: callExpr(identifier("init")),
                computed: false,
                static: true,
                decorators: [],
                start: 0,
                end: 10,
              },
            ],
            start: 0,
            end: 12,
          },
          decorators: [],
          start: 0,
          end: 20,
        } as unknown as AST.ClassDeclaration;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should detect side effects in superClass expression", () => {
        const scope = createScope();
        const node = {
          type: "ClassDeclaration",
          id: identifier("Foo"),
          superClass: callExpr(identifier("getBase")),
          body: { type: "ClassBody", body: [], start: 0, end: 10 },
          decorators: [],
          start: 0,
          end: 20,
        } as unknown as AST.ClassDeclaration;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should return 'none' for class with pure superClass", () => {
        const scope = createScope();
        const node = {
          type: "ClassDeclaration",
          id: identifier("Foo"),
          superClass: identifier("Base"),
          body: { type: "ClassBody", body: [], start: 0, end: 10 },
          decorators: [],
          start: 0,
          end: 20,
        } as unknown as AST.ClassDeclaration;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("none");
      });

      it("should detect property definition decorators", () => {
        const scope = createScope();
        const node = {
          type: "ClassDeclaration",
          id: identifier("Foo"),
          superClass: null,
          body: {
            type: "ClassBody",
            body: [
              {
                type: "PropertyDefinition",
                key: identifier("x"),
                value: null,
                computed: false,
                static: false,
                decorators: [
                  {
                    type: "Decorator",
                    expression: identifier("d"),
                    start: 0,
                    end: 2,
                  },
                ],
                start: 0,
                end: 10,
              },
            ],
            start: 0,
            end: 12,
          },
          decorators: [],
          start: 0,
          end: 20,
        } as unknown as AST.ClassDeclaration;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should detect computed property definition keys", () => {
        const scope = createScope();
        const node = {
          type: "ClassDeclaration",
          id: identifier("Foo"),
          superClass: null,
          body: {
            type: "ClassBody",
            body: [
              {
                type: "PropertyDefinition",
                key: callExpr(identifier("sym")),
                value: null,
                computed: true,
                static: false,
                decorators: [],
                start: 0,
                end: 10,
              },
            ],
            start: 0,
            end: 12,
          },
          decorators: [],
          start: 0,
          end: 20,
        } as unknown as AST.ClassDeclaration;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should detect method definition decorators", () => {
        const scope = createScope();
        const node = {
          type: "ClassDeclaration",
          id: identifier("Foo"),
          superClass: null,
          body: {
            type: "ClassBody",
            body: [
              {
                type: "MethodDefinition",
                key: identifier("m"),
                value: funcExpr(),
                kind: "method",
                computed: false,
                static: false,
                decorators: [
                  {
                    type: "Decorator",
                    expression: identifier("d"),
                    start: 0,
                    end: 2,
                  },
                ],
                start: 0,
                end: 20,
              },
            ],
            start: 0,
            end: 22,
          },
          decorators: [],
          start: 0,
          end: 25,
        } as unknown as AST.ClassDeclaration;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });

      it("should detect computed method keys", () => {
        const scope = createScope();
        const node = {
          type: "ClassDeclaration",
          id: identifier("Foo"),
          superClass: null,
          body: {
            type: "ClassBody",
            body: [
              {
                type: "MethodDefinition",
                key: callExpr(identifier("computeKey")),
                value: funcExpr(),
                kind: "method",
                computed: true,
                static: false,
                decorators: [],
                start: 0,
                end: 20,
              },
            ],
            start: 0,
            end: 25,
          },
          decorators: [],
          start: 0,
          end: 30,
        } as unknown as AST.ClassDeclaration;
        const result = hasStatementSideEffects(node, scope, NO_ANNOTATIONS);
        expect(result).toBe("definite");
      });
    });
  });

  describe("additional expression coverage", () => {
    it("should short-circuit when definite is already determined", () => {
      const scope = createScope();
      // Sequence with assignment first, then more items - tests short-circuit
      const node = {
        type: "SequenceExpression",
        expressions: [
          assignExpr(identifier("x"), literal(1)),
          callExpr(identifier("fn")),
          literal(1),
        ],
        start: 0,
        end: 20,
      } as unknown as AST.SequenceExpression;
      const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
      expect(result).toBe("definite");
    });

    it("should return 'possible' for unknown expression type", () => {
      const scope = createScope();
      // Fabricate an unknown expression type
      const node = {
        type: "SomeUnknownExpression",
        start: 0,
        end: 5,
      } as unknown as AST.Expression;
      const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
      expect(result).toBe("possible");
    });

    it("should handle object with computed key", () => {
      const scope = createScope();
      const node = {
        type: "ObjectExpression",
        properties: [
          {
            type: "Property",
            key: identifier("a"),
            value: literal(1),
            kind: "init",
            method: false,
            shorthand: false,
            computed: true,
            start: 0,
            end: 5,
          },
        ],
        start: 0,
        end: 8,
      } as unknown as AST.ObjectExpression;
      const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
      expect(result).toBe("none");
    });

    it("should handle object with getter definition", () => {
      const scope = createScope();
      const node = {
        type: "ObjectExpression",
        properties: [
          {
            type: "Property",
            key: identifier("a"),
            value: funcExpr(),
            kind: "get",
            method: false,
            shorthand: false,
            computed: false,
            start: 0,
            end: 10,
          },
        ],
        start: 0,
        end: 12,
      } as unknown as AST.ObjectExpression;
      const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
      expect(result).toBe("none");
    });

    it("should handle class expression with property definition decorator", () => {
      const scope = createScope();
      const node = {
        type: "ClassExpression",
        id: null,
        superClass: null,
        body: {
          type: "ClassBody",
          body: [
            {
              type: "PropertyDefinition",
              key: identifier("x"),
              value: literal(1),
              computed: false,
              static: true,
              decorators: [
                {
                  type: "Decorator",
                  expression: identifier("d"),
                  start: 0,
                  end: 2,
                },
              ],
              start: 0,
              end: 10,
            },
          ],
          start: 0,
          end: 12,
        },
        decorators: [],
        start: 0,
        end: 15,
      } as unknown as AST.ClassExpression;
      const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
      expect(result).toBe("definite");
    });

    it("should handle class expression with computed property key", () => {
      const scope = createScope();
      const node = {
        type: "ClassExpression",
        id: null,
        superClass: null,
        body: {
          type: "ClassBody",
          body: [
            {
              type: "PropertyDefinition",
              key: callExpr(identifier("sym")),
              value: null,
              computed: true,
              static: false,
              decorators: [],
              start: 0,
              end: 10,
            },
          ],
          start: 0,
          end: 12,
        },
        decorators: [],
        start: 0,
        end: 15,
      } as unknown as AST.ClassExpression;
      const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
      expect(result).toBe("definite");
    });

    it("should handle class expression with method decorator", () => {
      const scope = createScope();
      const node = {
        type: "ClassExpression",
        id: null,
        superClass: null,
        body: {
          type: "ClassBody",
          body: [
            {
              type: "MethodDefinition",
              key: identifier("foo"),
              value: funcExpr(),
              kind: "method",
              computed: false,
              static: false,
              decorators: [
                {
                  type: "Decorator",
                  expression: identifier("d"),
                  start: 0,
                  end: 2,
                },
              ],
              start: 0,
              end: 20,
            },
          ],
          start: 0,
          end: 22,
        },
        decorators: [],
        start: 0,
        end: 25,
      } as unknown as AST.ClassExpression;
      const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
      expect(result).toBe("definite");
    });

    it("should handle class expression with computed method key", () => {
      const scope = createScope();
      const node = {
        type: "ClassExpression",
        id: null,
        superClass: null,
        body: {
          type: "ClassBody",
          body: [
            {
              type: "MethodDefinition",
              key: callExpr(identifier("computeKey")),
              value: funcExpr(),
              kind: "method",
              computed: true,
              static: false,
              decorators: [],
              start: 0,
              end: 20,
            },
          ],
          start: 0,
          end: 22,
        },
        decorators: [],
        start: 0,
        end: 25,
      } as unknown as AST.ClassExpression;
      const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
      expect(result).toBe("definite");
    });

    it("should check known pure call arguments for side effects", () => {
      const scope = createScope();
      // Object.keys(x) where x is a pure identifier - should be none
      const node = callExpr(memberExpr("Object", "keys"), [identifier("x")]);
      const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
      expect(result).toBe("none");
    });

    it("should detect spread in known pure call arguments", () => {
      const scope = createScope();
      const node = {
        type: "CallExpression",
        callee: memberExpr("Array", "of"),
        arguments: [
          {
            type: "SpreadElement",
            argument: identifier("arr"),
            start: 0,
            end: 6,
          },
        ],
        optional: false,
        start: 0,
        end: 20,
      } as unknown as AST.CallExpression;
      const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
      expect(result).toBe("possible");
    });

    it("should detect impure args in known pure call", () => {
      const scope = createScope();
      const node = callExpr(memberExpr("Object", "keys"), [
        callExpr(identifier("getObj")),
      ]);
      const result = hasExpressionSideEffects(node, scope, NO_ANNOTATIONS);
      expect(result).toBe("definite");
    });
  });

  describe("isKnownPureCall", () => {
    it("should recognize Object.keys as pure", () => {
      const scope = createScope();
      const result = isKnownPureCall(memberExpr("Object", "keys"), scope, []);
      expect(result).toBe(true);
    });

    it("should recognize Object.values as pure", () => {
      const scope = createScope();
      const result = isKnownPureCall(memberExpr("Object", "values"), scope, []);
      expect(result).toBe(true);
    });

    it("should recognize Object.entries as pure", () => {
      const scope = createScope();
      const result = isKnownPureCall(
        memberExpr("Object", "entries"),
        scope,
        [],
      );
      expect(result).toBe(true);
    });

    it("should recognize Object.freeze as pure", () => {
      const scope = createScope();
      const result = isKnownPureCall(memberExpr("Object", "freeze"), scope, []);
      expect(result).toBe(true);
    });

    it("should recognize Array.isArray as pure", () => {
      const scope = createScope();
      const result = isKnownPureCall(memberExpr("Array", "isArray"), scope, []);
      expect(result).toBe(true);
    });

    it("should recognize Math.abs as pure", () => {
      const scope = createScope();
      const result = isKnownPureCall(memberExpr("Math", "abs"), scope, []);
      expect(result).toBe(true);
    });

    it("should recognize JSON.stringify as pure", () => {
      const scope = createScope();
      const result = isKnownPureCall(
        memberExpr("JSON", "stringify"),
        scope,
        [],
      );
      expect(result).toBe(true);
    });

    it("should not recognize unknown methods as pure", () => {
      const scope = createScope();
      const result = isKnownPureCall(memberExpr("console", "log"), scope, []);
      expect(result).toBe(false);
    });

    it("should recognize manual pure functions", () => {
      const scope = createScope();
      const result = isKnownPureCall(identifier("myPureFn"), scope, [
        "myPureFn",
      ]);
      expect(result).toBe(true);
    });

    it("should recognize manual pure methods", () => {
      const scope = createScope();
      const result = isKnownPureCall(memberExpr("utils", "transform"), scope, [
        "utils.transform",
      ]);
      expect(result).toBe(true);
    });

    it("should return false for non-static member expression", () => {
      const scope = createScope();
      const node = {
        type: "MemberExpression",
        object: identifier("obj"),
        property: identifier("key"),
        computed: true,
        optional: false,
        start: 0,
        end: 10,
      } as AST.MemberExpression;
      const result = isKnownPureCall(node, scope, []);
      expect(result).toBe(false);
    });

    it("should return false for complex expressions", () => {
      const scope = createScope();
      const result = isKnownPureCall(callExpr(identifier("fn")), scope, []);
      expect(result).toBe(false);
    });

    it("should return false for member with non-Identifier property", () => {
      const scope = createScope();
      const node = {
        type: "MemberExpression",
        object: identifier("obj"),
        property: literal("key"),
        computed: false,
        optional: false,
        start: 0,
        end: 10,
      } as unknown as AST.MemberExpression;
      const result = isKnownPureCall(node, scope, []);
      expect(result).toBe(false);
    });

    it("should handle deep member chains (a.b.c)", () => {
      const scope = createScope();
      const node = {
        type: "MemberExpression",
        object: {
          type: "MemberExpression",
          object: identifier("a"),
          property: identifier("b"),
          computed: false,
          optional: false,
          start: 0,
          end: 3,
        },
        property: identifier("c"),
        computed: false,
        optional: false,
        start: 0,
        end: 5,
      } as unknown as AST.MemberExpression;
      const result = isKnownPureCall(node, scope, ["a.b.c"]);
      expect(result).toBe(true);
    });

    it("should return false for chain ending in non-Identifier", () => {
      const scope = createScope();
      const node = {
        type: "MemberExpression",
        object: callExpr(identifier("getObj")),
        property: identifier("method"),
        computed: false,
        optional: false,
        start: 0,
        end: 10,
      } as unknown as AST.MemberExpression;
      const result = isKnownPureCall(node, scope, []);
      expect(result).toBe(false);
    });

    it("should return false for chain with computed inner member", () => {
      const scope = createScope();
      const node = {
        type: "MemberExpression",
        object: {
          type: "MemberExpression",
          object: identifier("a"),
          property: identifier("b"),
          computed: true,
          optional: false,
          start: 0,
          end: 3,
        },
        property: identifier("c"),
        computed: false,
        optional: false,
        start: 0,
        end: 5,
      } as unknown as AST.MemberExpression;
      const result = isKnownPureCall(node, scope, []);
      expect(result).toBe(false);
    });

    it("should return false for identifier that resolves to import binding", () => {
      const scope = createScope();
      scope.addBinding("importedFn", "import", {
        type: "ImportSpecifier",
        start: 0,
        end: 10,
      } as unknown as AST.BaseNode);
      const result = isKnownPureCall(identifier("importedFn"), scope, []);
      expect(result).toBe(false);
    });

    it("should return false for identifier that does not match pure list", () => {
      const scope = createScope();
      scope.addBinding("localFn", "function", {
        type: "FunctionDeclaration",
        start: 0,
        end: 10,
      } as unknown as AST.BaseNode);
      const result = isKnownPureCall(identifier("localFn"), scope, []);
      expect(result).toBe(false);
    });
  });

  describe("analyzeModuleSideEffects", () => {
    it("should report no side effects for import-only module", () => {
      const scope = createScope();
      const ast = program([importDecl("./foo"), importDecl("./bar")]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(false);
      expect(result.sideEffectNodes).toHaveLength(0);
    });

    it("should report no side effects for pure variable declarations", () => {
      const scope = createScope();
      const ast = program([
        varDecl("const", "x", literal(1)),
        varDecl("const", "y", literal("hello")),
      ]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(false);
      expect(result.sideEffectNodes).toHaveLength(0);
    });

    it("should report side effects for function calls", () => {
      const scope = createScope();
      const ast = program([exprStatement(callExpr(identifier("setup")))]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(true);
      expect(result.sideEffectNodes).toHaveLength(1);
    });

    it("should skip ExportAllDeclaration", () => {
      const scope = createScope();
      const ast = program([
        {
          type: "ExportAllDeclaration",
          source: { type: "Literal", value: "./foo", start: 0, end: 7 },
          exported: null,
          start: 0,
          end: 20,
        } as unknown as AST.ExportAllDeclaration,
      ]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(false);
    });

    it("should analyze ExportNamedDeclaration with declaration", () => {
      const scope = createScope();
      const ast = program([
        {
          type: "ExportNamedDeclaration",
          declaration: varDecl("const", "x", callExpr(identifier("compute"))),
          specifiers: [],
          source: null,
          start: 0,
          end: 30,
        } as unknown as AST.ExportNamedDeclaration,
      ]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(true);
      expect(result.sideEffectNodes).toHaveLength(1);
    });

    it("should not flag ExportNamedDeclaration with pure declaration", () => {
      const scope = createScope();
      const ast = program([
        {
          type: "ExportNamedDeclaration",
          declaration: varDecl("const", "x", literal(42)),
          specifiers: [],
          source: null,
          start: 0,
          end: 30,
        } as unknown as AST.ExportNamedDeclaration,
      ]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(false);
    });

    it("should analyze ExportDefaultDeclaration with expression", () => {
      const scope = createScope();
      const ast = program([
        {
          type: "ExportDefaultDeclaration",
          declaration: callExpr(identifier("createApp")),
          start: 0,
          end: 30,
        } as unknown as AST.ExportDefaultDeclaration,
      ]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(true);
    });

    it("should not flag ExportDefaultDeclaration with pure expression", () => {
      const scope = createScope();
      const ast = program([
        {
          type: "ExportDefaultDeclaration",
          declaration: arrowFunc(),
          start: 0,
          end: 30,
        } as unknown as AST.ExportDefaultDeclaration,
      ]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(false);
    });

    it("should flag ExportDefaultDeclaration with impure class declaration", () => {
      const scope = createScope();
      const ast = program([
        {
          type: "ExportDefaultDeclaration",
          declaration: {
            type: "ClassDeclaration",
            id: identifier("Foo"),
            superClass: null,
            body: {
              type: "ClassBody",
              body: [{ type: "StaticBlock", body: [], start: 0, end: 5 }],
              start: 0,
              end: 10,
            },
            decorators: [],
            start: 0,
            end: 20,
          },
          start: 0,
          end: 30,
        } as unknown as AST.ExportDefaultDeclaration,
      ]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(true);
    });

    it("should not flag ExportDefaultDeclaration with function declaration", () => {
      const scope = createScope();
      const ast = program([
        {
          type: "ExportDefaultDeclaration",
          declaration: {
            type: "FunctionDeclaration",
            id: identifier("foo"),
            params: [],
            body: { type: "BlockStatement", body: [], start: 0, end: 5 },
            generator: false,
            async: false,
            start: 0,
            end: 20,
          },
          start: 0,
          end: 30,
        } as unknown as AST.ExportDefaultDeclaration,
      ]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(false);
    });

    it("should report function declarations as side-effect free", () => {
      const scope = createScope();
      const ast = program([
        {
          type: "FunctionDeclaration",
          id: identifier("foo"),
          params: [],
          body: { type: "BlockStatement", body: [], start: 0, end: 5 },
          generator: false,
          async: false,
          start: 0,
          end: 20,
        } as unknown as AST.FunctionDeclaration,
      ]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(false);
    });

    it("should handle mixed module with some side effects", () => {
      const scope = createScope();
      const ast = program([
        importDecl("./dep"),
        varDecl("const", "x", literal(1)),
        exprStatement(callExpr(identifier("init"))),
        varDecl("const", "y", literal(2)),
      ]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(true);
      expect(result.sideEffectNodes).toHaveLength(1);
    });

    it("should skip ExportNamedDeclaration without declaration", () => {
      const scope = createScope();
      const ast = program([
        {
          type: "ExportNamedDeclaration",
          declaration: null,
          specifiers: [
            {
              type: "ExportSpecifier",
              local: identifier("x"),
              exported: identifier("x"),
              start: 0,
              end: 1,
            },
          ],
          source: null,
          start: 0,
          end: 15,
        } as unknown as AST.ExportNamedDeclaration,
      ]);
      const result = analyzeModuleSideEffects(ast, scope, NO_ANNOTATIONS, []);
      expect(result.hasSideEffects).toBe(false);
    });
  });

  describe("manual pure functions", () => {
    it("treats manual pure function call as pure", () => {
      const scope = createScope();
      const result = isKnownPureCall(identifier("myCustomPure"), scope, [
        "myCustomPure",
      ]);
      expect(result).toBe(true);
    });
  });

  describe("class expression side effects", () => {
    it("detects side effects from StaticBlock in class expression", () => {
      const scope = createScope();
      const classExpr = {
        type: "ClassExpression",
        id: null,
        superClass: null,
        body: {
          type: "ClassBody",
          body: [
            {
              type: "StaticBlock",
              body: [],
              start: 10,
              end: 20,
            },
          ],
          start: 5,
          end: 25,
        },
        decorators: [],
        start: 0,
        end: 30,
      } as unknown as AST.ClassExpression;
      const result = hasExpressionSideEffects(classExpr, scope, NO_ANNOTATIONS);
      expect(result).toBe("definite");
    });

    it("detects side effects from decorated MethodDefinition in class expression", () => {
      const scope = createScope();
      const classExpr = {
        type: "ClassExpression",
        id: null,
        superClass: null,
        body: {
          type: "ClassBody",
          body: [
            {
              type: "MethodDefinition",
              key: identifier("foo"),
              value: {
                type: "FunctionExpression",
                id: null,
                params: [],
                body: { type: "BlockStatement", body: [], start: 0, end: 10 },
                generator: false,
                async: false,
                start: 0,
                end: 15,
              },
              kind: "method",
              computed: false,
              static: false,
              decorators: [
                {
                  type: "Decorator",
                  expression: identifier("dec"),
                  start: 0,
                  end: 4,
                },
              ],
              start: 0,
              end: 20,
            },
          ],
          start: 5,
          end: 25,
        },
        decorators: [],
        start: 0,
        end: 30,
      } as unknown as AST.ClassExpression;
      const result = hasExpressionSideEffects(classExpr, scope, NO_ANNOTATIONS);
      expect(result).toBe("definite");
    });

    it("detects side effects from computed MethodDefinition key in class expression", () => {
      const scope = createScope();
      const classExpr = {
        type: "ClassExpression",
        id: null,
        superClass: null,
        body: {
          type: "ClassBody",
          body: [
            {
              type: "MethodDefinition",
              key: callExpr(identifier("getKey")),
              value: {
                type: "FunctionExpression",
                id: null,
                params: [],
                body: { type: "BlockStatement", body: [], start: 0, end: 10 },
                generator: false,
                async: false,
                start: 0,
                end: 15,
              },
              kind: "method",
              computed: true,
              static: false,
              decorators: [],
              start: 0,
              end: 20,
            },
          ],
          start: 5,
          end: 25,
        },
        decorators: [],
        start: 0,
        end: 30,
      } as unknown as AST.ClassExpression;
      const result = hasExpressionSideEffects(classExpr, scope, NO_ANNOTATIONS);
      // computed method key with function call is a side effect
      expect(result).toBe("definite");
    });
  });

  describe("ForStatement side effects", () => {
    it("detects side effects from for-statement init expression", () => {
      const scope = createScope();
      const forStmt = {
        type: "ForStatement",
        init: callExpr(identifier("setup")),
        test: null,
        update: null,
        body: { type: "BlockStatement", body: [], start: 0, end: 10 },
        start: 0,
        end: 30,
      } as unknown as AST.ForStatement;
      const result = hasStatementSideEffects(forStmt, scope, NO_ANNOTATIONS);
      expect(result).toBe("definite");
    });

    it("detects side effects from for-statement init as VariableDeclaration", () => {
      const scope = createScope();
      const forStmt = {
        type: "ForStatement",
        init: {
          type: "VariableDeclaration",
          kind: "let",
          declarations: [
            {
              type: "VariableDeclarator",
              id: identifier("i"),
              init: literal(0),
              start: 0,
              end: 5,
            },
          ],
          start: 0,
          end: 10,
        },
        test: null,
        update: null,
        body: { type: "BlockStatement", body: [], start: 0, end: 10 },
        start: 0,
        end: 30,
      } as unknown as AST.ForStatement;
      const result = hasStatementSideEffects(forStmt, scope, NO_ANNOTATIONS);
      expect(result).toBe("none");
    });
  });

  describe("SwitchStatement side effects", () => {
    it("detects side effects from switch case test", () => {
      const scope = createScope();
      const switchStmt = {
        type: "SwitchStatement",
        discriminant: identifier("x"),
        cases: [
          {
            type: "SwitchCase",
            test: callExpr(identifier("getValue")),
            consequent: [],
            start: 0,
            end: 15,
          },
        ],
        start: 0,
        end: 30,
      } as unknown as AST.SwitchStatement;
      const result = hasStatementSideEffects(switchStmt, scope, NO_ANNOTATIONS);
      expect(result).toBe("definite");
    });

    it("detects no side effects from switch with null case test (default)", () => {
      const scope = createScope();
      const switchStmt = {
        type: "SwitchStatement",
        discriminant: identifier("x"),
        cases: [
          {
            type: "SwitchCase",
            test: null,
            consequent: [],
            start: 0,
            end: 15,
          },
        ],
        start: 0,
        end: 30,
      } as unknown as AST.SwitchStatement;
      const result = hasStatementSideEffects(switchStmt, scope, NO_ANNOTATIONS);
      expect(result).toBe("none");
    });
  });
});
