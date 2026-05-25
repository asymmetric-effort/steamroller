/**
 * @module tests/unit/codegen/renderer
 * @description Unit tests for the iterative AST-to-code renderer.
 */

import { describe, it, expect } from "vitest";
import { renderNode } from "../../../src/codegen/renderer.js";
import type {
  ArrayExpression,
  ArrayPattern,
  ArrowFunctionExpression,
  AssignmentExpression,
  AssignmentPattern,
  AwaitExpression,
  BinaryExpression,
  BlockStatement,
  BreakStatement,
  CallExpression,
  CatchClause,
  ClassBody,
  ClassDeclaration,
  ConditionalExpression,
  ContinueStatement,
  DebuggerStatement,
  DoWhileStatement,
  EmptyStatement,
  ExportAllDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ExportSpecifier,
  ExpressionStatement,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  IfStatement,
  ImportDeclaration,
  ImportExpression,
  ImportSpecifier,
  LabeledStatement,
  Literal,
  LogicalExpression,
  MemberExpression,
  MetaProperty,
  MethodDefinition,
  NewExpression,
  ObjectExpression,
  ObjectPattern,
  Program,
  Property,
  PropertyDefinition,
  RestElement,
  ReturnStatement,
  SequenceExpression,
  SpreadElement,
  StaticBlock,
  SwitchCase,
  SwitchStatement,
  TemplateLiteral,
  TemplateElement,
  ThisExpression,
  ThrowStatement,
  TryStatement,
  UnaryExpression,
  UpdateExpression,
  VariableDeclaration,
  VariableDeclarator,
  WhileStatement,
  WithStatement,
  YieldExpression,
} from "../../../src/ast/types.js";
import type { RenderOptions } from "../../../src/codegen/renderer.js";

/** Helper to create a minimal node with required base fields. */
const makeNode = <T extends { type: string }>(
  props: T,
): T & { start: number; end: number } => ({
  start: 0,
  end: 0,
  ...props,
});

const id = (name: string): Identifier =>
  makeNode({ type: "Identifier" as const, name });

const lit = (value: string | number | boolean | null, raw?: string): Literal =>
  makeNode({
    type: "Literal" as const,
    value,
    raw:
      raw ??
      (typeof value === "string" ? JSON.stringify(value) : String(value)),
  });

const numLit = (value: number): Literal =>
  makeNode({
    type: "Literal" as const,
    value,
    raw: String(value),
  });

