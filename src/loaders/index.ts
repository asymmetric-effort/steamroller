/**
 * @module loaders
 * @description Registry of built-in loaders for steamroller.
 * Exports all loader plugins and a factory function to create
 * the default set of built-in loaders based on configuration.
 */

import type { Plugin } from "../types.js";
import { jsonLoader } from "./json-loader.js";
import type { JSONLoaderOptions } from "./json-loader.js";
import { assetLoader } from "./asset-loader.js";
import type { AssetLoaderOptions } from "./asset-loader.js";
import { textLoader } from "./text-loader.js";
import type { TextLoaderOptions } from "./text-loader.js";
import { wasmLoader } from "./wasm-loader.js";
import type { WASMLoaderOptions } from "./wasm-loader.js";

export { jsonLoader } from "./json-loader.js";
export type { JSONLoaderOptions } from "./json-loader.js";
export { isJSONFile, generateJSONModule } from "./json-loader.js";

export { assetLoader } from "./asset-loader.js";
export type { AssetLoaderOptions } from "./asset-loader.js";
export {
  isAssetFile,
  parseAssetId,
  computeAssetHash,
  buildAssetFileName,
  getMimeType,
  DEFAULT_ASSET_EXTENSIONS,
} from "./asset-loader.js";

export { textLoader } from "./text-loader.js";
export type { TextLoaderOptions } from "./text-loader.js";
export {
  isTextFile,
  generateTextModule,
  DEFAULT_TEXT_EXTENSIONS,
} from "./text-loader.js";

export { wasmLoader } from "./wasm-loader.js";
export type { WASMLoaderOptions } from "./wasm-loader.js";
export { isWASMFile, generateWASMModule } from "./wasm-loader.js";

/** Options for configuring built-in loaders. */
export interface BuiltinLoaderOptions {
  /** Enable the JSON loader. Default: true */
  readonly json?: boolean | JSONLoaderOptions;
  /** Enable the asset loader. Default: true */
  readonly asset?: boolean | AssetLoaderOptions;
  /** Enable the text loader. Default: true */
  readonly text?: boolean | TextLoaderOptions;
  /** Enable the WASM loader. Default: true */
  readonly wasm?: boolean | WASMLoaderOptions;
}

/**
 * Create an array of built-in loader plugins based on configuration.
 * By default, all loaders are enabled.
 *
 * @param options - Configuration for which loaders to enable.
 * @returns An array of Plugin instances for the enabled loaders.
 */
export const createBuiltinLoaders = (
  options?: BuiltinLoaderOptions,
): ReadonlyArray<Plugin> => {
  const plugins: Array<Plugin> = [];

  // JSON loader
  const jsonOpt = options?.json ?? true;
  if (jsonOpt !== false) {
    const jsonOpts = typeof jsonOpt === "object" ? jsonOpt : undefined;
    plugins.push(jsonLoader(jsonOpts));
  }

  // Asset loader
  const assetOpt = options?.asset ?? true;
  if (assetOpt !== false) {
    const assetOpts = typeof assetOpt === "object" ? assetOpt : undefined;
    plugins.push(assetLoader(assetOpts));
  }

  // Text loader
  const textOpt = options?.text ?? true;
  if (textOpt !== false) {
    const textOpts = typeof textOpt === "object" ? textOpt : undefined;
    plugins.push(textLoader(textOpts));
  }

  // WASM loader
  const wasmOpt = options?.wasm ?? true;
  if (wasmOpt !== false) {
    const wasmOpts = typeof wasmOpt === "object" ? wasmOpt : undefined;
    plugins.push(wasmLoader(wasmOpts));
  }

  return plugins;
};
