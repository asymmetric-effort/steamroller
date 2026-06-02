/**
 * Steamroller — a zero-dependency JavaScript bundler.
 *
 * Public API surface.
 */
export { VERSION } from "./version.js";
export { defineConfig } from "./define-config.js";
export type { RollupOptions, RollupOptionsFunction } from "./define-config.js";
export { parseAst, parseAstAsync } from "./parse-ast.js";
export type { ParseAstOptions } from "./parse-ast.js";
export type { ModuleInfo, ResolvedId } from "./types.js";
export { ModuleInfoRegistry } from "./module/module-info-registry.js";
export { RollupCache, PluginCache } from "./module/cache.js";
export type { CachedModuleData, RollupCacheData } from "./module/cache.js";
export { createRollupBuild } from "./build/rollup-build.js";
export type { BuildState } from "./build/rollup-build.js";
export { normalizeInputOptions } from "./config/normalize-input.js";
export { normalizeOutputOptions } from "./config/normalize-output.js";
export {
  validateInputOptions,
  validateOutputOptions,
} from "./config/validate.js";
export { rollup } from "./rollup.js";
export { build } from "./build-api.js";
export type {
  BuildOptions,
  BuildResult,
  BuildOutputFile,
  BuildMessage,
  BuildFormat,
  BuildPlatform,
} from "./build-api.js";
export { watch } from "./watch-entry.js";
export { composeSourceMaps, composeMultipleMaps } from "./sourcemap/compose.js";
export type { DecodedSourceMap, RawSourceMap } from "./sourcemap/compose.js";
export { encodeVlq, decodeVlq } from "./sourcemap/vlq.js";
export { MagicString } from "./sourcemap/magic-string.js";
export { minify } from "./minify/minifier.js";
export type { MinifyOptions } from "./minify/minifier.js";
