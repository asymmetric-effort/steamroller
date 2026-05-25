/**
 * @module tests/unit/plugins/build-hooks
 * @description Unit tests for the build phase hook executor.
 */

import { describe, it, expect, vi } from "vitest";
import type {
  Plugin,
  InputOptions,
  NormalizedInputOptions,
  ModuleInfo,
} from "../../../src/types.js";
import { PluginDriver } from "../../../src/plugins/driver.js";
import {
  BuildHookExecutor,
  BUILD_HOOKS,
} from "../../../src/plugins/build-hooks.js";

// Helper: create a minimal plugin with specified hooks
const makePlugin = (
  name: string,
  hooks: Record<string, unknown> = {},
): Plugin => {
  return { name, ...hooks } as unknown as Plugin;
};

// Suppress warnings during tests
const noopWarning = (): void => undefined;

// Minimal NormalizedInputOptions for testing
const makeNormalizedOptions = (): NormalizedInputOptions => {
  return {
    cache: false,
    context: "undefined",
    experimentalCacheExpiry: 10,
    experimentalLogSideEffects: false,
    external: () => false,
    input: ["./src/index.ts"],
    logLevel: "warn",
    makeAbsoluteExternalsRelative: true,
    maxParallelFileOps: 20,
    moduleContext: () => "undefined",
    onLog: () => undefined,
    perf: false,
    plugins: [],
    preserveEntrySignatures: "exports-only",
    preserveSymlinks: false,
    shimMissingExports: false,
    strictDeprecations: false,
    treeshake: false,
  } as NormalizedInputOptions;
};

// Minimal ModuleInfo for testing
const makeModuleInfo = (id: string): ModuleInfo => {
  return {
    id,
    code: "const x = 1;",
    ast: null,
    isEntry: true,
    isExternal: false,
    isIncluded: true,
    importedIds: [],
    importedIdResolutions: [],
    dynamicallyImportedIds: [],
    dynamicallyImportedIdResolutions: [],
    importers: [],
    dynamicImporters: [],
    exportedBindings: null,
    exports: null,
    hasDefaultExport: false,
    meta: {},
    syntheticNamedExports: false,
    moduleSideEffects: true,
  } as ModuleInfo;
};

describe("BUILD_HOOKS constant", () => {
  it("defines all 9 build hooks", () => {
    const hookNames = Object.keys(BUILD_HOOKS);
    expect(hookNames).toHaveLength(9);
    expect(hookNames).toContain("options");
    expect(hookNames).toContain("buildStart");
    expect(hookNames).toContain("resolveId");
    expect(hookNames).toContain("resolveDynamicImport");
    expect(hookNames).toContain("load");
    expect(hookNames).toContain("shouldTransformCachedModule");
    expect(hookNames).toContain("transform");
    expect(hookNames).toContain("moduleParsed");
    expect(hookNames).toContain("buildEnd");
  });

  it("options uses sequential strategy", () => {
    expect(BUILD_HOOKS["options"].strategy).toBe("sequential");
    expect(BUILD_HOOKS["options"].async).toBe(true);
  });

  it("buildStart uses parallel strategy", () => {
    expect(BUILD_HOOKS["buildStart"].strategy).toBe("parallel");
    expect(BUILD_HOOKS["buildStart"].async).toBe(true);
  });

  it("resolveId uses first strategy", () => {
    expect(BUILD_HOOKS["resolveId"].strategy).toBe("first");
    expect(BUILD_HOOKS["resolveId"].async).toBe(true);
  });

  it("resolveDynamicImport uses first strategy", () => {
    expect(BUILD_HOOKS["resolveDynamicImport"].strategy).toBe("first");
  });

  it("load uses first strategy", () => {
    expect(BUILD_HOOKS["load"].strategy).toBe("first");
  });

  it("shouldTransformCachedModule uses first strategy", () => {
    expect(BUILD_HOOKS["shouldTransformCachedModule"].strategy).toBe("first");
  });

  it("transform uses sequential strategy", () => {
    expect(BUILD_HOOKS["transform"].strategy).toBe("sequential");
  });

  it("moduleParsed uses parallel strategy", () => {
    expect(BUILD_HOOKS["moduleParsed"].strategy).toBe("parallel");
  });

  it("buildEnd uses parallel strategy", () => {
    expect(BUILD_HOOKS["buildEnd"].strategy).toBe("parallel");
  });
});

