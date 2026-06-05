/**
 * @module server/module-graph
 * @description Dependency tracking for HMR. Tracks which modules import which
 * and walks importers on change to find HMR boundaries.
 */

/** A node in the module dependency graph. */
export interface ModuleNode {
  /** Absolute file path or URL of the module. */
  readonly id: string;
  /** Modules that this module imports. */
  readonly importedModules: Set<ModuleNode>;
  /** Modules that import this module. */
  readonly importers: Set<ModuleNode>;
  /** Whether this module accepts its own HMR updates. */
  acceptsSelfUpdate: boolean;
  /** Set of imported module IDs whose updates this module accepts. */
  readonly acceptedDeps: Set<string>;
  /** Last transform timestamp for cache busting. */
  lastTransformTimestamp: number;
}

/** Result of propagating an invalidation through the graph. */
export interface HmrPropagationResult {
  /** Modules that need to be updated (within HMR boundaries). */
  readonly modulesToUpdate: ReadonlyArray<ModuleNode>;
  /** Whether a full page reload is required (no HMR boundary found). */
  readonly needsFullReload: boolean;
}

/**
 * Tracks module dependencies for HMR boundary detection.
 */
export class ModuleGraph {
  private readonly urlToModuleMap: Map<string, ModuleNode> = new Map();

  /**
   * Get or create a module node for the given ID.
   *
   * @param id - Module identifier (typically an absolute path)
   * @returns The module node
   */
  ensureModule(id: string): ModuleNode {
    let node = this.urlToModuleMap.get(id);
    if (node) {
      return node;
    }
    node = {
      id,
      importedModules: new Set(),
      importers: new Set(),
      acceptsSelfUpdate: false,
      acceptedDeps: new Set(),
      lastTransformTimestamp: Date.now(),
    };
    this.urlToModuleMap.set(id, node);
    return node;
  }

  /**
   * Get a module node by ID, or undefined if not tracked.
   *
   * @param id - Module identifier
   * @returns The module node or undefined
   */
  getModule(id: string): ModuleNode | undefined {
    return this.urlToModuleMap.get(id);
  }

  /**
   * Update the import relationships for a module.
   * Removes stale edges and adds new ones.
   *
   * @param importerId - The module doing the importing
   * @param importedIds - The set of module IDs it imports
   */
  updateModule(importerId: string, importedIds: ReadonlyArray<string>): void {
    const importer = this.ensureModule(importerId);

    // Remove old import edges
    for (const oldImported of importer.importedModules) {
      oldImported.importers.delete(importer);
    }
    importer.importedModules.clear();

    // Add new import edges
    for (let i = 0; i < importedIds.length; i++) {
      const imported = this.ensureModule(importedIds[i]);
      importer.importedModules.add(imported);
      imported.importers.add(importer);
    }
  }

  /**
   * Mark a module as accepting its own hot updates.
   *
   * @param id - Module identifier
   */
  markSelfAccepting(id: string): void {
    const node = this.ensureModule(id);
    node.acceptsSelfUpdate = true;
  }

  /**
   * Mark a module as accepting updates from specific dependencies.
   *
   * @param id - Module identifier
   * @param deps - Dependency IDs whose updates are accepted
   */
  markAcceptedDeps(id: string, deps: ReadonlyArray<string>): void {
    const node = this.ensureModule(id);
    for (let i = 0; i < deps.length; i++) {
      node.acceptedDeps.add(deps[i]);
    }
  }

  /**
   * Invalidate a module and propagate up the importer tree to find
   * HMR boundaries. If no boundary is found, a full reload is needed.
   *
   * @param id - The changed module identifier
   * @returns Which modules need updating and whether a full reload is required
   */
  propagateUpdate(id: string): HmrPropagationResult {
    const node = this.urlToModuleMap.get(id);
    if (!node) {
      return { modulesToUpdate: [], needsFullReload: false };
    }

    node.lastTransformTimestamp = Date.now();

    // If the changed module accepts its own updates, it is the boundary
    if (node.acceptsSelfUpdate) {
      return { modulesToUpdate: [node], needsFullReload: false };
    }

    const modulesToUpdate: ModuleNode[] = [];
    const visited = new Set<string>();
    let needsFullReload = false;

    const walk = (current: ModuleNode): boolean => {
      if (visited.has(current.id)) {
        return true;
      }
      visited.add(current.id);

      if (current.importers.size === 0) {
        // Reached a root with no HMR boundary
        return false;
      }

      for (const importer of current.importers) {
        if (importer.acceptedDeps.has(current.id)) {
          modulesToUpdate.push(importer);
          continue;
        }
        if (importer.acceptsSelfUpdate) {
          modulesToUpdate.push(importer);
          continue;
        }
        if (!walk(importer)) {
          return false;
        }
      }

      return true;
    };

    if (!walk(node)) {
      needsFullReload = true;
    }

    return { modulesToUpdate, needsFullReload };
  }

  /**
   * Remove a module and all its edges from the graph.
   *
   * @param id - Module identifier to remove
   */
  removeModule(id: string): void {
    const node = this.urlToModuleMap.get(id);
    if (!node) {
      return;
    }
    for (const imported of node.importedModules) {
      imported.importers.delete(node);
    }
    for (const importer of node.importers) {
      importer.importedModules.delete(node);
    }
    this.urlToModuleMap.delete(id);
  }

  /**
   * Return all tracked module IDs.
   */
  getModuleIds(): ReadonlyArray<string> {
    return Array.from(this.urlToModuleMap.keys());
  }

  /**
   * Return the total number of tracked modules.
   */
  get size(): number {
    return this.urlToModuleMap.size;
  }
}
