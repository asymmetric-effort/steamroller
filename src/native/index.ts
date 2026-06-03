/**
 * @module native
 * @description Native bindings detection and access layer.
 *
 * Attempts to load platform-specific native bindings at startup.
 * When native bindings are unavailable the module silently falls back
 * to pure TypeScript implementations - no runtime error is thrown.
 *
 * Configuration:
 * - `STEAMROLLER_NATIVE=0` disables native bindings entirely.
 * - `STEAMROLLER_NATIVE=1` forces native bindings; throws if unavailable.
 * - `STEAMROLLER_DEBUG=1` enables debug logging to stderr.
 *
 * Programmatic control via {@link NativeConfig}:
 * - `forceNative` - same as STEAMROLLER_NATIVE=1
 * - `disableNative` - same as STEAMROLLER_NATIVE=0
 */

import type {
  NativeBindings,
  NativeParser,
  NativeMinifier,
  NativeResolver,
} from "./types.js";

/**
 * Programmatic configuration for native bindings.
 */
export interface NativeConfig {
  /** Force native bindings; throw if unavailable. */
  readonly forceNative?: boolean;
  /** Disable native bindings even if available. */
  readonly disableNative?: boolean;
}

/** Module-level config that can be set programmatically. */
let moduleConfig: NativeConfig = {};

/**
 * Set the module-level native configuration.
 * Call before any native-dependent operations.
 */
export const configureNative = (config: NativeConfig): void => {
  moduleConfig = { ...config };
  debugLog(
    `configureNative: forceNative=${config.forceNative}, disableNative=${config.disableNative}`,
  );
};

/**
 * Reset configuration to defaults (useful for testing).
 */
export const resetNativeConfig = (): void => {
  moduleConfig = {};
};

/**
 * Write a debug message to stderr when STEAMROLLER_DEBUG=1 is set.
 */
const debugLog = (message: string): void => {
  if (
    typeof process !== "undefined" &&
    process.env["STEAMROLLER_DEBUG"] === "1"
  ) {
    process.stderr.write(`[steamroller:native] ${message}\n`);
  }
};

/**
 * Cached reference to native bindings, or null if unavailable.
 */
let nativeBindings: NativeBindings | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nativeBindings = require(
    `@steamroller/native-${process.platform}-${process.arch}`,
  ) as NativeBindings;
  debugLog(`loaded native bindings for ${process.platform}-${process.arch}`);
} catch {
  debugLog(
    `native bindings not available for ${process.platform}-${process.arch}`,
  );
  /* pure TS fallback - native bindings are optional */
}

/**
 * Returns true when a platform-specific native bindings package has
 * been successfully loaded.
 */
export const isNativeAvailable = (): boolean => nativeBindings !== null;

/**
 * Returns true when native bindings should be used for the current
 * operation, accounting for both environment variables and programmatic
 * configuration.
 *
 * - `STEAMROLLER_NATIVE=0` or `disableNative: true` -> always false
 * - `STEAMROLLER_NATIVE=1` or `forceNative: true` -> true, or throws
 *   if native bindings are not available
 * - Otherwise -> returns `isNativeAvailable()`
 *
 * @throws {Error} When native is forced but not available.
 */
export const shouldUseNative = (): boolean => {
  const envValue =
    typeof process !== "undefined"
      ? process.env["STEAMROLLER_NATIVE"]
      : undefined;

  // Disable takes priority
  if (envValue === "0" || moduleConfig.disableNative) {
    debugLog("native disabled by configuration");
    return false;
  }

  // Force native
  if (envValue === "1" || moduleConfig.forceNative) {
    if (!isNativeAvailable()) {
      throw new Error(
        "Native bindings forced (STEAMROLLER_NATIVE=1 or forceNative) but not available",
      );
    }
    debugLog("native forced and available");
    return true;
  }

  // Default: use native if available
  const available = isNativeAvailable();
  debugLog(`native auto-detect: available=${available}`);
  return available;
};

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
