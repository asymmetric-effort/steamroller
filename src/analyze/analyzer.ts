/**
 * @module analyze/analyzer
 * @description Post-build bundle analysis. Takes output from generate() and
 * produces a structured AnalysisResult with per-chunk breakdowns, duplicate
 * detection, largest module ranking, and tree-shaking statistics.
 */

import type { OutputChunk, OutputAsset } from "../types.js";
import type {
  AnalysisResult,
  ChunkAnalysis,
  ModuleAnalysis,
  DuplicateModule,
  TreeShakeStats,
} from "./types.js";

/**
 * Analyze build output to produce a detailed bundle analysis.
 *
 * @param output - Array of output chunks and assets from generate() or write()
 * @returns A structured AnalysisResult
 */
export const analyzeBuild = (
  output: ReadonlyArray<OutputChunk | OutputAsset>,
): AnalysisResult => {
  const chunks = output.filter(
    (item): item is OutputChunk => item.type === "chunk",
  );

  // Per-chunk analysis
  const chunkAnalyses: Array<ChunkAnalysis> = [];
  const allModules: Array<ModuleAnalysis> = [];
  const moduleChunkMap = new Map<string, Array<string>>();
  const moduleRenderedSizeMap = new Map<string, number>();

  let totalOriginalSize = 0;
  let totalRenderedSize = 0;
  let totalExports = 0;
  let removedExports = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const moduleEntries = Object.entries(chunk.modules);
    const chunkModules: Array<ModuleAnalysis> = [];
    let chunkTotalRendered = 0;

    // First pass: compute chunk total for percentage calculation
    for (let j = 0; j < moduleEntries.length; j++) {
      chunkTotalRendered += moduleEntries[j][1].renderedLength;
    }

    // Second pass: build module analyses
    for (let j = 0; j < moduleEntries.length; j++) {
      const [moduleId, moduleInfo] = moduleEntries[j];
      const percentOfChunk =
        chunkTotalRendered > 0
          ? (moduleInfo.renderedLength / chunkTotalRendered) * 100
          : 0;

      const moduleAnalysis: ModuleAnalysis = {
        id: moduleId,
        originalSize: moduleInfo.originalLength,
        renderedSize: moduleInfo.renderedLength,
        percentOfChunk: Math.round(percentOfChunk * 100) / 100,
        renderedExports: [...moduleInfo.renderedExports],
        removedExports: [...moduleInfo.removedExports],
      };

      chunkModules.push(moduleAnalysis);
      allModules.push(moduleAnalysis);

      // Track which chunks contain each module
      if (!moduleChunkMap.has(moduleId)) {
        moduleChunkMap.set(moduleId, []);
      }
      moduleChunkMap.get(moduleId)!.push(chunk.fileName);
      moduleRenderedSizeMap.set(moduleId, moduleInfo.renderedLength);

      // Accumulate tree-shake stats
      totalOriginalSize += moduleInfo.originalLength;
      totalRenderedSize += moduleInfo.renderedLength;
      totalExports +=
        moduleInfo.renderedExports.length + moduleInfo.removedExports.length;
      removedExports += moduleInfo.removedExports.length;
    }

    // Sort modules by rendered size descending
    chunkModules.sort((a, b) => b.renderedSize - a.renderedSize);

    chunkAnalyses.push({
      fileName: chunk.fileName,
      isEntry: chunk.isEntry,
      totalSize: chunkTotalRendered,
      modules: chunkModules,
      moduleCount: chunkModules.length,
      exports: [...chunk.exports],
    });
  }

  // Detect duplicate modules
  const duplicates: Array<DuplicateModule> = [];
  for (const [moduleId, chunkNames] of moduleChunkMap) {
    if (chunkNames.length > 1) {
      const renderedSize = moduleRenderedSizeMap.get(moduleId) ?? 0;
      duplicates.push({
        id: moduleId,
        chunks: chunkNames,
        renderedSize,
        wastedBytes: renderedSize * (chunkNames.length - 1),
      });
    }
  }
  duplicates.sort((a, b) => b.wastedBytes - a.wastedBytes);

  // Largest modules ranking (deduplicated by id, pick largest occurrence)
  const uniqueModuleMap = new Map<string, ModuleAnalysis>();
  for (let i = 0; i < allModules.length; i++) {
    const mod = allModules[i];
    const existing = uniqueModuleMap.get(mod.id);
    if (existing === undefined || mod.renderedSize > existing.renderedSize) {
      uniqueModuleMap.set(mod.id, mod);
    }
  }
  const largestModules = Array.from(uniqueModuleMap.values())
    .sort((a, b) => b.renderedSize - a.renderedSize)
    .slice(0, 20);

  // Tree-shaking stats
  const removedBytes = totalOriginalSize - totalRenderedSize;
  const treeShakeStats: TreeShakeStats = {
    totalOriginalSize,
    totalRenderedSize,
    removedBytes: Math.max(0, removedBytes),
    removedPercent:
      totalOriginalSize > 0
        ? Math.round((Math.max(0, removedBytes) / totalOriginalSize) * 10000) /
          100
        : 0,
    totalExports,
    removedExports,
  };

  // Total output size
  const totalSize = chunkAnalyses.reduce((sum, c) => sum + c.totalSize, 0);

  return {
    chunks: chunkAnalyses,
    duplicates,
    largestModules,
    treeShakeStats,
    totalSize,
    totalModules: uniqueModuleMap.size,
  };
};
