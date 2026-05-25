/**
 * @module splitting/chunk-optimization
 * @description Optimizes chunk assignments by merging small chunks, hoisting
 * transitive imports, and supporting inline dynamic imports mode.
 */

/** Options that control chunk optimization behavior. */
export interface ChunkOptimizationOptions {
  /** Minimum chunk size in bytes. Chunks smaller than this are merged. */
  readonly experimentalMinChunkSize?: number;
  /** Hoist transitive imports into importing chunk to reduce waterfalls. */
  readonly hoistTransitiveImports?: boolean;
  /** Inline all dynamic imports into a single chunk (disables code splitting). */
  readonly inlineDynamicImports?: boolean;
}

/** A chunk with its modules and metadata for optimization. */
export interface OptimizableChunk {
  readonly name: string;
  readonly moduleIds: Array<string>;
  readonly size: number;
  readonly isEntry: boolean;
  readonly isDynamicEntry: boolean;
  readonly imports: ReadonlyArray<string>;
}

/** Result of chunk optimization. */
export interface OptimizedChunks {
  readonly chunks: Array<OptimizableChunk>;
  readonly merged: ReadonlyArray<string>;
}

/**
 * Find the best merge target for a small chunk.
 * Prefers chunks that import the small chunk. Falls back to the largest
 * non-entry chunk, then any chunk.
 */
const findMergeTarget = (
  smallChunk: OptimizableChunk,
  chunks: Array<OptimizableChunk>,
): OptimizableChunk | null => {
  // Prefer a chunk that imports this one
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].name === smallChunk.name) {
      continue;
    }
    if (chunks[i].imports.includes(smallChunk.name)) {
      return chunks[i];
    }
  }

  // Fall back to the smallest non-entry chunk that isn't this one
  let best: OptimizableChunk | null = null;
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].name === smallChunk.name) {
      continue;
    }
    if (!chunks[i].isEntry && (!best || chunks[i].size < best.size)) {
      best = chunks[i];
    }
  }

  // Fall back to any chunk
  if (!best) {
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].name !== smallChunk.name) {
        return chunks[i];
      }
    }
  }

  return best;
};

/**
 * Optimize chunks based on the provided options.
 *
 * Optimizations applied in order:
 * 1. `inlineDynamicImports` - Merges everything into a single chunk
 * 2. `experimentalMinChunkSize` - Merges chunks below the size threshold
 * 3. `hoistTransitiveImports` - Moves transitively imported modules up
 *
 * @param chunks - Array of chunks to optimize
 * @param options - Optimization options
 * @returns Optimized chunks with merge tracking
 *
 * @example
 * ```typescript
 * const result = optimizeChunks(chunks, { experimentalMinChunkSize: 1000 });
 * // Small chunks merged into larger ones
 * ```
 */
export const optimizeChunks = (
  chunks: ReadonlyArray<OptimizableChunk>,
  options: ChunkOptimizationOptions,
): OptimizedChunks => {
  const merged: Array<string> = [];

  // 1. Inline dynamic imports: merge everything into one chunk
  if (options.inlineDynamicImports) {
    if (chunks.length === 0) {
      return { chunks: [], merged: [] };
    }

    const allModuleIds: Array<string> = [];
    let totalSize = 0;
    let entryName = "bundle";

    for (let i = 0; i < chunks.length; i++) {
      for (let j = 0; j < chunks[i].moduleIds.length; j++) {
        allModuleIds.push(chunks[i].moduleIds[j]);
      }
      totalSize += chunks[i].size;
      if (chunks[i].isEntry) {
        entryName = chunks[i].name;
      }
      if (i > 0 || !chunks[i].isEntry) {
        merged.push(chunks[i].name);
      }
    }

    const singleChunk: OptimizableChunk = {
      name: entryName,
      moduleIds: allModuleIds,
      size: totalSize,
      isEntry: true,
      isDynamicEntry: false,
      imports: [],
    };

    return { chunks: [singleChunk], merged };
  }

  // Work with a mutable copy
  let workingChunks: Array<OptimizableChunk> = [];
  for (let i = 0; i < chunks.length; i++) {
    workingChunks.push({
      name: chunks[i].name,
      moduleIds: [...chunks[i].moduleIds],
      size: chunks[i].size,
      isEntry: chunks[i].isEntry,
      isDynamicEntry: chunks[i].isDynamicEntry,
      imports: [...chunks[i].imports],
    });
  }

  // 2. Merge small chunks
  const minSize = options.experimentalMinChunkSize ?? 0;
  if (minSize > 0) {
    let changed = true;
    // Bounded iteration: at most N merges where N = number of chunks
    let iterations = workingChunks.length;
    while (changed && iterations > 0) {
      changed = false;
      iterations--;

      for (let i = workingChunks.length - 1; i >= 0; i--) {
        const chunk = workingChunks[i];
        if (chunk.size >= minSize || chunk.isEntry) {
          continue;
        }

        const target = findMergeTarget(chunk, workingChunks);
        if (!target) {
          continue;
        }

        // Merge chunk into target
        for (let j = 0; j < chunk.moduleIds.length; j++) {
          target.moduleIds.push(chunk.moduleIds[j]);
        }
        // Update target size (mutable via cast for optimization)
        (target as { size: number }).size += chunk.size;

        merged.push(chunk.name);
        workingChunks.splice(i, 1);
        changed = true;
        break; // Restart scan after merge
      }
    }
  }

  // 3. Hoist transitive imports
  if (options.hoistTransitiveImports) {
    const chunkByName = new Map<string, OptimizableChunk>();
    for (let i = 0; i < workingChunks.length; i++) {
      chunkByName.set(workingChunks[i].name, workingChunks[i]);
    }

    for (let i = 0; i < workingChunks.length; i++) {
      const chunk = workingChunks[i];
      if (!chunk.isEntry) {
        continue;
      }

      // BFS through imported chunks, hoisting their modules
      const visited = new Set<string>([chunk.name]);
      const queue: Array<string> = [...chunk.imports];

      while (queue.length > 0) {
        const importName = queue.shift()!;
        if (visited.has(importName)) {
          continue;
        }
        visited.add(importName);

        const importedChunk = chunkByName.get(importName);
        if (!importedChunk || importedChunk.isDynamicEntry) {
          continue;
        }

        // Hoist modules from the imported chunk into this entry chunk
        for (let j = 0; j < importedChunk.moduleIds.length; j++) {
          if (!chunk.moduleIds.includes(importedChunk.moduleIds[j])) {
            chunk.moduleIds.push(importedChunk.moduleIds[j]);
          }
        }

        // Continue BFS through the imported chunk's imports
        for (let j = 0; j < importedChunk.imports.length; j++) {
          if (!visited.has(importedChunk.imports[j])) {
            queue.push(importedChunk.imports[j]);
          }
        }
      }
    }
  }

  return { chunks: workingChunks, merged };
};
