/**
 * @module analyze/types
 * @description Type definitions for bundle analysis and visualization.
 */

/** Analysis of a single module within a chunk. */
export interface ModuleAnalysis {
  /** The module identifier (file path). */
  readonly id: string;
  /** Original source size in bytes. */
  readonly originalSize: number;
  /** Rendered (output) size in bytes. */
  readonly renderedSize: number;
  /** Percentage of the containing chunk this module represents. */
  readonly percentOfChunk: number;
  /** Exports that were included in the output. */
  readonly renderedExports: ReadonlyArray<string>;
  /** Exports that were removed by tree-shaking. */
  readonly removedExports: ReadonlyArray<string>;
}

/** Analysis of a single output chunk. */
export interface ChunkAnalysis {
  /** The chunk file name. */
  readonly fileName: string;
  /** Whether this is an entry chunk. */
  readonly isEntry: boolean;
  /** Total rendered size of the chunk in bytes. */
  readonly totalSize: number;
  /** Per-module breakdown within this chunk. */
  readonly modules: ReadonlyArray<ModuleAnalysis>;
  /** Number of modules in this chunk. */
  readonly moduleCount: number;
  /** Exports from this chunk. */
  readonly exports: ReadonlyArray<string>;
}

/** A module that appears in multiple chunks. */
export interface DuplicateModule {
  /** The module identifier. */
  readonly id: string;
  /** The chunk file names containing this module. */
  readonly chunks: ReadonlyArray<string>;
  /** The rendered size of this module (per occurrence). */
  readonly renderedSize: number;
  /** Total wasted bytes from duplication (renderedSize * (occurrences - 1)). */
  readonly wastedBytes: number;
}

/** Tree-shaking effectiveness statistics. */
export interface TreeShakeStats {
  /** Total original source bytes across all modules. */
  readonly totalOriginalSize: number;
  /** Total rendered output bytes across all modules. */
  readonly totalRenderedSize: number;
  /** Bytes removed by tree-shaking. */
  readonly removedBytes: number;
  /** Percentage of bytes removed (0-100). */
  readonly removedPercent: number;
  /** Total number of exports across all modules. */
  readonly totalExports: number;
  /** Number of exports removed by tree-shaking. */
  readonly removedExports: number;
}

/** Complete result of a bundle analysis. */
export interface AnalysisResult {
  /** Per-chunk analysis. */
  readonly chunks: ReadonlyArray<ChunkAnalysis>;
  /** Modules duplicated across multiple chunks. */
  readonly duplicates: ReadonlyArray<DuplicateModule>;
  /** Largest modules ranked by rendered size. */
  readonly largestModules: ReadonlyArray<ModuleAnalysis>;
  /** Tree-shaking effectiveness statistics. */
  readonly treeShakeStats: TreeShakeStats;
  /** Total output size in bytes (all chunks). */
  readonly totalSize: number;
  /** Total number of unique modules. */
  readonly totalModules: number;
}
