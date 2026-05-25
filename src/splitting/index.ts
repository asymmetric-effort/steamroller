/**
 * @module splitting
 * @description Code splitting module - split point detection, chunk assignment,
 * chunk naming, and chunk optimization.
 */

export {
  detectSplitPoints,
  type SplitPoint,
  type SplitReason,
  type SplittableModule,
} from "./split-points.js";

export {
  assignChunks,
  type ChunkAssignment,
  type ManualChunksConfig,
  type ManualChunksFn,
} from "./chunk-assignment.js";

export {
  resolveChunkFileName,
  resolveAssetFileName,
  type ChunkNamingInfo,
  type ChunkNamingOptions,
  DEFAULT_ENTRY_PATTERN,
  DEFAULT_CHUNK_PATTERN,
  DEFAULT_ASSET_PATTERN,
  DEFAULT_HASH_LENGTH,
  DEFAULT_HASH_CHARS,
} from "./chunk-naming.js";

export {
  optimizeChunks,
  type ChunkOptimizationOptions,
  type OptimizableChunk,
  type OptimizedChunks,
} from "./chunk-optimization.js";
