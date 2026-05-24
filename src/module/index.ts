/**
 * @module module
 * @description Module graph node types for internal and external modules.
 */

export { Module } from "./Module.js";
export type { ImportDescriptor, ExportDescriptor } from "./Module.js";
export { ExternalModule } from "./ExternalModule.js";
export { ModuleInfoRegistry } from "./module-info-registry.js";
export { RollupCache, PluginCache } from "./cache.js";
export type { CachedModuleData, RollupCacheData } from "./cache.js";
