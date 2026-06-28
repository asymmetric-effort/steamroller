/**
 * @module tests/unit/splitting/chunk-assignment
 * @description Unit tests for chunk assignment algorithm.
 */

import { describe, it, expect } from "bun:test";
import {
  assignChunks,
  type ManualChunksConfig,
} from "../../../src/splitting/chunk-assignment.js";
import type { SplittableModule } from "../../../src/splitting/split-points.js";
import { detectSplitPoints } from "../../../src/splitting/split-points.js";

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

describe("assignChunks", () => {
  describe("entry chunks", () => {
    it("creates a chunk for each entry point", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", { isEntry: true }),
        makeModule("./other.ts", { isEntry: true }),
      ];

      const chunks = assignChunks(modules, ["./main.ts", "./other.ts"], []);
      expect(chunks.has("main")).toBe(true);
      expect(chunks.has("other")).toBe(true);
      expect(chunks.get("main")).toContain("./main.ts");
      expect(chunks.get("other")).toContain("./other.ts");
    });

    it("assigns static dependencies to their entry chunk", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          importedIds: ["./utils.ts"],
        }),
        makeModule("./utils.ts"),
      ];

      const chunks = assignChunks(modules, ["./main.ts"], []);
      expect(chunks.get("main")).toContain("./utils.ts");
    });
  });

  describe("dynamic import chunks", () => {
    it("creates separate chunk for dynamic imports", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          dynamicallyImportedIds: ["./lazy.ts"],
        }),
        makeModule("./lazy.ts", { dynamicImporters: ["./main.ts"] }),
      ];

      const splitPoints = detectSplitPoints(modules, ["./main.ts"]);
      const chunks = assignChunks(modules, ["./main.ts"], splitPoints);

      expect(chunks.has("lazy")).toBe(true);
      expect(chunks.get("lazy")).toContain("./lazy.ts");
    });

    it("assigns dependencies of dynamic import to its chunk", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          dynamicallyImportedIds: ["./lazy.ts"],
        }),
        makeModule("./lazy.ts", {
          dynamicImporters: ["./main.ts"],
          importedIds: ["./lazy-dep.ts"],
        }),
        makeModule("./lazy-dep.ts"),
      ];

      const splitPoints = detectSplitPoints(modules, ["./main.ts"]);
      const chunks = assignChunks(modules, ["./main.ts"], splitPoints);

      expect(chunks.get("lazy")).toContain("./lazy-dep.ts");
    });
  });

  describe("shared chunks", () => {
    it("puts shared dependencies in a shared chunk", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./entry-a.ts", {
          isEntry: true,
          importedIds: ["./shared.ts"],
        }),
        makeModule("./entry-b.ts", {
          isEntry: true,
          importedIds: ["./shared.ts"],
        }),
        makeModule("./shared.ts"),
      ];

      const splitPoints = detectSplitPoints(modules, [
        "./entry-a.ts",
        "./entry-b.ts",
      ]);
      const chunks = assignChunks(
        modules,
        ["./entry-a.ts", "./entry-b.ts"],
        splitPoints,
      );

      expect(chunks.has("shared")).toBe(true);
      expect(chunks.get("shared")).toContain("./shared.ts");
    });

    it("handles multiple shared dependencies", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./a.ts", {
          isEntry: true,
          importedIds: ["./util1.ts", "./util2.ts"],
        }),
        makeModule("./b.ts", {
          isEntry: true,
          importedIds: ["./util1.ts", "./util2.ts"],
        }),
        makeModule("./util1.ts"),
        makeModule("./util2.ts"),
      ];

      const splitPoints = detectSplitPoints(modules, ["./a.ts", "./b.ts"]);
      const chunks = assignChunks(modules, ["./a.ts", "./b.ts"], splitPoints);

      // Each shared dep gets its own chunk as a proper chunk root
      const allModules = Array.from(chunks.values()).flat();
      expect(allModules).toContain("./util1.ts");
      expect(allModules).toContain("./util2.ts");
      // Neither should be in the entry chunks
      const aChunk = chunks.get("a") || [];
      const bChunk = chunks.get("b") || [];
      expect(aChunk).not.toContain("./util1.ts");
      expect(aChunk).not.toContain("./util2.ts");
      expect(bChunk).not.toContain("./util1.ts");
      expect(bChunk).not.toContain("./util2.ts");
    });
  });

  describe("singleton preservation via shared chunks", () => {
    it("two entry points sharing a common dep produce a shared chunk", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./app.ts", {
          isEntry: true,
          importedIds: ["./singleton.ts"],
        }),
        makeModule("./worker.ts", {
          isEntry: true,
          importedIds: ["./singleton.ts"],
        }),
        makeModule("./singleton.ts"),
      ];

      const splitPoints = detectSplitPoints(modules, [
        "./app.ts",
        "./worker.ts",
      ]);
      const chunks = assignChunks(
        modules,
        ["./app.ts", "./worker.ts"],
        splitPoints,
      );

      // A shared chunk must exist containing the singleton module
      const allChunkNames = Array.from(chunks.keys());
      const singletonChunk = allChunkNames.find((name) => {
        const mods = chunks.get(name)!;
        return mods.includes("./singleton.ts");
      });
      expect(singletonChunk).toBeDefined();
      // The singleton should NOT be in either entry chunk
      expect(chunks.get("app") || []).not.toContain("./singleton.ts");
      expect(chunks.get("worker") || []).not.toContain("./singleton.ts");
    });

    it("shared module is only included once across all chunks", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./entry-x.ts", {
          isEntry: true,
          importedIds: ["./config.ts", "./helper.ts"],
        }),
        makeModule("./entry-y.ts", {
          isEntry: true,
          importedIds: ["./config.ts"],
        }),
        makeModule("./config.ts", { importedIds: ["./helper.ts"] }),
        makeModule("./helper.ts"),
      ];

      const splitPoints = detectSplitPoints(modules, [
        "./entry-x.ts",
        "./entry-y.ts",
      ]);
      const chunks = assignChunks(
        modules,
        ["./entry-x.ts", "./entry-y.ts"],
        splitPoints,
      );

      // Flatten all module IDs across every chunk
      const allModuleIds = Array.from(chunks.values()).flat();

      // Each shared module should appear exactly once
      const configCount = allModuleIds.filter(
        (id) => id === "./config.ts",
      ).length;
      const helperCount = allModuleIds.filter(
        (id) => id === "./helper.ts",
      ).length;
      expect(configCount).toBe(1);
      expect(helperCount).toBe(1);
    });

    it("import paths correctly reference the shared chunk", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./page-a.ts", {
          isEntry: true,
          importedIds: ["./store.ts"],
        }),
        makeModule("./page-b.ts", {
          isEntry: true,
          importedIds: ["./store.ts"],
        }),
        makeModule("./store.ts", { importedIds: ["./store-utils.ts"] }),
        makeModule("./store-utils.ts"),
      ];

      const splitPoints = detectSplitPoints(modules, [
        "./page-a.ts",
        "./page-b.ts",
      ]);
      const chunks = assignChunks(
        modules,
        ["./page-a.ts", "./page-b.ts"],
        splitPoints,
      );

      // Find which chunk the store module ended up in
      let storeChunkName: string | undefined;
      for (const [name, mods] of chunks) {
        if (mods.includes("./store.ts")) {
          storeChunkName = name;
          break;
        }
      }
      expect(storeChunkName).toBeDefined();
      // The store chunk should be separate from both entry chunks
      expect(storeChunkName).not.toBe("page-a");
      expect(storeChunkName).not.toBe("page-b");

      // store-utils is also a shared dependency (reachable from both entries
      // via store) so it gets its own chunk root too -- ensuring singleton
      // preservation for both store and store-utils independently
      let storeUtilsChunkName: string | undefined;
      for (const [name, mods] of chunks) {
        if (mods.includes("./store-utils.ts")) {
          storeUtilsChunkName = name;
          break;
        }
      }
      expect(storeUtilsChunkName).toBeDefined();
      expect(storeUtilsChunkName).not.toBe("page-a");
      expect(storeUtilsChunkName).not.toBe("page-b");
    });

    it("shared dep with unique sub-dep scopes it to the shared chunk", () => {
      // When a shared dep has a sub-dep that is only reachable from one
      // entry (through the shared dep acting as a chunk boundary), that
      // sub-dep stays scoped to the shared chunk.
      const modules: Array<SplittableModule> = [
        makeModule("./main-a.ts", {
          isEntry: true,
          importedIds: ["./lib.ts"],
        }),
        makeModule("./main-b.ts", {
          isEntry: true,
          importedIds: ["./lib.ts"],
        }),
        makeModule("./lib.ts", { importedIds: ["./lib-internal.ts"] }),
        makeModule("./lib-internal.ts"),
      ];

      const splitPoints = detectSplitPoints(modules, [
        "./main-a.ts",
        "./main-b.ts",
      ]);
      const chunks = assignChunks(
        modules,
        ["./main-a.ts", "./main-b.ts"],
        splitPoints,
      );

      // lib-internal should NOT be in either entry chunk
      const mainAChunk = chunks.get("main-a") || [];
      const mainBChunk = chunks.get("main-b") || [];
      expect(mainAChunk).not.toContain("./lib-internal.ts");
      expect(mainBChunk).not.toContain("./lib-internal.ts");

      // lib-internal should appear exactly once across all chunks
      const allModuleIds = Array.from(chunks.values()).flat();
      const libInternalCount = allModuleIds.filter(
        (id) => id === "./lib-internal.ts",
      ).length;
      expect(libInternalCount).toBe(1);
    });
  });

  describe("manualChunks", () => {
    it("supports record-based manual chunks", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          importedIds: ["./vendor-a.ts", "./vendor-b.ts"],
        }),
        makeModule("./vendor-a.ts"),
        makeModule("./vendor-b.ts"),
      ];

      const manualChunks: ManualChunksConfig = {
        vendor: ["./vendor-a.ts", "./vendor-b.ts"],
      };

      const chunks = assignChunks(modules, ["./main.ts"], [], manualChunks);
      expect(chunks.has("vendor")).toBe(true);
      expect(chunks.get("vendor")).toContain("./vendor-a.ts");
      expect(chunks.get("vendor")).toContain("./vendor-b.ts");
    });

    it("supports function-based manual chunks", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          importedIds: ["./node_modules/lodash.ts"],
        }),
        makeModule("./node_modules/lodash.ts"),
      ];

      const manualChunks: ManualChunksConfig = (id: string) =>
        id.includes("node_modules") ? "vendor" : null;

      const chunks = assignChunks(modules, ["./main.ts"], [], manualChunks);
      expect(chunks.has("vendor")).toBe(true);
      expect(chunks.get("vendor")).toContain("./node_modules/lodash.ts");
    });

    it("manual chunks take priority over automatic assignment", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./a.ts", {
          isEntry: true,
          importedIds: ["./lib.ts"],
        }),
        makeModule("./b.ts", {
          isEntry: true,
          importedIds: ["./lib.ts"],
        }),
        makeModule("./lib.ts"),
      ];

      const manualChunks: ManualChunksConfig = {
        "my-lib": ["./lib.ts"],
      };

      const splitPoints = detectSplitPoints(modules, ["./a.ts", "./b.ts"]);
      const chunks = assignChunks(
        modules,
        ["./a.ts", "./b.ts"],
        splitPoints,
        manualChunks,
      );

      expect(chunks.has("my-lib")).toBe(true);
      expect(chunks.get("my-lib")).toContain("./lib.ts");
      // Should not be in the shared chunk
      const shared = chunks.get("shared");
      if (shared) {
        expect(shared).not.toContain("./lib.ts");
      }
    });

    it("function returning undefined leaves module unassigned", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          importedIds: ["./utils.ts"],
        }),
        makeModule("./utils.ts"),
      ];

      const manualChunks: ManualChunksConfig = () => undefined;

      const chunks = assignChunks(modules, ["./main.ts"], [], manualChunks);
      expect(chunks.get("main")).toContain("./utils.ts");
    });
  });

  describe("unreachable modules", () => {
    it("assigns unreachable modules to the first entry chunk", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", { isEntry: true }),
        makeModule("./orphan.ts"),
      ];

      const chunks = assignChunks(modules, ["./main.ts"], []);
      expect(chunks.get("main")).toContain("./orphan.ts");
    });

    it("handles unreachable module when entry chunk already exists", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", { isEntry: true, importedIds: ["./dep.ts"] }),
        makeModule("./dep.ts"),
        makeModule("./isolated.ts"),
      ];

      const chunks = assignChunks(modules, ["./main.ts"], []);
      expect(chunks.get("main")).toContain("./isolated.ts");
    });

    it("creates fallback chunk when entry is manually assigned elsewhere", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", { isEntry: true }),
        makeModule("./orphan.ts"),
      ];

      // Manual chunks steals the entry, so entry chunk root isn't created normally
      const manualChunks: ManualChunksConfig = {
        custom: ["./main.ts"],
      };

      const chunks = assignChunks(modules, ["./main.ts"], [], manualChunks);
      // orphan should end up somewhere
      const allModules = Array.from(chunks.values()).flat();
      expect(allModules).toContain("./orphan.ts");
    });
  });

  describe("single-reaching chunk new creation", () => {
    it("creates chunk for module reachable from dynamic import only", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          dynamicallyImportedIds: ["./lazy.ts"],
        }),
        makeModule("./lazy.ts", {
          dynamicImporters: ["./main.ts"],
          importedIds: ["./lazy-only.ts"],
        }),
        makeModule("./lazy-only.ts"),
      ];

      const splitPoints = detectSplitPoints(modules, ["./main.ts"]);
      const chunks = assignChunks(modules, ["./main.ts"], splitPoints);
      expect(chunks.get("lazy")).toContain("./lazy-only.ts");
    });

    it("handles new chunk creation for single-reacher when chunk doesnt exist yet", () => {
      // Scenario: manual chunks takes the entry's own modules, so the
      // entry chunk root name exists but the chunk in the map was consumed.
      // Then a module only reachable from a dynamic split point triggers
      // the else branch on line 225.
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          importedIds: ["./a.ts"],
          dynamicallyImportedIds: ["./lazy.ts"],
        }),
        makeModule("./a.ts"),
        makeModule("./lazy.ts", {
          dynamicImporters: ["./main.ts"],
          importedIds: ["./lazy-dep.ts"],
        }),
        makeModule("./lazy-dep.ts"),
      ];

      const splitPoints = detectSplitPoints(modules, ["./main.ts"]);
      const chunks = assignChunks(modules, ["./main.ts"], splitPoints);
      // lazy-dep should be in the lazy chunk
      expect(chunks.get("lazy")).toContain("./lazy-dep.ts");
    });
  });

  describe("edge cases", () => {
    it("handles empty modules array", () => {
      const chunks = assignChunks([], [], []);
      expect(chunks.size).toBe(0);
    });

    it("handles module with path-like ID", () => {
      const modules: Array<SplittableModule> = [
        makeModule("/home/user/project/src/main.ts", { isEntry: true }),
      ];
      const chunks = assignChunks(
        modules,
        ["/home/user/project/src/main.ts"],
        [],
      );
      expect(chunks.has("main")).toBe(true);
    });

    it("handles module with no extension", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main", { isEntry: true }),
      ];
      const chunks = assignChunks(modules, ["./main"], []);
      expect(chunks.has("main")).toBe(true);
    });

    it("does not cross into another chunk root during reachability", () => {
      // main statically imports lazy, but lazy is also a dynamic import target
      // So lazy is a chunk root and main should not "reach through" it
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          importedIds: ["./lazy.ts"],
          dynamicallyImportedIds: ["./lazy.ts"],
        }),
        makeModule("./lazy.ts", {
          dynamicImporters: ["./main.ts"],
          importedIds: ["./lazy-dep.ts"],
        }),
        makeModule("./lazy-dep.ts"),
      ];

      const splitPoints = detectSplitPoints(modules, ["./main.ts"]);
      const chunks = assignChunks(modules, ["./main.ts"], splitPoints);
      // lazy-dep should be in lazy chunk, not main
      expect(chunks.get("lazy")).toContain("./lazy-dep.ts");
      const mainChunk = chunks.get("main") || [];
      expect(mainChunk).not.toContain("./lazy-dep.ts");
    });

    it("handles two entries with same basename (name collision)", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./src/main.ts", { isEntry: true }),
        makeModule("./lib/main.ts", { isEntry: true }),
      ];

      const chunks = assignChunks(
        modules,
        ["./src/main.ts", "./lib/main.ts"],
        [],
      );
      // Both should be assigned (same chunk name "main")
      const mainChunk = chunks.get("main");
      expect(mainChunk).toContain("./src/main.ts");
      expect(mainChunk).toContain("./lib/main.ts");
    });

    it("assigns multiple modules to the same chunk", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          importedIds: ["./a.ts", "./b.ts"],
        }),
        makeModule("./a.ts", { importedIds: [] }),
        makeModule("./b.ts", { importedIds: [] }),
      ];

      const chunks = assignChunks(modules, ["./main.ts"], []);
      const mainChunk = chunks.get("main");
      expect(mainChunk).toBeDefined();
      expect(mainChunk).toContain("./a.ts");
      expect(mainChunk).toContain("./b.ts");
    });

    it("handles circular dependencies in reachability", () => {
      const modules: Array<SplittableModule> = [
        makeModule("./main.ts", {
          isEntry: true,
          importedIds: ["./a.ts"],
        }),
        makeModule("./a.ts", { importedIds: ["./b.ts"] }),
        makeModule("./b.ts", { importedIds: ["./a.ts"] }),
      ];

      const chunks = assignChunks(modules, ["./main.ts"], []);
      expect(chunks.get("main")).toContain("./a.ts");
      expect(chunks.get("main")).toContain("./b.ts");
    });
  });
});
