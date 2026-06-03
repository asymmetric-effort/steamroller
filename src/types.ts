/**
 * @module types
 * @description Complete type system for steamroller, providing full rollup.d.ts
 * parity. All types are organized by domain and exported as named exports.
 */

// ============================================================
// Utility Types
// ============================================================

/** A value that may be a single item or a readonly array of items. */
export type MaybeArray<T> = T | ReadonlyArray<T>;

/** A value that may be synchronous or a Promise. */
export type MaybePromise<T> = T | Promise<T>;

/** Makes all properties of T nullable. */
export type PartialNull<T> = { [P in keyof T]: T[P] | null };

/** Represents null, undefined, or void. */
export type NullValue = null | undefined | void;

// ============================================================
// Log Types
// ============================================================

/** Log severity levels. */
export type LogLevel = "warn" | "info" | "debug";

/** A structured log entry produced during the build. */
export interface RollupLog {
  readonly code?: string;
  readonly message: string;
  readonly id?: string;
  readonly pos?: number;
  readonly loc?: {
    readonly file?: string;
    readonly line: number;
    readonly column: number;
  };
  readonly frame?: string;
  readonly stack?: string;
  readonly plugin?: string;
  readonly pluginCode?: string;
  readonly url?: string;
  readonly exporter?: string;
  readonly reexporter?: string;
  readonly [key: string]: unknown;
}

/** Handler for log events at a given level. */
export type LogHandler = (level: LogLevel, log: RollupLog) => void;

/** Handler that also accepts error-level logs and plain strings. */
export type LogOrStringHandler = (
  level: LogLevel | "error",
  log: RollupLog | string,
) => void;

// ============================================================
// Source Map Types
// ============================================================

/** A single VLQ-decoded source map segment. */
export type SourceMapSegment =
  | readonly [number]
  | readonly [number, number, number, number]
  | readonly [number, number, number, number, number];

/** A fully decoded source map with structured mappings. */
export interface ExistingDecodedSourceMap {
  readonly file?: string;
  readonly mappings: ReadonlyArray<ReadonlyArray<SourceMapSegment>>;
  readonly names: ReadonlyArray<string>;
  readonly sourceRoot?: string;
  readonly sources: ReadonlyArray<string>;
  readonly sourcesContent?: ReadonlyArray<string | null>;
  readonly version: 3;
  readonly x_google_ignoreList?: ReadonlyArray<number>;
}

/** A raw source map with VLQ-encoded mappings string. */
export interface ExistingRawSourceMap {
  readonly file?: string;
  readonly mappings: string;
  readonly names: ReadonlyArray<string>;
  readonly sourceRoot?: string;
  readonly sources: ReadonlyArray<string>;
  readonly sourcesContent?: ReadonlyArray<string | null>;
  readonly version: 3;
  readonly x_google_ignoreList?: ReadonlyArray<number>;
}

/** Acceptable source map input formats. */
export type SourceMapInput =
  | ExistingRawSourceMap
  | string
  | null
  | { readonly mappings: "" };

// ============================================================
// Module Types
// ============================================================

/** Supported output module formats. */
export type ModuleFormat = "amd" | "cjs" | "es" | "iife" | "system" | "umd";

/** Interop mode for CJS/ESM boundary handling. */
export type InteropType =
  | "auto"
  | "esModule"
  | "default"
  | "defaultOnly"
  | boolean;

/** Detailed information about a resolved module. */
export interface ModuleInfo {
  readonly id: string;
  readonly code: string | null;
  readonly ast: unknown;
  readonly isEntry: boolean;
  readonly isExternal: boolean;
  readonly isIncluded: boolean | null;
  readonly importedIds: ReadonlyArray<string>;
  readonly importedIdResolutions: ReadonlyArray<ResolvedId>;
  readonly dynamicallyImportedIds: ReadonlyArray<string>;
  readonly dynamicallyImportedIdResolutions: ReadonlyArray<ResolvedId>;
  readonly importers: ReadonlyArray<string>;
  readonly dynamicImporters: ReadonlyArray<string>;
  readonly exportedBindings: Readonly<
    Record<string, ReadonlyArray<string>>
  > | null;
  readonly exports: ReadonlyArray<string> | null;
  readonly hasDefaultExport: boolean | null;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly syntheticNamedExports: boolean | string;
  readonly moduleSideEffects: boolean | "no-treeshake";
}

