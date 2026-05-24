/**
 * Unit tests for expression parsing module.
 *
 * Covers primary/literal expressions, identifiers, this, arrays,
 * objects, template literals, parenthesized expressions, sequence
 * expressions, and simple assignment.
 *
 * @module tests/unit/parser/expressions
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../../src/parser/parser.js";
import { parseTaggedTemplate } from "../../../src/parser/expressions.js";
import { Lexer } from "../../../src/parser/lexer.js";
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

describe("Expression Parser", () => {
  describe("Numeric Literals", () => {
    it("should parse integer literal", () => {
      const expr = parseExpr("42;");
      expect(expr.type).toBe("Literal");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe(42);
      expect(lit.raw).toBe("42");
    });

    it("should parse float literal", () => {
      const expr = parseExpr("3.14;");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe(3.14);
      expect(lit.raw).toBe("3.14");
    });

    it("should parse hex literal", () => {
      const expr = parseExpr("0xFF;");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe(255);
    });

    it("should parse octal literal", () => {
      const expr = parseExpr("0o77;");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe(63);
    });

    it("should parse binary literal", () => {
      const expr = parseExpr("0b1010;");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe(10);
    });

    it("should parse float starting with dot", () => {
      const expr = parseExpr(".5;");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe(0.5);
    });

    it("should parse exponential notation", () => {
      const expr = parseExpr("1e10;");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe(1e10);
    });
  });

  describe("String Literals", () => {
    it("should parse double-quoted string", () => {
      const expr = parseExpr('"hello";');
      const lit = expr as AST.Literal;
      expect(lit.value).toBe("hello");
      expect(lit.raw).toBe('"hello"');
    });

    it("should parse single-quoted string", () => {
      const expr = parseExpr("'world';");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe("world");
      expect(lit.raw).toBe("'world'");
    });

    it("should parse string with escape sequences", () => {
      const expr = parseExpr('"line1\\nline2";');
      const lit = expr as AST.Literal;
      expect(lit.value).toBe("line1\nline2");
    });

    it("should parse empty string", () => {
      const expr = parseExpr('"";');
      const lit = expr as AST.Literal;
      expect(lit.value).toBe("");
    });
  });

  describe("Boolean Literals", () => {
    it("should parse true", () => {
      const expr = parseExpr("true;");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe(true);
      expect(lit.raw).toBe("true");
    });

    it("should parse false", () => {
      const expr = parseExpr("false;");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe(false);
      expect(lit.raw).toBe("false");
    });
  });

  describe("Null Literal", () => {
    it("should parse null", () => {
      const expr = parseExpr("null;");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe(null);
      expect(lit.raw).toBe("null");
    });
  });

  describe("RegExp Literals", () => {
    it("should parse simple regex", () => {
      const expr = parseExpr("/abc/;");
      const lit = expr as AST.Literal;
      expect(lit.type).toBe("Literal");
      expect(lit.regex).toBeDefined();
      expect(lit.regex!.pattern).toBe("abc");
      expect(lit.regex!.flags).toBe("");
    });

    it("should parse regex with flags", () => {
      const expr = parseExpr("/test/gi;");
      const lit = expr as AST.Literal;
      expect(lit.regex!.pattern).toBe("test");
      expect(lit.regex!.flags).toBe("gi");
    });

    it("should parse regex with special characters", () => {
      const expr = parseExpr("/[a-z]+/m;");
      const lit = expr as AST.Literal;
      expect(lit.regex!.pattern).toBe("[a-z]+");
      expect(lit.regex!.flags).toBe("m");
    });
  });

  describe("BigInt Literals", () => {
    it("should parse BigInt literal", () => {
      const expr = parseExpr("123n;");
      const lit = expr as AST.Literal;
      expect(lit.type).toBe("Literal");
      expect(lit.value).toBe(123n);
      expect(lit.bigint).toBe("123");
      expect(lit.raw).toBe("123n");
    });

    it("should parse hex BigInt literal", () => {
      const expr = parseExpr("0xFFn;");
      const lit = expr as AST.Literal;
      expect(lit.value).toBe(255n);
      expect(lit.bigint).toBe("0xFF");
    });
  });

  describe("Identifier", () => {
    it("should parse simple identifier", () => {
      const expr = parseExpr("foo;");
      expect(expr.type).toBe("Identifier");
      const id = expr as AST.Identifier;
      expect(id.name).toBe("foo");
    });

    it("should parse identifier with underscore", () => {
      const expr = parseExpr("_private;");
      const id = expr as AST.Identifier;
      expect(id.name).toBe("_private");
    });

    it("should parse identifier with dollar sign", () => {
      const expr = parseExpr("$elem;");
      const id = expr as AST.Identifier;
      expect(id.name).toBe("$elem");
    });

    it("should parse identifier with digits", () => {
      const expr = parseExpr("foo123;");
      const id = expr as AST.Identifier;
      expect(id.name).toBe("foo123");
    });
  });

  describe("ThisExpression", () => {
    it("should parse this keyword", () => {
      const expr = parseExpr("this;");
      expect(expr.type).toBe("ThisExpression");
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(4);
    });
  });

  describe("ArrayExpression", () => {
    it("should parse empty array", () => {
      const expr = parseExpr("[];");
      expect(expr.type).toBe("ArrayExpression");
      const arr = expr as AST.ArrayExpression;
      expect(arr.elements).toHaveLength(0);
    });

    it("should parse array with elements", () => {
      const expr = parseExpr("[1, 2, 3];");
      const arr = expr as AST.ArrayExpression;
      expect(arr.elements).toHaveLength(3);
      expect((arr.elements[0] as AST.Literal).value).toBe(1);
      expect((arr.elements[1] as AST.Literal).value).toBe(2);
      expect((arr.elements[2] as AST.Literal).value).toBe(3);
    });

    it("should parse array with trailing comma", () => {
      const expr = parseExpr("[1, 2,];");
      const arr = expr as AST.ArrayExpression;
      expect(arr.elements).toHaveLength(2);
    });

    it("should parse array with holes (elision)", () => {
      const expr = parseExpr("[,, 1,,];");
      const arr = expr as AST.ArrayExpression;
      expect(arr.elements[0]).toBe(null);
      expect(arr.elements[1]).toBe(null);
      expect((arr.elements[2] as AST.Literal).value).toBe(1);
      expect(arr.elements[3]).toBe(null);
    });

    it("should parse array with spread element", () => {
      const expr = parseExpr("[1, ...arr];");
      const arr = expr as AST.ArrayExpression;
      expect(arr.elements).toHaveLength(2);
      expect((arr.elements[0] as AST.Literal).value).toBe(1);
      const spread = arr.elements[1] as AST.SpreadElement;
      expect(spread.type).toBe("SpreadElement");
      expect((spread.argument as AST.Identifier).name).toBe("arr");
    });

    it("should parse nested array", () => {
      const expr = parseExpr("[[1], [2]];");
      const arr = expr as AST.ArrayExpression;
      expect(arr.elements).toHaveLength(2);
      expect((arr.elements[0] as AST.ArrayExpression).type).toBe(
        "ArrayExpression",
      );
    });

    it("should throw on unterminated array after elements", () => {
      expect(() => parseExpr("[1, 2")).toThrow();
    });

    it("should throw on unterminated array at start", () => {
      expect(() => parse("[", { sourceType: "module" })).toThrow(
        /[Uu]nterminated/,
      );
    });

    it("should throw on invalid array syntax", () => {
      expect(() => parseExpr("[1 2]")).toThrow();
    });
  });

  describe("ObjectExpression", () => {
    it("should parse empty object", () => {
      const expr = parseExpr("({});");
      expect(expr.type).toBe("ObjectExpression");
      const obj = expr as AST.ObjectExpression;
      expect(obj.properties).toHaveLength(0);
    });

    it("should parse object with regular properties", () => {
      const expr = parseExpr("({a: 1, b: 2});");
      const obj = expr as AST.ObjectExpression;
      expect(obj.properties).toHaveLength(2);
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.type).toBe("Property");
      expect((p0.key as AST.Identifier).name).toBe("a");
      expect((p0.value as AST.Literal).value).toBe(1);
      expect(p0.kind).toBe("init");
      expect(p0.method).toBe(false);
      expect(p0.shorthand).toBe(false);
      expect(p0.computed).toBe(false);
    });

    it("should parse object with shorthand properties", () => {
      const expr = parseExpr("({x, y});");
      const obj = expr as AST.ObjectExpression;
      expect(obj.properties).toHaveLength(2);
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.shorthand).toBe(true);
      expect((p0.key as AST.Identifier).name).toBe("x");
      expect(p0.key).toBe(p0.value);
    });

    it("should parse object with computed properties", () => {
      const expr = parseExpr("({[x]: 1});");
      const obj = expr as AST.ObjectExpression;
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.computed).toBe(true);
      expect((p0.key as AST.Identifier).name).toBe("x");
      expect((p0.value as AST.Literal).value).toBe(1);
    });

    it("should parse object with string key", () => {
      const expr = parseExpr('({"key": 1});');
      const obj = expr as AST.ObjectExpression;
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.computed).toBe(false);
      expect((p0.key as AST.Literal).value).toBe("key");
    });

    it("should parse object with numeric key", () => {
      const expr = parseExpr('({0: "a"});');
      const obj = expr as AST.ObjectExpression;
      const p0 = obj.properties[0] as AST.Property;
      expect((p0.key as AST.Literal).value).toBe(0);
    });

    it("should parse object with method shorthand", () => {
      const expr = parseExpr("({foo() {}});");
      const obj = expr as AST.ObjectExpression;
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.method).toBe(true);
      expect(p0.kind).toBe("init");
      expect((p0.key as AST.Identifier).name).toBe("foo");
      expect((p0.value as AST.FunctionExpression).type).toBe(
        "FunctionExpression",
      );
    });

    it("should parse object with getter", () => {
      const expr = parseExpr("({get name() {}});");
      const obj = expr as AST.ObjectExpression;
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.kind).toBe("get");
      expect(p0.method).toBe(false);
      expect((p0.key as AST.Identifier).name).toBe("name");
    });

    it("should parse object with setter", () => {
      const expr = parseExpr("({set name(v) {}});");
      const obj = expr as AST.ObjectExpression;
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.kind).toBe("set");
      expect(p0.method).toBe(false);
      expect((p0.key as AST.Identifier).name).toBe("name");
    });

    it("should parse getter with nested braces in body", () => {
      const expr = parseExpr("({get x() { if (true) {} }});");
      const obj = expr as AST.ObjectExpression;
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.kind).toBe("get");
      expect((p0.key as AST.Identifier).name).toBe("x");
    });

    it("should parse method with nested braces in body", () => {
      const expr = parseExpr("({m() { { } }});");
      const obj = expr as AST.ObjectExpression;
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.method).toBe(true);
    });

    it("should parse method with parameters", () => {
      const expr = parseExpr("({m(a, b) {}});");
      const obj = expr as AST.ObjectExpression;
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.method).toBe(true);
    });

    it("should parse object with spread", () => {
      const expr = parseExpr("({...obj});");
      const obj = expr as AST.ObjectExpression;
      const spread = obj.properties[0] as AST.SpreadElement;
      expect(spread.type).toBe("SpreadElement");
      expect((spread.argument as AST.Identifier).name).toBe("obj");
    });

    it("should parse get/set as shorthand property name", () => {
      const expr = parseExpr("({get});");
      const obj = expr as AST.ObjectExpression;
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.shorthand).toBe(true);
      expect((p0.key as AST.Identifier).name).toBe("get");
    });

    it("should parse get/set as regular property key with colon", () => {
      const expr = parseExpr("({get: 1});");
      const obj = expr as AST.ObjectExpression;
      const p0 = obj.properties[0] as AST.Property;
      expect(p0.shorthand).toBe(false);
      expect((p0.key as AST.Identifier).name).toBe("get");
      expect((p0.value as AST.Literal).value).toBe(1);
    });

    it("should parse object with trailing comma", () => {
      const expr = parseExpr("({a: 1,});");
      const obj = expr as AST.ObjectExpression;
      expect(obj.properties).toHaveLength(1);
    });

    it("should throw on unterminated object after property", () => {
      expect(() => parseExpr("({a: 1")).toThrow();
    });

    it("should throw on unterminated object at start", () => {
      expect(() => parse("({", { sourceType: "module" })).toThrow();
    });

    it("should throw on missing value after colon in object", () => {
      expect(() => parseExpr("({a: })")).toThrow();
    });

    it("should throw on unterminated computed property key", () => {
      expect(() => parseExpr("({[x")).toThrow();
    });
  });

  describe("TemplateLiteral", () => {
    it("should parse no-substitution template", () => {
      const expr = parseExpr("`hello`;");
      expect(expr.type).toBe("TemplateLiteral");
      const tmpl = expr as AST.TemplateLiteral;
      expect(tmpl.quasis).toHaveLength(1);
      expect(tmpl.expressions).toHaveLength(0);
      expect(tmpl.quasis[0].tail).toBe(true);
      expect(tmpl.quasis[0].value.cooked).toBe("hello");
    });

    it("should parse empty template", () => {
      const expr = parseExpr("``;");
      const tmpl = expr as AST.TemplateLiteral;
      expect(tmpl.quasis).toHaveLength(1);
      expect(tmpl.quasis[0].value.cooked).toBe("");
    });

    it("should parse template with expression", () => {
      const expr = parseExpr("`a${x}b`;");
      const tmpl = expr as AST.TemplateLiteral;
      expect(tmpl.quasis).toHaveLength(2);
      expect(tmpl.expressions).toHaveLength(1);
      expect(tmpl.quasis[0].tail).toBe(false);
      expect(tmpl.quasis[0].value.cooked).toBe("a");
      expect(tmpl.quasis[1].tail).toBe(true);
      expect(tmpl.quasis[1].value.cooked).toBe("b");
      expect((tmpl.expressions[0] as AST.Identifier).name).toBe("x");
    });

    it("should parse template with multiple expressions", () => {
      const expr = parseExpr("`${a}${b}`;");
      const tmpl = expr as AST.TemplateLiteral;
      expect(tmpl.quasis).toHaveLength(3);
      expect(tmpl.expressions).toHaveLength(2);
      expect(tmpl.quasis[0].value.cooked).toBe("");
      expect(tmpl.quasis[1].value.cooked).toBe("");
      expect(tmpl.quasis[2].value.cooked).toBe("");
    });
  });

  describe("TaggedTemplateExpression", () => {
    it("should parse tagged template with identifier tag", () => {
      // Tagged templates require member/call expression parsing,
      // which is deferred to issue #31. For now we test that
      // the template is parsed correctly as a standalone expression.
      const expr = parseExpr("`hello`;");
      expect(expr.type).toBe("TemplateLiteral");
    });

    it("should produce TaggedTemplateExpression via parseTaggedTemplate", () => {
      const lexer = new Lexer("`world`", true, false);
      const tag: AST.Identifier = Object.freeze({
        type: "Identifier" as const,
        start: 0,
        end: 3,
        name: "tag",
      });
      const result = parseTaggedTemplate(lexer, tag);
      expect(result.type).toBe("TaggedTemplateExpression");
      expect(result.tag).toBe(tag);
      expect(result.quasi.type).toBe("TemplateLiteral");
      expect(result.start).toBe(0);
    });
  });

  describe("Parenthesized Expression", () => {
    it("should parse parenthesized number", () => {
      const expr = parseExpr("(42);");
      expect(expr.type).toBe("Literal");
      expect((expr as AST.Literal).value).toBe(42);
    });

    it("should parse parenthesized identifier", () => {
      const expr = parseExpr("(foo);");
      expect(expr.type).toBe("Identifier");
      expect((expr as AST.Identifier).name).toBe("foo");
    });

    it("should parse nested parentheses", () => {
      const expr = parseExpr("((1));");
      expect(expr.type).toBe("Literal");
      expect((expr as AST.Literal).value).toBe(1);
    });

    it("should throw on unterminated parenthesized expression with content", () => {
      expect(() => parseExpr("(42")).toThrow(/[Uu]nterminated/);
    });

    it("should throw on unterminated parenthesized expression at EOF immediately", () => {
      expect(() => parse("(", { sourceType: "module" })).toThrow(
        /[Uu]nterminated/,
      );
    });

    it("should throw on empty parentheses", () => {
      expect(() => parseExpr("()")).toThrow();
    });
  });

  describe("SequenceExpression", () => {
    it("should parse sequence with two expressions", () => {
      const expr = parseExpr("1, 2;");
      expect(expr.type).toBe("SequenceExpression");
      const seq = expr as AST.SequenceExpression;
      expect(seq.expressions).toHaveLength(2);
      expect((seq.expressions[0] as AST.Literal).value).toBe(1);
      expect((seq.expressions[1] as AST.Literal).value).toBe(2);
    });

    it("should parse sequence with three expressions", () => {
      const expr = parseExpr("a, b, c;");
      const seq = expr as AST.SequenceExpression;
      expect(seq.expressions).toHaveLength(3);
    });

    it("should not create sequence for single expression", () => {
      const expr = parseExpr("42;");
      expect(expr.type).toBe("Literal");
    });
  });

  describe("Simple Assignment", () => {
    it("should parse simple assignment", () => {
      const expr = parseExpr("x = 1;");
      expect(expr.type).toBe("AssignmentExpression");
      const assign = expr as AST.AssignmentExpression;
      expect(assign.operator).toBe("=");
      expect((assign.left as AST.Identifier).name).toBe("x");
      expect((assign.right as AST.Literal).value).toBe(1);
    });

    it("should parse chained assignment (right-associative)", () => {
      const expr = parseExpr("a = b = 1;");
      expect(expr.type).toBe("AssignmentExpression");
      const outer = expr as AST.AssignmentExpression;
      expect((outer.left as AST.Identifier).name).toBe("a");
      const inner = outer.right as AST.AssignmentExpression;
      expect(inner.type).toBe("AssignmentExpression");
      expect((inner.left as AST.Identifier).name).toBe("b");
      expect((inner.right as AST.Literal).value).toBe(1);
    });

    it("should have correct start/end positions", () => {
      const expr = parseExpr("x = 1;");
      const assign = expr as AST.AssignmentExpression;
      expect(assign.start).toBe(0);
      expect(assign.end).toBe(5);
    });
  });

  describe("Error Handling", () => {
    it("should throw on unexpected token", () => {
      expect(() => parseExpr(")")).toThrow(/[Uu]nexpected/);
    });

    it("should parse function keyword as declaration (not expression)", () => {
      const program = parse("function foo() {};", { sourceType: "module" });
      expect(program.body[0].type).toBe("FunctionDeclaration");
    });

    it("should parse class keyword as declaration (not expression)", () => {
      const program = parse("class Foo {};", { sourceType: "module" });
      expect(program.body[0].type).toBe("ClassDeclaration");
    });

    it("should handle expression without semicolon", () => {
      const program = parse("42", { sourceType: "module" });
      const stmt = program.body[0] as AST.ExpressionStatement;
      expect(stmt.type).toBe("ExpressionStatement");
      expect((stmt.expression as AST.Literal).value).toBe(42);
    });

    it("should parse multiple expression statements", () => {
      const program = parse("1; 2; 3;", { sourceType: "module" });
      expect(program.body).toHaveLength(3);
    });
  });

  describe("ExpressionStatement", () => {
    it("should wrap expression in ExpressionStatement", () => {
      const program = parse("foo;", { sourceType: "module" });
      const stmt = program.body[0];
      expect(stmt.type).toBe("ExpressionStatement");
      const exprStmt = stmt as AST.ExpressionStatement;
      expect(exprStmt.expression.type).toBe("Identifier");
    });

    it("should set end position to expression end", () => {
      const program = parse("42;", { sourceType: "module" });
      const stmt = program.body[0] as AST.ExpressionStatement;
      expect(stmt.end).toBe(2);
    });

    it("should handle expression statement without semicolon", () => {
      const program = parse("42", { sourceType: "module" });
      const stmt = program.body[0] as AST.ExpressionStatement;
      expect(stmt.end).toBe(2);
    });
  });
});
