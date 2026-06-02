/**
 * Integration tests for write() file output.
 *
 * Tests verify that write() creates output directories and writes
 * chunks/assets to disk correctly for various output options.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";

/** Normalize Windows backslashes to forward slashes for cross-platform comparison. */
const norm = (p: string): string => p.replace(/\\/g, "/");

describe("write() file output", () => {
  let tempDir: string;
  let inputDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-write-"));
    inputDir = join(tempDir, "input");
    outputDir = join(tempDir, "output");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(inputDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes ES module output to dir", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const greeting = 'hello';\n");

    const build = await rollup({ input: indexPath });
    const result = await build.write({ dir: outputDir, format: "es" });

    const chunk = result.output[0];
    expect(chunk.type).toBe("chunk");

    if (chunk.type === "chunk") {
      const outputPath = join(outputDir, chunk.fileName);
      const fileContent = await readFile(outputPath, "utf-8");
      expect(fileContent).toBe(chunk.code);
      expect(fileContent).toContain("greeting");
      expect(fileContent).toContain("hello");
    }

    await build.close();
  });

  it("output matches generate() code exactly", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const x = 42;\nexport const y = 99;\n");

    const build = await rollup({ input: indexPath });
    const generated = await build.generate({ format: "es" });
    const written = await build.write({ dir: outputDir, format: "es" });

    const genChunk = generated.output[0];
    const writeChunk = written.output[0];

    if (genChunk.type === "chunk" && writeChunk.type === "chunk") {
      expect(writeChunk.code).toBe(genChunk.code);

      const filePath = join(outputDir, writeChunk.fileName);
      const fileContent = await readFile(filePath, "utf-8");
      expect(fileContent).toBe(genChunk.code);
    }

    await build.close();
  });

  it("generates valid JavaScript that can be evaluated", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const value = 123;\n");

    const build = await rollup({ input: indexPath });
    await build.write({ dir: outputDir, format: "es" });

    const outputPath = join(outputDir, "bundle.js");
    const fileContent = await readFile(outputPath, "utf-8");

    // Verify the output is syntactically valid JS by wrapping in a Function
    // Remove export keyword for eval context
    const evalCode = fileContent.replace(/export\s+/g, "");
    const fn = new Function(evalCode + "\nreturn value;");
    expect(fn()).toBe(123);

    await build.close();
  });

  it("writes to a specific file path using options.file", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const msg = 'file-test';\n");

    const outputFile = join(outputDir, "custom-name.js");
    const build = await rollup({ input: indexPath });
    await build.write({ file: outputFile, format: "es" });

    const fileContent = await readFile(outputFile, "utf-8");
    expect(fileContent).toContain("msg");
    expect(fileContent).toContain("file-test");

    await build.close();
  });

  it("creates output directory if it does not exist", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const nestedDir = join(outputDir, "deeply", "nested", "path");
    const build = await rollup({ input: indexPath });
    await build.write({ dir: nestedDir, format: "es" });

    const outputPath = join(nestedDir, "bundle.js");
    const fileStat = await stat(outputPath);
    expect(fileStat.isFile()).toBe(true);

    await build.close();
  });

  it("creates parent directory for options.file if it does not exist", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const outputFile = join(outputDir, "sub", "dir", "output.js");
    const build = await rollup({ input: indexPath });
    await build.write({ file: outputFile, format: "es" });

    const fileContent = await readFile(outputFile, "utf-8");
    expect(fileContent.length).toBeGreaterThan(0);

    await build.close();
  });

  it("writes CJS format that can be required", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const answer = 42;\n");

    const build = await rollup({ input: indexPath });
    await build.write({ dir: outputDir, format: "cjs" });

    const outputPath = join(outputDir, "bundle.js");
    const fileContent = await readFile(outputPath, "utf-8");
    expect(fileContent).toContain("'use strict'");
    expect(fileContent).toContain("exports");

    // Verify the CJS output is executable
    const module = { exports: {} } as { exports: Record<string, unknown> };
    const fn = new Function("module", "exports", "require", fileContent);
    fn(module, module.exports, require);
    expect(module.exports["answer"]).toBe(42);

    await build.close();
  });

  it("writes multi-module bundle correctly", async () => {
    const helperPath = join(inputDir, "helper.js");
    await writeFile(helperPath, "export const helper = 'helper-value';\n");

    const indexPath = join(inputDir, "index.js");
    await writeFile(
      indexPath,
      'import { helper } from "./helper.js";\nexport const result = helper;\n',
    );

    const build = await rollup({ input: indexPath });
    await build.write({ dir: outputDir, format: "es" });

    const outputPath = join(outputDir, "bundle.js");
    const fileContent = await readFile(outputPath, "utf-8");
    expect(fileContent).toContain("helper-value");
    expect(fileContent).toContain("result");
    // Internal imports should be removed
    expect(fileContent).not.toContain('from "./helper.js"');

    await build.close();
  });

  it("defaults to 'dist' directory when neither dir nor file is specified", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    // Change to tempDir so 'dist' is created there
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const build = await rollup({ input: indexPath });
      await build.write({ format: "es" });

      const outputPath = join(tempDir, "dist", "bundle.js");
      const fileStat = await stat(outputPath);
      expect(fileStat.isFile()).toBe(true);

      await build.close();
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("throws error when write() is called after close()", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const build = await rollup({ input: indexPath });
    await build.close();

    await expect(build.write({ dir: outputDir, format: "es" })).rejects.toThrow(
      "Bundle is already closed",
    );
  });

  it("returns RollupOutput with correct chunk metadata", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const a = 1;\nexport const b = 2;\n");

    const build = await rollup({ input: indexPath });
    const result = await build.write({ dir: outputDir, format: "es" });

    expect(result.output).toHaveLength(1);
    const chunk = result.output[0];
    expect(chunk.type).toBe("chunk");
    if (chunk.type === "chunk") {
      expect(chunk.isEntry).toBe(true);
      expect(norm(chunk.facadeModuleId ?? "")).toBe(norm(indexPath));
      expect(chunk.exports).toContain("a");
      expect(chunk.exports).toContain("b");
    }

    await build.close();
  });
});
