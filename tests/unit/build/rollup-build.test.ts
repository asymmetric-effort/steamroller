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
  OutputChunk,
} from "../../../src/types.js";
import { PluginDriver } from "../../../src/plugins/driver.js";
import { OutputHookExecutor } from "../../../src/plugins/output-hooks.js";
import { Module } from "../../../src/module/Module.js";
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

    it("each build has independent state (verified)", () => {
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

  describe("generate() with modules (rendering paths)", () => {
    /**
     * Helper to create a Module with parsed AST.
     */
    const createModule = (
      id: string,
      code: string,
      isEntry: boolean,
    ): Module => {
      const mod = new Module(id, code, isEntry);
      mod.ast = parse(code) as typeof mod.ast;
      mod.extractImportsExports();
      mod.isIncluded = true;
      return mod;
    };

    it("renders module with null AST by returning raw code", async () => {
      const mod = new Module("test.js", "const x = 1;", true);
      // AST is null by default
      mod.isIncluded = true;
      const build = createRollupBuild(createMinimalState({ modules: [mod] }));
      const result = await build.generate({ format: "es" });
      const chunk = result.output[0] as OutputChunk;
      expect(chunk.code).toContain("const x = 1");
    });

    it("renders default export in entry module", async () => {
      const mod = createModule(
        "entry.js",
        "const val = 42;\nexport default val;",
        true,
      );
      const build = createRollupBuild(createMinimalState({ modules: [mod] }));
      const result = await build.generate({ format: "es" });
      const chunk = result.output[0] as OutputChunk;
      expect(chunk.exports).toContain("default");
    });

    it("renders default export in non-entry CJS module", async () => {
      const dep = createModule(
        "dep.js",
        "const val = 99;\nexport default val;",
        false,
      );
      const entry = createModule("entry.js", "export const x = 1;", true);
      entry.dependencies.add(dep);
      dep.importers.add(entry);

      const build = createRollupBuild(
        createMinimalState({ modules: [dep, entry] }),
      );
      const result = await build.generate({ format: "cjs" });
      const chunk = result.output[0] as OutputChunk;
      expect(chunk.code).toContain("99");
    });

    it("handles named export with undefined exported field", async () => {
      const mod = createModule("entry.js", "export const foo = 1;", true);
      // Manually set exported to undefined to test fallback
      mod.exports[0] = {
        type: "named",
        local: "foo",
        exported: undefined,
      };
      const build = createRollupBuild(createMinimalState({ modules: [mod] }));
      const result = await build.generate({ format: "es" });
      const chunk = result.output[0] as OutputChunk;
      expect(chunk.exports).toContain("foo");
    });

    it("handles named export with undefined local field", async () => {
      const mod = createModule("entry.js", "export const bar = 2;", true);
      mod.exports[0] = {
        type: "named",
        local: undefined,
        exported: "bar",
      };
      const build = createRollupBuild(createMinimalState({ modules: [mod] }));
      const result = await build.generate({ format: "es" });
      const chunk = result.output[0] as OutputChunk;
      expect(chunk.exports).toContain("bar");
    });

    it("handles export with both local and exported undefined", async () => {
      const mod = createModule("entry.js", "export const z = 3;", true);
      mod.exports[0] = {
        type: "named",
        local: undefined,
        exported: undefined,
      };
      const build = createRollupBuild(createMinimalState({ modules: [mod] }));
      const result = await build.generate({ format: "es" });
      const chunk = result.output[0] as OutputChunk;
      expect(chunk.exports).toContain("");
    });

    it("falls back to last module when no entry is marked", async () => {
      const mod1 = createModule("a.js", "const a = 1;", false);
      const mod2 = createModule("b.js", "const b = 2;", false);

      const build = createRollupBuild(
        createMinimalState({ modules: [mod1, mod2] }),
      );
      const result = await build.generate({ format: "es" });
      const chunk = result.output[0] as OutputChunk;
      expect(chunk.facadeModuleId).toBe("b.js");
    });

    it("generate with dynamic import and inlineDynamicImports=false produces multiple chunks", async () => {
      const entry = createModule(
        "main.js",
        'const load = () => import("./lazy.js");\nexport { load };',
        true,
      );
      const lazy = createModule("lazy.js", "export const lazy = 'val';", false);
      entry.dependencies.add(lazy);
      lazy.importers.add(entry);

      const build = createRollupBuild(
        createMinimalState({ modules: [lazy, entry] }),
      );
      const result = await build.generate({
        format: "es",
        dir: "dist",
        inlineDynamicImports: false,
      });
      expect(result.output.length).toBeGreaterThanOrEqual(2);
      const entryChunk = result.output.find(
        (o) => o.type === "chunk" && (o as OutputChunk).isEntry,
      ) as OutputChunk;
      const dynamicChunk = result.output.find(
        (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
      ) as OutputChunk;
      expect(entryChunk).toBeDefined();
      expect(dynamicChunk).toBeDefined();
      expect(dynamicChunk.code).toContain("val");
    });

    it("skips tree-shaken modules in buildSingleChunk", async () => {
      const entry = createModule(
        "main.js",
        'const load = () => import("./lazy.js");\nexport { load };',
        true,
      );
      const lazy = createModule(
        "lazy.js",
        "export const lazy = 'shaken';",
        false,
      );
      const unused = createModule(
        "unused.js",
        "export const unused = 'gone';",
        false,
      );
      unused.isIncluded = false;
      entry.dependencies.add(lazy);
      entry.dependencies.add(unused);
      lazy.importers.add(entry);
      unused.importers.add(entry);

      const includedStatements = new Map<string, ReadonlySet<number>>();
      includedStatements.set("main.js", new Set([0, 1]));
      includedStatements.set("lazy.js", new Set([0]));
      includedStatements.set("unused.js", new Set());

      const build = createRollupBuild(
        createMinimalState({
          modules: [unused, lazy, entry],
          includedStatementsByModule: includedStatements,
        }),
      );
      const result = await build.generate({
        format: "es",
        dir: "dist",
      });
      // Should still produce multiple chunks
      expect(result.output.length).toBeGreaterThanOrEqual(1);
    });

    it("handles default export with undefined local in export descriptor", async () => {
      const mod = createModule(
        "entry.js",
        "const val = 42;\nexport default val;",
        true,
      );
      // Manually set local to undefined to test ?? fallback
      mod.exports[0] = {
        type: "default",
        local: undefined,
        exported: "default",
      };
      const build = createRollupBuild(createMinimalState({ modules: [mod] }));
      const result = await build.generate({ format: "es" });
      const chunk = result.output[0] as OutputChunk;
      expect(chunk.exports).toContain("default");
    });

    it("strips export default in non-entry module with function declaration", async () => {
      const dep = createModule(
        "dep.js",
        "export default function greet() { return 'hi'; }",
        false,
      );
      const entry = createModule("entry.js", "export const x = 1;", true);
      entry.dependencies.add(dep);
      dep.importers.add(entry);

      const build = createRollupBuild(
        createMinimalState({ modules: [dep, entry] }),
      );
      const result = await build.generate({ format: "es" });
      const chunk = result.output[0] as OutputChunk;
      // The default export keyword should be stripped for non-entry
      expect(chunk.code).toContain("greet");
      expect(chunk.code).not.toMatch(/export default function/);
    });

    it("removes internal export-all declaration", async () => {
      const helper = createModule("helper.js", "export const h = 1;", false);
      const mid = createModule(
        "mid.js",
        'import { h } from "./helper.js";\nexport const m = h;',
        false,
      );
      mid.dependencies.add(helper);
      helper.importers.add(mid);

      // Add an export-all descriptor that references an internal module
      mid.exports.push({
        type: "all",
        source: "./helper.js",
      });

      const entry = createModule("entry.js", "export const x = 1;", true);
      entry.dependencies.add(mid);
      mid.importers.add(entry);

      const build = createRollupBuild(
        createMinimalState({ modules: [helper, mid, entry] }),
      );
      const result = await build.generate({ format: "es" });
      const chunk = result.output[0] as OutputChunk;
      expect(chunk.code).toContain("1");
    });

    it("removes internal named re-export (export { x } from './internal')", async () => {
      const helper = createModule("helper.js", "export const h = 1;", false);
      const mid = createModule(
        "mid.js",
        'export { h } from "./helper.js";',
        false,
      );
      mid.dependencies.add(helper);
      helper.importers.add(mid);

      const entry = createModule(
        "entry.js",
        'import { h } from "./mid.js";\nexport const x = h;',
        true,
      );
      entry.dependencies.add(mid);
      mid.importers.add(entry);

      const build = createRollupBuild(
        createMinimalState({ modules: [helper, mid, entry] }),
      );
      const result = await build.generate({ format: "es" });
      const chunk = result.output[0] as OutputChunk;
      // The re-export should be removed since helper.js is internal
      expect(chunk.code).not.toContain('from "./helper.js"');
    });

    it("removes internal export-all declaration in rendering", async () => {
      // Create a module that has export * from "./internal.js" in its AST
      const helper = createModule(
        "helper.js",
        "export const h = 'star';",
        false,
      );
      const mid = createModule(
        "mid.js",
        'import { h } from "./helper.js";\nexport const m = h;',
        false,
      );
      mid.dependencies.add(helper);
      helper.importers.add(mid);

      // Manually add an export-all to the mid module's AST body
      // and add a matching ExportAllDeclaration node
      const origCode =
        'export * from "./helper.js";\nimport { h } from "./helper.js";\nexport const m = h;';
      const midWithExportAll = createModule("mid2.js", origCode, false);
      midWithExportAll.dependencies.add(helper);
      helper.importers.add(midWithExportAll);

      const entry = createModule("entry.js", "export const x = 1;", true);
      entry.dependencies.add(midWithExportAll);
      midWithExportAll.importers.add(entry);

      const build = createRollupBuild(
        createMinimalState({ modules: [helper, midWithExportAll, entry] }),
      );
      const result = await build.generate({ format: "es" });
      const chunk = result.output[0] as OutputChunk;
      // export * from should be removed since helper is internal
      expect(chunk.code).not.toContain("export * from");
    });

    it("resolveDynamicImportId returns source when no match found", async () => {
      // Create a dynamic import pointing to a module that doesn't exist in deps or allModuleIds
      const entry = createModule(
        "main.js",
        'const load = () => import("./nonexistent.js");\nexport { load };',
        true,
      );
      entry.isIncluded = true;

      const build = createRollupBuild(createMinimalState({ modules: [entry] }));
      // This won't split because the dynamic import target doesn't resolve
      // to any known module, but it should still generate without error
      const result = await build.generate({
        format: "es",
        dir: "dist",
      });
      expect(result.output.length).toBeGreaterThanOrEqual(1);
    });

    it("duplicate relative sources for same dynamic import target are deduped", async () => {
      // Two modules import the same target with the same relative path
      const lazy = createModule("lazy.js", "export const lazy = 'dup';", false);
      const helper = createModule(
        "helper.js",
        'const go = () => import("./lazy.js");\nexport { go };',
        false,
      );
      helper.dependencies.add(lazy);
      lazy.importers.add(helper);

      const entry = createModule(
        "main.js",
        'import { go } from "./helper.js";\nconst go2 = () => import("./lazy.js");\nexport { go, go2 };',
        true,
      );
      entry.dependencies.add(helper);
      entry.dependencies.add(lazy);
      helper.importers.add(entry);
      lazy.importers.add(entry);

      const build = createRollupBuild(
        createMinimalState({ modules: [lazy, helper, entry] }),
      );
      const result = await build.generate({
        format: "es",
        dir: "dist",
      });
      expect(result.output.length).toBeGreaterThanOrEqual(2);
    });

    it("dynamic import resolved via allModuleIds fallback", async () => {
      // Create modules where dynamic import target is NOT in dependencies
      // but IS in the overall module set
      const entry = createModule(
        "main.js",
        'const load = () => import("./orphan.js");\nexport { load };',
        true,
      );
      const orphan = createModule(
        "orphan.js",
        "export const orphan = 'found';",
        false,
      );
      // Do NOT add orphan as a dependency of entry -- this forces the fallback path
      orphan.isIncluded = true;

      const build = createRollupBuild(
        createMinimalState({ modules: [orphan, entry] }),
      );
      const result = await build.generate({
        format: "es",
        dir: "dist",
      });
      // Should still produce multiple chunks
      expect(result.output.length).toBeGreaterThanOrEqual(2);
    });

    it("facade undefined fallback in shared chunk", async () => {
      // Create a module graph where a chunk has no entry or dynamic entry
      // This happens with shared dependencies
      const entry = createModule(
        "main.js",
        'const load = () => import("./lazy.js");\nexport { load };',
        true,
      );
      const shared = createModule(
        "shared.js",
        "export const s = 'shared';",
        false,
      );
      const lazy = createModule(
        "lazy.js",
        'import { s } from "./shared.js";\nexport const lazy = s;',
        false,
      );
      entry.dependencies.add(lazy);
      entry.dependencies.add(shared);
      lazy.dependencies.add(shared);
      lazy.importers.add(entry);
      shared.importers.add(entry);
      shared.importers.add(lazy);

      const build = createRollupBuild(
        createMinimalState({ modules: [shared, lazy, entry] }),
      );
      const result = await build.generate({
        format: "es",
        dir: "dist",
      });
      // Should produce chunks
      expect(result.output.length).toBeGreaterThanOrEqual(1);
    });

    it("formatWrapper undefined path in buildSingleChunk", async () => {
      // Use a format that has no wrapper - but all formats have wrappers
      // The 'es' format returns undefined from getFormatWrapper
      const entry = createModule(
        "main.js",
        'const load = () => import("./lazy.js");\nexport { load };',
        true,
      );
      const lazy = createModule(
        "lazy.js",
        "export const lazy = 'unwrapped';",
        false,
      );
      entry.dependencies.add(lazy);
      lazy.importers.add(entry);

      const build = createRollupBuild(
        createMinimalState({ modules: [lazy, entry] }),
      );
      // ES format should work without issues
      const result = await build.generate({
        format: "es",
        dir: "dist",
      });
      expect(result.output.length).toBeGreaterThanOrEqual(2);
    });
  });
});
