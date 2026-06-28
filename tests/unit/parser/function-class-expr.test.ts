/**
 * Unit tests for function expression, arrow function, and class expression parsing.
 *
 * Covers:
 * - Function expressions (anonymous, named, generator, async, async generator)
 * - Arrow functions (concise body, block body, single param, multi param, rest, defaults)
 * - Async arrow functions
 * - Class expressions (anonymous, named, extends, methods, fields)
 * - Error cases and edge cases
 *
 * @module tests/unit/parser/function-class-expr
 */

import { describe, it, expect } from "bun:test";
import { parse } from "../../../src/parser/parser.js";
import type * as AST from "../../../src/ast/types.js";

/**
 * Helper to parse an expression from an expression statement.
 */
const parseExpr = (source: string): AST.Expression => {
  const program = parse(source, { sourceType: "module" });
  expect(program.body.length).toBeGreaterThan(0);
  const stmt = program.body[0];
  expect(stmt.type).toBe("ExpressionStatement");
  return (stmt as AST.ExpressionStatement).expression;
};

describe("Function Expression Parsing", () => {
  describe("Anonymous function expressions", () => {
    it("should parse anonymous function expression", () => {
      const expr = parseExpr("(function() {});");
      expect(expr.type).toBe("FunctionExpression");
      const fn = expr as AST.FunctionExpression;
      expect(fn.id).toBeNull();
      expect(fn.params).toHaveLength(0);
      expect(fn.generator).toBe(false);
      expect(fn.async).toBe(false);
      expect(fn.body.type).toBe("BlockStatement");
    });

    it("should parse anonymous function with parameters", () => {
      const expr = parseExpr("(function(a, b) {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.id).toBeNull();
      expect(fn.params).toHaveLength(2);
      expect((fn.params[0] as AST.Identifier).name).toBe("a");
      expect((fn.params[1] as AST.Identifier).name).toBe("b");
    });

    it("should parse anonymous function with default parameters", () => {
      const expr = parseExpr("(function(x, y = 1) {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.params).toHaveLength(2);
      expect((fn.params[0] as AST.Identifier).name).toBe("x");
      const defParam = fn.params[1] as AST.AssignmentPattern;
      expect(defParam.type).toBe("AssignmentPattern");
      expect((defParam.left as AST.Identifier).name).toBe("y");
      expect((defParam.right as AST.Literal).value).toBe(1);
    });

    it("should parse anonymous function with rest parameter", () => {
      const expr = parseExpr("(function(a, ...rest) {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.params).toHaveLength(2);
      expect((fn.params[0] as AST.Identifier).name).toBe("a");
      const restParam = fn.params[1] as AST.RestElement;
      expect(restParam.type).toBe("RestElement");
      expect((restParam.argument as AST.Identifier).name).toBe("rest");
    });
  });

  describe("Named function expressions", () => {
    it("should parse named function expression", () => {
      const expr = parseExpr("(function foo() {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.id).not.toBeNull();
      expect(fn.id!.name).toBe("foo");
      expect(fn.params).toHaveLength(0);
      expect(fn.generator).toBe(false);
      expect(fn.async).toBe(false);
    });

    it("should parse named function with parameters", () => {
      const expr = parseExpr("(function add(a, b) {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.id!.name).toBe("add");
      expect(fn.params).toHaveLength(2);
    });
  });

  describe("Generator function expressions", () => {
    it("should parse anonymous generator function expression", () => {
      const expr = parseExpr("(function*() {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.id).toBeNull();
      expect(fn.generator).toBe(true);
      expect(fn.async).toBe(false);
    });

    it("should parse named generator function expression", () => {
      const expr = parseExpr("(function* gen() {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.id!.name).toBe("gen");
      expect(fn.generator).toBe(true);
    });
  });

  describe("Async function expressions", () => {
    it("should parse anonymous async function expression", () => {
      const expr = parseExpr("(async function() {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.id).toBeNull();
      expect(fn.async).toBe(true);
      expect(fn.generator).toBe(false);
    });

    it("should parse named async function expression", () => {
      const expr = parseExpr("(async function fetchData() {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.id!.name).toBe("fetchData");
      expect(fn.async).toBe(true);
    });

    it("should parse async generator function expression", () => {
      const expr = parseExpr("(async function*() {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.id).toBeNull();
      expect(fn.async).toBe(true);
      expect(fn.generator).toBe(true);
    });

    it("should parse named async generator function expression", () => {
      const expr = parseExpr("(async function* gen() {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.id!.name).toBe("gen");
      expect(fn.async).toBe(true);
      expect(fn.generator).toBe(true);
    });
  });

  describe("Function expression bodies", () => {
    it("should parse function with return statement", () => {
      const expr = parseExpr("(function() { return 42; });");
      const fn = expr as AST.FunctionExpression;
      expect(fn.body.body).toHaveLength(1);
      expect(fn.body.body[0].type).toBe("ReturnStatement");
      const ret = fn.body.body[0] as AST.ReturnStatement;
      expect(ret.argument).not.toBeNull();
      expect((ret.argument as AST.Literal).value).toBe(42);
    });

    it("should parse function with empty return", () => {
      const expr = parseExpr("(function() { return; });");
      const fn = expr as AST.FunctionExpression;
      const ret = fn.body.body[0] as AST.ReturnStatement;
      expect(ret.argument).toBeNull();
    });

    it("should parse function with variable declaration", () => {
      const expr = parseExpr("(function() { const x = 1; });");
      const fn = expr as AST.FunctionExpression;
      expect(fn.body.body).toHaveLength(1);
      expect(fn.body.body[0].type).toBe("VariableDeclaration");
    });
  });

  describe("Function expression position tracking", () => {
    it("should have correct start and end positions", () => {
      const expr = parseExpr("(function foo() {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.start).toBeGreaterThanOrEqual(0);
      expect(fn.end).toBeGreaterThan(fn.start);
    });

    it("should have correct id positions", () => {
      const expr = parseExpr("(function bar() {});");
      const fn = expr as AST.FunctionExpression;
      expect(fn.id!.start).toBeGreaterThan(0);
      expect(fn.id!.end).toBeGreaterThan(fn.id!.start);
    });
  });
});

describe("Arrow Function Parsing", () => {
  describe("Concise body (expression)", () => {
    it("should parse () => expr", () => {
      const expr = parseExpr("(() => 42);");
      expect(expr.type).toBe("ArrowFunctionExpression");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.params).toHaveLength(0);
      expect(arrow.expression).toBe(true);
      expect(arrow.async).toBe(false);
      expect(arrow.generator).toBe(false);
      expect(arrow.id).toBeNull();
      expect((arrow.body as AST.Literal).value).toBe(42);
    });

    it("should parse x => expr", () => {
      const expr = parseExpr("x => 42;");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.params).toHaveLength(1);
      expect((arrow.params[0] as AST.Identifier).name).toBe("x");
      expect(arrow.expression).toBe(true);
      expect((arrow.body as AST.Literal).value).toBe(42);
    });

    it("should parse (x) => expr", () => {
      const expr = parseExpr("((x) => 42);");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.params).toHaveLength(1);
      expect((arrow.params[0] as AST.Identifier).name).toBe("x");
      expect(arrow.expression).toBe(true);
    });

    it("should parse (x, y) => expr", () => {
      const expr = parseExpr("((x, y) => x);");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.params).toHaveLength(2);
      expect((arrow.params[0] as AST.Identifier).name).toBe("x");
      expect((arrow.params[1] as AST.Identifier).name).toBe("y");
      expect(arrow.expression).toBe(true);
    });

    it("should parse (x = 1) => expr", () => {
      const expr = parseExpr("((x = 1) => x);");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.params).toHaveLength(1);
      const param = arrow.params[0] as AST.AssignmentPattern;
      expect(param.type).toBe("AssignmentPattern");
      expect((param.left as AST.Identifier).name).toBe("x");
      expect((param.right as AST.Literal).value).toBe(1);
    });

    it("should parse (...args) => expr", () => {
      const expr = parseExpr("((...args) => args);");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.params).toHaveLength(1);
      const rest = arrow.params[0] as AST.RestElement;
      expect(rest.type).toBe("RestElement");
      expect((rest.argument as AST.Identifier).name).toBe("args");
    });

    it("should parse (a, b, ...rest) => expr", () => {
      const expr = parseExpr("((a, b, ...rest) => rest);");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.params).toHaveLength(3);
      expect((arrow.params[0] as AST.Identifier).name).toBe("a");
      expect((arrow.params[1] as AST.Identifier).name).toBe("b");
      const rest = arrow.params[2] as AST.RestElement;
      expect(rest.type).toBe("RestElement");
    });
  });

  describe("Block body", () => {
    it("should parse () => { return 1; }", () => {
      const expr = parseExpr("(() => { return 1; });");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.expression).toBe(false);
      expect((arrow.body as AST.BlockStatement).type).toBe("BlockStatement");
      const body = arrow.body as AST.BlockStatement;
      expect(body.body).toHaveLength(1);
      expect(body.body[0].type).toBe("ReturnStatement");
    });

    it("should parse x => { return x; }", () => {
      const expr = parseExpr("x => { return x; };");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.params).toHaveLength(1);
      expect(arrow.expression).toBe(false);
      const body = arrow.body as AST.BlockStatement;
      expect(body.body).toHaveLength(1);
    });

    it("should parse arrow with empty block body", () => {
      const expr = parseExpr("(() => {});");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.expression).toBe(false);
      const body = arrow.body as AST.BlockStatement;
      expect(body.body).toHaveLength(0);
    });

    it("should parse arrow with multiple statements in block", () => {
      const expr = parseExpr("((x) => { const y = x; return y; });");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.expression).toBe(false);
      const body = arrow.body as AST.BlockStatement;
      expect(body.body).toHaveLength(2);
      expect(body.body[0].type).toBe("VariableDeclaration");
      expect(body.body[1].type).toBe("ReturnStatement");
    });
  });

  describe("Async arrow functions", () => {
    it("should parse async () => expr", () => {
      const expr = parseExpr("(async () => 42);");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.async).toBe(true);
      expect(arrow.params).toHaveLength(0);
      expect(arrow.expression).toBe(true);
      expect((arrow.body as AST.Literal).value).toBe(42);
    });

    it("should parse async x => expr", () => {
      const expr = parseExpr("async x => x;");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.async).toBe(true);
      expect(arrow.params).toHaveLength(1);
      expect((arrow.params[0] as AST.Identifier).name).toBe("x");
    });

    it("should parse async (x, y) => expr", () => {
      const expr = parseExpr("(async (x, y) => x);");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.async).toBe(true);
      expect(arrow.params).toHaveLength(2);
    });

    it("should parse async arrow with block body", () => {
      const expr = parseExpr("(async () => { return 1; });");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.async).toBe(true);
      expect(arrow.expression).toBe(false);
      const body = arrow.body as AST.BlockStatement;
      expect(body.body).toHaveLength(1);
    });

    it("should parse async arrow with default param", () => {
      const expr = parseExpr("(async (x = 5) => x);");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.async).toBe(true);
      const param = arrow.params[0] as AST.AssignmentPattern;
      expect(param.type).toBe("AssignmentPattern");
      expect((param.right as AST.Literal).value).toBe(5);
    });

    it("should parse async arrow with rest param", () => {
      const expr = parseExpr("(async (...args) => args);");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.async).toBe(true);
      const rest = arrow.params[0] as AST.RestElement;
      expect(rest.type).toBe("RestElement");
    });
  });

  describe("Arrow function position tracking", () => {
    it("should have correct start and end for concise body", () => {
      const expr = parseExpr("x => 42;");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.start).toBe(0);
      expect(arrow.end).toBeGreaterThan(arrow.start);
    });

    it("should have correct start and end for parenthesized params", () => {
      const expr = parseExpr("((x) => 42);");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.start).toBeGreaterThanOrEqual(0);
      expect(arrow.end).toBeGreaterThan(arrow.start);
    });
  });

  describe("Arrow function edge cases", () => {
    it("should not parse identifier alone as arrow", () => {
      const expr = parseExpr("x;");
      expect(expr.type).toBe("Identifier");
    });

    it("should distinguish parenthesized expr from arrow", () => {
      const expr = parseExpr("(x + 1);");
      expect(expr.type).toBe("BinaryExpression");
    });

    it("should parse arrow returning arrow (nested)", () => {
      const expr = parseExpr("x => y => x;");
      const outer = expr as AST.ArrowFunctionExpression;
      expect(outer.type).toBe("ArrowFunctionExpression");
      expect(outer.expression).toBe(true);
      const inner = outer.body as AST.ArrowFunctionExpression;
      expect(inner.type).toBe("ArrowFunctionExpression");
      expect((inner.params[0] as AST.Identifier).name).toBe("y");
    });

    it("should parse arrow as generator is always false", () => {
      const expr = parseExpr("(() => 1);");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.generator).toBe(false);
    });

    it("should parse arrow with id always null", () => {
      const expr = parseExpr("x => x;");
      const arrow = expr as AST.ArrowFunctionExpression;
      expect(arrow.id).toBeNull();
    });
  });
});

