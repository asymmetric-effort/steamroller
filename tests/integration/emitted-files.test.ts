/**
 * Integration tests for emitted files in the generate/write pipeline.
 *
 * Verifies that plugins can emit asset files via this.emitFile() during
 * the generateBundle hook, and that emitted assets appear in generate()
 * output and are written to disk by write().
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";
import type { Plugin } from "../../src/types.js";

describe("emitted files in generate/write pipeline", () => {
  let tempDir: string;
  let inputDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-emitted-"));
    inputDir = join(tempDir, "input");
    outputDir = join(tempDir, "output");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(inputDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("emitted asset appears in generate() output", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const plugin: Plugin = {
      name: "emit-asset-plugin",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: '{"version":"1.0"}',
        });
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    const result = await build.generate({ format: "es" });

    // Should have the code chunk plus the emitted asset
    expect(result.output.length).toBeGreaterThanOrEqual(2);

    const asset = result.output.find(
      (item) => item.type === "asset" && item.fileName === "manifest.json",
    );
    expect(asset).toBeDefined();
    expect(asset!.type).toBe("asset");
    if (asset!.type === "asset") {
      expect(asset!.source).toBe('{"version":"1.0"}');
    }

    await build.close();
  });

  it("emitted asset is written to disk by write()", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const greeting = 'hello';\n");

    const plugin: Plugin = {
      name: "emit-asset-write-plugin",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "styles.css",
          source: "body { color: red; }",
        });
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    const result = await build.write({ dir: outputDir, format: "es" });

    // Verify asset is in output
    const asset = result.output.find(
      (item) => item.type === "asset" && item.fileName === "styles.css",
    );
    expect(asset).toBeDefined();

    // Verify asset file was written to disk
    const assetPath = join(outputDir, "styles.css");
    const fileStat = await stat(assetPath);
    expect(fileStat.isFile()).toBe(true);

    const content = await readFile(assetPath, "utf-8");
    expect(content).toBe("body { color: red; }");

    // Verify code chunk was also written
    const chunk = result.output[0];
    expect(chunk.type).toBe("chunk");

    await build.close();
  });

  it("emitted asset with name gets default path under assets/", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const plugin: Plugin = {
      name: "emit-named-asset-plugin",
      generateBundle() {
        this.emitFile({
          type: "asset",
          name: "data.txt",
          source: "some data",
        });
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    const result = await build.generate({ format: "es" });

    const asset = result.output.find((item) => item.type === "asset");
    expect(asset).toBeDefined();
    if (asset && asset.type === "asset") {
      expect(asset.fileName).toBe("assets/data.txt");
      expect(asset.source).toBe("some data");
    }

    await build.close();
  });

  it("multiple emitted assets all appear in output", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const plugin: Plugin = {
      name: "emit-multiple-assets-plugin",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "a.txt",
          source: "file-a",
        });
        this.emitFile({
          type: "asset",
          fileName: "b.txt",
          source: "file-b",
        });
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    const result = await build.generate({ format: "es" });

    const assets = result.output.filter((item) => item.type === "asset");
    expect(assets.length).toBe(2);

    const fileNames = assets.map((a) => a.fileName);
    expect(fileNames).toContain("a.txt");
    expect(fileNames).toContain("b.txt");

    await build.close();
  });

  it("emitted binary asset is written correctly", async () => {
    const indexPath = join(inputDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const plugin: Plugin = {
      name: "emit-binary-asset-plugin",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "image.png",
          source: binaryData,
        });
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    const result = await build.write({ dir: outputDir, format: "es" });

    const asset = result.output.find(
      (item) => item.type === "asset" && item.fileName === "image.png",
    );
    expect(asset).toBeDefined();

    const assetPath = join(outputDir, "image.png");
    const fileBuffer = await readFile(assetPath);
    expect(fileBuffer[0]).toBe(0x89);
    expect(fileBuffer[1]).toBe(0x50);
    expect(fileBuffer[2]).toBe(0x4e);
    expect(fileBuffer[3]).toBe(0x47);

    await build.close();
  });
});
