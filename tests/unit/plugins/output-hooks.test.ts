/**
 * @module tests/unit/plugins/output-hooks
 * @description Unit tests for the output generation phase hook executor.
 */

import { describe, it, expect } from "bun:test";
import { vi } from "../../vi-compat.js";
import type {
  Plugin,
  NormalizedOutputOptions,
  NormalizedInputOptions,
  OutputBundle,
  RenderedChunk,
} from "../../../src/types.js";
import { PluginDriver } from "../../../src/plugins/driver.js";
import {
  OutputHookExecutor,
  OUTPUT_HOOKS,
} from "../../../src/plugins/output-hooks.js";
import type {
  RenderDynamicImportOptions,
  ResolveFileUrlOptions,
  ResolveImportMetaOptions,
} from "../../../src/plugins/output-hooks.js";

// Helper: create a minimal plugin with specified hooks
const makePlugin = (
  name: string,
  hooks: Record<string, unknown> = {},
): Plugin => {
  return { name, ...hooks } as unknown as Plugin;
};

// Suppress warnings during tests
const noopWarning = (): void => undefined;

// Minimal NormalizedOutputOptions for testing
const makeOutputOptions = (): NormalizedOutputOptions => {
  return {
    amd: {
      autoId: false,
      basePath: "",
      define: "define",
      forceJsExtensionForImports: false,
      id: undefined,
    },
    assetFileNames: "assets/[name]-[hash][extname]",
    banner: () => "",
    chunkFileNames: "[name]-[hash].js",
    compact: false,
    dir: "dist",
    dynamicImportInCjs: true,
    entryFileNames: "[name].js",
    esModule: true,
    experimentalMinChunkSize: 1,
    exports: "auto",
    extend: false,
    externalImportAttributes: true,
    externalLiveBindings: true,
    file: undefined,
    footer: () => "",
    format: "es",
    freeze: true,
    generatedCode: {
      arrowFunctions: false,
      constBindings: false,
      objectShorthand: false,
      reservedNamesAsProps: true,
      symbols: false,
    },
    globals: {},
    hashCharacters: "base64",
    hoistTransitiveImports: true,
    indent: true,
    inlineDynamicImports: false,
    interop: () => "default",
    intro: () => "",
    manualChunks: {},
    minifyInternalExports: true,
    name: undefined,
    noConflict: false,
    outro: () => "",
    paths: {},
    plugins: [],
    preserveModules: false,
    preserveModulesRoot: undefined,
    sanitizeFileName: (f: string) => f,
    sourcemap: false,
    sourcemapBaseUrl: undefined,
    sourcemapDebugIds: false,
    sourcemapExcludeSources: false,
    sourcemapFile: undefined,
    sourcemapFileNames: undefined,
    sourcemapIgnoreList: () => false,
    sourcemapPathTransform: undefined,
    strict: true,
    systemNullSetters: true,
    validate: false,
    virtualDirname: "",
  } as unknown as NormalizedOutputOptions;
};