/** The result of resolving a module identifier. */
export interface ResolvedId {
  readonly id: string;
  readonly external: boolean | "absolute";
  readonly moduleSideEffects: boolean | "no-treeshake";
  readonly syntheticNamedExports: boolean | string;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly resolvedBy: string;
}

/** Result of loading a module. */
export type LoadResult =
  | string
  | null
  | undefined
  | {
      readonly code: string;
      readonly map?: SourceMapInput;
      readonly ast?: unknown;
      readonly meta?: Record<string, unknown>;
      readonly syntheticNamedExports?: boolean | string;
      readonly moduleSideEffects?: boolean | "no-treeshake";
    };

/** Result of transforming module source code. */
export type TransformResult =
  | string
  | null
  | undefined
  | {
      readonly code: string;
      readonly map?: SourceMapInput;
      readonly ast?: unknown;
      readonly meta?: Record<string, unknown>;
      readonly syntheticNamedExports?: boolean | string;
      readonly moduleSideEffects?: boolean | "no-treeshake";
    };

// ============================================================
// AST Types
// ============================================================

/** Base AST node produced by the parser. */
export interface RollupAstNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

/** Top-level Program AST node. */
export interface ProgramNode extends RollupAstNode {
  readonly type: "Program";
  readonly body: ReadonlyArray<RollupAstNode>;
  readonly sourceType: "module" | "script";
}

// ============================================================
// Plugin Types
// ============================================================

/** An emitted asset file. */
export interface EmittedAsset {
  readonly type: "asset";
  readonly name?: string;
  readonly fileName?: string;
  readonly needsCodeReference?: boolean;
  readonly source?: string | Uint8Array;
}

/** An emitted chunk (entry point). */
export interface EmittedChunk {
  readonly type: "chunk";
  readonly id: string;
  readonly name?: string;
  readonly fileName?: string;
  readonly implicitlyLoadedAfterOneOf?: ReadonlyArray<string>;
  readonly importer?: string;
  readonly preserveSignature?: PreserveEntrySignaturesOption;
}

/** An emitted prebuilt chunk with pre-rendered code. */
export interface EmittedPrebuiltChunk {
  readonly type: "prebuilt-chunk";
  readonly fileName: string;
  readonly code: string;
  readonly map?: SourceMapInput;
  readonly exports?: ReadonlyArray<string>;
}

/** Union of all emittable file types. */
export type EmittedFile = EmittedAsset | EmittedChunk | EmittedPrebuiltChunk;

/** Controls how entry point signatures are preserved. */
export type PreserveEntrySignaturesOption =
  | false
  | "strict"
  | "allow-extension"
  | "exports-only";

/** Hash encoding character set. */
export type HashCharacters = "base64" | "base36" | "hex";

/** Wraps a hook function with optional ordering metadata. */
export type ObjectHook<T, O = Record<string, never>> =
  | T
  | ({
      readonly handler: T;
      readonly order?: "pre" | "post" | null;
    } & O);

/** Filter configuration for hook invocation. */
export interface HookFilter {
  readonly id?: StringFilter;
}

/** Pattern(s) for filtering strings (module IDs, etc.). */
export type StringFilter = string | RegExp | ReadonlyArray<string | RegExp>;

/** Per-plugin persistent cache interface. */
export interface PluginCache {
  readonly get: <T = unknown>(id: string) => T;
  readonly set: <T = unknown>(id: string, value: T) => void;
  readonly has: (id: string) => boolean;
  readonly delete: (id: string) => boolean;
}

// ============================================================
// Output Types
// ============================================================

/** Information about a module after tree-shaking. */
export interface RenderedModule {
  readonly code: string | null;
  readonly originalLength: number;
  readonly removedExports: ReadonlyArray<string>;
  readonly renderedExports: ReadonlyArray<string>;
  readonly renderedLength: number;
}

/** Chunk metadata available before rendering. */
export interface PreRenderedChunk {
  readonly exports: ReadonlyArray<string>;
  readonly facadeModuleId: string | null;
  readonly isDynamicEntry: boolean;
  readonly isEntry: boolean;
  readonly isImplicitEntry: boolean;
  readonly moduleIds: ReadonlyArray<string>;
  readonly name: string;
  readonly type: "chunk";
}

