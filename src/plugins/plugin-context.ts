/**
 * @module plugins/plugin-context
 * @description Implements the PluginContext interface for module operations.
 * Provides getModuleInfo, getModuleIds, load, resolve, parse, addWatchFile,
 * getWatchFiles, and meta properties used by plugins during the build.
 */

import type {
  ModuleInfo,
  ResolvedId,
  ProgramNode,
  RollupAstNode,
  PluginContext,
  PluginCache,
  EmittedFile,
  RollupLog,
} from "../types.js";

/** Options for module resolution within a plugin. */
export interface ResolveOptions {
  readonly attributes?: Readonly<Record<string, string>>;
  readonly isEntry?: boolean;
  readonly skipSelf?: boolean;
}

/** Options for loading a module. */
export interface LoadOptions {
  readonly id: string;
  readonly resolveDependencies?: boolean;
}

/** A resolver function that plugins can provide. */
export type ResolverFn = (
  source: string,
  importer: string | undefined,
  options: ResolveOptions,
) => Promise<ResolvedId | null>;

/** A loader function that plugins can provide. */
export type LoaderFn = (options: LoadOptions) => Promise<ModuleInfo>;

/** A parser function for converting code to AST. */
export type ParserFn = (input: string, options?: unknown) => ProgramNode;

/** Configuration for creating a PluginContextImpl. */
export interface PluginContextConfig {
  readonly pluginName: string;
  readonly resolver: ResolverFn;
  readonly loader: LoaderFn;
  readonly parser: ParserFn;
  readonly moduleGraph: ModuleGraph;
  readonly watchMode?: boolean;
  readonly rollupVersion?: string;
  readonly cache?: PluginCache;
  readonly emitFile?: (file: EmittedFile) => string;
  readonly getFileName?: (id: string) => string;
  readonly setAssetSource?: (id: string, source: string | Uint8Array) => void;
  readonly onLog?: (level: string, log: RollupLog) => void;
}

/** Interface for the module graph store. */
export interface ModuleGraph {
  readonly getModuleInfo: (id: string) => ModuleInfo | null;
  readonly getModuleIds: () => IterableIterator<string>;
  readonly addModule: (id: string, info: ModuleInfo) => void;
  readonly hasModule: (id: string) => boolean;
}

/**
 * In-memory module graph implementation.
 * Stores module info by ID and provides iteration.
 */
export class InMemoryModuleGraph implements ModuleGraph {
  private readonly modules: Map<string, ModuleInfo> = new Map();

  /** Get module info by ID, or null if not found. */
  getModuleInfo(id: string): ModuleInfo | null {
    return this.modules.get(id) ?? null;
  }

  /** Get an iterator of all module IDs. */
  getModuleIds(): IterableIterator<string> {
    return this.modules.keys();
  }

  /** Add or replace a module in the graph. */
  addModule(id: string, info: ModuleInfo): void {
    this.modules.set(id, info);
  }

  /** Check if a module exists in the graph. */
  hasModule(id: string): boolean {
    return this.modules.has(id);
  }

  /** Get the count of modules (for testing). */
  size(): number {
    return this.modules.size;
  }
}

/**
 * Implementation of PluginContext providing module operations.
 * Each plugin instance gets its own context with access to shared state.
 */
export class PluginContextImpl implements PluginContext {
  readonly meta: {
    readonly rollupVersion: string;
    readonly watchMode: boolean;
  };

  private readonly _pluginName: string;
  private readonly _resolver: ResolverFn;
  private readonly _loader: LoaderFn;
  private readonly _parser: ParserFn;
  private readonly _moduleGraph: ModuleGraph;
  private readonly _watchFiles: Array<string> = [];
  private readonly _cache: PluginCache;
  private readonly _emitFile: (file: EmittedFile) => string;
  private readonly _getFileName: (id: string) => string;
  private readonly _setAssetSource: (
    id: string,
    source: string | Uint8Array,
  ) => void;
  private readonly _onLog: (level: string, log: RollupLog) => void;

