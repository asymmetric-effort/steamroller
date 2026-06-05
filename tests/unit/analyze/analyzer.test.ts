/**
 * Tests for src/analyze/analyzer.ts
 *
 * Covers per-module size calculation, duplicate detection, tree-shaking stats,
 * multi-chunk analysis, and edge cases.
 */
import { describe, it, expect } from "vitest";
import { analyzeBuild } from "../../../src/analyze/analyzer.js";
import type { OutputChunk, OutputAsset } from "../../../src/types.js";

/**
 * Helper to create a minimal OutputChunk for testing.
 */
const makeChunk = (
  overrides: Partial<OutputChunk> & { fileName: string },
): OutputChunk => ({
  type: "chunk",
  code: "",
  fileName: overrides.fileName,
  preliminaryFileName: overrides.fileName,
  sourcemapFileName: null,
  map: null,
  exports: overrides.exports ?? [],
  facadeModuleId: overrides.facadeModuleId ?? null,
  isDynamicEntry: overrides.isDynamicEntry ?? false,
  isEntry: overrides.isEntry ?? true,
  isImplicitEntry: false,
  moduleIds: overrides.moduleIds ?? [],
  name: overrides.name ?? "chunk",
  dynamicImports: [],
  implicitlyLoadedBefore: [],
  importedBindings: {},
  imports: [],
  modules: overrides.modules ?? {},
  referencedFiles: [],
});

/**
 * Helper to create a minimal OutputAsset.
 */
const makeAsset = (fileName: string): OutputAsset => ({
  type: "asset",
  fileName,
  name: fileName,
  names: [fileName],
  needsCodeReference: false,
  originalFileName: null,
  originalFileNames: [],
  source: "body{}",
});