describe("BuildHookExecutor", () => {
  describe("constructor", () => {
    it("stores the driver reference", () => {
      const driver = new PluginDriver([], noopWarning);
      const executor = new BuildHookExecutor(driver);
      expect(executor.getDriver()).toBe(driver);
    });
  });

  describe("options hook", () => {
    it("modifies options sequentially across plugins", async () => {
      const plugin1 = makePlugin("p1", {
        options: () => ({ input: ["./modified.ts"] }),
      });
      const plugin2 = makePlugin("p2", {
        options: () => ({ context: "window" }),
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const input: InputOptions = { input: ["./src/index.ts"] };
      const result = await executor.options(input);

      expect(result.input).toEqual(["./modified.ts"]);
      expect(result.context).toBe("window");
    });

    it("returns original options when plugins return null", async () => {
      const plugin1 = makePlugin("p1", {
        options: () => null,
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const input: InputOptions = { input: ["./src/index.ts"] };
      const result = await executor.options(input);

      expect(result.input).toEqual(["./src/index.ts"]);
    });

    it("handles no plugins gracefully", async () => {
      const driver = new PluginDriver([], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const input: InputOptions = { input: ["./src/index.ts"] };
      const result = await executor.options(input);

      expect(result).toEqual(input);
    });
  });

  describe("buildStart hook", () => {
    it("fires all plugins in parallel", async () => {
      const calls: Array<string> = [];
      const plugin1 = makePlugin("p1", {
        buildStart: () => {
          calls.push("p1");
        },
      });
      const plugin2 = makePlugin("p2", {
        buildStart: () => {
          calls.push("p2");
        },
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      await executor.buildStart(makeNormalizedOptions());

      expect(calls).toContain("p1");
      expect(calls).toContain("p2");
      expect(calls).toHaveLength(2);
    });

    it("handles async hooks", async () => {
      const fn = vi.fn().mockResolvedValue(undefined);
      const plugin1 = makePlugin("p1", { buildStart: fn });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      await executor.buildStart(makeNormalizedOptions());

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("resolveId hook", () => {
    it("returns first non-null result", async () => {
      const plugin1 = makePlugin("p1", {
        resolveId: () => null,
      });
      const plugin2 = makePlugin("p2", {
        resolveId: () => "/resolved/path.js",
      });
      const plugin3 = makePlugin("p3", {
        resolveId: () => "/should-not-reach.js",
      });
      const driver = new PluginDriver([plugin1, plugin2, plugin3], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.resolveId("./mod", undefined, {
        isEntry: true,
        attributes: {},
      });

      expect(result).toBe("/resolved/path.js");
    });

    it("skips plugins without the hook", async () => {
      const plugin1 = makePlugin("p1", {});
      const plugin2 = makePlugin("p2", {
        resolveId: () => "/found.js",
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.resolveId("./mod", "importer.js", {
        isEntry: false,
        attributes: {},
      });

      expect(result).toBe("/found.js");
    });

    it("returns null when no plugin resolves", async () => {
      const plugin1 = makePlugin("p1", {
        resolveId: () => null,
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.resolveId("./mod", undefined, {
        isEntry: true,
        attributes: {},
      });

      expect(result).toBeNull();
    });

    it("returns ResolvedId objects", async () => {
      const resolved = {
        id: "/abs/path.js",
        external: false,
        moduleSideEffects: true,
        syntheticNamedExports: false,
        meta: {},
        resolvedBy: "test-plugin",
      };
      const plugin1 = makePlugin("p1", {
        resolveId: () => resolved,
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.resolveId("./mod", undefined, {
        isEntry: true,
        attributes: {},
      });

      expect(result).toEqual(resolved);
    });
  });

  describe("resolveDynamicImport hook", () => {
    it("returns first non-null result like resolveId", async () => {
      const plugin1 = makePlugin("p1", {
        resolveDynamicImport: () => null,
      });
      const plugin2 = makePlugin("p2", {
        resolveDynamicImport: () => "/dynamic.js",
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.resolveDynamicImport(
        "./dynamic",
        "importer.js",
        { attributes: {} },
      );

      expect(result).toBe("/dynamic.js");
    });

    it("handles AST node specifiers", async () => {
      const astNode = { type: "TemplateLiteral", start: 0, end: 10 };
      const fn = vi.fn().mockReturnValue("/resolved.js");
      const plugin1 = makePlugin("p1", { resolveDynamicImport: fn });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.resolveDynamicImport(
        astNode,
        "importer.js",
        { attributes: {} },
      );

      expect(result).toBe("/resolved.js");
      expect(fn).toHaveBeenCalledWith(astNode, "importer.js", {
        attributes: {},
      });
    });
  });

  describe("load hook", () => {
    it("returns first non-null load result", async () => {
      const plugin1 = makePlugin("p1", { load: () => null });
      const plugin2 = makePlugin("p2", {
        load: () => "export const x = 1;",
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.load("/path/to/mod.js");

      expect(result).toBe("export const x = 1;");
    });

    it("returns object-form load result", async () => {
      const loadResult = {
        code: "export const x = 1;",
        map: null,
        meta: { custom: true },
      };
      const plugin1 = makePlugin("p1", { load: () => loadResult });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.load("/path/to/mod.js");

      expect(result).toEqual(loadResult);
    });

    it("returns null when no plugin loads", async () => {
      const plugin1 = makePlugin("p1", { load: () => null });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.load("/path/to/mod.js");

      expect(result).toBeNull();
    });
  });

  describe("shouldTransformCachedModule hook", () => {
    it("returns first boolean result", async () => {
      const plugin1 = makePlugin("p1", {
        shouldTransformCachedModule: () => null,
      });
      const plugin2 = makePlugin("p2", {
        shouldTransformCachedModule: () => true,
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.shouldTransformCachedModule({
        id: "/mod.js",
        code: "const x = 1;",
        ast: null,
        meta: {},
      });

      expect(result).toBe(true);
    });

    it("returns false when plugin says no transform needed", async () => {
      const plugin1 = makePlugin("p1", {
        shouldTransformCachedModule: () => false,
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.shouldTransformCachedModule({
        id: "/mod.js",
        code: "const x = 1;",
        ast: null,
        meta: {},
      });

      expect(result).toBe(false);
    });

    it("returns null when no plugin decides", async () => {
      const plugin1 = makePlugin("p1", {
        shouldTransformCachedModule: () => null,
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.shouldTransformCachedModule({
        id: "/mod.js",
        code: "const x = 1;",
        ast: null,
        meta: {},
      });

      expect(result).toBeNull();
    });
  });

  describe("transform hook", () => {
    it("chains code sequentially through plugins", async () => {
      const plugin1 = makePlugin("p1", {
        transform: (code: string) => ({
          code: code + "\n// plugin1",
        }),
      });
      const plugin2 = makePlugin("p2", {
        transform: (code: string) => ({
          code: code + "\n// plugin2",
        }),
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.transform("const x = 1;", "/mod.js");

      expect(result.code).toContain("// plugin1");
      expect(result.code).toContain("// plugin2");
    });

    it("preserves source map from last plugin that provides one", async () => {
      const sourceMap = { version: 3, mappings: "AAAA" };
      const plugin1 = makePlugin("p1", {
        transform: () => ({ code: "modified", map: sourceMap }),
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.transform("original", "/mod.js");

      expect(result.code).toBe("modified");
      expect(result.map).toEqual(sourceMap);
    });

    it("handles string return from transform", async () => {
      const plugin1 = makePlugin("p1", {
        transform: () => "transformed code",
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.transform("original", "/mod.js");

      expect(result.code).toBe("transformed code");
    });

    it("skips null/undefined results", async () => {
      const plugin1 = makePlugin("p1", { transform: () => null });
      const plugin2 = makePlugin("p2", {
        transform: () => ({ code: "from-p2" }),
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.transform("original", "/mod.js");

      expect(result.code).toBe("from-p2");
    });

    it("returns original code when all plugins return null", async () => {
      const plugin1 = makePlugin("p1", { transform: () => null });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.transform("original", "/mod.js");

      expect(result.code).toBe("original");
    });
  });

  describe("moduleParsed hook", () => {
    it("fires all plugins in parallel", async () => {
      const calls: Array<string> = [];
      const plugin1 = makePlugin("p1", {
        moduleParsed: () => {
          calls.push("p1");
        },
      });
      const plugin2 = makePlugin("p2", {
        moduleParsed: () => {
          calls.push("p2");
        },
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      await executor.moduleParsed(makeModuleInfo("/mod.js"));

      expect(calls).toContain("p1");
      expect(calls).toContain("p2");
      expect(calls).toHaveLength(2);
    });

    it("passes module info to hooks", async () => {
      const fn = vi.fn();
      const plugin1 = makePlugin("p1", { moduleParsed: fn });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);
      const info = makeModuleInfo("/test.js");

      await executor.moduleParsed(info);

      expect(fn).toHaveBeenCalledWith(info);
    });
  });

  describe("buildEnd hook", () => {
    it("fires all plugins in parallel", async () => {
      const calls: Array<string> = [];
      const plugin1 = makePlugin("p1", {
        buildEnd: () => {
          calls.push("p1");
        },
      });
      const plugin2 = makePlugin("p2", {
        buildEnd: () => {
          calls.push("p2");
        },
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      await executor.buildEnd();

      expect(calls).toContain("p1");
      expect(calls).toContain("p2");
    });

    it("receives error when build failed", async () => {
      const fn = vi.fn();
      const plugin1 = makePlugin("p1", { buildEnd: fn });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);
      const error = new Error("Build failed");

      await executor.buildEnd(error);

      expect(fn).toHaveBeenCalledWith(error);
    });

    it("receives undefined when build succeeded", async () => {
      const fn = vi.fn();
      const plugin1 = makePlugin("p1", { buildEnd: fn });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      await executor.buildEnd();

      expect(fn).toHaveBeenCalledWith(undefined);
    });
  });

  describe("plugin ordering", () => {
    it("respects pre/normal/post ordering", async () => {
      const calls: Array<string> = [];
      const plugin1 = makePlugin("normal", {
        resolveId: () => {
          calls.push("normal");
          return null;
        },
      });
      const plugin2 = makePlugin("post", {
        resolveId: {
          handler: () => {
            calls.push("post");
            return null;
          },
          order: "post" as const,
        },
      });
      const plugin3 = makePlugin("pre", {
        resolveId: {
          handler: () => {
            calls.push("pre");
            return null;
          },
          order: "pre" as const,
        },
      });
      const driver = new PluginDriver([plugin1, plugin2, plugin3], noopWarning);
      const executor = new BuildHookExecutor(driver);

      await executor.resolveId("./mod", undefined, {
        isEntry: true,
        attributes: {},
      });

      expect(calls).toEqual(["pre", "normal", "post"]);
    });

    it("pre plugin can short-circuit first-strategy hooks", async () => {
      const normalFn = vi.fn().mockReturnValue("/normal.js");
      const plugin1 = makePlugin("normal", { resolveId: normalFn });
      const plugin2 = makePlugin("pre", {
        resolveId: {
          handler: () => "/pre-resolved.js",
          order: "pre" as const,
        },
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.resolveId("./mod", undefined, {
        isEntry: true,
        attributes: {},
      });

      expect(result).toBe("/pre-resolved.js");
      expect(normalFn).not.toHaveBeenCalled();
    });
  });

  describe("transform edge cases", () => {
    it("skips plugins without transform hook", async () => {
      const plugin1 = makePlugin("p1", {});
      const plugin2 = makePlugin("p2", {
        transform: () => ({ code: "from-p2" }),
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.transform("original", "/mod.js");

      expect(result.code).toBe("from-p2");
    });

    it("skips plugins with non-function transform hook value", async () => {
      const plugin1 = makePlugin("p1", {
        transform: { handler: "not-a-function" },
      });
      const plugin2 = makePlugin("p2", {
        transform: () => ({ code: "from-p2" }),
      });
      const driver = new PluginDriver([plugin1, plugin2], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.transform("original", "/mod.js");

      expect(result.code).toBe("from-p2");
    });

    it("preserves accumulated code when plugin returns object without code", async () => {
      const sourceMap = { version: 3, mappings: "BBB" };
      const plugin1 = makePlugin("p1", {
        transform: () => ({ map: sourceMap }),
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.transform("original code", "/mod.js");

      expect(result.code).toBe("original code");
      expect(result.map).toEqual(sourceMap);
    });

    it("respects pre/post ordering for transform", async () => {
      const calls: Array<string> = [];
      const plugin1 = makePlugin("normal", {
        transform: (code: string) => {
          calls.push("normal");
          return { code: code + "+normal" };
        },
      });
      const plugin2 = makePlugin("post", {
        transform: {
          handler: (code: string) => {
            calls.push("post");
            return { code: code + "+post" };
          },
          order: "post" as const,
        },
      });
      const plugin3 = makePlugin("pre", {
        transform: {
          handler: (code: string) => {
            calls.push("pre");
            return { code: code + "+pre" };
          },
          order: "pre" as const,
        },
      });
      const driver = new PluginDriver([plugin1, plugin2, plugin3], noopWarning);
      const executor = new BuildHookExecutor(driver);

      const result = await executor.transform("start", "/mod.js");

      expect(calls).toEqual(["pre", "normal", "post"]);
      expect(result.code).toBe("start+pre+normal+post");
    });
  });

  describe("error propagation", () => {
    it("propagates errors from parallel hooks", async () => {
      const plugin1 = makePlugin("p1", {
        buildStart: () => {
          throw new Error("plugin error");
        },
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      await expect(
        executor.buildStart(makeNormalizedOptions()),
      ).rejects.toThrow("plugin error");
    });

    it("propagates errors from first-strategy hooks", async () => {
      const plugin1 = makePlugin("p1", {
        resolveId: () => {
          throw new Error("resolve error");
        },
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      await expect(
        executor.resolveId("./mod", undefined, {
          isEntry: true,
          attributes: {},
        }),
      ).rejects.toThrow("resolve error");
    });

    it("propagates errors from sequential hooks", async () => {
      const plugin1 = makePlugin("p1", {
        transform: () => {
          throw new Error("transform error");
        },
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      await expect(executor.transform("code", "/mod.js")).rejects.toThrow(
        "transform error",
      );
    });

    it("propagates async rejection from hooks", async () => {
      const plugin1 = makePlugin("p1", {
        buildEnd: () => Promise.reject(new Error("async error")),
      });
      const driver = new PluginDriver([plugin1], noopWarning);
      const executor = new BuildHookExecutor(driver);

      await expect(executor.buildEnd()).rejects.toThrow("async error");
    });
  });
});
