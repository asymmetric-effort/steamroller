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