  constructor(config: PluginContextConfig) {
    this._pluginName = config.pluginName;
    this._resolver = config.resolver;
    this._loader = config.loader;
    this._parser = config.parser;
    this._moduleGraph = config.moduleGraph;
    this.meta = {
      rollupVersion: config.rollupVersion ?? "4.0.0",
      watchMode: config.watchMode ?? false,
    };
    this._cache = config.cache ?? createNoOpCache();
    this._emitFile = config.emitFile ?? (() => "");
    this._getFileName = config.getFileName ?? (() => "");
    this._setAssetSource = config.setAssetSource ?? (() => undefined);
    this._onLog = config.onLog ?? (() => undefined);
  }

  /** Get the plugin name (for diagnostics). */
  getPluginName(): string {
    return this._pluginName;
  }

  /** Return ModuleInfo for the given module ID, or null. */
  getModuleInfo(moduleId: string): ModuleInfo | null {
    return this._moduleGraph.getModuleInfo(moduleId);
  }

  /** Return an iterator over all known module IDs. */
  getModuleIds(): IterableIterator<string> {
    return this._moduleGraph.getModuleIds();
  }

  /** Load a module by ID, optionally resolving dependencies. */
  async load(options: LoadOptions): Promise<ModuleInfo> {
    return this._loader(options);
  }

  /** Resolve a module source to a ResolvedId. */
  async resolve(
    source: string,
    importer?: string,
    options?: ResolveOptions,
  ): Promise<ResolvedId | null> {
    return this._resolver(source, importer, options ?? {});
  }

  /** Parse code into an AST ProgramNode. */
  parse(input: string, options?: unknown): ProgramNode {
    return this._parser(input, options);
  }

  /** Add a file to the watch list. */
  addWatchFile(id: string): void {
    this._watchFiles.push(id);
  }

  /** Get the current watch file list. */
  getWatchFiles(): ReadonlyArray<string> {
    return [...this._watchFiles];
  }

  /** Emit a file (asset, chunk, or prebuilt chunk). */
  get emitFile(): (emittedFile: EmittedFile) => string {
    return this._emitFile;
  }

  /** Get file name for a reference ID. */
  get getFileName(): (fileReferenceId: string) => string {
    return this._getFileName;
  }

  /** Set or update asset source. */
  get setAssetSource(): (
    assetReferenceId: string,
    source: string | Uint8Array,
  ) => void {
    return this._setAssetSource;
  }

  /** Per-plugin cache instance. */
  get cache(): PluginCache {
    return this._cache;
  }

  /** Throw a plugin error (never returns). */
  error(error: RollupLog | string): never {
    const msg = typeof error === "string" ? error : error.message;
    const err = new Error(msg);
    (err as unknown as Record<string, unknown>)["plugin"] = this._pluginName;
    throw err;
  }

  /** Emit a warning log. */
  warn(warning: RollupLog | string | (() => RollupLog | string)): void {
    const resolved = typeof warning === "function" ? warning() : warning;
    const log: RollupLog =
      typeof resolved === "string" ? { message: resolved } : resolved;
    this._onLog("warn", log);
  }

  /** Emit an info log. */
  info(log: RollupLog | string | (() => RollupLog | string)): void {
    const resolved = typeof log === "function" ? log() : log;
    const entry: RollupLog =
      typeof resolved === "string" ? { message: resolved } : resolved;
    this._onLog("info", entry);
  }

  /** Emit a debug log. */
  debug(log: RollupLog | string | (() => RollupLog | string)): void {
    const resolved = typeof log === "function" ? log() : log;
    const entry: RollupLog =
      typeof resolved === "string" ? { message: resolved } : resolved;
    this._onLog("debug", entry);
  }
}

/**
 * Create a no-op plugin cache (used when no cache is configured).
 */
export const createNoOpCache = (): PluginCache => {
  const store = new Map<string, unknown>();
  return {
    get: <T = unknown>(id: string): T => store.get(id) as T,
    set: <T = unknown>(id: string, value: T): void => {
      store.set(id, value);
    },
    has: (id: string): boolean => store.has(id),
    delete: (id: string): boolean => store.delete(id),
  };
};