describe("codegen/renderer", () => {
  describe("literals", () => {
    it("renders string literals", () => {
      const node = lit("hello");
      expect(renderNode(node)).toBe('"hello"');
    });

    it("renders number literals", () => {
      const node = numLit(42);
      expect(renderNode(node)).toBe("42");
    });

    it("renders boolean literals", () => {
      expect(renderNode(lit(true, "true"))).toBe("true");
      expect(renderNode(lit(false, "false"))).toBe("false");
    });

    it("renders null literal", () => {
      expect(renderNode(lit(null, "null"))).toBe("null");
    });

    it("renders regex literals", () => {
      const node: Literal = makeNode({
        type: "Literal" as const,
        value: null,
        regex: { pattern: "abc", flags: "gi" },
      });
      expect(renderNode(node)).toBe("/abc/gi");
    });

    it("renders bigint literals", () => {
      const node: Literal = makeNode({
        type: "Literal" as const,
        value: null,
        bigint: "123",
      });
      expect(renderNode(node)).toBe("123n");
    });
  });

  describe("identifiers", () => {
    it("renders simple identifiers", () => {
      expect(renderNode(id("foo"))).toBe("foo");
      expect(renderNode(id("_bar"))).toBe("_bar");
    });
  });

  describe("binary expressions", () => {
    it("renders simple binary expression", () => {
      const node: BinaryExpression = makeNode({
        type: "BinaryExpression" as const,
        operator: "+" as const,
        left: id("a"),
        right: id("b"),
      });
      expect(renderNode(node)).toBe("a + b");
    });

    it("adds parentheses for lower precedence sub-expressions", () => {
      // a * (b + c)
      const add: BinaryExpression = makeNode({
        type: "BinaryExpression" as const,
        operator: "+" as const,
        left: id("b"),
        right: id("c"),
      });
      const mul: BinaryExpression = makeNode({
        type: "BinaryExpression" as const,
        operator: "*" as const,
        left: id("a"),
        right: add,
      });
      expect(renderNode(mul)).toBe("a * (b + c)");
    });

    it("does not add parens when precedence is sufficient", () => {
      // a + b * c (no parens needed on b * c)
      const mul: BinaryExpression = makeNode({
        type: "BinaryExpression" as const,
        operator: "*" as const,
        left: id("b"),
        right: id("c"),
      });
      const add: BinaryExpression = makeNode({
        type: "BinaryExpression" as const,
        operator: "+" as const,
        left: id("a"),
        right: mul,
      });
      expect(renderNode(add)).toBe("a + b * c");
    });

    it("handles nested same-precedence without unnecessary parens", () => {
      // a + b + c => left-to-right, no parens needed
      const inner: BinaryExpression = makeNode({
        type: "BinaryExpression" as const,
        operator: "+" as const,
        left: id("a"),
        right: id("b"),
      });
      const outer: BinaryExpression = makeNode({
        type: "BinaryExpression" as const,
        operator: "+" as const,
        left: inner,
        right: id("c"),
      });
      // Same precedence - no parens added since not strictly less
      expect(renderNode(outer)).toBe("a + b + c");
    });
  });

  describe("logical expressions", () => {
    it("renders logical OR", () => {
      const node: LogicalExpression = makeNode({
        type: "LogicalExpression" as const,
        operator: "||" as const,
        left: id("a"),
        right: id("b"),
      });
      expect(renderNode(node)).toBe("a || b");
    });

    it("parenthesizes lower-precedence logical inside binary", () => {
      // The || has lower prec than &&, so (a || b) && c needs parens on left
      const or: LogicalExpression = makeNode({
        type: "LogicalExpression" as const,
        operator: "||" as const,
        left: id("a"),
        right: id("b"),
      });
      const and: LogicalExpression = makeNode({
        type: "LogicalExpression" as const,
        operator: "&&" as const,
        left: or,
        right: id("c"),
      });
      expect(renderNode(and)).toBe("(a || b) && c");
    });
  });

  describe("unary expressions", () => {
    it("renders prefix unary operators", () => {
      const node: UnaryExpression = makeNode({
        type: "UnaryExpression" as const,
        operator: "!" as const,
        prefix: true,
        argument: id("x"),
      });
      expect(renderNode(node)).toBe("!x");
    });

    it("renders typeof with space", () => {
      const node: UnaryExpression = makeNode({
        type: "UnaryExpression" as const,
        operator: "typeof" as const,
        prefix: true,
        argument: id("x"),
      });
      expect(renderNode(node)).toBe("typeof x");
    });

    it("renders void operator", () => {
      const node: UnaryExpression = makeNode({
        type: "UnaryExpression" as const,
        operator: "void" as const,
        prefix: true,
        argument: numLit(0),
      });
      expect(renderNode(node)).toBe("void 0");
    });
  });

  describe("update expressions", () => {
    it("renders prefix increment", () => {
      const node: UpdateExpression = makeNode({
        type: "UpdateExpression" as const,
        operator: "++" as const,
        argument: id("i"),
        prefix: true,
      });
      expect(renderNode(node)).toBe("++i");
    });

    it("renders postfix decrement", () => {
      const node: UpdateExpression = makeNode({
        type: "UpdateExpression" as const,
        operator: "--" as const,
        argument: id("i"),
        prefix: false,
      });
      expect(renderNode(node)).toBe("i--");
    });
  });

  describe("assignment expressions", () => {
    it("renders simple assignment", () => {
      const node: AssignmentExpression = makeNode({
        type: "AssignmentExpression" as const,
        operator: "=" as const,
        left: id("x"),
        right: numLit(5),
      });
      expect(renderNode(node)).toBe("x = 5");
    });

    it("renders compound assignment", () => {
      const node: AssignmentExpression = makeNode({
        type: "AssignmentExpression" as const,
        operator: "+=" as const,
        left: id("x"),
        right: numLit(1),
      });
      expect(renderNode(node)).toBe("x += 1");
    });
  });

  describe("conditional expressions", () => {
    it("renders ternary", () => {
      const node: ConditionalExpression = makeNode({
        type: "ConditionalExpression" as const,
        test: id("a"),
        consequent: id("b"),
        alternate: id("c"),
      });
      expect(renderNode(node)).toBe("a ? b : c");
    });
  });

  describe("call expressions", () => {
    it("renders function call", () => {
      const node: CallExpression = makeNode({
        type: "CallExpression" as const,
        callee: id("foo"),
        arguments: [id("a"), id("b")],
        optional: false,
      });
      expect(renderNode(node)).toBe("foo(a, b)");
    });

    it("renders optional call", () => {
      const node: CallExpression = makeNode({
        type: "CallExpression" as const,
        callee: id("foo"),
        arguments: [],
        optional: true,
      });
      expect(renderNode(node)).toBe("foo?.()");
    });
  });

  describe("new expressions", () => {
    it("renders new expression", () => {
      const node: NewExpression = makeNode({
        type: "NewExpression" as const,
        callee: id("Foo"),
        arguments: [numLit(1)],
      });
      expect(renderNode(node)).toBe("new Foo(1)");
    });
  });

  describe("member expressions", () => {
    it("renders dot access", () => {
      const node: MemberExpression = makeNode({
        type: "MemberExpression" as const,
        object: id("obj"),
        property: id("prop"),
        computed: false,
        optional: false,
      });
      expect(renderNode(node)).toBe("obj.prop");
    });

    it("renders computed access", () => {
      const node: MemberExpression = makeNode({
        type: "MemberExpression" as const,
        object: id("arr"),
        property: numLit(0),
        computed: true,
        optional: false,
      });
      expect(renderNode(node)).toBe("arr[0]");
    });

    it("renders optional chaining", () => {
      const node: MemberExpression = makeNode({
        type: "MemberExpression" as const,
        object: id("obj"),
        property: id("prop"),
        computed: false,
        optional: true,
      });
      expect(renderNode(node)).toBe("obj?.prop");
    });
  });

  describe("this and super", () => {
    it("renders this", () => {
      expect(renderNode(makeNode({ type: "ThisExpression" as const }))).toBe(
        "this",
      );
    });

    it("renders super", () => {
      expect(renderNode(makeNode({ type: "Super" as const }))).toBe("super");
    });
  });

  describe("array expressions", () => {
    it("renders array literal", () => {
      const node: ArrayExpression = makeNode({
        type: "ArrayExpression" as const,
        elements: [numLit(1), numLit(2), numLit(3)],
      });
      expect(renderNode(node)).toBe("[1, 2, 3]");
    });

    it("renders empty array", () => {
      const node: ArrayExpression = makeNode({
        type: "ArrayExpression" as const,
        elements: [],
      });
      expect(renderNode(node)).toBe("[]");
    });
  });

  describe("object expressions", () => {
    it("renders empty object", () => {
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [],
      });
      expect(renderNode(node)).toBe("{}");
    });

    it("renders object with properties", () => {
      const prop: Property = makeNode({
        type: "Property" as const,
        key: id("x"),
        value: numLit(1),
        kind: "init" as const,
        method: false,
        shorthand: false,
        computed: false,
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [prop],
      });
      expect(renderNode(node)).toBe("{ x: 1 }");
    });

    it("renders shorthand properties", () => {
      const prop: Property = makeNode({
        type: "Property" as const,
        key: id("x"),
        value: id("x"),
        kind: "init" as const,
        method: false,
        shorthand: true,
        computed: false,
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [prop],
      });
      expect(renderNode(node)).toBe("{ x }");
    });

    it("renders computed properties", () => {
      const prop: Property = makeNode({
        type: "Property" as const,
        key: id("key"),
        value: numLit(1),
        kind: "init" as const,
        method: false,
        shorthand: false,
        computed: true,
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [prop],
      });
      expect(renderNode(node)).toBe("{ [key]: 1 }");
    });

    it("renders spread element", () => {
      const spread: SpreadElement = makeNode({
        type: "SpreadElement" as const,
        argument: id("rest"),
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [spread],
      });
      expect(renderNode(node)).toBe("{ ...rest }");
    });
  });

  describe("function declarations", () => {
    it("renders basic function", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: FunctionDeclaration = makeNode({
        type: "FunctionDeclaration" as const,
        id: id("foo"),
        params: [id("a"), id("b")],
        body,
        generator: false,
        async: false,
      });
      expect(renderNode(node)).toBe("function foo(a, b) {\n}");
    });

    it("renders async generator function", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: FunctionDeclaration = makeNode({
        type: "FunctionDeclaration" as const,
        id: id("gen"),
        params: [],
        body,
        generator: true,
        async: true,
      });
      expect(renderNode(node)).toBe("async function* gen() {\n}");
    });

    it("renders function with return statement", () => {
      const ret: ReturnStatement = makeNode({
        type: "ReturnStatement" as const,
        argument: id("x"),
      });
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [ret],
      });
      const node: FunctionDeclaration = makeNode({
        type: "FunctionDeclaration" as const,
        id: id("f"),
        params: [id("x")],
        body,
        generator: false,
        async: false,
      });
      expect(renderNode(node)).toBe("function f(x) {\n\treturn x;\n}");
    });
  });

  describe("arrow functions", () => {
    it("renders concise arrow function", () => {
      const node: ArrowFunctionExpression = makeNode({
        type: "ArrowFunctionExpression" as const,
        id: null,
        params: [id("x")],
        body: id("x"),
        expression: true,
        generator: false as const,
        async: false,
      });
      expect(renderNode(node)).toBe("x => x");
    });

    it("renders arrow with block body", () => {
      const ret: ReturnStatement = makeNode({
        type: "ReturnStatement" as const,
        argument: id("x"),
      });
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [ret],
      });
      const node: ArrowFunctionExpression = makeNode({
        type: "ArrowFunctionExpression" as const,
        id: null,
        params: [id("x")],
        body,
        expression: false,
        generator: false as const,
        async: false,
      });
      expect(renderNode(node)).toBe("x => {\n\treturn x;\n}");
    });

    it("renders async arrow with multiple params", () => {
      const node: ArrowFunctionExpression = makeNode({
        type: "ArrowFunctionExpression" as const,
        id: null,
        params: [id("a"), id("b")],
        body: id("a"),
        expression: true,
        generator: false as const,
        async: true,
      });
      expect(renderNode(node)).toBe("async (a, b) => a");
    });

    it("renders arrow with no params", () => {
      const node: ArrowFunctionExpression = makeNode({
        type: "ArrowFunctionExpression" as const,
        id: null,
        params: [],
        body: numLit(0),
        expression: true,
        generator: false as const,
        async: false,
      });
      expect(renderNode(node)).toBe("() => 0");
    });
  });

  describe("class declarations", () => {
    it("renders basic class", () => {
      const classBody: ClassBody = makeNode({
        type: "ClassBody" as const,
        body: [],
      });
      const node: ClassDeclaration = makeNode({
        type: "ClassDeclaration" as const,
        id: id("Foo"),
        superClass: null,
        body: classBody,
        decorators: [],
      });
      expect(renderNode(node)).toBe("class Foo {\n}");
    });

    it("renders class with extends", () => {
      const classBody: ClassBody = makeNode({
        type: "ClassBody" as const,
        body: [],
      });
      const node: ClassDeclaration = makeNode({
        type: "ClassDeclaration" as const,
        id: id("Bar"),
        superClass: id("Foo"),
        body: classBody,
        decorators: [],
      });
      expect(renderNode(node)).toBe("class Bar extends Foo {\n}");
    });

    it("renders class with method", () => {
      const methodBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnExpr: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [],
        body: methodBody,
        generator: false,
        async: false,
      });
      const method: MethodDefinition = makeNode({
        type: "MethodDefinition" as const,
        key: id("hello"),
        value: fnExpr,
        kind: "method" as const,
        computed: false,
        static: false,
        decorators: [],
      });
      const classBody: ClassBody = makeNode({
        type: "ClassBody" as const,
        body: [method],
      });
      const node: ClassDeclaration = makeNode({
        type: "ClassDeclaration" as const,
        id: id("Foo"),
        superClass: null,
        body: classBody,
        decorators: [],
      });
      expect(renderNode(node)).toBe("class Foo {\n\thello() {\n\t}\n}");
    });

    it("renders class with static property", () => {
      const propDef: PropertyDefinition = makeNode({
        type: "PropertyDefinition" as const,
        key: id("count"),
        value: numLit(0),
        computed: false,
        static: true,
        decorators: [],
      });
      const classBody: ClassBody = makeNode({
        type: "ClassBody" as const,
        body: [propDef],
      });
      const node: ClassDeclaration = makeNode({
        type: "ClassDeclaration" as const,
        id: id("Counter"),
        superClass: null,
        body: classBody,
        decorators: [],
      });
      expect(renderNode(node)).toBe("class Counter {\n\tstatic count = 0;\n}");
    });
  });

  describe("import statements", () => {
    it("renders named imports", () => {
      const spec: ImportSpecifier = makeNode({
        type: "ImportSpecifier" as const,
        imported: id("foo"),
        local: id("foo"),
      });
      const node: ImportDeclaration = makeNode({
        type: "ImportDeclaration" as const,
        specifiers: [spec],
        source: lit("./mod", "'./mod'"),
      });
      expect(renderNode(node)).toBe("import { foo } from './mod';");
    });

    it("renders renamed imports", () => {
      const spec: ImportSpecifier = makeNode({
        type: "ImportSpecifier" as const,
        imported: id("foo"),
        local: id("bar"),
      });
      const node: ImportDeclaration = makeNode({
        type: "ImportDeclaration" as const,
        specifiers: [spec],
        source: lit("./mod", "'./mod'"),
      });
      expect(renderNode(node)).toBe("import { foo as bar } from './mod';");
    });

    it("renders default import", () => {
      const node: ImportDeclaration = makeNode({
        type: "ImportDeclaration" as const,
        specifiers: [
          makeNode({
            type: "ImportDefaultSpecifier" as const,
            local: id("Mod"),
          }),
        ],
        source: lit("./mod", "'./mod'"),
      });
      expect(renderNode(node)).toBe("import Mod from './mod';");
    });

    it("renders namespace import", () => {
      const node: ImportDeclaration = makeNode({
        type: "ImportDeclaration" as const,
        specifiers: [
          makeNode({
            type: "ImportNamespaceSpecifier" as const,
            local: id("ns"),
          }),
        ],
        source: lit("./mod", "'./mod'"),
      });
      expect(renderNode(node)).toBe("import * as ns from './mod';");
    });

    it("renders side-effect import", () => {
      const node: ImportDeclaration = makeNode({
        type: "ImportDeclaration" as const,
        specifiers: [],
        source: lit("./style.css", "'./style.css'"),
      });
      expect(renderNode(node)).toBe("import './style.css';");
    });
  });

  describe("export statements", () => {
    it("renders named export declaration", () => {
      const decl: VariableDeclaration = makeNode({
        type: "VariableDeclaration" as const,
        declarations: [
          makeNode({
            type: "VariableDeclarator" as const,
            id: id("x"),
            init: numLit(1),
          }),
        ],
        kind: "const" as const,
      });
      const node: ExportNamedDeclaration = makeNode({
        type: "ExportNamedDeclaration" as const,
        declaration: decl,
        specifiers: [],
        source: null,
      });
      expect(renderNode(node)).toBe("export const x = 1;");
    });

    it("renders export specifiers", () => {
      const spec: ExportSpecifier = makeNode({
        type: "ExportSpecifier" as const,
        local: id("foo"),
        exported: id("bar"),
      });
      const node: ExportNamedDeclaration = makeNode({
        type: "ExportNamedDeclaration" as const,
        declaration: null,
        specifiers: [spec],
        source: null,
      });
      expect(renderNode(node)).toBe("export { foo as bar };");
    });

    it("renders export all", () => {
      const node: ExportAllDeclaration = makeNode({
        type: "ExportAllDeclaration" as const,
        source: lit("./mod", "'./mod'"),
        exported: null,
      });
      expect(renderNode(node)).toBe("export * from './mod';");
    });

    it("renders export default", () => {
      const node: ExportDefaultDeclaration = makeNode({
        type: "ExportDefaultDeclaration" as const,
        declaration: id("foo"),
      });
      expect(renderNode(node)).toBe("export default foo;");
    });
  });

  describe("if statements", () => {
    it("renders if without else", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: IfStatement = makeNode({
        type: "IfStatement" as const,
        test: id("x"),
        consequent: body,
        alternate: null,
      });
      expect(renderNode(node)).toBe("if (x) {\n}");
    });

    it("renders if-else", () => {
      const consBlock: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const altBlock: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: IfStatement = makeNode({
        type: "IfStatement" as const,
        test: id("x"),
        consequent: consBlock,
        alternate: altBlock,
      });
      expect(renderNode(node)).toBe("if (x) {\n} else {\n}");
    });
  });

  describe("for statements", () => {
    it("renders basic for loop", () => {
      const init: VariableDeclaration = makeNode({
        type: "VariableDeclaration" as const,
        declarations: [
          makeNode({
            type: "VariableDeclarator" as const,
            id: id("i"),
            init: numLit(0),
          }),
        ],
        kind: "let" as const,
      });
      const test: BinaryExpression = makeNode({
        type: "BinaryExpression" as const,
        operator: "<" as const,
        left: id("i"),
        right: numLit(10),
      });
      const update: UpdateExpression = makeNode({
        type: "UpdateExpression" as const,
        operator: "++" as const,
        argument: id("i"),
        prefix: false,
      });
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: ForStatement = makeNode({
        type: "ForStatement" as const,
        init,
        test,
        update,
        body,
      });
      expect(renderNode(node)).toBe("for (let i = 0; i < 10; i++) {\n}");
    });

    it("renders for-in", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: ForInStatement = makeNode({
        type: "ForInStatement" as const,
        left: makeNode({
          type: "VariableDeclaration" as const,
          declarations: [
            makeNode({
              type: "VariableDeclarator" as const,
              id: id("k"),
              init: null,
            }),
          ],
          kind: "const" as const,
        }),
        right: id("obj"),
        body,
      });
      expect(renderNode(node)).toBe("for (const k in obj) {\n}");
    });

    it("renders for-of", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: ForOfStatement = makeNode({
        type: "ForOfStatement" as const,
        left: makeNode({
          type: "VariableDeclaration" as const,
          declarations: [
            makeNode({
              type: "VariableDeclarator" as const,
              id: id("v"),
              init: null,
            }),
          ],
          kind: "const" as const,
        }),
        right: id("arr"),
        body,
        await: false,
      });
      expect(renderNode(node)).toBe("for (const v of arr) {\n}");
    });

    it("renders for-await-of", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: ForOfStatement = makeNode({
        type: "ForOfStatement" as const,
        left: makeNode({
          type: "VariableDeclaration" as const,
          declarations: [
            makeNode({
              type: "VariableDeclarator" as const,
              id: id("v"),
              init: null,
            }),
          ],
          kind: "const" as const,
        }),
        right: id("stream"),
        body,
        await: true,
      });
      expect(renderNode(node)).toBe("for await (const v of stream) {\n}");
    });
  });

  describe("while statements", () => {
    it("renders while loop", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: WhileStatement = makeNode({
        type: "WhileStatement" as const,
        test: lit(true, "true"),
        body,
      });
      expect(renderNode(node)).toBe("while (true) {\n}");
    });

    it("renders do-while", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: DoWhileStatement = makeNode({
        type: "DoWhileStatement" as const,
        body,
        test: id("cond"),
      });
      expect(renderNode(node)).toBe("do {\n} while (cond);");
    });
  });

  describe("switch statements", () => {
    it("renders switch with cases", () => {
      const case1: SwitchCase = makeNode({
        type: "SwitchCase" as const,
        test: numLit(1),
        consequent: [
          makeNode({ type: "BreakStatement" as const, label: null }),
        ],
      });
      const defaultCase: SwitchCase = makeNode({
        type: "SwitchCase" as const,
        test: null,
        consequent: [
          makeNode({ type: "BreakStatement" as const, label: null }),
        ],
      });
      const node: SwitchStatement = makeNode({
        type: "SwitchStatement" as const,
        discriminant: id("x"),
        cases: [case1, defaultCase],
      });
      const result = renderNode(node);
      expect(result).toContain("switch (x)");
      expect(result).toContain("case 1:");
      expect(result).toContain("break;");
      expect(result).toContain("default:");
    });
  });

  describe("try-catch-finally", () => {
    it("renders try-catch", () => {
      const tryBlock: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const catchBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const handler: CatchClause = makeNode({
        type: "CatchClause" as const,
        param: id("e"),
        body: catchBody,
      });
      const node: TryStatement = makeNode({
        type: "TryStatement" as const,
        block: tryBlock,
        handler,
        finalizer: null,
      });
      expect(renderNode(node)).toBe("try {\n} catch (e) {\n}");
    });

    it("renders try-catch-finally", () => {
      const tryBlock: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const catchBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const handler: CatchClause = makeNode({
        type: "CatchClause" as const,
        param: id("e"),
        body: catchBody,
      });
      const finalizer: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: TryStatement = makeNode({
        type: "TryStatement" as const,
        block: tryBlock,
        handler,
        finalizer,
      });
      expect(renderNode(node)).toBe("try {\n} catch (e) {\n} finally {\n}");
    });
  });

  describe("variable declarations", () => {
    it("renders const declaration", () => {
      const decl: VariableDeclaration = makeNode({
        type: "VariableDeclaration" as const,
        declarations: [
          makeNode({
            type: "VariableDeclarator" as const,
            id: id("x"),
            init: numLit(42),
          }),
        ],
        kind: "const" as const,
      });
      expect(renderNode(decl)).toBe("const x = 42;");
    });

    it("renders multiple declarators", () => {
      const decl: VariableDeclaration = makeNode({
        type: "VariableDeclaration" as const,
        declarations: [
          makeNode({
            type: "VariableDeclarator" as const,
            id: id("a"),
            init: numLit(1),
          }),
          makeNode({
            type: "VariableDeclarator" as const,
            id: id("b"),
            init: numLit(2),
          }),
        ],
        kind: "let" as const,
      });
      expect(renderNode(decl)).toBe("let a = 1, b = 2;");
    });
  });

  describe("template literals", () => {
    it("renders simple template", () => {
      const quasi1: TemplateElement = makeNode({
        type: "TemplateElement" as const,
        tail: false,
        value: { raw: "Hello, ", cooked: "Hello, " },
      });
      const quasi2: TemplateElement = makeNode({
        type: "TemplateElement" as const,
        tail: true,
        value: { raw: "!", cooked: "!" },
      });
      const node: TemplateLiteral = makeNode({
        type: "TemplateLiteral" as const,
        quasis: [quasi1, quasi2],
        expressions: [id("name")],
      });
      expect(renderNode(node)).toBe("`Hello, ${name}!`");
    });
  });

  describe("sequence expressions", () => {
    it("renders comma-separated expressions", () => {
      const node: SequenceExpression = makeNode({
        type: "SequenceExpression" as const,
        expressions: [id("a"), id("b"), id("c")],
      });
      expect(renderNode(node)).toBe("a, b, c");
    });
  });

  describe("yield and await", () => {
    it("renders yield", () => {
      const node: YieldExpression = makeNode({
        type: "YieldExpression" as const,
        argument: id("x"),
        delegate: false,
      });
      expect(renderNode(node)).toBe("yield x");
    });

    it("renders yield*", () => {
      const node: YieldExpression = makeNode({
        type: "YieldExpression" as const,
        argument: id("gen"),
        delegate: true,
      });
      expect(renderNode(node)).toBe("yield* gen");
    });

    it("renders await", () => {
      const node: AwaitExpression = makeNode({
        type: "AwaitExpression" as const,
        argument: id("promise"),
      });
      expect(renderNode(node)).toBe("await promise");
    });
  });

  describe("patterns", () => {
    it("renders object pattern", () => {
      const prop: Property = makeNode({
        type: "Property" as const,
        key: id("a"),
        value: id("a"),
        kind: "init" as const,
        method: false,
        shorthand: true,
        computed: false,
      });
      const node: ObjectPattern = makeNode({
        type: "ObjectPattern" as const,
        properties: [prop],
      });
      expect(renderNode(node)).toBe("{ a }");
    });

    it("renders array pattern", () => {
      const node: ArrayPattern = makeNode({
        type: "ArrayPattern" as const,
        elements: [id("a"), id("b")],
      });
      expect(renderNode(node)).toBe("[a, b]");
    });

    it("renders rest element", () => {
      const node: RestElement = makeNode({
        type: "RestElement" as const,
        argument: id("rest"),
      });
      expect(renderNode(node)).toBe("...rest");
    });

    it("renders assignment pattern", () => {
      const node: AssignmentPattern = makeNode({
        type: "AssignmentPattern" as const,
        left: id("x"),
        right: numLit(0),
      });
      expect(renderNode(node)).toBe("x = 0");
    });
  });

  describe("miscellaneous statements", () => {
    it("renders empty statement", () => {
      const node: EmptyStatement = makeNode({
        type: "EmptyStatement" as const,
      });
      expect(renderNode(node)).toBe(";");
    });

    it("renders debugger statement", () => {
      const node: DebuggerStatement = makeNode({
        type: "DebuggerStatement" as const,
      });
      expect(renderNode(node)).toBe("debugger;");
    });

    it("renders throw statement", () => {
      const node: ThrowStatement = makeNode({
        type: "ThrowStatement" as const,
        argument: makeNode({
          type: "NewExpression" as const,
          callee: id("Error"),
          arguments: [lit("oops")],
        }),
      });
      expect(renderNode(node)).toBe('throw new Error("oops");');
    });

    it("renders labeled statement", () => {
      const body: ExpressionStatement = makeNode({
        type: "ExpressionStatement" as const,
        expression: id("x"),
      });
      const node: LabeledStatement = makeNode({
        type: "LabeledStatement" as const,
        label: id("loop"),
        body,
      });
      expect(renderNode(node)).toBe("loop: x;");
    });

    it("renders break with label", () => {
      const node: BreakStatement = makeNode({
        type: "BreakStatement" as const,
        label: id("loop"),
      });
      expect(renderNode(node)).toBe("break loop;");
    });

    it("renders continue", () => {
      const node: ContinueStatement = makeNode({
        type: "ContinueStatement" as const,
        label: null,
      });
      expect(renderNode(node)).toBe("continue;");
    });

    it("renders return without value", () => {
      const node: ReturnStatement = makeNode({
        type: "ReturnStatement" as const,
        argument: null,
      });
      expect(renderNode(node)).toBe("return;");
    });

    it("renders with statement", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: WithStatement = makeNode({
        type: "WithStatement" as const,
        object: id("obj"),
        body,
      });
      expect(renderNode(node)).toBe("with (obj) {\n}");
    });
  });

  describe("meta property and import expression", () => {
    it("renders meta property", () => {
      const node: MetaProperty = makeNode({
        type: "MetaProperty" as const,
        meta: id("import"),
        property: id("meta"),
      });
      expect(renderNode(node)).toBe("import.meta");
    });

    it("renders dynamic import", () => {
      const node: ImportExpression = makeNode({
        type: "ImportExpression" as const,
        source: lit("./mod", "'./mod'"),
      });
      expect(renderNode(node)).toBe("import('./mod')");
    });
  });

  describe("compact mode", () => {
    it("reduces whitespace in binary expressions", () => {
      const node: BinaryExpression = makeNode({
        type: "BinaryExpression" as const,
        operator: "+" as const,
        left: id("a"),
        right: id("b"),
      });
      expect(renderNode(node, { compact: true })).toBe("a+b");
    });

    it("reduces whitespace in if statements", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: IfStatement = makeNode({
        type: "IfStatement" as const,
        test: id("x"),
        consequent: body,
        alternate: null,
      });
      expect(renderNode(node, { compact: true })).toBe("if(x){}");
    });

    it("reduces whitespace in object literals", () => {
      const prop: Property = makeNode({
        type: "Property" as const,
        key: id("a"),
        value: numLit(1),
        kind: "init" as const,
        method: false,
        shorthand: false,
        computed: false,
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [prop],
      });
      // In compact mode spaces around braces and colons are removed
      expect(renderNode(node, { compact: true })).toBe("{a:1}");
    });
  });

  describe("custom indent string", () => {
    it("uses custom indent for function body", () => {
      const ret: ReturnStatement = makeNode({
        type: "ReturnStatement" as const,
        argument: numLit(1),
      });
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [ret],
      });
      const node: FunctionDeclaration = makeNode({
        type: "FunctionDeclaration" as const,
        id: id("f"),
        params: [],
        body,
        generator: false,
        async: false,
      });
      expect(renderNode(node, { indent: "  " })).toBe(
        "function f() {\n  return 1;\n}",
      );
    });
  });

  describe("program node", () => {
    it("renders program with multiple statements", () => {
      const stmt1: VariableDeclaration = makeNode({
        type: "VariableDeclaration" as const,
        declarations: [
          makeNode({
            type: "VariableDeclarator" as const,
            id: id("x"),
            init: numLit(1),
          }),
        ],
        kind: "const" as const,
      });
      const stmt2: ExpressionStatement = makeNode({
        type: "ExpressionStatement" as const,
        expression: makeNode({
          type: "CallExpression" as const,
          callee: id("foo"),
          arguments: [id("x")],
          optional: false,
        }),
      });
      const program: Program = makeNode({
        type: "Program" as const,
        body: [stmt1, stmt2],
        sourceType: "module" as const,
      });
      expect(renderNode(program)).toBe("const x = 1;\nfoo(x);");
    });
  });

  describe("static block", () => {
    it("renders static block in class", () => {
      const stmt: ExpressionStatement = makeNode({
        type: "ExpressionStatement" as const,
        expression: makeNode({
          type: "AssignmentExpression" as const,
          operator: "=" as const,
          left: id("x"),
          right: numLit(1),
        }),
      });
      const sb: StaticBlock = makeNode({
        type: "StaticBlock" as const,
        body: [stmt],
      });
      const result = renderNode(sb);
      expect(result).toContain("static");
      expect(result).toContain("x = 1;");
    });
  });

  describe("function expression", () => {
    it("renders named function expression", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: id("fn"),
        params: [id("x")],
        body,
        generator: false,
        async: false,
      });
      expect(renderNode(node)).toBe("function fn(x) {\n}");
    });
  });

  describe("edge cases", () => {
    it("handles unknown node type gracefully", () => {
      const node = makeNode({ type: "UnknownNodeType" });
      expect(renderNode(node)).toBe("");
    });

    it("renders export all with exported name", () => {
      const node: ExportAllDeclaration = makeNode({
        type: "ExportAllDeclaration" as const,
        source: lit("./mod", "'./mod'"),
        exported: id("ns"),
      });
      expect(renderNode(node)).toBe("export * as ns from './mod';");
    });

    it("renders export specifiers with same name", () => {
      const spec: ExportSpecifier = makeNode({
        type: "ExportSpecifier" as const,
        local: id("foo"),
        exported: id("foo"),
      });
      const node: ExportNamedDeclaration = makeNode({
        type: "ExportNamedDeclaration" as const,
        declaration: null,
        specifiers: [spec],
        source: null,
      });
      expect(renderNode(node)).toBe("export { foo };");
    });

    it("renders export from source", () => {
      const spec: ExportSpecifier = makeNode({
        type: "ExportSpecifier" as const,
        local: id("foo"),
        exported: id("bar"),
      });
      const node: ExportNamedDeclaration = makeNode({
        type: "ExportNamedDeclaration" as const,
        declaration: null,
        specifiers: [spec],
        source: lit("./mod", "'./mod'"),
      });
      expect(renderNode(node)).toBe("export { foo as bar } from './mod';");
    });

    it("renders method with computed key", () => {
      const methodBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnExpr: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [],
        body: methodBody,
        generator: false,
        async: false,
      });
      const method: MethodDefinition = makeNode({
        type: "MethodDefinition" as const,
        key: id("sym"),
        value: fnExpr,
        kind: "method" as const,
        computed: true,
        static: false,
        decorators: [],
      });
      expect(renderNode(method)).toBe("[sym]() {\n}");
    });

    it("renders static async generator method", () => {
      const methodBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnExpr: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [id("x")],
        body: methodBody,
        generator: true,
        async: true,
      });
      const method: MethodDefinition = makeNode({
        type: "MethodDefinition" as const,
        key: id("gen"),
        value: fnExpr,
        kind: "method" as const,
        computed: false,
        static: true,
        decorators: [],
      });
      expect(renderNode(method)).toBe("static async *gen(x) {\n}");
    });

    it("renders getter method", () => {
      const methodBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnExpr: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [],
        body: methodBody,
        generator: false,
        async: false,
      });
      const method: MethodDefinition = makeNode({
        type: "MethodDefinition" as const,
        key: id("value"),
        value: fnExpr,
        kind: "get" as const,
        computed: false,
        static: false,
        decorators: [],
      });
      expect(renderNode(method)).toBe("get value() {\n}");
    });

    it("renders setter method", () => {
      const methodBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnExpr: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [id("v")],
        body: methodBody,
        generator: false,
        async: false,
      });
      const method: MethodDefinition = makeNode({
        type: "MethodDefinition" as const,
        key: id("value"),
        value: fnExpr,
        kind: "set" as const,
        computed: false,
        static: false,
        decorators: [],
      });
      expect(renderNode(method)).toBe("set value(v) {\n}");
    });

    it("renders object getter property", () => {
      const fnBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnVal: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [],
        body: fnBody,
        generator: false,
        async: false,
      });
      const prop: Property = makeNode({
        type: "Property" as const,
        key: id("x"),
        value: fnVal,
        kind: "get" as const,
        method: false,
        shorthand: false,
        computed: false,
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [prop],
      });
      expect(renderNode(node)).toBe("{ get x() {\n} }");
    });

    it("renders object method property", () => {
      const fnBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnVal: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [],
        body: fnBody,
        generator: false,
        async: false,
      });
      const prop: Property = makeNode({
        type: "Property" as const,
        key: id("foo"),
        value: fnVal,
        kind: "init" as const,
        method: true,
        shorthand: false,
        computed: false,
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [prop],
      });
      expect(renderNode(node)).toBe("{ foo() {\n} }");
    });

    it("renders object method with computed key", () => {
      const fnBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnVal: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [],
        body: fnBody,
        generator: false,
        async: false,
      });
      const prop: Property = makeNode({
        type: "Property" as const,
        key: id("sym"),
        value: fnVal,
        kind: "init" as const,
        method: true,
        shorthand: false,
        computed: true,
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [prop],
      });
      expect(renderNode(node)).toBe("{ [sym]() {\n} }");
    });

    it("renders computed getter in object", () => {
      const fnBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnVal: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [],
        body: fnBody,
        generator: false,
        async: false,
      });
      const prop: Property = makeNode({
        type: "Property" as const,
        key: id("k"),
        value: fnVal,
        kind: "get" as const,
        method: false,
        shorthand: false,
        computed: true,
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [prop],
      });
      expect(renderNode(node)).toBe("{ get [k]() {\n} }");
    });

    it("renders tagged template expression", () => {
      const quasi1: TemplateElement = makeNode({
        type: "TemplateElement" as const,
        tail: false,
        value: { raw: "hello ", cooked: "hello " },
      });
      const quasi2: TemplateElement = makeNode({
        type: "TemplateElement" as const,
        tail: true,
        value: { raw: "", cooked: "" },
      });
      const tmpl: TemplateLiteral = makeNode({
        type: "TemplateLiteral" as const,
        quasis: [quasi1, quasi2],
        expressions: [id("x")],
      });
      const node = makeNode({
        type: "TaggedTemplateExpression" as const,
        tag: id("html"),
        quasi: tmpl,
      });
      expect(renderNode(node)).toBe("html`hello ${x}`");
    });

    it("renders chain expression", () => {
      const member: MemberExpression = makeNode({
        type: "MemberExpression" as const,
        object: id("obj"),
        property: id("prop"),
        computed: false,
        optional: true,
      });
      const node = makeNode({
        type: "ChainExpression" as const,
        expression: member,
      });
      expect(renderNode(node)).toBe("obj?.prop");
    });

    it("renders for-in with pattern left", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: ForInStatement = makeNode({
        type: "ForInStatement" as const,
        left: id("k"),
        right: id("obj"),
        body,
      });
      expect(renderNode(node)).toBe("for (k in obj) {\n}");
    });

    it("renders for-of with pattern left", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: ForOfStatement = makeNode({
        type: "ForOfStatement" as const,
        left: id("v"),
        right: id("arr"),
        body,
        await: false,
      });
      expect(renderNode(node)).toBe("for (v of arr) {\n}");
    });

    it("renders computed property definition", () => {
      const propDef: PropertyDefinition = makeNode({
        type: "PropertyDefinition" as const,
        key: id("sym"),
        value: numLit(0),
        computed: true,
        static: false,
        decorators: [],
      });
      expect(renderNode(propDef)).toBe("[sym] = 0;");
    });

    it("renders property definition without value", () => {
      const propDef: PropertyDefinition = makeNode({
        type: "PropertyDefinition" as const,
        key: id("x"),
        value: null,
        computed: false,
        static: false,
        decorators: [],
      });
      expect(renderNode(propDef)).toBe("x;");
    });

    it("renders catch without param", () => {
      const tryBlock: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const catchBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const handler: CatchClause = makeNode({
        type: "CatchClause" as const,
        param: null,
        body: catchBody,
      });
      const node: TryStatement = makeNode({
        type: "TryStatement" as const,
        block: tryBlock,
        handler,
        finalizer: null,
      });
      expect(renderNode(node)).toBe("try {\n} catch {\n}");
    });

    it("renders yield without argument", () => {
      const node: YieldExpression = makeNode({
        type: "YieldExpression" as const,
        argument: null,
        delegate: false,
      });
      expect(renderNode(node)).toBe("yield");
    });

    it("renders optional computed member", () => {
      const node: MemberExpression = makeNode({
        type: "MemberExpression" as const,
        object: id("arr"),
        property: numLit(0),
        computed: true,
        optional: true,
      });
      expect(renderNode(node)).toBe("arr?.[0]");
    });

    it("renders import with default and named specifiers", () => {
      const defaultSpec = makeNode({
        type: "ImportDefaultSpecifier" as const,
        local: id("React"),
      });
      const namedSpec: ImportSpecifier = makeNode({
        type: "ImportSpecifier" as const,
        imported: id("useState"),
        local: id("useState"),
      });
      const node: ImportDeclaration = makeNode({
        type: "ImportDeclaration" as const,
        specifiers: [defaultSpec, namedSpec],
        source: lit("react", "'react'"),
      });
      expect(renderNode(node)).toBe("import React, { useState } from 'react';");
    });

    it("renders for statement without init/test/update", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: ForStatement = makeNode({
        type: "ForStatement" as const,
        init: null,
        test: null,
        update: null,
        body,
      });
      expect(renderNode(node)).toBe("for (; ; ) {\n}");
    });

    it("renders anonymous function expression", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [],
        body,
        generator: false,
        async: false,
      });
      expect(renderNode(node)).toBe("function() {\n}");
    });

    it("renders class expression without id", () => {
      const classBody: ClassBody = makeNode({
        type: "ClassBody" as const,
        body: [],
      });
      const node = makeNode({
        type: "ClassExpression" as const,
        id: null,
        superClass: null,
        body: classBody,
        decorators: [],
      });
      expect(renderNode(node)).toBe("class {\n}");
    });

    it("renders anonymous function declaration", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: FunctionDeclaration = makeNode({
        type: "FunctionDeclaration" as const,
        id: null,
        params: [],
        body,
        generator: false,
        async: false,
      });
      expect(renderNode(node)).toBe("function() {\n}");
    });

    it("renders export default function declaration", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnDecl: FunctionDeclaration = makeNode({
        type: "FunctionDeclaration" as const,
        id: id("foo"),
        params: [],
        body,
        generator: false,
        async: false,
      });
      const node: ExportDefaultDeclaration = makeNode({
        type: "ExportDefaultDeclaration" as const,
        declaration: fnDecl,
      });
      expect(renderNode(node)).toBe("export default function foo() {\n}");
    });

    it("renders method with params", () => {
      const methodBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnExpr: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [id("a"), id("b")],
        body: methodBody,
        generator: false,
        async: false,
      });
      const method: MethodDefinition = makeNode({
        type: "MethodDefinition" as const,
        key: id("add"),
        value: fnExpr,
        kind: "method" as const,
        computed: false,
        static: false,
        decorators: [],
      });
      expect(renderNode(method)).toBe("add(a, b) {\n}");
    });

    it("renders for-in VariableDeclaration with multiple declarators", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: ForInStatement = makeNode({
        type: "ForInStatement" as const,
        left: makeNode({
          type: "VariableDeclaration" as const,
          declarations: [
            makeNode({
              type: "VariableDeclarator" as const,
              id: id("k"),
              init: null,
            }),
          ],
          kind: "const" as const,
        }),
        right: id("obj"),
        body,
      });
      expect(renderNode(node)).toBe("for (const k in obj) {\n}");
    });

    it("renders sparse array", () => {
      const node: ArrayExpression = makeNode({
        type: "ArrayExpression" as const,
        elements: [numLit(1), null, numLit(3)],
      });
      expect(renderNode(node)).toBe("[1, , 3]");
    });

    it("renders continue with label", () => {
      const node: ContinueStatement = makeNode({
        type: "ContinueStatement" as const,
        label: id("outer"),
      });
      expect(renderNode(node)).toBe("continue outer;");
    });

    it("renders for-init with expression", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const init: AssignmentExpression = makeNode({
        type: "AssignmentExpression" as const,
        operator: "=" as const,
        left: id("i"),
        right: numLit(0),
      });
      const node: ForStatement = makeNode({
        type: "ForStatement" as const,
        init,
        test: null,
        update: null,
        body,
      });
      expect(renderNode(node)).toBe("for (i = 0; ; ) {\n}");
    });

    it("renders for-init VariableDeclaration with multiple declarators", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const varDecl: VariableDeclaration = makeNode({
        type: "VariableDeclaration" as const,
        declarations: [
          makeNode({
            type: "VariableDeclarator" as const,
            id: id("i"),
            init: numLit(0),
          }),
          makeNode({
            type: "VariableDeclarator" as const,
            id: id("j"),
            init: numLit(0),
          }),
        ],
        kind: "let" as const,
      });
      const node: ForStatement = makeNode({
        type: "ForStatement" as const,
        init: varDecl,
        test: null,
        update: null,
        body,
      });
      expect(renderNode(node)).toBe("for (let i = 0, j = 0; ; ) {\n}");
    });

    it("renders literal string without raw field", () => {
      const node: Literal = makeNode({
        type: "Literal" as const,
        value: "hello",
      });
      expect(renderNode(node)).toBe('"hello"');
    });

    it("renders literal null without raw field", () => {
      const node: Literal = makeNode({
        type: "Literal" as const,
        value: null,
      });
      expect(renderNode(node)).toBe("null");
    });

    it("renders literal number without raw field", () => {
      const node: Literal = makeNode({
        type: "Literal" as const,
        value: 3.14,
      });
      expect(renderNode(node)).toBe("3.14");
    });

    it("renders postfix unary (non-prefix)", () => {
      const node: UnaryExpression = makeNode({
        type: "UnaryExpression" as const,
        operator: "-" as const,
        prefix: false,
        argument: id("x"),
      });
      expect(renderNode(node)).toBe("x-");
    });

    it("renders new expression with multiple args", () => {
      const node: NewExpression = makeNode({
        type: "NewExpression" as const,
        callee: id("Map"),
        arguments: [id("a"), id("b")],
      });
      expect(renderNode(node)).toBe("new Map(a, b)");
    });

    it("renders object pattern with multiple properties", () => {
      const prop1: Property = makeNode({
        type: "Property" as const,
        key: id("a"),
        value: id("a"),
        kind: "init" as const,
        method: false,
        shorthand: true,
        computed: false,
      });
      const prop2: Property = makeNode({
        type: "Property" as const,
        key: id("b"),
        value: id("b"),
        kind: "init" as const,
        method: false,
        shorthand: true,
        computed: false,
      });
      const node: ObjectPattern = makeNode({
        type: "ObjectPattern" as const,
        properties: [prop1, prop2],
      });
      expect(renderNode(node)).toBe("{ a, b }");
    });

    it("renders object with multiple properties", () => {
      const prop1: Property = makeNode({
        type: "Property" as const,
        key: id("a"),
        value: numLit(1),
        kind: "init" as const,
        method: false,
        shorthand: false,
        computed: false,
      });
      const prop2: Property = makeNode({
        type: "Property" as const,
        key: id("b"),
        value: numLit(2),
        kind: "init" as const,
        method: false,
        shorthand: false,
        computed: false,
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [prop1, prop2],
      });
      expect(renderNode(node)).toBe("{ a: 1, b: 2 }");
    });

    it("renders getter with params in object", () => {
      const fnBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnVal: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [id("a"), id("b")],
        body: fnBody,
        generator: false,
        async: false,
      });
      const prop: Property = makeNode({
        type: "Property" as const,
        key: id("x"),
        value: fnVal,
        kind: "set" as const,
        method: false,
        shorthand: false,
        computed: false,
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [prop],
      });
      expect(renderNode(node)).toBe("{ set x(a, b) {\n} }");
    });

    it("renders method with multiple params in object", () => {
      const fnBody: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const fnVal: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [id("a"), id("b")],
        body: fnBody,
        generator: false,
        async: false,
      });
      const prop: Property = makeNode({
        type: "Property" as const,
        key: id("foo"),
        value: fnVal,
        kind: "init" as const,
        method: true,
        shorthand: false,
        computed: false,
      });
      const node: ObjectExpression = makeNode({
        type: "ObjectExpression" as const,
        properties: [prop],
      });
      expect(renderNode(node)).toBe("{ foo(a, b) {\n} }");
    });

    it("renders function expression with multiple params", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [id("a"), id("b")],
        body,
        generator: false,
        async: false,
      });
      expect(renderNode(node)).toBe("function(a, b) {\n}");
    });

    it("renders export with multiple specifiers", () => {
      const spec1: ExportSpecifier = makeNode({
        type: "ExportSpecifier" as const,
        local: id("a"),
        exported: id("a"),
      });
      const spec2: ExportSpecifier = makeNode({
        type: "ExportSpecifier" as const,
        local: id("b"),
        exported: id("c"),
      });
      const node: ExportNamedDeclaration = makeNode({
        type: "ExportNamedDeclaration" as const,
        declaration: null,
        specifiers: [spec1, spec2],
        source: null,
      });
      expect(renderNode(node)).toBe("export { a, b as c };");
    });

    it("renders export specifier with literal imported", () => {
      const spec: ExportSpecifier = makeNode({
        type: "ExportSpecifier" as const,
        local: makeNode({
          type: "Literal" as const,
          value: "default",
          raw: '"default"',
        }),
        exported: id("def"),
      });
      const node: ExportNamedDeclaration = makeNode({
        type: "ExportNamedDeclaration" as const,
        declaration: null,
        specifiers: [spec],
        source: lit("./mod", "'./mod'"),
      });
      expect(renderNode(node)).toBe(
        "export { \"default\" as def } from './mod';",
      );
    });

    it("renders export all with literal exported name", () => {
      const node: ExportAllDeclaration = makeNode({
        type: "ExportAllDeclaration" as const,
        source: lit("./mod", "'./mod'"),
        exported: makeNode({
          type: "Literal" as const,
          value: "default",
          raw: '"default"',
        }),
      });
      expect(renderNode(node)).toBe("export * as \"default\" from './mod';");
    });

    it("renders import with literal specifier", () => {
      const spec: ImportSpecifier = makeNode({
        type: "ImportSpecifier" as const,
        imported: makeNode({
          type: "Literal" as const,
          value: "foo-bar",
          raw: '"foo-bar"',
        }),
        local: id("fooBar"),
      });
      const node: ImportDeclaration = makeNode({
        type: "ImportDeclaration" as const,
        specifiers: [spec],
        source: lit("./mod", "'./mod'"),
      });
      expect(renderNode(node)).toBe(
        "import { \"foo-bar\" as fooBar } from './mod';",
      );
    });

    it("renders import specifier with literal imported without raw", () => {
      const spec: ImportSpecifier = makeNode({
        type: "ImportSpecifier" as const,
        imported: makeNode({
          type: "Literal" as const,
          value: "foo",
        }),
        local: id("foo"),
      });
      const node: ImportDeclaration = makeNode({
        type: "ImportDeclaration" as const,
        specifiers: [spec],
        source: lit("./mod", "'./mod'"),
      });
      expect(renderNode(node)).toBe("import { foo } from './mod';");
    });

    it("renders export specifier with literal without raw", () => {
      const spec: ExportSpecifier = makeNode({
        type: "ExportSpecifier" as const,
        local: makeNode({
          type: "Literal" as const,
          value: "x",
        }),
        exported: makeNode({
          type: "Literal" as const,
          value: "y",
        }),
      });
      const node: ExportNamedDeclaration = makeNode({
        type: "ExportNamedDeclaration" as const,
        declaration: null,
        specifiers: [spec],
        source: null,
      });
      expect(renderNode(node)).toBe("export { x as y };");
    });

    it("renders export all with literal exported without raw", () => {
      const node: ExportAllDeclaration = makeNode({
        type: "ExportAllDeclaration" as const,
        source: lit("./mod", "'./mod'"),
        exported: makeNode({
          type: "Literal" as const,
          value: "ns",
        }),
      });
      expect(renderNode(node)).toBe("export * as ns from './mod';");
    });

    it("renders generator function expression", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [],
        body,
        generator: true,
        async: false,
      });
      expect(renderNode(node)).toBe("function*() {\n}");
    });

    it("renders async function expression", () => {
      const body: BlockStatement = makeNode({
        type: "BlockStatement" as const,
        body: [],
      });
      const node: FunctionExpression = makeNode({
        type: "FunctionExpression" as const,
        id: null,
        params: [],
        body,
        generator: false,
        async: true,
      });
      expect(renderNode(node)).toBe("async function() {\n}");
    });

    it("handles deeply nested expressions without stack overflow", () => {
      // Build a chain: a + a + a + ... (50 levels deep)
      let current: BinaryExpression = makeNode({
        type: "BinaryExpression" as const,
        operator: "+" as const,
        left: id("a"),
        right: id("a"),
      });
      for (let i = 0; i < 48; i++) {
        current = makeNode({
          type: "BinaryExpression" as const,
          operator: "+" as const,
          left: current,
          right: id("a"),
        });
      }
      const result = renderNode(current);
      expect(result).toContain("a + a");
      // 50 'a's joined by ' + '
      const parts = result.split(" + ");
      expect(parts.length).toBe(50);
    });
  });
});
