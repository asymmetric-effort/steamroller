/**
 * @module native/minifier-bridge
 * @description Bridge that routes minification through native bindings
 * when available, falling back to the pure TypeScript minifier.
 */

import type { MinifyOptions, MinifyResult } from "./types.js";
import { getNativeMinifier } from "./index.js";
import { minify as tsMinify } from "../minify/minifier.js";

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

  if (nativeMinifier) {
    try {
      const result = nativeMinifier.minify(code, options);
      if (typeof result?.code === "string") {
        return result;
      }
    } catch {
      /* native minifier failed - fall through to TS minifier */
    }
  }

  // Fallback to the TypeScript minifier
  const minified = tsMinify(code, {
    mangle: options?.mangle,
    compress: options?.compress,
  });
  return { code: minified };
};