/** Chunk metadata after rendering, with import/export details. */
export interface RenderedChunk extends PreRenderedChunk {
  readonly dynamicImports: ReadonlyArray<string>;
  readonly fileName: string;
  readonly implicitlyLoadedBefore: ReadonlyArray<string>;
  readonly importedBindings: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly imports: ReadonlyArray<string>;
  readonly modules: Readonly<Record<string, RenderedModule>>;
  readonly referencedFiles: ReadonlyArray<string>;
}

/** Final output chunk with generated code and source map. */
export interface OutputChunk extends RenderedChunk {
  readonly code: string;
  readonly map: ExistingRawSourceMap | null;
  readonly sourcemapFileName: string | null;
  readonly preliminaryFileName: string;
}

/** Asset metadata available before file name assignment. */
export interface PreRenderedAsset {
  readonly names: ReadonlyArray<string>;
  readonly originalFileNames: ReadonlyArray<string>;
  readonly source: string | Uint8Array;
  readonly type: "asset";
}

/** Final output asset with resolved file name. */
export interface OutputAsset {
  readonly fileName: string;
  readonly name: string | undefined;
  readonly names: ReadonlyArray<string>;
  readonly needsCodeReference: boolean;
  readonly originalFileName: string | null;
  readonly originalFileNames: ReadonlyArray<string>;
  readonly source: string | Uint8Array;
  readonly type: "asset";
}

/** The complete output bundle mapping file names to chunks/assets. */
export type OutputBundle = Readonly<Record<string, OutputAsset | OutputChunk>>;

// ============================================================
// Input Options
// ============================================================

/** Configuration options for the input (build) phase. */
export interface InputOptions {
  readonly cache?: boolean | RollupCache;
  readonly context?: string;
  readonly experimentalCacheExpiry?: number;
  readonly experimentalLogSideEffects?: boolean;
  readonly external?: ExternalOption;
  readonly input?: InputOption;
  readonly logLevel?: LogLevel;
  readonly makeAbsoluteExternalsRelative?: boolean | "ifRelativeSource";
  readonly maxParallelFileOps?: number;
  readonly moduleContext?:
    | ((id: string) => string | null | undefined)
    | Readonly<Record<string, string>>;
  readonly onLog?: LogHandler;
  readonly onwarn?: (
    warning: RollupLog,
    defaultHandler: (warning: string | RollupLog) => void,
  ) => void;
  readonly perf?: boolean;
  readonly plugins?: ReadonlyArray<InputPluginOption>;
  readonly preserveEntrySignatures?: PreserveEntrySignaturesOption;
  readonly preserveSymlinks?: boolean;
  readonly shimMissingExports?: boolean;
  readonly strictDeprecations?: boolean;
  readonly treeshake?: boolean | TreeshakingPreset | TreeshakingOptions;
  /** Whether to use native (Rust) bindings for performance-critical paths.
   *  - `true`: require native bindings (error if unavailable)
   *  - `false`: always use TypeScript implementations
   *  - `'auto'`: use native when available, fallback to TypeScript (default)
   */
  readonly native?: boolean | "auto";
}

/** Entry point specification. */
export type InputOption =
  | string
  | ReadonlyArray<string>
  | Readonly<Record<string, string>>;

/** External module specification. */
export type ExternalOption =
  | (string | RegExp)[]
  | string
  | RegExp
  | ((
      source: string,
      importer: string | undefined,
      isResolved: boolean,
    ) => boolean | NullValue);

/** A plugin, falsy value, or nested array of plugins. */
export type InputPluginOption = MaybePromise<
  Plugin | NullValue | false | ReadonlyArray<InputPluginOption>
>;

/** Preset names for tree-shaking configuration. */
export type TreeshakingPreset = "smallest" | "safest" | "recommended";

/** Fine-grained tree-shaking options. */
export interface TreeshakingOptions {
  readonly annotations?: boolean;
  readonly correctVarValueBeforeDeclaration?: boolean;
  readonly manualPureFunctions?: ReadonlyArray<string>;
  readonly moduleSideEffects?: ModuleSideEffectsOption;
  readonly preset?: TreeshakingPreset;
  readonly propertyReadSideEffects?: boolean | "always";
  readonly tryCatchDeoptimization?: boolean;
  readonly unknownGlobalSideEffects?: boolean;
}

