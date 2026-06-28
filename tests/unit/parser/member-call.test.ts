/**
 * Unit tests for member access, call expression, and optional chaining parsing.
 *
 * Covers dot access, computed access, function calls, spread in arguments,
 * chained expressions, optional chaining, new expressions, super expressions,
 * tagged templates, and error cases.
 *
 * @module tests/unit/parser/member-call
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

describe("Member Access, Calls, and Optional Chaining", () => {
  describe("Dot Member Access", () => {
    it("should parse simple dot access: obj.prop", () => {
      const expr = parseExpr("obj.prop;") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect(expr.computed).toBe(false);
      expect(expr.optional).toBe(false);
      expect((expr.object as AST.Identifier).name).toBe("obj");
      expect((expr.property as AST.Identifier).name).toBe("prop");
    });

    it("should parse chained dot access: obj.a.b.c", () => {
      const expr = parseExpr("obj.a.b.c;") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect((expr.property as AST.Identifier).name).toBe("c");

      const mid = expr.object as AST.MemberExpression;
      expect(mid.type).toBe("MemberExpression");
      expect((mid.property as AST.Identifier).name).toBe("b");

      const inner = mid.object as AST.MemberExpression;
      expect(inner.type).toBe("MemberExpression");
      expect((inner.property as AST.Identifier).name).toBe("a");
      expect((inner.object as AST.Identifier).name).toBe("obj");
    });

    it("should allow keywords as property names: obj.class", () => {
      const expr = parseExpr("obj.class;") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect((expr.property as AST.Identifier).name).toBe("class");
    });

    it("should allow contextual keywords as property names: obj.get", () => {
      const expr = parseExpr("obj.get;") as AST.MemberExpression;
      expect((expr.property as AST.Identifier).name).toBe("get");
    });

    it("should allow 'true' as property name: obj.true", () => {
      const expr = parseExpr("obj.true;") as AST.MemberExpression;
      expect((expr.property as AST.Identifier).name).toBe("true");
    });

    it("should allow 'null' as property name: obj.null", () => {
      const expr = parseExpr("obj.null;") as AST.MemberExpression;
      expect((expr.property as AST.Identifier).name).toBe("null");
    });

    it("should have correct start/end positions", () => {
      const expr = parseExpr("obj.prop;") as AST.MemberExpression;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(8);
    });
  });

  describe("Computed Member Access", () => {
    it("should parse computed access: obj[expr]", () => {
      const expr = parseExpr("obj[0];") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect(expr.computed).toBe(true);
      expect(expr.optional).toBe(false);
      expect((expr.object as AST.Identifier).name).toBe("obj");
      expect((expr.property as AST.Literal).value).toBe(0);
    });

    it("should parse string key: obj['key']", () => {
      const expr = parseExpr("obj['key'];") as AST.MemberExpression;
      expect(expr.computed).toBe(true);
      expect((expr.property as AST.Literal).value).toBe("key");
    });

    it("should parse expression key: obj[a + b]", () => {
      const expr = parseExpr("obj[a + b];") as AST.MemberExpression;
      expect(expr.computed).toBe(true);
      expect((expr.property as AST.BinaryExpression).operator).toBe("+");
    });

    it("should parse nested computed: obj[a][b]", () => {
      const expr = parseExpr("obj[a][b];") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect((expr.property as AST.Identifier).name).toBe("b");
      const inner = expr.object as AST.MemberExpression;
      expect((inner.property as AST.Identifier).name).toBe("a");
    });

    it("should have correct end position after bracket", () => {
      const expr = parseExpr("obj[0];") as AST.MemberExpression;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(6);
    });
  });

  describe("Call Expressions", () => {
    it("should parse no-argument call: fn()", () => {
      const expr = parseExpr("fn();") as AST.CallExpression;
      expect(expr.type).toBe("CallExpression");
      expect(expr.optional).toBe(false);
      expect((expr.callee as AST.Identifier).name).toBe("fn");
      expect(expr.arguments.length).toBe(0);
    });

    it("should parse single argument: fn(a)", () => {
      const expr = parseExpr("fn(a);") as AST.CallExpression;
      expect(expr.arguments.length).toBe(1);
      expect((expr.arguments[0] as AST.Identifier).name).toBe("a");
    });

    it("should parse multiple arguments: fn(a, b, c)", () => {
      const expr = parseExpr("fn(a, b, c);") as AST.CallExpression;
      expect(expr.arguments.length).toBe(3);
      expect((expr.arguments[0] as AST.Identifier).name).toBe("a");
      expect((expr.arguments[1] as AST.Identifier).name).toBe("b");
      expect((expr.arguments[2] as AST.Identifier).name).toBe("c");
    });

    it("should parse spread in call: fn(...args)", () => {
      const expr = parseExpr("fn(...args);") as AST.CallExpression;
      expect(expr.arguments.length).toBe(1);
      const spread = expr.arguments[0] as AST.SpreadElement;
      expect(spread.type).toBe("SpreadElement");
      expect((spread.argument as AST.Identifier).name).toBe("args");
    });

    it("should parse mixed args with spread: fn(a, ...rest)", () => {
      const expr = parseExpr("fn(a, ...rest);") as AST.CallExpression;
      expect(expr.arguments.length).toBe(2);
      expect((expr.arguments[0] as AST.Identifier).name).toBe("a");
      expect((expr.arguments[1] as AST.SpreadElement).type).toBe(
        "SpreadElement",
      );
    });

    it("should parse trailing comma in args: fn(a, b,)", () => {
      const expr = parseExpr("fn(a, b,);") as AST.CallExpression;
      expect(expr.arguments.length).toBe(2);
    });

    it("should parse chained calls: fn()()", () => {
      const expr = parseExpr("fn()();") as AST.CallExpression;
      expect(expr.type).toBe("CallExpression");
      const inner = expr.callee as AST.CallExpression;
      expect(inner.type).toBe("CallExpression");
      expect((inner.callee as AST.Identifier).name).toBe("fn");
    });

    it("should have correct end position", () => {
      const expr = parseExpr("fn();") as AST.CallExpression;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(4);
    });
  });

  describe("Method Calls", () => {
    it("should parse method call: obj.method()", () => {
      const expr = parseExpr("obj.method();") as AST.CallExpression;
      expect(expr.type).toBe("CallExpression");
      const callee = expr.callee as AST.MemberExpression;
      expect(callee.type).toBe("MemberExpression");
      expect((callee.object as AST.Identifier).name).toBe("obj");
      expect((callee.property as AST.Identifier).name).toBe("method");
    });

    it("should parse chained method calls: a.b().c()", () => {
      const expr = parseExpr("a.b().c();") as AST.CallExpression;
      expect(expr.type).toBe("CallExpression");
      const callee = expr.callee as AST.MemberExpression;
      expect(callee.type).toBe("MemberExpression");
      expect((callee.property as AST.Identifier).name).toBe("c");
      const inner = callee.object as AST.CallExpression;
      expect(inner.type).toBe("CallExpression");
    });

    it("should parse computed method call: obj['method']()", () => {
      const expr = parseExpr("obj['method']();") as AST.CallExpression;
      expect(expr.type).toBe("CallExpression");
      const callee = expr.callee as AST.MemberExpression;
      expect(callee.computed).toBe(true);
    });
  });

  describe("Optional Chaining", () => {
    it("should parse optional dot access: obj?.prop", () => {
      const expr = parseExpr("obj?.prop;") as AST.ChainExpression;
      expect(expr.type).toBe("ChainExpression");
      const member = expr.expression as AST.MemberExpression;
      expect(member.type).toBe("MemberExpression");
      expect(member.optional).toBe(true);
      expect(member.computed).toBe(false);
      expect((member.object as AST.Identifier).name).toBe("obj");
      expect((member.property as AST.Identifier).name).toBe("prop");
    });

    it("should parse optional computed access: obj?.[expr]", () => {
      const expr = parseExpr("obj?.[0];") as AST.ChainExpression;
      expect(expr.type).toBe("ChainExpression");
      const member = expr.expression as AST.MemberExpression;
      expect(member.optional).toBe(true);
      expect(member.computed).toBe(true);
      expect((member.property as AST.Literal).value).toBe(0);
    });

    it("should parse optional call: fn?.()", () => {
      const expr = parseExpr("fn?.();") as AST.ChainExpression;
      expect(expr.type).toBe("ChainExpression");
      const call = expr.expression as AST.CallExpression;
      expect(call.type).toBe("CallExpression");
      expect(call.optional).toBe(true);
      expect((call.callee as AST.Identifier).name).toBe("fn");
    });

    it("should parse optional call with args: fn?.(a, b)", () => {
      const expr = parseExpr("fn?.(a, b);") as AST.ChainExpression;
      const call = expr.expression as AST.CallExpression;
      expect(call.optional).toBe(true);
      expect(call.arguments.length).toBe(2);
    });

    it("should parse deep optional chain: a?.b?.c", () => {
      const expr = parseExpr("a?.b?.c;") as AST.ChainExpression;
      expect(expr.type).toBe("ChainExpression");
      const outer = expr.expression as AST.MemberExpression;
      expect(outer.optional).toBe(true);
      expect((outer.property as AST.Identifier).name).toBe("c");
      const inner = outer.object as AST.MemberExpression;
      expect(inner.optional).toBe(true);
      expect((inner.property as AST.Identifier).name).toBe("b");
    });

    it("should wrap mixed chain in ChainExpression: a?.b.c", () => {
      const expr = parseExpr("a?.b.c;") as AST.ChainExpression;
      expect(expr.type).toBe("ChainExpression");
      const outer = expr.expression as AST.MemberExpression;
      expect(outer.optional).toBe(false);
      expect((outer.property as AST.Identifier).name).toBe("c");
      const inner = outer.object as AST.MemberExpression;
      expect(inner.optional).toBe(true);
    });

    it("should wrap optional call chain: obj?.method()", () => {
      const expr = parseExpr("obj?.method();") as AST.ChainExpression;
      expect(expr.type).toBe("ChainExpression");
      const call = expr.expression as AST.CallExpression;
      expect(call.type).toBe("CallExpression");
      expect(call.optional).toBe(false);
      const callee = call.callee as AST.MemberExpression;
      expect(callee.optional).toBe(true);
    });

    it("should not wrap non-optional chains in ChainExpression", () => {
      const expr = parseExpr("a.b.c;");
      expect(expr.type).toBe("MemberExpression");
    });
  });

  describe("New Expressions", () => {
    it("should parse new with no args: new Foo", () => {
      const expr = parseExpr("new Foo;") as AST.NewExpression;
      expect(expr.type).toBe("NewExpression");
      expect((expr.callee as AST.Identifier).name).toBe("Foo");
      expect(expr.arguments.length).toBe(0);
    });

    it("should parse new with empty parens: new Foo()", () => {
      const expr = parseExpr("new Foo();") as AST.NewExpression;
      expect(expr.type).toBe("NewExpression");
      expect((expr.callee as AST.Identifier).name).toBe("Foo");
      expect(expr.arguments.length).toBe(0);
    });

    it("should parse new with args: new Foo(a, b)", () => {
      const expr = parseExpr("new Foo(a, b);") as AST.NewExpression;
      expect(expr.type).toBe("NewExpression");
      expect(expr.arguments.length).toBe(2);
      expect((expr.arguments[0] as AST.Identifier).name).toBe("a");
      expect((expr.arguments[1] as AST.Identifier).name).toBe("b");
    });

    it("should parse new with member callee: new foo.Bar()", () => {
      const expr = parseExpr("new foo.Bar();") as AST.NewExpression;
      expect(expr.type).toBe("NewExpression");
      const callee = expr.callee as AST.MemberExpression;
      expect(callee.type).toBe("MemberExpression");
      expect((callee.object as AST.Identifier).name).toBe("foo");
      expect((callee.property as AST.Identifier).name).toBe("Bar");
    });

    it("should parse new with computed callee: new obj['Foo']()", () => {
      const expr = parseExpr("new obj['Foo']();") as AST.NewExpression;
      expect(expr.type).toBe("NewExpression");
      const callee = expr.callee as AST.MemberExpression;
      expect(callee.computed).toBe(true);
    });

    it("should allow method calls after new: new Foo().bar()", () => {
      const expr = parseExpr("new Foo().bar();") as AST.CallExpression;
      expect(expr.type).toBe("CallExpression");
      const callee = expr.callee as AST.MemberExpression;
      expect(callee.type).toBe("MemberExpression");
      expect((callee.property as AST.Identifier).name).toBe("bar");
      const newExpr = callee.object as AST.NewExpression;
      expect(newExpr.type).toBe("NewExpression");
    });

    it("should parse new.target", () => {
      const expr = parseExpr("new.target;") as AST.MetaProperty;
      expect(expr.type).toBe("MetaProperty");
      expect(expr.meta.name).toBe("new");
      expect(expr.property.name).toBe("target");
    });

    it("should parse new with spread: new Foo(...args)", () => {
      const expr = parseExpr("new Foo(...args);") as AST.NewExpression;
      expect(expr.type).toBe("NewExpression");
      expect(expr.arguments.length).toBe(1);
      expect((expr.arguments[0] as AST.SpreadElement).type).toBe(
        "SpreadElement",
      );
    });

    it("should parse new with dot property that is not target: new Foo.bar", () => {
      // new Foo.bar - the dot is member access on the callee
      const expr = parseExpr("new Foo.bar;") as AST.NewExpression;
      expect(expr.type).toBe("NewExpression");
      const callee = expr.callee as AST.MemberExpression;
      expect(callee.type).toBe("MemberExpression");
      expect((callee.object as AST.Identifier).name).toBe("Foo");
      expect((callee.property as AST.Identifier).name).toBe("bar");
    });

    it("should parse nested new new Foo()", () => {
      const expr = parseExpr("new new Foo();") as AST.NewExpression;
      expect(expr.type).toBe("NewExpression");
      expect(expr.arguments.length).toBe(0);
      const inner = expr.callee as AST.NewExpression;
      expect(inner.type).toBe("NewExpression");
      expect((inner.callee as AST.Identifier).name).toBe("Foo");
    });

    it("should handle new followed by dot that is not target (new Foo.bar)", () => {
      // Exercises the restoreState branch when new.X where X !== target
      // In this case `new` is followed by identifier `Foo` then `.bar`
      const expr = parseExpr("new a.b();") as AST.NewExpression;
      expect(expr.type).toBe("NewExpression");
      const callee = expr.callee as AST.MemberExpression;
      expect((callee.object as AST.Identifier).name).toBe("a");
      expect((callee.property as AST.Identifier).name).toBe("b");
    });
  });

  describe("Super Expressions", () => {
    it("should parse super.prop", () => {
      // Parse in script mode to avoid strict-mode issues with super outside class
      const program = parse("super.prop;", { sourceType: "script" });
      const stmt = program.body[0] as AST.ExpressionStatement;
      const expr = stmt.expression as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect((expr.object as AST.Super).type).toBe("Super");
      expect((expr.property as AST.Identifier).name).toBe("prop");
      expect(expr.computed).toBe(false);
    });

    it("should parse super[expr]", () => {
      const program = parse("super[0];", { sourceType: "script" });
      const stmt = program.body[0] as AST.ExpressionStatement;
      const expr = stmt.expression as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect((expr.object as AST.Super).type).toBe("Super");
      expect(expr.computed).toBe(true);
    });

    it("should parse super()", () => {
      const program = parse("super();", { sourceType: "script" });
      const stmt = program.body[0] as AST.ExpressionStatement;
      const expr = stmt.expression as AST.CallExpression;
      expect(expr.type).toBe("CallExpression");
      expect((expr.callee as AST.Super).type).toBe("Super");
      expect(expr.arguments.length).toBe(0);
    });

    it("should parse super(a, b)", () => {
      const program = parse("super(a, b);", { sourceType: "script" });
      const stmt = program.body[0] as AST.ExpressionStatement;
      const expr = stmt.expression as AST.CallExpression;
      expect(expr.arguments.length).toBe(2);
    });

    it("should throw for bare super", () => {
      expect(() => parse("super;", { sourceType: "script" })).toThrow(
        SyntaxError,
      );
    });
  });

  describe("Tagged Templates", () => {
    it("should parse tagged no-sub template: tag`text`", () => {
      const expr = parseExpr("tag`text`;") as AST.TaggedTemplateExpression;
      expect(expr.type).toBe("TaggedTemplateExpression");
      expect((expr.tag as AST.Identifier).name).toBe("tag");
      expect(expr.quasi.type).toBe("TemplateLiteral");
    });

    it("should parse tagged template after member: obj.tag`text`", () => {
      const expr = parseExpr("obj.tag`text`;") as AST.TaggedTemplateExpression;
      expect(expr.type).toBe("TaggedTemplateExpression");
      const tag = expr.tag as AST.MemberExpression;
      expect(tag.type).toBe("MemberExpression");
      expect((tag.property as AST.Identifier).name).toBe("tag");
    });
  });

  describe("Complex Chained Expressions", () => {
    it("should parse obj.a[0].b(c).d", () => {
      const expr = parseExpr("obj.a[0].b(c).d;") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect((expr.property as AST.Identifier).name).toBe("d");
      const call = expr.object as AST.CallExpression;
      expect(call.type).toBe("CallExpression");
      const callee = call.callee as AST.MemberExpression;
      expect((callee.property as AST.Identifier).name).toBe("b");
    });

    it("should parse fn()(a)()", () => {
      const expr = parseExpr("fn()(a)();") as AST.CallExpression;
      expect(expr.type).toBe("CallExpression");
      expect(expr.arguments.length).toBe(0);
      const mid = expr.callee as AST.CallExpression;
      expect(mid.arguments.length).toBe(1);
      const inner = mid.callee as AST.CallExpression;
      expect((inner.callee as AST.Identifier).name).toBe("fn");
    });

    it("should parse a[0][1][2]", () => {
      const expr = parseExpr("a[0][1][2];") as AST.MemberExpression;
      expect((expr.property as AST.Literal).value).toBe(2);
      const mid = expr.object as AST.MemberExpression;
      expect((mid.property as AST.Literal).value).toBe(1);
      const inner = mid.object as AST.MemberExpression;
      expect((inner.property as AST.Literal).value).toBe(0);
    });
  });

  describe("Error Cases", () => {
    it("should throw on unterminated argument list", () => {
      expect(() => parse("fn(a, b", { sourceType: "module" })).toThrow(
        SyntaxError,
      );
    });

    it("should throw on invalid argument separator", () => {
      expect(() => parse("fn(a b);", { sourceType: "module" })).toThrow(
        SyntaxError,
      );
    });

    it("should throw on invalid property after dot", () => {
      expect(() => parse("obj.123;", { sourceType: "module" })).toThrow(
        SyntaxError,
      );
    });

    it("should throw on invalid property after ?.", () => {
      expect(() => parse("obj?.123;", { sourceType: "module" })).toThrow(
        SyntaxError,
      );
    });

    it("should throw on super without member/call", () => {
      expect(() => parse("super;", { sourceType: "script" })).toThrow(
        SyntaxError,
      );
    });

    it("should throw on unterminated computed access", () => {
      expect(() => parse("obj[0", { sourceType: "module" })).toThrow(
        SyntaxError,
      );
    });
  });

  describe("Import Expressions", () => {
    it("should parse import.meta", () => {
      const expr = parseExpr("import.meta;") as AST.MetaProperty;
      expect(expr.type).toBe("MetaProperty");
      expect(expr.meta.name).toBe("import");
      expect(expr.property.name).toBe("meta");
    });

    it("should parse import.meta.url", () => {
      const expr = parseExpr("import.meta.url;") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect((expr.property as AST.Identifier).name).toBe("url");
      const inner = expr.object as AST.MetaProperty;
      expect(inner.type).toBe("MetaProperty");
    });

    it("should parse dynamic import: import(source)", () => {
      const expr = parseExpr("import('./mod.js');") as AST.ImportExpression;
      expect(expr.type).toBe("ImportExpression");
      expect((expr.source as AST.Literal).value).toBe("./mod.js");
    });
  });

  describe("Interaction with Operators", () => {
    it("should parse member access in binary: a.b + c.d", () => {
      const expr = parseExpr("a.b + c.d;") as AST.BinaryExpression;
      expect(expr.type).toBe("BinaryExpression");
      expect(expr.operator).toBe("+");
      expect((expr.left as AST.MemberExpression).type).toBe("MemberExpression");
      expect((expr.right as AST.MemberExpression).type).toBe(
        "MemberExpression",
      );
    });

    it("should parse call in assignment: obj.prop = fn()", () => {
      const expr = parseExpr("obj.prop = fn();") as AST.AssignmentExpression;
      expect(expr.type).toBe("AssignmentExpression");
      expect((expr.left as AST.MemberExpression).type).toBe("MemberExpression");
      expect((expr.right as AST.CallExpression).type).toBe("CallExpression");
    });

    it("should parse typeof obj.prop", () => {
      const expr = parseExpr("typeof obj.prop;") as AST.UnaryExpression;
      expect(expr.type).toBe("UnaryExpression");
      expect(expr.operator).toBe("typeof");
      expect((expr.argument as AST.MemberExpression).type).toBe(
        "MemberExpression",
      );
    });

    it("should parse obj.prop++", () => {
      const expr = parseExpr("obj.prop++;") as AST.UpdateExpression;
      expect(expr.type).toBe("UpdateExpression");
      expect(expr.operator).toBe("++");
      expect(expr.prefix).toBe(false);
      expect((expr.argument as AST.MemberExpression).type).toBe(
        "MemberExpression",
      );
    });

    it("should parse conditional with calls: a() ? b() : c()", () => {
      const expr = parseExpr("a() ? b() : c();") as AST.ConditionalExpression;
      expect(expr.type).toBe("ConditionalExpression");
      expect((expr.test as AST.CallExpression).type).toBe("CallExpression");
      expect((expr.consequent as AST.CallExpression).type).toBe(
        "CallExpression",
      );
      expect((expr.alternate as AST.CallExpression).type).toBe(
        "CallExpression",
      );
    });
  });

  describe("member access with keyword properties", () => {
    it("should parse member access with 'class' as property", () => {
      const expr = parseExpr("obj.class;") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
    });

    it("should parse member access with 'delete' as property", () => {
      const expr = parseExpr("obj.delete;") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
    });

    it("should parse member access with 'return' as property", () => {
      const expr = parseExpr("obj.return;") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
    });
  });

  describe("new.target meta property", () => {
    it("should parse new.target inside function", () => {
      const program = parse("function f() { new.target; }");
      expect(program.body.length).toBe(1);
    });
  });
});
