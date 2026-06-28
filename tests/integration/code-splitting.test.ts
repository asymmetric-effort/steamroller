/**
 * Integration tests for code splitting via dynamic imports.
 *
 * Verifies that generate() produces multiple chunks when the module graph
 * contains dynamic imports and inlineDynamicImports is not set.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";
import type { OutputChunk } from "../../src/types.js";

/** Normalize Windows backslashes to forward slashes for cross-platform comparison. */
const norm = (p: string): string => p.replace(/\\/g, "/");

describe("code splitting via dynamic imports", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-splitting-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("produces multiple chunks when a module dynamically imports another", async () => {
    // Module B: statically imported by A
    const bPath = join(tempDir, "b.js");
    await writeFile(bPath, "export const b = 'from-b';\n");

    // Module C: dynamically imported by A
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'from-c';\n");

    // Module A: entry, statically imports B, dynamically imports C
    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      [
        'import { b } from "./b.js";',
        'const loadC = () => import("./c.js");',
        "export { b, loadC };",
      ].join("\n") + "\n",
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    // Should produce at least 2 chunks (entry + dynamic)
    expect(output.length).toBeGreaterThanOrEqual(2);

    // Identify entry and dynamic chunks
    const entryChunks = output.filter(
      (o) => o.type === "chunk" && (o as OutputChunk).isEntry,
    ) as Array<OutputChunk>;
    const dynamicChunks = output.filter(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as Array<OutputChunk>;

    expect(entryChunks.length).toBe(1);
    expect(dynamicChunks.length).toBeGreaterThanOrEqual(1);

    const entryChunk = entryChunks[0];
    const dynamicChunk = dynamicChunks[0];

    // Entry chunk should contain code from A and B
    expect(entryChunk.code).toContain("from-b");
    expect(entryChunk.code).toContain("loadC");

    // Dynamic chunk should contain code from C
    expect(dynamicChunk.code).toContain("from-c");

    // Entry chunk should NOT contain code from C
    expect(entryChunk.code).not.toContain("from-c");

    // Dynamic chunk should NOT contain code from A or B
    expect(dynamicChunk.code).not.toContain("from-b");

    // Entry chunk should reference the dynamic chunk via import()
    expect(entryChunk.code).toContain("import(");

    await build.close();
  });

  it("entry chunk moduleIds include A and B but not C", async () => {
    const bPath = join(tempDir, "b.js");
    await writeFile(bPath, "export const b = 1;\n");

    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 2;\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      [
        'import { b } from "./b.js";',
        'const getC = () => import("./c.js");',
        "export { b, getC };",
      ].join("\n") + "\n",
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    const entryChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isEntry,
    ) as OutputChunk;
    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    expect(entryChunk).toBeDefined();
    expect(dynamicChunk).toBeDefined();

    // Entry chunk should list A and B in moduleIds
    expect(entryChunk.moduleIds.map(norm)).toContain(norm(aPath));
    expect(entryChunk.moduleIds.map(norm)).toContain(norm(bPath));
    expect(entryChunk.moduleIds.map(norm)).not.toContain(norm(cPath));

    // Dynamic chunk should list C
    expect(dynamicChunk.moduleIds.map(norm)).toContain(norm(cPath));

    await build.close();
  });

  it("inlineDynamicImports=true produces a single chunk", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'inline-c';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const getC = () => import("./c.js");\nexport { getC };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({
      format: "es",
      inlineDynamicImports: true,
    });

    // With inlineDynamicImports, should be exactly 1 chunk
    expect(output.length).toBe(1);
    expect(output[0].type).toBe("chunk");

    await build.close();
  });

  it("dynamic chunk has isDynamicEntry=true and isEntry=false", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 3;\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const lazy = () => import("./c.js");\nexport { lazy };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    expect(dynamicChunk).toBeDefined();
    expect(dynamicChunk.isDynamicEntry).toBe(true);
    expect(dynamicChunk.isEntry).toBe(false);

    await build.close();
  });

  it("entry chunk dynamicImports array references the dynamic chunk file name", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'dyn';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    const entryChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isEntry,
    ) as OutputChunk;
    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    expect(entryChunk.dynamicImports.length).toBeGreaterThanOrEqual(1);
    expect(entryChunk.dynamicImports).toContain(dynamicChunk.fileName);

    await build.close();
  });

  it("chunks have distinct file names", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'unique';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const fn = () => import("./c.js");\nexport { fn };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    const fileNames = output
      .filter((o) => o.type === "chunk")
      .map((o) => (o as OutputChunk).fileName);

    // All file names should be unique
    const unique = new Set(fileNames);
    expect(unique.size).toBe(fileNames.length);

    await build.close();
  });

  it("no splitting when there are no dynamic imports", async () => {
    const bPath = join(tempDir, "b.js");
    await writeFile(bPath, "export const b = 10;\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'import { b } from "./b.js";\nexport const result = b;\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es" });

    // Single chunk when no dynamic imports
    expect(output.length).toBe(1);
    expect(output[0].type).toBe("chunk");
    expect((output[0] as OutputChunk).isEntry).toBe(true);

    await build.close();
  });

  it("facadeModuleId of dynamic chunk points to the dynamically imported module", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'facade-test';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const go = () => import("./c.js");\nexport { go };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    expect(dynamicChunk).toBeDefined();
    expect(norm(dynamicChunk.facadeModuleId ?? "")).toBe(norm(cPath));

    await build.close();
  });

  it("multiple dynamic imports produce separate chunks", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'chunk-c';\n");

    const dPath = join(tempDir, "d.js");
    await writeFile(dPath, "export const d = 'chunk-d';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      [
        'const loadC = () => import("./c.js");',
        'const loadD = () => import("./d.js");',
        "export { loadC, loadD };",
      ].join("\n") + "\n",
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    const dynamicChunks = output.filter(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as Array<OutputChunk>;

    // Should have at least 2 dynamic chunks
    expect(dynamicChunks.length).toBeGreaterThanOrEqual(2);

    // One chunk should have C content, another D content
    const allDynamicCode = dynamicChunks.map((ch) => ch.code).join("\n");
    expect(allDynamicCode).toContain("chunk-c");
    expect(allDynamicCode).toContain("chunk-d");

    await build.close();
  });

  it("entry chunk's import() call references the dynamic chunk file path", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'ref-test';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    const entryChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isEntry,
    ) as OutputChunk;
    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    // The entry chunk code should contain an import() pointing to the dynamic chunk file
    expect(entryChunk.code).toContain(dynamicChunk.fileName);

    await build.close();
  });

  it("CJS format produces separate chunks with require-style wrapping", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'cjs-test';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "cjs", dir: "dist" });

    // Should still split into multiple chunks
    expect(output.length).toBeGreaterThanOrEqual(2);

    const entryChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isEntry,
    ) as OutputChunk;
    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    expect(entryChunk).toBeDefined();
    expect(dynamicChunk).toBeDefined();
    expect(entryChunk.code).toContain("use strict");
    expect(dynamicChunk.code).toContain("cjs-test");

    await build.close();
  });

  it("handles dynamic import with single-quoted source in code", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'quote-test';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      "const load = () => import('./c.js');\nexport { load };\n",
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    expect(output.length).toBeGreaterThanOrEqual(2);

    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;
    expect(dynamicChunk).toBeDefined();
    expect(dynamicChunk.code).toContain("quote-test");

    await build.close();
  });

  it("external imports are preserved in split chunks", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(
      cPath,
      'import { readFile } from "node:fs/promises";\nexport const read = readFile;\n',
    );

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const build = await rollup({
      input: aPath,
      treeshake: false,
      external: ["node:fs/promises"],
    });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    expect(dynamicChunk).toBeDefined();
    expect(dynamicChunk.code).toContain("node:fs/promises");
    expect(dynamicChunk.imports).toContain("node:fs/promises");

    await build.close();
  });

  it("custom chunkFileNames pattern is applied to dynamic chunks", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'pattern-test';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({
      format: "es",
      dir: "dist",
      chunkFileNames: "chunks/[name]-[hash].js",
    });

    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    expect(dynamicChunk).toBeDefined();
    expect(dynamicChunk.fileName).toMatch(/^chunks\/c-[a-zA-Z0-9_-]+\.js$/);

    await build.close();
  });

  it("custom entryFileNames pattern is applied to entry chunks", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 1;\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({
      format: "es",
      dir: "dist",
      entryFileNames: "entry/[name].js",
    });

    const entryChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isEntry,
    ) as OutputChunk;

    expect(entryChunk).toBeDefined();
    expect(entryChunk.fileName).toMatch(/^entry\/a\.js$/);

    await build.close();
  });

  it("banner and footer addons are applied to each chunk", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'addon-test';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({
      format: "es",
      dir: "dist",
      banner: "/* BANNER */",
      footer: "/* FOOTER */",
    });

    for (let i = 0; i < output.length; i++) {
      const chunk = output[i] as OutputChunk;
      expect(chunk.code).toContain("/* BANNER */");
      expect(chunk.code).toContain("/* FOOTER */");
    }

    await build.close();
  });

  it("modules record in dynamic chunk has correct entries", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'mod-record';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    expect(dynamicChunk).toBeDefined();
    expect(dynamicChunk.modules).toBeDefined();
    const normModules = Object.fromEntries(
      Object.entries(dynamicChunk.modules).map(([k, v]) => [norm(k), v]),
    );
    expect(normModules[norm(cPath)]).toBeDefined();
    expect(normModules[norm(cPath)].originalLength).toBeGreaterThan(0);

    await build.close();
  });

  it("code splitting works with tree-shaking enabled", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(
      cPath,
      "export const c = 'ts-test';\nexport const unused = 'gone';\n",
    );

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    // treeshake defaults to true
    const build = await rollup({ input: aPath });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    expect(output.length).toBeGreaterThanOrEqual(2);

    const entryChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isEntry,
    ) as OutputChunk;
    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    expect(entryChunk).toBeDefined();
    expect(dynamicChunk).toBeDefined();
    // Dynamic chunk should exist even with tree-shaking
    expect(dynamicChunk.moduleIds.map(norm)).toContain(norm(cPath));

    await build.close();
  });

  it("default export module as dynamic import", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "const c = 42;\nexport default c;\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    expect(output.length).toBeGreaterThanOrEqual(2);

    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    expect(dynamicChunk).toBeDefined();
    expect(dynamicChunk.code).toContain("42");

    await build.close();
  });

  it("dynamically imported module with re-exports", async () => {
    const helperPath = join(tempDir, "helper.js");
    await writeFile(helperPath, "export const h = 'helper-val';\n");

    const cPath = join(tempDir, "c.js");
    await writeFile(
      cPath,
      'export { h } from "./helper.js";\nexport const c = "reexport";\n',
    );

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    expect(output.length).toBeGreaterThanOrEqual(2);
    await build.close();
  });

  it("split chunk with export * from another module", async () => {
    const helperPath = join(tempDir, "helper.js");
    await writeFile(helperPath, "export const h = 'star-export';\n");

    const cPath = join(tempDir, "c.js");
    await writeFile(
      cPath,
      'export * from "./helper.js";\nexport const c = "star";\n',
    );

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    expect(output.length).toBeGreaterThanOrEqual(2);
    await build.close();
  });

  it("duplicate dynamic import source maps to same chunk", async () => {
    // Two modules both dynamically import the same target
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'shared-dyn';\n");

    const bPath = join(tempDir, "b.js");
    await writeFile(bPath, 'export const loadC = () => import("./c.js");\n');

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      [
        'import { loadC } from "./b.js";',
        'const myLoad = () => import("./c.js");',
        "export { loadC, myLoad };",
      ].join("\n") + "\n",
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    // Should still produce exactly one dynamic chunk for c.js
    const dynamicChunks = output.filter(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as Array<OutputChunk>;
    expect(dynamicChunks.length).toBe(1);
    expect(dynamicChunks[0].code).toContain("shared-dyn");

    await build.close();
  });

  it("handles default export in entry module (single-chunk)", async () => {
    const aPath = join(tempDir, "a.js");
    await writeFile(aPath, "const val = 99;\nexport default val;\n");

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0] as OutputChunk;
    expect(chunk.exports).toContain("default");
    expect(chunk.code).toContain("99");

    await build.close();
  });

  it("handles default export in non-entry with CJS format (single-chunk)", async () => {
    const bPath = join(tempDir, "b.js");
    await writeFile(bPath, "const b = 50;\nexport default b;\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'import b from "./b.js";\nexport const result = b;\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "cjs" });

    const chunk = output[0] as OutputChunk;
    expect(chunk.code).toContain("50");
    expect(chunk.code).toContain("use strict");

    await build.close();
  });

  it("handles export all from in entry that also imports (single-chunk)", async () => {
    const bPath = join(tempDir, "b.js");
    await writeFile(bPath, "export const b = 'star-val';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'import { b } from "./b.js";\nexport { b };\nexport const a = 1;\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0] as OutputChunk;
    expect(chunk.code).toContain("star-val");
    expect(chunk.code).toContain("1");

    await build.close();
  });

  it("re-export named from internal in non-entry CJS format", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'reexp';\n");

    const bPath = join(tempDir, "b.js");
    await writeFile(
      bPath,
      'import { c } from "./c.js";\nexport { c };\nexport const b = "bval";\n',
    );

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'import { b, c } from "./b.js";\nexport const result = b + c;\n',
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "cjs" });

    const chunk = output[0] as OutputChunk;
    expect(chunk.code).toContain("reexp");
    expect(chunk.code).toContain("bval");

    await build.close();
  });

  it("tree-shaking skips unused modules in single-chunk path", async () => {
    const helperPath = join(tempDir, "helper.js");
    await writeFile(helperPath, "export const unused = 'unused-val';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'import { unused } from "./helper.js";\nexport const x = 1;\n',
    );

    // Tree-shaking enabled (default), no dynamic imports -> single-chunk path
    const build = await rollup({ input: aPath });
    const { output } = await build.generate({ format: "es" });

    expect(output.length).toBe(1);
    const chunk = output[0] as OutputChunk;
    // Tree-shaking should remove the unused import
    expect(chunk.code).toContain("1");

    await build.close();
  });

  it("write() with code splitting creates multiple files", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'write-test';\n");

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      'const load = () => import("./c.js");\nexport { load };\n',
    );

    const outDir = join(tempDir, "dist");
    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.write({ format: "es", dir: outDir });

    expect(output.length).toBeGreaterThanOrEqual(2);

    // Verify files exist on disk
    const { readFile: rf } = await import("node:fs/promises");
    for (let i = 0; i < output.length; i++) {
      if (output[i].type === "chunk") {
        const chunk = output[i] as OutputChunk;
        const filePath = join(outDir, chunk.fileName);
        const content = await rf(filePath, "utf-8");
        expect(content).toBe(chunk.code);
      }
    }

    await build.close();
  });
});