// Minimal NormalizedInputOptions for testing
const makeInputOptions = (): NormalizedInputOptions => {
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

// Minimal RenderedChunk for testing
const makeRenderedChunk = (name: string = "index"): RenderedChunk => {
  return {
    dynamicImports: [],
    exports: [],
    facadeModuleId: null,
    fileName: `${name}.js`,
    implicitlyLoadedBefore: [],
    importedBindings: {},
    imports: [],
    isDynamicEntry: false,
    isEntry: true,
    isImplicitEntry: false,
    moduleIds: ["./src/index.ts"],
    modules: {},
    name,
    referencedFiles: [],
    type: "chunk",
  } as RenderedChunk;
};

// Minimal OutputBundle for testing
const makeBundle = (): OutputBundle => {
  return {} as OutputBundle;
};

// ============================================================
// OUTPUT_HOOKS Definition Tests
// ============================================================

describe("OUTPUT_HOOKS", () => {
  it("should define exactly 14 output hooks", () => {
    const hookNames = Object.keys(OUTPUT_HOOKS);
    expect(hookNames).toHaveLength(14);
  });

  it("should define renderStart as parallel/async", () => {
    expect(OUTPUT_HOOKS["renderStart"]).toEqual({
      strategy: "parallel",
      async: true,
    });
  });

  it("should define banner as sequential/async", () => {
    expect(OUTPUT_HOOKS["banner"]).toEqual({
      strategy: "sequential",
      async: true,
    });
  });

  it("should define footer as sequential/async", () => {
    expect(OUTPUT_HOOKS["footer"]).toEqual({
      strategy: "sequential",
      async: true,
    });
  });

  it("should define intro as sequential/async", () => {
    expect(OUTPUT_HOOKS["intro"]).toEqual({
      strategy: "sequential",
      async: true,
    });
  });

  it("should define outro as sequential/async", () => {
    expect(OUTPUT_HOOKS["outro"]).toEqual({
      strategy: "sequential",
      async: true,
    });
  });

  it("should define renderDynamicImport as first/async", () => {
    expect(OUTPUT_HOOKS["renderDynamicImport"]).toEqual({
      strategy: "first",
      async: true,
    });
  });

  it("should define augmentChunkHash as sequential/async", () => {
    expect(OUTPUT_HOOKS["augmentChunkHash"]).toEqual({
      strategy: "sequential",
      async: true,
    });
  });

  it("should define resolveFileUrl as first/async", () => {
    expect(OUTPUT_HOOKS["resolveFileUrl"]).toEqual({
      strategy: "first",
      async: true,
    });
  });

  it("should define resolveImportMeta as first/async", () => {
    expect(OUTPUT_HOOKS["resolveImportMeta"]).toEqual({
      strategy: "first",
      async: true,
    });
  });

  it("should define renderChunk as sequential/async", () => {
    expect(OUTPUT_HOOKS["renderChunk"]).toEqual({
      strategy: "sequential",
      async: true,
    });
  });

  it("should define generateBundle as sequential/async", () => {
    expect(OUTPUT_HOOKS["generateBundle"]).toEqual({
      strategy: "sequential",
      async: true,
    });
  });

  it("should define writeBundle as parallel/async", () => {
    expect(OUTPUT_HOOKS["writeBundle"]).toEqual({
      strategy: "parallel",
      async: true,
    });
  });

  it("should define closeBundle as parallel/async", () => {
    expect(OUTPUT_HOOKS["closeBundle"]).toEqual({
      strategy: "parallel",
      async: true,
    });
  });

  it("should define renderError as parallel/async", () => {
    expect(OUTPUT_HOOKS["renderError"]).toEqual({
      strategy: "parallel",
      async: true,
    });
  });
});

// ============================================================
// OutputHookExecutor Tests
// ============================================================

describe("OutputHookExecutor", () => {
  describe("constructor", () => {
    it("should store the plugin driver", () => {
      const driver = new PluginDriver([], noopWarning);
      const executor = new OutputHookExecutor(driver);
      expect(executor.getDriver()).toBe(driver);
    });
  });

  // ============================================================
  // renderStart
  // ============================================================

  describe("renderStart", () => {
    it("should fire all plugins in parallel", async () => {
      const calls: Array<string> = [];
      const p1 = makePlugin("p1", {
        renderStart: vi.fn(() => {
          calls.push("p1");
        }),
      });
      const p2 = makePlugin("p2", {
        renderStart: vi.fn(() => {
          calls.push("p2");
        }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.renderStart(makeOutputOptions(), makeInputOptions());

      expect(calls).toContain("p1");
      expect(calls).toContain("p2");
    });

    it("should pass output and input options to plugins", async () => {
      const hookFn = vi.fn();
      const p1 = makePlugin("p1", { renderStart: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);
      const outOpts = makeOutputOptions();
      const inOpts = makeInputOptions();

      await executor.renderStart(outOpts, inOpts);

      expect(hookFn).toHaveBeenCalledWith(outOpts, inOpts);
    });

    it("should handle plugins without renderStart hook", async () => {
      const p1 = makePlugin("p1", {});
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await expect(
        executor.renderStart(makeOutputOptions(), makeInputOptions()),
      ).resolves.toBeUndefined();
    });

    it("should handle async renderStart hooks", async () => {
      const hookFn = vi.fn(async () => {
        await Promise.resolve();
      });
      const p1 = makePlugin("p1", { renderStart: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.renderStart(makeOutputOptions(), makeInputOptions());

      expect(hookFn).toHaveBeenCalled();
    });
  });

  // ============================================================
  // banner
  // ============================================================

  describe("banner", () => {
    it("should collect and concatenate banner strings", async () => {
      const p1 = makePlugin("p1", { banner: () => "/* banner1 */" });
      const p2 = makePlugin("p2", { banner: () => "/* banner2 */" });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.banner(makeRenderedChunk());

      expect(result).toBe("/* banner1 */\n/* banner2 */");
    });

    it("should return empty string when no plugins provide banner", async () => {
      const p1 = makePlugin("p1", {});
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.banner(makeRenderedChunk());

      expect(result).toBe("");
    });

    it("should filter out falsy banner values", async () => {
      const p1 = makePlugin("p1", { banner: () => "/* banner */" });
      const p2 = makePlugin("p2", { banner: () => "" });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.banner(makeRenderedChunk());

      expect(result).toBe("/* banner */");
    });

    it("should handle async banner hooks", async () => {
      const p1 = makePlugin("p1", {
        banner: async () => "/* async banner */",
      });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.banner(makeRenderedChunk());

      expect(result).toBe("/* async banner */");
    });

    it("should pass chunk to banner hooks", async () => {
      const hookFn = vi.fn(() => "/* b */");
      const p1 = makePlugin("p1", { banner: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);
      const chunk = makeRenderedChunk("myChunk");

      await executor.banner(chunk);

      expect(hookFn).toHaveBeenCalledWith(chunk);
    });
  });

  // ============================================================
  // footer
  // ============================================================

  describe("footer", () => {
    it("should collect and concatenate footer strings", async () => {
      const p1 = makePlugin("p1", { footer: () => "/* footer1 */" });
      const p2 = makePlugin("p2", { footer: () => "/* footer2 */" });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.footer(makeRenderedChunk());

      expect(result).toBe("/* footer1 */\n/* footer2 */");
    });

    it("should return empty string when no plugins provide footer", async () => {
      const driver = new PluginDriver([], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.footer(makeRenderedChunk());

      expect(result).toBe("");
    });

    it("should filter out falsy footer values", async () => {
      const p1 = makePlugin("p1", { footer: () => "" });
      const p2 = makePlugin("p2", { footer: () => "/* end */" });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.footer(makeRenderedChunk());

      expect(result).toBe("/* end */");
    });

    it("should handle async footer hooks", async () => {
      const p1 = makePlugin("p1", {
        footer: async () => "/* async footer */",
      });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.footer(makeRenderedChunk());

      expect(result).toBe("/* async footer */");
    });
  });

  // ============================================================
  // intro
  // ============================================================

  describe("intro", () => {
    it("should collect and concatenate intro strings", async () => {
      const p1 = makePlugin("p1", { intro: () => "// intro1" });
      const p2 = makePlugin("p2", { intro: () => "// intro2" });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.intro(makeRenderedChunk());

      expect(result).toBe("// intro1\n// intro2");
    });

    it("should return empty string when no plugins provide intro", async () => {
      const driver = new PluginDriver([], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.intro(makeRenderedChunk());

      expect(result).toBe("");
    });

    it("should filter out falsy intro values", async () => {
      const p1 = makePlugin("p1", { intro: () => "" });
      const p2 = makePlugin("p2", { intro: () => "// intro" });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.intro(makeRenderedChunk());

      expect(result).toBe("// intro");
    });

    it("should handle async intro hooks", async () => {
      const p1 = makePlugin("p1", { intro: async () => "// async intro" });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.intro(makeRenderedChunk());

      expect(result).toBe("// async intro");
    });
  });

  // ============================================================
  // outro
  // ============================================================

  describe("outro", () => {
    it("should collect and concatenate outro strings", async () => {
      const p1 = makePlugin("p1", { outro: () => "// outro1" });
      const p2 = makePlugin("p2", { outro: () => "// outro2" });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.outro(makeRenderedChunk());

      expect(result).toBe("// outro1\n// outro2");
    });

    it("should return empty string when no plugins provide outro", async () => {
      const driver = new PluginDriver([], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.outro(makeRenderedChunk());

      expect(result).toBe("");
    });

    it("should filter out falsy outro values", async () => {
      const p1 = makePlugin("p1", { outro: () => "// end" });
      const p2 = makePlugin("p2", { outro: () => "" });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.outro(makeRenderedChunk());

      expect(result).toBe("// end");
    });

    it("should handle async outro hooks", async () => {
      const p1 = makePlugin("p1", { outro: async () => "// async outro" });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.outro(makeRenderedChunk());

      expect(result).toBe("// async outro");
    });
  });

  // ============================================================
  // renderDynamicImport
  // ============================================================

  describe("renderDynamicImport", () => {
    it("should return first non-null result", async () => {
      const p1 = makePlugin("p1", {
        renderDynamicImport: () => ({ left: "import(", right: ")" }),
      });
      const p2 = makePlugin("p2", {
        renderDynamicImport: () => ({
          left: "require(",
          right: ")",
        }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderDynamicImport({
        customResolution: null,
        format: "es",
        moduleId: "./foo.js",
        targetModuleId: "./bar.js",
      });

      expect(result).toEqual({ left: "import(", right: ")" });
    });

    it("should return null when no plugin provides result", async () => {
      const p1 = makePlugin("p1", { renderDynamicImport: () => null });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderDynamicImport({
        customResolution: null,
        format: "es",
        moduleId: "./foo.js",
        targetModuleId: null,
      });

      expect(result).toBeNull();
    });

    it("should skip plugins without renderDynamicImport", async () => {
      const p1 = makePlugin("p1", {});
      const p2 = makePlugin("p2", {
        renderDynamicImport: () => ({ left: "import(", right: ")" }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderDynamicImport({
        customResolution: null,
        format: "cjs",
        moduleId: "./x.js",
        targetModuleId: "./y.js",
      });

      expect(result).toEqual({ left: "import(", right: ")" });
    });
  });

  // ============================================================
  // augmentChunkHash
  // ============================================================

  describe("augmentChunkHash", () => {
    it("should concatenate hash augmentations from all plugins", async () => {
      const p1 = makePlugin("p1", { augmentChunkHash: () => "abc" });
      const p2 = makePlugin("p2", { augmentChunkHash: () => "def" });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.augmentChunkHash(makeRenderedChunk());

      expect(result).toBe("abcdef");
    });

    it("should return empty string when no plugins augment hash", async () => {
      const driver = new PluginDriver([], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.augmentChunkHash(makeRenderedChunk());

      expect(result).toBe("");
    });

    it("should filter out falsy augment values", async () => {
      const p1 = makePlugin("p1", { augmentChunkHash: () => "hash" });
      const p2 = makePlugin("p2", { augmentChunkHash: () => "" });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.augmentChunkHash(makeRenderedChunk());

      expect(result).toBe("hash");
    });

    it("should handle async augmentChunkHash hooks", async () => {
      const p1 = makePlugin("p1", {
        augmentChunkHash: async () => "async-hash",
      });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.augmentChunkHash(makeRenderedChunk());

      expect(result).toBe("async-hash");
    });
  });

  // ============================================================
  // resolveFileUrl
  // ============================================================

  describe("resolveFileUrl", () => {
    it("should return first non-null file URL", async () => {
      const p1 = makePlugin("p1", {
        resolveFileUrl: () => "new URL('./file.js', import.meta.url).href",
      });
      const p2 = makePlugin("p2", {
        resolveFileUrl: () => "'/static/file.js'",
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.resolveFileUrl({
        chunkId: "chunk1",
        fileName: "file.js",
        format: "es",
        moduleId: "./src/index.js",
        referenceId: "ref1",
        relativePath: "../file.js",
      });

      expect(result).toBe("new URL('./file.js', import.meta.url).href");
    });

    it("should return null when no plugin resolves", async () => {
      const p1 = makePlugin("p1", { resolveFileUrl: () => null });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.resolveFileUrl({
        chunkId: "chunk1",
        fileName: "file.js",
        format: "es",
        moduleId: "./src/index.js",
        referenceId: "ref1",
        relativePath: "../file.js",
      });

      expect(result).toBeNull();
    });

    it("should skip plugins without resolveFileUrl", async () => {
      const p1 = makePlugin("p1", {});
      const p2 = makePlugin("p2", {
        resolveFileUrl: () => "'resolved.js'",
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.resolveFileUrl({
        chunkId: "c1",
        fileName: "f.js",
        format: "es",
        moduleId: "./m.js",
        referenceId: "r1",
        relativePath: "./f.js",
      });

      expect(result).toBe("'resolved.js'");
    });
  });

  // ============================================================
  // resolveImportMeta
  // ============================================================

  describe("resolveImportMeta", () => {
    it("should return first non-null import.meta resolution", async () => {
      const p1 = makePlugin("p1", {
        resolveImportMeta: () => "document.baseURI",
      });
      const p2 = makePlugin("p2", {
        resolveImportMeta: () => "window.location.href",
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.resolveImportMeta("url", {
        chunkId: "chunk1",
        format: "es",
        moduleId: "./src/index.js",
      });

      expect(result).toBe("document.baseURI");
    });

    it("should return null when no plugin resolves import.meta", async () => {
      const p1 = makePlugin("p1", { resolveImportMeta: () => null });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.resolveImportMeta("url", {
        chunkId: "chunk1",
        format: "es",
        moduleId: "./src/index.js",
      });

      expect(result).toBeNull();
    });

    it("should pass property and options to hook", async () => {
      const hookFn = vi.fn(() => "'meta-value'");
      const p1 = makePlugin("p1", { resolveImportMeta: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);
      const opts: ResolveImportMetaOptions = {
        chunkId: "c1",
        format: "es",
        moduleId: "./m.js",
      };

      await executor.resolveImportMeta("url", opts);

      expect(hookFn).toHaveBeenCalledWith("url", opts);
    });

    it("should handle null property", async () => {
      const hookFn = vi.fn(() => "Object.create(null)");
      const p1 = makePlugin("p1", { resolveImportMeta: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.resolveImportMeta(null, {
        chunkId: "c1",
        format: "es",
        moduleId: "./m.js",
      });

      expect(result).toBe("Object.create(null)");
      expect(hookFn).toHaveBeenCalledWith(null, expect.objectContaining({}));
    });
  });

  // ============================================================
  // renderChunk
  // ============================================================

  describe("renderChunk", () => {
    it("should chain renderChunk sequentially through plugins", async () => {
      const p1 = makePlugin("p1", {
        renderChunk: (code: string) => ({ code: code + "\n// p1" }),
      });
      const p2 = makePlugin("p2", {
        renderChunk: (code: string) => ({ code: code + "\n// p2" }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderChunk(
        "const x = 1;",
        makeRenderedChunk(),
        makeOutputOptions(),
      );

      expect(result.code).toBe("const x = 1;\n// p1\n// p2");
    });

    it("should handle string return from renderChunk", async () => {
      const p1 = makePlugin("p1", {
        renderChunk: (code: string) => code + "\n// modified",
      });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderChunk(
        "const x = 1;",
        makeRenderedChunk(),
        makeOutputOptions(),
      );

      expect(result.code).toBe("const x = 1;\n// modified");
      expect(result.map).toBeUndefined();
    });

    it("should preserve source map from renderChunk", async () => {
      const mockMap = {
        mappings: "AAAA",
        names: [],
        sources: [],
        version: 3 as const,
      };
      const p1 = makePlugin("p1", {
        renderChunk: () => ({ code: "transformed", map: mockMap }),
      });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderChunk(
        "original",
        makeRenderedChunk(),
        makeOutputOptions(),
      );

      expect(result.code).toBe("transformed");
      expect(result.map).toEqual(mockMap);
    });

    it("should skip null results in renderChunk chain", async () => {
      const p1 = makePlugin("p1", { renderChunk: () => null });
      const p2 = makePlugin("p2", {
        renderChunk: (code: string) => ({ code: code + "\n// p2" }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderChunk(
        "const x = 1;",
        makeRenderedChunk(),
        makeOutputOptions(),
      );

      expect(result.code).toBe("const x = 1;\n// p2");
    });

    it("should return original code when no plugins modify", async () => {
      const driver = new PluginDriver([], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderChunk(
        "const x = 1;",
        makeRenderedChunk(),
        makeOutputOptions(),
      );

      expect(result.code).toBe("const x = 1;");
      expect(result.map).toBeUndefined();
    });

    it("should pass chunk and options to renderChunk", async () => {
      const hookFn = vi.fn(() => null);
      const p1 = makePlugin("p1", { renderChunk: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);
      const chunk = makeRenderedChunk("test");
      const opts = makeOutputOptions();

      await executor.renderChunk("code", chunk, opts);

      expect(hookFn).toHaveBeenCalledWith("code", chunk, opts);
    });

    it("should handle undefined result from renderChunk", async () => {
      const p1 = makePlugin("p1", { renderChunk: () => undefined });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderChunk(
        "const x = 1;",
        makeRenderedChunk(),
        makeOutputOptions(),
      );

      expect(result.code).toBe("const x = 1;");
    });

    it("should carry map forward when code-only object returned", async () => {
      const mockMap = {
        mappings: "BBBB",
        names: [],
        sources: [],
        version: 3 as const,
      };
      const p1 = makePlugin("p1", {
        renderChunk: () => ({ code: "step1", map: mockMap }),
      });
      const p2 = makePlugin("p2", {
        renderChunk: (code: string) => ({ code: code + "+step2" }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderChunk(
        "original",
        makeRenderedChunk(),
        makeOutputOptions(),
      );

      expect(result.code).toBe("step1+step2");
      expect(result.map).toEqual(mockMap);
    });

    it("should handle ObjectHook with handler and order", async () => {
      const p1 = makePlugin("p1", {
        renderChunk: {
          order: "post",
          handler: (code: string) => ({ code: code + "\n// post" }),
        },
      });
      const p2 = makePlugin("p2", {
        renderChunk: {
          order: "pre",
          handler: (code: string) => ({ code: code + "\n// pre" }),
        },
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderChunk(
        "start",
        makeRenderedChunk(),
        makeOutputOptions(),
      );

      expect(result.code).toBe("start\n// pre\n// post");
    });

    it("should skip plugins without renderChunk hook in chain", async () => {
      const p1 = makePlugin("p1", {});
      const p2 = makePlugin("p2", {
        renderChunk: (code: string) => ({ code: code + "\n// p2" }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderChunk(
        "start",
        makeRenderedChunk(),
        makeOutputOptions(),
      );

      expect(result.code).toBe("start\n// p2");
    });

    it("should skip non-function renderChunk values", async () => {
      const p1 = makePlugin("p1", { renderChunk: "not-a-function" });
      const p2 = makePlugin("p2", {
        renderChunk: (code: string) => ({ code: code + "\n// p2" }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.renderChunk(
        "start",
        makeRenderedChunk(),
        makeOutputOptions(),
      );

      expect(result.code).toBe("start\n// p2");
    });
  });

  // ============================================================
  // generateBundle
  // ============================================================

  describe("generateBundle", () => {
    it("should call all plugins sequentially with bundle", async () => {
      const calls: Array<string> = [];
      const p1 = makePlugin("p1", {
        generateBundle: vi.fn(() => {
          calls.push("p1");
        }),
      });
      const p2 = makePlugin("p2", {
        generateBundle: vi.fn(() => {
          calls.push("p2");
        }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.generateBundle(makeOutputOptions(), makeBundle(), true);

      expect(calls).toEqual(["p1", "p2"]);
    });

    it("should pass options, bundle, and isWrite to hook", async () => {
      const hookFn = vi.fn();
      const p1 = makePlugin("p1", { generateBundle: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);
      const opts = makeOutputOptions();
      const bundle = makeBundle();

      await executor.generateBundle(opts, bundle, false);

      expect(hookFn).toHaveBeenCalledWith(opts, bundle, false);
    });

    it("should handle plugins without generateBundle", async () => {
      const p1 = makePlugin("p1", {});
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await expect(
        executor.generateBundle(makeOutputOptions(), makeBundle(), true),
      ).resolves.toBeUndefined();
    });

    it("should handle async generateBundle hooks", async () => {
      const hookFn = vi.fn(async () => {
        await Promise.resolve();
      });
      const p1 = makePlugin("p1", { generateBundle: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.generateBundle(makeOutputOptions(), makeBundle(), true);

      expect(hookFn).toHaveBeenCalled();
    });
  });

  // ============================================================
  // writeBundle
  // ============================================================

  describe("writeBundle", () => {
    it("should fire all plugins in parallel", async () => {
      const calls: Array<string> = [];
      const p1 = makePlugin("p1", {
        writeBundle: vi.fn(() => {
          calls.push("p1");
        }),
      });
      const p2 = makePlugin("p2", {
        writeBundle: vi.fn(() => {
          calls.push("p2");
        }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.writeBundle(makeOutputOptions(), makeBundle());

      expect(calls).toContain("p1");
      expect(calls).toContain("p2");
    });

    it("should pass options and bundle to plugins", async () => {
      const hookFn = vi.fn();
      const p1 = makePlugin("p1", { writeBundle: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);
      const opts = makeOutputOptions();
      const bundle = makeBundle();

      await executor.writeBundle(opts, bundle);

      expect(hookFn).toHaveBeenCalledWith(opts, bundle);
    });

    it("should handle plugins without writeBundle", async () => {
      const p1 = makePlugin("p1", {});
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await expect(
        executor.writeBundle(makeOutputOptions(), makeBundle()),
      ).resolves.toBeUndefined();
    });

    it("should handle async writeBundle hooks", async () => {
      const hookFn = vi.fn(async () => {
        await Promise.resolve();
      });
      const p1 = makePlugin("p1", { writeBundle: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.writeBundle(makeOutputOptions(), makeBundle());

      expect(hookFn).toHaveBeenCalled();
    });
  });

  // ============================================================
  // closeBundle
  // ============================================================

  describe("closeBundle", () => {
    it("should fire all plugins in parallel", async () => {
      const calls: Array<string> = [];
      const p1 = makePlugin("p1", {
        closeBundle: vi.fn(() => {
          calls.push("p1");
        }),
      });
      const p2 = makePlugin("p2", {
        closeBundle: vi.fn(() => {
          calls.push("p2");
        }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.closeBundle();

      expect(calls).toContain("p1");
      expect(calls).toContain("p2");
    });

    it("should handle plugins without closeBundle", async () => {
      const p1 = makePlugin("p1", {});
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await expect(executor.closeBundle()).resolves.toBeUndefined();
    });

    it("should handle async closeBundle hooks", async () => {
      const hookFn = vi.fn(async () => {
        await Promise.resolve();
      });
      const p1 = makePlugin("p1", { closeBundle: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.closeBundle();

      expect(hookFn).toHaveBeenCalled();
    });

    it("should call hooks with no arguments", async () => {
      const hookFn = vi.fn();
      const p1 = makePlugin("p1", { closeBundle: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.closeBundle();

      expect(hookFn).toHaveBeenCalledWith();
    });
  });

  // ============================================================
  // renderError
  // ============================================================

  describe("renderError", () => {
    it("should fire all plugins in parallel", async () => {
      const calls: Array<string> = [];
      const p1 = makePlugin("p1", {
        renderError: vi.fn(() => {
          calls.push("p1");
        }),
      });
      const p2 = makePlugin("p2", {
        renderError: vi.fn(() => {
          calls.push("p2");
        }),
      });
      const driver = new PluginDriver([p1, p2], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.renderError(new Error("test error"));

      expect(calls).toContain("p1");
      expect(calls).toContain("p2");
    });

    it("should pass error to plugins", async () => {
      const hookFn = vi.fn();
      const p1 = makePlugin("p1", { renderError: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);
      const error = new Error("render failed");

      await executor.renderError(error);

      expect(hookFn).toHaveBeenCalledWith(error);
    });

    it("should handle undefined error", async () => {
      const hookFn = vi.fn();
      const p1 = makePlugin("p1", { renderError: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.renderError(undefined);

      expect(hookFn).toHaveBeenCalledWith(undefined);
    });

    it("should handle plugins without renderError", async () => {
      const p1 = makePlugin("p1", {});
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await expect(
        executor.renderError(new Error("test")),
      ).resolves.toBeUndefined();
    });

    it("should handle async renderError hooks", async () => {
      const hookFn = vi.fn(async () => {
        await Promise.resolve();
      });
      const p1 = makePlugin("p1", { renderError: hookFn });
      const driver = new PluginDriver([p1], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.renderError(new Error("async error"));

      expect(hookFn).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Hook ordering (pre/post) integration
  // ============================================================

  describe("hook ordering", () => {
    it("should respect pre/post ordering for banner", async () => {
      const p1 = makePlugin("p1", {
        banner: { order: "post", handler: () => "/* post */" },
      });
      const p2 = makePlugin("p2", {
        banner: { order: "pre", handler: () => "/* pre */" },
      });
      const p3 = makePlugin("p3", { banner: () => "/* normal */" });
      const driver = new PluginDriver([p1, p2, p3], noopWarning);
      const executor = new OutputHookExecutor(driver);

      const result = await executor.banner(makeRenderedChunk());

      expect(result).toBe("/* pre */\n/* normal */\n/* post */");
    });

    it("should respect pre/post ordering for generateBundle", async () => {
      const calls: Array<string> = [];
      const p1 = makePlugin("p1", {
        generateBundle: { order: "post", handler: () => calls.push("post") },
      });
      const p2 = makePlugin("p2", {
        generateBundle: { order: "pre", handler: () => calls.push("pre") },
      });
      const p3 = makePlugin("p3", {
        generateBundle: () => calls.push("normal"),
      });
      const driver = new PluginDriver([p1, p2, p3], noopWarning);
      const executor = new OutputHookExecutor(driver);

      await executor.generateBundle(makeOutputOptions(), makeBundle(), true);

      expect(calls).toEqual(["pre", "normal", "post"]);
    });
  });
});
