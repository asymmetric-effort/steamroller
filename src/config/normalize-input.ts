/**
 * @module config/normalize-input
 * @description Normalizes raw InputOptions into fully resolved
 * NormalizedInputOptions with defaults, function forms, and validation.
 */

import type {
  InputOptions,
  InputOption,
  ExternalOption,
  InputPluginOption,
  LogLevel,
  LogHandler,
  NormalizedInputOptions,
  NormalizedTreeshakingOptions,
  Plugin,
  NullValue,
  RollupCache as RollupCacheType,
  PreserveEntrySignaturesOption,
} from "../types.js";
import { normalizeTreeshakeOptions } from "../tree-shaking/options.js";

/** Default context value for modules. */
const DEFAULT_CONTEXT = "undefined";

/** Default log level. */
const DEFAULT_LOG_LEVEL: LogLevel = "info";

/** Default max parallel file operations. */
const DEFAULT_MAX_PARALLEL_FILE_OPS = 20;

/** Default cache expiry in builds. */
const DEFAULT_CACHE_EXPIRY = 10;

/**
 * Normalize the `input` option into a record or array form.
 *
 * @param input - Raw input option (string, array, or record).
 * @returns Normalized input as a record or array.
 */
export const normalizeInput = (
  input: InputOption | undefined,
): ReadonlyArray<string> | Readonly<Record<string, string>> => {
  if (input === undefined || input === null) {
    return [];
  }
  if (typeof input === "string") {
    return { main: input };
  }
  if (Array.isArray(input)) {
    if (input.length === 0) {
      return [];
    }
    const result: Record<string, string> = {};
    for (let i = 0; i < input.length; i++) {
      result[String(i)] = input[i] as string;
    }
    return result;
  }
  return input as Readonly<Record<string, string>>;
};

/**
 * Normalize the `external` option into a predicate function.
 *
 * @param external - Raw external option.
 * @returns A function that tests whether a source is external.
 */
export const normalizeExternal = (
  external: ExternalOption | undefined,
): ((
  source: string,
  importer: string | undefined,
  isResolved: boolean,
) => boolean) => {
  if (external === undefined || external === null) {
    return () => false;
  }
  if (typeof external === "function") {
    return (
      source: string,
      importer: string | undefined,
      isResolved: boolean,
    ): boolean => {
      const result = external(source, importer, isResolved);
      return result === true;
    };
  }
  if (typeof external === "string") {
    const externalId = external;
    return (source: string) => source === externalId;
  }
  if (external instanceof RegExp) {
    const pattern = external;
    return (source: string) => pattern.test(source);
  }
  // Array of string | RegExp
  const matchers = (external as Array<string | RegExp>).map(
    (item: string | RegExp) => {
      if (typeof item === "string") {
        return (source: string) => source === item;
      }
      return (source: string) => item.test(source);
    },
  );
  return (source: string) => {
    for (let i = 0; i < matchers.length; i++) {
      if (matchers[i](source)) {
        return true;
      }
    }
    return false;
  };
};

/**
 * Flatten and filter plugins from potentially nested arrays.
 * Removes null, undefined, and false values.
 *
 * @param plugins - Raw plugin option array.
 * @returns Flat array of valid plugins.
 */
export const normalizePlugins = (
  plugins: ReadonlyArray<InputPluginOption> | undefined,
): ReadonlyArray<Plugin> => {
  if (!plugins) {
    return [];
  }
  const result: Array<Plugin> = [];
  const stack: Array<unknown> = [...plugins];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === null || item === undefined || item === false) {
      continue;
    }
    if (Array.isArray(item)) {
      for (let i = 0; i < item.length; i++) {
        stack.push(item[i]);
      }
      continue;
    }
    // Treat promises as resolved plugins (synchronous path)
    if (
      typeof item === "object" &&
      "name" in (item as Record<string, unknown>)
    ) {
      result.push(item as Plugin);
    }
  }
  return result.reverse();
};

/**
 * Normalize the moduleContext option into a function.
 *
 * @param moduleContext - Raw moduleContext option.
 * @param defaultContext - Default context value.
 * @returns A function that returns the context string for a given module id.
 */
export const normalizeModuleContext = (
  moduleContext:
    | ((id: string) => string | null | undefined)
    | Readonly<Record<string, string>>
    | undefined,
  defaultContext: string,
): ((id: string) => string) => {
  if (moduleContext === undefined || moduleContext === null) {
    return () => defaultContext;
  }
  if (typeof moduleContext === "function") {
    return (id: string): string => {
      const result = moduleContext(id);
      return result ?? defaultContext;
    };
  }
  // Record form
  const map = moduleContext;
  return (id: string): string => {
    const value = (map as Record<string, string>)[id];
    return value ?? defaultContext;
  };
};

/**
 * Create a default onLog handler that passes to onwarn for warnings.
 *
 * @param onwarn - Optional onwarn handler from options.
 * @returns A LogHandler function.
 */
const createDefaultOnLog = (onwarn: InputOptions["onwarn"]): LogHandler => {
  return (_level, _log) => {
    if (onwarn && _level === "warn") {
      onwarn(_log, () => {});
    }
  };
};

/**
 * Normalize the cache option.
 *
 * @param cache - Raw cache option (boolean or RollupCache).
 * @returns Normalized cache (RollupCache or false).
 */
const normalizeCache = (
  cache: boolean | RollupCacheType | undefined,
): RollupCacheType | false => {
  if (cache === false) {
    return false;
  }
  if (cache === true || cache === undefined) {
    return false;
  }
  return cache;
};

/**
 * Normalize raw InputOptions into fully resolved NormalizedInputOptions.
 *
 * Sets defaults for all options, converts shorthand forms to functions,
 * and applies tree-shaking normalization.
 *
 * @param options - Raw input options from the user.
 * @returns Fully normalized input options.
 */
export const normalizeInputOptions = (
  options: InputOptions,
): NormalizedInputOptions => {
  const context = options.context ?? DEFAULT_CONTEXT;
  const treeshake: NormalizedTreeshakingOptions | false =
    normalizeTreeshakeOptions(options.treeshake);

  return {
    cache: normalizeCache(options.cache),
    context,
    experimentalCacheExpiry:
      options.experimentalCacheExpiry ?? DEFAULT_CACHE_EXPIRY,
    experimentalLogSideEffects: options.experimentalLogSideEffects ?? false,
    external: normalizeExternal(options.external),
    input: normalizeInput(options.input),
    logLevel: options.logLevel ?? DEFAULT_LOG_LEVEL,
    makeAbsoluteExternalsRelative:
      options.makeAbsoluteExternalsRelative ?? "ifRelativeSource",
    maxParallelFileOps:
      options.maxParallelFileOps ?? DEFAULT_MAX_PARALLEL_FILE_OPS,
    moduleContext: normalizeModuleContext(options.moduleContext, context),
    onLog: options.onLog ?? createDefaultOnLog(options.onwarn),
    perf: options.perf ?? false,
    plugins: normalizePlugins(
      options.plugins as ReadonlyArray<InputPluginOption> | undefined,
    ),
    preserveEntrySignatures:
      (options.preserveEntrySignatures as PreserveEntrySignaturesOption) ??
      "exports-only",
    preserveSymlinks: options.preserveSymlinks ?? false,
    shimMissingExports: options.shimMissingExports ?? false,
    strictDeprecations: options.strictDeprecations ?? false,
    treeshake,
  };
};
