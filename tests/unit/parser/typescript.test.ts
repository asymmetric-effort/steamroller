/**
 * Unit tests for TypeScript parsing and transformation.
 *
 * Covers: type annotations, interfaces, type aliases, enums, namespaces,
 * parameter properties, type-only imports/exports, generics, and edge cases.
 */

import { describe, it, expect } from "bun:test";
import { parse } from "../../../src/parser/parser.js";
import { transformTypeScript } from "../../../src/transforms/typescript-transform.js";
import {
  isParameterPropertyStart,
  parseParameterProperty,
  tryParseTypeAnnotation,
  tryParseReturnType,
} from "../../../src/parser/typescript.js";
import { Lexer } from "../../../src/parser/lexer.js";
import type * as AST from "../../../src/ast/types.js";
import type { TSParserContext } from "../../../src/parser/typescript.js";

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

    it("parses declare type alias", () => {
      const ast = parseTS("declare type Foo = string;");
      expect(ast.body).toHaveLength(1);
    });

    it("parses declare const enum", () => {
      const ast = parseTS("declare const enum Dir { Up, Down }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses declare function", () => {
      const ast = parseTS("declare function foo(): void;");
      expect(ast.body).toHaveLength(1);
    });

    it("parses declare class", () => {
      const ast = parseTS("declare class Foo { x: number; }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses declare var/let/const", () => {
      const ast1 = parseTS("declare var x: number;");
      expect(ast1.body).toHaveLength(1);
      const ast2 = parseTS("declare let y: string;");
      expect(ast2.body).toHaveLength(1);
      const ast3 = parseTS("declare const z: boolean;");
      expect(ast3.body).toHaveLength(1);
    });

    it("parses declare abstract class", () => {
      const ast = parseTS("declare abstract class Foo { }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses declare module with string name", () => {
      const ast = parseTS("declare module 'foo' { export const x: string; }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses declare global", () => {
      const ast = parseTS("declare global { var x: number; }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses unknown declare keyword (fallback)", () => {
      // A declare statement with an unrecognized keyword triggers the fallback
      // Using 'declare async function' which would be handled by fallback
      const ast = parseTS("declare async function foo(): void;");
      expect(ast.body).toHaveLength(1);
    });

    it("parses declare module with body (namespace alias)", () => {
      const ast = parseTS(
        "declare module MyLib { export function foo(): void; }",
      );
      expect(ast.body).toHaveLength(1);
    });
  });

  // ============================================================
  // Parsing: Union types
  // ============================================================

  describe("union types", () => {
    it("parses a union with leading pipe", () => {
      const ast = parseTS("type Foo = | string | number;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSUnionType");
    });

    it("parses a multi-member union", () => {
      const ast = parseTS("type Foo = string | number | boolean | null;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSUnionType");
      const union = alias.typeAnnotation as AST.TSUnionType;
      expect(union.types.length).toBe(4);
    });
  });

  // ============================================================
  // Parsing: Intersection types
  // ============================================================

  describe("intersection types", () => {
    it("parses a multi-member intersection", () => {
      const ast = parseTS("type Foo = A & B & C;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSIntersectionType");
      const inter = alias.typeAnnotation as AST.TSIntersectionType;
      expect(inter.types.length).toBe(3);
    });

    it("parses intersection with leading ampersand", () => {
      const ast = parseTS("type Foo = & A & B;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSIntersectionType");
    });
  });

  // ============================================================
  // Parsing: Conditional types
  // ============================================================

  describe("conditional types", () => {
    it("parses a conditional type", () => {
      const ast = parseTS("type IsStr<T> = T extends string ? true : false;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSConditionalType");
      const cond = alias.typeAnnotation as AST.TSConditionalType;
      expect(cond.checkType).toBeDefined();
      expect(cond.extendsType).toBeDefined();
      expect(cond.trueType).toBeDefined();
      expect(cond.falseType).toBeDefined();
    });

    it("parses nested conditional type", () => {
      const ast = parseTS(
        "type Deep<T> = T extends string ? 'str' : T extends number ? 'num' : 'other';",
      );
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSConditionalType");
    });
  });

  // ============================================================
  // Parsing: Mapped types
  // ============================================================

  describe("mapped types", () => {
    it("parses a mapped type with optional modifier", () => {
      const ast = parseTS("type Partial2<T> = { [K in keyof T]?: T[K] };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSMappedType");
    });

    it("parses a mapped type with as clause (key remapping)", () => {
      const ast = parseTS(
        "type Remap<T> = { [K in keyof T as string]: T[K] };",
      );
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSMappedType");
      const mapped = alias.typeAnnotation as AST.TSMappedType;
      expect(mapped.nameType).not.toBeNull();
    });

    it("parses a mapped type with +/- optional modifier", () => {
      const ast = parseTS("type Req<T> = { [K in keyof T]-?: T[K] };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSMappedType");
    });

    it("parses a mapped type with semicolon", () => {
      const ast = parseTS("type M<T> = { [K in keyof T]: T[K]; };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSMappedType");
    });

    it("parses a mapped type without type annotation", () => {
      const ast = parseTS("type M<T> = { [K in keyof T] };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSMappedType");
    });

    it("parses a mapped type with + optional modifier", () => {
      const ast = parseTS("type M<T> = { [K in keyof T]+?: T[K] };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSMappedType");
    });
  });

  // ============================================================
  // Parsing: Tuple types
  // ============================================================

  describe("tuple types", () => {
    it("parses an empty tuple", () => {
      const ast = parseTS("type Empty = [];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTupleType");
      const tuple = alias.typeAnnotation as AST.TSTupleType;
      expect(tuple.elementTypes).toHaveLength(0);
    });

    it("parses a multi-element tuple", () => {
      const ast = parseTS("type Triple = [string, number, boolean];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTupleType");
      const tuple = alias.typeAnnotation as AST.TSTupleType;
      expect(tuple.elementTypes).toHaveLength(3);
    });

    it("parses a named tuple element", () => {
      const ast = parseTS("type Named = [first: string, second: number];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTupleType");
    });

    it("parses a tuple with optional element", () => {
      const ast = parseTS("type Opt = [string, number?];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTupleType");
    });

    it("parses a tuple with rest element", () => {
      const ast = parseTS("type Rest = [string, ...number[]];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTupleType");
    });
  });

  // ============================================================
  // Parsing: Literal types
  // ============================================================

  describe("literal types", () => {
    it("parses string literal type", () => {
      const ast = parseTS('type Foo = "hello";');
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSLiteralType");
    });

    it("parses numeric literal type", () => {
      const ast = parseTS("type Foo = 42;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSLiteralType");
    });

    it("parses boolean literal type (true)", () => {
      const ast = parseTS("type Foo = true;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSLiteralType");
    });

    it("parses boolean literal type (false)", () => {
      const ast = parseTS("type Foo = false;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSLiteralType");
    });

    it("parses null literal type", () => {
      const ast = parseTS("type Foo = null;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSLiteralType");
    });

    it("parses negative numeric literal type", () => {
      const ast = parseTS("type Foo = -1;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSLiteralType");
    });
  });

  // ============================================================
  // Parsing: Function types
  // ============================================================

  describe("function types", () => {
    it("parses zero-arg function type", () => {
      const ast = parseTS("type Fn = () => void;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSFunctionType");
    });

    it("parses empty parens as void-like type", () => {
      // () without => is treated as void keyword
      const ast = parseTS("type T = [()];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTupleType");
    });

    it("parses function type with colon return type syntax", () => {
      const ast = parseTS("type T = { fn(x: number): string };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      const lit = alias.typeAnnotation as AST.TSTypeLiteral;
      expect(lit.members[0].type).toBe("TSMethodSignature");
    });

    it("parses function type with parameters", () => {
      const ast = parseTS("type Fn = (a: string, b: number) => boolean;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSFunctionType");
    });

    it("parses function type with optional parameter", () => {
      const ast = parseTS("type Fn = (x?: string) => void;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSFunctionType");
    });

    it("parses function type with rest parameter", () => {
      const ast = parseTS("type Fn = (...args: string[]) => void;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSFunctionType");
    });
  });

  // ============================================================
  // Parsing: Keyword types
  // ============================================================

  describe("keyword types", () => {
    it("parses string keyword type", () => {
      const ast = parseTS("type A = string;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSKeywordType");
      expect((alias.typeAnnotation as AST.TSKeywordType).keyword).toBe(
        "string",
      );
    });

    it("parses number keyword type", () => {
      const ast = parseTS("type A = number;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect((alias.typeAnnotation as AST.TSKeywordType).keyword).toBe(
        "number",
      );
    });

    it("parses boolean keyword type", () => {
      const ast = parseTS("type A = boolean;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect((alias.typeAnnotation as AST.TSKeywordType).keyword).toBe(
        "boolean",
      );
    });

    it("parses any keyword type", () => {
      const ast = parseTS("type A = any;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect((alias.typeAnnotation as AST.TSKeywordType).keyword).toBe("any");
    });

    it("parses unknown keyword type", () => {
      const ast = parseTS("type A = unknown;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect((alias.typeAnnotation as AST.TSKeywordType).keyword).toBe(
        "unknown",
      );
    });

    it("parses never keyword type", () => {
      const ast = parseTS("type A = never;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect((alias.typeAnnotation as AST.TSKeywordType).keyword).toBe("never");
    });

    it("parses void keyword type", () => {
      const ast = parseTS("type A = void;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect((alias.typeAnnotation as AST.TSKeywordType).keyword).toBe("void");
    });

    it("parses undefined keyword type", () => {
      const ast = parseTS("type A = undefined;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect((alias.typeAnnotation as AST.TSKeywordType).keyword).toBe(
        "undefined",
      );
    });

    it("parses symbol keyword type", () => {
      const ast = parseTS("type A = symbol;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect((alias.typeAnnotation as AST.TSKeywordType).keyword).toBe(
        "symbol",
      );
    });

    it("parses bigint keyword type", () => {
      const ast = parseTS("type A = bigint;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect((alias.typeAnnotation as AST.TSKeywordType).keyword).toBe(
        "bigint",
      );
    });

    it("parses object keyword type", () => {
      const ast = parseTS("type A = object;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect((alias.typeAnnotation as AST.TSKeywordType).keyword).toBe(
        "object",
      );
    });
  });

  // ============================================================
  // Parsing: Array types
  // ============================================================

  describe("array types", () => {
    it("parses array type with bracket syntax", () => {
      const ast = parseTS("type Arr = string[];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSArrayType");
    });

    it("parses nested array type", () => {
      const ast = parseTS("type Arr = number[][];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSArrayType");
    });
  });

  // ============================================================
  // Parsing: Indexed access types
  // ============================================================

  describe("indexed access types", () => {
    it("parses indexed access type", () => {
      const ast = parseTS('type Val = Obj["key"];');
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSIndexedAccessType");
    });

    it("parses indexed access type on intersection result", () => {
      // This hits the indexed access path in parseIntersectionType
      const ast = parseTS("type T = (A & B)[number];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSIndexedAccessType");
    });

    it("parses array type on intersection result", () => {
      // This hits the array suffix path in parseIntersectionType
      const ast = parseTS("type T = (A & B)[];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSArrayType");
    });
  });

  // ============================================================
  // Parsing: typeof / keyof / infer types
  // ============================================================

  describe("typeof, keyof, infer types", () => {
    it("parses typeof type query", () => {
      const ast = parseTS("type T = typeof myVar;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTypeQuery");
    });

    it("parses typeof with qualified name", () => {
      const ast = parseTS("type T = typeof Foo.bar;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTypeQuery");
    });

    it("parses keyof type", () => {
      const ast = parseTS("type K = keyof Obj;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSKeyofType");
    });

    it("parses infer type", () => {
      const ast = parseTS(
        "type Elem<T> = T extends Array<infer U> ? U : never;",
      );
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSConditionalType");
    });

    it("parses infer type with constraint", () => {
      const ast = parseTS(
        "type Str<T> = T extends Array<infer U extends string> ? U : never;",
      );
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSConditionalType");
    });
  });

  // ============================================================
  // Parsing: Type reference with qualified names
  // ============================================================

  describe("type references", () => {
    it("parses qualified type name", () => {
      const ast = parseTS("type T = Foo.Bar.Baz;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTypeReference");
    });

    it("parses type reference with type arguments", () => {
      const ast = parseTS("type T = Map<string, number>;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTypeReference");
    });

    it("parses type reference with array suffix", () => {
      const ast = parseTS("type T = Array<string>[];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSArrayType");
    });
  });

  // ============================================================
  // Parsing: Type literal (object type)
  // ============================================================

  describe("type literal", () => {
    it("parses empty object type", () => {
      const ast = parseTS("type T = {};");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTypeLiteral");
    });

    it("parses object type with properties", () => {
      const ast = parseTS("type T = { x: number; y: string };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTypeLiteral");
    });

    it("parses object type with optional property", () => {
      const ast = parseTS("type T = { x?: number };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      const lit = alias.typeAnnotation as AST.TSTypeLiteral;
      expect((lit.members[0] as AST.TSPropertySignature).optional).toBe(true);
    });

    it("parses object type with readonly property", () => {
      const ast = parseTS("type T = { readonly x: number };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      const lit = alias.typeAnnotation as AST.TSTypeLiteral;
      // readonly modifier is consumed by the parser for type members
      expect(lit.members).toHaveLength(1);
      expect(lit.members[0].type).toBe("TSPropertySignature");
    });

    it("parses object type with index signature", () => {
      const ast = parseTS("type T = { [key: string]: number };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      const lit = alias.typeAnnotation as AST.TSTypeLiteral;
      expect(lit.members[0].type).toBe("TSIndexSignature");
    });

    it("parses object type with method signature", () => {
      const ast = parseTS("type T = { foo(x: number): string };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      const lit = alias.typeAnnotation as AST.TSTypeLiteral;
      expect(lit.members[0].type).toBe("TSMethodSignature");
    });

    it("parses object type with index signature (computed key)", () => {
      const ast = parseTS("type T = { [key: string]: number };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      const lit = alias.typeAnnotation as AST.TSTypeLiteral;
      expect(lit.members[0].type).toBe("TSIndexSignature");
    });

    it("parses object type with string literal key", () => {
      const ast = parseTS("type T = { 'my-key': number };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      const lit = alias.typeAnnotation as AST.TSTypeLiteral;
      expect(lit.members[0].type).toBe("TSPropertySignature");
    });

    it("parses object type with numeric literal key", () => {
      const ast = parseTS("type T = { 0: string };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      const lit = alias.typeAnnotation as AST.TSTypeLiteral;
      expect(lit.members[0].type).toBe("TSPropertySignature");
    });

    it("parses object type with call signature", () => {
      const ast = parseTS("type T = { (x: number): string };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      const lit = alias.typeAnnotation as AST.TSTypeLiteral;
      expect(lit.members[0].type).toBe("TSCallSignature");
    });

    it("parses object type with construct signature", () => {
      const ast = parseTS("type T = { new (x: number): Foo };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      const lit = alias.typeAnnotation as AST.TSTypeLiteral;
      expect(lit.members[0].type).toBe("TSConstructSignature");
    });
  });

  // ============================================================
  // Parsing: Parenthesized types
  // ============================================================

  describe("parenthesized types", () => {
    it("parses parenthesized type", () => {
      const ast = parseTS("type T = (string | number)[];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      // Should be an array of a union
      expect(alias.typeAnnotation.type).toBe("TSArrayType");
    });
  });

  // ============================================================
  // Parsing: Interface members (more edge cases)
  // ============================================================

  describe("interface member edge cases", () => {
    it("parses interface with multiple extends (comma-separated)", () => {
      const ast = parseTS("interface C extends A, B { z: boolean; }");
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(iface.extends).toHaveLength(2);
    });

    it("parses interface extending qualified name", () => {
      const ast = parseTS("interface C extends Foo.Bar { x: number; }");
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(iface.extends).toHaveLength(1);
    });

    it("parses interface extending generic", () => {
      const ast = parseTS("interface C extends Array<string> { x: number; }");
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(iface.extends).toHaveLength(1);
    });

    it("parses interface with readonly index signature", () => {
      const ast = parseTS("interface R { readonly [key: string]: number; }");
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(iface.body.body[0].type).toBe("TSIndexSignature");
      expect((iface.body.body[0] as AST.TSIndexSignature).readonly).toBe(true);
    });

    it("parses interface with generic method signature", () => {
      const ast = parseTS("interface I { map<T>(fn: (x: any) => T): T; }");
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(iface.body.body[0].type).toBe("TSMethodSignature");
    });

    it("parses interface with call signature with type params", () => {
      const ast = parseTS("interface I { <T>(x: T): T; }");
      const iface = ast.body[0] as AST.TSInterfaceDeclaration;
      expect(iface.body.body[0].type).toBe("TSCallSignature");
    });
  });

  // ============================================================
  // Parsing: Enum edge cases
  // ============================================================

  describe("enum edge cases", () => {
    it("parses enum with string literal member id", () => {
      const ast = parseTS('enum Quoted { "hello-world" = 1 }');
      const en = ast.body[0] as AST.TSEnumDeclaration;
      expect(en.members).toHaveLength(1);
      expect(en.members[0].id.type).toBe("Literal");
    });

    it("parses enum with trailing comma and no more members", () => {
      const ast = parseTS("enum Trail { A, B, }");
      const en = ast.body[0] as AST.TSEnumDeclaration;
      expect(en.members).toHaveLength(2);
    });

    it("parses declare enum", () => {
      const ast = parseTS("declare enum Color { Red, Green }");
      expect(ast.body).toHaveLength(1);
    });
  });

  // ============================================================
  // Parsing: Namespace edge cases
  // ============================================================

  describe("namespace edge cases", () => {
    it("parses namespace with string literal name (module)", () => {
      const ast = parseTS(
        "declare module 'my-lib' { export const x: number; }",
      );
      expect(ast.body).toHaveLength(1);
    });

    it("parses nested namespace with dot notation (declare)", () => {
      // The dot-notation namespace requires declare to skip body parsing
      const ast = parseTS(
        "declare namespace A.B { export function x(): void; }",
      );
      expect(ast.body).toHaveLength(1);
    });

    it("parses module with string literal name", () => {
      const ast = parseTS('module "my-lib" { export const x = 1; }');
      expect(ast.body).toHaveLength(1);
      const ns = ast.body[0] as AST.TSModuleDeclaration;
      expect(ns.id.type).toBe("Literal");
    });
  });

  // ============================================================
  // Parsing: Parameter properties
  // ============================================================

  describe("parameter properties", () => {
    it("parses public parameter property", () => {
      const ast = parseTS("class Foo { constructor(public x: number) {} }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses private parameter property", () => {
      const ast = parseTS("class Foo { constructor(private x: number) {} }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses protected parameter property", () => {
      const ast = parseTS("class Foo { constructor(protected x: number) {} }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses readonly parameter property", () => {
      const ast = parseTS("class Foo { constructor(readonly x: number) {} }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses parameter property with default value", () => {
      const ast = parseTS(
        "class Foo { constructor(public x: number = 42) {} }",
      );
      expect(ast.body).toHaveLength(1);
    });

    it("parses accessibility + readonly parameter property", () => {
      const ast = parseTS(
        "class Foo { constructor(public readonly x: number) {} }",
      );
      expect(ast.body).toHaveLength(1);
    });
  });

  // ============================================================
  // Parsing: readonly / unique / new in type position
  // ============================================================

  describe("special type modifiers", () => {
    it("parses readonly array type", () => {
      const ast = parseTS("type T = readonly string[];");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSArrayType");
    });

    it("parses unique symbol type", () => {
      const ast = parseTS("type T = unique symbol;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation).toBeDefined();
    });

    it("parses construct signature type (new)", () => {
      const ast = parseTS("type T = new (x: number) => Foo;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSFunctionType");
    });

    it("parses this type", () => {
      const ast = parseTS("type T = { self(): this };");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeAnnotation.type).toBe("TSTypeLiteral");
    });
  });

  // ============================================================
  // Parsing: Type parameter variance modifiers
  // ============================================================

  describe("type parameter variance modifiers", () => {
    it("parses type with in modifier", () => {
      const ast = parseTS("type Contra<in T> = (x: T) => void;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeParameters).not.toBeNull();
    });

    it("parses type with out modifier", () => {
      const ast = parseTS("type Cov<out T> = () => T;");
      const alias = ast.body[0] as AST.TSTypeAliasDeclaration;
      expect(alias.typeParameters).not.toBeNull();
    });
  });

  // ============================================================
  // Parsing: isTypeAliasStart / isInterfaceStart
  // ============================================================

  describe("contextual type/interface detection", () => {
    it("distinguishes type alias from type used as variable name", () => {
      // 'type' as a variable name (not a type alias)
      const ast = parseTS("const type = 42;");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("VariableDeclaration");
    });

    it("distinguishes interface from interface used as variable name", () => {
      const ast = parseTS("const interface_ = 42;");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("VariableDeclaration");
    });

    it("type followed by non-identifier is not a type alias", () => {
      // 'type' as an expression statement - should fall through isTypeAliasStart
      // This tests the false return path of isTypeAliasStart
      // Using a function call: type(42) is an expression statement
      const ast = parseTS("type(42);");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("ExpressionStatement");
    });
  });

  // ============================================================
  // Direct function tests (isParameterPropertyStart, parseParameterProperty)
  // ============================================================

  describe("isParameterPropertyStart", () => {
    const makeLexer = (code: string): Lexer => {
      return new Lexer(code, true);
    };

    it("returns true for public", () => {
      const lexer = makeLexer("public x: number");
      expect(isParameterPropertyStart(lexer)).toBe(true);
    });

    it("returns true for private", () => {
      const lexer = makeLexer("private x: number");
      expect(isParameterPropertyStart(lexer)).toBe(true);
    });

    it("returns true for protected", () => {
      const lexer = makeLexer("protected x: number");
      expect(isParameterPropertyStart(lexer)).toBe(true);
    });

    it("returns true for readonly", () => {
      const lexer = makeLexer("readonly x: number");
      expect(isParameterPropertyStart(lexer)).toBe(true);
    });

    it("returns false for regular identifier", () => {
      const lexer = makeLexer("x: number");
      expect(isParameterPropertyStart(lexer)).toBe(false);
    });
  });

  describe("parseParameterProperty", () => {
    const makeCtx = (code: string): TSParserContext => {
      const lexer = new Lexer(code, true);
      return {
        lexer,
        parseExpression: () => {
          throw new Error("not needed");
        },
        parseAssignmentExpression: () => {
          const tok = lexer.next();
          return Object.freeze({
            type: "Literal" as const,
            start: tok.start,
            end: tok.end,
            value: tok.value as number,
            raw: tok.raw,
          });
        },
        parseStatement: () => {
          throw new Error("not needed");
        },
        parseBlockStatement: () => {
          throw new Error("not needed");
        },
        parseBindingPattern: () => {
          throw new Error("not needed");
        },
      };
    };

    it("parses public parameter property", () => {
      const ctx = makeCtx("public x: number");
      const result = parseParameterProperty(ctx);
      expect(result.type).toBe("TSParameterProperty");
      expect(result.accessibility).toBe("public");
      expect(result.readonly).toBe(false);
    });

    it("parses private parameter property", () => {
      const ctx = makeCtx("private x: string");
      const result = parseParameterProperty(ctx);
      expect(result.accessibility).toBe("private");
    });

    it("parses protected parameter property", () => {
      const ctx = makeCtx("protected x: boolean");
      const result = parseParameterProperty(ctx);
      expect(result.accessibility).toBe("protected");
    });

    it("parses readonly parameter property", () => {
      const ctx = makeCtx("readonly x: number");
      const result = parseParameterProperty(ctx);
      expect(result.readonly).toBe(true);
      expect(result.accessibility).toBeNull();
    });

    it("parses public readonly parameter property", () => {
      const ctx = makeCtx("public readonly x: number");
      const result = parseParameterProperty(ctx);
      expect(result.accessibility).toBe("public");
      expect(result.readonly).toBe(true);
    });

    it("parses parameter property with optional marker", () => {
      const ctx = makeCtx("public x?: number");
      const result = parseParameterProperty(ctx);
      expect(result.accessibility).toBe("public");
    });

    it("parses parameter property with default value", () => {
      const ctx = makeCtx("public x: number = 42");
      const result = parseParameterProperty(ctx);
      expect(result.parameter.type).toBe("AssignmentPattern");
    });

    it("parses parameter property without type annotation", () => {
      const ctx = makeCtx("public x = 42");
      const result = parseParameterProperty(ctx);
      expect(result.accessibility).toBe("public");
      expect(result.parameter.type).toBe("AssignmentPattern");
    });

    it("parses simple parameter property (no type, no default)", () => {
      const ctx = makeCtx("private y)");
      const result = parseParameterProperty(ctx);
      expect(result.accessibility).toBe("private");
      expect(result.parameter.type).toBe("Identifier");
    });
  });

  describe("tryParseReturnType and tryParseTypeAnnotation", () => {
    const makeCtxForType = (code: string): TSParserContext => {
      const lexer = new Lexer(code, true);
      return {
        lexer,
        parseExpression: () => {
          throw new Error("not needed");
        },
        parseAssignmentExpression: () => {
          throw new Error("not needed");
        },
        parseStatement: () => {
          throw new Error("not needed");
        },
        parseBlockStatement: () => {
          throw new Error("not needed");
        },
        parseBindingPattern: () => {
          throw new Error("not needed");
        },
      };
    };

    it("tryParseTypeAnnotation returns null when no colon", () => {
      const ctx = makeCtxForType("= 42");
      const result = tryParseTypeAnnotation(ctx);
      expect(result).toBeNull();
    });

    it("tryParseTypeAnnotation parses when colon present", () => {
      const ctx = makeCtxForType(": string");
      const result = tryParseTypeAnnotation(ctx);
      expect(result).not.toBeNull();
      expect(result!.type).toBe("TSTypeAnnotation");
    });

    it("tryParseReturnType returns null when no colon", () => {
      const ctx = makeCtxForType("= 42");
      const result = tryParseReturnType(ctx);
      expect(result).toBeNull();
    });

    it("tryParseReturnType parses when colon present", () => {
      const ctx = makeCtxForType(": number");
      const result = tryParseReturnType(ctx);
      expect(result).not.toBeNull();
    });
  });
});

// ============================================================
// Direct transform tests with synthetic AST nodes
// ============================================================

describe("TypeScript Transform - walkExpressions edge cases", () => {
  it("handles TSTypeAnnotation node in AST", () => {
    // Create an AST that includes a TSTypeAnnotation
    const code = "const x = 42;";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "VariableDeclaration",
          start: 0,
          end: code.length,
          declarations: [
            {
              type: "VariableDeclarator",
              start: 6,
              end: 12,
              id: {
                type: "Identifier",
                start: 6,
                end: 7,
                name: "x",
              } as AST.Identifier,
              init: {
                type: "Literal",
                start: 10,
                end: 12,
                value: 42,
                raw: "42",
              } as AST.Literal,
            } as AST.VariableDeclarator,
          ],
          kind: "const",
        } as AST.VariableDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toContain("const x = 42;");
  });

  it("handles null/undefined nodes gracefully", () => {
    const code = "const x = 1;";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "ExpressionStatement",
          start: 0,
          end: code.length,
          expression: {
            type: "Literal",
            start: 0,
            end: 1,
            value: 1,
            raw: "1",
          } as AST.Literal,
        } as AST.ExpressionStatement,
      ],
      sourceType: "module",
    };
    // Should not throw
    const result = transformTypeScript(code, ast);
    expect(result).toBeDefined();
  });

  it("handles ExportNamedDeclaration with no declaration", () => {
    const code = 'export { foo } from "./bar";';
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "ExportNamedDeclaration",
          start: 0,
          end: code.length,
          declaration: null,
          specifiers: [],
          source: {
            type: "Literal",
            start: 21,
            end: 26,
            value: "./bar",
            raw: '"./bar"',
          } as AST.Literal,
          exportKind: "value",
        } as AST.ExportNamedDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toContain('export { foo } from "./bar"');
  });

  it("strips TSAsExpression node from AST", () => {
    const code = "const x = value as string;";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "VariableDeclaration",
          start: 0,
          end: code.length - 1,
          declarations: [
            {
              type: "VariableDeclarator",
              start: 6,
              end: 25,
              id: {
                type: "Identifier",
                start: 6,
                end: 7,
                name: "x",
              } as AST.Identifier,
              init: {
                type: "TSAsExpression",
                start: 10,
                end: 25,
                expression: {
                  type: "Identifier",
                  start: 10,
                  end: 15,
                  name: "value",
                } as AST.Identifier,
                typeAnnotation: {
                  type: "TSKeywordType",
                  start: 19,
                  end: 25,
                  keyword: "string",
                } as AST.TSKeywordType,
              } as unknown as AST.Expression,
            } as AST.VariableDeclarator,
          ],
          kind: "const",
        } as AST.VariableDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toContain("value");
    expect(result).not.toContain("as string");
  });

  it("strips TSSatisfiesExpression node from AST", () => {
    const code = "const x = obj satisfies Type;";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "VariableDeclaration",
          start: 0,
          end: code.length - 1,
          declarations: [
            {
              type: "VariableDeclarator",
              start: 6,
              end: 28,
              id: {
                type: "Identifier",
                start: 6,
                end: 7,
                name: "x",
              } as AST.Identifier,
              init: {
                type: "TSSatisfiesExpression",
                start: 10,
                end: 28,
                expression: {
                  type: "Identifier",
                  start: 10,
                  end: 13,
                  name: "obj",
                } as AST.Identifier,
                typeAnnotation: {
                  type: "TSTypeReference",
                  start: 24,
                  end: 28,
                  typeName: {
                    type: "Identifier",
                    start: 24,
                    end: 28,
                    name: "Type",
                  } as AST.Identifier,
                  typeParameters: null,
                } as AST.TSTypeReference,
              } as unknown as AST.Expression,
            } as AST.VariableDeclarator,
          ],
          kind: "const",
        } as AST.VariableDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toContain("obj");
    expect(result).not.toContain("satisfies");
  });

  it("strips TSNonNullExpression node from AST", () => {
    const code = "const x = foo!;";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "VariableDeclaration",
          start: 0,
          end: code.length - 1,
          declarations: [
            {
              type: "VariableDeclarator",
              start: 6,
              end: 14,
              id: {
                type: "Identifier",
                start: 6,
                end: 7,
                name: "x",
              } as AST.Identifier,
              init: {
                type: "TSNonNullExpression",
                start: 10,
                end: 14,
                expression: {
                  type: "Identifier",
                  start: 10,
                  end: 13,
                  name: "foo",
                } as AST.Identifier,
              } as unknown as AST.Expression,
            } as AST.VariableDeclarator,
          ],
          kind: "const",
        } as AST.VariableDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toContain("foo");
  });

  it("strips TSTypeAnnotation node from AST", () => {
    const code = "const x: string = 1;";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "VariableDeclaration",
          start: 0,
          end: code.length - 1,
          declarations: [
            {
              type: "VariableDeclarator",
              start: 6,
              end: 19,
              id: {
                type: "Identifier",
                start: 6,
                end: 7,
                name: "x",
                typeAnnotation: {
                  type: "TSTypeAnnotation",
                  start: 7,
                  end: 15,
                  typeAnnotation: {
                    type: "TSKeywordType",
                    start: 9,
                    end: 15,
                    keyword: "string",
                  },
                },
              } as unknown as AST.Identifier,
              init: {
                type: "Literal",
                start: 18,
                end: 19,
                value: 1,
                raw: "1",
              } as AST.Literal,
            } as AST.VariableDeclarator,
          ],
          kind: "const",
        } as AST.VariableDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toContain("const x");
    expect(result).toContain("= 1");
  });

  it("strips TSTypeParameterDeclaration node from AST", () => {
    const code = "function foo<T>(x) { return x; }";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "FunctionDeclaration",
          start: 0,
          end: code.length,
          id: {
            type: "Identifier",
            start: 9,
            end: 12,
            name: "foo",
          } as AST.Identifier,
          params: [
            {
              type: "Identifier",
              start: 16,
              end: 17,
              name: "x",
            } as AST.Identifier,
          ],
          body: {
            type: "BlockStatement",
            start: 19,
            end: code.length,
            body: [
              {
                type: "ReturnStatement",
                start: 21,
                end: 30,
                argument: {
                  type: "Identifier",
                  start: 28,
                  end: 29,
                  name: "x",
                } as AST.Identifier,
              } as AST.ReturnStatement,
            ],
          } as AST.BlockStatement,
          generator: false,
          async: false,
          typeParameters: {
            type: "TSTypeParameterDeclaration",
            start: 12,
            end: 15,
            params: [],
          },
        } as unknown as AST.FunctionDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toContain("function foo");
  });

  it("strips TSParameterProperty node from AST", () => {
    const code = "class A { constructor(public x) {} }";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "ClassDeclaration",
          start: 0,
          end: code.length,
          id: {
            type: "Identifier",
            start: 6,
            end: 7,
            name: "A",
          } as AST.Identifier,
          superClass: null,
          body: {
            type: "ClassBody",
            start: 8,
            end: code.length,
            body: [
              {
                type: "MethodDefinition",
                start: 10,
                end: 34,
                key: {
                  type: "Identifier",
                  start: 10,
                  end: 21,
                  name: "constructor",
                } as AST.Identifier,
                value: {
                  type: "FunctionExpression",
                  start: 10,
                  end: 34,
                  id: null,
                  params: [
                    {
                      type: "TSParameterProperty",
                      start: 22,
                      end: 30,
                      parameter: {
                        type: "Identifier",
                        start: 29,
                        end: 30,
                        name: "x",
                      } as AST.Identifier,
                      accessibility: "public",
                      readonly: false,
                    } as unknown as AST.Pattern,
                  ],
                  body: {
                    type: "BlockStatement",
                    start: 32,
                    end: 34,
                    body: [],
                  } as AST.BlockStatement,
                  generator: false,
                  async: false,
                } as AST.FunctionExpression,
                kind: "constructor",
                computed: false,
                static: false,
              } as AST.MethodDefinition,
            ],
          } as AST.ClassBody,
        } as AST.ClassDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toContain("x");
  });

  it("strips TSParameterProperty with AssignmentPattern from AST", () => {
    const code = "class A { constructor(public x = 1) {} }";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "ClassDeclaration",
          start: 0,
          end: code.length,
          id: {
            type: "Identifier",
            start: 6,
            end: 7,
            name: "A",
          } as AST.Identifier,
          superClass: null,
          body: {
            type: "ClassBody",
            start: 8,
            end: code.length,
            body: [
              {
                type: "MethodDefinition",
                start: 10,
                end: 38,
                key: {
                  type: "Identifier",
                  start: 10,
                  end: 21,
                  name: "constructor",
                } as AST.Identifier,
                value: {
                  type: "FunctionExpression",
                  start: 10,
                  end: 38,
                  id: null,
                  params: [
                    {
                      type: "TSParameterProperty",
                      start: 22,
                      end: 34,
                      parameter: {
                        type: "AssignmentPattern",
                        start: 29,
                        end: 34,
                        left: {
                          type: "Identifier",
                          start: 29,
                          end: 30,
                          name: "x",
                        } as AST.Identifier,
                        right: {
                          type: "Literal",
                          start: 33,
                          end: 34,
                          value: 1,
                          raw: "1",
                        } as AST.Literal,
                      } as AST.AssignmentPattern,
                      accessibility: "public",
                      readonly: false,
                    } as unknown as AST.Pattern,
                  ],
                  body: {
                    type: "BlockStatement",
                    start: 36,
                    end: 38,
                    body: [],
                  } as AST.BlockStatement,
                  generator: false,
                  async: false,
                } as AST.FunctionExpression,
                kind: "constructor",
                computed: false,
                static: false,
              } as AST.MethodDefinition,
            ],
          } as AST.ClassBody,
        } as AST.ClassDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    // Should replace "public x = 1" with just "x = 1" (the source from param position)
    expect(result).toBeDefined();
  });

  it("handles walkExpressions with null node value", () => {
    // Test that null/undefined values in object properties don't crash
    const code = "const x = 1;";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "ExpressionStatement",
          start: 0,
          end: code.length,
          expression: {
            type: "Literal",
            start: 0,
            end: 1,
            value: 1,
            raw: "1",
            extra: null,
          } as unknown as AST.Literal,
        } as AST.ExpressionStatement,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toBeDefined();
  });

  it("handles walkExpressions with object missing type property", () => {
    const code = "const x = 1;";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "ExpressionStatement",
          start: 0,
          end: code.length,
          expression: {
            type: "Literal",
            start: 0,
            end: 1,
            value: 1,
            raw: "1",
            metadata: { noType: true },
          } as unknown as AST.Literal,
        } as AST.ExpressionStatement,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toBeDefined();
  });

  it("handles TSTypeParameterInstantiation node (type arguments)", () => {
    const code = "const x = foo<string>(1);";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "VariableDeclaration",
          start: 0,
          end: code.length - 1,
          declarations: [
            {
              type: "VariableDeclarator",
              start: 6,
              end: 23,
              id: {
                type: "Identifier",
                start: 6,
                end: 7,
                name: "x",
              } as AST.Identifier,
              init: {
                type: "CallExpression",
                start: 10,
                end: 23,
                callee: {
                  type: "Identifier",
                  start: 10,
                  end: 13,
                  name: "foo",
                } as AST.Identifier,
                arguments: [
                  {
                    type: "Literal",
                    start: 22,
                    end: 23,
                    value: 1,
                    raw: "1",
                  } as AST.Literal,
                ],
                optional: false,
                typeParameters: {
                  type: "TSTypeParameterInstantiation",
                  start: 13,
                  end: 21,
                  params: [],
                },
              } as unknown as AST.Expression,
            } as AST.VariableDeclarator,
          ],
          kind: "const",
        } as AST.VariableDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toContain("foo");
  });

  it("handles exported declare namespace in transform (via parser)", () => {
    const code =
      "export declare namespace Foo { export function bar(): void; }";
    const ast = parseTS(code);
    const result = transformTypeScript(code, ast);
    expect(result.trim()).toBe("");
  });

  it("handles exported declare namespace via synthetic AST", () => {
    const code = "export declare namespace Foo { }";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "ExportNamedDeclaration",
          start: 0,
          end: code.length,
          declaration: {
            type: "TSModuleDeclaration",
            start: 7,
            end: code.length,
            id: {
              type: "Identifier",
              start: 27,
              end: 30,
              name: "Foo",
            } as AST.Identifier,
            body: {
              type: "TSModuleBlock",
              start: 31,
              end: code.length,
              body: [],
            } as AST.TSModuleBlock,
            declare: true,
            global: false,
          } as unknown as AST.Declaration,
          specifiers: [],
          source: null,
          exportKind: "value",
        } as AST.ExportNamedDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result.trim()).toBe("");
  });

  it("handles nested namespace (body not TSModuleBlock)", () => {
    // Create a synthetic AST where namespace body is another TSModuleDeclaration
    const code = "namespace A { }";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "TSModuleDeclaration",
          start: 0,
          end: code.length,
          id: {
            type: "Identifier",
            start: 10,
            end: 11,
            name: "A",
          } as AST.Identifier,
          body: {
            type: "TSModuleDeclaration",
            start: 0,
            end: code.length,
            id: {
              type: "Identifier",
              start: 12,
              end: 13,
              name: "B",
            } as AST.Identifier,
            body: {
              type: "TSModuleBlock",
              start: 12,
              end: code.length,
              body: [],
            } as AST.TSModuleBlock,
            declare: false,
            global: false,
          } as unknown as AST.TSModuleBlock,
          declare: false,
          global: false,
        } as unknown as AST.TSModuleDeclaration,
      ],
      sourceType: "module",
    };
    // Should not crash
    const result = transformTypeScript(code, ast);
    expect(result).toBeDefined();
  });

  it("walks array values in AST recursively", () => {
    // Tests the array iteration path in walkExpressions
    const code = "const arr = [1, 2, 3];";
    const ast: AST.Program = {
      type: "Program",
      start: 0,
      end: code.length,
      body: [
        {
          type: "VariableDeclaration",
          start: 0,
          end: code.length - 1,
          declarations: [
            {
              type: "VariableDeclarator",
              start: 6,
              end: 21,
              id: {
                type: "Identifier",
                start: 6,
                end: 9,
                name: "arr",
              } as AST.Identifier,
              init: {
                type: "ArrayExpression",
                start: 12,
                end: 21,
                elements: [
                  {
                    type: "Literal",
                    start: 13,
                    end: 14,
                    value: 1,
                    raw: "1",
                  } as AST.Literal,
                  {
                    type: "Literal",
                    start: 16,
                    end: 17,
                    value: 2,
                    raw: "2",
                  } as AST.Literal,
                  {
                    type: "Literal",
                    start: 19,
                    end: 20,
                    value: 3,
                    raw: "3",
                  } as AST.Literal,
                ],
              } as unknown as AST.Expression,
            } as AST.VariableDeclarator,
          ],
          kind: "const",
        } as AST.VariableDeclaration,
      ],
      sourceType: "module",
    };
    const result = transformTypeScript(code, ast);
    expect(result).toContain("[1, 2, 3]");
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

    it("strips exported declare namespace", () => {
      const result = transformTS(
        "export declare namespace Global { export function foo(): void; }",
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

    it("removes import type with trailing whitespace before semicolon", () => {
      const result = transformTS('import type { Foo } from "./foo" ;');
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

    it("strips interface with trailing whitespace before semicolon", () => {
      const result = transformTS("interface Foo { x: number; } ;");
      expect(result.trim()).toBe("");
    });

    it("strips type alias with trailing whitespace before semicolon", () => {
      const result = transformTS("type Foo = string ;");
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

  // ============================================================
  // Enum transform edge cases
  // ============================================================

  describe("enum transform edge cases", () => {
    it("transforms enum with string literal member id", () => {
      const result = transformTS('enum Quoted { "hello-world" = 1 }');
      expect(result).toContain("var Quoted;");
      expect(result).toContain(
        'Quoted[Quoted["hello-world"] = 1] = "hello-world"',
      );
    });

    it("transforms enum auto-increments after custom numeric value", () => {
      const result = transformTS("enum E { A = 10, B, C }");
      expect(result).toContain('E[E["A"] = 10] = "A"');
      expect(result).toContain('E[E["B"] = 11] = "B"');
      expect(result).toContain('E[E["C"] = 12] = "C"');
    });

    it("transforms enum with complex expression initializer", () => {
      const result = transformTS("enum E { A = 1 + 2 }");
      expect(result).toContain("var E;");
      expect(result).toContain('E[E["A"] = 1 + 2] = "A"');
    });
  });

  // ============================================================
  // Namespace transform edge cases
  // ============================================================

  describe("namespace transform edge cases", () => {
    it("transforms namespace with exported function", () => {
      const result = transformTS(
        "namespace NS { export function greet() { return 'hi'; } }",
      );
      expect(result).toContain("var NS;");
      expect(result).toContain("NS.greet = greet;");
    });

    it("transforms namespace with exported class", () => {
      const result = transformTS("namespace NS { export class MyClass {} }");
      expect(result).toContain("var NS;");
      expect(result).toContain("NS.MyClass = MyClass;");
    });

    it("strips type-only declarations inside namespace", () => {
      const result = transformTS(
        "namespace NS { export interface Foo { x: number; } export const val = 1; }",
      );
      expect(result).toContain("var NS;");
      expect(result).not.toContain("interface");
      expect(result).toContain("NS.val = val;");
    });

    it("strips standalone type aliases inside namespace", () => {
      const result = transformTS(
        "namespace NS { type Internal = string; export const val = 1; }",
      );
      expect(result).toContain("var NS;");
      expect(result).not.toContain("Internal");
    });

    it("handles non-exported statements inside namespace", () => {
      const result = transformTS(
        "namespace NS { const internal = 1; export const pub = internal; }",
      );
      expect(result).toContain("var NS;");
      expect(result).toContain("NS.pub = pub;");
    });

    it("strips exported type alias inside namespace", () => {
      const result = transformTS(
        "namespace NS { export type MyType = string; export const x = 1; }",
      );
      expect(result).toContain("var NS;");
      expect(result).not.toContain("MyType");
    });
  });

  // ============================================================
  // Parameter property transform
  // ============================================================

  describe("parameter property transform", () => {
    it("parses class with parameter properties (public)", () => {
      const ast = parseTS("class Foo { constructor(public x: number) {} }");
      expect(ast.body).toHaveLength(1);
      expect(ast.body[0].type).toBe("ClassDeclaration");
    });

    it("parses class with parameter properties (private)", () => {
      const ast = parseTS("class Foo { constructor(private x: number) {} }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses class with parameter properties (protected)", () => {
      const ast = parseTS("class Foo { constructor(protected x: number) {} }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses class with parameter properties (readonly)", () => {
      const ast = parseTS("class Foo { constructor(readonly x: number) {} }");
      expect(ast.body).toHaveLength(1);
    });

    it("parses class with parameter property and default value", () => {
      const ast = parseTS(
        "class Foo { constructor(public x: number = 42) {} }",
      );
      expect(ast.body).toHaveLength(1);
    });
  });

  // ============================================================
  // Expression-level transforms (as, satisfies, non-null)
  // ============================================================

  describe("expression-level transforms", () => {
    it("strips type annotation from variable", () => {
      const result = transformTS("const x: string = 'hello';");
      expect(result).toContain("const x");
      expect(result).toContain("'hello'");
    });

    it("strips type parameters from function declaration", () => {
      const result = transformTS("function identity<T>(x: T): T { return x; }");
      expect(result).toContain("function identity");
      expect(result).toContain("return x;");
    });

    it("strips return type from function declaration", () => {
      const result = transformTS("function foo(): string { return 'bar'; }");
      expect(result).toContain("function foo");
      expect(result).toContain("return 'bar';");
    });

    it("preserves arrow function body", () => {
      const result = transformTS("const fn = () => 42;");
      expect(result).toContain("const fn");
      expect(result).toContain("42");
    });

    it("preserves regular function with no types", () => {
      const result = transformTS("function foo(a, b) { return a + b; }");
      expect(result).toContain("function foo(a, b)");
      expect(result).toContain("return a + b;");
    });
  });

  // ============================================================
  // Export-wrapping transforms
  // ============================================================

  describe("exported declaration transforms", () => {
    it("strips exported interface via ExportNamedDeclaration", () => {
      const result = transformTS("export interface Foo { x: number; }");
      expect(result.trim()).toBe("");
    });

    it("strips exported type alias via ExportNamedDeclaration", () => {
      const result = transformTS("export type Foo = string;");
      expect(result.trim()).toBe("");
    });

    it("transforms exported enum via ExportNamedDeclaration", () => {
      const result = transformTS("export enum Dir { Up, Down }");
      expect(result).toContain("export var Dir;");
    });

    it("transforms exported namespace via ExportNamedDeclaration", () => {
      const result = transformTS("export namespace NS { export const x = 1; }");
      expect(result).toContain("export var NS;");
    });

    it("transforms export of regular function declaration", () => {
      const result = transformTS(
        "export function foo(x: number): string { return ''; }",
      );
      expect(result).toContain("export function foo");
    });

    it("strips export type { } re-export", () => {
      const result = transformTS('export type { Foo } from "./foo";');
      expect(result.trim()).toBe("");
    });
  });

  // ============================================================
  // Const enum collection edge cases
  // ============================================================

  describe("const enum collection edge cases", () => {
    it("collects const enum with string values", () => {
      const result = transformTS(
        'const enum Str { A = "hello", B = "world" }\nconst x = 1;',
      );
      // const enum should be stripped
      expect(result).not.toContain("const enum");
      expect(result).toContain("const x = 1;");
    });

    it("collects const enum with mixed auto-increment", () => {
      const result = transformTS(
        "const enum Mix { A, B = 5, C }\nconst x = 1;",
      );
      expect(result).not.toContain("const enum");
    });

    it("collects exported const enum", () => {
      const result = transformTS(
        "export const enum E { X = 0, Y = 1 }\nconst x = 1;",
      );
      expect(result).not.toContain("const enum");
    });
  });
});
