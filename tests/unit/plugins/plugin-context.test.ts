/**
 * @module tests/unit/plugins/plugin-context.test
 * @description Unit tests for PluginContext module operations (Issue #68).
 */

import { describe, it, expect, vi } from "vitest";
import {
  PluginContextImpl,
  InMemoryModuleGraph,
  createNoOpCache,
} from "../../../src/plugins/plugin-context.js";
import type {
  PluginContextConfig,
  ModuleGraph,
} from "../../../src/plugins/plugin-context.js";
import type { ModuleInfo, ProgramNode } from "../../../src/types.js";

const createMockModuleInfo = (id: string): ModuleInfo => ({
  id,
  code: `console.log("${id}")`,
  ast: null,
  isEntry: false,
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
});

const createMockParser = (): ((
  input: string,
  options?: unknown,
) => ProgramNode) => {
  return (input: string, _options?: unknown): ProgramNode => ({
    type: "Program",
    start: 0,
    end: input.length,
    body: [],
    sourceType: "module",
  });
};

const createConfig = (
  overrides: Partial<PluginContextConfig> = {},
): PluginContextConfig => {
  const graph = new InMemoryModuleGraph();
  return {
    pluginName: "test-plugin",
    resolver: vi.fn().mockResolvedValue(null),
    loader: vi.fn().mockResolvedValue(createMockModuleInfo("loaded")),
    parser: createMockParser(),
    moduleGraph: graph,
    ...overrides,
  };
};

