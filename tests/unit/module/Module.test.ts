/**
 * @module tests/unit/module/Module
 * @description Unit tests for the Module class.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Module } from "../../../src/module/Module.js";
import { ExternalModule } from "../../../src/module/ExternalModule.js";
import type { ProgramNode } from "../../../src/ast/types.js";

/**
 * Helper to create a minimal ProgramNode AST.
 */
const createProgram = (
  body: ReadonlyArray<Record<string, unknown>>,
): ProgramNode =>
  ({
    type: "Program",
    body,
    sourceType: "module",
    start: 0,
    end: 100,
  }) as unknown as ProgramNode;

describe("Module", () => {
  describe("constructor", () => {
    it("sets id correctly", () => {
      const mod = new Module("/src/index.ts", "const x = 1;", true);
      expect(mod.id).toBe("/src/index.ts");
    });

    it("sets code correctly", () => {
      const mod = new Module("/src/index.ts", "const x = 1;", false);
      expect(mod.code).toBe("const x = 1;");
    });

    it("sets isEntry correctly", () => {
      const entry = new Module("/src/main.ts", "", true);
      const nonEntry = new Module("/src/lib.ts", "", false);
      expect(entry.isEntry).toBe(true);
      expect(nonEntry.isEntry).toBe(false);
    });

    it("initializes ast to null", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.ast).toBeNull();
    });

    it("initializes empty dependencies set", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.dependencies.size).toBe(0);
    });

    it("initializes empty importers set", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.importers.size).toBe(0);
    });

    it("initializes empty imports array", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.imports).toEqual([]);
    });

    it("initializes empty exports array", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.exports).toEqual([]);
    });

    it("initializes empty dynamicImports array", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.dynamicImports).toEqual([]);
    });

    it("initializes isIncluded to false", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.isIncluded).toBe(false);
    });

    it("initializes attributes to empty object", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.attributes).toEqual({});
    });

    it("initializes meta to empty object", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.meta).toEqual({});
    });

    it("initializes syntheticNamedExports to false", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.syntheticNamedExports).toBe(false);
    });

    it("initializes hasDefaultExport to false", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.hasDefaultExport).toBe(false);
    });

    it("initializes moduleSideEffects to true", () => {
      const mod = new Module("/src/index.ts", "", false);
      expect(mod.moduleSideEffects).toBe(true);
    });
  });

  describe("extractImportsExports", () => {
    let mod: Module;

    beforeEach(() => {
      mod = new Module("/src/test.ts", "", false);
    });

    it("does nothing when ast is null", () => {
      mod.extractImportsExports();
      expect(mod.imports).toEqual([]);
      expect(mod.exports).toEqual([]);
    });

    it("extracts default import", () => {
      mod.ast = createProgram([
        {
          type: "ImportDeclaration",
          start: 0,
          end: 30,
          specifiers: [
            {
              type: "ImportDefaultSpecifier",
              start: 7,
              end: 10,
              local: { type: "Identifier", name: "foo", start: 7, end: 10 },
            },
          ],
          source: { type: "Literal", value: "./foo", start: 16, end: 23 },
        },
      ]);

      mod.extractImportsExports();

      expect(mod.imports).toHaveLength(1);
      expect(mod.imports[0].source).toBe("./foo");
      expect(mod.imports[0].specifiers).toHaveLength(1);
      expect(mod.imports[0].specifiers[0]).toEqual({
        type: "default",
        imported: "default",
        local: "foo",
      });
    });

    it("extracts named imports", () => {
      mod.ast = createProgram([
        {
          type: "ImportDeclaration",
          start: 0,
          end: 40,
          specifiers: [
            {
              type: "ImportSpecifier",
              start: 9,
              end: 12,
              imported: { type: "Identifier", name: "bar", start: 9, end: 12 },
              local: { type: "Identifier", name: "bar", start: 9, end: 12 },
            },
            {
              type: "ImportSpecifier",
              start: 14,
              end: 22,
              imported: { type: "Identifier", name: "baz", start: 14, end: 17 },
              local: { type: "Identifier", name: "qux", start: 21, end: 24 },
            },
          ],
          source: { type: "Literal", value: "./utils", start: 30, end: 39 },
        },
      ]);

      mod.extractImportsExports();

      expect(mod.imports).toHaveLength(1);
      expect(mod.imports[0].source).toBe("./utils");
      expect(mod.imports[0].specifiers).toHaveLength(2);
      expect(mod.imports[0].specifiers[0]).toEqual({
        type: "named",
        imported: "bar",
        local: "bar",
      });
      expect(mod.imports[0].specifiers[1]).toEqual({
        type: "named",
        imported: "baz",
        local: "qux",
      });
    });

    it("extracts namespace import", () => {
      mod.ast = createProgram([
        {
          type: "ImportDeclaration",
          start: 0,
          end: 30,
          specifiers: [
            {
              type: "ImportNamespaceSpecifier",
              start: 7,
              end: 15,
              local: { type: "Identifier", name: "ns", start: 12, end: 14 },
            },
          ],
          source: { type: "Literal", value: "./ns", start: 21, end: 27 },
        },
      ]);

      mod.extractImportsExports();

      expect(mod.imports).toHaveLength(1);
      expect(mod.imports[0].specifiers[0]).toEqual({
        type: "namespace",
        imported: "*",
        local: "ns",
      });
    });

    it("extracts named imports with literal imported name", () => {
      mod.ast = createProgram([
        {
          type: "ImportDeclaration",
          start: 0,
          end: 40,
          specifiers: [
            {
              type: "ImportSpecifier",
              start: 9,
              end: 25,
              imported: {
                type: "Literal",
                value: "my-export",
                start: 9,
                end: 20,
              },
              local: {
                type: "Identifier",
                name: "myExport",
                start: 24,
                end: 32,
              },
            },
          ],
          source: { type: "Literal", value: "./mod", start: 38, end: 45 },
        },
      ]);

      mod.extractImportsExports();

      expect(mod.imports[0].specifiers[0]).toEqual({
        type: "named",
        imported: "my-export",
        local: "myExport",
      });
    });

    it("extracts named export with declaration", () => {
      mod.ast = createProgram([
        {
          type: "ExportNamedDeclaration",
          start: 0,
          end: 25,
          declaration: {
            type: "VariableDeclaration",
            start: 7,
            end: 25,
            kind: "const",
            declarations: [
              {
                type: "VariableDeclarator",
                start: 13,
                end: 24,
                id: { type: "Identifier", name: "x", start: 13, end: 14 },
                init: { type: "Literal", value: 1, start: 17, end: 18 },
              },
            ],
          },
          specifiers: [],
          source: null,
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports).toHaveLength(1);
      expect(mod.exports[0]).toEqual({
        type: "named",
        local: "x",
        exported: "x",
        source: undefined,
      });
    });

    it("extracts named export with function declaration", () => {
      mod.ast = createProgram([
        {
          type: "ExportNamedDeclaration",
          start: 0,
          end: 30,
          declaration: {
            type: "FunctionDeclaration",
            start: 7,
            end: 30,
            id: { type: "Identifier", name: "myFunc", start: 16, end: 22 },
            params: [],
            body: { type: "BlockStatement", body: [], start: 25, end: 27 },
            generator: false,
            async: false,
          },
          specifiers: [],
          source: null,
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports).toHaveLength(1);
      expect(mod.exports[0]).toEqual({
        type: "named",
        local: "myFunc",
        exported: "myFunc",
        source: undefined,
      });
    });

    it("extracts named variable export with source", () => {
      mod.ast = createProgram([
        {
          type: "ExportNamedDeclaration",
          start: 0,
          end: 40,
          declaration: {
            type: "VariableDeclaration",
            start: 7,
            end: 25,
            kind: "const",
            declarations: [
              {
                type: "VariableDeclarator",
                start: 13,
                end: 24,
                id: { type: "Identifier", name: "y", start: 13, end: 14 },
                init: { type: "Literal", value: 2, start: 17, end: 18 },
              },
            ],
          },
          specifiers: [],
          source: { type: "Literal", value: "./source", start: 30, end: 40 },
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports[0].source).toBe("./source");
    });

    it("extracts named function export with source", () => {
      mod.ast = createProgram([
        {
          type: "ExportNamedDeclaration",
          start: 0,
          end: 50,
          declaration: {
            type: "FunctionDeclaration",
            start: 7,
            end: 40,
            id: { type: "Identifier", name: "fn", start: 16, end: 18 },
            params: [],
            body: { type: "BlockStatement", body: [], start: 21, end: 23 },
            generator: false,
            async: false,
          },
          specifiers: [],
          source: { type: "Literal", value: "./src", start: 42, end: 49 },
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports[0].source).toBe("./src");
    });

    it("extracts named export with class declaration", () => {
      mod.ast = createProgram([
        {
          type: "ExportNamedDeclaration",
          start: 0,
          end: 30,
          declaration: {
            type: "ClassDeclaration",
            start: 7,
            end: 30,
            id: { type: "Identifier", name: "MyClass", start: 13, end: 20 },
            superClass: null,
            body: { type: "ClassBody", body: [], start: 21, end: 23 },
            decorators: [],
          },
          specifiers: [],
          source: null,
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports).toHaveLength(1);
      expect(mod.exports[0]).toEqual({
        type: "named",
        local: "MyClass",
        exported: "MyClass",
        source: undefined,
      });
    });

    it("extracts named export with specifiers", () => {
      mod.ast = createProgram([
        {
          type: "ExportNamedDeclaration",
          start: 0,
          end: 30,
          declaration: null,
          specifiers: [
            {
              type: "ExportSpecifier",
              start: 9,
              end: 20,
              local: { type: "Identifier", name: "a", start: 9, end: 10 },
              exported: { type: "Identifier", name: "b", start: 14, end: 15 },
            },
          ],
          source: null,
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports).toHaveLength(1);
      expect(mod.exports[0]).toEqual({
        type: "named",
        local: "a",
        exported: "b",
        source: undefined,
      });
    });

    it("extracts re-export with source", () => {
      mod.ast = createProgram([
        {
          type: "ExportNamedDeclaration",
          start: 0,
          end: 40,
          declaration: null,
          specifiers: [
            {
              type: "ExportSpecifier",
              start: 9,
              end: 12,
              local: { type: "Identifier", name: "x", start: 9, end: 10 },
              exported: { type: "Identifier", name: "x", start: 9, end: 10 },
            },
          ],
          source: { type: "Literal", value: "./other", start: 20, end: 29 },
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports[0].source).toBe("./other");
    });

    it("extracts default export", () => {
      mod.ast = createProgram([
        {
          type: "ExportDefaultDeclaration",
          start: 0,
          end: 20,
          declaration: { type: "Literal", value: 42, start: 15, end: 17 },
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports).toHaveLength(1);
      expect(mod.exports[0]).toEqual({
        type: "default",
        local: "default",
        exported: "default",
      });
      expect(mod.hasDefaultExport).toBe(true);
    });

    it("extracts export all (star export)", () => {
      mod.ast = createProgram([
        {
          type: "ExportAllDeclaration",
          start: 0,
          end: 25,
          source: { type: "Literal", value: "./lib", start: 15, end: 22 },
          exported: null,
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports).toHaveLength(1);
      expect(mod.exports[0]).toEqual({
        type: "all",
        source: "./lib",
      });
    });

    it("extracts export all as namespace", () => {
      mod.ast = createProgram([
        {
          type: "ExportAllDeclaration",
          start: 0,
          end: 35,
          source: { type: "Literal", value: "./lib", start: 25, end: 32 },
          exported: { type: "Identifier", name: "lib", start: 15, end: 18 },
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports).toHaveLength(1);
      expect(mod.exports[0]).toEqual({
        type: "allAs",
        exported: "lib",
        source: "./lib",
      });
    });

    it("extracts dynamic imports from nested expressions", () => {
      mod.ast = createProgram([
        {
          type: "ExpressionStatement",
          start: 0,
          end: 20,
          expression: {
            type: "ImportExpression",
            start: 0,
            end: 19,
            source: { type: "Literal", value: "./lazy", start: 7, end: 15 },
          },
        },
      ]);

      mod.extractImportsExports();

      expect(mod.dynamicImports).toEqual(["./lazy"]);
    });

    it("handles null elements in AST arrays during dynamic import search", () => {
      mod.ast = createProgram([
        {
          type: "ExpressionStatement",
          start: 0,
          end: 30,
          expression: {
            type: "ArrayExpression",
            start: 0,
            end: 30,
            elements: [null, undefined],
          },
        },
      ]);

      mod.extractImportsExports();
      expect(mod.dynamicImports).toEqual([]);
    });

    it("handles dynamic import with non-string source", () => {
      mod.ast = createProgram([
        {
          type: "ExpressionStatement",
          start: 0,
          end: 20,
          expression: {
            type: "ImportExpression",
            start: 0,
            end: 19,
            source: {
              type: "Identifier",
              name: "dynamicPath",
              start: 7,
              end: 18,
            },
          },
        },
      ]);

      mod.extractImportsExports();
      expect(mod.dynamicImports).toEqual([]);
    });

    it("handles dynamic import with non-string literal value", () => {
      mod.ast = createProgram([
        {
          type: "ExpressionStatement",
          start: 0,
          end: 20,
          expression: {
            type: "ImportExpression",
            start: 0,
            end: 19,
            source: { type: "Literal", value: 123, start: 7, end: 10 },
          },
        },
      ]);

      mod.extractImportsExports();
      expect(mod.dynamicImports).toEqual([]);
    });

    it("clears previous results on re-extraction", () => {
      mod.ast = createProgram([
        {
          type: "ExportDefaultDeclaration",
          start: 0,
          end: 20,
          declaration: { type: "Literal", value: 1, start: 15, end: 16 },
        },
      ]);

      mod.extractImportsExports();
      expect(mod.exports).toHaveLength(1);

      // Replace AST and re-extract
      mod.ast = createProgram([]);
      mod.extractImportsExports();
      expect(mod.exports).toHaveLength(0);
      expect(mod.hasDefaultExport).toBe(false);
    });

    it("handles multiple declarations in variable export", () => {
      mod.ast = createProgram([
        {
          type: "ExportNamedDeclaration",
          start: 0,
          end: 40,
          declaration: {
            type: "VariableDeclaration",
            start: 7,
            end: 40,
            kind: "const",
            declarations: [
              {
                type: "VariableDeclarator",
                start: 13,
                end: 18,
                id: { type: "Identifier", name: "a", start: 13, end: 14 },
                init: { type: "Literal", value: 1, start: 17, end: 18 },
              },
              {
                type: "VariableDeclarator",
                start: 20,
                end: 25,
                id: { type: "Identifier", name: "b", start: 20, end: 21 },
                init: { type: "Literal", value: 2, start: 24, end: 25 },
              },
            ],
          },
          specifiers: [],
          source: null,
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports).toHaveLength(2);
      expect(mod.exports[0].exported).toBe("a");
      expect(mod.exports[1].exported).toBe("b");
    });

    it("handles export specifier with literal names", () => {
      mod.ast = createProgram([
        {
          type: "ExportNamedDeclaration",
          start: 0,
          end: 40,
          declaration: null,
          specifiers: [
            {
              type: "ExportSpecifier",
              start: 9,
              end: 30,
              local: { type: "Literal", value: "my-local", start: 9, end: 19 },
              exported: {
                type: "Literal",
                value: "my-exported",
                start: 23,
                end: 36,
              },
            },
          ],
          source: null,
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports[0]).toEqual({
        type: "named",
        local: "my-local",
        exported: "my-exported",
        source: undefined,
      });
    });

    it("handles export all with literal exported name", () => {
      mod.ast = createProgram([
        {
          type: "ExportAllDeclaration",
          start: 0,
          end: 40,
          source: { type: "Literal", value: "./pkg", start: 30, end: 37 },
          exported: {
            type: "Literal",
            value: "my-ns",
            start: 15,
            end: 22,
          },
        },
      ]);

      mod.extractImportsExports();

      expect(mod.exports[0]).toEqual({
        type: "allAs",
        exported: "my-ns",
        source: "./pkg",
      });
    });
  });

  describe("dependencies and importers tracking", () => {
    it("tracks module dependencies", () => {
      const modA = new Module("/src/a.ts", "", false);
      const modB = new Module("/src/b.ts", "", false);

      modA.dependencies.add(modB);
      expect(modA.dependencies.has(modB)).toBe(true);
      expect(modA.dependencies.size).toBe(1);
    });

    it("tracks external module dependencies", () => {
      const mod = new Module("/src/a.ts", "", false);
      const ext = new ExternalModule("lodash");

      mod.dependencies.add(ext);
      expect(mod.dependencies.has(ext)).toBe(true);
    });

    it("tracks importers", () => {
      const modA = new Module("/src/a.ts", "", false);
      const modB = new Module("/src/b.ts", "", false);

      modB.importers.add(modA);
      expect(modB.importers.has(modA)).toBe(true);
    });
  });

  describe("toModuleInfo", () => {
    it("produces correct shape with minimal data", () => {
      const mod = new Module("/src/main.ts", "const x = 1;", true);
      const info = mod.toModuleInfo();

      expect(info.id).toBe("/src/main.ts");
      expect(info.code).toBe("const x = 1;");
      expect(info.ast).toBeNull();
      expect(info.isEntry).toBe(true);
      expect(info.isExternal).toBe(false);
      expect(info.isIncluded).toBe(false);
      expect(info.importedIds).toEqual([]);
      expect(info.importedIdResolutions).toEqual([]);
      expect(info.dynamicallyImportedIds).toEqual([]);
      expect(info.dynamicallyImportedIdResolutions).toEqual([]);
      expect(info.importers).toEqual([]);
      expect(info.dynamicImporters).toEqual([]);
      expect(info.exportedBindings).toEqual({});
      expect(info.exports).toEqual([]);
      expect(info.hasDefaultExport).toBe(false);
      expect(info.meta).toEqual({});
      expect(info.syntheticNamedExports).toBe(false);
      expect(info.moduleSideEffects).toBe(true);
    });

    it("includes importedIds from imports", () => {
      const mod = new Module("/src/main.ts", "", false);
      mod.imports.push({
        source: "./utils",
        specifiers: [{ type: "named", imported: "foo", local: "foo" }],
        attributes: {},
      });

      const info = mod.toModuleInfo();
      expect(info.importedIds).toEqual(["./utils"]);
      expect(info.importedIdResolutions).toHaveLength(1);
      expect(info.importedIdResolutions[0].id).toBe("./utils");
    });

    it("includes dynamically imported ids", () => {
      const mod = new Module("/src/main.ts", "", false);
      mod.dynamicImports.push("./lazy");

      const info = mod.toModuleInfo();
      expect(info.dynamicallyImportedIds).toEqual(["./lazy"]);
      expect(info.dynamicallyImportedIdResolutions).toHaveLength(1);
      expect(info.dynamicallyImportedIdResolutions[0].id).toBe("./lazy");
    });

    it("includes importer ids", () => {
      const mod = new Module("/src/lib.ts", "", false);
      const importer = new Module("/src/main.ts", "", true);
      mod.importers.add(importer);

      const info = mod.toModuleInfo();
      expect(info.importers).toEqual(["/src/main.ts"]);
    });

    it("includes export names and bindings", () => {
      const mod = new Module("/src/lib.ts", "", false);
      mod.exports.push({ type: "named", local: "x", exported: "x" });
      mod.exports.push({
        type: "default",
        local: "default",
        exported: "default",
      });
      mod.hasDefaultExport = true;

      const info = mod.toModuleInfo();
      expect(info.exports).toEqual(["x", "default"]);
      expect(info.exportedBindings).toEqual({ ".": ["x", "default"] });
      expect(info.hasDefaultExport).toBe(true);
    });

    it("groups re-export bindings by source", () => {
      const mod = new Module("/src/index.ts", "", false);
      mod.exports.push({
        type: "named",
        local: "a",
        exported: "a",
        source: "./a",
      });
      mod.exports.push({ type: "all", source: "./b" });

      const info = mod.toModuleInfo();
      expect(info.exportedBindings).toEqual({
        "./a": ["a"],
        "./b": ["*"],
      });
    });

    it("falls back to local then star for allAs export name", () => {
      const mod = new Module("/src/index.ts", "", false);
      mod.exports.push({ type: "allAs", local: "myLocal", source: "./c" });

      const info = mod.toModuleInfo();
      expect(info.exports).toEqual(["myLocal"]);
    });

    it("falls back to star when no exported or local on allAs", () => {
      const mod = new Module("/src/index.ts", "", false);
      mod.exports.push({ type: "allAs", source: "./c" });

      const info = mod.toModuleInfo();
      expect(info.exports).toEqual(["*"]);
    });

    it("reflects syntheticNamedExports and moduleSideEffects", () => {
      const mod = new Module("/src/lib.ts", "", false);
      mod.syntheticNamedExports = "__exports";
      mod.moduleSideEffects = "no-treeshake";

      const info = mod.toModuleInfo();
      expect(info.syntheticNamedExports).toBe("__exports");
      expect(info.moduleSideEffects).toBe("no-treeshake");
    });

    it("copies meta without reference sharing", () => {
      const mod = new Module("/src/lib.ts", "", false);
      mod.meta["plugin"] = "test-plugin";

      const info = mod.toModuleInfo();
      expect(info.meta).toEqual({ plugin: "test-plugin" });

      // Ensure it's a copy
      mod.meta["plugin"] = "changed";
      expect(info.meta["plugin"]).toBe("test-plugin");
    });
  });

  describe("mutable state", () => {
    it("allows setting isIncluded", () => {
      const mod = new Module("/src/a.ts", "", false);
      mod.isIncluded = true;
      expect(mod.isIncluded).toBe(true);
    });

    it("allows setting code", () => {
      const mod = new Module("/src/a.ts", "original", false);
      mod.code = "transformed";
      expect(mod.code).toBe("transformed");
    });

    it("allows setting ast", () => {
      const mod = new Module("/src/a.ts", "", false);
      const ast = createProgram([]);
      mod.ast = ast;
      expect(mod.ast).toBe(ast);
    });

    it("allows setting moduleSideEffects", () => {
      const mod = new Module("/src/a.ts", "", false);
      mod.moduleSideEffects = false;
      expect(mod.moduleSideEffects).toBe(false);
    });

    it("allows setting syntheticNamedExports", () => {
      const mod = new Module("/src/a.ts", "", false);
      mod.syntheticNamedExports = "default";
      expect(mod.syntheticNamedExports).toBe("default");
    });
  });
});