describe("Class Expression Parsing", () => {
  describe("Anonymous class expressions", () => {
    it("should parse empty anonymous class expression", () => {
      const expr = parseExpr("(class {});");
      expect(expr.type).toBe("ClassExpression");
      const cls = expr as AST.ClassExpression;
      expect(cls.id).toBeNull();
      expect(cls.superClass).toBeNull();
      expect(cls.body.type).toBe("ClassBody");
      expect(cls.body.body).toHaveLength(0);
    });

    it("should parse anonymous class with method", () => {
      const expr = parseExpr("(class { foo() {} });");
      const cls = expr as AST.ClassExpression;
      expect(cls.id).toBeNull();
      expect(cls.body.body).toHaveLength(1);
      const method = cls.body.body[0] as AST.MethodDefinition;
      expect(method.type).toBe("MethodDefinition");
      expect(method.kind).toBe("method");
      expect((method.key as AST.Identifier).name).toBe("foo");
    });

    it("should parse anonymous class with constructor", () => {
      const expr = parseExpr("(class { constructor() {} });");
      const cls = expr as AST.ClassExpression;
      const method = cls.body.body[0] as AST.MethodDefinition;
      expect(method.kind).toBe("constructor");
    });

    it("should parse anonymous class with multiple members", () => {
      const expr = parseExpr("(class { foo() {} bar() {} });");
      const cls = expr as AST.ClassExpression;
      expect(cls.body.body).toHaveLength(2);
    });
  });

  describe("Named class expressions", () => {
    it("should parse named class expression", () => {
      const expr = parseExpr("(class Foo {});");
      const cls = expr as AST.ClassExpression;
      expect(cls.id).not.toBeNull();
      expect(cls.id!.name).toBe("Foo");
    });

    it("should parse named class with members", () => {
      const expr = parseExpr("(class MyClass { method() {} });");
      const cls = expr as AST.ClassExpression;
      expect(cls.id!.name).toBe("MyClass");
      expect(cls.body.body).toHaveLength(1);
    });
  });

  describe("Class expressions with extends", () => {
    it("should parse class extends identifier", () => {
      const expr = parseExpr("(class extends Base {});");
      const cls = expr as AST.ClassExpression;
      expect(cls.id).toBeNull();
      expect(cls.superClass).not.toBeNull();
      expect((cls.superClass as AST.Identifier).type).toBe("Identifier");
      expect((cls.superClass as AST.Identifier).name).toBe("Base");
    });

    it("should parse named class with extends", () => {
      const expr = parseExpr("(class Foo extends Bar {});");
      const cls = expr as AST.ClassExpression;
      expect(cls.id!.name).toBe("Foo");
      expect((cls.superClass as AST.Identifier).name).toBe("Bar");
    });

    it("should parse class extends with members", () => {
      const expr = parseExpr("(class extends Base { method() {} });");
      const cls = expr as AST.ClassExpression;
      expect(cls.superClass).not.toBeNull();
      expect(cls.body.body).toHaveLength(1);
    });
  });

  describe("Class expression members", () => {
    it("should parse getter method", () => {
      const expr = parseExpr("(class { get x() {} });");
      const cls = expr as AST.ClassExpression;
      const method = cls.body.body[0] as AST.MethodDefinition;
      expect(method.kind).toBe("get");
      expect((method.key as AST.Identifier).name).toBe("x");
    });

    it("should parse setter method", () => {
      const expr = parseExpr("(class { set x(v) {} });");
      const cls = expr as AST.ClassExpression;
      const method = cls.body.body[0] as AST.MethodDefinition;
      expect(method.kind).toBe("set");
      expect((method.key as AST.Identifier).name).toBe("x");
    });

    it("should parse static method", () => {
      const expr = parseExpr("(class { static foo() {} });");
      const cls = expr as AST.ClassExpression;
      const method = cls.body.body[0] as AST.MethodDefinition;
      expect(method.static).toBe(true);
      expect((method.key as AST.Identifier).name).toBe("foo");
    });

    it("should parse property definition with initializer", () => {
      const expr = parseExpr("(class { x = 42 });");
      const cls = expr as AST.ClassExpression;
      const prop = cls.body.body[0] as AST.PropertyDefinition;
      expect(prop.type).toBe("PropertyDefinition");
      expect((prop.key as AST.Identifier).name).toBe("x");
      expect((prop.value as AST.Literal).value).toBe(42);
    });

    it("should parse property definition without initializer", () => {
      const expr = parseExpr("(class { x });");
      const cls = expr as AST.ClassExpression;
      const prop = cls.body.body[0] as AST.PropertyDefinition;
      expect(prop.type).toBe("PropertyDefinition");
      expect(prop.value).toBeNull();
    });

    it("should parse static property", () => {
      const expr = parseExpr("(class { static x = 1 });");
      const cls = expr as AST.ClassExpression;
      const prop = cls.body.body[0] as AST.PropertyDefinition;
      expect(prop.static).toBe(true);
    });

    it("should parse computed method key", () => {
      const expr = parseExpr('(class { ["foo"]() {} });');
      const cls = expr as AST.ClassExpression;
      const method = cls.body.body[0] as AST.MethodDefinition;
      expect(method.computed).toBe(true);
      expect((method.key as AST.Literal).value).toBe("foo");
    });

    it("should parse method with parameters", () => {
      const expr = parseExpr("(class { add(a, b) {} });");
      const cls = expr as AST.ClassExpression;
      const method = cls.body.body[0] as AST.MethodDefinition;
      expect(method.value.params).toHaveLength(2);
    });
  });

  describe("Class expression position tracking", () => {
    it("should have correct start and end positions", () => {
      const expr = parseExpr("(class Foo {});");
      const cls = expr as AST.ClassExpression;
      expect(cls.start).toBeGreaterThanOrEqual(0);
      expect(cls.end).toBeGreaterThan(cls.start);
      expect(cls.body.start).toBeGreaterThan(0);
      expect(cls.body.end).toBeGreaterThan(cls.body.start);
    });
  });

  describe("Class expression edge cases", () => {
    it("should parse class with semicolons between members", () => {
      const expr = parseExpr("(class { ; foo() {} ; bar() {} ; });");
      const cls = expr as AST.ClassExpression;
      expect(cls.body.body).toHaveLength(2);
    });

    it("should parse class with numeric method name", () => {
      const expr = parseExpr("(class { 0() {} });");
      const cls = expr as AST.ClassExpression;
      const method = cls.body.body[0] as AST.MethodDefinition;
      expect((method.key as AST.Literal).value).toBe(0);
    });

    it("should parse class with string method name", () => {
      const expr = parseExpr('(class { "hello"() {} });');
      const cls = expr as AST.ClassExpression;
      const method = cls.body.body[0] as AST.MethodDefinition;
      expect((method.key as AST.Literal).value).toBe("hello");
    });
  });
});

