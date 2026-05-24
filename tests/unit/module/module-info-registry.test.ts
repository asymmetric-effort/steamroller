/**
 * @module tests/unit/module/module-info-registry
 * @description Unit tests for ModuleInfoRegistry.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ModuleInfoRegistry } from "../../../src/module/module-info-registry.js";
import { Module } from "../../../src/module/Module.js";

describe("ModuleInfoRegistry", () => {
  let registry: ModuleInfoRegistry;

  beforeEach(() => {
    registry = new ModuleInfoRegistry();
  });

  describe("addModule", () => {
    it("should add a module to the registry", () => {
      const mod = new Module("./src/index.ts", "const x = 1;", true);
      registry.addModule(mod);
      expect(registry.size).toBe(1);
      expect(registry.hasModule("./src/index.ts")).toBe(true);
    });

    it("should overwrite existing module with same id", () => {
      const mod1 = new Module("./a.ts", "const x = 1;", true);
      const mod2 = new Module("./a.ts", "const y = 2;", false);
      registry.addModule(mod1);
      registry.addModule(mod2);
      expect(registry.size).toBe(1);
      const info = registry.getModuleInfo("./a.ts");
      expect(info).not.toBeNull();
      expect(info!.code).toBe("const y = 2;");
    });
  });

  describe("removeModule", () => {
    it("should remove an existing module", () => {
      const mod = new Module("./a.ts", "const x = 1;", true);
      registry.addModule(mod);
      const result = registry.removeModule("./a.ts");
      expect(result).toBe(true);
      expect(registry.size).toBe(0);
    });

    it("should return false when removing non-existent module", () => {
      const result = registry.removeModule("./nonexistent.ts");
      expect(result).toBe(false);
    });
  });

  describe("hasModule", () => {
    it("should return true for registered modules", () => {
      const mod = new Module("./a.ts", "const x = 1;", true);
      registry.addModule(mod);
      expect(registry.hasModule("./a.ts")).toBe(true);
    });

    it("should return false for unregistered modules", () => {
      expect(registry.hasModule("./missing.ts")).toBe(false);
    });
  });

  describe("getModule", () => {
    it("should return the Module instance", () => {
      const mod = new Module("./a.ts", "const x = 1;", true);
      registry.addModule(mod);
      const result = registry.getModule("./a.ts");
      expect(result).toBe(mod);
    });

    it("should return undefined for missing modules", () => {
      expect(registry.getModule("./missing.ts")).toBeUndefined();
    });
  });

  describe("getModuleInfo", () => {
    it("should return null for non-existent module", () => {
      expect(registry.getModuleInfo("./missing.ts")).toBeNull();
    });

    it("should return ModuleInfo with correct shape", () => {
      const mod = new Module(
        "./entry.ts",
        'import { foo } from "./foo";',
        true,
      );
      registry.addModule(mod);

      const info = registry.getModuleInfo("./entry.ts");
      expect(info).not.toBeNull();
      expect(info!.id).toBe("./entry.ts");
      expect(info!.code).toBe('import { foo } from "./foo";');
      expect(info!.isEntry).toBe(true);
      expect(info!.isExternal).toBe(false);
      expect(info!.isIncluded).toBe(false);
      expect(info!.importedIds).toBeInstanceOf(Array);
      expect(info!.importedIdResolutions).toBeInstanceOf(Array);
      expect(info!.dynamicallyImportedIds).toBeInstanceOf(Array);
      expect(info!.dynamicallyImportedIdResolutions).toBeInstanceOf(Array);
      expect(info!.importers).toBeInstanceOf(Array);
      expect(info!.dynamicImporters).toBeInstanceOf(Array);
      expect(info!.meta).toBeDefined();
      expect(typeof info!.syntheticNamedExports).toBe("boolean");
      expect(typeof info!.moduleSideEffects).toBe("boolean");
    });

    it("should reflect module state changes", () => {
      const mod = new Module("./a.ts", "const x = 1;", false);
      registry.addModule(mod);

      mod.isIncluded = true;
      const info = registry.getModuleInfo("./a.ts");
      expect(info!.isIncluded).toBe(true);
    });
  });

  describe("getModuleIds", () => {
    it("should return an empty iterator when no modules registered", () => {
      const ids = Array.from(registry.getModuleIds());
      expect(ids).toEqual([]);
    });

    it("should return all registered module ids", () => {
      registry.addModule(new Module("./a.ts", "", false));
      registry.addModule(new Module("./b.ts", "", false));
      registry.addModule(new Module("./c.ts", "", true));

      const ids = Array.from(registry.getModuleIds());
      expect(ids).toHaveLength(3);
      expect(ids).toContain("./a.ts");
      expect(ids).toContain("./b.ts");
      expect(ids).toContain("./c.ts");
    });

    it("should return an IterableIterator", () => {
      registry.addModule(new Module("./a.ts", "", false));
      const iter = registry.getModuleIds();
      expect(typeof iter[Symbol.iterator]).toBe("function");
      expect(typeof iter.next).toBe("function");
    });
  });

  describe("size", () => {
    it("should return 0 for empty registry", () => {
      expect(registry.size).toBe(0);
    });

    it("should track additions", () => {
      registry.addModule(new Module("./a.ts", "", false));
      expect(registry.size).toBe(1);
      registry.addModule(new Module("./b.ts", "", false));
      expect(registry.size).toBe(2);
    });
  });

  describe("clear", () => {
    it("should remove all modules", () => {
      registry.addModule(new Module("./a.ts", "", false));
      registry.addModule(new Module("./b.ts", "", false));
      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.hasModule("./a.ts")).toBe(false);
    });
  });
});
