/**
 * @module splitting/chunk-assignment
 * @description Assigns modules to chunks based on split points, entry points,
 * and manual chunk configuration.
 */

import type { SplitPoint, SplittableModule } from "./split-points.js";

/** A function-based manual chunks resolver. */
export type ManualChunksFn = (moduleId: string) => string | null | undefined;

/** Manual chunks configuration: either a record or a function. */
export type ManualChunksConfig =
  | Readonly<Record<string, ReadonlyArray<string>>>
  | ManualChunksFn;

/** Result of chunk assignment: map from chunk name to module IDs. */
export type ChunkAssignment = Map<string, Array<string>>;

/**
 * Resolve manual chunk assignment for a module ID.
 * Returns the chunk name if assigned, otherwise null.
 */
const resolveManualChunk = (
  moduleId: string,
  manualChunks: ManualChunksConfig | undefined,
): string | null => {
  if (!manualChunks) {
    return null;
  }

  if (typeof manualChunks === "function") {
    const result = manualChunks(moduleId);
    return result ?? null;
  }

  // Record-based: check if moduleId appears in any chunk's module list
  const chunkNames = Object.keys(manualChunks);
  for (let i = 0; i < chunkNames.length; i++) {
    const modules = manualChunks[chunkNames[i]];
    if (modules.includes(moduleId)) {
      return chunkNames[i];
    }
  }

  return null;
};

/**
 * Build a reachability map from each chunk root (entry/split point) to all
 * modules it statically reaches (excluding other chunk roots).
 */
const buildChunkReachability = (
  modules: ReadonlyArray<SplittableModule>,
  chunkRoots: ReadonlyArray<string>,
): Map<string, Set<string>> => {
  const moduleMap = new Map<string, SplittableModule>();
  for (let i = 0; i < modules.length; i++) {
    moduleMap.set(modules[i].id, modules[i]);
  }

  const rootSet = new Set(chunkRoots);
  const reachability = new Map<string, Set<string>>();

  for (let r = 0; r < chunkRoots.length; r++) {
    const rootId = chunkRoots[r];
    const reachable = new Set<string>([rootId]);
    const queue: Array<string> = [rootId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const mod = moduleMap.get(current);
      if (!mod) {
        continue;
      }

      for (let i = 0; i < mod.importedIds.length; i++) {
        const dep = mod.importedIds[i];
        // Don't cross into another chunk root (unless it's the same root)
        if (reachable.has(dep)) {
          continue;
        }
        if (rootSet.has(dep) && dep !== rootId) {
          continue;
        }
        reachable.add(dep);
        queue.push(dep);
      }
    }

    reachability.set(rootId, reachable);
  }

  return reachability;
};

/**
 * Derive a chunk name from a module ID.
 */
const deriveChunkName = (moduleId: string): string => {
  const parts = moduleId.split("/");
  const last = parts[parts.length - 1] || moduleId;
  // Remove extension
  const dotIndex = last.lastIndexOf(".");
  return dotIndex > 0 ? last.slice(0, dotIndex) : last;
};

/**
 * Assign modules to chunks based on entry points, split points, and manual
 * chunk configuration.
 *
 * Algorithm:
 * 1. Manual chunks take highest priority
 * 2. Each entry point gets its own chunk
 * 3. Each dynamic import split point gets its own chunk
 * 4. Modules reachable from multiple chunks go into a shared chunk
 * 5. Remaining modules go into the chunk that reaches them
 *
 * @param modules - All modules in the dependency graph
 * @param entries - Entry point module IDs
 * @param splitPoints - Detected split points
 * @param manualChunks - Optional manual chunk configuration
 * @returns Map from chunk name to array of module IDs in that chunk
 *
 * @example
 * ```typescript
 * const chunks = assignChunks(modules, ["./main.ts"], splitPoints);
 * // Map { "main" => ["./main.ts", "./utils.ts"], "lazy" => ["./lazy.ts"] }
 * ```
 */