describe("Integration: Function/Class expressions in various contexts", () => {
  it("should parse function expression assigned to variable", () => {
    const program = parse("const fn = function() {};");
    expect(program.body).toHaveLength(1);
    const decl = program.body[0] as AST.VariableDeclaration;
    const init = (decl.declarations[0] as AST.VariableDeclarator)
      .init as AST.FunctionExpression;
    expect(init.type).toBe("FunctionExpression");
  });

  it("should parse arrow function assigned to variable", () => {
    const program = parse("const fn = () => 1;");
    expect(program.body).toHaveLength(1);
    const decl = program.body[0] as AST.VariableDeclaration;
    const init = (decl.declarations[0] as AST.VariableDeclarator)
      .init as AST.ArrowFunctionExpression;
    expect(init.type).toBe("ArrowFunctionExpression");
    expect(init.expression).toBe(true);
  });

  it("should parse class expression assigned to variable", () => {
    const program = parse("const C = class {};");
    expect(program.body).toHaveLength(1);
    const decl = program.body[0] as AST.VariableDeclaration;
    const init = (decl.declarations[0] as AST.VariableDeclarator)
      .init as AST.ClassExpression;
    expect(init.type).toBe("ClassExpression");
  });

  it("should parse arrow with single param assigned to variable", () => {
    const program = parse("const double = x => x;");
    const decl = program.body[0] as AST.VariableDeclaration;
    const init = (decl.declarations[0] as AST.VariableDeclarator)
      .init as AST.ArrowFunctionExpression;
    expect(init.type).toBe("ArrowFunctionExpression");
    expect(init.params).toHaveLength(1);
  });

  it("should parse async arrow assigned to variable", () => {
    const program = parse("const fn = async () => 1;");
    const decl = program.body[0] as AST.VariableDeclaration;
    const init = (decl.declarations[0] as AST.VariableDeclarator)
      .init as AST.ArrowFunctionExpression;
    expect(init.type).toBe("ArrowFunctionExpression");
    expect(init.async).toBe(true);
  });

  it("should parse named function expression assigned to variable", () => {
    const program = parse("const fn = function named() {};");
    const decl = program.body[0] as AST.VariableDeclaration;
    const init = (decl.declarations[0] as AST.VariableDeclarator)
      .init as AST.FunctionExpression;
    expect(init.type).toBe("FunctionExpression");
    expect(init.id!.name).toBe("named");
  });

  it("should parse async function expression assigned to variable", () => {
    const program = parse("const fn = async function() {};");
    const decl = program.body[0] as AST.VariableDeclaration;
    const init = (decl.declarations[0] as AST.VariableDeclarator)
      .init as AST.FunctionExpression;
    expect(init.type).toBe("FunctionExpression");
    expect(init.async).toBe(true);
  });
});