describe("PluginContextImpl", () => {
  describe("meta", () => {
    it("exposes rollupVersion and watchMode", () => {
      const ctx = new PluginContextImpl(
        createConfig({ rollupVersion: "4.1.0", watchMode: true }),
      );
      expect(ctx.meta.rollupVersion).toBe("4.1.0");
      expect(ctx.meta.watchMode).toBe(true);
    });

    it("defaults rollupVersion to 4.0.0 and watchMode to false", () => {
      const ctx = new PluginContextImpl(createConfig());
      expect(ctx.meta.rollupVersion).toBe("4.0.0");
      expect(ctx.meta.watchMode).toBe(false);
    });
  });

  describe("getModuleInfo", () => {
    it("returns module info when module exists", () => {
      const graph = new InMemoryModuleGraph();
      const info = createMockModuleInfo("./src/index.js");
      graph.addModule("./src/index.js", info);

      const ctx = new PluginContextImpl(createConfig({ moduleGraph: graph }));
      const result = ctx.getModuleInfo("./src/index.js");
      expect(result).toBe(info);
    });

    it("returns null for unknown modules", () => {
      const ctx = new PluginContextImpl(createConfig());
      expect(ctx.getModuleInfo("nonexistent")).toBeNull();
    });
  });

  describe("getModuleIds", () => {
    it("returns an iterator of all module IDs", () => {
      const graph = new InMemoryModuleGraph();
      graph.addModule("a.js", createMockModuleInfo("a.js"));
      graph.addModule("b.js", createMockModuleInfo("b.js"));

      const ctx = new PluginContextImpl(createConfig({ moduleGraph: graph }));
      const ids = [...ctx.getModuleIds()];
      expect(ids).toEqual(["a.js", "b.js"]);
    });

    it("returns empty iterator when no modules", () => {
      const ctx = new PluginContextImpl(createConfig());
      const ids = [...ctx.getModuleIds()];
      expect(ids).toEqual([]);
    });
  });

  describe("load", () => {
    it("calls the loader with options", async () => {
      const loader = vi.fn().mockResolvedValue(createMockModuleInfo("x.js"));
      const ctx = new PluginContextImpl(createConfig({ loader }));

      const result = await ctx.load({ id: "x.js", resolveDependencies: true });
      expect(loader).toHaveBeenCalledWith({
        id: "x.js",
        resolveDependencies: true,
      });
      expect(result.id).toBe("x.js");
    });

    it("passes through resolveDependencies: false", async () => {
      const loader = vi.fn().mockResolvedValue(createMockModuleInfo("y.js"));
      const ctx = new PluginContextImpl(createConfig({ loader }));

      await ctx.load({ id: "y.js", resolveDependencies: false });
      expect(loader).toHaveBeenCalledWith({
        id: "y.js",
        resolveDependencies: false,
      });
    });
  });

  describe("resolve", () => {
    it("calls the resolver with source, importer, and options", async () => {
      const resolver = vi.fn().mockResolvedValue({
        id: "/absolute/path.js",
        external: false,
        moduleSideEffects: true,
        syntheticNamedExports: false,
        meta: {},
        resolvedBy: "test",
      });
      const ctx = new PluginContextImpl(createConfig({ resolver }));

      const result = await ctx.resolve("./module", "/importer.js", {
        isEntry: true,
      });
      expect(resolver).toHaveBeenCalledWith("./module", "/importer.js", {
        isEntry: true,
      });
      expect(result?.id).toBe("/absolute/path.js");
    });

    it("returns null when resolver returns null", async () => {
      const resolver = vi.fn().mockResolvedValue(null);
      const ctx = new PluginContextImpl(createConfig({ resolver }));
      const result = await ctx.resolve("not-found", undefined);
      expect(result).toBeNull();
    });

    it("uses empty options when none provided", async () => {
      const resolver = vi.fn().mockResolvedValue(null);
      const ctx = new PluginContextImpl(createConfig({ resolver }));
      await ctx.resolve("x", "y");
      expect(resolver).toHaveBeenCalledWith("x", "y", {});
    });
  });

  describe("parse", () => {
    it("parses code into a ProgramNode", () => {
      const ctx = new PluginContextImpl(createConfig());
      const result = ctx.parse("const x = 1;");
      expect(result.type).toBe("Program");
      expect(result.sourceType).toBe("module");
      expect(result.end).toBe(12);
    });

    it("passes options to the parser", () => {
      const parser = vi.fn().mockReturnValue({
        type: "Program",
        start: 0,
        end: 0,
        body: [],
        sourceType: "module",
      });
      const ctx = new PluginContextImpl(createConfig({ parser }));
      ctx.parse("code", { ecmaVersion: 2020 });
      expect(parser).toHaveBeenCalledWith("code", { ecmaVersion: 2020 });
    });
  });

  describe("addWatchFile / getWatchFiles", () => {
    it("starts with an empty watch list", () => {
      const ctx = new PluginContextImpl(createConfig());
      expect(ctx.getWatchFiles()).toEqual([]);
    });

    it("adds files to the watch list", () => {
      const ctx = new PluginContextImpl(createConfig());
      ctx.addWatchFile("/path/a.js");
      ctx.addWatchFile("/path/b.js");
      expect(ctx.getWatchFiles()).toEqual(["/path/a.js", "/path/b.js"]);
    });

    it("returns a copy (not the internal array)", () => {
      const ctx = new PluginContextImpl(createConfig());
      ctx.addWatchFile("a.js");
      const files = ctx.getWatchFiles();
      ctx.addWatchFile("b.js");
      expect(files).toHaveLength(1);
    });
  });

  describe("error", () => {
    it("throws an error with string message", () => {
      const ctx = new PluginContextImpl(createConfig());
      expect(() => ctx.error("something went wrong")).toThrow(
        "something went wrong",
      );
    });

    it("throws an error with RollupLog message", () => {
      const ctx = new PluginContextImpl(createConfig());
      expect(() => ctx.error({ message: "structured error" })).toThrow(
        "structured error",
      );
    });

    it("attaches plugin name to the error", () => {
      const ctx = new PluginContextImpl(
        createConfig({ pluginName: "my-plugin" }),
      );
      try {
        ctx.error("oops");
      } catch (e) {
        expect((e as Record<string, unknown>)["plugin"]).toBe("my-plugin");
      }
    });
  });

  describe("warn", () => {
    it("calls onLog with warn level for string", () => {
      const onLog = vi.fn();
      const ctx = new PluginContextImpl(createConfig({ onLog }));
      ctx.warn("be careful");
      expect(onLog).toHaveBeenCalledWith("warn", { message: "be careful" });
    });

    it("calls onLog with warn level for RollupLog", () => {
      const onLog = vi.fn();
      const ctx = new PluginContextImpl(createConfig({ onLog }));
      ctx.warn({ message: "warning", code: "W001" });
      expect(onLog).toHaveBeenCalledWith("warn", {
        message: "warning",
        code: "W001",
      });
    });

    it("resolves lazy warning function", () => {
      const onLog = vi.fn();
      const ctx = new PluginContextImpl(createConfig({ onLog }));
      ctx.warn(() => "lazy warning");
      expect(onLog).toHaveBeenCalledWith("warn", { message: "lazy warning" });
    });
  });

  describe("info", () => {
    it("calls onLog with info level", () => {
      const onLog = vi.fn();
      const ctx = new PluginContextImpl(createConfig({ onLog }));
      ctx.info("information");
      expect(onLog).toHaveBeenCalledWith("info", { message: "information" });
    });

    it("resolves lazy info function", () => {
      const onLog = vi.fn();
      const ctx = new PluginContextImpl(createConfig({ onLog }));
      ctx.info(() => ({ message: "lazy info", code: "I001" }));
      expect(onLog).toHaveBeenCalledWith("info", {
        message: "lazy info",
        code: "I001",
      });
    });
  });

  describe("debug", () => {
    it("calls onLog with debug level", () => {
      const onLog = vi.fn();
      const ctx = new PluginContextImpl(createConfig({ onLog }));
      ctx.debug("debug msg");
      expect(onLog).toHaveBeenCalledWith("debug", { message: "debug msg" });
    });

    it("resolves lazy debug function", () => {
      const onLog = vi.fn();
      const ctx = new PluginContextImpl(createConfig({ onLog }));
      ctx.debug(() => "lazy debug");
      expect(onLog).toHaveBeenCalledWith("debug", { message: "lazy debug" });
    });

    it("passes RollupLog object directly", () => {
      const onLog = vi.fn();
      const ctx = new PluginContextImpl(createConfig({ onLog }));
      ctx.debug({ message: "debug obj", code: "D001" });
      expect(onLog).toHaveBeenCalledWith("debug", {
        message: "debug obj",
        code: "D001",
      });
    });

    it("resolves lazy debug returning RollupLog", () => {
      const onLog = vi.fn();
      const ctx = new PluginContextImpl(createConfig({ onLog }));
      ctx.debug(() => ({ message: "lazy obj debug", code: "D002" }));
      expect(onLog).toHaveBeenCalledWith("debug", {
        message: "lazy obj debug",
        code: "D002",
      });
    });
  });

  describe("getPluginName", () => {
    it("returns the configured plugin name", () => {
      const ctx = new PluginContextImpl(
        createConfig({ pluginName: "foo-plugin" }),
      );
      expect(ctx.getPluginName()).toBe("foo-plugin");
    });
  });

  describe("emitFile getter", () => {
    it("returns the configured emitFile function", () => {
      const emitFn = vi.fn().mockReturnValue("ref_1");
      const ctx = new PluginContextImpl(createConfig({ emitFile: emitFn }));
      const result = ctx.emitFile({ type: "asset", name: "test.css" });
      expect(emitFn).toHaveBeenCalledWith({ type: "asset", name: "test.css" });
      expect(result).toBe("ref_1");
    });

    it("returns no-op when not configured", () => {
      const ctx = new PluginContextImpl(createConfig());
      expect(ctx.emitFile({ type: "asset", name: "x" })).toBe("");
    });
  });

  describe("getFileName getter", () => {
    it("returns the configured getFileName function", () => {
      const getFn = vi.fn().mockReturnValue("assets/out.css");
      const ctx = new PluginContextImpl(createConfig({ getFileName: getFn }));
      expect(ctx.getFileName("ref_1")).toBe("assets/out.css");
      expect(getFn).toHaveBeenCalledWith("ref_1");
    });

    it("returns empty string when not configured", () => {
      const ctx = new PluginContextImpl(createConfig());
      expect(ctx.getFileName("ref")).toBe("");
    });
  });

  describe("setAssetSource getter", () => {
    it("calls the configured setAssetSource function", () => {
      const setFn = vi.fn();
      const ctx = new PluginContextImpl(
        createConfig({ setAssetSource: setFn }),
      );
      ctx.setAssetSource("ref_1", "new source");
      expect(setFn).toHaveBeenCalledWith("ref_1", "new source");
    });

    it("is no-op when not configured", () => {
      const ctx = new PluginContextImpl(createConfig());
      expect(() => ctx.setAssetSource("ref", "src")).not.toThrow();
    });
  });

  describe("cache getter", () => {
    it("returns custom cache when provided", () => {
      const customCache = createNoOpCache();
      customCache.set("x", 42);
      const ctx = new PluginContextImpl(createConfig({ cache: customCache }));
      expect(ctx.cache.get("x")).toBe(42);
    });

    it("returns default cache when not configured", () => {
      const ctx = new PluginContextImpl(createConfig());
      ctx.cache.set("key", "val");
      expect(ctx.cache.has("key")).toBe(true);
      expect(ctx.cache.get("key")).toBe("val");
    });
  });
});