/** Controls which modules are considered to have side effects. */
export type ModuleSideEffectsOption =
  | boolean
  | "no-external"
  | ReadonlyArray<string>
  | HasModuleSideEffects;

/** Predicate for determining module side effects. */
export type HasModuleSideEffects = (id: string, external: boolean) => boolean;

// ============================================================
// Output Options
// ============================================================

/** Configuration options for the output (generate/write) phase. */
export interface OutputOptions {
  readonly amd?: AmdOptions;
  readonly assetFileNames?: string | ((assetInfo: PreRenderedAsset) => string);
  readonly banner?: string | (() => MaybePromise<string>);
  readonly chunkFileNames?: string | ((chunkInfo: PreRenderedChunk) => string);
  readonly compact?: boolean;
  readonly dir?: string;
  readonly dts?: boolean;
  readonly dynamicImportInCjs?: boolean;
  readonly entryFileNames?: string | ((chunkInfo: PreRenderedChunk) => string);
  readonly esModule?: boolean | "if-default-prop";
  readonly experimentalMinChunkSize?: number;
  readonly exports?: "auto" | "default" | "named" | "none";
  readonly extend?: boolean;
  readonly externalImportAttributes?: boolean;
  readonly externalLiveBindings?: boolean;
  readonly file?: string;
  readonly footer?: string | (() => MaybePromise<string>);
  readonly format?: ModuleFormat;
  readonly freeze?: boolean;
  readonly generatedCode?: GeneratedCodePreset | GeneratedCodeOptions;
  readonly globals?: GlobalsOption;
  readonly hashCharacters?: HashCharacters;
  readonly hoistTransitiveImports?: boolean;
  readonly indent?: boolean | string;
  readonly inlineDynamicImports?: boolean;
  readonly interop?: InteropType | ((id: string | null) => InteropType);
  readonly intro?: string | (() => MaybePromise<string>);
  readonly manualChunks?: ManualChunksOption;
  readonly minifyInternalExports?: boolean;
  readonly name?: string;
  readonly noConflict?: boolean;
  readonly outro?: string | (() => MaybePromise<string>);
  readonly paths?: OptionsPaths;
  readonly plugins?: ReadonlyArray<OutputPluginOption>;
  readonly preserveModules?: boolean;
  readonly preserveModulesRoot?: string;
  readonly reexportProtoFromExternal?: boolean;
  readonly sanitizeFileName?: boolean | ((fileName: string) => string);
  readonly sourcemap?: boolean | "inline" | "hidden";
  readonly sourcemapBaseUrl?: string;
  readonly sourcemapDebugIds?: boolean;
  readonly sourcemapExcludeSources?: boolean;
  readonly sourcemapFile?: string;
  readonly sourcemapFileNames?:
    | string
    | ((chunkInfo: PreRenderedChunk) => string);
  readonly sourcemapIgnoreList?: SourcemapIgnoreListOption;
  readonly sourcemapPathTransform?: SourcemapPathTransformOption;
  readonly strict?: boolean;
  readonly systemNullSetters?: boolean;
  readonly minify?: boolean;
  readonly target?: string;
  readonly validate?: boolean;
  readonly virtualDirname?: string;
}

/** Preset names for generated code style. */
export type GeneratedCodePreset = "es5" | "es2015";

/** Fine-grained generated code options. */
export interface GeneratedCodeOptions {
  readonly arrowFunctions?: boolean;
  readonly constBindings?: boolean;
  readonly objectShorthand?: boolean;
  readonly reservedNamesAsProps?: boolean;
  readonly symbols?: boolean;
}

/** Mapping of external module names to global variable names. */
export type GlobalsOption =
  | Readonly<Record<string, string>>
  | ((name: string) => string);

/** Manual chunk assignment configuration. */
export type ManualChunksOption =
  | Readonly<Record<string, ReadonlyArray<string>>>
  | ((
      id: string,
      meta: {
        readonly getModuleInfo: (id: string) => ModuleInfo | null;
        readonly getModuleIds: () => IterableIterator<string>;
      },
    ) => string | NullValue);

/** Mapping or function for rewriting external import paths. */
export type OptionsPaths =
  | Readonly<Record<string, string>>
  | ((id: string) => string);

/** Predicate for excluding sources from the source map ignore list. */
export type SourcemapIgnoreListOption = (
  relativeSourcePath: string,
  sourcemapPath: string,
) => boolean;

