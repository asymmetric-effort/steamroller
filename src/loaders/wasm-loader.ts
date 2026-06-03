/**
 * @module loaders/wasm-loader
 * @description Built-in WASM loader for steamroller.
 * Handles .wasm imports by emitting the .wasm file as an asset and
 * returning a JS module that exports an async init function.
 */

import type { Plugin, LoadResult } from "../types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

/** Options for the WASM loader plugin. */
export interface WASMLoaderOptions {
  /** Output directory prefix for WASM asset URLs. Default: "assets" */
  readonly outputDir?: string;
}

/**
 * Check whether a module ID is a WASM file.
 *
 * @param id - The module ID / file path.
 * @returns True if the file has a .wasm extension.
 */
export const isWASMFile = (id: string): boolean => {
  const cleanId = id.split("?")[0];
  return cleanId.endsWith(".wasm");
};

/**
 * Compute a short content hash for a file.
 *
 * @param content - The file content as a Buffer.
 * @returns An 8-character hex hash.
 */
const computeHash = (content: Buffer): string => {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 8);
};

/**
 * Generate a JS module that exports an async init function for a WASM file.
 *
 * @param assetPath - The output path of the emitted WASM asset.
 * @returns ES module source code with an init function.
 */
export const generateWASMModule = (assetPath: string): string => {
  return [
    `const wasmPath = "${assetPath}";`,
    ``,
    `export async function init(importObject = {}) {`,
    `  const response = await fetch(wasmPath);`,
    `  const bytes = await response.arrayBuffer();`,
    `  const { instance, module } = await WebAssembly.instantiate(bytes, importObject);`,
    `  return { instance, module };`,
    `}`,
    ``,
    `export default init;`,
    ``,
  ].join("\n");
};

/**
 * Create the built-in WASM loader plugin.
 *
 * @param options - Plugin options.
 * @returns A Plugin that handles .wasm imports.
 */
export const wasmLoader = (options?: WASMLoaderOptions): Plugin => {
  const outputDir = options?.outputDir ?? "assets";

  return {
    name: "steamroller:wasm",

    resolveId(source: string) {
      if (!isWASMFile(source)) {
        return null;
      }
      return null;
    },

    load(id: string): LoadResult {
      if (!isWASMFile(id)) {
        return null;
      }

      const cleanId = id.split("?")[0];

      let content: Buffer;
      try {
        content = fs.readFileSync(cleanId);
      } catch {
        return null;
      }

      const hash = computeHash(content);
      const ext = path.extname(cleanId);
      const base = path.basename(cleanId, ext);
      const assetFileName = `${base}-${hash}${ext}`;
      const assetPath = `${outputDir}/${assetFileName}`;

      const code = generateWASMModule(assetPath);

      return {
        code,
        map: { mappings: "" },
        meta: {
          asset: {
            fileName: assetFileName,
            source: content,
            outputPath: assetPath,
          },
        },
      };
    },
  };
};
