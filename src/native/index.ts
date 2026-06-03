/**
 * @module native
 * @description Native bindings detection and access layer.
 *
 * Attempts to load platform-specific native bindings at startup.
 * When native bindings are unavailable the module silently falls back
 * to pure TypeScript implementations - no runtime error is thrown.
 */

import type {
  NativeBindings,
  NativeParser,
  NativeMinifier,
  NativeResolver,
} from "./types.js";

/**
 * Cached reference to native bindings, or null if unavailable.
 */
let nativeBindings: NativeBindings | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nativeBindings = require(
    `@steamroller/native-${process.platform}-${process.arch}`,
  ) as NativeBindings;
} catch {
  /* pure TS fallback - native bindings are optional */
}

/**
 * Returns true when a platform-specific native bindings package has
 * been successfully loaded.
 */
export const isNativeAvailable = (): boolean => nativeBindings !== null;

/**
 * Returns the native parser implementation, or null when native
 * bindings are not available.
 */
export const getNativeParser = (): NativeParser | null =>
  nativeBindings?.parser ?? null;

/**
 * Returns the native minifier implementation, or null when native
 * bindings are not available.
 */
export const getNativeMinifier = (): NativeMinifier | null =>
  nativeBindings?.minifier ?? null;

/**
 * Returns the native resolver implementation, or null when native
 * bindings are not available.
 */
export const getNativeResolver = (): NativeResolver | null =>
  nativeBindings?.resolver ?? null;

export type {
  NativeBindings,
  NativeParser,
  NativeMinifier,
  NativeResolver,
} from "./types.js";
