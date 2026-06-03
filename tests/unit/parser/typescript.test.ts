/**
 * Unit tests for TypeScript parsing and transformation.
 *
 * Covers: type annotations, interfaces, type aliases, enums, namespaces,
 * parameter properties, type-only imports/exports, generics, and edge cases.
 */

import { describe, it, expect } from "vitest";
import { parse } from "../../../src/parser/parser.js";
import { transformTypeScript } from "../../../src/transforms/typescript-transform.js";
import type * as AST from "../../../src/ast/types.js";

/**
 * Helper: parse TypeScript and return the AST.
 */
const parseTS = (code: string): AST.Program => {
  return parse(code, { sourceType: "module", typescript: true });
};

/**
 * Helper: parse and transform TypeScript to JavaScript.
 */
const transformTS = (code: string): string => {
  const ast = parseTS(code);
  return transformTypeScript(code, ast);
};

// ============================================================
// Parsing: Type Annotations
// ============================================================

describe("TypeScript Parsing", () => {
  describe("type annotations", () => {
    it("parses variable with type annotation", () => {
      const ast = parseTS("const x: number = 42;");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("VariableDeclaration");
    });

    it("parses function with parameter types and return type", () => {
      const ast = parseTS(
        "function add(a: number, b: number): number { return a + b; }",
      );
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("FunctionDeclaration");
    });
  });

  // ============================================================
  // Parsing: Interfaces
  // ============================================================

  describe("interface declarations", () => {
    it("parses a simple interface", () => {
      const ast = parseTS("interface Foo { x: number; y: string; }");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("TSInterfaceDeclaration");
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(iface.id.name).toBe("Foo");
      expect(iface.body.body).toHaveLength(2);
    });

    it("parses interface with extends", () => {
      const ast = parseTS("interface Bar extends Foo { z: boolean; }");
      expect(ast.body).toHaveLength(1);
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(iface.extends).toHaveLength(1);
    });

    it("parses interface with generics", () => {
      const ast = parseTS("interface Container<T> { value: T; }");
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(iface.typeParameters).not.toBeNull();
      expect(iface.typeParameters!.params).toHaveLength(1);
    });

    it("parses interface with method signatures", () => {
      const ast = parseTS("interface Foo { bar(x: number): string; }");
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(iface.body.body).toHaveLength(1);
      expect(iface.body.body[0].type).toBe("TSMethodSignature");
    });

    it("parses interface with index signature", () => {
      const ast = parseTS("interface Dict { [key: string]: number; }");
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(iface.body.body).toHaveLength(1);
      expect(iface.body.body[0].type).toBe("TSIndexSignature");
    });

    it("parses interface with optional properties", () => {
      const ast = parseTS("interface Opts { x?: number; y?: string; }");
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      const props = iface.body.body;
      expect(props).toHaveLength(2);
      expect((props[0] as AST.TSPropertySignature).optional).toBe(true);
    });
  });

  // ============================================================
  // Parsing: Type Aliases
  // ============================================================

  describe("type alias declarations", () => {
    it("parses a simple type alias", () => {
      const ast = parseTS("type MyStr = string;");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("TSTypeAliasDeclaration");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.id.name).toBe("MyStr");
    });

    it("parses a union type alias", () => {
      const ast = parseTS("type Result = string | number;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSUnionType");
    });

    it("parses an intersection type alias", () => {
      const ast = parseTS("type Both = A & B;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSIntersectionType");
    });

    it("parses a generic type alias", () => {
      const ast = parseTS("type Box<T> = { value: T };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeParameters).not.toBeNull();
      expect(alias.typeParameters!.params).toHaveLength(1);
    });

    it("parses a conditional type alias", () => {
      const ast = parseTS(
        "type IsString<T> = T extends string ? true : false;",
      );
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSConditionalType");
    });

    it("parses a mapped type alias", () => {
      const ast = parseTS("type Partial2<T> = { [K in keyof T]?: T[K] };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSMappedType");
    });

    it("parses a tuple type alias", () => {
      const ast = parseTS("type Pair = [string, number];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTupleType");
    });
  });

  // ============================================================
  // Parsing: Enums
  // ============================================================

  describe("enum declarations", () => {
    it("parses a simple enum", () => {
      const ast = parseTS("enum Color { Red, Green, Blue }");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("TSEnumDeclaration");
      const en = ast.body[0] as AST.TSEnumDeclaration;
      expect(en.id.name).toBe("Color");
      expect(en.members).toHaveLength(3);
      expect(en.const).toBe(false);
    });

    it("parses a const enum", () => {
      const ast = parseTS("const enum Direction { Up, Down, Left, Right }");
      const en = ast.body[0] as AST.TSEnumDeclaration;
      expect(en.const).toBe(true);
      expect(en.members).toHaveLength(4);
    });

    it("parses enum with initializers", () => {
      const ast = parseTS("enum Status { Active = 1, Inactive = 0 }");
      const en = ast.body[0] as AST.TSEnumDeclaration;
      expect(en.members[0].initializer).not.toBeNull();
      expect((en.members[0].initializer as AST.Literal).value).toBe(1);
    });

    it("parses string enum", () => {
      const ast = parseTS('enum Fruit { Apple = "APPLE", Banana = "BANANA" }');
      const en = ast.body[0] as AST.TSEnumDeclaration;
      expect(en.members).toHaveLength(2);
      expect((en.members[0].initializer as AST.Literal).value).toBe("APPLE");
    });

    it("parses exported enum", () => {
      const ast = parseTS("export enum Color { Red, Green, Blue }");
      expect(ast.body[0].type).toBe("ExportNamedDeclaration");
      const exp = ast.body[0] as AST.ExportNamedDeclaration;
      expect(exp.declaration!.type).toBe("TSEnumDeclaration");
    });
  });

  // ============================================================
  // Parsing: Namespaces
  // ============================================================

  describe("namespace declarations", () => {
    it("parses a simple namespace", () => {
      const ast = parseTS("namespace Foo { export const x = 1; }");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("TSModuleDeclaration");
      const ns = ast.body[0] as AST.TSModuleDeclaration;
      expect((ns.id as AST.Identifier).name).toBe("Foo");
    });

    it("parses module keyword as namespace", () => {
      const ast = parseTS("module Bar { export const y = 2; }");
      expect(ast.body[0].type).toBe("TSModuleDeclaration");
    });
  });

  // ============================================================
  // Parsing: Type-only imports/exports
  // ============================================================

  describe("type-only imports and exports", () => {
    it("parses import type", () => {
      const ast = parseTS('import type { Foo } from "./foo";');
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("ImportDeclaration");
      const imp = ast.body[0] as AST.ImportDeclaration;
      expect(imp.importKind).toBe("type");
    });

    it("parses export type", () => {
      const ast = parseTS('export type { Foo } from "./foo";');
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("ExportNamedDeclaration");
      const exp = ast.body[0] as AST.ExportNamedDeclaration;
      expect(exp.exportKind).toBe("type");
    });

    it("parses import type default", () => {
      const ast = parseTS('import type Foo from "./foo";');
      expect(ast.body[0].type).toBe("ImportDeclaration");
      const imp = ast.body[0] as AST.ImportDeclaration;
      expect(imp.importKind).toBe("type");
    });
  });

  // ============================================================
  // Parsing: Complex Generics
  // ============================================================

  describe("complex generics", () => {
    it("parses generic with constraint", () => {
      const ast = parseTS("type KeyOf<T extends object> = keyof T;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeParameters!.params[0].constraint).not.toBeNull();
    });

    it("parses generic with default", () => {
      const ast = parseTS("type Opt<T = string> = T | null;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeParameters!.params[0].default).not.toBeNull();
    });

    it("parses multiple type parameters", () => {
      const ast = parseTS("type Map2<K, V> = { key: K; value: V };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeParameters!.params).toHaveLength(2);
    });
  });

  // ============================================================
  // Parsing: Declare statements
  // ============================================================

  describe("declare statements", () => {
    it("parses declare interface", () => {
      const ast = parseTS("declare interface Foo { x: number; }");
      expect(ast.body).toHaveLength(1);
      const decl = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(decl.declare).toBe(true);
    });

    it("parses declare enum", () => {
      const ast = parseTS("declare enum Color { Red, Green }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses declare namespace", () => {
      const ast = parseTS(
        "declare namespace Foo { export function bar(): void; }",
      );
      expect(ast.body).toHaveLength(1);
    });
  });
});

// ============================================================
// Transform Tests
// ============================================================

describe("TypeScript Transform", () => {
  // ============================================================
  // Enum transforms
  // ============================================================

  describe("enum transform", () => {
    it("transforms numeric enum to IIFE", () => {
      const result = transformTS("enum Color { Red, Green, Blue }");
      expect(result).toContain("var Color;");
      expect(result).toContain("(function(Color)");
      expect(result).toContain('Color[Color["Red"] = 0] = "Red"');
      expect(result).toContain('Color[Color["Green"] = 1] = "Green"');
      expect(result).toContain('Color[Color["Blue"] = 2] = "Blue"');
    });

    it("transforms string enum correctly", () => {
      const result = transformTS(
        'enum Fruit { Apple = "APPLE", Banana = "BANANA" }',
      );
      expect(result).toContain("var Fruit;");
      expect(result).toContain('Fruit["Apple"] = "APPLE"');
      expect(result).toContain('Fruit["Banana"] = "BANANA"');
    });

    it("transforms enum with custom numeric values", () => {
      const result = transformTS(
        "enum Status { Active = 1, Pending = 5, Done = 10 }",
      );
      expect(result).toContain('Status[Status["Active"] = 1] = "Active"');
      expect(result).toContain('Status[Status["Pending"] = 5] = "Pending"');
      expect(result).toContain('Status[Status["Done"] = 10] = "Done"');
    });

    it("transforms exported enum", () => {
      const result = transformTS("export enum Color { Red, Green, Blue }");
      expect(result).toContain("export var Color;");
    });

    it("handles mixed string and numeric enum members", () => {
      const result = transformTS('enum Mixed { A = 0, B = "hello" }');
      expect(result).toContain('Mixed[Mixed["A"] = 0] = "A"');
      expect(result).toContain('Mixed["B"] = "hello"');
    });

    it("handles trailing comma in enum", () => {
      const result = transformTS("enum Trailing { A, B, C, }");
      expect(result).toContain("var Trailing;");
      expect(result).toContain('Trailing[Trailing["C"] = 2] = "C"');
    });
  });

  // ============================================================
  // Const enum transforms (inlining)
  // ============================================================

  describe("const enum inlining", () => {
    it("strips const enum declarations", () => {
      const result = transformTS("const enum Dir { Up, Down }");
      expect(result.trim()).toBe("");
    });

    it("strips exported const enum declarations", () => {
      const result = transformTS("export const enum Dir { Up, Down }");
      expect(result.trim()).toBe("");
    });
  });

  // ============================================================
  // Namespace transforms
  // ============================================================

  describe("namespace transform", () => {
    it("transforms namespace to IIFE", () => {
      const result = transformTS("namespace Foo { export const x = 1; }");
      expect(result).toContain("var Foo;");
      expect(result).toContain("(function(Foo)");
      expect(result).toContain("Foo.x = x;");
    });

    it("transforms exported namespace", () => {
      const result = transformTS(
        "export namespace Bar { export const y = 2; }",
      );
      expect(result).toContain("export var Bar;");
    });

    it("strips declare namespace", () => {
      const result = transformTS(
        "declare namespace Global { export function foo(): void; }",
      );
      expect(result.trim()).toBe("");
    });
  });

  // ============================================================
  // Type-only import/export removal
  // ============================================================

  describe("type-only import/export removal", () => {
    it("removes import type declarations", () => {
      const result = transformTS('import type { Foo } from "./foo";');
      expect(result.trim()).toBe("");
    });

    it("removes export type declarations", () => {
      const result = transformTS('export type { Foo } from "./foo";');
      expect(result.trim()).toBe("");
    });

    it("removes import type default", () => {
      const result = transformTS('import type Foo from "./foo";');
      expect(result.trim()).toBe("");
    });
  });

  // ============================================================
  // Interface/type alias removal
  // ============================================================

  describe("interface and type alias removal", () => {
    it("strips interface declarations", () => {
      const result = transformTS("interface Foo { x: number; y: string; }");
      expect(result.trim()).toBe("");
    });

    it("strips type alias declarations", () => {
      const result = transformTS("type MyStr = string;");
      expect(result.trim()).toBe("");
    });

    it("strips exported interface", () => {
      const result = transformTS("export interface Bar { z: boolean; }");
      expect(result.trim()).toBe("");
    });

    it("strips exported type alias", () => {
      const result = transformTS("export type Result = string | number;");
      expect(result.trim()).toBe("");
    });
  });

  // ============================================================
  // Edge Cases
  // ============================================================

  describe("edge cases", () => {
    it("handles empty enum", () => {
      const result = transformTS("enum Empty {}");
      expect(result).toContain("var Empty;");
      expect(result).toContain("(function(Empty)");
    });

    it("handles single-member enum", () => {
      const result = transformTS("enum Single { Only }");
      expect(result).toContain('Single[Single["Only"] = 0] = "Only"');
    });

    it("preserves non-TypeScript code", () => {
      const code = "const x = 42;\nconsole.log(x);";
      const result = transformTS(code);
      expect(result).toContain("const x = 42;");
      expect(result).toContain("console.log(x);");
    });

    it("handles declare with interface", () => {
      const result = transformTS("declare interface Foo { x: number; }");
      expect(result.trim()).toBe("");
    });

    it("handles multiple declarations", () => {
      const code = [
        "interface Foo { x: number; }",
        "type Bar = string;",
        "enum Color { Red, Green }",
        "const x = 42;",
      ].join("\n");
      const result = transformTS(code);
      // Interfaces and type aliases stripped
      expect(result).not.toContain("interface");
      expect(result).not.toContain("type Bar");
      // Enum transformed
      expect(result).toContain("var Color;");
      // Regular code preserved
      expect(result).toContain("const x = 42;");
    });
  });
});
