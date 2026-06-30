/**
 * @module module/graph
 * @description Module graph construction using iterative BFS traversal.
 * Builds the complete dependency graph from entry points, detects circular
 * dependencies, and produces a topologically sorted module ordering.
 */

import { Module } from "./Module.js";
import { ExternalModule } from "./ExternalModule.js";
import type { ResolvedId } from "../types.js";
import {
  CIRCULAR_DEPENDENCY,
  UNRESOLVED_ENTRY,
  UNRESOLVED_IMPORT,
  SHIMMED_EXPORT,
} from "../utils/error-codes.js";

/** Options for building the module graph. */
export interface GraphOptions {
  readonly input:
    string | ReadonlyArray<string> | Readonly<Record<string, string>>;
  readonly resolveId: (
    source: string,
    importer: string | undefined,
    isEntry: boolean,
  ) => Promise<ResolvedId | null>;
  readonly resolveDynamicImport?: (
    specifier: string,
    importer: string,
  ) => Promise<ResolvedId | string | null>;
  readonly loadModule: (id: string) => Promise<{
    code: string;
    ast: unknown;
    meta: Record<string, unknown>;
    moduleSideEffects: boolean | "no-treeshake";
    syntheticNamedExports: boolean | string;
  }>;
  readonly onWarning: (warning: {
    code: string;
    message: string;
    [key: string]: unknown;
  }) => void;
  readonly shimMissingExports?: boolean;
}

/** The constructed module graph. */
export interface ModuleGraph {
  readonly modules: ReadonlyArray<Module>;
  readonly externalModules: ReadonlyArray<ExternalModule>;
  readonly entryModules: ReadonlyArray<Module>;
  readonly orderedModules: ReadonlyArray<Module>;
}

/** BFS queue item for graph traversal. */
interface QueueItem {
  readonly source: string;
  readonly importer: string | undefined;
  readonly isEntry: boolean;
  readonly isDynamicImport?: boolean;
}

/**
 * Normalize the input option to a Record<string, string>.
 *
 * @param input - String, array of strings, or record
 * @returns Normalized record mapping chunk names to entry file paths
 */
export const normalizeInput = (
  input: string | ReadonlyArray<string> | Readonly<Record<string, string>>,
): Record<string, string> => {
  if (typeof input === "string") {
    return { main: input };
  }
  if (Array.isArray(input)) {
    const result: Record<string, string> = {};
    for (let i = 0; i < input.length; i++) {
      const entry = input[i] as string;
      const name = entry.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
      result[name] = entry;
    }
    return result;
  }
  return { ...(input as Record<string, string>) };
};

/**
 * Detect circular dependencies using iterative DFS with three-color marking.
 * White = unvisited, Gray = in current path, Black = fully processed.
 *
 * @param modules - The map of all resolved modules
 * @returns Array of detected cycles, each as an array of module IDs
 */
export const detectCircularDependencies = (
  modules: Map<string, Module>,
): ReadonlyArray<ReadonlyArray<string>> => {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  for (const id of modules.keys()) {
    color.set(id, WHITE);
  }

  const cycles: Array<ReadonlyArray<string>> = [];

  for (const startId of modules.keys()) {
    if (color.get(startId) !== WHITE) {
      continue;
    }

    // Iterative DFS using explicit stack
    // Each frame: [moduleId, iterator index into dependencies array]
    const depsArrayCache = new Map<string, Array<Module>>();
    const stack: Array<{ id: string; depIndex: number }> = [];
    const path: Array<string> = [];

    color.set(startId, GRAY);
    path.push(startId);
    stack.push({ id: startId, depIndex: 0 });

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const mod = modules.get(frame.id)!;

      // Get internal dependencies as array (cached)
      let deps = depsArrayCache.get(frame.id);
      if (deps === undefined) {
        deps = [];
        for (const dep of mod.dependencies) {
          if (dep instanceof Module) {
            deps.push(dep);
          }
        }
        depsArrayCache.set(frame.id, deps);
      }

      if (frame.depIndex >= deps.length) {
        // All children processed
        color.set(frame.id, BLACK);
        path.pop();
        stack.pop();
        continue;
      }

      const child = deps[frame.depIndex];
      frame.depIndex++;

      const childColor = color.get(child.id);
      if (childColor === GRAY) {
        // Found a cycle - extract from path
        const cycleStart = path.indexOf(child.id);
        if (cycleStart !== -1) {
          const cycle = [...path.slice(cycleStart), child.id];
          cycles.push(cycle);
        }
      } else if (childColor === WHITE) {
        color.set(child.id, GRAY);
        path.push(child.id);
        stack.push({ id: child.id, depIndex: 0 });
      }
    }
  }

  return cycles;
};

