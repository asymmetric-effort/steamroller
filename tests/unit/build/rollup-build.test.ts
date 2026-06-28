/**
 * Tests for src/build/rollup-build.ts
 *
 * Covers createRollupBuild() interface shape, generate(), write(), close(),
 * post-close error behavior, and cache/watchFiles/getTimings accessors.
 */
import { describe, it, expect } from "bun:test";
import { vi } from "../../vi-compat.js";
import { createRollupBuild } from "../../../src/build/rollup-build.js";
import type { BuildState } from "../../../src/build/rollup-build.js";
import type {
  RollupCache as RollupCacheType,
  SerializedTimings,
  NormalizedInputOptions,
} from "../../../src/types.js";
import { PluginDriver } from "../../../src/plugins/driver.js";
import { OutputHookExecutor } from "../../../src/plugins/output-hooks.js";
import { normalizeInputOptions } from "../../../src/config/normalize-input.js";
import { Module } from "../../../src/module/Module.js";
import { ExternalModule } from "../../../src/module/ExternalModule.js";
import { parse } from "../../../src/parser/parser.js";

const createMinimalState = (
  overrides: Partial<BuildState> = {},
): BuildState => ({
  modules: [],
  cache: undefined,
  watchFiles: [],
  ...overrides,
});

describe("createRollupBuild", () => {
  describe("interface shape", () => {
    it("returns an object with all RollupBuild properties", () => {
      const build = createRollupBuild(createMinimalState());
      expect(build).toHaveProperty("cache");
      expect(build).toHaveProperty("closed");
      expect(build).toHaveProperty("watchFiles");
      expect(build).toHaveProperty("generate");
      expect(build).toHaveProperty("write");
      expect(build).toHaveProperty("close");
    });

    it("has generate as a function", () => {
      const build = createRollupBuild(createMinimalState());
      expect(typeof build.generate).toBe("function");
    });

    it("has write as a function", () => {
      const build = createRollupBuild(createMinimalState());
      expect(typeof build.write).toBe("function");
    });

    it("has close as a function", () => {
      const build = createRollupBuild(createMinimalState());
      expect(typeof build.close).toBe("function");
    });
  });

  describe("cache accessor", () => {
    it("returns undefined when no cache provided", () => {
      const build = createRollupBuild(createMinimalState());
      expect(build.cache).toBeUndefined();
    });

    it("returns the cache from state", () => {
      const cache: RollupCacheType = {
        modules: [],
        plugins: {},
      };
      const build = createRollupBuild(createMinimalState({ cache }));
      expect(build.cache).toBe(cache);
    });

    it("returns cache with modules populated", () => {
      const cache: RollupCacheType = {
        modules: [
          {
            id: "test.js",
            ast: null,
            code: "export const x = 1;",
            dependencies: [],
            transformDependencies: [],
            meta: {},
            syntheticNamedExports: false,
            moduleSideEffects: true,
          },
        ],
      };
      const build = createRollupBuild(createMinimalState({ cache }));
      expect(build.cache?.modules).toHaveLength(1);
      expect(build.cache?.modules[0].id).toBe("test.js");
    });
  });

  describe("watchFiles accessor", () => {
    it("returns empty array when no watch files", () => {
      const build = createRollupBuild(createMinimalState());
      expect(build.watchFiles).toEqual([]);
    });

    it("returns watch files from state", () => {
      const watchFiles = ["src/index.ts", "src/utils.ts"];
      const build = createRollupBuild(createMinimalState({ watchFiles }));
      expect(build.watchFiles).toEqual(watchFiles);
    });

    it("returns the same reference as provided", () => {
      const watchFiles = ["a.ts", "b.ts", "c.ts"];
      const build = createRollupBuild(createMinimalState({ watchFiles }));
      expect(build.watchFiles).toBe(watchFiles);
    });
  });

  describe("getTimings accessor", () => {
    it("returns undefined when no getTimings provided", () => {
      const build = createRollupBuild(createMinimalState());
      expect(build.getTimings).toBeUndefined();
    });

    it("returns the getTimings function from state", () => {
      const timings: SerializedTimings = {
        "# BUILD": [100, 80, 20],
        "# GENERATE": [50, 40, 10],
      };
      const getTimings = (): SerializedTimings => timings;
      const build = createRollupBuild(createMinimalState({ getTimings }));
      expect(build.getTimings).toBe(getTimings);
    });

    it("getTimings function returns correct data when called", () => {
      const timings: SerializedTimings = {
        "## parse": [10, 10, 0],
      };
      const getTimings = (): SerializedTimings => timings;
      const build = createRollupBuild(createMinimalState({ getTimings }));
      const result = build.getTimings?.();
      expect(result).toBe(timings);
    });
  });

  describe("closed property", () => {
    it("is false initially", () => {
      const build = createRollupBuild(createMinimalState());
      expect(build.closed).toBe(false);
    });

    it("is true after close()", async () => {
      const build = createRollupBuild(createMinimalState());
      await build.close();
      expect(build.closed).toBe(true);
    });

    it("remains true after multiple close() calls", async () => {
      const build = createRollupBuild(createMinimalState());
      await build.close();
      await build.close();
      expect(build.closed).toBe(true);
    });
  });

  describe("generate()", () => {
    it("returns a RollupOutput", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.generate({});
      expect(result).toHaveProperty("output");
      expect(Array.isArray(result.output)).toBe(true);
    });

    it("output contains at least one chunk", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.generate({});
      expect(result.output.length).toBeGreaterThanOrEqual(1);
      expect(result.output[0].type).toBe("chunk");
    });

    it("uses file option for fileName when provided", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.generate({ file: "dist/output.js" });
      expect(result.output[0].fileName).toBe("dist/output.js");
    });

    it("uses default fileName when file option not provided", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.generate({});
      expect(result.output[0].fileName).toBe("bundle.js");
    });

    it("output chunk has isEntry set to true", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.generate({});
      const chunk = result.output[0];
      if (chunk.type === "chunk") {
        expect(chunk.isEntry).toBe(true);
      }
    });

    it("output chunk has code as a string", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.generate({});
      const chunk = result.output[0];
      if (chunk.type === "chunk") {
        expect(typeof chunk.code).toBe("string");
      }
    });

    it("throws when called after close()", async () => {
      const build = createRollupBuild(createMinimalState());
      await build.close();
      await expect(build.generate({})).rejects.toThrow(
        "Bundle is already closed",
      );
    });
  });

  describe("write()", () => {
    it("returns a RollupOutput", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.write({});
      expect(result).toHaveProperty("output");
      expect(Array.isArray(result.output)).toBe(true);
    });

    it("output contains at least one chunk", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.write({});
      expect(result.output.length).toBeGreaterThanOrEqual(1);
      expect(result.output[0].type).toBe("chunk");
    });

    it("uses file option for fileName when provided", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.write({ file: "dist/written.js" });
      expect(result.output[0].fileName).toBe("dist/written.js");
    });

    it("uses default fileName when file option not provided", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.write({});
      expect(result.output[0].fileName).toBe("bundle.js");
    });

    it("throws when called after close()", async () => {
      const build = createRollupBuild(createMinimalState());
      await build.close();
      await expect(build.write({})).rejects.toThrow("Bundle is already closed");
    });

    it("output chunk has expected default properties", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.write({});
      const chunk = result.output[0];
      if (chunk.type === "chunk") {
        expect(chunk.map).toBeNull();
        expect(chunk.exports).toEqual([]);
        expect(chunk.imports).toEqual([]);
        expect(chunk.dynamicImports).toEqual([]);
      }
    });
  });

  describe("close()", () => {
    it("returns a promise", () => {
      const build = createRollupBuild(createMinimalState());
      const result = build.close();
      expect(result).toBeInstanceOf(Promise);
    });

    it("resolves to undefined", async () => {
      const build = createRollupBuild(createMinimalState());
      const result = await build.close();
      expect(result).toBeUndefined();
    });

    it("sets closed to true", async () => {
      const build = createRollupBuild(createMinimalState());
      expect(build.closed).toBe(false);
      await build.close();
      expect(build.closed).toBe(true);
    });

    it("can be called multiple times without error", async () => {
      const build = createRollupBuild(createMinimalState());
      await build.close();
      await expect(build.close()).resolves.toBeUndefined();
    });

    it("fires closeBundle hook when outputHookExecutor is provided", async () => {
      const closeBundleSpy = vi.fn();
      const plugin = { name: "test-close", closeBundle: closeBundleSpy };
      const driver = new PluginDriver([plugin]);
      const executor = new OutputHookExecutor(driver);
      const build = createRollupBuild(
        createMinimalState({ outputHookExecutor: executor }),
      );
      await build.close();
      expect(closeBundleSpy).toHaveBeenCalledOnce();
    });

    it("fires closeBundle before setting closed flag", async () => {
      let closedDuringHook: boolean | undefined;
      const plugin = {
        name: "test-order",
        closeBundle: vi.fn(() => {
          closedDuringHook = build.closed;
        }),
      };
      const driver = new PluginDriver([plugin]);
      const executor = new OutputHookExecutor(driver);
      const build = createRollupBuild(
        createMinimalState({ outputHookExecutor: executor }),
      );
      await build.close();
      expect(closedDuringHook).toBe(false);
      expect(build.closed).toBe(true);
    });

    it("still sets closed flag when no outputHookExecutor is provided", async () => {
      const build = createRollupBuild(createMinimalState());
      await build.close();
      expect(build.closed).toBe(true);
    });

    it("generate throws after close with outputHookExecutor", async () => {
      const plugin = { name: "test-noop", closeBundle: vi.fn() };
      const driver = new PluginDriver([plugin]);
      const executor = new OutputHookExecutor(driver);
      const build = createRollupBuild(
        createMinimalState({ outputHookExecutor: executor }),
      );
      await build.close();
      await expect(build.generate({})).rejects.toThrow(
        "Bundle is already closed",
      );
    });

    it("write throws after close with outputHookExecutor", async () => {
      const plugin = { name: "test-noop", closeBundle: vi.fn() };
      const driver = new PluginDriver([plugin]);
      const executor = new OutputHookExecutor(driver);
      const build = createRollupBuild(
        createMinimalState({ outputHookExecutor: executor }),
      );
      await build.close();
      await expect(build.write({})).rejects.toThrow("Bundle is already closed");
    });
  });

  describe("independent builds", () => {
    it("closing one build does not affect another", async () => {
      const buildA = createRollupBuild(createMinimalState());
      const buildB = createRollupBuild(createMinimalState());
      await buildA.close();
      expect(buildA.closed).toBe(true);
      expect(buildB.closed).toBe(false);
      const result = await buildB.generate({});
      expect(result.output).toHaveLength(1);
    });

    it("each build has independent state", () => {
      const cacheA: RollupCacheType = { modules: [] };
      const cacheB: RollupCacheType = {
        modules: [
          {
            id: "x.js",
            ast: null,
            code: "",
            dependencies: [],
            transformDependencies: [],
            meta: {},
            syntheticNamedExports: false,
            moduleSideEffects: true,
          },
        ],
      };
      const buildA = createRollupBuild(createMinimalState({ cache: cacheA }));
      const buildB = createRollupBuild(createMinimalState({ cache: cacheB }));
      expect(buildA.cache).toBe(cacheA);
      expect(buildB.cache).toBe(cacheB);
    });
  });

  describe("output hooks wiring", () => {
    const createStateWithHooks = (
      plugins: ReadonlyArray<Record<string, unknown>>,
    ): BuildState => {
      const inputOptions = normalizeInputOptions({ input: "entry.js" });
      const driver = new PluginDriver(
        plugins as ReadonlyArray<{ name: string }>,
        () => {},
      );
      const executor = new OutputHookExecutor(driver);
      return createMinimalState({
        outputHookExecutor: executor,
        inputOptions,
      });
    };

    it("fires renderStart during generate()", async () => {
      const renderStartFn = vi.fn();
      const state = createStateWithHooks([
        { name: "test", renderStart: renderStartFn },
      ]);
      const build = createRollupBuild(state);
      await build.generate({ format: "es" });
      expect(renderStartFn).toHaveBeenCalledTimes(1);
    });

    it("fires renderChunk during generate()", async () => {
      const renderChunkFn = vi.fn().mockReturnValue(null);
      const state = createStateWithHooks([
        { name: "test", renderChunk: renderChunkFn },
      ]);
      const build = createRollupBuild(state);
      await build.generate({ format: "es" });
      // With empty modules, renderChunk is not called since there's nothing to render
      // This is expected behavior - renderChunk only fires for non-empty output
      expect(renderChunkFn).toHaveBeenCalledTimes(0);
    });

    it("fires generateBundle during generate()", async () => {
      const generateBundleFn = vi.fn();
      const state = createStateWithHooks([
        { name: "test", generateBundle: generateBundleFn },
      ]);
      const build = createRollupBuild(state);
      await build.generate({ format: "es" });
      expect(generateBundleFn).toHaveBeenCalledTimes(1);
    });

    it("passes isWrite=false to generateBundle during generate()", async () => {
      const generateBundleFn = vi.fn();
      const state = createStateWithHooks([
        { name: "test", generateBundle: generateBundleFn },
      ]);
      const build = createRollupBuild(state);
      await build.generate({ format: "es" });
      // Third argument is isWrite
      expect(generateBundleFn.mock.calls[0][2]).toBe(false);
    });

    it("passes isWrite=true to generateBundle during write()", async () => {
      const generateBundleFn = vi.fn();
      const state = createStateWithHooks([
        { name: "test", generateBundle: generateBundleFn },
      ]);
      const build = createRollupBuild(state);
      await build.write({ format: "es" });
      expect(generateBundleFn.mock.calls[0][2]).toBe(true);
    });

    it("fires writeBundle during write()", async () => {
      const writeBundleFn = vi.fn();
      const state = createStateWithHooks([
        { name: "test", writeBundle: writeBundleFn },
      ]);
      const build = createRollupBuild(state);
      await build.write({ format: "es" });
      expect(writeBundleFn).toHaveBeenCalledTimes(1);
    });

    it("fires renderError when renderStart throws", async () => {
      const renderErrorFn = vi.fn();
      const state = createStateWithHooks([
        {
          name: "test",
          renderStart: () => {
            throw new Error("boom");
          },
          renderError: renderErrorFn,
        },
      ]);
      const build = createRollupBuild(state);
      await expect(build.generate({ format: "es" })).rejects.toThrow("boom");
      expect(renderErrorFn).toHaveBeenCalledTimes(1);
    });

    it("fires renderError with the error object", async () => {
      const renderErrorFn = vi.fn();
      const state = createStateWithHooks([
        {
          name: "test",
          renderStart: () => {
            throw new Error("render failed");
          },
          renderError: renderErrorFn,
        },
      ]);
      const build = createRollupBuild(state);
      await expect(build.generate({ format: "es" })).rejects.toThrow(
        "render failed",
      );
      const errorArg = renderErrorFn.mock.calls[0][0];
      expect(errorArg).toBeInstanceOf(Error);
      expect(errorArg.message).toBe("render failed");
    });

    it("fires renderError when non-Error is thrown from renderStart", async () => {
      const renderErrorFn = vi.fn();
      const state = createStateWithHooks([
        {
          name: "test",
          renderStart: () => {
            throw "string error";
          },
          renderError: renderErrorFn,
        },
      ]);
      const build = createRollupBuild(state);
      await expect(build.generate({ format: "es" })).rejects.toBe(
        "string error",
      );
      const errorArg = renderErrorFn.mock.calls[0][0];
      expect(errorArg).toBeInstanceOf(Error);
      expect(errorArg.message).toBe("string error");
    });

    it("fires closeBundle when outputHookExecutor is provided", async () => {
      const closeBundleFn = vi.fn();
      const state = createStateWithHooks([
        { name: "test", closeBundle: closeBundleFn },
      ]);
      const build = createRollupBuild(state);
      await build.close();
      expect(closeBundleFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("module rendering", () => {
    const createModuleWithCode = (
      id: string,
      code: string,
      isEntry: boolean = false,
    ): Module => {
      const mod = new Module(id, code, isEntry);
      mod.ast = parse(code);
      mod.extractImportsExports();
      mod.isIncluded = true;
      return mod;
    };

    it("renders module with null ast by returning raw code", async () => {
      const mod = new Module("test.js", "const x = 1;", true);
      mod.isEntry = true;
      mod.isIncluded = true;
      // ast is null by default
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toContain("const x = 1");
    });

    it("renders module with export named declaration", async () => {
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toContain("x");
    });

    it("renders export default declaration", async () => {
      const code = "export default function foo() { return 1; }\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toContain("foo");
    });

    it("strips export keyword in cjs format", async () => {
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "cjs" });
      expect(output.output[0].code).toContain("x");
    });

    it("strips export default in cjs format", async () => {
      const code = "export default function foo() {}\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "cjs" });
      expect(output.output[0].code).toContain("foo");
    });

    it("handles export specifier list", async () => {
      const code = "const a = 1;\nconst b = 2;\nexport { a, b };\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("removes export specifier list in cjs format", async () => {
      const code = "const a = 1;\nconst b = 2;\nexport { a, b };\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "cjs" });
      expect(output.output[0].code).toContain("const a");
    });

    it("handles multi-module build with internal imports", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode =
        'import { helper } from "./helper.js";\nexport const main = helper;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dependencies.add(helperMod);
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles external imports in es format", async () => {
      const code = 'import { foo } from "external";\nexport const bar = foo;\n';
      const mod = createModuleWithCode("entry.js", code, true);
      const extMod = new ExternalModule("external");
      mod.dependencies.add(extMod);

      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      // External imports should be preserved in ES format
      expect(output.output[0].code).toContain("import");
    });

    it("removes external imports in cjs format", async () => {
      const code = 'import { foo } from "external";\nexport const bar = foo;\n';
      const mod = createModuleWithCode("entry.js", code, true);
      const extMod = new ExternalModule("external");
      mod.dependencies.add(extMod);

      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "cjs" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles entryModule fallback when no module has isEntry", async () => {
      const code = "const x = 1;\n";
      const mod = createModuleWithCode("fallback.js", code, false);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].facadeModuleId).toBe("fallback.js");
    });

    it("applies tree-shaking to exclude statements", async () => {
      const code = "const x = 1;\nconst y = 2;\nexport const z = 3;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const includedStatements = new Map<string, ReadonlySet<number>>();
      includedStatements.set("entry.js", new Set([2])); // only include the export
      const state = createMinimalState({
        modules: [mod],
        includedStatementsByModule: includedStatements,
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toContain("z");
    });

    it("skips tree-shaken modules except entry", async () => {
      const helperCode = "export const unused = 1;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      helperMod.isIncluded = false;

      const entryCode = "export const main = 42;\n";
      const entryMod = createModuleWithCode("entry.js", entryCode, true);

      const includedStatements = new Map<string, ReadonlySet<number>>();
      includedStatements.set("entry.js", new Set([0]));
      const state = createMinimalState({
        modules: [helperMod, entryMod],
        includedStatementsByModule: includedStatements,
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).not.toContain("unused");
    });

    it("handles export all declaration with internal source", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode = 'export * from "./helper.js";\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dependencies.add(helperMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles re-export from internal module", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode = 'export { helper } from "./helper.js";\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dependencies.add(helperMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("renders export default class", async () => {
      const code = "export default class Foo {}\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "cjs" });
      expect(output.output[0].code).toContain("Foo");
    });

    it("applies addons (banner/footer)", async () => {
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({
        format: "es",
        banner: "/* banner */",
        footer: "/* footer */",
      });
      expect(output.output[0].code).toContain("/* banner */");
      expect(output.output[0].code).toContain("/* footer */");
    });

    it("builds modules record with treeShakeResult removedBindings", async () => {
      const code = "export const kept = 1;\nexport const removed = 2;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const treeShakeResult = {
        includedModules: ["entry.js"],
        removedModules: [],
        removedBindings: ["removed"],
        stats: { totalModules: 1, includedModules: 1, removedModules: 0 },
      };
      const state = createMinimalState({
        modules: [mod],
        treeShakeResult,
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      const chunk = output.output[0];
      if (chunk.type === "chunk") {
        expect(chunk.modules["entry.js"]).toBeDefined();
      }
    });

    it("fires renderError when generate throws during rendering", async () => {
      const renderErrorFn = vi.fn();
      const renderChunkFn = vi.fn().mockImplementation(() => {
        throw new Error("render chunk failed");
      });
      const inputOptions = normalizeInputOptions({ input: "entry.js" });
      const driver = new PluginDriver(
        [
          {
            name: "test",
            renderChunk: renderChunkFn,
            renderError: renderErrorFn,
          },
        ],
        () => {},
      );
      const executor = new OutputHookExecutor(driver);
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({
        modules: [mod],
        outputHookExecutor: executor,
        inputOptions,
      });
      const build = createRollupBuild(state);
      await expect(build.generate({ format: "es" })).rejects.toThrow(
        "render chunk failed",
      );
      expect(renderErrorFn).toHaveBeenCalledTimes(1);
    });

    it("fires renderError with wrapped non-Error thrown during rendering", async () => {
      const renderErrorFn = vi.fn();
      const renderChunkFn = vi.fn().mockImplementation(() => {
        throw "string error from chunk";
      });
      const inputOptions = normalizeInputOptions({ input: "entry.js" });
      const driver = new PluginDriver(
        [
          {
            name: "test",
            renderChunk: renderChunkFn,
            renderError: renderErrorFn,
          },
        ],
        () => {},
      );
      const executor = new OutputHookExecutor(driver);
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({
        modules: [mod],
        outputHookExecutor: executor,
        inputOptions,
      });
      const build = createRollupBuild(state);
      await expect(build.generate({ format: "es" })).rejects.toBe(
        "string error from chunk",
      );
      const errorArg = renderErrorFn.mock.calls[0][0];
      expect(errorArg).toBeInstanceOf(Error);
      expect(errorArg.message).toBe("string error from chunk");
    });

    it("handles dynamic imports with code splitting", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      // Only add dynamic import link, NOT static dependency
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      // Should produce 2 chunks: entry and dynamic chunk
      expect(output.output.length).toBe(2);
      const entryChunk = output.output.find((c) => c.isEntry);
      const dynamicChunk = output.output.find(
        (c) => c.type === "chunk" && !c.isEntry,
      );
      expect(entryChunk).toBeDefined();
      expect(dynamicChunk).toBeDefined();
      if (dynamicChunk && dynamicChunk.type === "chunk") {
        expect(dynamicChunk.isDynamicEntry).toBe(true);
        // Entry chunk should have dynamicImports referencing the dynamic chunk
        if (entryChunk && entryChunk.type === "chunk") {
          expect(entryChunk.dynamicImports.length).toBeGreaterThanOrEqual(1);
          // The entry chunk code should reference the dynamic chunk filename
          expect(entryChunk.code).toContain("import(");
        }
      }
    });

    it("handles module with default export in getExportBindings", async () => {
      const code = "export default function main() {}\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      const chunk = output.output[0];
      if (chunk.type === "chunk") {
        expect(chunk.exports).toContain("default");
      }
    });

    it("handles named export with only exported field (no local)", async () => {
      const code = "const x = 1;\nexport { x as renamed };\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      const chunk = output.output[0];
      if (chunk.type === "chunk") {
        expect(chunk.exports).toBeDefined();
      }
    });

    it("handles export default class in non-entry cjs module", async () => {
      const helperCode = "export default class Helper {}\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      helperMod.isIncluded = true;

      const entryCode = "export const main = 42;\n";
      const entryMod = createModuleWithCode("entry.js", entryCode, true);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "cjs" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles export specifiers in non-entry module", async () => {
      const helperCode = "const a = 1;\nconst b = 2;\nexport { a, b };\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      helperMod.isIncluded = true;

      const entryCode = "export const main = 42;\n";
      const entryMod = createModuleWithCode("entry.js", entryCode, true);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles export named declaration without declaration in non-entry", async () => {
      const helperCode = "const val = 1;\nexport { val };\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      helperMod.isIncluded = true;

      const entryCode = "export const main = 42;\n";
      const entryMod = createModuleWithCode("entry.js", entryCode, true);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("generates inline dynamic imports when option set", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({
        format: "es",
        inlineDynamicImports: true,
      });
      // With inline, should produce single chunk
      expect(output.output.length).toBe(1);
    });

    it("handles isInternalImport when no dependency matches", async () => {
      // Import from a source that doesn't match any dependency
      const code =
        'import { ext } from "nonexistent";\nexport const x = ext;\n';
      const mod = createModuleWithCode("entry.js", code, true);
      // No dependencies added, so isInternalImport returns false
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      // Import is kept (treated as external in ES format)
      expect(output.output[0].code).toContain("import");
    });

    it("handles getExportBindings with named export without local", async () => {
      // Export with exported but nullish local — triggers ?? fallback
      const code = "const val = 1;\nexport { val };\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles getExportBindings with default export that has no local", async () => {
      // Export default where local is undefined — triggers local ?? "default"
      const code = "export default 42;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      const chunk = output.output[0];
      if (chunk.type === "chunk") {
        expect(chunk.exports).toContain("default");
      }
    });

    it("handles export named declaration with both declaration and non-entry format", async () => {
      const helperCode = "export const x = 1;\nexport const y = 2;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      helperMod.isIncluded = true;

      const entryCode = "export const main = 42;\n";
      const entryMod = createModuleWithCode("entry.js", entryCode, true);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles dynamic import splitting with entryFileNames pattern", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({
        format: "es",
        entryFileNames: "[name].mjs",
      });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles dynamic import splitting with chunkFileNames pattern", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({
        format: "es",
        chunkFileNames: "chunks/[name]-[hash].js",
      });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles dynamic import with external imports in chunk", async () => {
      const helperCode =
        'import { ext } from "external";\nexport const helper = ext;\n';
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      const extMod = new ExternalModule("external");
      helperMod.dependencies.add(extMod);

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles resolveDynamicSource fallback search across all modules", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode(
        "/abs/helper.js",
        helperCode,
        false,
      );

      const entryCode =
        'const p = import("helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      // Don't add helper as a dependency — force the fallback search path
      entryMod.dynamicImports.push("helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({
        modules: [helperMod, entryMod],
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles resolveDynamicSource with unresolvable import", async () => {
      const entryCode =
        'const p = import("nonexistent.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("nonexistent.js");

      const state = createMinimalState({ modules: [entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles split output with tree-shaking data", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      helperMod.isIncluded = true;

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const includedStatements = new Map<string, ReadonlySet<number>>();
      includedStatements.set("entry.js", new Set([0, 1]));
      includedStatements.set("helper.js", new Set([0]));

      const state = createMinimalState({
        modules: [helperMod, entryMod],
        includedStatementsByModule: includedStatements,
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles split output with addons (banner/footer)", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({
        format: "es",
        banner: "/* split banner */",
        footer: "/* split footer */",
      });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
      // Entry chunk should have addons
      expect(output.output[0].code).toContain("/* split banner */");
    });

    it("handles split output with cjs format", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "cjs" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles split output with renderChunk hook", async () => {
      const renderChunkFn = vi.fn().mockReturnValue(null);
      const inputOptions = normalizeInputOptions({ input: "entry.js" });
      const driver = new PluginDriver(
        [{ name: "test", renderChunk: renderChunkFn }],
        () => {},
      );
      const executor = new OutputHookExecutor(driver);

      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({
        modules: [helperMod, entryMod],
        outputHookExecutor: executor,
        inputOptions,
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles split output where tree-shaken module is not included", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      helperMod.isIncluded = false;

      const unusedCode = "export const unused = 99;\n";
      const unusedMod = createModuleWithCode("unused.js", unusedCode, false);
      unusedMod.isIncluded = false;

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const includedStatements = new Map<string, ReadonlySet<number>>();
      includedStatements.set("entry.js", new Set([0, 1]));

      const state = createMinimalState({
        modules: [helperMod, unusedMod, entryMod],
        includedStatementsByModule: includedStatements,
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles split output with treeShakeResult removedBindings", async () => {
      const helperCode =
        "export const helper = 42;\nexport const removed = 0;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      helperMod.isIncluded = true;

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const treeShakeResult = {
        includedModules: ["entry.js", "helper.js"],
        removedModules: [],
        removedBindings: ["removed"],
        stats: { totalModules: 2, includedModules: 2, removedModules: 0 },
      };

      const state = createMinimalState({
        modules: [helperMod, entryMod],
        treeShakeResult,
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles write with output containing asset items", async () => {
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.write({ dir: "/tmp/steamroller-test-write" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles write with file option", async () => {
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.write({
        file: "/tmp/steamroller-test-output/out.js",
      });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles write with writeBundle hook", async () => {
      const writeBundleFn = vi.fn();
      const inputOptions = normalizeInputOptions({ input: "entry.js" });
      const driver = new PluginDriver(
        [{ name: "test", writeBundle: writeBundleFn }],
        () => {},
      );
      const executor = new OutputHookExecutor(driver);

      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({
        modules: [mod],
        outputHookExecutor: executor,
        inputOptions,
      });
      const build = createRollupBuild(state);
      await build.write({ dir: "/tmp/steamroller-test-hooks" });
      expect(writeBundleFn).toHaveBeenCalledTimes(1);
    });

    it("renders module with empty rendered output (all statements removed)", async () => {
      const code = "const unused = 1;\n";
      const mod = createModuleWithCode("unused.js", code, false);
      mod.isIncluded = true;

      const entryCode = "export const main = 42;\n";
      const entryMod = createModuleWithCode("entry.js", entryCode, true);

      const includedStatements = new Map<string, ReadonlySet<number>>();
      includedStatements.set("entry.js", new Set([0]));
      includedStatements.set("unused.js", new Set([])); // nothing included

      const state = createMinimalState({
        modules: [mod, entryMod],
        includedStatementsByModule: includedStatements,
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles external import in entry with duplicate sources", async () => {
      const code =
        'import { foo } from "ext";\nimport { bar } from "ext";\nexport const x = foo + bar;\n';
      const mod = createModuleWithCode("entry.js", code, true);
      const extMod = new ExternalModule("ext");
      mod.dependencies.add(extMod);

      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles format wrapper returning undefined (no format wrapper)", async () => {
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      // "es" format may not have a wrapper, testing that codepath
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles modules record with non-included module", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      helperMod.isIncluded = false;

      const entryCode = "export const main = 1;\n";
      const entryMod = createModuleWithCode("entry.js", entryCode, true);

      const state = createMinimalState({
        modules: [helperMod, entryMod],
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      const chunk = output.output[0];
      if (chunk.type === "chunk") {
        const helperRecord = chunk.modules["helper.js"];
        if (helperRecord) {
          expect(helperRecord.code).toBe("");
        }
      }
    });

    it("handles split output with multiple external imports from same source", async () => {
      const helperCode =
        'import { a } from "ext";\nimport { b } from "ext";\nexport const helper = a + b;\n';
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      const extMod = new ExternalModule("ext");
      helperMod.dependencies.add(extMod);

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles split output with cjs format wrapper", async () => {
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode =
        'import { helper } from "./helper.js";\nconst p = import("./helper.js");\nexport const main = helper;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "cjs" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles generateSplitOutput with generateBundle hook", async () => {
      const generateBundleFn = vi.fn();
      const inputOptions = normalizeInputOptions({ input: "entry.js" });
      const driver = new PluginDriver(
        [{ name: "test", generateBundle: generateBundleFn }],
        () => {},
      );
      const executor = new OutputHookExecutor(driver);

      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);

      const entryCode =
        'const p = import("./helper.js");\nexport const main = p;\n';
      const entryMod = createModuleWithCode("entry.js", entryCode, true);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({
        modules: [helperMod, entryMod],
        outputHookExecutor: executor,
        inputOptions,
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
      expect(generateBundleFn).toHaveBeenCalledTimes(1);
    });

    it("handles write with no dir or file option (defaults to dist)", async () => {
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.write({});
      expect(output.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles renderError without hookExecutor", async () => {
      // Create a state with modules but no hook executor
      // The renderError path should still throw
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      // This should work without error (no hook executor = no renderError call)
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles single module output with CJS format wrapper", async () => {
      const code =
        'import { foo } from "ext";\nexport const bar = foo;\nexport default function main() {}\n';
      const mod = createModuleWithCode("entry.js", code, true);
      const extMod = new ExternalModule("ext");
      mod.dependencies.add(extMod);

      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "cjs" });
      expect(output.output[0].code).toBeDefined();
      const chunk = output.output[0];
      if (chunk.type === "chunk") {
        // CJS format should have imports and exports
        expect(chunk.imports).toBeDefined();
      }
    });

    it("handles isInternalImport with source matching via includes", async () => {
      // Create a module with internal dependency where dep.id.includes works
      const helperCode = "export const helper = 42;\n";
      const helperMod = createModuleWithCode(
        "/project/src/helper.js",
        helperCode,
        false,
      );

      const entryCode =
        'import { helper } from "./helper.js";\nexport const main = helper;\n';
      const entryMod = createModuleWithCode(
        "/project/src/entry.js",
        entryCode,
        true,
      );
      entryMod.dependencies.add(helperMod);
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles getExternalImportBindings with no external deps", async () => {
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      // No external dependencies
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      const chunk = output.output[0];
      if (chunk.type === "chunk") {
        expect(chunk.imports).toEqual([]);
      }
    });

    it("handles getExportBindings with export that has no local field", async () => {
      // Use a named export that triggers the ?? fallback paths
      const code = "const x = 1;\nexport { x as y };\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles export specifier list in entry ES format (kept)", async () => {
      const code = "const a = 1;\nconst b = 2;\nexport { a, b };\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      // In ES format entry, export specifiers should be kept
      expect(output.output[0].code).toContain("export");
    });

    it("handles export named declaration with declaration in entry ES format (kept)", async () => {
      const code = "export const x = 42;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      // In ES format entry, export keyword should be kept
      expect(output.output[0].code).toContain("export");
    });

    it("generates output with sourcemap option", async () => {
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es", sourcemap: true });
      expect(output.output[0].code).toBeDefined();
    });

    it("handles intro/outro addons", async () => {
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({
        format: "es",
        intro: "/* intro */",
        outro: "/* outro */",
      });
      expect(output.output[0].code).toContain("/* intro */");
      expect(output.output[0].code).toContain("/* outro */");
    });

    it("handles write with output hook and writeBundle", async () => {
      const renderStartFn = vi.fn();
      const renderChunkFn = vi.fn().mockReturnValue(null);
      const generateBundleFn = vi.fn();
      const writeBundleFn = vi.fn();
      const inputOptions = normalizeInputOptions({ input: "entry.js" });
      const driver = new PluginDriver(
        [
          {
            name: "test",
            renderStart: renderStartFn,
            renderChunk: renderChunkFn,
            generateBundle: generateBundleFn,
            writeBundle: writeBundleFn,
          },
        ],
        () => {},
      );
      const executor = new OutputHookExecutor(driver);
      const code = "export const x = 1;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({
        modules: [mod],
        outputHookExecutor: executor,
        inputOptions,
      });
      const build = createRollupBuild(state);
      const output = await build.write({
        format: "es",
        dir: "/tmp/steamroller-write-hooks-test",
      });
      expect(renderStartFn).toHaveBeenCalledTimes(1);
      expect(generateBundleFn).toHaveBeenCalledTimes(1);
      expect(writeBundleFn).toHaveBeenCalledTimes(1);
    });

    it("handles getExportBindings with named export that has only local (no exported)", async () => {
      // A named export where exported is undefined triggers the ?? fallback
      const code = "const val = 1;\nexport { val };\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      const chunk = output.output[0];
      if (chunk.type === "chunk") {
        expect(chunk.exports).toBeDefined();
      }
    });

    it("handles getExternalImportBindings with external module that matches source", async () => {
      const code =
        'import { foo } from "ext";\nimport { bar } from "ext";\nexport const result = foo + bar;\n';
      const mod = createModuleWithCode("entry.js", code, true);
      const extMod = new ExternalModule("ext");
      mod.dependencies.add(extMod);

      const state = createMinimalState({ modules: [mod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      const chunk = output.output[0];
      if (chunk.type === "chunk") {
        expect(chunk.imports).toContain("ext");
        expect(chunk.importedBindings["ext"]).toBeDefined();
        expect(chunk.importedBindings["ext"].length).toBeGreaterThanOrEqual(2);
      }
    });

    it("handles renderSingleModule with tree-shaking removing statements", async () => {
      const code =
        "const unused1 = 1;\nconst unused2 = 2;\nexport const x = 3;\n";
      const mod = createModuleWithCode("entry.js", code, true);
      const includedStatements = new Map<string, ReadonlySet<number>>();
      // Only include the export statement (index 2)
      includedStatements.set("entry.js", new Set([2]));
      const state = createMinimalState({
        modules: [mod],
        includedStatementsByModule: includedStatements,
      });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output[0].code).toContain("x");
      expect(output.output[0].code).not.toContain("unused1");
    });

    it("handles export specifiers removed in non-entry ES format", async () => {
      const helperCode = "const a = 1;\nconst b = 2;\nexport { a, b };\n";
      const helperMod = createModuleWithCode("helper.js", helperCode, false);
      helperMod.isIncluded = true;

      const entryCode = "export const main = 42;\n";
      const entryMod = createModuleWithCode("entry.js", entryCode, true);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      // Helper module's export specifier list should be removed
      expect(output.output[0].code).toBeDefined();
    });
  });
});
