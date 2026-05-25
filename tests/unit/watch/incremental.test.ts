/**
 * @module tests/unit/watch/incremental
 * @description Unit tests for incremental rebuild support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  shouldRebuildModule,
  createIncrementalBuild,
  filterCacheByChangedFiles,
} from "../../../src/watch/incremental.js";
import type { RollupCache, ModuleJSON } from "../../../src/types.js";

vi.mock("../../../src/build/rollup-build.js", () => ({
  createRollupBuild: vi.fn((state) => ({
    cache: state.cache,
    close: vi.fn().mockResolvedValue(undefined),
    closed: false,
    generate: vi.fn().mockResolvedValue({ output: [] }),
    watchFiles: state.watchFiles,
    write: vi.fn().mockResolvedValue({ output: [] }),
  })),
}));

const createMockModule = (
  id: string,
  dependencies: ReadonlyArray<string> = [],
  transformDependencies: ReadonlyArray<string> = [],
): ModuleJSON => ({
  id,
  ast: null,
  code: `// ${id}`,
  dependencies,
  transformDependencies,
  meta: {},
  syntheticNamedExports: false,
  moduleSideEffects: true,
});

describe("shouldRebuildModule", () => {
  it("returns true if file is in changed files set", () => {
    const changedFiles = new Set(["/src/index.ts"]);
    const cache: RollupCache = { modules: [] };

    const result = shouldRebuildModule("/src/index.ts", cache, changedFiles);
    expect(result).toBe(true);
  });

  it("returns true if cache is undefined", () => {
    const changedFiles = new Set(["/src/other.ts"]);

    const result = shouldRebuildModule(
      "/src/index.ts",
      undefined,
      changedFiles,
    );
    expect(result).toBe(true);
  });

  it("returns true if module is not in cache", () => {
    const changedFiles = new Set(["/src/other.ts"]);
    const cache: RollupCache = {
      modules: [createMockModule("/src/utils.ts")],
    };

    const result = shouldRebuildModule("/src/index.ts", cache, changedFiles);
    expect(result).toBe(true);
  });

  it("returns true if a transform dependency changed", () => {
    const changedFiles = new Set(["/src/macro.ts"]);
    const cache: RollupCache = {
      modules: [createMockModule("/src/index.ts", [], ["/src/macro.ts"])],
    };

    const result = shouldRebuildModule("/src/index.ts", cache, changedFiles);
    expect(result).toBe(true);
  });

  it("returns true if a dependency changed", () => {
    const changedFiles = new Set(["/src/utils.ts"]);
    const cache: RollupCache = {
      modules: [createMockModule("/src/index.ts", ["/src/utils.ts"], [])],
    };

    const result = shouldRebuildModule("/src/index.ts", cache, changedFiles);
    expect(result).toBe(true);
  });

  it("returns false if module is cached and no dependencies changed", () => {
    const changedFiles = new Set(["/src/unrelated.ts"]);
    const cache: RollupCache = {
      modules: [
        createMockModule("/src/index.ts", ["/src/utils.ts"], ["/src/macro.ts"]),
      ],
    };

    const result = shouldRebuildModule("/src/index.ts", cache, changedFiles);
    expect(result).toBe(false);
  });

  it("returns false for empty changed files set with valid cache", () => {
    const changedFiles = new Set<string>();
    const cache: RollupCache = {
      modules: [createMockModule("/src/index.ts")],
    };

    const result = shouldRebuildModule("/src/index.ts", cache, changedFiles);
    expect(result).toBe(false);
  });

  it("returns true if cache has no modules array content", () => {
    const changedFiles = new Set(["/src/other.ts"]);
    const cache: RollupCache = { modules: [] };

    const result = shouldRebuildModule("/src/index.ts", cache, changedFiles);
    expect(result).toBe(true);
  });
});

describe("createIncrementalBuild", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates build without cache on first run", async () => {
    const build = await createIncrementalBuild(
      { input: "src/index.ts" },
      undefined,
    );

    expect(build).toBeDefined();
    expect(build.cache).toBeUndefined();
    expect(build.watchFiles).toEqual([]);
  });

  it("passes cache from previous build", async () => {
    const previousCache: RollupCache = {
      modules: [createMockModule("/src/index.ts")],
      plugins: {},
    };

    const build = await createIncrementalBuild(
      { input: "src/index.ts" },
      previousCache,
    );

    expect(build).toBeDefined();
    expect(build.cache).toEqual(previousCache);
  });

  it("includes cached module IDs as watch files", async () => {
    const previousCache: RollupCache = {
      modules: [
        createMockModule("/src/index.ts"),
        createMockModule("/src/utils.ts"),
      ],
    };

    const build = await createIncrementalBuild(
      { input: "src/index.ts" },
      previousCache,
    );

    expect(build.watchFiles).toContain("/src/index.ts");
    expect(build.watchFiles).toContain("/src/utils.ts");
  });

  it("handles options with cache set to false", async () => {
    const build = await createIncrementalBuild(
      { input: "src/index.ts", cache: false },
      undefined,
    );

    expect(build).toBeDefined();
    expect(build.cache).toBeUndefined();
  });

  it("returns a build with close method", async () => {
    const build = await createIncrementalBuild(
      { input: "src/index.ts" },
      undefined,
    );

    expect(typeof build.close).toBe("function");
  });

  it("returns a build with generate method", async () => {
    const build = await createIncrementalBuild(
      { input: "src/index.ts" },
      undefined,
    );

    expect(typeof build.generate).toBe("function");
  });
});

describe("filterCacheByChangedFiles", () => {
  it("keeps modules that do not need rebuilding", () => {
    const cache: RollupCache = {
      modules: [
        createMockModule("/src/index.ts", ["/src/utils.ts"]),
        createMockModule("/src/utils.ts"),
        createMockModule("/src/constants.ts"),
      ],
      plugins: { myPlugin: [1] },
    };

    const changedFiles = new Set(["/src/utils.ts"]);
    const filtered = filterCacheByChangedFiles(cache, changedFiles);

    expect(filtered.modules).toHaveLength(1);
    expect(filtered.modules[0].id).toBe("/src/constants.ts");
  });

  it("returns empty modules when all files changed", () => {
    const cache: RollupCache = {
      modules: [createMockModule("/src/a.ts"), createMockModule("/src/b.ts")],
    };

    const changedFiles = new Set(["/src/a.ts", "/src/b.ts"]);
    const filtered = filterCacheByChangedFiles(cache, changedFiles);

    expect(filtered.modules).toHaveLength(0);
  });

  it("preserves plugins from the original cache", () => {
    const cache: RollupCache = {
      modules: [createMockModule("/src/a.ts")],
      plugins: { testPlugin: ["cached-data"] },
    };

    const changedFiles = new Set(["/src/other.ts"]);
    const filtered = filterCacheByChangedFiles(cache, changedFiles);

    expect(filtered.plugins).toEqual({ testPlugin: ["cached-data"] });
  });

  it("keeps all modules when no files changed", () => {
    const cache: RollupCache = {
      modules: [
        createMockModule("/src/a.ts"),
        createMockModule("/src/b.ts"),
        createMockModule("/src/c.ts"),
      ],
    };

    const changedFiles = new Set<string>();
    const filtered = filterCacheByChangedFiles(cache, changedFiles);

    expect(filtered.modules).toHaveLength(3);
  });

  it("removes modules with changed transform dependencies", () => {
    const cache: RollupCache = {
      modules: [
        createMockModule("/src/index.ts", [], ["/src/transform-helper.ts"]),
        createMockModule("/src/other.ts"),
      ],
    };

    const changedFiles = new Set(["/src/transform-helper.ts"]);
    const filtered = filterCacheByChangedFiles(cache, changedFiles);

    expect(filtered.modules).toHaveLength(1);
    expect(filtered.modules[0].id).toBe("/src/other.ts");
  });
});