/**
 * Iterative topological sort using Kahn's algorithm.
 * Produces a stable ordering for deterministic builds.
 *
 * @param modules - Map of all resolved modules
 * @param entries - Entry modules to begin from
 * @returns Modules in topological order (dependencies before dependents)
 */
export const topologicalSort = (
  modules: Map<string, Module>,
  entries: ReadonlyArray<Module>,
): ReadonlyArray<Module> => {
  // Calculate in-degree for each module (only counting internal deps)
  const inDegree = new Map<string, number>();
  for (const id of modules.keys()) {
    inDegree.set(id, 0);
  }

  for (const mod of modules.values()) {
    for (const dep of mod.dependencies) {
      if (dep instanceof Module && modules.has(dep.id)) {
        const current = inDegree.get(dep.id) ?? 0;
        inDegree.set(dep.id, current + 1);
      }
    }
  }

  // Wait — Kahn's uses in-degree of incoming edges.
  // In a dependency graph: if A depends on B, then A -> B is an edge.
  // For topological sort we want B before A.
  // So in-degree = number of modules that depend on this module? No.
  // Actually: edge A -> B means A must come after B.
  // Reversed: for Kahn's, edge direction is "B must come before A" = A depends on B.
  // In-degree of a node = number of nodes it depends on? No.
  // Standard Kahn's: if there's an edge from U to V, then U comes before V.
  // We want dependencies before dependents, so edge from dep -> dependent.
  // In-degree of dependent = number of its dependencies.

  // Recalculate: in-degree of each module = number of internal modules it depends on
  const correctedInDegree = new Map<string, number>();
  for (const [id, mod] of modules) {
    let count = 0;
    for (const dep of mod.dependencies) {
      if (dep instanceof Module && modules.has(dep.id)) {
        count++;
      }
    }
    correctedInDegree.set(id, count);
  }

  // Queue starts with modules that have no dependencies (in-degree = 0)
  const queue: Array<Module> = [];
  for (const [id, degree] of correctedInDegree) {
    if (degree === 0) {
      queue.push(modules.get(id)!);
    }
  }

  // Sort queue by entry status (entries first for stability), then by id
  queue.sort((a, b) => {
    if (a.isEntry !== b.isEntry) {
      return a.isEntry ? 1 : -1;
    }
    return a.id < b.id ? -1 : 1;
  });

  const result: Array<Module> = [];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const mod = queue.shift()!;
    if (processed.has(mod.id)) {
      continue;
    }
    processed.add(mod.id);
    result.push(mod);

    // For each module that depends on mod, decrement its in-degree
    for (const [id, otherMod] of modules) {
      if (processed.has(id)) {
        continue;
      }
      for (const dep of otherMod.dependencies) {
        if (dep instanceof Module && dep.id === mod.id) {
          const current = correctedInDegree.get(id)!;
          const next = current - 1;
          correctedInDegree.set(id, next);
          if (next === 0) {
            queue.push(otherMod);
          }
          break;
        }
      }
    }
  }

  // If there are unprocessed modules (due to cycles), add them at the end
  for (const [id, mod] of modules) {
    if (!processed.has(id)) {
      result.push(mod);
    }
  }

  return result;
};

/**
 * Build the complete module graph from entry points using iterative BFS.
 *
 * @param options - Graph construction options
 * @returns The fully constructed module graph
 */
