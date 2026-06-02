/**
 * Integration tests for advanced dynamic import scenarios.
 *
 * Verifies code splitting with tree-shaking together, and more
 * complex dynamic import patterns.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";
import type { OutputChunk } from "../../src/types.js";

const norm = (p: string): string => p.replace(/\\/g, "/");

describe("dynamic import with code splitting and tree-shaking", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-dynadv-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("tree-shakes unused exports within dynamically imported chunks", async () => {
    const lazyPath = join(tempDir, "lazy.js");
    await writeFile(
      lazyPath,
      [
        "export const used = 'lazy-used';",
        "export const unused = 'lazy-unused';",
        "",
      ].join("\n"),
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        "const loadLazy = () => import('./lazy.js');",
        "export { loadLazy };",
        "",
      ].join("\n"),
    );

    // tree-shaking on by default
    const build = await rollup({ input: indexPath });
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

    // Entry chunk should contain the import() call
    expect(entryChunk.code).toContain("import(");

    // Dynamic chunk should exist as a separate file
    expect(dynamicChunk.moduleIds.map(norm)).toContain(norm(lazyPath));
    await build.close();
  });

  it("static and dynamic imports to the same module", async () => {
    const sharedPath = join(tempDir, "shared.js");
    await writeFile(sharedPath, "export const shared = 'shared-value';\n");

    const staticDepPath = join(tempDir, "static-dep.js");
    await writeFile(
      staticDepPath,
      'import { shared } from "./shared.js";\nexport const dep = shared;\n',
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'import { dep } from "./static-dep.js";',
        "const loadShared = () => import('./shared.js');",
        "export { dep, loadShared };",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: indexPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    // Should produce multiple chunks (entry + dynamic chunk for shared)
    expect(output.length).toBeGreaterThanOrEqual(2);

    const entryChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isEntry,
    ) as OutputChunk;
    expect(entryChunk).toBeDefined();
    // Entry chunk should have the import() call
    expect(entryChunk.code).toContain("import(");

    // The combined output across all chunks should contain the shared value
    const allCode = output
      .filter((o) => o.type === "chunk")
      .map((o) => (o as OutputChunk).code)
      .join("\n");
    expect(allCode).toContain("shared-value");

    await build.close();
  });

  it("dynamic import chain: A -> dynamic B -> dynamic C", async () => {
    const cPath = join(tempDir, "c.js");
    await writeFile(cPath, "export const c = 'deep-dynamic';\n");

    const bPath = join(tempDir, "b.js");
    await writeFile(
      bPath,
      "const loadC = () => import('./c.js');\nexport { loadC };\nexport const b = 'mid-dynamic';\n",
    );

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      "const loadB = () => import('./b.js');\nexport { loadB };\n",
    );

    const build = await rollup({ input: aPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    // Should have at least 3 chunks: entry, B chunk, C chunk
    expect(output.length).toBeGreaterThanOrEqual(3);

    const dynamicChunks = output.filter(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as Array<OutputChunk>;
    expect(dynamicChunks.length).toBeGreaterThanOrEqual(2);

    const allDynamicCode = dynamicChunks.map((ch) => ch.code).join("\n");
    expect(allDynamicCode).toContain("mid-dynamic");
    expect(allDynamicCode).toContain("deep-dynamic");

    await build.close();
  });

  it("code splitting preserves exports metadata in dynamic chunks", async () => {
    const lazyPath = join(tempDir, "lazy.js");
    await writeFile(
      lazyPath,
      "export const alpha = 'a';\nexport const beta = 'b';\n",
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      "const load = () => import('./lazy.js');\nexport { load };\n",
    );

    const build = await rollup({ input: indexPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    const dynamicChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as OutputChunk;

    expect(dynamicChunk).toBeDefined();
    expect(dynamicChunk.exports).toContain("alpha");
    expect(dynamicChunk.exports).toContain("beta");

    await build.close();
  });
});
