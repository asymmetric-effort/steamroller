import { describe, it, expect } from "vitest";
import {
  verifyPluginHookSignatures,
  getKnownHooks,
  validatePluginStructure,
} from "../../compat/plugin-compat.js";

describe("plugin compatibility", () => {
  describe("verifyPluginHookSignatures", () => {
    it("reports compatible for a valid plugin with function hooks", () => {
      const plugin = {
        name: "test-plugin",
        resolveId: (_source: string, _importer: string | undefined) => null,
        load: (_id: string) => null,
        transform: (_code: string, _id: string) => null,
      };

      const result = verifyPluginHookSignatures(plugin);
      expect(result.compatible).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.hooksCovered).toContain("resolveId");
      expect(result.hooksCovered).toContain("load");
      expect(result.hooksCovered).toContain("transform");
    });

    it("reports compatible for object-style hooks with handler", () => {
      const plugin = {
        name: "ordered-plugin",
        resolveId: {
          order: "pre" as const,
          handler: (_source: string) => null,
        },
        load: {
          order: "post" as const,
          handler: (_id: string) => null,
        },
      };

      const result = verifyPluginHookSignatures(plugin);
      expect(result.compatible).toBe(true);
      expect(result.hooksCovered).toContain("resolveId");
      expect(result.hooksCovered).toContain("load");
    });

    it("reports incompatible when name is missing", () => {
      const plugin = {
        name: "",
        resolveId: () => null,
      };

      const result = verifyPluginHookSignatures(plugin);
      expect(result.compatible).toBe(false);
      expect(result.issues.some((i) => i.includes("name"))).toBe(true);
    });

    it("reports incompatible for non-function hook values", () => {
      const plugin = {
        name: "bad-plugin",
        resolveId: "not a function",
      };

      const result = verifyPluginHookSignatures(plugin);
      expect(result.compatible).toBe(false);
      expect(result.hooksUnsupported).toContain("resolveId");
    });

    it("reports incompatible for invalid order value", () => {
      const plugin = {
        name: "bad-order-plugin",
        resolveId: {
          order: "invalid",
          handler: () => null,
        },
      };

      const result = verifyPluginHookSignatures(plugin);
      expect(result.compatible).toBe(false);
      expect(result.issues.some((i) => i.includes("invalid order"))).toBe(true);
    });

    it("reports issue when hook has too many parameters", () => {
      const plugin = {
        name: "excess-params",
        load: (_a: string, _b: string, _c: string) => null,
      };

      const result = verifyPluginHookSignatures(plugin);
      expect(result.compatible).toBe(false);
      expect(result.issues.some((i) => i.includes("params"))).toBe(true);
    });

    it("handles plugin with no hooks", () => {
      const plugin = { name: "empty-plugin" };
      const result = verifyPluginHookSignatures(plugin);
      expect(result.compatible).toBe(true);
      expect(result.hooksCovered).toHaveLength(0);
    });

    it("handles all hook types correctly", () => {
      const plugin = {
        name: "full-plugin",
        buildStart: () => undefined,
        buildEnd: () => undefined,
        resolveId: (_s: string, _i: string | undefined, _o: unknown) => null,
        load: (_id: string) => null,
        transform: (_c: string, _id: string) => null,
        moduleParsed: (_info: unknown) => undefined,
        renderChunk: (_c: string, _ch: unknown, _o: unknown, _m: unknown) =>
          null,
        generateBundle: (_o: unknown, _b: unknown, _w: boolean) => undefined,
        writeBundle: (_o: unknown, _b: unknown) => undefined,
        closeBundle: () => undefined,
      };

      const result = verifyPluginHookSignatures(plugin);
      expect(result.compatible).toBe(true);
      expect(result.hooksCovered.length).toBeGreaterThanOrEqual(10);
    });

    it("accepts null order in object hooks", () => {
      const plugin = {
        name: "null-order",
        resolveId: {
          order: null,
          handler: () => null,
        },
      };

      const result = verifyPluginHookSignatures(plugin);
      expect(result.compatible).toBe(true);
    });
  });

  describe("getKnownHooks", () => {
    it("returns a non-empty array of hook names", () => {
      const hooks = getKnownHooks();
      expect(hooks.length).toBeGreaterThan(10);
      expect(hooks).toContain("resolveId");
      expect(hooks).toContain("load");
      expect(hooks).toContain("transform");
      expect(hooks).toContain("buildStart");
      expect(hooks).toContain("buildEnd");
    });
  });

  describe("validatePluginStructure", () => {
    it("reports valid for a plugin with only known hooks", () => {
      const plugin = {
        name: "valid-plugin",
        resolveId: () => null,
        load: () => null,
      };

      const result = validatePluginStructure(plugin);
      expect(result.valid).toBe(true);
      expect(result.unknownHooks).toHaveLength(0);
    });

    it("reports unknown hooks", () => {
      const plugin = {
        name: "custom-plugin",
        resolveId: () => null,
        customHook: () => null,
        anotherCustom: 42,
      };

      const result = validatePluginStructure(plugin);
      expect(result.valid).toBe(false);
      expect(result.unknownHooks).toContain("customHook");
      expect(result.unknownHooks).toContain("anotherCustom");
    });

    it("name property does not appear in unknownHooks", () => {
      const plugin = { name: "just-name" };
      const result = validatePluginStructure(plugin);
      expect(result.valid).toBe(true);
      expect(result.unknownHooks).not.toContain("name");
    });
  });
});
