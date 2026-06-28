/**
 * @module tests/unit/splitting/split-points
 * @description Unit tests for split point detection.
 */

import { describe, it, expect } from "bun:test";
import {
  detectSplitPoints,
  type SplittableModule,
} from "../../../src/splitting/index.js";

const makeModule = (
  id: string,
  overrides: Partial<SplittableModule> = {},
): SplittableModule => ({
  id,
  isEntry: false,
  importedIds: [],
  dynamicallyImportedIds: [],
  importers: [],
  dynamicImporters: [],
  ...overrides,
});

describe("detectSplitPoints", () => {
  describe("dynamic imports", () => {
    it("detects a single dynamic import as a split point", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          dynamicallyImportedIds: ["./lazy.ts"],
        }),
        makeModule("./lazy.ts", {
          dynamicImporters: ["./main.ts"],
        }),
      ];

      const points = detectSplitPoints(modules, ["./main.ts"]);
      expect(points).toHaveLength(1);
      expect(points[0].moduleId).toBe("./lazy.ts");
      expect(points[0].reason).toBe("dynamic-import");
      expect(points[0].importers).toContain("./main.ts");
    });

    it("detects multiple dynamic imports", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          dynamicallyImportedIds: ["./page-a.ts", "./page-b.ts"],
        }),
        makeModule("./page-a.ts", { dynamicImporters: ["./main.ts"] }),
        makeModule("./page-b.ts", { dynamicImporters: ["./main.ts"] }),
      ];

      const points = detectSplitPoints(modules, ["./main.ts"]);
      const dynamicPoints = points.filter((p) => p.reason === "dynamic-import");
      expect(dynamicPoints).toHaveLength(2);

      const ids = dynamicPoints.map((p) => p.moduleId).sort();
      expect(ids).toEqual(["./page-a.ts", "./page-b.ts"]);
    });

    it("collects all importers of a dynamic import", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./a.ts", {
          isEntry: true,
          dynamicallyImportedIds: ["./shared-lazy.ts"],
        }),
        makeModule("./b.ts", {
          isEntry: true,
          dynamicallyImportedIds: ["./shared-lazy.ts"],
        }),
        makeModule("./shared-lazy.ts", {
          dynamicImporters: ["./a.ts", "./b.ts"],
        }),
      ];

      const points = detectSplitPoints(modules, ["./a.ts", "./b.ts"]);
      const lazyPoint = points.find((p) => p.moduleId === "./shared-lazy.ts");
      expect(lazyPoint).toBeDefined();
      expect(lazyPoint!.importers).toContain("./a.ts");
      expect(lazyPoint!.importers).toContain("./b.ts");
    });

    it("does not duplicate dynamic import split points", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./a.ts", {
          isEntry: true,
          dynamicallyImportedIds: ["./lazy.ts"],
        }),
        makeModule("./b.ts", {
          isEntry: true,
          dynamicallyImportedIds: ["./lazy.ts"],
        }),
        makeModule("./lazy.ts", { dynamicImporters: ["./a.ts", "./b.ts"] }),
      ];

      const points = detectSplitPoints(modules, ["./a.ts", "./b.ts"]);
      const lazyPoints = points.filter((p) => p.moduleId === "./lazy.ts");
      expect(lazyPoints).toHaveLength(1);
    });
  });

  describe("shared dependencies", () => {
    it("detects shared dependency between two entries", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./entry-a.ts", {
          isEntry: true,
          importedIds: ["./shared.ts"],
        }),
        makeModule("./entry-b.ts", {
          isEntry: true,
          importedIds: ["./shared.ts"],
        }),
        makeModule("./shared.ts", {
          importers: ["./entry-a.ts", "./entry-b.ts"],
        }),
      ];

      const points = detectSplitPoints(modules, [
        "./entry-a.ts",
        "./entry-b.ts",
      ]);
      const sharedPoints = points.filter(
        (p) => p.reason === "shared-dependency",
      );
      expect(sharedPoints).toHaveLength(1);
      expect(sharedPoints[0].moduleId).toBe("./shared.ts");
      expect(sharedPoints[0].importers).toContain("./entry-a.ts");
      expect(sharedPoints[0].importers).toContain("./entry-b.ts");
    });

    it("detects transitively shared dependencies", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./entry-a.ts", {
          isEntry: true,
          importedIds: ["./mid-a.ts"],
        }),
        makeModule("./entry-b.ts", {
          isEntry: true,
          importedIds: ["./mid-b.ts"],
        }),
        makeModule("./mid-a.ts", { importedIds: ["./deep-shared.ts"] }),
        makeModule("./mid-b.ts", { importedIds: ["./deep-shared.ts"] }),
        makeModule("./deep-shared.ts"),
      ];

      const points = detectSplitPoints(modules, [
        "./entry-a.ts",
        "./entry-b.ts",
      ]);
      const sharedPoints = points.filter(
        (p) => p.reason === "shared-dependency",
      );
      expect(sharedPoints.some((p) => p.moduleId === "./deep-shared.ts")).toBe(
        true,
      );
    });

    it("does not mark module used by only one entry as shared", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./entry-a.ts", {
          isEntry: true,
          importedIds: ["./only-a.ts"],
        }),
        makeModule("./entry-b.ts", { isEntry: true, importedIds: [] }),
        makeModule("./only-a.ts"),
      ];

      const points = detectSplitPoints(modules, [
        "./entry-a.ts",
        "./entry-b.ts",
      ]);
      const sharedPoints = points.filter(
        (p) => p.reason === "shared-dependency",
      );
      expect(sharedPoints).toHaveLength(0);
    });

    it("does not mark entry modules themselves as shared", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./entry-a.ts", { isEntry: true, importedIds: [] }),
        makeModule("./entry-b.ts", { isEntry: true, importedIds: [] }),
      ];

      const points = detectSplitPoints(modules, [
        "./entry-a.ts",
        "./entry-b.ts",
      ]);
      expect(points).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for no modules", () => {
      const points = detectSplitPoints([], []);
      expect(points).toEqual([]);
    });

    it("returns empty array for single entry with no imports", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", { isEntry: true }),
      ];
      const points = detectSplitPoints(modules, ["./main.ts"]);
      expect(points).toEqual([]);
    });

    it("handles circular static imports without infinite loop", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./a.ts", { isEntry: true, importedIds: ["./b.ts"] }),
        makeModule("./b.ts", { importedIds: ["./a.ts"] }),
      ];
      const points = detectSplitPoints(modules, ["./a.ts"]);
      // Should not hang and should return valid result
      expect(Array.isArray(points)).toBe(true);
    });

    it("handles diamond dependency pattern (visited node in BFS)", () => {
      // Diamond: entry -> a, entry -> b, a -> shared, b -> shared
      // This forces the BFS to encounter 'shared' via two paths
      const modules: Array<SplittableModule> = [
        makeModule("./entry.ts", {
          isEntry: true,
          importedIds: ["./a.ts", "./b.ts"],
        }),
        makeModule("./a.ts", { importedIds: ["./shared.ts"] }),
        makeModule("./b.ts", { importedIds: ["./shared.ts"] }),
        makeModule("./shared.ts"),
      ];

      const points = detectSplitPoints(modules, ["./entry.ts"]);
      // shared is reachable from only one entry, so no shared split point
      expect(points.filter((p) => p.moduleId === "./shared.ts")).toHaveLength(
        0,
      );
    });

    it("does not count dynamic import target as shared dependency", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./entry-a.ts", {
          isEntry: true,
          importedIds: ["./util.ts"],
          dynamicallyImportedIds: ["./util.ts"],
        }),
        makeModule("./entry-b.ts", {
          isEntry: true,
          importedIds: ["./util.ts"],
        }),
        makeModule("./util.ts"),
      ];

      const points = detectSplitPoints(modules, [
        "./entry-a.ts",
        "./entry-b.ts",
      ]);
      // util.ts is detected as dynamic-import first, so not duplicated as shared
      const utilPoints = points.filter((p) => p.moduleId === "./util.ts");
      expect(utilPoints).toHaveLength(1);
    });
  });
});
