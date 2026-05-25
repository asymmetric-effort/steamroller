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
} from "../../../src/types.js";
import { PluginDriver } from "../../../src/plugins/driver.js";
import { OutputHookExecutor } from "../../../src/plugins/output-hooks.js";

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
});
