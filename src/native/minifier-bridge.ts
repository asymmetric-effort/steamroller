/**
 * @module native/minifier-bridge
 * @description Bridge that routes minification through native bindings
 * when available, falling back to the pure TypeScript minifier.
 *
 * In debug mode (`STEAMROLLER_DEBUG=1`) the bridge logs which backend
 * was used and comparative timing information.
 */

import type { MinifyOptions, MinifyResult } from "./types.js";
import { getNativeMinifier } from "./index.js";
import { minify as tsMinify } from "../minify/minifier.js";

/**
 * Write a debug message to stderr when STEAMROLLER_DEBUG=1 is set.
 */
const debugLog = (message: string): void => {
  if (
    typeof process !== "undefined" &&
    process.env["STEAMROLLER_DEBUG"] === "1"
  ) {
    process.stderr.write(`[steamroller:native:minifier] ${message}\n`);
  }
};

/**
 * Minify JavaScript source code.
 *
 * When native bindings are loaded the native minifier is tried first.
 * If it fails or is unavailable the TypeScript minifier is used instead.
 *
 * @param code - The JavaScript source code to minify.
 * @param options - Optional minification configuration.
 * @returns An object containing the minified code and optional source map.
 */
export const minifyWithNative = (
  code: string,
  options?: MinifyOptions,
): MinifyResult => {
  const nativeMinifier = getNativeMinifier();
  const debug =
    typeof process !== "undefined" && process.env["STEAMROLLER_DEBUG"] === "1";

  if (nativeMinifier) {
    const start = debug ? performance.now() : 0;
    try {
      const result = nativeMinifier.minify(code, options);
      if (typeof result?.code === "string") {
        if (debug) {
          const elapsed = performance.now() - start;
          debugLog(`native minifier succeeded in ${elapsed.toFixed(2)}ms`);
        }
        return result;
      }
      debugLog("native minifier returned invalid result, falling back to TS");
    } catch (err) {
      debugLog(`native minifier failed: ${err}, falling back to TS`);
      /* native minifier failed - fall through to TS minifier */
    }
  }

  // Fallback to the TypeScript minifier
  const start = debug ? performance.now() : 0;
  const minified = tsMinify(code, {
    mangle: options?.mangle,
    compress: options?.compress,
  });
  if (debug) {
    const elapsed = performance.now() - start;
    debugLog(`TS minifier completed in ${elapsed.toFixed(2)}ms`);
  }
  return { code: minified };
};
