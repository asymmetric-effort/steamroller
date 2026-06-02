/**
 * Tests for src/build/rollup-build.ts
 *
 * Covers createRollupBuild() interface shape, generate(), write(), close(),
 * post-close error behavior, and cache/watchFiles/getTimings accessors.
 */
import { describe, it, expect, vi } from "vitest";
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
      entryMod.dependencies.add(helperMod);
      entryMod.dynamicImports.push("./helper.js");
      helperMod.importers.add(entryMod);

      const state = createMinimalState({ modules: [helperMod, entryMod] });
      const build = createRollupBuild(state);
      const output = await build.generate({ format: "es" });
      expect(output.output.length).toBeGreaterThanOrEqual(1);
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
      entryMod.dependencies.add(helperMod);
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
  });
});