/** Transform function for rewriting source map paths. */
export type SourcemapPathTransformOption = (
  relativeSourcePath: string,
  sourcemapPath: string,
) => string;

/** An output plugin, falsy value, or nested array of output plugins. */
export type OutputPluginOption = MaybePromise<
  OutputPlugin | NullValue | false | ReadonlyArray<OutputPluginOption>
>;

/** AMD module format configuration. */
export interface AmdOptions {
  readonly autoId?: boolean;
  readonly basePath?: string;
  readonly define?: string;
  readonly forceJsExtensionForImports?: boolean;
  readonly id?: string;
}

// ============================================================
// RollupOptions (combined input + output)
// ============================================================

/** Combined input and output options for a complete build configuration. */
export interface RollupOptions extends InputOptions {
  readonly output?: OutputOptions | ReadonlyArray<OutputOptions>;
}

// ============================================================
// Build Types
// ============================================================

/** The result of a generate or write operation. */
export interface RollupOutput {
  readonly output: readonly [OutputChunk, ...(OutputChunk | OutputAsset)[]];
}

/** A completed build that can generate or write output. */
export interface RollupBuild {
  readonly cache: RollupCache | undefined;
  readonly close: () => Promise<void>;
  readonly closed: boolean;
  readonly generate: (outputOptions: OutputOptions) => Promise<RollupOutput>;
  readonly getTimings?: () => SerializedTimings;
  readonly watchFiles: ReadonlyArray<string>;
  readonly write: (outputOptions: OutputOptions) => Promise<RollupOutput>;
}

/** Cached build state for incremental rebuilds. */
export interface RollupCache {
  readonly modules: ReadonlyArray<ModuleJSON>;
  readonly plugins?: Readonly<Record<string, readonly [unknown, ...unknown[]]>>;
}

/** Serialized module state for caching. */
export interface ModuleJSON {
  readonly id: string;
  readonly ast: unknown;
  readonly code: string;
  readonly dependencies: ReadonlyArray<string>;
  readonly transformDependencies: ReadonlyArray<string>;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly syntheticNamedExports: boolean | string;
  readonly moduleSideEffects: boolean | "no-treeshake";
}

/** Performance timing data as [total, self, children] tuples. */
export type SerializedTimings = Readonly<
  Record<string, readonly [number, number, number]>
>;

// ============================================================
// Watch Types
// ============================================================

/** File system change event types. */
export type ChangeEvent = "create" | "update" | "delete";

/** Events emitted by the file watcher during rebuilds. */
export interface RollupWatcherEvent {
  readonly code: "START" | "BUNDLE_START" | "BUNDLE_END" | "END" | "ERROR";
  readonly error?: RollupLog;
  readonly input?: InputOption;
  readonly output?: ReadonlyArray<string>;
  readonly duration?: number;
  readonly result?: RollupBuild;
}

/** File watcher that triggers rebuilds on source changes. */
export interface RollupWatcher {
  readonly close: () => void;
  readonly on: ((
    event: "event",
    listener: (event: RollupWatcherEvent) => void,
  ) => RollupWatcher) &
    ((
      event: "change",
      listener: (id: string, change: { readonly event: ChangeEvent }) => void,
    ) => RollupWatcher) &
    ((event: "restart" | "close", listener: () => void) => RollupWatcher);
}

/** Configuration for the file watcher behavior. */
export interface WatcherOptions {
  readonly buildDelay?: number;
  readonly chokidar?: unknown;
  readonly clearScreen?: boolean;
  readonly exclude?: string | RegExp | ReadonlyArray<string | RegExp>;
  readonly include?: string | RegExp | ReadonlyArray<string | RegExp>;
  readonly skipWrite?: boolean;
}

// ============================================================
// Plugin Interface
// ============================================================

