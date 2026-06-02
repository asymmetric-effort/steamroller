/**
 * Tests for preserveModules output option in src/build/rollup-build.ts
 *
 * Covers:
 * - preserveModules=true produces one chunk per module
 * - Module directory structure is preserved
 * - Imports between modules are rewritten to point to correct output files
 * - preserveModulesRoot strips the specified prefix from output paths
 */
import { describe, it, expect } from "vitest";
import { createRollupBuild } from "../../../src/build/rollup-build.js";
import type { BuildState } from "../../../src/build/rollup-build.js";
import { Module } from "../../../src/module/Module.js";
import { parse } from "../../../src/parser/parser.js";

const createMinimalState = (
  overrides: Partial<BuildState> = {},
): BuildState => ({
  modules: [],
  cache: undefined,
  watchFiles: [],
  ...overrides,
});

const createModuleWithCode = (
  id: string,
  code: string,
  isEntry: boolean = false,
): Module => {
  const mod = new Module(id, code, isEntry);
  mod.ast = parse(code);
  mod.extractImportsExports();
  mod.isIncluded = true;
  return mod;
};

describe("preserveModules", () => {
  describe("one chunk per module", () => {
    it("produces one output chunk per module when preserveModules is true", async () => {
      const entry = createModuleWithCode(
        "src/index.ts",
        'import { helper } from "./utils.ts";\nexport const main = helper();',
        true,
      );
      const utils = createModuleWithCode(
        "src/utils.ts",
        "export const helper = () => 42;",
      );
      entry.dependencies.add(utils);
      utils.importers.add(entry);

      const state = createMinimalState({ modules: [utils, entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
      });

      const chunks = result.output.filter((o) => o.type === "chunk");
      expect(chunks).toHaveLength(2);
    });

    it("each chunk has exactly one module in its moduleIds", async () => {
      const entry = createModuleWithCode(
        "src/index.ts",
        'import { helper } from "./utils.ts";\nexport const main = helper();',
        true,
      );
      const utils = createModuleWithCode(
        "src/utils.ts",
        "export const helper = () => 42;",
      );
      entry.dependencies.add(utils);
      utils.importers.add(entry);

      const state = createMinimalState({ modules: [utils, entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
      });

      const chunks = result.output.filter((o) => o.type === "chunk");
      for (const chunk of chunks) {
        if (chunk.type === "chunk") {
          expect(chunk.moduleIds).toHaveLength(1);
        }
      }
    });

    it("marks only the entry module chunk as isEntry", async () => {
      const entry = createModuleWithCode(
        "src/index.ts",
        'import { helper } from "./utils.ts";\nexport const main = helper();',
        true,
      );
      const utils = createModuleWithCode(
        "src/utils.ts",
        "export const helper = () => 42;",
      );
      entry.dependencies.add(utils);
      utils.importers.add(entry);

      const state = createMinimalState({ modules: [utils, entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
      });

      const chunks = result.output.filter((o) => o.type === "chunk");
      const entryChunks = chunks.filter((c) => c.type === "chunk" && c.isEntry);
      const nonEntryChunks = chunks.filter(
        (c) => c.type === "chunk" && !c.isEntry,
      );
      expect(entryChunks).toHaveLength(1);
      expect(nonEntryChunks).toHaveLength(1);
    });

    it("works with a single module (no dependencies)", async () => {
      const entry = createModuleWithCode(
        "src/main.ts",
        "export const value = 1;",
        true,
      );

      const state = createMinimalState({ modules: [entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
      });

      const chunks = result.output.filter((o) => o.type === "chunk");
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type === "chunk" && chunks[0].isEntry).toBe(true);
    });
  });

  describe("directory structure preservation", () => {
    it("preserves directory structure in output file names", async () => {
      const entry = createModuleWithCode(
        "src/index.ts",
        'import { helper } from "./lib/utils.ts";\nexport const main = helper();',
        true,
      );
      const utils = createModuleWithCode(
        "src/lib/utils.ts",
        "export const helper = () => 42;",
      );
      entry.dependencies.add(utils);
      utils.importers.add(entry);

      const state = createMinimalState({ modules: [utils, entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
      });

      const fileNames = result.output
        .filter((o) => o.type === "chunk")
        .map((o) => o.fileName)
        .sort();
      expect(fileNames).toContain("src/index.js");
      expect(fileNames).toContain("src/lib/utils.js");
    });

    it("strips preserveModulesRoot prefix from output paths", async () => {
      const entry = createModuleWithCode(
        "src/index.ts",
        'import { helper } from "./lib/utils.ts";\nexport const main = helper();',
        true,
      );
      const utils = createModuleWithCode(
        "src/lib/utils.ts",
        "export const helper = () => 42;",
      );
      entry.dependencies.add(utils);
      utils.importers.add(entry);

      const state = createMinimalState({ modules: [utils, entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
        preserveModulesRoot: "src",
      });

      const fileNames = result.output
        .filter((o) => o.type === "chunk")
        .map((o) => o.fileName)
        .sort();
      expect(fileNames).toContain("index.js");
      expect(fileNames).toContain("lib/utils.js");
    });

    it("handles deeply nested modules", async () => {
      const entry = createModuleWithCode(
        "src/app/main.ts",
        'import { deep } from "./features/auth/login.ts";\nexport const app = deep();',
        true,
      );
      const deep = createModuleWithCode(
        "src/app/features/auth/login.ts",
        "export const deep = () => true;",
      );
      entry.dependencies.add(deep);
      deep.importers.add(entry);

      const state = createMinimalState({ modules: [deep, entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
        preserveModulesRoot: "src",
      });

      const fileNames = result.output
        .filter((o) => o.type === "chunk")
        .map((o) => o.fileName)
        .sort();
      expect(fileNames).toContain("app/main.js");
      expect(fileNames).toContain("app/features/auth/login.js");
    });

    it("replaces file extension with .js", async () => {
      const entry = createModuleWithCode(
        "src/index.tsx",
        "export const App = () => null;",
        true,
      );

      const state = createMinimalState({ modules: [entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
      });

      const fileNames = result.output
        .filter((o) => o.type === "chunk")
        .map((o) => o.fileName);
      expect(fileNames).toContain("src/index.js");
    });
  });

  describe("import rewriting", () => {
    it("rewrites internal imports to point to correct output files", async () => {
      const entry = createModuleWithCode(
        "src/index.ts",
        'import { helper } from "./utils.ts";\nexport const main = helper();',
        true,
      );
      const utils = createModuleWithCode(
        "src/utils.ts",
        "export const helper = () => 42;",
      );
      entry.dependencies.add(utils);
      utils.importers.add(entry);

      const state = createMinimalState({ modules: [utils, entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
      });

      // Find the entry chunk
      const entryChunk = result.output.find(
        (o) => o.type === "chunk" && o.isEntry,
      );
      expect(entryChunk).toBeDefined();
      if (entryChunk && entryChunk.type === "chunk") {
        // The import should reference the output path of utils
        expect(entryChunk.code).toContain("./utils.js");
      }
    });

    it("rewrites imports when preserveModulesRoot changes relative paths", async () => {
      const entry = createModuleWithCode(
        "src/index.ts",
        'import { helper } from "./lib/utils.ts";\nexport const main = helper();',
        true,
      );
      const utils = createModuleWithCode(
        "src/lib/utils.ts",
        "export const helper = () => 42;",
      );
      entry.dependencies.add(utils);
      utils.importers.add(entry);

      const state = createMinimalState({ modules: [utils, entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
        preserveModulesRoot: "src",
      });

      // Entry is now at index.js, utils is at lib/utils.js
      const entryChunk = result.output.find(
        (o) => o.type === "chunk" && o.isEntry,
      );
      expect(entryChunk).toBeDefined();
      if (entryChunk && entryChunk.type === "chunk") {
        expect(entryChunk.code).toContain("./lib/utils.js");
      }
    });

    it("keeps external imports unchanged", async () => {
      const entry = createModuleWithCode(
        "src/index.ts",
        'import lodash from "lodash";\nexport const main = lodash.get;',
        true,
      );

      const state = createMinimalState({ modules: [entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
      });

      const entryChunk = result.output.find(
        (o) => o.type === "chunk" && o.isEntry,
      );
      expect(entryChunk).toBeDefined();
      if (entryChunk && entryChunk.type === "chunk") {
        expect(entryChunk.code).toContain("lodash");
      }
    });

    it("each chunk facadeModuleId matches its module", async () => {
      const entry = createModuleWithCode(
        "src/index.ts",
        'import { helper } from "./utils.ts";\nexport const main = helper();',
        true,
      );
      const utils = createModuleWithCode(
        "src/utils.ts",
        "export const helper = () => 42;",
      );
      entry.dependencies.add(utils);
      utils.importers.add(entry);

      const state = createMinimalState({ modules: [utils, entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: true,
      });

      const chunks = result.output.filter((o) => o.type === "chunk");
      const facadeIds = chunks.map(
        (c) => c.type === "chunk" && c.facadeModuleId,
      );
      expect(facadeIds).toContain("src/index.ts");
      expect(facadeIds).toContain("src/utils.ts");
    });
  });

  describe("preserveModules=false (default)", () => {
    it("bundles modules into a single chunk when preserveModules is false", async () => {
      const entry = createModuleWithCode(
        "src/index.ts",
        'import { helper } from "./utils.ts";\nexport const main = helper();',
        true,
      );
      const utils = createModuleWithCode(
        "src/utils.ts",
        "export const helper = () => 42;",
      );
      entry.dependencies.add(utils);
      utils.importers.add(entry);

      const state = createMinimalState({ modules: [utils, entry] });
      const build = createRollupBuild(state);
      const result = await build.generate({
        format: "es",
        preserveModules: false,
      });

      const chunks = result.output.filter((o) => o.type === "chunk");
      // Without preserveModules, everything should be bundled into one chunk
      expect(chunks).toHaveLength(1);
    });
  });
});