export const assignChunks = (
  modules: ReadonlyArray<SplittableModule>,
  entries: ReadonlyArray<string>,
  splitPoints: ReadonlyArray<SplitPoint>,
  manualChunks?: ManualChunksConfig,
): ChunkAssignment => {
  const chunks: ChunkAssignment = new Map();
  const assigned = new Map<string, string>(); // moduleId -> chunkName

  // 1. Manual chunks (highest priority)
  for (let i = 0; i < modules.length; i++) {
    const chunkName = resolveManualChunk(modules[i].id, manualChunks);
    if (chunkName !== null) {
      assigned.set(modules[i].id, chunkName);
      const existing = chunks.get(chunkName);
      if (existing) {
        existing.push(modules[i].id);
      } else {
        chunks.set(chunkName, [modules[i].id]);
      }
    }
  }

  // 2. Identify chunk roots (entries + split points including shared deps)
  const chunkRoots: Array<string> = [];
  const chunkRootNames = new Map<string, string>();

  for (let i = 0; i < entries.length; i++) {
    if (!assigned.has(entries[i])) {
      const name = deriveChunkName(entries[i]);
      chunkRoots.push(entries[i]);
      chunkRootNames.set(entries[i], name);
    }
  }

  // Track used chunk names to avoid collisions between dynamic and shared chunks
  const usedChunkNames = new Set<string>();
  for (const [, name] of chunkRootNames) {
    usedChunkNames.add(name);
  }

  for (let i = 0; i < splitPoints.length; i++) {
    const sp = splitPoints[i];
    if (assigned.has(sp.moduleId)) {
      continue;
    }
    if (sp.reason === "dynamic-import") {
      const name = deriveChunkName(sp.moduleId);
      chunkRoots.push(sp.moduleId);
      chunkRootNames.set(sp.moduleId, name);
      usedChunkNames.add(name);
    } else if (sp.reason === "shared-dependency") {
      // Shared dependencies imported by 2+ entry points become chunk roots
      // so their sub-dependencies are properly scoped and the module is only
      // instantiated once (singleton preservation).
      let name = deriveChunkName(sp.moduleId);
      if (usedChunkNames.has(name)) {
        name = "shared-" + name;
      }
      chunkRoots.push(sp.moduleId);
      chunkRootNames.set(sp.moduleId, name);
      usedChunkNames.add(name);
    }
  }

  // 3. Build reachability from each chunk root
  const reachability = buildChunkReachability(modules, chunkRoots);

  // 4. Assign chunk roots themselves
  for (let i = 0; i < chunkRoots.length; i++) {
    const rootId = chunkRoots[i];
    const name = chunkRootNames.get(rootId)!;
    assigned.set(rootId, name);
    const existing = chunks.get(name);
    if (existing) {
      existing.push(rootId);
    } else {
      chunks.set(name, [rootId]);
    }
  }

  // 5. Assign remaining modules
  for (let i = 0; i < modules.length; i++) {
    const moduleId = modules[i].id;
    if (assigned.has(moduleId)) {
      continue;
    }

    // Find which chunk roots can reach this module
    const reachingChunks: Array<string> = [];
    for (let r = 0; r < chunkRoots.length; r++) {
      const reachable = reachability.get(chunkRoots[r]);
      if (reachable && reachable.has(moduleId)) {
        reachingChunks.push(chunkRootNames.get(chunkRoots[r])!);
      }
    }

    if (reachingChunks.length === 0) {
      // Unreachable module - put in first entry chunk
      const fallbackName = chunkRootNames.get(entries[0]) || "chunk";
      assigned.set(moduleId, fallbackName);
      const existing = chunks.get(fallbackName);
      if (existing) {
        existing.push(moduleId);
      } else {
        chunks.set(fallbackName, [moduleId]);
      }
    } else if (reachingChunks.length === 1) {
      // Only one chunk reaches it - assign there
      const chunkName = reachingChunks[0];
      assigned.set(moduleId, chunkName);
      const existing = chunks.get(chunkName);
      if (existing) {
        existing.push(moduleId);
      } else {
        chunks.set(chunkName, [moduleId]);
      }
    } else {
      // Multiple chunks reach it - shared chunk
      const sharedName = "shared";
      assigned.set(moduleId, sharedName);
      const existing = chunks.get(sharedName);
      if (existing) {
        existing.push(moduleId);
      } else {
        chunks.set(sharedName, [moduleId]);
      }
    }
  }

  return chunks;
};