/** A complete input plugin with all available hooks. */
export interface Plugin extends OutputPlugin {
  readonly buildEnd?: ObjectHook<
    (this: PluginContext, error?: Error) => MaybePromise<void>
  >;
  readonly buildStart?: ObjectHook<
    (this: PluginContext, options: NormalizedInputOptions) => MaybePromise<void>
  >;
  readonly load?: ObjectHook<
    (this: PluginContext, id: string) => MaybePromise<LoadResult>,
    HookFilter
  >;
  readonly moduleParsed?: ObjectHook<
    (this: PluginContext, info: ModuleInfo) => MaybePromise<void>
  >;
  readonly name: string;
  readonly options?: ObjectHook<
    (
      this: MinimalPluginContext,
      options: InputOptions,
    ) => MaybePromise<InputOptions | null | undefined>
  >;
  readonly resolveDynamicImport?: ObjectHook<
    (
      this: PluginContext,
      specifier: string | RollupAstNode,
      importer: string,
      options: {
        readonly attributes: Readonly<Record<string, string>>;
      },
    ) => MaybePromise<ResolveIdResult>
  >;
  readonly resolveId?: ObjectHook<
    (
      this: PluginContext,
      source: string,
      importer: string | undefined,
      options: {
        readonly attributes: Readonly<Record<string, string>>;
        readonly isEntry: boolean;
      },
    ) => MaybePromise<ResolveIdResult>,
    HookFilter
  >;
  readonly shouldTransformCachedModule?: ObjectHook<
    (
      this: PluginContext,
      options: {
        readonly id: string;
        readonly code: string;
        readonly ast: unknown;
        readonly meta: Readonly<Record<string, unknown>>;
      },
    ) => MaybePromise<boolean | NullValue>
  >;
  readonly transform?: ObjectHook<
    (
      this: TransformPluginContext,
      code: string,
      id: string,
    ) => MaybePromise<TransformResult>,
    HookFilter
  >;
  readonly watchChange?: ObjectHook<
    (
      this: PluginContext,
      id: string,
      change: { readonly event: ChangeEvent },
    ) => MaybePromise<void>
  >;
}

/** A plugin that only participates in the output phase. */
export interface OutputPlugin {
  readonly augmentChunkHash?: ObjectHook<
    (this: PluginContext, chunk: RenderedChunk) => MaybePromise<string | void>
  >;
  readonly banner?: ObjectHook<
    (this: PluginContext, chunk: RenderedChunk) => MaybePromise<string | void>
  >;
  readonly closeBundle?: ObjectHook<
    (this: PluginContext) => MaybePromise<void>
  >;
  readonly footer?: ObjectHook<
    (this: PluginContext, chunk: RenderedChunk) => MaybePromise<string | void>
  >;
  readonly generateBundle?: ObjectHook<
    (
      this: PluginContext,
      options: NormalizedOutputOptions,
      bundle: OutputBundle,
      isWrite: boolean,
    ) => MaybePromise<void>
  >;
  readonly intro?: ObjectHook<
    (this: PluginContext, chunk: RenderedChunk) => MaybePromise<string | void>
  >;
  readonly name: string;
  readonly outro?: ObjectHook<
    (this: PluginContext, chunk: RenderedChunk) => MaybePromise<string | void>
  >;
  readonly renderChunk?: ObjectHook<
    (
      this: PluginContext,
      code: string,
      chunk: RenderedChunk,
      options: NormalizedOutputOptions,
      meta: {
        readonly chunks: Readonly<Record<string, RenderedChunk>>;
      },
    ) => MaybePromise<
      | { readonly code: string; readonly map?: SourceMapInput }
      | string
      | null
      | undefined
    >
  >;
  readonly renderDynamicImport?: ObjectHook<
    (
      this: PluginContext,
      options: {
        readonly customResolution: string | null;
        readonly format: ModuleFormat;
        readonly moduleId: string;
        readonly targetModuleId: string | null;
      },
    ) => MaybePromise<
      { readonly left: string; readonly right: string } | null | undefined
    >
  >;
  readonly renderError?: ObjectHook<
    (this: PluginContext, error?: Error) => MaybePromise<void>
  >;
  readonly renderStart?: ObjectHook<
    (
      this: PluginContext,
      outputOptions: NormalizedOutputOptions,
      inputOptions: NormalizedInputOptions,
    ) => MaybePromise<void>
  >;
  readonly resolveFileUrl?: ObjectHook<
    (
      this: PluginContext,
      options: {
        readonly chunkId: string;
        readonly fileName: string;
        readonly format: ModuleFormat;
        readonly moduleId: string;
        readonly referenceId: string;
        readonly relativePath: string;
      },
    ) => MaybePromise<string | null | undefined>
  >;
  readonly resolveImportMeta?: ObjectHook<
    (
      this: PluginContext,
      property: string | null,
      options: {
        readonly chunkId: string;
        readonly format: ModuleFormat;
        readonly moduleId: string;
      },
    ) => MaybePromise<string | null | undefined>
  >;
  readonly writeBundle?: ObjectHook<
    (
      this: PluginContext,
      options: NormalizedOutputOptions,
      bundle: OutputBundle,
    ) => MaybePromise<void>
  >;
}

