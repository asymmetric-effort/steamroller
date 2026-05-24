/**
 * @module module/resolve
 * @description Module resolution pipeline providing default path resolution,
 * external detection, and plugin hook integration for the resolveId pipeline.
 */

import { resolve, dirname, isAbsolute } from "node:path";
import { normalizePath } from "../utils/path.js";
import type { ExternalOption, NullValue, ResolvedId } from "../types.js";

/**
 * Options controlling module resolution behavior.
 */
export interface ResolveOptions {
  readonly external?: ExternalOption;
  readonly makeAbsoluteExternalsRelative?: boolean | "ifRelativeSource";
  readonly preserveSymlinks?: boolean;
}

/**
 * Plugin hook signature for resolveId.
 */
export type ResolveIdHook = (
  source: string,
  importer: string | undefined,
  options: {
    readonly isEntry: boolean;
    readonly attributes: Readonly<Record<string, string>>;
  },
) => ResolveIdHookResult | Promise<ResolveIdHookResult>;

/**
 * Possible return types from a resolveId hook.
 */
export type ResolveIdHookResult = ResolvedId | string | null | undefined | void;

/**
 * Resolve a source path using default resolution logic.
 * Handles absolute paths and relative paths (resolved against the importer).
 * Returns null for bare specifiers or when importer is missing for relative paths.
 *
 * @param source - The import specifier to resolve
 * @param importer - The module that contains the import statement
 * @returns The resolved absolute path or null if not resolvable
 */
export const defaultResolve = (
  source: string,
  importer: string | undefined,
): string | null => {
  if (isAbsolute(source)) {
    return normalizePath(source);
  }
  if (source.startsWith("./") || source.startsWith("../")) {
    if (!importer) {
      return null;
    }
    const dir = dirname(importer);
    return normalizePath(resolve(dir, source));
  }
  // Bare specifier — cannot resolve without plugin
  return null;
};

/**
 * Check if a module ID should be treated as external.
 *
 * @param id - The resolved module ID
 * @param source - The original import specifier
 * @param importer - The importing module
 * @param external - The external option configuration
 * @returns Whether the module is external
 */
export const isExternal = (
  id: string,
  source: string,
  importer: string | undefined,
  external: ExternalOption | undefined,
): boolean => {
  if (!external) {
    return false;
  }

  if (typeof external === "function") {
    const result: boolean | NullValue = external(
      source,
      importer,
      id === source,
    );
    return result === true;
  }

  if (typeof external === "string") {
    return id === external || source === external;
  }

  if (external instanceof RegExp) {
    return external.test(source);
  }

  if (Array.isArray(external)) {
    for (const ext of external) {
      if (typeof ext === "string") {
        if (id === ext || source === ext) {
          return true;
        }
      } else if (ext instanceof RegExp) {
        if (ext.test(source)) {
          return true;
        }
      }
    }
    return false;
  }

  return false;
};

/**
 * Build a default ResolvedId object from a resolved path and external status.
 */
const buildResolvedId = (
  id: string,
  ext: boolean,
  resolvedBy: string,
): ResolvedId => ({
  id,
  external: ext,
  moduleSideEffects: true,
  syntheticNamedExports: false,
  meta: {},
  resolvedBy,
});

/**
 * Normalize a hook result into a full ResolvedId.
 */
const normalizeHookResult = (result: ResolvedId | string): ResolvedId => {
  if (typeof result === "string") {
    return buildResolvedId(normalizePath(result), false, "plugin");
  }
  return {
    id: result.id,
    external: result.external,
    moduleSideEffects: result.moduleSideEffects,
    syntheticNamedExports: result.syntheticNamedExports,
    meta: result.meta,
    resolvedBy: result.resolvedBy ?? "plugin",
  };
};

/**
 * Full module resolution pipeline.
 *
 * Resolution order:
 * 1. Plugin hooks (first non-null result wins)
 * 2. Default path resolution (relative/absolute)
 * 3. External detection
 *
 * @param source - The import specifier to resolve
 * @param importer - The module that contains the import
 * @param options - Resolution options (external config, etc.)
 * @param pluginHooks - Ordered array of plugin resolveId hooks
 * @param isEntry - Whether this is an entry point resolution
 * @param attributes - Import attributes (e.g., type assertions)
 * @returns The resolved module ID or null if unresolvable
 */
export const resolveId = async (
  source: string,
  importer: string | undefined,
  options: ResolveOptions,
  pluginHooks: ReadonlyArray<ResolveIdHook>,
  isEntry: boolean,
  attributes: Readonly<Record<string, string>>,
): Promise<ResolvedId | null> => {
  // 1. Try plugin hooks (first non-null wins)
  for (const hook of pluginHooks) {
    const result = await hook(source, importer, { isEntry, attributes });
    if (result != null) {
      return normalizeHookResult(result as ResolvedId | string);
    }
  }

  // 2. Default resolution
  const resolved = defaultResolve(source, importer);
  if (!resolved) {
    return null;
  }

  // 3. Check external
  const ext = isExternal(resolved, source, importer, options.external);

  return buildResolvedId(resolved, ext, "default");
};
