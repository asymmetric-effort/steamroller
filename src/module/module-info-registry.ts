/**
 * @module module/module-info-registry
 * @description Registry for querying ModuleInfo from the plugin context.
 * Provides getModuleInfo and getModuleIds for the PluginContext API.
 */

import type { ModuleInfo } from "../types.js";
import type { Module } from "./Module.js";

/**
 * Stores Module instances and provides ModuleInfo lookups
 * compatible with the Rollup PluginContext API.
 */
export class ModuleInfoRegistry {
  private readonly modules: Map<string, Module>;

  constructor() {
    this.modules = new Map();
  }

  /** Register a module in the registry. */
  addModule(mod: Module): void {
    this.modules.set(mod.id, mod);
  }

  /** Remove a module from the registry by id. */
  removeModule(id: string): boolean {
    return this.modules.delete(id);
  }

  /** Check if a module exists in the registry. */
  hasModule(id: string): boolean {
    return this.modules.has(id);
  }

  /** Get the raw Module instance (internal use). */
  getModule(id: string): Module | undefined {
    return this.modules.get(id);
  }

  /**
   * Get ModuleInfo for a given module id.
   * Returns null if the module is not in the registry.
   * Compatible with PluginContext.getModuleInfo signature.
   */
  getModuleInfo(id: string): ModuleInfo | null {
    const mod = this.modules.get(id);
    if (mod === undefined) {
      return null;
    }
    return mod.toModuleInfo();
  }

  /**
   * Get an iterator over all registered module ids.
   * Compatible with PluginContext.getModuleIds signature.
   */
  getModuleIds(): IterableIterator<string> {
    return this.modules.keys();
  }

  /** Get the number of registered modules. */
  get size(): number {
    return this.modules.size;
  }

  /** Clear all modules from the registry. */
  clear(): void {
    this.modules.clear();
  }
}
