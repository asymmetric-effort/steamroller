/**
 * Unit tests for dynamic import expressions and meta properties.
 *
 * Covers:
 * - import() → ImportExpression
 * - import.meta → MetaProperty
 * - import.meta.url → MemberExpression with MetaProperty object
 * - new.target → MetaProperty
 * - Error: import.foo (only "meta" is valid after import.)
 *
 * @module tests/unit/parser/dynamic-import
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../../src/parser/parser.js";
import type * as AST from "../../../src/ast/types.js";

/**
 * Helper to parse an expression from an expression statement.
 *
 * @param source - Source code containing a single expression statement.
 * @returns The parsed expression node.
 */
const parseExpr = (source: string): AST.Expression => {
  const program = parse(source, { sourceType: "module" });
  expect(program.body.length).toBeGreaterThan(0);
  const stmt = program.body[0];
  expect(stmt.type).toBe("ExpressionStatement");
  return (stmt as AST.ExpressionStatement).expression;
};

describe("Dynamic Import and Meta Properties", () => {
  describe("import() - ImportExpression", () => {
    it("should parse import('module') as ImportExpression", () => {
      const expr = parseExpr("import('module');") as AST.ImportExpression;
      expect(expr.type).toBe("ImportExpression");
      expect(expr.source.type).toBe("Literal");
      expect((expr.source as AST.Literal).value).toBe("module");
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(16);
    });

    it("should parse import('./path/' + name) with BinaryExpression source", () => {
      const expr = parseExpr(
        "import('./path/' + name);",
      ) as AST.ImportExpression;
      expect(expr.type).toBe("ImportExpression");
      expect(expr.source.type).toBe("BinaryExpression");
      const bin = expr.source as AST.BinaryExpression;
      expect(bin.operator).toBe("+");
      expect((bin.left as AST.Literal).value).toBe("./path/");
      expect((bin.right as AST.Identifier).name).toBe("name");
    });

    it("should parse import(url) with identifier source", () => {
      const expr = parseExpr("import(url);") as AST.ImportExpression;
      expect(expr.type).toBe("ImportExpression");
      expect(expr.source.type).toBe("Identifier");
      expect((expr.source as AST.Identifier).name).toBe("url");
    });

    it("should parse import() with template literal source", () => {
      const expr = parseExpr("import(`./mod.js`);") as AST.ImportExpression;
      expect(expr.type).toBe("ImportExpression");
      expect(expr.source.type).toBe("TemplateLiteral");
    });

    it("should parse import() with conditional expression source", () => {
      const expr = parseExpr(
        "import(cond ? './a.js' : './b.js');",
      ) as AST.ImportExpression;
      expect(expr.type).toBe("ImportExpression");
      expect(expr.source.type).toBe("ConditionalExpression");
    });

    it("should parse import() followed by .then()", () => {
      const expr = parseExpr(
        "import('module').then(m => m);",
      ) as AST.CallExpression;
      expect(expr.type).toBe("CallExpression");
      const callee = expr.callee as AST.MemberExpression;
      expect(callee.type).toBe("MemberExpression");
      expect(callee.object.type).toBe("ImportExpression");
      expect((callee.property as AST.Identifier).name).toBe("then");
    });

    it("should parse import() in assignment", () => {
      const program = parse("const p = import('x');", { sourceType: "module" });
      const decl = program.body[0] as AST.VariableDeclaration;
      expect(decl.type).toBe("VariableDeclaration");
      const init = decl.declarations[0].init as AST.ImportExpression;
      expect(init.type).toBe("ImportExpression");
      expect((init.source as AST.Literal).value).toBe("x");
    });

    it("should parse import() with complex expression source", () => {
      const expr = parseExpr("import(getPath());") as AST.ImportExpression;
      expect(expr.type).toBe("ImportExpression");
      expect(expr.source.type).toBe("CallExpression");
    });

    it("should have correct start and end positions", () => {
      const expr = parseExpr("import('x');") as AST.ImportExpression;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(11);
    });
  });

  describe("import.meta - MetaProperty", () => {
    it("should parse import.meta as MetaProperty", () => {
      const expr = parseExpr("import.meta;") as AST.MetaProperty;
      expect(expr.type).toBe("MetaProperty");
      expect(expr.meta.type).toBe("Identifier");
      expect(expr.meta.name).toBe("import");
      expect(expr.property.type).toBe("Identifier");
      expect(expr.property.name).toBe("meta");
    });

    it("should parse import.meta.url as MemberExpression with MetaProperty object", () => {
      const expr = parseExpr("import.meta.url;") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect(expr.computed).toBe(false);
      expect((expr.property as AST.Identifier).name).toBe("url");
      const obj = expr.object as AST.MetaProperty;
      expect(obj.type).toBe("MetaProperty");
      expect(obj.meta.name).toBe("import");
      expect(obj.property.name).toBe("meta");
    });

    it("should parse import.meta.env.MODE with nested member access", () => {
      const expr = parseExpr("import.meta.env.MODE;") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect((expr.property as AST.Identifier).name).toBe("MODE");

      const mid = expr.object as AST.MemberExpression;
      expect(mid.type).toBe("MemberExpression");
      expect((mid.property as AST.Identifier).name).toBe("env");

      const metaProp = mid.object as AST.MetaProperty;
      expect(metaProp.type).toBe("MetaProperty");
      expect(metaProp.meta.name).toBe("import");
      expect(metaProp.property.name).toBe("meta");
    });

    it("should have correct positions for import.meta", () => {
      const expr = parseExpr("import.meta;") as AST.MetaProperty;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(11);
      expect(expr.meta.start).toBe(0);
      expect(expr.meta.end).toBe(6);
      expect(expr.property.start).toBe(7);
      expect(expr.property.end).toBe(11);
    });

    it("should parse import.meta in variable declaration", () => {
      const program = parse("const url = import.meta.url;", {
        sourceType: "module",
      });
      const decl = program.body[0] as AST.VariableDeclaration;
      const init = decl.declarations[0].init as AST.MemberExpression;
      expect(init.type).toBe("MemberExpression");
      expect(init.object.type).toBe("MetaProperty");
    });

    it("should parse import.meta with computed access", () => {
      const expr = parseExpr("import.meta['url'];") as AST.MemberExpression;
      expect(expr.type).toBe("MemberExpression");
      expect(expr.computed).toBe(true);
      expect(expr.object.type).toBe("MetaProperty");
      expect((expr.property as AST.Literal).value).toBe("url");
    });
  });

  describe("new.target - MetaProperty", () => {
    it("should parse new.target as MetaProperty", () => {
      const expr = parseExpr("new.target;") as AST.MetaProperty;
      expect(expr.type).toBe("MetaProperty");
      expect(expr.meta.type).toBe("Identifier");
      expect(expr.meta.name).toBe("new");
      expect(expr.property.type).toBe("Identifier");
      expect(expr.property.name).toBe("target");
    });

    it("should have correct positions for new.target", () => {
      const expr = parseExpr("new.target;") as AST.MetaProperty;
      expect(expr.start).toBe(0);
      expect(expr.end).toBe(10);
      expect(expr.meta.start).toBe(0);
      expect(expr.meta.end).toBe(3);
      expect(expr.property.start).toBe(4);
      expect(expr.property.end).toBe(10);
    });

    it("should parse new.target in conditional", () => {
      const expr = parseExpr(
        "new.target ? 'yes' : 'no';",
      ) as AST.ConditionalExpression;
      expect(expr.type).toBe("ConditionalExpression");
      const test = expr.test as AST.MetaProperty;
      expect(test.type).toBe("MetaProperty");
      expect(test.meta.name).toBe("new");
      expect(test.property.name).toBe("target");
    });

    it("should parse new.target in comparison", () => {
      const expr = parseExpr(
        "new.target !== undefined;",
      ) as AST.BinaryExpression;
      expect(expr.type).toBe("BinaryExpression");
      expect(expr.operator).toBe("!==");
      const left = expr.left as AST.MetaProperty;
      expect(left.type).toBe("MetaProperty");
      expect(left.meta.name).toBe("new");
      expect(left.property.name).toBe("target");
    });
  });

  describe("Error cases", () => {
    it("should throw on import.foo (only 'meta' is valid)", () => {
      expect(() => parseExpr("import.foo;")).toThrow(SyntaxError);
    });

    it("should throw on import.bar", () => {
      expect(() => parseExpr("import.bar;")).toThrow(SyntaxError);
    });

    it("should throw on import without call or meta", () => {
      // import used as expression without () or .meta should fail
      expect(() => parse("import;", { sourceType: "script" })).toThrow(
        SyntaxError,
      );
    });
  });
});