describe("analyzeBuild", () => {
  it("returns empty analysis for empty output", () => {
    const result = analyzeBuild([]);
    expect(result.chunks).toHaveLength(0);
    expect(result.duplicates).toHaveLength(0);
    expect(result.largestModules).toHaveLength(0);
    expect(result.totalSize).toBe(0);
    expect(result.totalModules).toBe(0);
    expect(result.treeShakeStats.totalOriginalSize).toBe(0);
    expect(result.treeShakeStats.totalRenderedSize).toBe(0);
    expect(result.treeShakeStats.removedPercent).toBe(0);
  });

  it("ignores asset items in the output", () => {
    const result = analyzeBuild([makeAsset("style.css")]);
    expect(result.chunks).toHaveLength(0);
    expect(result.totalSize).toBe(0);
  });

  it("calculates per-module sizes correctly", () => {
    const chunk = makeChunk({
      fileName: "bundle.js",
      modules: {
        "src/a.ts": {
          code: "const a = 1;",
          originalLength: 100,
          renderedLength: 80,
          renderedExports: ["a"],
          removedExports: [],
        },
        "src/b.ts": {
          code: "const b = 2;",
          originalLength: 200,
          renderedLength: 120,
          renderedExports: ["b"],
          removedExports: [],
        },
      },
    });

    const result = analyzeBuild([chunk]);
    expect(result.chunks).toHaveLength(1);

    const chunkAnalysis = result.chunks[0];
    expect(chunkAnalysis.totalSize).toBe(200); // 80 + 120
    expect(chunkAnalysis.moduleCount).toBe(2);

    // Modules should be sorted by size descending
    expect(chunkAnalysis.modules[0].id).toBe("src/b.ts");
    expect(chunkAnalysis.modules[0].renderedSize).toBe(120);
    expect(chunkAnalysis.modules[1].id).toBe("src/a.ts");
    expect(chunkAnalysis.modules[1].renderedSize).toBe(80);
  });

  it("calculates module percentage of chunk", () => {
    const chunk = makeChunk({
      fileName: "bundle.js",
      modules: {
        "src/a.ts": {
          code: "",
          originalLength: 100,
          renderedLength: 75,
          renderedExports: [],
          removedExports: [],
        },
        "src/b.ts": {
          code: "",
          originalLength: 100,
          renderedLength: 25,
          renderedExports: [],
          removedExports: [],
        },
      },
    });

    const result = analyzeBuild([chunk]);
    const modules = result.chunks[0].modules;
    expect(modules[0].percentOfChunk).toBe(75);
    expect(modules[1].percentOfChunk).toBe(25);
  });

  it("handles chunk with zero rendered size", () => {
    const chunk = makeChunk({
      fileName: "empty.js",
      modules: {
        "src/empty.ts": {
          code: "",
          originalLength: 50,
          renderedLength: 0,
          renderedExports: [],
          removedExports: ["x"],
        },
      },
    });

    const result = analyzeBuild([chunk]);
    expect(result.chunks[0].modules[0].percentOfChunk).toBe(0);
  });

  it("detects duplicate modules across chunks", () => {
    const chunk1 = makeChunk({
      fileName: "entry.js",
      modules: {
        "src/shared.ts": {
          code: "",
          originalLength: 100,
          renderedLength: 80,
          renderedExports: [],
          removedExports: [],
        },
      },
    });
    const chunk2 = makeChunk({
      fileName: "lazy.js",
      isEntry: false,
      modules: {
        "src/shared.ts": {
          code: "",
          originalLength: 100,
          renderedLength: 80,
          renderedExports: [],
          removedExports: [],
        },
      },
    });

    const result = analyzeBuild([chunk1, chunk2]);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].id).toBe("src/shared.ts");
    expect(result.duplicates[0].chunks).toEqual(["entry.js", "lazy.js"]);
    expect(result.duplicates[0].renderedSize).toBe(80);
    expect(result.duplicates[0].wastedBytes).toBe(80);
  });

  it("reports no duplicates when modules are unique", () => {
    const chunk1 = makeChunk({
      fileName: "entry.js",
      modules: {
        "src/a.ts": {
          code: "",
          originalLength: 100,
          renderedLength: 50,
          renderedExports: [],
          removedExports: [],
        },
      },
    });
    const chunk2 = makeChunk({
      fileName: "lazy.js",
      modules: {
        "src/b.ts": {
          code: "",
          originalLength: 100,
          renderedLength: 50,
          renderedExports: [],
          removedExports: [],
        },
      },
    });

    const result = analyzeBuild([chunk1, chunk2]);
    expect(result.duplicates).toHaveLength(0);
  });

  it("calculates tree-shaking stats", () => {
    const chunk = makeChunk({
      fileName: "bundle.js",
      modules: {
        "src/a.ts": {
          code: "",
          originalLength: 1000,
          renderedLength: 600,
          renderedExports: ["used"],
          removedExports: ["unused1", "unused2"],
        },
        "src/b.ts": {
          code: "",
          originalLength: 500,
          renderedLength: 400,
          renderedExports: ["b"],
          removedExports: [],
        },
      },
    });

    const result = analyzeBuild([chunk]);
    const ts = result.treeShakeStats;
    expect(ts.totalOriginalSize).toBe(1500);
    expect(ts.totalRenderedSize).toBe(1000);
    expect(ts.removedBytes).toBe(500);
    expect(ts.removedPercent).toBeCloseTo(33.33, 1);
    expect(ts.totalExports).toBe(4); // used + unused1 + unused2 + b
    expect(ts.removedExports).toBe(2);
  });

  it("handles tree-shaking stats when nothing is removed", () => {
    const chunk = makeChunk({
      fileName: "bundle.js",
      modules: {
        "src/a.ts": {
          code: "",
          originalLength: 100,
          renderedLength: 100,
          renderedExports: ["a"],
          removedExports: [],
        },
      },
    });

    const result = analyzeBuild([chunk]);
    expect(result.treeShakeStats.removedBytes).toBe(0);
    expect(result.treeShakeStats.removedPercent).toBe(0);
  });

  it("ranks largest modules correctly", () => {
    const chunk = makeChunk({
      fileName: "bundle.js",
      modules: {
        "src/small.ts": {
          code: "",
          originalLength: 10,
          renderedLength: 10,
          renderedExports: [],
          removedExports: [],
        },
        "src/medium.ts": {
          code: "",
          originalLength: 100,
          renderedLength: 50,
          renderedExports: [],
          removedExports: [],
        },
        "src/large.ts": {
          code: "",
          originalLength: 1000,
          renderedLength: 500,
          renderedExports: [],
          removedExports: [],
        },
      },
    });

    const result = analyzeBuild([chunk]);
    expect(result.largestModules[0].id).toBe("src/large.ts");
    expect(result.largestModules[1].id).toBe("src/medium.ts");
    expect(result.largestModules[2].id).toBe("src/small.ts");
  });

  it("deduplicates largest modules across chunks", () => {
    const chunk1 = makeChunk({
      fileName: "entry.js",
      modules: {
        "src/shared.ts": {
          code: "",
          originalLength: 200,
          renderedLength: 100,
          renderedExports: [],
          removedExports: [],
        },
      },
    });
    const chunk2 = makeChunk({
      fileName: "lazy.js",
      modules: {
        "src/shared.ts": {
          code: "",
          originalLength: 200,
          renderedLength: 100,
          renderedExports: [],
          removedExports: [],
        },
      },
    });

    const result = analyzeBuild([chunk1, chunk2]);
    // Should only appear once in largest modules
    const sharedEntries = result.largestModules.filter(
      (m) => m.id === "src/shared.ts",
    );
    expect(sharedEntries).toHaveLength(1);
  });

  it("limits largest modules to 20", () => {
    const modules: Record<
      string,
      {
        code: string;
        originalLength: number;
        renderedLength: number;
        renderedExports: string[];
        removedExports: string[];
      }
    > = {};
    for (let i = 0; i < 25; i++) {
      modules[`src/mod${i}.ts`] = {
        code: "",
        originalLength: 100 + i,
        renderedLength: 50 + i,
        renderedExports: [],
        removedExports: [],
      };
    }

    const chunk = makeChunk({ fileName: "bundle.js", modules });
    const result = analyzeBuild([chunk]);
    expect(result.largestModules).toHaveLength(20);
  });

  it("reports total size across multiple chunks", () => {
    const chunk1 = makeChunk({
      fileName: "entry.js",
      modules: {
        "src/a.ts": {
          code: "",
          originalLength: 100,
          renderedLength: 50,
          renderedExports: [],
          removedExports: [],
        },
      },
    });
    const chunk2 = makeChunk({
      fileName: "lazy.js",
      modules: {
        "src/b.ts": {
          code: "",
          originalLength: 200,
          renderedLength: 150,
          renderedExports: [],
          removedExports: [],
        },
      },
    });

    const result = analyzeBuild([chunk1, chunk2]);
    expect(result.totalSize).toBe(200); // 50 + 150
    expect(result.totalModules).toBe(2);
  });

  it("reports chunk isEntry correctly", () => {
    const entry = makeChunk({
      fileName: "entry.js",
      isEntry: true,
      modules: {},
    });
    const dynamic = makeChunk({
      fileName: "lazy.js",
      isEntry: false,
      modules: {},
    });

    const result = analyzeBuild([entry, dynamic]);
    expect(result.chunks[0].isEntry).toBe(true);
    expect(result.chunks[1].isEntry).toBe(false);
  });

  it("reports chunk exports", () => {
    const chunk = makeChunk({
      fileName: "entry.js",
      exports: ["default", "foo", "bar"],
      modules: {},
    });

    const result = analyzeBuild([chunk]);
    expect(result.chunks[0].exports).toEqual(["default", "foo", "bar"]);
  });

  it("preserves module rendered and removed exports", () => {
    const chunk = makeChunk({
      fileName: "bundle.js",
      modules: {
        "src/a.ts": {
          code: "",
          originalLength: 100,
          renderedLength: 60,
          renderedExports: ["used1", "used2"],
          removedExports: ["removed1"],
        },
      },
    });

    const result = analyzeBuild([chunk]);
    const mod = result.chunks[0].modules[0];
    expect(mod.renderedExports).toEqual(["used1", "used2"]);
    expect(mod.removedExports).toEqual(["removed1"]);
  });

  it("sorts duplicates by wasted bytes descending", () => {
    const chunk1 = makeChunk({
      fileName: "a.js",
      modules: {
        "src/big.ts": {
          code: "",
          originalLength: 200,
          renderedLength: 200,
          renderedExports: [],
          removedExports: [],
        },
        "src/small.ts": {
          code: "",
          originalLength: 10,
          renderedLength: 10,
          renderedExports: [],
          removedExports: [],
        },
      },
    });
    const chunk2 = makeChunk({
      fileName: "b.js",
      modules: {
        "src/big.ts": {
          code: "",
          originalLength: 200,
          renderedLength: 200,
          renderedExports: [],
          removedExports: [],
        },
        "src/small.ts": {
          code: "",
          originalLength: 10,
          renderedLength: 10,
          renderedExports: [],
          removedExports: [],
        },
      },
    });

    const result = analyzeBuild([chunk1, chunk2]);
    expect(result.duplicates).toHaveLength(2);
    expect(result.duplicates[0].id).toBe("src/big.ts");
    expect(result.duplicates[0].wastedBytes).toBe(200);
    expect(result.duplicates[1].id).toBe("src/small.ts");
    expect(result.duplicates[1].wastedBytes).toBe(10);
  });

  it("handles mixed chunks and assets", () => {
    const chunk = makeChunk({
      fileName: "bundle.js",
      modules: {
        "src/a.ts": {
          code: "",
          originalLength: 100,
          renderedLength: 50,
          renderedExports: [],
          removedExports: [],
        },
      },
    });
    const asset = makeAsset("style.css");

    const result = analyzeBuild([chunk, asset]);
    // Only chunks are analyzed
    expect(result.chunks).toHaveLength(1);
    expect(result.totalSize).toBe(50);
  });
});
