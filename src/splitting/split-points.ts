/**
 * @module splitting/split-points
 * @description Detects code splitting points from dynamic imports and shared
 * dependencies between multiple entry points.
 */

import type { ModuleInfo } from "../types.js";

/** Reason why a module is a split point. */
export type SplitReason = "dynamic-import" | "shared-dependency";

/** A detected code split point with its source module and reason. */
export interface SplitPoint {
  readonly moduleId: string;
  readonly reason: SplitReason;
  readonly importers: ReadonlyArray<string>;
}

/**
 * Simplified module representation for split point detection.
 * Uses a subset of ModuleInfo fields relevant to splitting.
 */
export interface SplittableModule {
  readonly id: string;
  readonly isEntry: boolean;
  readonly importedIds: ReadonlyArray<string>;
  readonly dynamicallyImportedIds: ReadonlyArray<string>;
  readonly importers: ReadonlyArray<string>;
  readonly dynamicImporters: ReadonlyArray<string>;
}

/**
 * Build a map of module ID to the set of entry points that can reach it
 * (via static imports only). Uses iterative BFS.
 */
const buildReachabilityMap = (
  modules: ReadonlyArray<SplittableModule>,
  entryModuleIds: ReadonlyArray<string>,
): Map<string, Set<string>> => {
  const moduleMap = new Map<string, SplittableModule>();
  for (let i = 0; i < modules.length; i++) {
    moduleMap.set(modules[i].id, modules[i]);
  }

  const reachability = new Map<string, Set<string>>();

  // For each entry, BFS through static imports
  for (let e = 0; e < entryModuleIds.length; e++) {
    const entryId = entryModuleIds[e];
    const queue: Array<string> = [entryId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      // Mark this module as reachable from entryId
      const entries = reachability.get(current);
      if (entries) {
        entries.add(entryId);
      } else {
        reachability.set(current, new Set([entryId]));
      }

      // Follow static imports only
      const mod = moduleMap.get(current);
      if (mod) {
        for (let i = 0; i < mod.importedIds.length; i++) {
          if (!visited.has(mod.importedIds[i])) {
            queue.push(mod.importedIds[i]);
          }
        }
      }
    }
  }

  return reachability;
};

/**
 * Detect split points from a module graph. Split points are created for:
 * 1. Dynamic imports - each `import('./x')` creates a split point at the target
 * 2. Shared dependencies - modules statically imported by 2+ entry points
 *
 * @param modules - Array of modules in the graph
 * @param entryModuleIds - IDs of entry point modules
 * @returns Array of detected split points
 *
 * @example
 * ```typescript
 * const points = detectSplitPoints(modules, ["./src/main.ts"]);
 * // [{ moduleId: "./lazy", reason: "dynamic-import", importers: ["./main"] }]
 * ```
 */
export const detectSplitPoints = (
  modules: ReadonlyArray<SplittableModule>,
  entryModuleIds: ReadonlyArray<string>,
): Array<SplitPoint> => {
  const splitPoints: Array<SplitPoint> = [];
  const seen = new Set<string>();

  // 1. Detect dynamic import split points
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    for (let j = 0; j < mod.dynamicallyImportedIds.length; j++) {
      const targetId = mod.dynamicallyImportedIds[j];
      if (!seen.has(targetId)) {
        seen.add(targetId);
        // Collect all dynamic importers of this target
        const importers: Array<string> = [];
        for (let k = 0; k < modules.length; k++) {
          if (modules[k].dynamicallyImportedIds.includes(targetId)) {
            importers.push(modules[k].id);
          }
        }
        splitPoints.push({
          moduleId: targetId,
          reason: "dynamic-import",
          importers,
        });
      }
    }
  }

  // 2. Detect shared dependencies (reachable from 2+ entries via static imports)
  const entrySet = new Set(entryModuleIds);
  const reachability = buildReachabilityMap(modules, entryModuleIds);

  for (const [moduleId, entries] of reachability) {
    // Skip entry modules themselves and already-detected split points
    if (entrySet.has(moduleId) || seen.has(moduleId)) {
      continue;
    }
    if (entries.size >= 2) {
      seen.add(moduleId);
      splitPoints.push({
        moduleId,
        reason: "shared-dependency",
        importers: Array.from(entries),
      });
    }
  }

  return splitPoints;
};
