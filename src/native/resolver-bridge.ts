/**
 * @module native/resolver-bridge
 * @description Bridge that routes module resolution through native
 * bindings when available, falling back to the TypeScript resolver.
 */

import { getNativeResolver } from "./index.js";
import { defaultResolve } from "../module/resolve.js";

/**
 * Resolve a module specifier to an absolute path.
 *
 * When native bindings are loaded the native resolver is tried first.
 * If it fails or returns null the TypeScript resolver is used instead.
 *
 * @param specifier - The module specifier to resolve (e.g. "./foo").
 * @param importer - The absolute path of the importing module.
 * @returns The resolved absolute path, or null if unresolvable.
 */
export const resolveWithNative = (
  specifier: string,
  importer: string,
): string | null => {
  const nativeResolver = getNativeResolver();

  if (nativeResolver) {
    try {
      const result = nativeResolver.resolve(specifier, importer);
      if (typeof result === "string") {
        return result;
      }
    } catch {
      /* native resolver failed - fall through to TS resolver */
    }
  }

  // Fallback to the TypeScript resolver
  return defaultResolve(specifier, importer);
};