export const buildModuleGraph = async (
  options: GraphOptions,
): Promise<ModuleGraph> => {
  const modules = new Map<string, Module>();
  const externalModules = new Map<string, ExternalModule>();
  const entryModules: Array<Module> = [];

  // Normalize input to Record<string, string>
  const entries = normalizeInput(options.input);

  // BFS queue
  const queue: Array<QueueItem> = [];

  // Seed with entry points
  const entryValues = Object.values(entries);
  for (let i = 0; i < entryValues.length; i++) {
    queue.push({ source: entryValues[i], importer: undefined, isEntry: true });
  }

  // Process queue iteratively (BFS)
  while (queue.length > 0) {
    const item = queue.shift()!;

    // Resolve the module (try resolveDynamicImport first for dynamic imports)
    let resolved: ResolvedId | null = null;
    if (
      item.isDynamicImport === true &&
      options.resolveDynamicImport !== undefined &&
      item.importer !== undefined
    ) {
      const dynResult = await options.resolveDynamicImport(
        item.source,
        item.importer,
      );
      if (dynResult !== null) {
        if (typeof dynResult === "string") {
          resolved = {
            id: dynResult,
            external: false,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "plugin",
          };
        } else {
          resolved = dynResult;
        }
      }
    }
    // Fall back to resolveId if resolveDynamicImport returned null or wasn't called
    if (resolved === null) {
      resolved = await options.resolveId(
        item.source,
        item.importer,
        item.isEntry,
      );
    }

    if (!resolved) {
      if (item.isEntry) {
        throw Object.assign(
          new Error(`Could not resolve entry module "${item.source}".`),
          { code: UNRESOLVED_ENTRY },
        );
      }
      options.onWarning({
        code: UNRESOLVED_IMPORT,
        message: `Could not resolve '${item.source}' from '${item.importer}'`,
        source: item.source,
        importer: item.importer,
      });
      continue;
    }

    // Handle external modules
    if (resolved.external) {
      if (!externalModules.has(resolved.id)) {
        externalModules.set(resolved.id, new ExternalModule(resolved.id));
      }
      // Link importer to external module
      if (item.importer && modules.has(item.importer)) {
        const ext = externalModules.get(resolved.id)!;
        const importerMod = modules.get(item.importer)!;
        importerMod.dependencies.add(ext);
        ext.importers.add(importerMod);
      }
      continue;
    }

    // Already processed — just link dependency
    if (modules.has(resolved.id)) {
      if (item.importer && modules.has(item.importer)) {
        const existingMod = modules.get(resolved.id)!;
        const importerMod = modules.get(item.importer)!;
        importerMod.dependencies.add(existingMod);
        existingMod.importers.add(importerMod);
      }
      continue;
    }

    // Load the module
    const loaded = await options.loadModule(resolved.id);

    const mod = new Module(resolved.id, loaded.code, item.isEntry);
    mod.ast = loaded.ast as typeof mod.ast;
    mod.meta["graphMeta"] = loaded.meta;
    mod.moduleSideEffects = loaded.moduleSideEffects;
    mod.syntheticNamedExports = loaded.syntheticNamedExports;

    // Extract imports/exports from AST
    mod.extractImportsExports();

    // Handle shimmed exports if enabled
    if (options.shimMissingExports && mod.syntheticNamedExports) {
      options.onWarning({
        code: SHIMMED_EXPORT,
        message: `Module '${resolved.id}' has shimmed exports`,
        id: resolved.id,
      });
    }

    modules.set(resolved.id, mod);

    if (item.isEntry) {
      entryModules.push(mod);
    }

    // Link importer
    if (item.importer && modules.has(item.importer)) {
      const importerMod = modules.get(item.importer)!;
      importerMod.dependencies.add(mod);
      mod.importers.add(importerMod);
    }

    // Queue static imports
    for (let i = 0; i < mod.imports.length; i++) {
      queue.push({
        source: mod.imports[i].source,
        importer: resolved.id,
        isEntry: false,
      });
    }

    // Queue dynamic imports
    for (let i = 0; i < mod.dynamicImports.length; i++) {
      queue.push({
        source: mod.dynamicImports[i],
        importer: resolved.id,
        isEntry: false,
        isDynamicImport: true,
      });
    }
  }

  // Detect circular dependencies
  const circles = detectCircularDependencies(modules);
  for (let i = 0; i < circles.length; i++) {
    const cycle = circles[i];
    options.onWarning({
      code: CIRCULAR_DEPENDENCY,
      message: `Circular dependency: ${cycle.join(" -> ")}`,
      ids: cycle,
    });
  }

  // Topological sort
  const orderedModules = topologicalSort(modules, entryModules);

  return {
    modules: [...modules.values()],
    externalModules: [...externalModules.values()],
    entryModules,
    orderedModules,
  };
};