describe("PluginContextImpl — live graph wiring", () => {
  it("resolve() calls the resolver pipeline and returns a ResolvedId", async () => {
    const resolved = {
      id: "/abs/dep.js",
      external: false,
      moduleSideEffects: true,
      syntheticNamedExports: false,
      meta: {},
      resolvedBy: "test-plugin",
    };
    const resolver = vi.fn().mockResolvedValue(resolved);
    const graph = new InMemoryModuleGraph();
    const ctx = new PluginContextImpl(
      createConfig({ resolver, moduleGraph: graph }),
    );

    const result = await ctx.resolve("./dep", "/abs/entry.js", {
      isEntry: false,
    });
    expect(resolver).toHaveBeenCalledWith("./dep", "/abs/entry.js", {
      isEntry: false,
    });
    expect(result).toEqual(resolved);
  });

  it("load() invokes the loader, stores the result in the graph, and returns it", async () => {
    const graph = new InMemoryModuleGraph();
    const info = createMockModuleInfo("mod.js");
    const loader = vi.fn().mockResolvedValue(info);
    const ctx = new PluginContextImpl(
      createConfig({ loader, moduleGraph: graph }),
    );

    // Module is not yet in the graph
    expect(graph.getModuleInfo("mod.js")).toBeNull();

    const result = await ctx.load({ id: "mod.js" });
    expect(loader).toHaveBeenCalledWith({ id: "mod.js" });
    expect(result).toEqual(info);

    // After load(), the module is present in the live graph
    expect(graph.getModuleInfo("mod.js")).toEqual(info);
  });

  it("load() returns existing graph entry without calling the loader again", async () => {
    const graph = new InMemoryModuleGraph();
    const info = createMockModuleInfo("cached.js");
    graph.addModule("cached.js", info);

    const loader = vi.fn();
    const ctx = new PluginContextImpl(
      createConfig({ loader, moduleGraph: graph }),
    );

    const result = await ctx.load({ id: "cached.js" });
    expect(result).toBe(info);
    expect(loader).not.toHaveBeenCalled();
  });

  it("getModuleInfo() returns live data from the graph", async () => {
    const graph = new InMemoryModuleGraph();
    const loader = vi.fn().mockResolvedValue(createMockModuleInfo("live.js"));
    const ctx = new PluginContextImpl(
      createConfig({ loader, moduleGraph: graph }),
    );

    // Not yet in the graph
    expect(ctx.getModuleInfo("live.js")).toBeNull();

    // Load it via the context
    await ctx.load({ id: "live.js" });

    // Now getModuleInfo returns real data from the live graph
    const info = ctx.getModuleInfo("live.js");
    expect(info).not.toBeNull();
    expect(info!.id).toBe("live.js");
    expect(info!.code).toBe('console.log("live.js")');
  });

  it("getModuleIds() iterates over all modules in the live graph", async () => {
    const graph = new InMemoryModuleGraph();
    const makeLoader = () =>
      vi.fn().mockImplementation(async (opts: { id: string }) => {
        return createMockModuleInfo(opts.id);
      });
    const loader = makeLoader();
    const ctx = new PluginContextImpl(
      createConfig({ loader, moduleGraph: graph }),
    );

    // Load several modules
    await ctx.load({ id: "a.js" });
    await ctx.load({ id: "b.js" });
    await ctx.load({ id: "c.js" });

    const ids = [...ctx.getModuleIds()];
    expect(ids).toEqual(["a.js", "b.js", "c.js"]);
  });

  it("multiple context instances share the same live graph", async () => {
    const graph = new InMemoryModuleGraph();
    const loader = vi
      .fn()
      .mockImplementation(async (opts: { id: string }) =>
        createMockModuleInfo(opts.id),
      );

    const ctx1 = new PluginContextImpl(
      createConfig({ pluginName: "plugin-a", loader, moduleGraph: graph }),
    );
    const ctx2 = new PluginContextImpl(
      createConfig({ pluginName: "plugin-b", loader, moduleGraph: graph }),
    );

    await ctx1.load({ id: "shared.js" });

    // ctx2 sees the module loaded by ctx1
    expect(ctx2.getModuleInfo("shared.js")).not.toBeNull();
    expect([...ctx2.getModuleIds()]).toContain("shared.js");
  });
});

