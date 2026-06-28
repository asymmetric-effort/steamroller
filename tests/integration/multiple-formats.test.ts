/**
 * Integration tests for multiple output formats from the same build.
 *
 * Verifies that a single rollup() build can generate output multiple times
 * with different formats, producing correct results for each.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";

describe("multiple output formats from same build", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-multiformat-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates ES and CJS from the same build", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      "export const value = 42;\nexport const name = 'multi';\n",
    );

    const build = await rollup({ input: indexPath });

    const esOutput = await build.generate({ format: "es" });
    const cjsOutput = await build.generate({ format: "cjs" });

    const esChunk = esOutput.output[0];
    const cjsChunk = cjsOutput.output[0];

    if (esChunk.type === "chunk" && cjsChunk.type === "chunk") {
      // ES format should have export statements
      expect(esChunk.code).toContain("export");
      expect(esChunk.code).toContain("42");

      // CJS format should have 'use strict' and module.exports/exports
      expect(cjsChunk.code).toContain("'use strict'");
      expect(cjsChunk.code).toContain("42");

      // Both should contain the same values
      expect(esChunk.code).toContain("multi");
      expect(cjsChunk.code).toContain("multi");

      // Exports metadata should match
      expect(esChunk.exports).toContain("value");
      expect(esChunk.exports).toContain("name");
      expect(cjsChunk.exports).toContain("value");
      expect(cjsChunk.exports).toContain("name");
    }
    await build.close();
  });

  it("generates with different banners per format", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const build = await rollup({ input: indexPath });

    const esOutput = await build.generate({
      format: "es",
      banner: "/* ES Module */",
    });
    const cjsOutput = await build.generate({
      format: "cjs",
      banner: "/* CommonJS */",
    });

    const esChunk = esOutput.output[0];
    const cjsChunk = cjsOutput.output[0];

    if (esChunk.type === "chunk" && cjsChunk.type === "chunk") {
      expect(esChunk.code).toContain("/* ES Module */");
      expect(esChunk.code).not.toContain("/* CommonJS */");
      expect(cjsChunk.code).toContain("/* CommonJS */");
      expect(cjsChunk.code).not.toContain("/* ES Module */");
    }
    await build.close();
  });

  it("generates consistent module IDs across formats", async () => {
    const helperPath = join(tempDir, "helper.js");
    await writeFile(helperPath, "export const h = 'helper';\n");

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import { h } from "./helper.js";\nexport const result = h;\n',
    );

    const build = await rollup({ input: indexPath });

    const esOutput = await build.generate({ format: "es" });
    const cjsOutput = await build.generate({ format: "cjs" });

    const esChunk = esOutput.output[0];
    const cjsChunk = cjsOutput.output[0];

    if (esChunk.type === "chunk" && cjsChunk.type === "chunk") {
      // Module IDs should be the same regardless of format
      expect(esChunk.moduleIds).toEqual(cjsChunk.moduleIds);
    }
    await build.close();
  });

  it("writes ES and CJS to different directories", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const val = 'dual-output';\n");

    const build = await rollup({ input: indexPath });

    const esDir = join(tempDir, "dist-es");
    const cjsDir = join(tempDir, "dist-cjs");

    const esResult = await build.write({ format: "es", dir: esDir });
    const cjsResult = await build.write({ format: "cjs", dir: cjsDir });

    const { readFile: rf } = await import("node:fs/promises");

    const esChunk = esResult.output[0];
    const cjsChunk = cjsResult.output[0];

    if (esChunk.type === "chunk" && cjsChunk.type === "chunk") {
      const esContent = await rf(join(esDir, esChunk.fileName), "utf-8");
      const cjsContent = await rf(join(cjsDir, cjsChunk.fileName), "utf-8");

      expect(esContent).toContain("dual-output");
      expect(cjsContent).toContain("dual-output");
      expect(cjsContent).toContain("'use strict'");
    }
    await build.close();
  });

  it("handles external imports differently per format", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import { readFile } from "node:fs/promises";\nexport const read = readFile;\n',
    );

    const build = await rollup({
      input: indexPath,
      external: ["node:fs/promises"],
    });

    const esOutput = await build.generate({ format: "es" });
    const cjsOutput = await build.generate({ format: "cjs" });

    const esChunk = esOutput.output[0];
    const cjsChunk = cjsOutput.output[0];

    if (esChunk.type === "chunk" && cjsChunk.type === "chunk") {
      // ES should use import statement
      expect(esChunk.code).toContain("import");
      expect(esChunk.code).toContain("node:fs/promises");

      // CJS should use require()
      expect(cjsChunk.code).toContain("require");
      expect(cjsChunk.code).toContain("node:fs/promises");
    }
    await build.close();
  });
});
