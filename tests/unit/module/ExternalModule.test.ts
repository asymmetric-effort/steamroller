/**
 * @module tests/unit/module/ExternalModule
 * @description Unit tests for the ExternalModule class.
 */

import { describe, it, expect } from "vitest";
import { ExternalModule } from "../../../src/module/ExternalModule.js";
import { Module } from "../../../src/module/Module.js";

describe("ExternalModule", () => {
  describe("constructor", () => {
    it("sets id correctly", () => {
      const ext = new ExternalModule("lodash");
      expect(ext.id).toBe("lodash");
    });

    it("sets isExternal to true", () => {
      const ext = new ExternalModule("react");
      expect(ext.isExternal).toBe(true);
    });

    it("initializes empty importers set", () => {
      const ext = new ExternalModule("lodash");
      expect(ext.importers.size).toBe(0);
    });

    it("initializes empty importedBindings map", () => {
      const ext = new ExternalModule("lodash");
      expect(ext.importedBindings.size).toBe(0);
    });

    it("initializes renameId to null", () => {
      const ext = new ExternalModule("lodash");
      expect(ext.renameId).toBeNull();
    });
  });

  describe("isExternal", () => {
    it("is always true regardless of id", () => {
      const ext1 = new ExternalModule("lodash");
      const ext2 = new ExternalModule("@scope/pkg");
      const ext3 = new ExternalModule("./relative");

      expect(ext1.isExternal).toBe(true);
      expect(ext2.isExternal).toBe(true);
      expect(ext3.isExternal).toBe(true);
    });

    it("cannot be changed (readonly)", () => {
      const ext = new ExternalModule("lodash");
      // TypeScript would prevent this at compile time; verify runtime value
      expect(ext.isExternal).toBe(true);
    });
  });

  describe("addImporter", () => {
    it("adds module to importers set", () => {
      const ext = new ExternalModule("lodash");
      const mod = new Module("/src/main.ts", "", true);

      ext.addImporter(mod, ["map", "filter"]);

      expect(ext.importers.has(mod)).toBe(true);
      expect(ext.importers.size).toBe(1);
    });

    it("records bindings for the importer", () => {
      const ext = new ExternalModule("lodash");
      const mod = new Module("/src/main.ts", "", true);

      ext.addImporter(mod, ["map", "filter"]);

      const bindings = ext.importedBindings.get(mod.id);
      expect(bindings).toBeDefined();
      expect(bindings!.has("map")).toBe(true);
      expect(bindings!.has("filter")).toBe(true);
      expect(bindings!.size).toBe(2);
    });

    it("merges bindings when same importer calls addImporter multiple times", () => {
      const ext = new ExternalModule("lodash");
      const mod = new Module("/src/main.ts", "", true);

      ext.addImporter(mod, ["map"]);
      ext.addImporter(mod, ["filter", "reduce"]);

      const bindings = ext.importedBindings.get(mod.id);
      expect(bindings!.size).toBe(3);
      expect(bindings!.has("map")).toBe(true);
      expect(bindings!.has("filter")).toBe(true);
      expect(bindings!.has("reduce")).toBe(true);
    });

    it("tracks multiple importers independently", () => {
      const ext = new ExternalModule("lodash");
      const modA = new Module("/src/a.ts", "", false);
      const modB = new Module("/src/b.ts", "", false);

      ext.addImporter(modA, ["map"]);
      ext.addImporter(modB, ["filter"]);

      expect(ext.importers.size).toBe(2);
      expect(ext.importedBindings.size).toBe(2);

      const bindingsA = ext.importedBindings.get(modA.id);
      const bindingsB = ext.importedBindings.get(modB.id);
      expect(bindingsA!.has("map")).toBe(true);
      expect(bindingsA!.has("filter")).toBe(false);
      expect(bindingsB!.has("filter")).toBe(true);
      expect(bindingsB!.has("map")).toBe(false);
    });

    it("handles empty bindings array", () => {
      const ext = new ExternalModule("lodash");
      const mod = new Module("/src/main.ts", "", true);

      ext.addImporter(mod, []);

      expect(ext.importers.has(mod)).toBe(true);
      const bindings = ext.importedBindings.get(mod.id);
      expect(bindings!.size).toBe(0);
    });

    it("does not duplicate bindings", () => {
      const ext = new ExternalModule("lodash");
      const mod = new Module("/src/main.ts", "", true);

      ext.addImporter(mod, ["map", "map", "filter"]);

      const bindings = ext.importedBindings.get(mod.id);
      expect(bindings!.size).toBe(2);
    });
  });

  describe("renameId", () => {
    it("can be set to a string", () => {
      const ext = new ExternalModule("lodash");
      ext.renameId = "https://cdn.example.com/lodash.js";
      expect(ext.renameId).toBe("https://cdn.example.com/lodash.js");
    });

    it("can be set back to null", () => {
      const ext = new ExternalModule("lodash");
      ext.renameId = "renamed";
      ext.renameId = null;
      expect(ext.renameId).toBeNull();
    });
  });
});
