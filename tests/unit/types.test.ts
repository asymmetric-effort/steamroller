/**
 * @module tests/unit/types
 * @description Tests for the complete type system. Since this is a type-only
 * module, tests verify that types compile correctly, key type relationships
 * hold, and discriminated unions work as expected.
 */
import { describe, it, expect } from "bun:test";
import type {
  MaybeArray,
  MaybePromise,
  PartialNull,
  NullValue,
  LogLevel,
  RollupLog,
  LogHandler,
  LogOrStringHandler,
  SourceMapSegment,
  ExistingDecodedSourceMap,
  ExistingRawSourceMap,
  SourceMapInput,
  ModuleFormat,
  InteropType,
  ModuleInfo,
  ResolvedId,
  LoadResult,
  TransformResult,
  RollupAstNode,
  ProgramNode,
  EmittedAsset,
  EmittedChunk,
  EmittedPrebuiltChunk,
  EmittedFile,
  PreserveEntrySignaturesOption,
  HashCharacters,
  ObjectHook,
  HookFilter,
  StringFilter,
  PluginCache,
  RenderedModule,
  PreRenderedChunk,
  RenderedChunk,
  OutputChunk,
  PreRenderedAsset,
  OutputAsset,
  OutputBundle,
  InputOptions,
  InputOption,
  ExternalOption,
  InputPluginOption,
  TreeshakingPreset,
  TreeshakingOptions,
  ModuleSideEffectsOption,
  HasModuleSideEffects,
  OutputOptions,
  GeneratedCodePreset,
  GeneratedCodeOptions,
  GlobalsOption,
  ManualChunksOption,
  OptionsPaths,
  SourcemapIgnoreListOption,
  SourcemapPathTransformOption,
  OutputPluginOption,
  AmdOptions,
  RollupOptions,
  RollupOutput,
  RollupBuild,
  RollupCache,
  ModuleJSON,
  SerializedTimings,
  ChangeEvent,
  RollupWatcherEvent,
  RollupWatcher,
  WatcherOptions,
  Plugin,
  OutputPlugin,
  ResolveIdResult,
  MinimalPluginContext,
  PluginContext,
  TransformPluginContext,
  NormalizedInputOptions,
  NormalizedTreeshakingOptions,
  NormalizedOutputOptions,
  NormalizedAmdOptions,
  NormalizedGeneratedCodeOptions,
  BufferEncoding,
  RollupFileStats,
  RollupDirectoryEntry,
  RollupFsModule,
} from "../../src/types.js";

// ============================================================
// Helper: compile-time type assertion
// ============================================================
/**
 * Asserts at compile time that T is assignable to U and vice versa.
 * The runtime call is a no-op; the value is only used to anchor the
 * generic so TypeScript actually checks the constraint.
 */
const assertType = <T>(_value: T): void => {
  /* intentionally empty - compile-time only */
};