/** Result of resolving a module identifier. */
export type ResolveIdResult =
  | string
  | null
  | undefined
  | false
  | {
      readonly id: string;
      readonly external?: boolean | "absolute";
      readonly moduleSideEffects?: boolean | "no-treeshake";
      readonly syntheticNamedExports?: boolean | string;
      readonly meta?: Record<string, unknown>;
      readonly resolvedBy?: string;
    };

// ============================================================
// Plugin Context Types
// ============================================================

/** Minimal context available during the options hook. */
export interface MinimalPluginContext {
  readonly meta: {
    readonly rollupVersion: string;
    readonly watchMode: boolean;
  };
}

/** Full context available to most plugin hooks. */
export interface PluginContext extends MinimalPluginContext {
  readonly addWatchFile: (id: string) => void;
  readonly cache: PluginCache;
  readonly debug: (
    log: RollupLog | string | (() => RollupLog | string),
  ) => void;
  readonly emitFile: (emittedFile: EmittedFile) => string;
  readonly error: (error: RollupLog | string) => never;
  readonly getFileName: (fileReferenceId: string) => string;
  readonly getModuleIds: () => IterableIterator<string>;
  readonly getModuleInfo: (moduleId: string) => ModuleInfo | null;
  readonly getWatchFiles: () => ReadonlyArray<string>;
  readonly info: (log: RollupLog | string | (() => RollupLog | string)) => void;
  readonly load: (options: {
    readonly id: string;
    readonly resolveDependencies?: boolean;
  }) => Promise<ModuleInfo>;
  readonly parse: (input: string, options?: unknown) => ProgramNode;
  readonly resolve: (
    source: string,
    importer?: string,
    options?: {
      readonly attributes?: Readonly<Record<string, string>>;
      readonly isEntry?: boolean;
      readonly skipSelf?: boolean;
    },
  ) => Promise<ResolvedId | null>;
  readonly setAssetSource: (
    assetReferenceId: string,
    source: string | Uint8Array,
  ) => void;
  readonly warn: (
    warning: RollupLog | string | (() => RollupLog | string),
  ) => void;
}

/** Extended context available during the transform hook. */
export interface TransformPluginContext extends PluginContext {
  readonly getCombinedSourcemap: () => ExistingDecodedSourceMap;
}

// ============================================================
// Normalized Options (internal, after validation)
// ============================================================

/** Input options after normalization and validation. */
export interface NormalizedInputOptions {
  readonly cache: RollupCache | false;
  readonly context: string;
  readonly experimentalCacheExpiry: number;
  readonly experimentalLogSideEffects: boolean;
  readonly external: (
    source: string,
    importer: string | undefined,
    isResolved: boolean,
  ) => boolean;
  readonly input: ReadonlyArray<string> | Readonly<Record<string, string>>;
  readonly logLevel: LogLevel;
  readonly makeAbsoluteExternalsRelative: boolean | "ifRelativeSource";
  readonly maxParallelFileOps: number;
  readonly moduleContext: (id: string) => string;
  readonly onLog: LogHandler;
  readonly perf: boolean;
  readonly plugins: ReadonlyArray<Plugin>;
  readonly preserveEntrySignatures: PreserveEntrySignaturesOption;
  readonly preserveSymlinks: boolean;
  readonly shimMissingExports: boolean;
  readonly strictDeprecations: boolean;
  readonly treeshake: false | NormalizedTreeshakingOptions;
}

/** Treeshaking options after normalization. */
export interface NormalizedTreeshakingOptions {
  readonly annotations: boolean;
  readonly correctVarValueBeforeDeclaration: boolean;
  readonly manualPureFunctions: ReadonlyArray<string>;
  readonly moduleSideEffects: HasModuleSideEffects;
  readonly propertyReadSideEffects: boolean | "always";
  readonly tryCatchDeoptimization: boolean;
  readonly unknownGlobalSideEffects: boolean;
}

