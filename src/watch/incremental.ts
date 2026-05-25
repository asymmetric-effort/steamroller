/**
 * @module watch/incremental
 * @description Incremental rebuild support using RollupCache.
 * Determines which modules need re-parsing/transformation based on
 * changed files and passes cache between builds for faster rebuilds.
 */

import type {
  InputOptions,
  ModuleJSON,
  RollupBuild,
  RollupCache,
} from "../types.js";
import { createRollupBuild } from "../build/rollup-build.js";

/**
 * Determines whether a module should be rebuilt based on changed files.
 * A module needs rebuilding if its ID matches a changed file or if any
 * of its transform dependencies have changed.
 *
 * @param id - The module identifier
 * @param cache - The previous build cache
 * @param changedFiles - Set of file paths that have changed
 * @returns True if the module should be rebuilt
 */
export const shouldRebuildModule = (
  id: string,
  cache: RollupCache | undefined,
  changedFiles: ReadonlySet<string>,
): boolean => {
  if (changedFiles.has(id)) {
    return true;
  }

  if (!cache || !cache.modules) {
    return true;
  }

  const cachedModule = findCachedModule(cache.modules, id);
  if (!cachedModule) {
    return true;
  }

  for (let i = 0; i < cachedModule.transformDependencies.length; i++) {
    if (changedFiles.has(cachedModule.transformDependencies[i])) {
      return true;
    }
  }

  for (let i = 0; i < cachedModule.dependencies.length; i++) {
    if (changedFiles.has(cachedModule.dependencies[i])) {
      return true;
    }
  }

  return false;
};

/**
 * Finds a cached module by ID using linear search.
 *
 * @param modules - Array of cached module data
 * @param id - Module identifier to find
 * @returns The cached module or undefined
 */
const findCachedModule = (
  modules: ReadonlyArray<ModuleJSON>,
  id: string,
): ModuleJSON | undefined => {
  for (let i = 0; i < modules.length; i++) {
    if (modules[i].id === id) {
      return modules[i];
    }
  }
  return undefined;
};

/**
 * Creates an incremental build using a previous build's cache.
 * Passes the cache to the input options so that unchanged modules
 * can skip parsing and transformation.
 *
 * @param options - Input options for the build
 * @param cache - Cache from a previous build (undefined for first build)
 * @returns A Promise resolving to the completed RollupBuild
 */
export const createIncrementalBuild = async (
  options: InputOptions,
  cache: RollupCache | undefined,
): Promise<RollupBuild> => {
  const optionsWithCache: InputOptions = cache
    ? { ...options, cache }
    : options;

  const watchFiles: Array<string> = [];

  if (optionsWithCache.cache && typeof optionsWithCache.cache === "object") {
    const cacheObj = optionsWithCache.cache as RollupCache;
    for (let i = 0; i < cacheObj.modules.length; i++) {
      watchFiles.push(cacheObj.modules[i].id);
    }
  }

  const build = createRollupBuild({
    modules: [],
    cache:
      optionsWithCache.cache === false
        ? undefined
        : extractCache(optionsWithCache.cache),
    watchFiles,
  });

  return build;
};

/**
 * Extracts a valid RollupCache from the cache option.
 *
 * @param cache - The cache option (boolean or RollupCache)
 * @returns A RollupCache object or undefined
 */
const extractCache = (
  cache: boolean | RollupCache | undefined,
): RollupCache | undefined => {
  if (cache === true || cache === false || cache === undefined) {
    return undefined;
  }
  return cache;
};

/**
 * Filters a cache to only include modules that do not need rebuilding.
 * Used to create a partial cache for incremental builds.
 *
 * @param cache - The full build cache
 * @param changedFiles - Set of changed file paths
 * @returns A new cache with only unchanged modules
 */
export const filterCacheByChangedFiles = (
  cache: RollupCache,
  changedFiles: ReadonlySet<string>,
): RollupCache => {
  const filteredModules: Array<ModuleJSON> = [];

  for (let i = 0; i < cache.modules.length; i++) {
    const mod = cache.modules[i];
    if (!shouldRebuildModule(mod.id, cache, changedFiles)) {
      filteredModules.push(mod);
    }
  }

  return {
    modules: filteredModules,
    plugins: cache.plugins,
  };
};