describe("types", () => {
  // ==========================================================
  // Utility Types
  // ==========================================================
  describe("utility types", () => {
    it("MaybeArray accepts a single value", () => {
      const single: MaybeArray<number> = 42;
      assertType<MaybeArray<number>>(single);
      expect(single).toBe(42);
    });

    it("MaybeArray accepts a readonly array", () => {
      const arr: MaybeArray<number> = [1, 2, 3] as const;
      assertType<MaybeArray<number>>(arr);
      expect(Array.isArray(arr)).toBe(true);
    });

    it("MaybePromise accepts a plain value", () => {
      const plain: MaybePromise<string> = "hello";
      assertType<MaybePromise<string>>(plain);
      expect(plain).toBe("hello");
    });

    it("MaybePromise accepts a Promise", () => {
      const promised: MaybePromise<string> = Promise.resolve("hello");
      assertType<MaybePromise<string>>(promised);
      expect(promised).toBeInstanceOf(Promise);
    });

    it("PartialNull makes all properties nullable", () => {
      interface Sample {
        readonly a: number;
        readonly b: string;
      }
      const partial: PartialNull<Sample> = { a: null, b: "test" };
      assertType<PartialNull<Sample>>(partial);
      expect(partial.a).toBeNull();
      expect(partial.b).toBe("test");
    });

    it("NullValue accepts null, undefined, and void", () => {
      const n: NullValue = null;
      const u: NullValue = undefined;
      assertType<NullValue>(n);
      assertType<NullValue>(u);
      expect(n).toBeNull();
      expect(u).toBeUndefined();
    });
  });

  // ==========================================================
  // Log Types
  // ==========================================================
  describe("log types", () => {
    it("LogLevel accepts valid levels", () => {
      const levels: ReadonlyArray<LogLevel> = ["warn", "info", "debug"];
      expect(levels).toHaveLength(3);
    });

    it("RollupLog has required message and optional fields", () => {
      const log: RollupLog = {
        message: "test warning",
        code: "UNUSED_IMPORT",
        id: "/src/foo.ts",
        pos: 42,
        loc: { file: "/src/foo.ts", line: 3, column: 7 },
        frame: '  import { unused } from "bar";',
        stack: "Error: test",
        plugin: "test-plugin",
        pluginCode: "CUSTOM",
        url: "https://example.com",
        exporter: "bar",
        reexporter: "baz",
      };
      assertType<RollupLog>(log);
      expect(log.message).toBe("test warning");
      expect(log.loc?.line).toBe(3);
    });

    it("RollupLog accepts arbitrary extra properties", () => {
      const log: RollupLog = {
        message: "custom",
        customField: 123,
        anotherField: { nested: true },
      };
      assertType<RollupLog>(log);
      expect(log.customField).toBe(123);
    });

    it("RollupLog minimal form with only message", () => {
      const log: RollupLog = { message: "minimal" };
      assertType<RollupLog>(log);
      expect(log.code).toBeUndefined();
    });

    it("LogHandler matches expected signature", () => {
      const handler: LogHandler = (level, log) => {
        assertType<LogLevel>(level);
        assertType<RollupLog>(log);
      };
      handler("warn", { message: "test" });
      expect(true).toBe(true);
    });

    it("LogOrStringHandler accepts error level and strings", () => {
      const handler: LogOrStringHandler = (_level, _log) => {
        /* no-op */
      };
      handler("error", "string message");
      handler("warn", { message: "log object" });
      expect(true).toBe(true);
    });
  });

  // ==========================================================
  // Source Map Types
  // ==========================================================
  describe("source map types", () => {
    it("SourceMapSegment accepts 1-element tuple", () => {
      const seg: SourceMapSegment = [0] as const;
      assertType<SourceMapSegment>(seg);
      expect(seg).toHaveLength(1);
    });

    it("SourceMapSegment accepts 4-element tuple", () => {
      const seg: SourceMapSegment = [0, 1, 2, 3] as const;
      assertType<SourceMapSegment>(seg);
      expect(seg).toHaveLength(4);
    });

    it("SourceMapSegment accepts 5-element tuple", () => {
      const seg: SourceMapSegment = [0, 1, 2, 3, 4] as const;
      assertType<SourceMapSegment>(seg);
      expect(seg).toHaveLength(5);
    });

    it("ExistingDecodedSourceMap has version 3", () => {
      const map: ExistingDecodedSourceMap = {
        mappings: [[[0, 1, 2, 3]]],
        names: ["foo"],
        sources: ["input.ts"],
        version: 3,
      };
      assertType<ExistingDecodedSourceMap>(map);
      expect(map.version).toBe(3);
    });

    it("ExistingDecodedSourceMap with all optional fields", () => {
      const map: ExistingDecodedSourceMap = {
        file: "output.js",
        mappings: [],
        names: [],
        sourceRoot: "/src",
        sources: ["a.ts"],
        sourcesContent: ["const x = 1;", null],
        version: 3,
        x_google_ignoreList: [0],
      };
      assertType<ExistingDecodedSourceMap>(map);
      expect(map.file).toBe("output.js");
    });

    it("ExistingRawSourceMap has string mappings", () => {
      const map: ExistingRawSourceMap = {
        mappings: "AAAA",
        names: [],
        sources: ["input.ts"],
        version: 3,
      };
      assertType<ExistingRawSourceMap>(map);
      expect(typeof map.mappings).toBe("string");
    });

    it("SourceMapInput accepts various forms", () => {
      const raw: SourceMapInput = {
        mappings: "AAAA",
        names: [],
        sources: [],
        version: 3,
      };
      const str: SourceMapInput = '{"mappings":""}';
      const nul: SourceMapInput = null;
      const empty: SourceMapInput = { mappings: "" as const };
      assertType<SourceMapInput>(raw);
      assertType<SourceMapInput>(str);
      assertType<SourceMapInput>(nul);
      assertType<SourceMapInput>(empty);
      expect(raw).toBeDefined();
      expect(str).toBeDefined();
      expect(nul).toBeNull();
      expect(empty).toBeDefined();
    });
  });

  // ==========================================================
  // Module Types
  // ==========================================================
  describe("module types", () => {
    it("ModuleFormat accepts all valid formats", () => {
      const formats: ReadonlyArray<ModuleFormat> = [
        "amd",
        "cjs",
        "es",
        "iife",
        "system",
        "umd",
      ];
      expect(formats).toHaveLength(6);
    });

    it("InteropType accepts string and boolean values", () => {
      const values: ReadonlyArray<InteropType> = [
        "auto",
        "esModule",
        "default",
        "defaultOnly",
        true,
        false,
      ];
      expect(values).toHaveLength(6);
    });

    it("ModuleInfo has all required fields", () => {
      const resolvedId: ResolvedId = {
        id: "/src/dep.ts",
        external: false,
        moduleSideEffects: true,
        syntheticNamedExports: false,
        meta: {},
        resolvedBy: "rollup",
      };

      const info: ModuleInfo = {
        id: "/src/main.ts",
        code: "export const x = 1;",
        ast: null,
        isEntry: true,
        isExternal: false,
        isIncluded: true,
        importedIds: ["/src/dep.ts"],
        importedIdResolutions: [resolvedId],
        dynamicallyImportedIds: [],
        dynamicallyImportedIdResolutions: [],
        importers: [],
        dynamicImporters: [],
        exportedBindings: { ".": ["x"] },
        exports: ["x"],
        hasDefaultExport: false,
        meta: {},
        syntheticNamedExports: false,
        moduleSideEffects: true,
      };
      assertType<ModuleInfo>(info);
      expect(info.id).toBe("/src/main.ts");
      expect(info.isEntry).toBe(true);
    });

    it("ResolvedId with absolute external", () => {
      const resolved: ResolvedId = {
        id: "https://cdn.example.com/lib.js",
        external: "absolute",
        moduleSideEffects: "no-treeshake",
        syntheticNamedExports: "default",
        meta: { custom: true },
        resolvedBy: "custom-plugin",
      };
      assertType<ResolvedId>(resolved);
      expect(resolved.external).toBe("absolute");
    });

    it("LoadResult accepts string, null, undefined, and object forms", () => {
      const strResult: LoadResult = "export const x = 1;";
      const nullResult: LoadResult = null;
      const undefResult: LoadResult = undefined;
      const objResult: LoadResult = {
        code: "export const x = 1;",
        map: null,
        ast: null,
        meta: { key: "value" },
        syntheticNamedExports: true,
        moduleSideEffects: "no-treeshake",
      };
      assertType<LoadResult>(strResult);
      assertType<LoadResult>(nullResult);
      assertType<LoadResult>(undefResult);
      assertType<LoadResult>(objResult);
      expect(strResult).toBe("export const x = 1;");
    });

    it("TransformResult accepts all valid forms", () => {
      const result: TransformResult = {
        code: "transformed",
        map: { mappings: "AAAA", names: [], sources: [], version: 3 },
      };
      assertType<TransformResult>(result);
      expect(result).toBeDefined();
    });
  });

  // ==========================================================
  // AST Types
  // ==========================================================
  describe("AST types", () => {
    it("RollupAstNode has required fields", () => {
      const node: RollupAstNode = {
        type: "Identifier",
        start: 0,
        end: 5,
        name: "hello",
      };
      assertType<RollupAstNode>(node);
      expect(node.type).toBe("Identifier");
    });

    it("ProgramNode extends RollupAstNode", () => {
      const program: ProgramNode = {
        type: "Program",
        start: 0,
        end: 100,
        body: [{ type: "ExpressionStatement", start: 0, end: 10 }],
        sourceType: "module",
      };
      assertType<ProgramNode>(program);
      assertType<RollupAstNode>(program);
      expect(program.sourceType).toBe("module");
    });

    it("ProgramNode accepts script sourceType", () => {
      const program: ProgramNode = {
        type: "Program",
        start: 0,
        end: 0,
        body: [],
        sourceType: "script",
      };
      expect(program.sourceType).toBe("script");
    });
  });

  // ==========================================================
  // Plugin Types (Emitted Files)
  // ==========================================================
  describe("emitted file types", () => {
    it('EmittedAsset has type "asset"', () => {
      const asset: EmittedAsset = {
        type: "asset",
        name: "styles.css",
        source: "body { color: red; }",
      };
      assertType<EmittedFile>(asset);
      expect(asset.type).toBe("asset");
    });

    it("EmittedAsset with Uint8Array source", () => {
      const asset: EmittedAsset = {
        type: "asset",
        fileName: "binary.dat",
        needsCodeReference: true,
        source: new Uint8Array([1, 2, 3]),
      };
      assertType<EmittedAsset>(asset);
      expect(asset.needsCodeReference).toBe(true);
    });

    it('EmittedChunk has type "chunk"', () => {
      const chunk: EmittedChunk = {
        type: "chunk",
        id: "/src/worker.ts",
        name: "worker",
        implicitlyLoadedAfterOneOf: ["/src/main.ts"],
        preserveSignature: "strict",
      };
      assertType<EmittedFile>(chunk);
      expect(chunk.type).toBe("chunk");
    });

    it('EmittedPrebuiltChunk has type "prebuilt-chunk"', () => {
      const prebuilt: EmittedPrebuiltChunk = {
        type: "prebuilt-chunk",
        fileName: "vendor.js",
        code: "var vendor = {};",
        map: null,
        exports: ["vendor"],
      };
      assertType<EmittedFile>(prebuilt);
      expect(prebuilt.type).toBe("prebuilt-chunk");
    });

    it("EmittedFile discriminated union works", () => {
      const files: ReadonlyArray<EmittedFile> = [
        { type: "asset", source: "css" },
        { type: "chunk", id: "main" },
        { type: "prebuilt-chunk", fileName: "v.js", code: "" },
      ];

      const types = files.map((f) => f.type);
      expect(types).toEqual(["asset", "chunk", "prebuilt-chunk"]);
    });

    it("PreserveEntrySignaturesOption accepts all values", () => {
      const values: ReadonlyArray<PreserveEntrySignaturesOption> = [
        false,
        "strict",
        "allow-extension",
        "exports-only",
      ];
      expect(values).toHaveLength(4);
    });

    it("HashCharacters accepts all encodings", () => {
      const values: ReadonlyArray<HashCharacters> = ["base64", "base36", "hex"];
      expect(values).toHaveLength(3);
    });
  });

  // ==========================================================
  // ObjectHook / HookFilter / StringFilter
  // ==========================================================
  describe("hook types", () => {
    it("ObjectHook accepts a plain function", () => {
      const hook: ObjectHook<() => void> = () => {
        /* no-op */
      };
      assertType<ObjectHook<() => void>>(hook);
      expect(typeof hook).toBe("function");
    });

    it("ObjectHook accepts object form with handler and order", () => {
      const hook: ObjectHook<() => string> = {
        handler: () => "result",
        order: "pre",
      };
      assertType<ObjectHook<() => string>>(hook);
      expect(typeof hook).toBe("object");
    });

    it("ObjectHook accepts null order", () => {
      const hook: ObjectHook<() => void> = {
        handler: () => {
          /* no-op */
        },
        order: null,
      };
      expect(hook.order).toBeNull();
    });

    it("HookFilter has optional id field", () => {
      const filter: HookFilter = { id: /\.ts$/ };
      assertType<HookFilter>(filter);
      expect(filter.id).toBeDefined();
    });

    it("StringFilter accepts various forms", () => {
      const str: StringFilter = "*.ts";
      const regex: StringFilter = /\.ts$/;
      const arr: StringFilter = ["*.ts", /\.js$/];
      assertType<StringFilter>(str);
      assertType<StringFilter>(regex);
      assertType<StringFilter>(arr);
      expect(str).toBe("*.ts");
      expect(regex).toBeInstanceOf(RegExp);
      expect(Array.isArray(arr)).toBe(true);
    });
  });

  // ==========================================================
  // PluginCache
  // ==========================================================
  describe("PluginCache", () => {
    it("PluginCache has get, set, has, delete methods", () => {
      const cache: PluginCache = {
        get: <T = unknown>(_id: string): T => null as T,
        set: <T = unknown>(_id: string, _value: T): void => {
          /* no-op */
        },
        has: (_id: string): boolean => false,
        delete: (_id: string): boolean => false,
      };
      assertType<PluginCache>(cache);
      expect(cache.has("key")).toBe(false);
    });
  });

  // ==========================================================
  // Output Types
  // ==========================================================
  describe("output types", () => {
    it("RenderedModule has all fields", () => {
      const mod: RenderedModule = {
        code: "const x = 1;",
        originalLength: 100,
        removedExports: ["unused"],
        renderedExports: ["x"],
        renderedLength: 12,
      };
      assertType<RenderedModule>(mod);
      expect(mod.renderedLength).toBe(12);
    });

    it('PreRenderedChunk has type "chunk"', () => {
      const chunk: PreRenderedChunk = {
        exports: ["main"],
        facadeModuleId: "/src/main.ts",
        isDynamicEntry: false,
        isEntry: true,
        isImplicitEntry: false,
        moduleIds: ["/src/main.ts"],
        name: "main",
        type: "chunk",
      };
      assertType<PreRenderedChunk>(chunk);
      expect(chunk.type).toBe("chunk");
    });

    it("RenderedChunk extends PreRenderedChunk", () => {
      const chunk: RenderedChunk = {
        exports: [],
        facadeModuleId: null,
        isDynamicEntry: false,
        isEntry: true,
        isImplicitEntry: false,
        moduleIds: ["/src/main.ts"],
        name: "main",
        type: "chunk",
        dynamicImports: [],
        fileName: "main.js",
        implicitlyLoadedBefore: [],
        importedBindings: {},
        imports: [],
        modules: {
          "/src/main.ts": {
            code: "const x = 1;",
            originalLength: 20,
            removedExports: [],
            renderedExports: ["x"],
            renderedLength: 12,
          },
        },
        referencedFiles: [],
      };
      assertType<RenderedChunk>(chunk);
      assertType<PreRenderedChunk>(chunk);
      expect(chunk.fileName).toBe("main.js");
    });

    it("OutputChunk extends RenderedChunk", () => {
      const chunk: OutputChunk = {
        exports: [],
        facadeModuleId: null,
        isDynamicEntry: false,
        isEntry: true,
        isImplicitEntry: false,
        moduleIds: [],
        name: "main",
        type: "chunk",
        dynamicImports: [],
        fileName: "main.js",
        implicitlyLoadedBefore: [],
        importedBindings: {},
        imports: [],
        modules: {},
        referencedFiles: [],
        code: "const x = 1;",
        map: null,
        sourcemapFileName: null,
        preliminaryFileName: "main-[hash].js",
      };
      assertType<OutputChunk>(chunk);
      expect(chunk.code).toBe("const x = 1;");
    });

    it('OutputAsset has type "asset"', () => {
      const asset: OutputAsset = {
        fileName: "style.css",
        name: "style",
        names: ["style"],
        needsCodeReference: false,
        originalFileName: "src/style.css",
        originalFileNames: ["src/style.css"],
        source: "body{}",
        type: "asset",
      };
      assertType<OutputAsset>(asset);
      expect(asset.type).toBe("asset");
    });

    it("OutputAsset with undefined name", () => {
      const asset: OutputAsset = {
        fileName: "unnamed.bin",
        name: undefined,
        names: [],
        needsCodeReference: false,
        originalFileName: null,
        originalFileNames: [],
        source: new Uint8Array([0]),
        type: "asset",
      };
      assertType<OutputAsset>(asset);
      expect(asset.name).toBeUndefined();
    });

    it("OutputBundle discriminates chunks from assets", () => {
      const chunk: OutputChunk = {
        exports: [],
        facadeModuleId: null,
        isDynamicEntry: false,
        isEntry: true,
        isImplicitEntry: false,
        moduleIds: [],
        name: "main",
        type: "chunk",
        dynamicImports: [],
        fileName: "main.js",
        implicitlyLoadedBefore: [],
        importedBindings: {},
        imports: [],
        modules: {},
        referencedFiles: [],
        code: "",
        map: null,
        sourcemapFileName: null,
        preliminaryFileName: "main.js",
      };

      const asset: OutputAsset = {
        fileName: "style.css",
        name: "style",
        names: ["style"],
        needsCodeReference: false,
        originalFileName: null,
        originalFileNames: [],
        source: "",
        type: "asset",
      };

      const bundle: OutputBundle = {
        "main.js": chunk,
        "style.css": asset,
      };

      const entry = bundle["main.js"];
      if (entry?.type === "chunk") {
        assertType<OutputChunk>(entry);
        expect(entry.code).toBeDefined();
      }

      const cssEntry = bundle["style.css"];
      if (cssEntry?.type === "asset") {
        assertType<OutputAsset>(cssEntry);
        expect(cssEntry.source).toBeDefined();
      }

      expect(Object.keys(bundle)).toHaveLength(2);
    });
  });

  // ==========================================================
  // Input Options
  // ==========================================================
  describe("input options", () => {
    it("InputOptions accepts minimal config", () => {
      const opts: InputOptions = {
        input: "src/main.ts",
      };
      assertType<InputOptions>(opts);
      expect(opts.input).toBe("src/main.ts");
    });

    it("InputOptions accepts full config", () => {
      const opts: InputOptions = {
        cache: false,
        context: "window",
        experimentalCacheExpiry: 10,
        experimentalLogSideEffects: true,
        external: ["lodash"],
        input: { main: "src/main.ts" },
        logLevel: "warn",
        makeAbsoluteExternalsRelative: "ifRelativeSource",
        maxParallelFileOps: 20,
        moduleContext: { "src/jquery.js": "window" },
        onLog: () => {
          /* no-op */
        },
        onwarn: () => {
          /* no-op */
        },
        perf: false,
        plugins: [],
        preserveEntrySignatures: "strict",
        preserveSymlinks: false,
        shimMissingExports: false,
        strictDeprecations: true,
        treeshake: { preset: "recommended" },
      };
      assertType<InputOptions>(opts);
      expect(opts.context).toBe("window");
    });

    it("InputOption accepts string, array, and record", () => {
      const str: InputOption = "src/main.ts";
      const arr: InputOption = ["src/a.ts", "src/b.ts"];
      const rec: InputOption = { main: "src/main.ts", worker: "src/worker.ts" };
      assertType<InputOption>(str);
      assertType<InputOption>(arr);
      assertType<InputOption>(rec);
      expect(str).toBe("src/main.ts");
      expect(arr).toHaveLength(2);
      expect(Object.keys(rec)).toHaveLength(2);
    });

    it("ExternalOption accepts various forms", () => {
      const str: ExternalOption = "lodash";
      const regex: ExternalOption = /^node:/;
      const arr: ExternalOption = ["lodash", /^node:/];
      const fn: ExternalOption = (_source, _importer, _isResolved) => false;
      assertType<ExternalOption>(str);
      assertType<ExternalOption>(regex);
      assertType<ExternalOption>(arr);
      assertType<ExternalOption>(fn);
      expect(str).toBe("lodash");
    });

    it("TreeshakingOptions with all fields", () => {
      const opts: TreeshakingOptions = {
        annotations: true,
        correctVarValueBeforeDeclaration: false,
        manualPureFunctions: ["console.log"],
        moduleSideEffects: "no-external",
        preset: "recommended",
        propertyReadSideEffects: "always",
        tryCatchDeoptimization: true,
        unknownGlobalSideEffects: false,
      };
      assertType<TreeshakingOptions>(opts);
      expect(opts.preset).toBe("recommended");
    });

    it("TreeshakingPreset values", () => {
      const presets: ReadonlyArray<TreeshakingPreset> = [
        "smallest",
        "safest",
        "recommended",
      ];
      expect(presets).toHaveLength(3);
    });

    it("ModuleSideEffectsOption accepts all forms", () => {
      const bool: ModuleSideEffectsOption = true;
      const noExt: ModuleSideEffectsOption = "no-external";
      const arr: ModuleSideEffectsOption = ["lodash"];
      const fn: ModuleSideEffectsOption = (_id, _ext) => true;
      assertType<ModuleSideEffectsOption>(bool);
      assertType<ModuleSideEffectsOption>(noExt);
      assertType<ModuleSideEffectsOption>(arr);
      assertType<ModuleSideEffectsOption>(fn);
      expect(bool).toBe(true);
    });

    it("HasModuleSideEffects is a function", () => {
      const fn: HasModuleSideEffects = (id, external) =>
        !external && id.includes("src");
      expect(fn("/src/main.ts", false)).toBe(true);
      expect(fn("lodash", true)).toBe(false);
    });
  });

  // ==========================================================
  // Output Options
  // ==========================================================
  describe("output options", () => {
    it("OutputOptions accepts minimal config", () => {
      const opts: OutputOptions = {
        format: "es",
        dir: "dist",
      };
      assertType<OutputOptions>(opts);
      expect(opts.format).toBe("es");
    });

    it("OutputOptions accepts full config", () => {
      const opts: OutputOptions = {
        amd: {
          autoId: true,
          basePath: "",
          define: "define",
          forceJsExtensionForImports: false,
        },
        assetFileNames: "assets/[name]-[hash][extname]",
        banner: "/* banner */",
        chunkFileNames: "[name]-[hash].js",
        compact: false,
        dir: "dist",
        dynamicImportInCjs: true,
        entryFileNames: "[name].js",
        esModule: "if-default-prop",
        experimentalMinChunkSize: 0,
        exports: "named",
        extend: false,
        externalImportAttributes: true,
        externalLiveBindings: true,
        file: undefined,
        footer: "/* footer */",
        format: "es",
        freeze: true,
        generatedCode: "es2015",
        globals: { jquery: "$" },
        hashCharacters: "base64",
        hoistTransitiveImports: true,
        indent: true,
        inlineDynamicImports: false,
        interop: "auto",
        intro: "",
        manualChunks: { vendor: ["lodash"] },
        minifyInternalExports: true,
        name: "MyLib",
        noConflict: false,
        outro: "",
        paths: {},
        plugins: [],
        preserveModules: false,
        preserveModulesRoot: undefined,
        reexportProtoFromExternal: false,
        sanitizeFileName: true,
        sourcemap: true,
        sourcemapBaseUrl: "https://example.com",
        sourcemapDebugIds: false,
        sourcemapExcludeSources: false,
        sourcemapFile: undefined,
        sourcemapFileNames: undefined,
        sourcemapIgnoreList: () => false,
        sourcemapPathTransform: (p) => p,
        strict: true,
        systemNullSetters: true,
        validate: false,
        virtualDirname: "",
      };
      assertType<OutputOptions>(opts);
      expect(opts.format).toBe("es");
    });

    it("GeneratedCodePreset values", () => {
      const presets: ReadonlyArray<GeneratedCodePreset> = ["es5", "es2015"];
      expect(presets).toHaveLength(2);
    });

    it("GeneratedCodeOptions accepts all fields", () => {
      const opts: GeneratedCodeOptions = {
        arrowFunctions: true,
        constBindings: true,
        objectShorthand: true,
        reservedNamesAsProps: true,
        symbols: true,
      };
      assertType<GeneratedCodeOptions>(opts);
      expect(opts.arrowFunctions).toBe(true);
    });

    it("GlobalsOption accepts record and function", () => {
      const rec: GlobalsOption = { lodash: "_" };
      const fn: GlobalsOption = (name) => name.toUpperCase();
      assertType<GlobalsOption>(rec);
      assertType<GlobalsOption>(fn);
      expect(rec).toBeDefined();
      expect(typeof fn).toBe("function");
    });

    it("ManualChunksOption accepts record and function", () => {
      const rec: ManualChunksOption = { vendor: ["lodash"] };
      const fn: ManualChunksOption = (id) =>
        id.includes("node_modules") ? "vendor" : undefined;
      assertType<ManualChunksOption>(rec);
      assertType<ManualChunksOption>(fn);
      expect(rec).toBeDefined();
    });

    it("OptionsPaths accepts record and function", () => {
      const rec: OptionsPaths = { lodash: "https://cdn.example.com/lodash.js" };
      const fn: OptionsPaths = (id) => id;
      assertType<OptionsPaths>(rec);
      assertType<OptionsPaths>(fn);
      expect(rec).toBeDefined();
    });

    it("SourcemapIgnoreListOption signature", () => {
      const fn: SourcemapIgnoreListOption = (relPath, _smPath) =>
        relPath.includes("node_modules");
      expect(fn("node_modules/lodash/index.js", "main.js.map")).toBe(true);
      expect(fn("src/main.ts", "main.js.map")).toBe(false);
    });

    it("SourcemapPathTransformOption signature", () => {
      const fn: SourcemapPathTransformOption = (relPath, _smPath) =>
        `/mapped/${relPath}`;
      expect(fn("src/main.ts", "main.js.map")).toBe("/mapped/src/main.ts");
    });

    it("AmdOptions accepts all fields", () => {
      const opts: AmdOptions = {
        autoId: false,
        basePath: "lib",
        define: "define",
        forceJsExtensionForImports: true,
        id: "myModule",
      };
      assertType<AmdOptions>(opts);
      expect(opts.id).toBe("myModule");
    });
  });

  // ==========================================================
  // RollupOptions
  // ==========================================================
  describe("RollupOptions", () => {
    it("RollupOptions extends InputOptions with output", () => {
      const opts: RollupOptions = {
        input: "src/main.ts",
        output: { format: "es", dir: "dist" },
      };
      assertType<RollupOptions>(opts);
      expect(opts.input).toBe("src/main.ts");
    });

    it("RollupOptions accepts array of outputs", () => {
      const opts: RollupOptions = {
        input: "src/main.ts",
        output: [
          { format: "es", dir: "dist/esm" },
          { format: "cjs", dir: "dist/cjs" },
        ],
      };
      assertType<RollupOptions>(opts);
      expect(Array.isArray(opts.output)).toBe(true);
    });
  });

  // ==========================================================
  // Build Types
  // ==========================================================
  describe("build types", () => {
    it("RollupOutput has tuple with at least one chunk", () => {
      const chunk: OutputChunk = {
        exports: [],
        facadeModuleId: null,
        isDynamicEntry: false,
        isEntry: true,
        isImplicitEntry: false,
        moduleIds: [],
        name: "main",
        type: "chunk",
        dynamicImports: [],
        fileName: "main.js",
        implicitlyLoadedBefore: [],
        importedBindings: {},
        imports: [],
        modules: {},
        referencedFiles: [],
        code: "",
        map: null,
        sourcemapFileName: null,
        preliminaryFileName: "main.js",
      };

      const output: RollupOutput = { output: [chunk] };
      assertType<RollupOutput>(output);
      expect(output.output[0].type).toBe("chunk");
    });

    it("RollupCache stores modules", () => {
      const cache: RollupCache = {
        modules: [
          {
            id: "/src/main.ts",
            ast: null,
            code: "const x = 1;",
            dependencies: [],
            transformDependencies: [],
            meta: {},
            syntheticNamedExports: false,
            moduleSideEffects: true,
          },
        ],
        plugins: { myPlugin: [42] },
      };
      assertType<RollupCache>(cache);
      expect(cache.modules).toHaveLength(1);
    });

    it("ModuleJSON has all required fields", () => {
      const mod: ModuleJSON = {
        id: "test",
        ast: null,
        code: "",
        dependencies: ["dep1"],
        transformDependencies: ["dep2"],
        meta: { key: "value" },
        syntheticNamedExports: "default",
        moduleSideEffects: "no-treeshake",
      };
      assertType<ModuleJSON>(mod);
      expect(mod.syntheticNamedExports).toBe("default");
    });

    it("SerializedTimings stores timing tuples", () => {
      const timings: SerializedTimings = {
        "parse modules": [10.5, 8.2, 2.3],
        "generate output": [5.1, 4.0, 1.1],
      };
      assertType<SerializedTimings>(timings);
      expect(timings["parse modules"]).toHaveLength(3);
    });

    it("RollupBuild interface shape", () => {
      const build: RollupBuild = {
        cache: undefined,
        close: () => Promise.resolve(),
        closed: false,
        generate: () =>
          Promise.resolve({
            output: [
              {
                exports: [],
                facadeModuleId: null,
                isDynamicEntry: false,
                isEntry: true,
                isImplicitEntry: false,
                moduleIds: [],
                name: "main",
                type: "chunk" as const,
                dynamicImports: [],
                fileName: "main.js",
                implicitlyLoadedBefore: [],
                importedBindings: {},
                imports: [],
                modules: {},
                referencedFiles: [],
                code: "",
                map: null,
                sourcemapFileName: null,
                preliminaryFileName: "main.js",
              },
            ],
          }),
        watchFiles: ["src/main.ts"],
        write: () =>
          Promise.resolve({
            output: [
              {
                exports: [],
                facadeModuleId: null,
                isDynamicEntry: false,
                isEntry: true,
                isImplicitEntry: false,
                moduleIds: [],
                name: "main",
                type: "chunk" as const,
                dynamicImports: [],
                fileName: "main.js",
                implicitlyLoadedBefore: [],
                importedBindings: {},
                imports: [],
                modules: {},
                referencedFiles: [],
                code: "",
                map: null,
                sourcemapFileName: null,
                preliminaryFileName: "main.js",
              },
            ],
          }),
      };
      assertType<RollupBuild>(build);
      expect(build.closed).toBe(false);
    });
  });

  // ==========================================================
  // Watch Types
  // ==========================================================
  describe("watch types", () => {
    it("ChangeEvent accepts valid values", () => {
      const events: ReadonlyArray<ChangeEvent> = ["create", "update", "delete"];
      expect(events).toHaveLength(3);
    });

    it("RollupWatcherEvent has valid code values", () => {
      const events: ReadonlyArray<RollupWatcherEvent> = [
        { code: "START" },
        { code: "BUNDLE_START", input: "src/main.ts" },
        { code: "BUNDLE_END", duration: 150 },
        { code: "END" },
        { code: "ERROR", error: { message: "Build failed" } },
      ];
      expect(events).toHaveLength(5);
      expect(events[4].code).toBe("ERROR");
    });

    it("WatcherOptions accepts all fields", () => {
      const opts: WatcherOptions = {
        buildDelay: 100,
        chokidar: { usePolling: true },
        clearScreen: true,
        exclude: ["node_modules/**"],
        include: ["src/**"],
        skipWrite: false,
      };
      assertType<WatcherOptions>(opts);
      expect(opts.buildDelay).toBe(100);
    });

    it("WatcherOptions with RegExp patterns", () => {
      const opts: WatcherOptions = {
        exclude: /node_modules/,
        include: [/\.ts$/, "*.js"],
      };
      assertType<WatcherOptions>(opts);
      expect(opts.exclude).toBeInstanceOf(RegExp);
    });
  });

  // ==========================================================
  // Plugin Interface
  // ==========================================================
  describe("Plugin interface", () => {
    it("Plugin with name and simple hooks", () => {
      const plugin: Plugin = {
        name: "test-plugin",
        buildStart() {
          /* no-op */
        },
        buildEnd() {
          /* no-op */
        },
      };
      assertType<Plugin>(plugin);
      expect(plugin.name).toBe("test-plugin");
    });

    it("Plugin with ObjectHook form", () => {
      const plugin: Plugin = {
        name: "ordered-plugin",
        resolveId: {
          order: "pre",
          handler(_source, _importer, _options) {
            return null;
          },
        },
        load: {
          order: "post",
          handler(_id) {
            return null;
          },
          id: /\.css$/,
        },
      };
      assertType<Plugin>(plugin);
      expect(plugin.name).toBe("ordered-plugin");
    });

    it("OutputPlugin with output hooks only", () => {
      const plugin: OutputPlugin = {
        name: "output-only",
        generateBundle(_options, _bundle, _isWrite) {
          /* no-op */
        },
        renderChunk(_code, _chunk, _options, _meta) {
          return null;
        },
      };
      assertType<OutputPlugin>(plugin);
      expect(plugin.name).toBe("output-only");
    });

    it("ResolveIdResult accepts all valid forms", () => {
      const str: ResolveIdResult = "/resolved/path.ts";
      const nul: ResolveIdResult = null;
      const undef: ResolveIdResult = undefined;
      const fals: ResolveIdResult = false;
      const obj: ResolveIdResult = {
        id: "/resolved/path.ts",
        external: false,
        moduleSideEffects: true,
        syntheticNamedExports: false,
        meta: {},
        resolvedBy: "my-plugin",
      };
      assertType<ResolveIdResult>(str);
      assertType<ResolveIdResult>(nul);
      assertType<ResolveIdResult>(undef);
      assertType<ResolveIdResult>(fals);
      assertType<ResolveIdResult>(obj);
      expect(str).toBe("/resolved/path.ts");
    });

    it("ResolveIdResult object with absolute external", () => {
      const result: ResolveIdResult = {
        id: "https://cdn.example.com/lib.js",
        external: "absolute",
      };
      assertType<ResolveIdResult>(result);
      expect(result).toBeDefined();
    });
  });

  // ==========================================================
  // Plugin Context Types
  // ==========================================================
  describe("plugin context types", () => {
    it("MinimalPluginContext has meta", () => {
      const ctx: MinimalPluginContext = {
        meta: { rollupVersion: "4.0.0", watchMode: false },
      };
      assertType<MinimalPluginContext>(ctx);
      expect(ctx.meta.rollupVersion).toBe("4.0.0");
    });

    it("PluginContext extends MinimalPluginContext", () => {
      const ctx: PluginContext = {
        meta: { rollupVersion: "4.0.0", watchMode: false },
        addWatchFile: () => {
          /* no-op */
        },
        cache: {
          get: () => null as unknown,
          set: () => {
            /* no-op */
          },
          has: () => false,
          delete: () => false,
        },
        debug: () => {
          /* no-op */
        },
        emitFile: () => "ref-id",
        error: () => {
          throw new Error("plugin error");
        },
        getFileName: () => "file.js",
        getModuleIds: function* () {
          yield "/src/main.ts";
        },
        getModuleInfo: () => null,
        getWatchFiles: () => [],
        info: () => {
          /* no-op */
        },
        load: () => Promise.resolve(null as unknown as ModuleInfo),
        parse: () => ({
          type: "Program" as const,
          start: 0,
          end: 0,
          body: [],
          sourceType: "module" as const,
        }),
        resolve: () => Promise.resolve(null),
        setAssetSource: () => {
          /* no-op */
        },
        warn: () => {
          /* no-op */
        },
      };
      assertType<PluginContext>(ctx);
      assertType<MinimalPluginContext>(ctx);
      expect(ctx.emitFile({ type: "asset", source: "" })).toBe("ref-id");
    });

    it("TransformPluginContext extends PluginContext", () => {
      const ctx: TransformPluginContext = {
        meta: { rollupVersion: "4.0.0", watchMode: false },
        addWatchFile: () => {
          /* no-op */
        },
        cache: {
          get: () => null as unknown,
          set: () => {
            /* no-op */
          },
          has: () => false,
          delete: () => false,
        },
        debug: () => {
          /* no-op */
        },
        emitFile: () => "ref-id",
        error: () => {
          throw new Error("error");
        },
        getFileName: () => "file.js",
        getModuleIds: function* () {
          /* empty */
        },
        getModuleInfo: () => null,
        getWatchFiles: () => [],
        info: () => {
          /* no-op */
        },
        load: () => Promise.resolve(null as unknown as ModuleInfo),
        parse: () => ({
          type: "Program" as const,
          start: 0,
          end: 0,
          body: [],
          sourceType: "module" as const,
        }),
        resolve: () => Promise.resolve(null),
        setAssetSource: () => {
          /* no-op */
        },
        warn: () => {
          /* no-op */
        },
        getCombinedSourcemap: () => ({
          mappings: [],
          names: [],
          sources: [],
          version: 3,
        }),
      };
      assertType<TransformPluginContext>(ctx);
      assertType<PluginContext>(ctx);
      expect(ctx.getCombinedSourcemap().version).toBe(3);
    });
  });

  // ==========================================================
  // Normalized Options
  // ==========================================================
  describe("normalized options", () => {
    it("NormalizedInputOptions has all required fields", () => {
      const opts: NormalizedInputOptions = {
        cache: false,
        context: "undefined",
        experimentalCacheExpiry: 10,
        experimentalLogSideEffects: false,
        external: () => false,
        input: ["src/main.ts"],
        logLevel: "warn",
        makeAbsoluteExternalsRelative: true,
        maxParallelFileOps: 20,
        moduleContext: () => "undefined",
        onLog: () => {
          /* no-op */
        },
        perf: false,
        plugins: [],
        preserveEntrySignatures: "strict",
        preserveSymlinks: false,
        shimMissingExports: false,
        strictDeprecations: false,
        treeshake: false,
      };
      assertType<NormalizedInputOptions>(opts);
      expect(opts.context).toBe("undefined");
    });

    it("NormalizedInputOptions with treeshake options", () => {
      const treeshake: NormalizedTreeshakingOptions = {
        annotations: true,
        correctVarValueBeforeDeclaration: false,
        manualPureFunctions: [],
        moduleSideEffects: () => true,
        propertyReadSideEffects: true,
        tryCatchDeoptimization: true,
        unknownGlobalSideEffects: true,
      };
      const opts: NormalizedInputOptions = {
        cache: false,
        context: "undefined",
        experimentalCacheExpiry: 10,
        experimentalLogSideEffects: false,
        external: () => false,
        input: { main: "src/main.ts" },
        logLevel: "info",
        makeAbsoluteExternalsRelative: "ifRelativeSource",
        maxParallelFileOps: 20,
        moduleContext: () => "undefined",
        onLog: () => {
          /* no-op */
        },
        perf: true,
        plugins: [],
        preserveEntrySignatures: false,
        preserveSymlinks: true,
        shimMissingExports: true,
        strictDeprecations: true,
        treeshake,
      };
      assertType<NormalizedInputOptions>(opts);
      expect(opts.treeshake).toBe(treeshake);
    });

    it("NormalizedOutputOptions has all required fields", () => {
      const opts: NormalizedOutputOptions = {
        amd: {
          autoId: false,
          basePath: "",
          define: "define",
          forceJsExtensionForImports: false,
          id: undefined,
        },
        assetFileNames: "assets/[name][extname]",
        banner: () => "",
        chunkFileNames: "[name].js",
        compact: false,
        dir: "dist",
        dynamicImportInCjs: true,
        entryFileNames: "[name].js",
        esModule: true,
        experimentalMinChunkSize: 0,
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
        interop: () => "auto",
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
        sanitizeFileName: (name) => name,
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
      };
      assertType<NormalizedOutputOptions>(opts);
      expect(opts.format).toBe("es");
    });

    it("NormalizedAmdOptions has all fields", () => {
      const opts: NormalizedAmdOptions = {
        autoId: true,
        basePath: "lib",
        define: "define",
        forceJsExtensionForImports: true,
        id: "myModule",
      };
      assertType<NormalizedAmdOptions>(opts);
      expect(opts.autoId).toBe(true);
    });

    it("NormalizedGeneratedCodeOptions has all fields", () => {
      const opts: NormalizedGeneratedCodeOptions = {
        arrowFunctions: true,
        constBindings: true,
        objectShorthand: true,
        reservedNamesAsProps: true,
        symbols: true,
      };
      assertType<NormalizedGeneratedCodeOptions>(opts);
      expect(opts.symbols).toBe(true);
    });
  });

  // ==========================================================
  // FS Types
  // ==========================================================
  describe("FS types", () => {
    it("BufferEncoding accepts valid encodings", () => {
      const encodings: ReadonlyArray<BufferEncoding> = [
        "ascii",
        "base64",
        "hex",
        "latin1",
        "utf-8",
        "utf8",
      ];
      expect(encodings).toHaveLength(6);
    });

    it("RollupFileStats has method signatures", () => {
      const stats: RollupFileStats = {
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
      };
      assertType<RollupFileStats>(stats);
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.isSymbolicLink()).toBe(false);
    });

    it("RollupDirectoryEntry has name and type checks", () => {
      const entry: RollupDirectoryEntry = {
        isDirectory: () => true,
        isFile: () => false,
        name: "src",
      };
      assertType<RollupDirectoryEntry>(entry);
      expect(entry.name).toBe("src");
      expect(entry.isDirectory()).toBe(true);
    });

    it("RollupFsModule with all methods", () => {
      const fs: RollupFsModule = {
        opendir: async function* (_path: string) {
          /* empty */
        } as unknown as (
          path: string,
        ) => Promise<AsyncIterable<RollupDirectoryEntry>>,
        readFile: async (_path: string, _encoding: BufferEncoding) => "",
        readdir: async (_path: string) => [],
        realpath: async (_path: string) => "/real/path",
        stat: async (_path: string) => ({
          isDirectory: () => false,
          isFile: () => true,
          isSymbolicLink: () => false,
        }),
      };
      assertType<RollupFsModule>(fs);
      expect(typeof fs.readFile).toBe("function");
    });

    it("RollupFsModule with only required readFile", () => {
      const fs: RollupFsModule = {
        readFile: async () => "content",
      };
      assertType<RollupFsModule>(fs);
      expect(fs.opendir).toBeUndefined();
      expect(fs.readdir).toBeUndefined();
      expect(fs.realpath).toBeUndefined();
      expect(fs.stat).toBeUndefined();
    });
  });

  // ==========================================================
  // InputPluginOption and OutputPluginOption recursive types
  // ==========================================================
  describe("plugin option types", () => {
    it("InputPluginOption accepts Plugin", () => {
      const opt: InputPluginOption = { name: "test" };
      assertType<InputPluginOption>(opt);
      expect(opt).toBeDefined();
    });

    it("InputPluginOption accepts null/undefined/false", () => {
      const n: InputPluginOption = null;
      const u: InputPluginOption = undefined;
      const f: InputPluginOption = false;
      assertType<InputPluginOption>(n);
      assertType<InputPluginOption>(u);
      assertType<InputPluginOption>(f);
      expect(n).toBeNull();
    });

    it("InputPluginOption accepts Promise", () => {
      const p: InputPluginOption = Promise.resolve({ name: "async-plugin" });
      assertType<InputPluginOption>(p);
      expect(p).toBeInstanceOf(Promise);
    });

    it("InputPluginOption accepts nested arrays", () => {
      const opt: InputPluginOption = [
        { name: "a" },
        null,
        [{ name: "b" }, false],
      ];
      assertType<InputPluginOption>(opt);
      expect(Array.isArray(opt)).toBe(true);
    });

    it("OutputPluginOption accepts OutputPlugin", () => {
      const opt: OutputPluginOption = { name: "output-test" };
      assertType<OutputPluginOption>(opt);
      expect(opt).toBeDefined();
    });

    it("OutputPluginOption accepts nested arrays", () => {
      const opt: OutputPluginOption = [{ name: "a" }, false, [{ name: "b" }]];
      assertType<OutputPluginOption>(opt);
      expect(Array.isArray(opt)).toBe(true);
    });
  });

  // ==========================================================
  // RollupWatcher (overloaded on method)
  // ==========================================================
  describe("RollupWatcher", () => {
    it("RollupWatcher has close and on methods", () => {
      const watcher: RollupWatcher = {
        close: () => {
          /* no-op */
        },
        on: ((
          _event: string,
          _listener: (...args: ReadonlyArray<unknown>) => void,
        ) => watcher) as RollupWatcher["on"],
      };
      assertType<RollupWatcher>(watcher);
      expect(typeof watcher.close).toBe("function");
      expect(typeof watcher.on).toBe("function");
    });
  });
});
