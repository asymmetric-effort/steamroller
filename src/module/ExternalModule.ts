/**
 * @module module/ExternalModule
 * @description Represents an external (non-bundled) module dependency.
 * Tracks which internal modules import it and what bindings they use.
 */

import type { Module } from "./Module.js";

/**
 * Represents a module that is marked as external and will not be bundled.
 * Tracks importers and their requested bindings for output generation.
 */
export class ExternalModule {
  readonly id: string;
  readonly isExternal: true = true;

  /** Set of internal modules that import this external module. */
  readonly importers: Set<Module>;

  /** Maps importer module IDs to the set of bindings they import. */
  readonly importedBindings: Map<string, Set<string>>;

  /** Renamed path from output.paths option, or null if unchanged. */
  renameId: string | null;

  constructor(id: string) {
    this.id = id;
    this.importers = new Set();
    this.importedBindings = new Map();
    this.renameId = null;
  }

  /** Register an importing module and the bindings it uses. */
  addImporter(module: Module, bindings: ReadonlyArray<string>): void {
    this.importers.add(module);
    const existing = this.importedBindings.get(module.id);
    if (existing !== undefined) {
      for (let i = 0; i < bindings.length; i++) {
        existing.add(bindings[i]);
      }
    } else {
      const bindingSet = new Set<string>();
      for (let i = 0; i < bindings.length; i++) {
        bindingSet.add(bindings[i]);
      }
      this.importedBindings.set(module.id, bindingSet);
    }
  }
}
