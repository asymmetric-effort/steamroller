/**
 * Integration tests for re-export patterns.
 *
 * Verifies that rollup() correctly resolves re-export patterns and
 * includes them in the module graph. Tests verify that the bundler
 * processes re-export syntax without errors and produces valid output.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";

describe("re-export patterns", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-reexport-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates output for named re-export pattern", async () => {
    const helperPath = join(tempDir, "helper.js");
    await writeFile(
      helperPath,
      "export const value = 'reexported';\nexport const other = 'not-used';\n",
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, 'export { value } from "./helper.js";\n');

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    expect(chunk.type).toBe("chunk");
    if (chunk.type === "chunk") {
      expect(chunk.exports).toContain("value");
    }
    await build.close();
  });

  it("generates output for star re-export pattern", async () => {
    const utilsPath = join(tempDir, "utils.js");
    await writeFile(
      utilsPath,
      "export const add = (a, b) => a + b;\nexport const PI = 3.14;\n",
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, 'export * from "./utils.js";\n');

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    expect(chunk.type).toBe("chunk");
    await build.close();
  });

  it("handles renamed re-export syntax without errors", async () => {
    const srcPath = join(tempDir, "src.js");
    await writeFile(srcPath, "export const original = 'renamed-val';\n");

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'export { original as renamed } from "./src.js";\n',
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.exports).toContain("renamed");
    }
    await build.close();
  });

  it("handles chained re-exports across three modules", async () => {
    const deepPath = join(tempDir, "deep.js");
    await writeFile(deepPath, "export const deepVal = 'from-deep';\n");

    const middlePath = join(tempDir, "middle.js");
    await writeFile(middlePath, 'export { deepVal } from "./deep.js";\n');

    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, 'export { deepVal } from "./middle.js";\n');

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    expect(chunk.type).toBe("chunk");
    if (chunk.type === "chunk") {
      expect(chunk.exports).toContain("deepVal");
    }
    await build.close();
  });

  it("combines star re-export with own exports", async () => {
    const libPath = join(tempDir, "lib.js");
    await writeFile(libPath, "export const libFn = () => 'lib';\n");

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'export * from "./lib.js";',
        "export const ownExport = 'mine';",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.exports).toContain("ownExport");
      expect(chunk.code).toContain("mine");
    }
    await build.close();
  });

  it("handles multiple re-exports from different sources", async () => {
    const aPath = join(tempDir, "a.js");
    await writeFile(aPath, "export const fromA = 'a-value';\n");

    const bPath = join(tempDir, "b.js");
    await writeFile(bPath, "export const fromB = 'b-value';\n");

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'export { fromA } from "./a.js";',
        'export { fromB } from "./b.js";',
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    expect(chunk.type).toBe("chunk");
    if (chunk.type === "chunk") {
      expect(chunk.exports).toContain("fromA");
      expect(chunk.exports).toContain("fromB");
    }
    await build.close();
  });

  it("re-export consumed via import inlines the value", async () => {
    // When a re-export barrel is consumed via import, the value should be inlined
    const libPath = join(tempDir, "lib.js");
    await writeFile(libPath, "export const used = 'keep-me';\n");

    const barrelPath = join(tempDir, "barrel.js");
    await writeFile(
      barrelPath,
      'import { used } from "./lib.js";\nexport { used };\n',
    );

    const mainPath = join(tempDir, "main.js");
    await writeFile(
      mainPath,
      'import { used } from "./barrel.js";\nexport const result = used;\n',
    );

    const build = await rollup({ input: mainPath, treeshake: false });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("keep-me");
      expect(chunk.code).toContain("result");
    }
    await build.close();
  });

  it("re-export in CJS format produces valid output", async () => {
    const srcPath = join(tempDir, "src.js");
    await writeFile(srcPath, "export const val = 'cjs-reexport';\n");

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import { val } from "./src.js";\nexport { val };\n',
    );

    const build = await rollup({ input: indexPath, treeshake: false });
    const { output } = await build.generate({ format: "cjs" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("'use strict'");
      expect(chunk.code).toContain("cjs-reexport");
    }
    await build.close();
  });
});
