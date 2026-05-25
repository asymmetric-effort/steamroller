/**
 * @module tests/unit/splitting/chunk-optimization
 * @description Unit tests for chunk optimization.
 */

import { describe, it, expect } from "vitest";
import {
  optimizeChunks,
  type OptimizableChunk,
} from "../../../src/splitting/chunk-optimization.js";

const makeChunk = (
  name: string,
  overrides: Partial<OptimizableChunk> = {},
): OptimizableChunk => ({
  name,
  moduleIds: [`./src/${name}.ts`],
  size: 1000,
  isEntry: false,
  isDynamicEntry: false,
  imports: [],
  ...overrides,
});

describe("optimizeChunks", () => {
  describe("inlineDynamicImports", () => {
    it("merges all chunks into one when enabled", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, size: 500 }),
        makeChunk("lazy", { isDynamicEntry: true, size: 300 }),
        makeChunk("shared", { size: 200 }),
      ];

      const result = optimizeChunks(chunks, { inlineDynamicImports: true });
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].name).toBe("main");
      expect(result.chunks[0].moduleIds).toHaveLength(3);
      expect(result.chunks[0].size).toBe(1000);
      expect(result.chunks[0].isEntry).toBe(true);
    });

    it("uses entry chunk name for the merged result", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("app", { isEntry: true }),
        makeChunk("vendor"),
      ];

      const result = optimizeChunks(chunks, { inlineDynamicImports: true });
      expect(result.chunks[0].name).toBe("app");
    });

    it("tracks merged chunk names", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true }),
        makeChunk("a"),
        makeChunk("b"),
      ];

      const result = optimizeChunks(chunks, { inlineDynamicImports: true });
      expect(result.merged).toContain("a");
      expect(result.merged).toContain("b");
    });

    it("handles empty chunks array", () => {
      const result = optimizeChunks([], { inlineDynamicImports: true });
      expect(result.chunks).toHaveLength(0);
      expect(result.merged).toHaveLength(0);
    });

    it("handles single chunk", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true }),
      ];

      const result = optimizeChunks(chunks, { inlineDynamicImports: true });
      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].name).toBe("main");
    });
  });

  describe("experimentalMinChunkSize", () => {
    it("merges chunks below the size threshold", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, size: 5000 }),
        makeChunk("tiny", { size: 50, imports: [] }),
      ];

      const result = optimizeChunks(chunks, {
        experimentalMinChunkSize: 100,
      });
      expect(result.chunks).toHaveLength(1);
      expect(result.merged).toContain("tiny");
    });

    it("does not merge entry chunks", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, size: 50 }),
        makeChunk("other", { size: 5000 }),
      ];

      const result = optimizeChunks(chunks, {
        experimentalMinChunkSize: 100,
      });
      const names = result.chunks.map((c) => c.name);
      expect(names).toContain("main");
    });

    it("prefers merging into chunk that imports the small chunk", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, size: 5000, imports: ["tiny"] }),
        makeChunk("other", { size: 5000 }),
        makeChunk("tiny", { size: 50 }),
      ];

      const result = optimizeChunks(chunks, {
        experimentalMinChunkSize: 100,
      });
      const mainChunk = result.chunks.find((c) => c.name === "main");
      expect(mainChunk!.moduleIds).toContain("./src/tiny.ts");
    });

    it("does not merge chunks above the threshold", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, size: 5000 }),
        makeChunk("big-enough", { size: 200 }),
      ];

      const result = optimizeChunks(chunks, {
        experimentalMinChunkSize: 100,
      });
      expect(result.chunks).toHaveLength(2);
      expect(result.merged).toHaveLength(0);
    });

    it("handles multiple small chunks", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, size: 5000 }),
        makeChunk("tiny-a", { size: 30 }),
        makeChunk("tiny-b", { size: 40 }),
      ];

      const result = optimizeChunks(chunks, {
        experimentalMinChunkSize: 100,
      });
      // Both tiny chunks should be merged
      expect(result.merged.length).toBeGreaterThanOrEqual(2);
    });

    it("no-ops when minChunkSize is 0", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, size: 5000 }),
        makeChunk("small", { size: 10 }),
      ];

      const result = optimizeChunks(chunks, {
        experimentalMinChunkSize: 0,
      });
      expect(result.chunks).toHaveLength(2);
    });
  });

  describe("hoistTransitiveImports", () => {
    it("hoists modules from imported chunks into entry chunk", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, size: 5000, imports: ["shared"] }),
        makeChunk("shared", {
          size: 1000,
          moduleIds: ["./src/shared.ts", "./src/util.ts"],
        }),
      ];

      const result = optimizeChunks(chunks, {
        hoistTransitiveImports: true,
      });
      const mainChunk = result.chunks.find((c) => c.name === "main");
      expect(mainChunk!.moduleIds).toContain("./src/shared.ts");
      expect(mainChunk!.moduleIds).toContain("./src/util.ts");
    });

    it("does not hoist from dynamic entry chunks", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, size: 5000, imports: ["lazy"] }),
        makeChunk("lazy", {
          isDynamicEntry: true,
          size: 1000,
          moduleIds: ["./src/lazy.ts"],
        }),
      ];

      const result = optimizeChunks(chunks, {
        hoistTransitiveImports: true,
      });
      const mainChunk = result.chunks.find((c) => c.name === "main");
      expect(mainChunk!.moduleIds).not.toContain("./src/lazy.ts");
    });

    it("hoists transitively through multiple levels", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, imports: ["mid"] }),
        makeChunk("mid", {
          imports: ["deep"],
          moduleIds: ["./src/mid.ts"],
        }),
        makeChunk("deep", {
          moduleIds: ["./src/deep.ts"],
        }),
      ];

      const result = optimizeChunks(chunks, {
        hoistTransitiveImports: true,
      });
      const mainChunk = result.chunks.find((c) => c.name === "main");
      expect(mainChunk!.moduleIds).toContain("./src/mid.ts");
      expect(mainChunk!.moduleIds).toContain("./src/deep.ts");
    });

    it("does not duplicate already-present modules", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", {
          isEntry: true,
          imports: ["shared"],
          moduleIds: ["./src/main.ts", "./src/shared.ts"],
        }),
        makeChunk("shared", {
          moduleIds: ["./src/shared.ts"],
        }),
      ];

      const result = optimizeChunks(chunks, {
        hoistTransitiveImports: true,
      });
      const mainChunk = result.chunks.find((c) => c.name === "main");
      const sharedCount = mainChunk!.moduleIds.filter(
        (id) => id === "./src/shared.ts",
      ).length;
      expect(sharedCount).toBe(1);
    });

    it("only hoists into entry chunks", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, imports: [] }),
        makeChunk("non-entry", {
          isEntry: false,
          imports: ["lib"],
          moduleIds: ["./src/non-entry.ts"],
        }),
        makeChunk("lib", { moduleIds: ["./src/lib.ts"] }),
      ];

      const result = optimizeChunks(chunks, {
        hoistTransitiveImports: true,
      });
      const nonEntry = result.chunks.find((c) => c.name === "non-entry");
      expect(nonEntry!.moduleIds).not.toContain("./src/lib.ts");
    });
  });

  describe("combined options", () => {
    it("applies minChunkSize before hoisting", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, size: 5000, imports: ["small"] }),
        makeChunk("small", { size: 50, moduleIds: ["./src/small.ts"] }),
      ];

      const result = optimizeChunks(chunks, {
        experimentalMinChunkSize: 100,
        hoistTransitiveImports: true,
      });
      // small should be merged
      expect(result.merged).toContain("small");
    });

    it("inlineDynamicImports takes precedence over other options", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true, size: 5000 }),
        makeChunk("large", { size: 10000 }),
      ];

      const result = optimizeChunks(chunks, {
        inlineDynamicImports: true,
        experimentalMinChunkSize: 100,
        hoistTransitiveImports: true,
      });
      expect(result.chunks).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("handles empty options", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", { isEntry: true }),
        makeChunk("other"),
      ];

      const result = optimizeChunks(chunks, {});
      expect(result.chunks).toHaveLength(2);
      expect(result.merged).toHaveLength(0);
    });

    it("handles empty chunks array with all options", () => {
      const result = optimizeChunks([], {
        experimentalMinChunkSize: 100,
        hoistTransitiveImports: true,
      });
      expect(result.chunks).toHaveLength(0);
    });

    it("does not merge when no target found (single small chunk only)", () => {
      const chunks: Array<OptimizableChunk> = [makeChunk("only", { size: 10 })];

      const result = optimizeChunks(chunks, {
        experimentalMinChunkSize: 100,
      });
      // Only one chunk, nothing to merge into since findMergeTarget returns null
      // Actually with only one chunk there's no other chunk to merge into
      expect(result.chunks).toHaveLength(1);
    });

    it("handles circular import references during hoisting", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", {
          isEntry: true,
          imports: ["a"],
        }),
        makeChunk("a", { imports: ["b"] }),
        makeChunk("b", { imports: ["a"] }),
      ];

      const result = optimizeChunks(chunks, {
        hoistTransitiveImports: true,
      });
      const mainChunk = result.chunks.find((c) => c.name === "main");
      expect(mainChunk!.moduleIds).toContain("./src/a.ts");
      expect(mainChunk!.moduleIds).toContain("./src/b.ts");
    });

    it("handles chunk importing non-existent chunk during hoisting", () => {
      const chunks: Array<OptimizableChunk> = [
        makeChunk("main", {
          isEntry: true,
          imports: ["ghost"],
        }),
      ];

      const result = optimizeChunks(chunks, {
        hoistTransitiveImports: true,
      });
      // Should not crash; ghost chunk doesn't exist
      expect(result.chunks).toHaveLength(1);
    });
  });
});
