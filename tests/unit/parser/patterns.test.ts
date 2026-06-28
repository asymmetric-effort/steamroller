import { describe, it, expect } from "bun:test";
import { parse } from "../../../src/parser/parser.js";
import type * as AST from "../../../src/ast/types.js";
import {
  parseBindingPattern,
  parseArrayPattern,
  parseObjectPattern,
  expressionToPattern,
} from "../../../src/parser/patterns.js";
import { Lexer } from "../../../src/parser/lexer.js";

/**
 * Helper to parse source and return the first statement.
 */
const parseFirst = (source: string): AST.Statement | AST.ModuleDeclaration => {
  const program = parse(source);
  return program.body[0];
};

/**
 * Helper to parse a variable declaration and return the first declarator.
 */
const parseDeclarator = (source: string): AST.VariableDeclarator => {
  const stmt = parseFirst(source) as AST.VariableDeclaration;
  return stmt.declarations[0];
};

describe("patterns", () => {
  describe("parseBindingPattern", () => {
    it("should parse a simple identifier", () => {
      const lexer = new Lexer("x", true, false);
      const parseAssign = (): AST.Expression => {
        throw new Error("should not be called");
      };
      const result = parseBindingPattern(lexer, parseAssign);
      expect(result.type).toBe("Identifier");
      expect((result as AST.Identifier).name).toBe("x");
    });

    it("should throw on invalid binding pattern", () => {
      const lexer = new Lexer("123", true, false);
      const parseAssign = (): AST.Expression => {
        throw new Error("should not be called");
      };
      expect(() => parseBindingPattern(lexer, parseAssign)).toThrow(
        /binding pattern/,
      );
    });
  });

  describe("Array patterns in variable declarations", () => {
    it("should parse const [a, b] = arr", () => {
      const decl = parseDeclarator("const [a, b] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.type).toBe("ArrayPattern");
      expect(id.elements.length).toBe(2);
      expect((id.elements[0] as AST.Identifier).name).toBe("a");
      expect((id.elements[1] as AST.Identifier).name).toBe("b");
    });

    it("should parse const [a, , c] = arr (holes)", () => {
      const decl = parseDeclarator("const [a, , c] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.type).toBe("ArrayPattern");
      expect(id.elements.length).toBe(3);
      expect((id.elements[0] as AST.Identifier).name).toBe("a");
      expect(id.elements[1]).toBe(null);
      expect((id.elements[2] as AST.Identifier).name).toBe("c");
    });

    it("should parse const [...rest] = arr", () => {
      const decl = parseDeclarator("const [...rest] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.type).toBe("ArrayPattern");
      expect(id.elements.length).toBe(1);
      const rest = id.elements[0] as AST.RestElement;
      expect(rest.type).toBe("RestElement");
      expect((rest.argument as AST.Identifier).name).toBe("rest");
    });

    it("should parse const [a, ...rest] = arr", () => {
      const decl = parseDeclarator("const [a, ...rest] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.elements.length).toBe(2);
      expect((id.elements[0] as AST.Identifier).name).toBe("a");
      const rest = id.elements[1] as AST.RestElement;
      expect(rest.type).toBe("RestElement");
      expect((rest.argument as AST.Identifier).name).toBe("rest");
    });

    it("should parse const [a = 1] = arr (default)", () => {
      const decl = parseDeclarator("const [a = 1] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.elements.length).toBe(1);
      const elem = id.elements[0] as AST.AssignmentPattern;
      expect(elem.type).toBe("AssignmentPattern");
      expect((elem.left as AST.Identifier).name).toBe("a");
      expect((elem.right as AST.Literal).value).toBe(1);
    });

    it("should parse const [[a, b]] = arr (nested)", () => {
      const decl = parseDeclarator("const [[a, b]] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.elements.length).toBe(1);
      const inner = id.elements[0] as AST.ArrayPattern;
      expect(inner.type).toBe("ArrayPattern");
      expect(inner.elements.length).toBe(2);
      expect((inner.elements[0] as AST.Identifier).name).toBe("a");
      expect((inner.elements[1] as AST.Identifier).name).toBe("b");
    });

    it("should parse const [a = 1, b = 2] = arr (multiple defaults)", () => {
      const decl = parseDeclarator("const [a = 1, b = 2] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.elements.length).toBe(2);
      const first = id.elements[0] as AST.AssignmentPattern;
      expect(first.type).toBe("AssignmentPattern");
      expect((first.left as AST.Identifier).name).toBe("a");
      const second = id.elements[1] as AST.AssignmentPattern;
      expect(second.type).toBe("AssignmentPattern");
      expect((second.left as AST.Identifier).name).toBe("b");
    });

    it("should parse const [{a}] = arr (array with nested object)", () => {
      const decl = parseDeclarator("const [{a}] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.elements.length).toBe(1);
      const inner = id.elements[0] as AST.ObjectPattern;
      expect(inner.type).toBe("ObjectPattern");
    });

    it("should have correct start/end positions", () => {
      const decl = parseDeclarator("const [a, b] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.start).toBe(6);
      expect(id.end).toBe(12);
    });

    it("should throw on unterminated array pattern", () => {
      expect(() => parse("const [a, b")).toThrow(/Unterminated|Expected/);
    });
  });

  describe("Object patterns in variable declarations", () => {
    it("should parse const { a, b } = obj", () => {
      const decl = parseDeclarator("const { a, b } = obj;");
      const id = decl.id as AST.ObjectPattern;
      expect(id.type).toBe("ObjectPattern");
      expect(id.properties.length).toBe(2);
      const prop0 = id.properties[0] as AST.Property;
      expect(prop0.shorthand).toBe(true);
      expect((prop0.key as AST.Identifier).name).toBe("a");
      const prop1 = id.properties[1] as AST.Property;
      expect(prop1.shorthand).toBe(true);
      expect((prop1.key as AST.Identifier).name).toBe("b");
    });

    it("should parse const { a: x } = obj (rename)", () => {
      const decl = parseDeclarator("const { a: x } = obj;");
      const id = decl.id as AST.ObjectPattern;
      const prop = id.properties[0] as AST.Property;
      expect(prop.shorthand).toBe(false);
      expect((prop.key as AST.Identifier).name).toBe("a");
      expect((prop.value as AST.Identifier).name).toBe("x");
    });

    it("should parse const { a = 1 } = obj (default)", () => {
      const decl = parseDeclarator("const { a = 1 } = obj;");
      const id = decl.id as AST.ObjectPattern;
      const prop = id.properties[0] as AST.Property;
      expect(prop.shorthand).toBe(true);
      const value = prop.value as AST.AssignmentPattern;
      expect(value.type).toBe("AssignmentPattern");
      expect((value.left as AST.Identifier).name).toBe("a");
      expect((value.right as AST.Literal).value).toBe(1);
    });

    it("should parse const { ...rest } = obj (rest)", () => {
      const decl = parseDeclarator("const { ...rest } = obj;");
      const id = decl.id as AST.ObjectPattern;
      expect(id.properties.length).toBe(1);
      const rest = id.properties[0] as AST.RestElement;
      expect(rest.type).toBe("RestElement");
      expect((rest.argument as AST.Identifier).name).toBe("rest");
    });

    it("should parse const { a: { b } } = obj (nested)", () => {
      const decl = parseDeclarator("const { a: { b } } = obj;");
      const id = decl.id as AST.ObjectPattern;
      const prop = id.properties[0] as AST.Property;
      expect(prop.shorthand).toBe(false);
      expect((prop.key as AST.Identifier).name).toBe("a");
      const nested = prop.value as AST.ObjectPattern;
      expect(nested.type).toBe("ObjectPattern");
      expect(nested.properties.length).toBe(1);
      const innerProp = nested.properties[0] as AST.Property;
      expect((innerProp.key as AST.Identifier).name).toBe("b");
    });

    it("should parse const { [key]: value } = obj (computed)", () => {
      const decl = parseDeclarator("const { [key]: value } = obj;");
      const id = decl.id as AST.ObjectPattern;
      const prop = id.properties[0] as AST.Property;
      expect(prop.computed).toBe(true);
      expect((prop.key as AST.Identifier).name).toBe("key");
      expect((prop.value as AST.Identifier).name).toBe("value");
    });

    it("should parse const { a: x = 1 } = obj (rename with default)", () => {
      const decl = parseDeclarator("const { a: x = 1 } = obj;");
      const id = decl.id as AST.ObjectPattern;
      const prop = id.properties[0] as AST.Property;
      expect(prop.shorthand).toBe(false);
      expect((prop.key as AST.Identifier).name).toBe("a");
      const value = prop.value as AST.AssignmentPattern;
      expect(value.type).toBe("AssignmentPattern");
      expect((value.left as AST.Identifier).name).toBe("x");
      expect((value.right as AST.Literal).value).toBe(1);
    });

    it("should parse const { a, b, ...rest } = obj", () => {
      const decl = parseDeclarator("const { a, b, ...rest } = obj;");
      const id = decl.id as AST.ObjectPattern;
      expect(id.properties.length).toBe(3);
      expect((id.properties[0] as AST.Property).shorthand).toBe(true);
      expect((id.properties[1] as AST.Property).shorthand).toBe(true);
      expect(id.properties[2].type).toBe("RestElement");
    });

    it("should parse const { a: [x, y] } = obj (nested array in object)", () => {
      const decl = parseDeclarator("const { a: [x, y] } = obj;");
      const id = decl.id as AST.ObjectPattern;
      const prop = id.properties[0] as AST.Property;
      const nested = prop.value as AST.ArrayPattern;
      expect(nested.type).toBe("ArrayPattern");
      expect(nested.elements.length).toBe(2);
    });

    it("should have correct start/end positions", () => {
      const decl = parseDeclarator("const { a } = obj;");
      const id = decl.id as AST.ObjectPattern;
      expect(id.start).toBe(6);
      expect(id.end).toBe(11);
    });

    it("should throw on unterminated object pattern", () => {
      expect(() => parse("const { a, b")).toThrow(/Unterminated|Expected/);
    });

    it("should parse string literal key in object pattern", () => {
      const decl = parseDeclarator("const { 'foo': x } = obj;");
      const id = decl.id as AST.ObjectPattern;
      const prop = id.properties[0] as AST.Property;
      expect(prop.computed).toBe(false);
      expect((prop.key as AST.Literal).value).toBe("foo");
      expect((prop.value as AST.Identifier).name).toBe("x");
    });

    it("should parse numeric literal key in object pattern", () => {
      const decl = parseDeclarator("const { 0: x } = obj;");
      const id = decl.id as AST.ObjectPattern;
      const prop = id.properties[0] as AST.Property;
      expect(prop.computed).toBe(false);
      expect((prop.key as AST.Literal).value).toBe(0);
      expect((prop.value as AST.Identifier).name).toBe("x");
    });
  });

  describe("Assignment patterns (expressionToPattern)", () => {
    it("should parse [a, b] = arr (array destructuring assignment)", () => {
      const stmt = parseFirst("[a, b] = arr;") as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      expect(expr.type).toBe("AssignmentExpression");
      expect(expr.operator).toBe("=");
      const left = expr.left as AST.ArrayPattern;
      expect(left.type).toBe("ArrayPattern");
      expect(left.elements.length).toBe(2);
      expect((left.elements[0] as AST.Identifier).name).toBe("a");
      expect((left.elements[1] as AST.Identifier).name).toBe("b");
    });

    it("should parse ({ a, b } = obj) as expression statement", () => {
      // Parenthesized to avoid block interpretation
      const stmt = parseFirst("({ a, b } = obj);") as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      expect(expr.type).toBe("AssignmentExpression");
      expect(expr.operator).toBe("=");
      const left = expr.left as AST.ObjectPattern;
      expect(left.type).toBe("ObjectPattern");
      expect(left.properties.length).toBe(2);
    });

    it("should convert nested array expression to pattern", () => {
      const stmt = parseFirst("[[a, b]] = arr;") as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      const left = expr.left as AST.ArrayPattern;
      expect(left.type).toBe("ArrayPattern");
      const inner = left.elements[0] as AST.ArrayPattern;
      expect(inner.type).toBe("ArrayPattern");
    });

    it("should convert spread to rest in assignment pattern", () => {
      const stmt = parseFirst("[a, ...b] = arr;") as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      const left = expr.left as AST.ArrayPattern;
      expect(left.elements.length).toBe(2);
      const rest = left.elements[1] as AST.RestElement;
      expect(rest.type).toBe("RestElement");
      expect((rest.argument as AST.Identifier).name).toBe("b");
    });

    it("should convert object spread to rest in assignment pattern", () => {
      const stmt = parseFirst(
        "({ a, ...b } = obj);",
      ) as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      const left = expr.left as AST.ObjectPattern;
      expect(left.properties.length).toBe(2);
      const rest = left.properties[1] as AST.RestElement;
      expect(rest.type).toBe("RestElement");
    });

    it("should handle assignment with default in array", () => {
      const stmt = parseFirst("[a = 1] = arr;") as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      const left = expr.left as AST.ArrayPattern;
      const elem = left.elements[0] as AST.AssignmentPattern;
      expect(elem.type).toBe("AssignmentPattern");
      expect((elem.left as AST.Identifier).name).toBe("a");
      expect((elem.right as AST.Literal).value).toBe(1);
    });

    it("should not convert for compound assignment operators", () => {
      const stmt = parseFirst("a += 1;") as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      expect(expr.operator).toBe("+=");
      expect(expr.left.type).toBe("Identifier");
    });

    it("should handle member expression as valid assignment target", () => {
      const stmt = parseFirst("[a.b] = arr;") as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      const left = expr.left as AST.ArrayPattern;
      const elem = left.elements[0] as AST.MemberExpression;
      expect(elem.type).toBe("MemberExpression");
    });

    it("should handle holes in array assignment pattern", () => {
      const stmt = parseFirst("[, a] = arr;") as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      const left = expr.left as AST.ArrayPattern;
      expect(left.elements[0]).toBe(null);
      expect((left.elements[1] as AST.Identifier).name).toBe("a");
    });
  });

  describe("Function parameters with destructuring", () => {
    it("should parse function foo([a, b]) {}", () => {
      const stmt = parseFirst(
        "function foo([a, b]) {}",
      ) as AST.FunctionDeclaration;
      expect(stmt.params.length).toBe(1);
      const param = stmt.params[0] as AST.ArrayPattern;
      expect(param.type).toBe("ArrayPattern");
      expect(param.elements.length).toBe(2);
      expect((param.elements[0] as AST.Identifier).name).toBe("a");
      expect((param.elements[1] as AST.Identifier).name).toBe("b");
    });

    it("should parse function foo({ a, b }) {}", () => {
      const stmt = parseFirst(
        "function foo({ a, b }) {}",
      ) as AST.FunctionDeclaration;
      expect(stmt.params.length).toBe(1);
      const param = stmt.params[0] as AST.ObjectPattern;
      expect(param.type).toBe("ObjectPattern");
      expect(param.properties.length).toBe(2);
    });

    it("should parse function foo({ a = 1 }) {}", () => {
      const stmt = parseFirst(
        "function foo({ a = 1 }) {}",
      ) as AST.FunctionDeclaration;
      const param = stmt.params[0] as AST.ObjectPattern;
      const prop = param.properties[0] as AST.Property;
      const value = prop.value as AST.AssignmentPattern;
      expect(value.type).toBe("AssignmentPattern");
      expect((value.right as AST.Literal).value).toBe(1);
    });

    it("should parse function foo([a, ...rest]) {}", () => {
      const stmt = parseFirst(
        "function foo([a, ...rest]) {}",
      ) as AST.FunctionDeclaration;
      const param = stmt.params[0] as AST.ArrayPattern;
      expect(param.elements.length).toBe(2);
      const rest = param.elements[1] as AST.RestElement;
      expect(rest.type).toBe("RestElement");
      expect((rest.argument as AST.Identifier).name).toBe("rest");
    });

    it("should parse function foo({ a: { b } }) {} (nested)", () => {
      const stmt = parseFirst(
        "function foo({ a: { b } }) {}",
      ) as AST.FunctionDeclaration;
      const param = stmt.params[0] as AST.ObjectPattern;
      const prop = param.properties[0] as AST.Property;
      const nested = prop.value as AST.ObjectPattern;
      expect(nested.type).toBe("ObjectPattern");
    });

    it("should parse mixed params: function foo(x, { a }, [b]) {}", () => {
      const stmt = parseFirst(
        "function foo(x, { a }, [b]) {}",
      ) as AST.FunctionDeclaration;
      expect(stmt.params.length).toBe(3);
      expect(stmt.params[0].type).toBe("Identifier");
      expect(stmt.params[1].type).toBe("ObjectPattern");
      expect(stmt.params[2].type).toBe("ArrayPattern");
    });

    it("should parse arrow function with destructuring: ([a, b]) => a", () => {
      const stmt = parseFirst(
        "const f = ([a, b]) => a;",
      ) as AST.VariableDeclaration;
      const init = stmt.declarations[0].init as AST.ArrowFunctionExpression;
      expect(init.params.length).toBe(1);
      const param = init.params[0] as AST.ArrayPattern;
      expect(param.type).toBe("ArrayPattern");
    });

    it("should parse arrow function with object destructuring: ({ a }) => a", () => {
      const stmt = parseFirst(
        "const f = ({ a }) => a;",
      ) as AST.VariableDeclaration;
      const init = stmt.declarations[0].init as AST.ArrowFunctionExpression;
      expect(init.params.length).toBe(1);
      const param = init.params[0] as AST.ObjectPattern;
      expect(param.type).toBe("ObjectPattern");
    });

    it("should parse function with destructuring and default for the whole param", () => {
      const stmt = parseFirst(
        "function foo({ a } = {}) {}",
      ) as AST.FunctionDeclaration;
      expect(stmt.params.length).toBe(1);
      const param = stmt.params[0] as AST.AssignmentPattern;
      expect(param.type).toBe("AssignmentPattern");
      expect(param.left.type).toBe("ObjectPattern");
    });

    it("should parse rest with destructuring: function foo(...[a, b]) {}", () => {
      const stmt = parseFirst(
        "function foo(...[a, b]) {}",
      ) as AST.FunctionDeclaration;
      expect(stmt.params.length).toBe(1);
      const rest = stmt.params[0] as AST.RestElement;
      expect(rest.type).toBe("RestElement");
      const arg = rest.argument as AST.ArrayPattern;
      expect(arg.type).toBe("ArrayPattern");
    });
  });

  describe("For-of/for-in with destructuring", () => {
    it("should parse for (const { a } of items) {}", () => {
      const stmt = parseFirst(
        "for (const { a } of items) {}",
      ) as AST.ForOfStatement;
      expect(stmt.type).toBe("ForOfStatement");
      const left = stmt.left as AST.VariableDeclaration;
      const id = left.declarations[0].id as AST.ObjectPattern;
      expect(id.type).toBe("ObjectPattern");
    });

    it("should parse for (const [a, b] of items) {}", () => {
      const stmt = parseFirst(
        "for (const [a, b] of items) {}",
      ) as AST.ForOfStatement;
      const left = stmt.left as AST.VariableDeclaration;
      const id = left.declarations[0].id as AST.ArrayPattern;
      expect(id.type).toBe("ArrayPattern");
    });

    it("should parse for (const { a: x } in obj) {}", () => {
      const stmt = parseFirst(
        "for (const { a: x } in obj) {}",
      ) as AST.ForInStatement;
      expect(stmt.type).toBe("ForInStatement");
      const left = stmt.left as AST.VariableDeclaration;
      const id = left.declarations[0].id as AST.ObjectPattern;
      expect(id.type).toBe("ObjectPattern");
    });
  });

  describe("expressionToPattern direct", () => {
    it("should convert Identifier to itself", () => {
      const id: AST.Identifier = Object.freeze({
        type: "Identifier" as const,
        name: "x",
        start: 0,
        end: 1,
      });
      const result = expressionToPattern(id);
      expect(result).toBe(id);
    });

    it("should convert MemberExpression to itself", () => {
      const member: AST.MemberExpression = Object.freeze({
        type: "MemberExpression" as const,
        object: Object.freeze({
          type: "Identifier" as const,
          name: "a",
          start: 0,
          end: 1,
        }),
        property: Object.freeze({
          type: "Identifier" as const,
          name: "b",
          start: 2,
          end: 3,
        }),
        computed: false,
        optional: false,
        start: 0,
        end: 3,
      });
      const result = expressionToPattern(member);
      expect(result).toBe(member);
    });

    it("should throw on invalid expression type", () => {
      const lit: AST.Literal = Object.freeze({
        type: "Literal" as const,
        value: 42,
        raw: "42",
        start: 0,
        end: 2,
      });
      expect(() => expressionToPattern(lit)).toThrow(/Invalid destructuring/);
    });

    it("should throw on compound assignment in destructuring", () => {
      const assign: AST.AssignmentExpression = Object.freeze({
        type: "AssignmentExpression" as const,
        operator: "+=" as const,
        left: Object.freeze({
          type: "Identifier" as const,
          name: "a",
          start: 0,
          end: 1,
        }),
        right: Object.freeze({
          type: "Literal" as const,
          value: 1,
          raw: "1",
          start: 4,
          end: 5,
        }),
        start: 0,
        end: 5,
      });
      expect(() => expressionToPattern(assign)).toThrow(
        /Invalid destructuring assignment operator/,
      );
    });
  });

  describe("parseArrayPattern direct", () => {
    it("should parse an empty array pattern", () => {
      const lexer = new Lexer("[]", true, false);
      const parseAssign = (): AST.Expression => {
        throw new Error("should not be called");
      };
      const result = parseArrayPattern(lexer, parseAssign);
      expect(result.type).toBe("ArrayPattern");
      expect(result.elements.length).toBe(0);
    });
  });

  describe("parseObjectPattern direct", () => {
    it("should parse an empty object pattern", () => {
      const lexer = new Lexer("{}", true, false);
      const parseAssign = (): AST.Expression => {
        throw new Error("should not be called");
      };
      const result = parseObjectPattern(lexer, parseAssign);
      expect(result.type).toBe("ObjectPattern");
      expect(result.properties.length).toBe(0);
    });
  });

  describe("expressionToPattern nested conversions", () => {
    it("should convert nested object in array for assignment", () => {
      const stmt = parseFirst("[{a}] = arr;") as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      const left = expr.left as AST.ArrayPattern;
      const elem = left.elements[0] as AST.ObjectPattern;
      expect(elem.type).toBe("ObjectPattern");
    });

    it("should throw on invalid nested expression in array assignment", () => {
      // 1 + 2 cannot be a pattern
      expect(() => parse("[1 + 2] = arr;")).toThrow(/Invalid destructuring/);
    });

    it("should throw on compound assignment nested in array assignment", () => {
      // a += 1 as a nested element is invalid
      expect(() => parse("[a += 1] = arr;")).toThrow(
        /Invalid destructuring assignment operator/,
      );
    });

    it("should convert nested object expression in object property value", () => {
      const stmt = parseFirst("({a: {b}} = obj);") as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      const left = expr.left as AST.ObjectPattern;
      const prop = left.properties[0] as AST.Property;
      const nested = prop.value as AST.ObjectPattern;
      expect(nested.type).toBe("ObjectPattern");
    });

    it("should handle assignment expression (default) nested in assignment pattern", () => {
      const stmt = parseFirst("({a: b = 1} = obj);") as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      const left = expr.left as AST.ObjectPattern;
      const prop = left.properties[0] as AST.Property;
      const value = prop.value as AST.AssignmentPattern;
      expect(value.type).toBe("AssignmentPattern");
      expect((value.left as AST.Identifier).name).toBe("b");
    });
  });

  describe("Edge cases", () => {
    it("should parse deeply nested patterns without stack overflow", () => {
      // Tests the iterative approach - 5 levels deep
      const decl = parseDeclarator("const [[[[[ a ]]]]] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.type).toBe("ArrayPattern");
      const l1 = id.elements[0] as AST.ArrayPattern;
      const l2 = l1.elements[0] as AST.ArrayPattern;
      const l3 = l2.elements[0] as AST.ArrayPattern;
      const l4 = l3.elements[0] as AST.ArrayPattern;
      expect((l4.elements[0] as AST.Identifier).name).toBe("a");
    });

    it("should parse deeply nested object patterns", () => {
      const decl = parseDeclarator("const { a: { b: { c: { d } } } } = obj;");
      const id = decl.id as AST.ObjectPattern;
      const p1 = id.properties[0] as AST.Property;
      const l1 = p1.value as AST.ObjectPattern;
      const p2 = l1.properties[0] as AST.Property;
      const l2 = p2.value as AST.ObjectPattern;
      const p3 = l2.properties[0] as AST.Property;
      const l3 = p3.value as AST.ObjectPattern;
      const p4 = l3.properties[0] as AST.Property;
      expect((p4.key as AST.Identifier).name).toBe("d");
    });

    it("should parse multiple declarators with patterns", () => {
      const stmt = parseFirst(
        "const { a } = obj, [b] = arr;",
      ) as AST.VariableDeclaration;
      expect(stmt.declarations.length).toBe(2);
      expect(stmt.declarations[0].id.type).toBe("ObjectPattern");
      expect(stmt.declarations[1].id.type).toBe("ArrayPattern");
    });

    it("should correctly handle trailing comma in array pattern", () => {
      const decl = parseDeclarator("const [a, b,] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.elements.length).toBe(2);
    });

    it("should correctly handle trailing comma in object pattern", () => {
      const decl = parseDeclarator("const { a, b, } = obj;");
      const id = decl.id as AST.ObjectPattern;
      expect(id.properties.length).toBe(2);
    });

    it("should handle trailing comma after rest in object pattern", () => {
      const decl = parseDeclarator("const { ...rest, } = obj;");
      const id = decl.id as AST.ObjectPattern;
      expect(id.properties.length).toBe(1);
      expect(id.properties[0].type).toBe("RestElement");
    });

    it("should handle trailing comma after rest in array pattern", () => {
      const decl = parseDeclarator("const [...rest,] = arr;");
      const id = decl.id as AST.ArrayPattern;
      expect(id.elements.length).toBe(1);
      const rest = id.elements[0] as AST.RestElement;
      expect(rest.type).toBe("RestElement");
    });

    it("should handle assignment expression with = in nested assignment target", () => {
      // [a = 1, b = 2] = arr - the inner a = 1 is AssignmentExpression converted to AssignmentPattern
      const stmt = parseFirst(
        "[a = 1, b = 2] = arr;",
      ) as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      const left = expr.left as AST.ArrayPattern;
      const first = left.elements[0] as AST.AssignmentPattern;
      expect(first.type).toBe("AssignmentPattern");
      expect((first.left as AST.Identifier).name).toBe("a");
      const second = left.elements[1] as AST.AssignmentPattern;
      expect(second.type).toBe("AssignmentPattern");
      expect((second.left as AST.Identifier).name).toBe("b");
    });

    it("should throw for unterminated array pattern at EOF", () => {
      expect(() => parse("const [a")).toThrow();
    });

    it("should throw unterminated array pattern with comma before EOF", () => {
      expect(() => parse("const [a,")).toThrow();
    });

    it("should throw for unterminated array pattern via direct call", () => {
      const lexer = new Lexer("[a,", true, false);
      const parseAssign = (): AST.Expression => {
        // Skip tokens
        lexer.next();
        return Object.freeze({
          type: "Identifier" as const,
          name: "a",
          start: 1,
          end: 2,
        });
      };
      expect(() => parseArrayPattern(lexer, parseAssign)).toThrow(
        /Unterminated array pattern/,
      );
    });

    it("should throw for unterminated object pattern at EOF", () => {
      expect(() => parse("const {a")).toThrow();
    });

    it("should throw for unterminated object pattern after comma", () => {
      expect(() => parse("const {a,")).toThrow();
    });

    it("should handle nested default in object assignment pattern", () => {
      // ({a: b = 1, c: d = 2} = obj) - triggers expressionToPatternShallow AssignmentExpression path
      const stmt = parseFirst(
        "({a: b = 1, c: d = 2} = obj);",
      ) as AST.ExpressionStatement;
      const expr = stmt.expression as AST.AssignmentExpression;
      const left = expr.left as AST.ObjectPattern;
      const prop0 = left.properties[0] as AST.Property;
      const val0 = prop0.value as AST.AssignmentPattern;
      expect(val0.type).toBe("AssignmentPattern");
      expect((val0.left as AST.Identifier).name).toBe("b");
      const prop1 = left.properties[1] as AST.Property;
      const val1 = prop1.value as AST.AssignmentPattern;
      expect(val1.type).toBe("AssignmentPattern");
      expect((val1.left as AST.Identifier).name).toBe("d");
    });

    it("should convert assignment expression in array element via expressionToPattern", () => {
      // Directly test expressionToPattern with an ArrayExpression containing AssignmentExpression
      const innerAssign = {
        type: "AssignmentExpression" as const,
        operator: "=" as const,
        left: {
          type: "Identifier" as const,
          name: "a",
          start: 1,
          end: 2,
        },
        right: {
          type: "Literal" as const,
          value: 1,
          raw: "1",
          start: 5,
          end: 6,
        },
        start: 1,
        end: 6,
      };
      const arrExpr = {
        type: "ArrayExpression" as const,
        start: 0,
        end: 10,
        elements: [innerAssign as AST.Expression],
      };
      const result = expressionToPattern(
        arrExpr as unknown as AST.Expression,
      ) as AST.ArrayPattern;
      expect(result.type).toBe("ArrayPattern");
      const elem = result.elements[0] as AST.AssignmentPattern;
      expect(elem.type).toBe("AssignmentPattern");
      expect((elem.left as AST.Identifier).name).toBe("a");
      expect((elem.right as AST.Literal).value).toBe(1);
    });

    it("should convert assignment expression in object prop via expressionToPattern", () => {
      // Object with a property whose value is an AssignmentExpression
      const innerAssign = {
        type: "AssignmentExpression" as const,
        operator: "=" as const,
        left: {
          type: "Identifier" as const,
          name: "b",
          start: 4,
          end: 5,
        },
        right: {
          type: "Literal" as const,
          value: 2,
          raw: "2",
          start: 8,
          end: 9,
        },
        start: 4,
        end: 9,
      };
      const objExpr = {
        type: "ObjectExpression" as const,
        start: 0,
        end: 12,
        properties: [
          {
            type: "Property" as const,
            key: {
              type: "Identifier" as const,
              name: "a",
              start: 1,
              end: 2,
            },
            value: innerAssign as AST.Expression,
            kind: "init" as const,
            method: false,
            shorthand: false,
            computed: false,
            start: 1,
            end: 9,
          },
        ],
      };
      const result = expressionToPattern(
        objExpr as unknown as AST.Expression,
      ) as AST.ObjectPattern;
      expect(result.type).toBe("ObjectPattern");
      const prop = result.properties[0] as AST.Property;
      const value = prop.value as AST.AssignmentPattern;
      expect(value.type).toBe("AssignmentPattern");
      expect((value.left as AST.Identifier).name).toBe("b");
    });
  });
});