describe("Error handling", () => {
  it("should throw on unterminated function expression body", () => {
    expect(() => parseExpr("(function() {")).toThrow(SyntaxError);
  });

  it("should throw on unterminated class body", () => {
    expect(() => parseExpr("(class {")).toThrow(SyntaxError);
  });

  it("should throw on missing arrow after empty parens", () => {
    expect(() => parseExpr("();")).toThrow(SyntaxError);
  });

  it("should throw on missing parameter name in function", () => {
    expect(() => parseExpr("(function(,) {});")).toThrow(SyntaxError);
  });

  it("should throw on unexpected token in class member", () => {
    expect(() => parseExpr("(class { + });")).toThrow(SyntaxError);
  });

  it("should throw on unterminated paren in arrow detection (EOF)", () => {
    expect(() => parseExpr("((x")).toThrow(SyntaxError);
  });
});

describe("Additional edge cases for coverage", () => {
  it("should parse class with 'set' as regular method name", () => {
    const expr = parseExpr("(class { set() {} });");
    const cls = expr as AST.ClassExpression;
    const method = cls.body.body[0] as AST.MethodDefinition;
    expect(method.kind).toBe("method");
    expect((method.key as AST.Identifier).name).toBe("set");
  });

  it("should parse class with 'get' as regular method name", () => {
    const expr = parseExpr("(class { get() {} });");
    const cls = expr as AST.ClassExpression;
    const method = cls.body.body[0] as AST.MethodDefinition;
    expect(method.kind).toBe("method");
    expect((method.key as AST.Identifier).name).toBe("get");
  });

  it("should parse class property with explicit semicolons", () => {
    const expr = parseExpr("(class { x = 1; y = 2; });");
    const cls = expr as AST.ClassExpression;
    expect(cls.body.body).toHaveLength(2);
    const prop1 = cls.body.body[0] as AST.PropertyDefinition;
    expect((prop1.key as AST.Identifier).name).toBe("x");
    const prop2 = cls.body.body[1] as AST.PropertyDefinition;
    expect((prop2.key as AST.Identifier).name).toBe("y");
  });

  it("should parse class with 'set' as property name", () => {
    const expr = parseExpr("(class { set = 5 });");
    const cls = expr as AST.ClassExpression;
    const prop = cls.body.body[0] as AST.PropertyDefinition;
    expect(prop.type).toBe("PropertyDefinition");
    expect((prop.key as AST.Identifier).name).toBe("set");
    expect((prop.value as AST.Literal).value).toBe(5);
  });

  it("should parse class with 'get' as property name", () => {
    const expr = parseExpr("(class { get = 5 });");
    const cls = expr as AST.ClassExpression;
    const prop = cls.body.body[0] as AST.PropertyDefinition;
    expect(prop.type).toBe("PropertyDefinition");
    expect((prop.key as AST.Identifier).name).toBe("get");
  });

  it("should parse nested parentheses in arrow param detection", () => {
    const expr = parseExpr("((x) => x);");
    const arrow = expr as AST.ArrowFunctionExpression;
    expect(arrow.type).toBe("ArrowFunctionExpression");
  });

  it("should handle parenthesized expression that is not an arrow", () => {
    const expr = parseExpr("(1 + 2);");
    expect(expr.type).toBe("BinaryExpression");
  });

  it("should parse class with static block", () => {
    const expr = parseExpr("(class { static { } });");
    const cls = expr as AST.ClassExpression;
    expect(cls.body.body).toHaveLength(1);
    const block = cls.body.body[0] as AST.StaticBlock;
    expect(block.type).toBe("StaticBlock");
  });

  it("should parse class with static block containing statements", () => {
    const expr = parseExpr("(class { static { const x = 1; } });");
    const cls = expr as AST.ClassExpression;
    const block = cls.body.body[0] as AST.StaticBlock;
    expect(block.type).toBe("StaticBlock");
    expect(block.body).toHaveLength(1);
  });

  it("should parse 'async' as plain identifier when not followed by function/arrow", () => {
    const expr = parseExpr("async;");
    expect(expr.type).toBe("Identifier");
    expect((expr as AST.Identifier).name).toBe("async");
  });

  it("should parse class with decorated member", () => {
    const program = parse("(class { @dec method() {} });", {
      sourceType: "module",
    });
    const stmt = program.body[0] as AST.ExpressionStatement;
    const cls = stmt.expression as AST.ClassExpression;
    expect(cls.body.body.length).toBe(1);
    const method = cls.body.body[0] as AST.MethodDefinition;
    expect(method.decorators.length).toBe(1);
  });

  it("should parse class with decorator that has multiple arguments", () => {
    const program = parse("(class { @dec(a, b) method() {} });", {
      sourceType: "module",
    });
    const stmt = program.body[0] as AST.ExpressionStatement;
    const cls = stmt.expression as AST.ClassExpression;
    const method = cls.body.body[0] as AST.MethodDefinition;
    expect(method.decorators.length).toBe(1);
  });

  it("should parse class with decorator that has spread argument", () => {
    const program = parse("(class { @dec(...args) method() {} });", {
      sourceType: "module",
    });
    const stmt = program.body[0] as AST.ExpressionStatement;
    const cls = stmt.expression as AST.ClassExpression;
    const method = cls.body.body[0] as AST.MethodDefinition;
    expect(method.decorators.length).toBe(1);
  });

  it("should parse class with empty decorator arguments", () => {
    const program = parse("(class { @dec() method() {} });", {
      sourceType: "module",
    });
    const stmt = program.body[0] as AST.ExpressionStatement;
    const cls = stmt.expression as AST.ClassExpression;
    const method = cls.body.body[0] as AST.MethodDefinition;
    expect(method.decorators.length).toBe(1);
  });
});
