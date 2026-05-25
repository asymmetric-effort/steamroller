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
export { watch } from "./watch-entry.js";
