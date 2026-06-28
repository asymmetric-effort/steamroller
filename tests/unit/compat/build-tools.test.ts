import { describe, it, expect } from "bun:test";
import {
  verifyBuildToolCompat,
  getSupportedBuildTools,
  getBuildToolHooks,
} from "../../compat/build-tools.js";

describe("build tools compatibility", () => {
  describe("verifyBuildToolCompat", () => {
    it("reports compatible when all required hooks are present for vite", () => {
      const pluginApi = {
        resolveId: (_source: string) => null,
        load: (_id: string) => null,
        transform: (_code: string, _id: string) => null,
        buildStart: () => undefined,
        buildEnd: () => undefined,
        renderChunk: (_code: string) => null,
      };

      const result = verifyBuildToolCompat("vite", pluginApi);
      expect(result.compatible).toBe(true);
      expect(result.toolName).toBe("vite");
      expect(result.hooksVerified.length).toBeGreaterThan(0);
    });

    it("reports incompatible when required hooks are missing for vite", () => {
      const pluginApi = {
        resolveId: () => null,
        // missing load and transform
      };

      const result = verifyBuildToolCompat("vite", pluginApi);
      expect(result.compatible).toBe(false);
      expect(result.issues.some((i) => i.includes("load"))).toBe(true);
      expect(result.issues.some((i) => i.includes("transform"))).toBe(true);
    });

    it("reports compatible for sveltekit with all required hooks", () => {
      const pluginApi = {
        resolveId: () => null,
        load: () => null,
        transform: () => null,
        generateBundle: () => undefined,
        moduleParsed: () => undefined,
      };

      const result = verifyBuildToolCompat("sveltekit", pluginApi);
      expect(result.compatible).toBe(true);
      expect(result.toolName).toBe("sveltekit");
    });

    it("reports incompatible for sveltekit with missing hooks", () => {
      const pluginApi = {
        resolveId: () => null,
        // missing load and transform
      };

      const result = verifyBuildToolCompat("sveltekit", pluginApi);
      expect(result.compatible).toBe(false);
    });

    it("reports incompatible for unknown build tool", () => {
      const result = verifyBuildToolCompat("unknown-tool", {});
      expect(result.compatible).toBe(false);
      expect(result.issues[0]).toContain("Unknown build tool");
    });

    it("reports issue when hook is not a function", () => {
      const pluginApi = {
        resolveId: "not a function",
        load: () => null,
        transform: () => null,
      };

      const result = verifyBuildToolCompat("vite", pluginApi);
      expect(result.compatible).toBe(false);
      expect(result.issues.some((i) => i.includes("must be a function"))).toBe(
        true,
      );
    });

    it("ignores optional hooks when missing", () => {
      const pluginApi = {
        resolveId: () => null,
        load: () => null,
        transform: () => null,
        // optional hooks omitted
      };

      const result = verifyBuildToolCompat("vite", pluginApi);
      expect(result.compatible).toBe(true);
    });
  });

  describe("getSupportedBuildTools", () => {
    it("returns list of supported build tools", () => {
      const tools = getSupportedBuildTools();
      expect(tools).toContain("vite");
      expect(tools).toContain("sveltekit");
      expect(tools.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getBuildToolHooks", () => {
    it("returns hooks for vite", () => {
      const hooks = getBuildToolHooks("vite");
      expect(hooks).not.toBeNull();
      expect(hooks!.length).toBeGreaterThan(0);
      expect(hooks!.some((h) => h.name === "resolveId")).toBe(true);
      expect(hooks!.some((h) => h.name === "load")).toBe(true);
      expect(hooks!.some((h) => h.name === "transform")).toBe(true);
    });

    it("returns hooks for sveltekit", () => {
      const hooks = getBuildToolHooks("sveltekit");
      expect(hooks).not.toBeNull();
      expect(hooks!.some((h) => h.name === "resolveId")).toBe(true);
      expect(hooks!.some((h) => h.name === "generateBundle")).toBe(true);
    });

    it("returns null for unknown tool", () => {
      const hooks = getBuildToolHooks("nonexistent");
      expect(hooks).toBeNull();
    });

    it("hook descriptors have correct shape", () => {
      const hooks = getBuildToolHooks("vite");
      expect(hooks).not.toBeNull();
      for (let i = 0; i < hooks!.length; i++) {
        const hook = hooks![i];
        expect(typeof hook.name).toBe("string");
        expect(Array.isArray(hook.params)).toBe(true);
        expect(typeof hook.returnType).toBe("string");
        expect(typeof hook.required).toBe("boolean");
      }
    });
  });
});