describe("InMemoryModuleGraph", () => {
  it("stores and retrieves modules", () => {
    const graph = new InMemoryModuleGraph();
    const info = createMockModuleInfo("test.js");
    graph.addModule("test.js", info);
    expect(graph.getModuleInfo("test.js")).toBe(info);
  });

  it("returns null for non-existent modules", () => {
    const graph = new InMemoryModuleGraph();
    expect(graph.getModuleInfo("nope")).toBeNull();
  });

  it("reports module existence", () => {
    const graph = new InMemoryModuleGraph();
    graph.addModule("x.js", createMockModuleInfo("x.js"));
    expect(graph.hasModule("x.js")).toBe(true);
    expect(graph.hasModule("y.js")).toBe(false);
  });

  it("iterates module IDs", () => {
    const graph = new InMemoryModuleGraph();
    graph.addModule("a.js", createMockModuleInfo("a.js"));
    graph.addModule("b.js", createMockModuleInfo("b.js"));
    expect([...graph.getModuleIds()]).toEqual(["a.js", "b.js"]);
  });

  it("reports size", () => {
    const graph = new InMemoryModuleGraph();
    expect(graph.size()).toBe(0);
    graph.addModule("a.js", createMockModuleInfo("a.js"));
    expect(graph.size()).toBe(1);
  });
});

describe("createNoOpCache", () => {
  it("stores and retrieves values", () => {
    const cache = createNoOpCache();
    cache.set("key", 42);
    expect(cache.has("key")).toBe(true);
    expect(cache.get("key")).toBe(42);
  });

  it("deletes values", () => {
    const cache = createNoOpCache();
    cache.set("k", "v");
    expect(cache.delete("k")).toBe(true);
    expect(cache.has("k")).toBe(false);
  });

  it("returns false for deleting non-existent key", () => {
    const cache = createNoOpCache();
    expect(cache.delete("x")).toBe(false);
  });

  it("returns undefined for non-existent key get", () => {
    const cache = createNoOpCache();
    expect(cache.get("missing")).toBeUndefined();
  });
});
