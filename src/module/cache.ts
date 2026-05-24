/**
 * @module module/cache
 * @description Module cache system for incremental rebuilds.
 * Provides RollupCache for module-level caching with expiry,
 * and PluginCache for per-plugin key-value storage.
 */

/** Cached data for a single module. */
export interface CachedModuleData {
  readonly code: string;
  readonly ast: unknown;
  readonly dependencies: ReadonlyArray<string>;
  readonly transformDependencies: ReadonlyArray<string>;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly syntheticNamedExports: boolean | string;
  readonly moduleSideEffects: boolean | "no-treeshake";
}

/** Serialized cache state for persistence between builds. */
export interface RollupCacheData {
  readonly modules: ReadonlyArray<CachedModuleData & { readonly id: string }>;
  readonly plugins?: Readonly<Record<string, ReadonlyArray<unknown>>>;
}

/**
 * Cache for module data across incremental rebuilds.
 * Tracks access times to purge stale entries.
 */
export class RollupCache {
  private readonly modules: Map<string, CachedModuleData>;
  private buildCount: number;
  private readonly lastAccessed: Map<string, number>;

  constructor(data?: RollupCacheData) {
    this.modules = new Map();
    this.buildCount = 0;
    this.lastAccessed = new Map();

    if (data !== undefined) {
      const moduleList = data.modules;
      for (let i = 0; i < moduleList.length; i++) {
        const entry = moduleList[i];
        const cached: CachedModuleData = {
          code: entry.code,
          ast: entry.ast,
          dependencies: entry.dependencies,
          transformDependencies: entry.transformDependencies,
          meta: entry.meta,
          syntheticNamedExports: entry.syntheticNamedExports,
          moduleSideEffects: entry.moduleSideEffects,
        };
        this.modules.set(entry.id, cached);
        this.lastAccessed.set(entry.id, this.buildCount);
      }
    }
  }

  /** Retrieve cached data for a module by id. */
  getModule(id: string): CachedModuleData | undefined {
    const mod = this.modules.get(id);
    if (mod !== undefined) {
      this.lastAccessed.set(id, this.buildCount);
    }
    return mod;
  }

  /** Store cached data for a module. */
  setModule(id: string, data: CachedModuleData): void {
    this.modules.set(id, data);
    this.lastAccessed.set(id, this.buildCount);
  }

  /** Check if a module is cached. */
  hasModule(id: string): boolean {
    return this.modules.has(id);
  }

  /** Remove a module from the cache. */
  deleteModule(id: string): boolean {
    this.lastAccessed.delete(id);
    return this.modules.delete(id);
  }

  /**
   * Purge entries not accessed within the given number of builds.
   * An entry is expired if (buildCount - lastAccessed) >= expiry.
   */
  purgeExpired(expiry: number): void {
    const ids = Array.from(this.lastAccessed.keys());
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const lastBuild = this.lastAccessed.get(id);
      if (lastBuild !== undefined && this.buildCount - lastBuild >= expiry) {
        this.modules.delete(id);
        this.lastAccessed.delete(id);
      }
    }
  }

  /** Increment the build counter. Call at the start of each build. */
  incrementBuild(): void {
    this.buildCount++;
  }

  /** Get the current build count. */
  getBuildCount(): number {
    return this.buildCount;
  }

  /** Get the number of cached modules. */
  get size(): number {
    return this.modules.size;
  }

  /** Serialize the cache for persistence. */
  serialize(): RollupCacheData {
    const modules: Array<CachedModuleData & { readonly id: string }> = [];
    for (const [id, data] of this.modules) {
      modules.push({
        id,
        code: data.code,
        ast: data.ast,
        dependencies: data.dependencies,
        transformDependencies: data.transformDependencies,
        meta: data.meta,
        syntheticNamedExports: data.syntheticNamedExports,
        moduleSideEffects: data.moduleSideEffects,
      });
    }
    return { modules };
  }
}

/**
 * Per-plugin key-value cache.
 * Implements the PluginCache interface from types.ts.
 */
export class PluginCache {
  private readonly store: Map<string, unknown>;

  constructor() {
    this.store = new Map();
  }

  /** Retrieve a value by key. Throws if key does not exist. */
  get<T = unknown>(id: string): T {
    if (!this.store.has(id)) {
      throw new Error(
        `PluginCache.get: no entry found for key "${id}". Use has() to check existence first.`,
      );
    }
    return this.store.get(id) as T;
  }

  /** Store a value by key. */
  set<T = unknown>(id: string, value: T): void {
    this.store.set(id, value);
  }

  /** Check if a key exists in the cache. */
  has(id: string): boolean {
    return this.store.has(id);
  }

  /** Delete a key from the cache. Returns true if the key existed. */
  delete(id: string): boolean {
    return this.store.delete(id);
  }

  /** Get the number of entries in the cache. */
  get size(): number {
    return this.store.size;
  }
}
