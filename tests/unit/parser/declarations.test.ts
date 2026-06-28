import { describe, it, expect } from "bun:test";
import { parse } from "../../../src/parser/parser.js";

describe("Declaration Parsing", () => {
  describe("Function Declarations", () => {
    it("should parse a simple function declaration", () => {
      const program = parse("function foo() {}");
      expect(program.body.length).toBe(1);
      const decl = program.body[0] as {
        type: string;
        id: { name: string };
        generator: boolean;
        async: boolean;
      };
      expect(decl.type).toBe("FunctionDeclaration");
      expect(decl.id.name).toBe("foo");
      expect(decl.generator).toBe(false);
      expect(decl.async).toBe(false);
    });

    it("should parse a generator function declaration", () => {
      const program = parse("function* gen() {}");
      const decl = program.body[0] as {
        type: string;
        id: { name: string };
        generator: boolean;
        async: boolean;
      };
      expect(decl.type).toBe("FunctionDeclaration");
      expect(decl.id.name).toBe("gen");
      expect(decl.generator).toBe(true);
      expect(decl.async).toBe(false);
    });

    it("should parse an async function declaration", () => {
      const program = parse("async function fetchData() {}");
      const decl = program.body[0] as {
        type: string;
        id: { name: string };
        generator: boolean;
        async: boolean;
      };
      expect(decl.type).toBe("FunctionDeclaration");
      expect(decl.id.name).toBe("fetchData");
      expect(decl.generator).toBe(false);
      expect(decl.async).toBe(true);
    });

    it("should parse an async generator function declaration", () => {
      const program = parse("async function* asyncGen() {}");
      const decl = program.body[0] as {
        type: string;
        id: { name: string };
        generator: boolean;
        async: boolean;
      };
      expect(decl.type).toBe("FunctionDeclaration");
      expect(decl.id.name).toBe("asyncGen");
      expect(decl.generator).toBe(true);
      expect(decl.async).toBe(true);
    });

    it("should parse function with parameters", () => {
      const program = parse("function add(a, b) {}");
      const decl = program.body[0] as {
        type: string;
        params: ReadonlyArray<{ type: string; name: string }>;
      };
      expect(decl.params.length).toBe(2);
      expect(decl.params[0].type).toBe("Identifier");
      expect(decl.params[0].name).toBe("a");
      expect(decl.params[1].name).toBe("b");
    });

    it("should parse function with default parameter", () => {
      const program = parse('function greet(name = "world") {}');
      const decl = program.body[0] as {
        type: string;
        params: ReadonlyArray<{
          type: string;
          left: { name: string };
          right: { value: unknown };
        }>;
      };
      expect(decl.params.length).toBe(1);
      expect(decl.params[0].type).toBe("AssignmentPattern");
      expect(decl.params[0].left.name).toBe("name");
      expect(decl.params[0].right.value).toBe("world");
    });

    it("should parse function with rest parameter", () => {
      const program = parse("function collect(...args) {}");
      const decl = program.body[0] as {
        type: string;
        params: ReadonlyArray<{ type: string; argument: { name: string } }>;
      };
      expect(decl.params.length).toBe(1);
      expect(decl.params[0].type).toBe("RestElement");
      expect(decl.params[0].argument.name).toBe("args");
    });

    it("should parse function with mixed parameters", () => {
      const program = parse("function mixed(a, b = 1, ...rest) {}");
      const decl = program.body[0] as {
        type: string;
        params: ReadonlyArray<{ type: string }>;
      };
      expect(decl.params.length).toBe(3);
      expect(decl.params[0].type).toBe("Identifier");
      expect(decl.params[1].type).toBe("AssignmentPattern");
      expect(decl.params[2].type).toBe("RestElement");
    });

    it("should set correct positions for function declaration", () => {
      const program = parse("function foo() {}");
      const decl = program.body[0];
      expect(decl.start).toBe(0);
      expect(decl.end).toBe(17);
    });

    it("should produce a frozen FunctionDeclaration node", () => {
      const program = parse("function foo() {}");
      expect(Object.isFrozen(program.body[0])).toBe(true);
    });
  });

  describe("Class Declarations", () => {
    it("should parse an empty class", () => {
      const program = parse("class Foo {}");
      const decl = program.body[0] as {
        type: string;
        id: { name: string };
        superClass: unknown;
        body: { type: string; body: ReadonlyArray<unknown> };
      };
      expect(decl.type).toBe("ClassDeclaration");
      expect(decl.id.name).toBe("Foo");
      expect(decl.superClass).toBeNull();
      expect(decl.body.type).toBe("ClassBody");
      expect(decl.body.body.length).toBe(0);
    });

    it("should parse a class with extends", () => {
      const program = parse("class Dog extends Animal {}");
      const decl = program.body[0] as {
        type: string;
        id: { name: string };
        superClass: { type: string; name: string };
      };
      expect(decl.type).toBe("ClassDeclaration");
      expect(decl.id.name).toBe("Dog");
      expect(decl.superClass).not.toBeNull();
      expect(decl.superClass.type).toBe("Identifier");
      expect(decl.superClass.name).toBe("Animal");
    });

    it("should parse a class with constructor", () => {
      const program = parse("class Foo { constructor() {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            kind: string;
            key: { name: string };
          }>;
        };
      };
      expect(decl.body.body.length).toBe(1);
      expect(decl.body.body[0].type).toBe("MethodDefinition");
      expect(decl.body.body[0].kind).toBe("constructor");
      expect(decl.body.body[0].key.name).toBe("constructor");
    });

    it("should parse a class with methods", () => {
      const program = parse("class Foo { bar() {} baz() {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            kind: string;
            key: { name: string };
          }>;
        };
      };
      expect(decl.body.body.length).toBe(2);
      expect(decl.body.body[0].kind).toBe("method");
      expect(decl.body.body[0].key.name).toBe("bar");
      expect(decl.body.body[1].key.name).toBe("baz");
    });

    it("should parse a class with static methods", () => {
      const program = parse("class Foo { static create() {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            static: boolean;
            key: { name: string };
          }>;
        };
      };
      expect(decl.body.body.length).toBe(1);
      expect(decl.body.body[0].static).toBe(true);
      expect(decl.body.body[0].key.name).toBe("create");
    });

    it("should parse a class with getter", () => {
      const program = parse("class Foo { get name() {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            kind: string;
            key: { name: string };
          }>;
        };
      };
      expect(decl.body.body[0].kind).toBe("get");
      expect(decl.body.body[0].key.name).toBe("name");
    });

    it("should parse a class with setter", () => {
      const program = parse("class Foo { set name(value) {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            kind: string;
            key: { name: string };
          }>;
        };
      };
      expect(decl.body.body[0].kind).toBe("set");
      expect(decl.body.body[0].key.name).toBe("name");
    });

    it("should parse a class with public field", () => {
      const program = parse("class Foo { x = 1; }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            key: { name: string };
            value: { value: unknown };
            static: boolean;
          }>;
        };
      };
      expect(decl.body.body[0].type).toBe("PropertyDefinition");
      expect(decl.body.body[0].key.name).toBe("x");
      expect(decl.body.body[0].value.value).toBe(1);
      expect(decl.body.body[0].static).toBe(false);
    });

    it("should parse a class with static field", () => {
      const program = parse("class Foo { static count = 0; }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            key: { name: string };
            static: boolean;
          }>;
        };
      };
      expect(decl.body.body[0].type).toBe("PropertyDefinition");
      expect(decl.body.body[0].key.name).toBe("count");
      expect(decl.body.body[0].static).toBe(true);
    });

    it("should parse a class with private field", () => {
      const program = parse("class Foo { #secret = 42; }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            key: { name: string };
            value: { value: unknown };
          }>;
        };
      };
      expect(decl.body.body[0].type).toBe("PropertyDefinition");
      expect(decl.body.body[0].key.name).toBe("#secret");
      expect(decl.body.body[0].value.value).toBe(42);
    });

    it("should parse a class with private method", () => {
      const program = parse("class Foo { #doWork() {} }");
      const decl = program.body[0] as {
        type: string;
        body: { body: ReadonlyArray<{ type: string; key: { name: string } }> };
      };
      expect(decl.body.body[0].type).toBe("MethodDefinition");
      expect(decl.body.body[0].key.name).toBe("#doWork");
    });

    it("should parse a class with static block", () => {
      const program = parse("class Foo { static {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{ type: string; body: ReadonlyArray<unknown> }>;
        };
      };
      expect(decl.body.body[0].type).toBe("StaticBlock");
      expect(decl.body.body[0].body.length).toBe(0);
    });

    it("should parse a class with field without initializer", () => {
      const program = parse("class Foo { x; }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            key: { name: string };
            value: unknown;
          }>;
        };
      };
      expect(decl.body.body[0].type).toBe("PropertyDefinition");
      expect(decl.body.body[0].key.name).toBe("x");
      expect(decl.body.body[0].value).toBeNull();
    });

    it("should produce frozen ClassDeclaration node", () => {
      const program = parse("class Foo {}");
      expect(Object.isFrozen(program.body[0])).toBe(true);
    });

    it("should set correct positions", () => {
      const program = parse("class Foo {}");
      expect(program.body[0].start).toBe(0);
      expect(program.body[0].end).toBe(12);
    });
  });

  describe("Import Declarations", () => {
    it("should parse default import", () => {
      const program = parse('import foo from "bar";');
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<{ type: string; local: { name: string } }>;
        source: { value: unknown };
      };
      expect(decl.type).toBe("ImportDeclaration");
      expect(decl.specifiers.length).toBe(1);
      expect(decl.specifiers[0].type).toBe("ImportDefaultSpecifier");
      expect(decl.specifiers[0].local.name).toBe("foo");
      expect(decl.source.value).toBe("bar");
    });

    it("should parse named imports", () => {
      const program = parse('import { a, b } from "mod";');
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<{
          type: string;
          imported: { name: string };
          local: { name: string };
        }>;
      };
      expect(decl.specifiers.length).toBe(2);
      expect(decl.specifiers[0].type).toBe("ImportSpecifier");
      expect(decl.specifiers[0].imported.name).toBe("a");
      expect(decl.specifiers[1].imported.name).toBe("b");
    });

    it("should parse named imports with aliases", () => {
      const program = parse('import { a as x, b as y } from "mod";');
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<{
          type: string;
          imported: { name: string };
          local: { name: string };
        }>;
      };
      expect(decl.specifiers[0].imported.name).toBe("a");
      expect(decl.specifiers[0].local.name).toBe("x");
      expect(decl.specifiers[1].imported.name).toBe("b");
      expect(decl.specifiers[1].local.name).toBe("y");
    });

    it("should parse namespace import", () => {
      const program = parse('import * as ns from "mod";');
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<{ type: string; local: { name: string } }>;
      };
      expect(decl.specifiers.length).toBe(1);
      expect(decl.specifiers[0].type).toBe("ImportNamespaceSpecifier");
      expect(decl.specifiers[0].local.name).toBe("ns");
    });

    it("should parse side-effect import", () => {
      const program = parse('import "polyfill";');
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<unknown>;
        source: { value: unknown };
      };
      expect(decl.type).toBe("ImportDeclaration");
      expect(decl.specifiers.length).toBe(0);
      expect(decl.source.value).toBe("polyfill");
    });

    it("should parse combined default and named imports", () => {
      const program = parse('import React, { useState } from "react";');
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<{ type: string; local: { name: string } }>;
      };
      expect(decl.specifiers.length).toBe(2);
      expect(decl.specifiers[0].type).toBe("ImportDefaultSpecifier");
      expect(decl.specifiers[0].local.name).toBe("React");
      expect(decl.specifiers[1].type).toBe("ImportSpecifier");
      expect(decl.specifiers[1].local.name).toBe("useState");
    });

    it("should parse combined default and namespace imports", () => {
      const program = parse('import def, * as all from "mod";');
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<{ type: string; local: { name: string } }>;
      };
      expect(decl.specifiers.length).toBe(2);
      expect(decl.specifiers[0].type).toBe("ImportDefaultSpecifier");
      expect(decl.specifiers[0].local.name).toBe("def");
      expect(decl.specifiers[1].type).toBe("ImportNamespaceSpecifier");
      expect(decl.specifiers[1].local.name).toBe("all");
    });

    it("should parse import with attributes", () => {
      const program = parse(
        'import data from "data.json" with { type: "json" };',
      );
      const decl = program.body[0] as {
        type: string;
        attributes: ReadonlyArray<{
          type: string;
          key: { name: string };
          value: { value: unknown };
        }>;
      };
      expect(decl.attributes.length).toBe(1);
      expect(decl.attributes[0].type).toBe("ImportAttribute");
      expect(decl.attributes[0].key.name).toBe("type");
      expect(decl.attributes[0].value.value).toBe("json");
    });

    it("should parse import with multiple attributes", () => {
      const program = parse(
        'import data from "data.json" with { type: "json", integrity: "sha256" };',
      );
      const decl = program.body[0] as {
        type: string;
        attributes: ReadonlyArray<{
          type: string;
          key: { name: string };
          value: { value: unknown };
        }>;
      };
      expect(decl.attributes.length).toBe(2);
      expect(decl.attributes[0].key.name).toBe("type");
      expect(decl.attributes[0].value.value).toBe("json");
      expect(decl.attributes[1].key.name).toBe("integrity");
      expect(decl.attributes[1].value.value).toBe("sha256");
    });

    it("should parse import with string literal attribute key", () => {
      const program = parse(
        'import data from "data.json" with { "type": "json" };',
      );
      const decl = program.body[0] as {
        type: string;
        attributes: ReadonlyArray<{ key: { type: string; value: unknown } }>;
      };
      expect(decl.attributes[0].key.type).toBe("Literal");
      expect(decl.attributes[0].key.value).toBe("type");
    });

    it("should parse import without semicolon", () => {
      const program = parse('import foo from "bar"');
      const decl = program.body[0] as { type: string };
      expect(decl.type).toBe("ImportDeclaration");
    });

    it("should produce frozen ImportDeclaration node", () => {
      const program = parse('import foo from "bar";');
      expect(Object.isFrozen(program.body[0])).toBe(true);
    });

    it("should set correct positions", () => {
      const program = parse('import foo from "bar";');
      expect(program.body[0].start).toBe(0);
    });

    it("should parse empty named imports", () => {
      const program = parse('import {} from "mod";');
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<unknown>;
      };
      expect(decl.specifiers.length).toBe(0);
    });

    it("should parse named imports with trailing comma", () => {
      const program = parse('import { a, b, } from "mod";');
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<unknown>;
      };
      expect(decl.specifiers.length).toBe(2);
    });
  });

  describe("Export Declarations", () => {
    it("should parse named exports", () => {
      const program = parse("export { a, b };");
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<{
          type: string;
          local: { name: string };
          exported: { name: string };
        }>;
        source: unknown;
        declaration: unknown;
      };
      expect(decl.type).toBe("ExportNamedDeclaration");
      expect(decl.specifiers.length).toBe(2);
      expect(decl.specifiers[0].local.name).toBe("a");
      expect(decl.specifiers[0].exported.name).toBe("a");
      expect(decl.specifiers[1].local.name).toBe("b");
      expect(decl.source).toBeNull();
      expect(decl.declaration).toBeNull();
    });

    it("should parse named exports with aliases", () => {
      const program = parse("export { a as x, b as y };");
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<{
          local: { name: string };
          exported: { name: string };
        }>;
      };
      expect(decl.specifiers[0].local.name).toBe("a");
      expect(decl.specifiers[0].exported.name).toBe("x");
      expect(decl.specifiers[1].local.name).toBe("b");
      expect(decl.specifiers[1].exported.name).toBe("y");
    });

    it("should parse re-exports", () => {
      const program = parse('export { a } from "mod";');
      const decl = program.body[0] as {
        type: string;
        source: { value: unknown };
        specifiers: ReadonlyArray<{ local: { name: string } }>;
      };
      expect(decl.type).toBe("ExportNamedDeclaration");
      expect(decl.source).not.toBeNull();
      expect(decl.source.value).toBe("mod");
      expect(decl.specifiers[0].local.name).toBe("a");
    });

    it("should parse export all", () => {
      const program = parse('export * from "mod";');
      const decl = program.body[0] as {
        type: string;
        source: { value: unknown };
        exported: unknown;
      };
      expect(decl.type).toBe("ExportAllDeclaration");
      expect(decl.source.value).toBe("mod");
      expect(decl.exported).toBeNull();
    });

    it("should parse export all with alias", () => {
      const program = parse('export * as ns from "mod";');
      const decl = program.body[0] as {
        type: string;
        source: { value: unknown };
        exported: { name: string };
      };
      expect(decl.type).toBe("ExportAllDeclaration");
      expect(decl.exported).not.toBeNull();
      expect(decl.exported.name).toBe("ns");
    });

    it("should parse export default expression (identifier)", () => {
      const program = parse("export default foo;");
      const decl = program.body[0] as {
        type: string;
        declaration: { type: string; name: string };
      };
      expect(decl.type).toBe("ExportDefaultDeclaration");
      expect(decl.declaration.type).toBe("Identifier");
      expect(decl.declaration.name).toBe("foo");
    });

    it("should parse export default function", () => {
      const program = parse("export default function foo() {}");
      const decl = program.body[0] as {
        type: string;
        declaration: { type: string; id: { name: string } };
      };
      expect(decl.type).toBe("ExportDefaultDeclaration");
      expect(decl.declaration.type).toBe("FunctionDeclaration");
      expect(decl.declaration.id.name).toBe("foo");
    });

    it("should parse export default async function", () => {
      const program = parse("export default async function foo() {}");
      const decl = program.body[0] as {
        type: string;
        declaration: { type: string; async: boolean };
      };
      expect(decl.type).toBe("ExportDefaultDeclaration");
      expect(decl.declaration.type).toBe("FunctionDeclaration");
      expect(decl.declaration.async).toBe(true);
    });

    it("should parse export default class", () => {
      const program = parse("export default class Foo {}");
      const decl = program.body[0] as {
        type: string;
        declaration: { type: string; id: { name: string } };
      };
      expect(decl.type).toBe("ExportDefaultDeclaration");
      expect(decl.declaration.type).toBe("ClassDeclaration");
      expect(decl.declaration.id.name).toBe("Foo");
    });

    it("should parse export function declaration", () => {
      const program = parse("export function foo() {}");
      const decl = program.body[0] as {
        type: string;
        declaration: { type: string; id: { name: string } };
        specifiers: ReadonlyArray<unknown>;
      };
      expect(decl.type).toBe("ExportNamedDeclaration");
      expect(decl.declaration).not.toBeNull();
      expect(decl.declaration.type).toBe("FunctionDeclaration");
      expect(decl.declaration.id.name).toBe("foo");
      expect(decl.specifiers.length).toBe(0);
    });

    it("should parse export async function declaration", () => {
      const program = parse("export async function foo() {}");
      const decl = program.body[0] as {
        type: string;
        declaration: { type: string; async: boolean; id: { name: string } };
      };
      expect(decl.type).toBe("ExportNamedDeclaration");
      expect(decl.declaration.type).toBe("FunctionDeclaration");
      expect(decl.declaration.async).toBe(true);
    });

    it("should parse export class declaration", () => {
      const program = parse("export class Foo {}");
      const decl = program.body[0] as {
        type: string;
        declaration: { type: string; id: { name: string } };
      };
      expect(decl.type).toBe("ExportNamedDeclaration");
      expect(decl.declaration.type).toBe("ClassDeclaration");
      expect(decl.declaration.id.name).toBe("Foo");
    });

    it("should parse export const declaration", () => {
      const program = parse("export const x = 1;");
      const decl = program.body[0] as {
        type: string;
        declaration: {
          type: string;
          kind: string;
          declarations: ReadonlyArray<{
            id: { name: string };
            init: { value: unknown };
          }>;
        };
      };
      expect(decl.type).toBe("ExportNamedDeclaration");
      expect(decl.declaration.type).toBe("VariableDeclaration");
      expect(decl.declaration.kind).toBe("const");
      expect(decl.declaration.declarations[0].id.name).toBe("x");
      expect(decl.declaration.declarations[0].init.value).toBe(1);
    });

    it("should parse export without semicolon", () => {
      const program = parse("export { a }");
      const decl = program.body[0] as { type: string };
      expect(decl.type).toBe("ExportNamedDeclaration");
    });

    it("should produce frozen ExportNamedDeclaration node", () => {
      const program = parse("export { a };");
      expect(Object.isFrozen(program.body[0])).toBe(true);
    });

    it("should parse empty named exports", () => {
      const program = parse("export {};");
      const decl = program.body[0] as {
        type: string;
        specifiers: ReadonlyArray<unknown>;
      };
      expect(decl.type).toBe("ExportNamedDeclaration");
      expect(decl.specifiers.length).toBe(0);
    });

    it("should parse export default literal", () => {
      const program = parse("export default 42;");
      const decl = program.body[0] as {
        type: string;
        declaration: { type: string; value: unknown };
      };
      expect(decl.type).toBe("ExportDefaultDeclaration");
      expect(decl.declaration.type).toBe("Literal");
      expect(decl.declaration.value).toBe(42);
    });
  });

  describe("Variable Declarations (via export)", () => {
    it("should parse export with multiple declarators", () => {
      const program = parse("export const a = 1, b = 2;");
      const decl = program.body[0] as {
        type: string;
        declaration: {
          type: string;
          declarations: ReadonlyArray<{
            id: { name: string };
            init: { value: unknown };
          }>;
        };
      };
      expect(decl.declaration.declarations.length).toBe(2);
      expect(decl.declaration.declarations[0].id.name).toBe("a");
      expect(decl.declaration.declarations[0].init.value).toBe(1);
      expect(decl.declaration.declarations[1].id.name).toBe("b");
      expect(decl.declaration.declarations[1].init.value).toBe(2);
    });

    it("should parse export const without initializer", () => {
      const program = parse("export const x;");
      const decl = program.body[0] as {
        type: string;
        declaration: {
          declarations: ReadonlyArray<{ id: { name: string }; init: unknown }>;
        };
      };
      expect(decl.declaration.declarations[0].id.name).toBe("x");
      expect(decl.declaration.declarations[0].init).toBeNull();
    });
  });

  describe("Class Advanced Features", () => {
    it("should parse class with computed property key", () => {
      const program = parse("class Foo { [x]() {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            computed: boolean;
            key: { type: string; name: string };
          }>;
        };
      };
      expect(decl.body.body[0].type).toBe("MethodDefinition");
      expect(decl.body.body[0].computed).toBe(true);
      expect(decl.body.body[0].key.type).toBe("Identifier");
      expect(decl.body.body[0].key.name).toBe("x");
    });

    it("should parse class with numeric literal key", () => {
      const program = parse("class Foo { 0() {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            key: { type: string; value: unknown };
          }>;
        };
      };
      expect(decl.body.body[0].type).toBe("MethodDefinition");
      expect(decl.body.body[0].key.type).toBe("Literal");
      expect(decl.body.body[0].key.value).toBe(0);
    });

    it("should parse class with string literal key", () => {
      const program = parse('class Foo { "hello"() {} }');
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            key: { type: string; value: unknown };
          }>;
        };
      };
      expect(decl.body.body[0].type).toBe("MethodDefinition");
      expect(decl.body.body[0].key.type).toBe("Literal");
      expect(decl.body.body[0].key.value).toBe("hello");
    });

    it("should parse class with static constructor method", () => {
      const program = parse("class Foo { static constructor() {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{ type: string; kind: string; static: boolean }>;
        };
      };
      // Static constructor is a regular static method, not a 'constructor' kind
      expect(decl.body.body[0].kind).toBe("method");
      expect(decl.body.body[0].static).toBe(true);
    });

    it('should parse class with method named "get"', () => {
      const program = parse("class Foo { get() {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            kind: string;
            key: { name: string };
          }>;
        };
      };
      // 'get' followed by ( means it's a method named 'get'
      expect(decl.body.body[0].kind).toBe("method");
      expect(decl.body.body[0].key.name).toBe("get");
    });

    it('should parse class with method named "set"', () => {
      const program = parse("class Foo { set() {} }");
      const decl = program.body[0] as {
        type: string;
        body: {
          body: ReadonlyArray<{
            type: string;
            kind: string;
            key: { name: string };
          }>;
        };
      };
      expect(decl.body.body[0].kind).toBe("method");
      expect(decl.body.body[0].key.name).toBe("set");
    });

    it("should parse class with computed property field", () => {
      const program = parse("class Foo { [x] = 1; }");
      const decl = program.body[0] as {
        type: string;
        body: { body: ReadonlyArray<{ type: string; computed: boolean }> };
      };
      expect(decl.body.body[0].type).toBe("PropertyDefinition");
      expect(decl.body.body[0].computed).toBe(true);
    });
  });

  describe("Error Cases", () => {
    it("should throw on missing import source", () => {
      expect(() => parse("import foo from;")).toThrow(SyntaxError);
    });

    it("should throw on invalid export syntax", () => {
      expect(() => parse("export 123;")).toThrow(SyntaxError);
    });

    it("should throw on missing export source for re-export", () => {
      expect(() => parse("export * from;")).toThrow(SyntaxError);
    });

    it("should throw on missing module source in named re-export", () => {
      expect(() => parse("export { a } from;")).toThrow(SyntaxError);
    });

    it("should throw for invalid token in class body", () => {
      expect(() => parse("class Foo { ...invalid }")).toThrow(SyntaxError);
    });

    it("should throw for export all missing source", () => {
      expect(() => parse("export * as ns from;")).toThrow(SyntaxError);
    });

    it("should throw for invalid export specifier alias", () => {
      expect(() => parse("export { a as 123 };")).toThrow(SyntaxError);
    });

    it("should throw for invalid import attribute value", () => {
      expect(() => parse('import x from "y" with { type: 123 };')).toThrow(
        SyntaxError,
      );
    });

    it("should throw for invalid import attribute key", () => {
      expect(() => parse('import x from "y" with { 123: "json" };')).toThrow(
        SyntaxError,
      );
    });
  });

  describe("Multiple Declarations", () => {
    it("should parse multiple declarations in sequence", () => {
      const program = parse(
        'import x from "a"; export function foo() {} class Bar {}',
      );
      expect(program.body.length).toBe(3);
      expect(program.body[0].type).toBe("ImportDeclaration");
      expect(program.body[1].type).toBe("ExportNamedDeclaration");
      expect(program.body[2].type).toBe("ClassDeclaration");
    });

    it("should parse function followed by class", () => {
      const program = parse("function foo() {} class Bar {}");
      expect(program.body.length).toBe(2);
      expect(program.body[0].type).toBe("FunctionDeclaration");
      expect(program.body[1].type).toBe("ClassDeclaration");
    });
  });

  describe("Class Declarations edge cases", () => {
    it("should parse class declaration without name (export default)", () => {
      const program = parse("export default class {}");
      const exportDecl = program.body[0] as {
        type: string;
        declaration: { type: string; id: null };
      };
      expect(exportDecl.type).toBe("ExportDefaultDeclaration");
      expect(exportDecl.declaration.type).toBe("ClassDeclaration");
      expect(exportDecl.declaration.id).toBeNull();
    });

    it("should parse class with semicolons in body (empty statements)", () => {
      const program = parse("class Foo { ; ; method() {} ; }");
      const decl = program.body[0] as {
        type: string;
        body: { body: Array<{ type: string }> };
      };
      expect(decl.type).toBe("ClassDeclaration");
      // Semicolons should be skipped
      expect(decl.body.body.length).toBe(1);
    });

    it("should parse spread element in function call arguments", () => {
      const program = parse("foo(...args);");
      const stmt = program.body[0] as {
        expression: { arguments: Array<{ type: string }> };
      };
      expect(stmt.expression.arguments[0].type).toBe("SpreadElement");
    });
  });

  describe("Import edge cases", () => {
    it("should parse import with default and namespace combined", () => {
      const program = parse('import def, * as ns from "mod";');
      const decl = program.body[0] as {
        type: string;
        specifiers: Array<{ type: string }>;
      };
      expect(decl.type).toBe("ImportDeclaration");
      expect(decl.specifiers.length).toBe(2);
      expect(decl.specifiers[0].type).toBe("ImportDefaultSpecifier");
      expect(decl.specifiers[1].type).toBe("ImportNamespaceSpecifier");
    });

    it("should parse import with keyword as imported name", () => {
      const program = parse('import { default as myDefault } from "mod";');
      const decl = program.body[0] as {
        type: string;
        specifiers: Array<{
          type: string;
          imported: { name: string };
          local: { name: string };
        }>;
      };
      expect(decl.specifiers[0].imported.name).toBe("default");
      expect(decl.specifiers[0].local.name).toBe("myDefault");
    });
  });

  describe("Decorator with arguments in class declaration", () => {
    it("should parse decorator with multiple arguments", () => {
      const program = parse("@dec(a, b) class Foo {}");
      const decl = program.body[0] as {
        type: string;
        decorators: Array<{ type: string }>;
      };
      expect(decl.type).toBe("ClassDeclaration");
      expect(decl.decorators.length).toBe(1);
    });

    it("should parse decorator with spread argument", () => {
      const program = parse("@dec(...args) class Bar {}");
      const decl = program.body[0] as {
        type: string;
        decorators: Array<{ type: string }>;
      };
      expect(decl.decorators.length).toBe(1);
    });

    it("should parse decorator with single argument", () => {
      const program = parse("@dec(x) class Baz {}");
      const decl = program.body[0] as {
        type: string;
        decorators: Array<{ type: string }>;
      };
      expect(decl.decorators.length).toBe(1);
    });
  });

  describe("Import default with namespace combined", () => {
    it("should parse import default + namespace import", () => {
      const program = parse('import def, * as ns from "mod";');
      const decl = program.body[0] as {
        type: string;
        specifiers: Array<{ type: string }>;
      };
      expect(decl.specifiers.length).toBe(2);
      expect(decl.specifiers[0].type).toBe("ImportDefaultSpecifier");
      expect(decl.specifiers[1].type).toBe("ImportNamespaceSpecifier");
    });

    it("should parse import default + named imports combined", () => {
      const program = parse('import def, { a, b } from "mod";');
      const decl = program.body[0] as {
        type: string;
        specifiers: Array<{ type: string }>;
      };
      expect(decl.specifiers.length).toBe(3);
      expect(decl.specifiers[0].type).toBe("ImportDefaultSpecifier");
      expect(decl.specifiers[1].type).toBe("ImportSpecifier");
    });
  });

  describe("Export edge cases", () => {
    it("should parse export specifier with keyword as local name", () => {
      const program = parse("const x = 1; export { x as default };");
      const exportDecl = program.body[1] as {
        type: string;
        specifiers: Array<{
          type: string;
          local: { name: string };
          exported: { name: string };
        }>;
      };
      expect(exportDecl.specifiers[0].exported.name).toBe("default");
    });
  });
});