/** Output options after normalization and validation. */
export interface NormalizedOutputOptions {
  readonly amd: NormalizedAmdOptions;
  readonly assetFileNames: string | ((assetInfo: PreRenderedAsset) => string);
  readonly banner: () => MaybePromise<string>;
  readonly chunkFileNames: string | ((chunkInfo: PreRenderedChunk) => string);
  readonly compact: boolean;
  readonly dir: string | undefined;
  readonly dynamicImportInCjs: boolean;
  readonly entryFileNames: string | ((chunkInfo: PreRenderedChunk) => string);
  readonly esModule: boolean | "if-default-prop";
  readonly experimentalMinChunkSize: number;
  readonly exports: "auto" | "default" | "named" | "none";
  readonly extend: boolean;
  readonly externalImportAttributes: boolean;
  readonly externalLiveBindings: boolean;
  readonly file: string | undefined;
  readonly footer: () => MaybePromise<string>;
  readonly format: ModuleFormat;
  readonly freeze: boolean;
  readonly generatedCode: NormalizedGeneratedCodeOptions;
  readonly globals: GlobalsOption;
  readonly hashCharacters: HashCharacters;
  readonly hoistTransitiveImports: boolean;
  readonly indent: true | string;
  readonly inlineDynamicImports: boolean;
  readonly interop: (id: string | null) => InteropType;
  readonly intro: () => MaybePromise<string>;
  readonly manualChunks: ManualChunksOption;
  readonly minifyInternalExports: boolean;
  readonly name: string | undefined;
  readonly noConflict: boolean;
  readonly outro: () => MaybePromise<string>;
  readonly paths: OptionsPaths;
  readonly plugins: ReadonlyArray<OutputPlugin>;
  readonly preserveModules: boolean;
  readonly preserveModulesRoot: string | undefined;
  readonly sanitizeFileName: (fileName: string) => string;
  readonly sourcemap: boolean | "inline" | "hidden";
  readonly sourcemapBaseUrl: string | undefined;
  readonly sourcemapDebugIds: boolean;
  readonly sourcemapExcludeSources: boolean;
  readonly sourcemapFile: string | undefined;
  readonly sourcemapFileNames:
    | string
    | ((chunkInfo: PreRenderedChunk) => string)
    | undefined;
  readonly sourcemapIgnoreList: SourcemapIgnoreListOption;
  readonly sourcemapPathTransform: SourcemapPathTransformOption | undefined;
  readonly strict: boolean;
  readonly systemNullSetters: boolean;
  readonly validate: boolean;
  readonly virtualDirname: string;
}

/** Normalized AMD options. */
export interface NormalizedAmdOptions {
  readonly autoId: boolean;
  readonly basePath: string;
  readonly define: string;
  readonly forceJsExtensionForImports: boolean;
  readonly id: string | undefined;
}

/** Normalized generated code options. */
export interface NormalizedGeneratedCodeOptions {
  readonly arrowFunctions: boolean;
  readonly constBindings: boolean;
  readonly objectShorthand: boolean;
  readonly reservedNamesAsProps: boolean;
  readonly symbols: boolean;
}

// ============================================================
// FS Types
// ============================================================

/** Supported buffer encoding types for file operations. */
export type BufferEncoding =
  | "ascii"
  | "base64"
  | "hex"
  | "latin1"
  | "utf-8"
  | "utf8";

/** File stat information for the virtual file system. */
export interface RollupFileStats {
  readonly isDirectory: () => boolean;
  readonly isFile: () => boolean;
  readonly isSymbolicLink: () => boolean;
}

/** Directory entry for the virtual file system. */
export interface RollupDirectoryEntry {
  readonly isDirectory: () => boolean;
  readonly isFile: () => boolean;
  readonly name: string;
}

/** Virtual file system module interface for custom file access. */
export interface RollupFsModule {
  readonly opendir?: (
    path: string,
  ) => Promise<AsyncIterable<RollupDirectoryEntry>>;
  readonly readFile: (
    path: string,
    encoding: BufferEncoding,
  ) => Promise<string>;
  readonly readdir?: (path: string) => Promise<ReadonlyArray<string>>;
  readonly realpath?: (path: string) => Promise<string>;
  readonly stat?: (path: string) => Promise<RollupFileStats>;
}
