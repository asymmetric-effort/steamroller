/**
 * Integration tests for tree-shaking wired into the build pipeline.
 *
 * Verifies that tree-shaking correctly removes unused exports,
 * preserves side effects, and can be disabled.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";

describe("tree-shaking integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-treeshake-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("removes unused exports from dependency modules", async () => {
    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      ["export const used = 'yes';", "export const unused = 'no';", ""].join(
        "\n",
      ),
    );

    const bPath = join(tempDir, "b.js");
    await writeFile(
      bPath,
      [
        'import { used } from "./a.js";',
        "export const result = used;",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: bPath });
    const { output } = await build.generate({ format: "es" });
    const chunk = output[0];

    expect(chunk.type).toBe("chunk");
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("used");
      expect(chunk.code).toContain("yes");
      expect(chunk.code).not.toContain("unused");
      expect(chunk.code).not.toContain("'no'");
    }
    await build.close();
  });

  it("preserves side-effectful top-level statements", async () => {
    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      [
        "console.log('side effect');",
        "export const used = 1;",
        "export const unused = 2;",
        "",
      ].join("\n"),
    );

    const bPath = join(tempDir, "b.js");
    await writeFile(
      bPath,
      [
        'import { used } from "./a.js";',
        "export const result = used;",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: bPath });
    const { output } = await build.generate({ format: "es" });
    const chunk = output[0];

    if (chunk.type === "chunk") {
      // Side-effectful statement must be preserved
      expect(chunk.code).toContain("console.log");
      expect(chunk.code).toContain("side effect");
    }
    await build.close();
  });

  it("includes everything when treeshake is false", async () => {
    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      ["export const used = 'yes';", "export const unused = 'no';", ""].join(
        "\n",
      ),
    );

    const bPath = join(tempDir, "b.js");
    await writeFile(
      bPath,
      [
        'import { used } from "./a.js";',
        "export const result = used;",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: bPath, treeshake: false });
    const { output } = await build.generate({ format: "es" });
    const chunk = output[0];

    if (chunk.type === "chunk") {
      // With tree-shaking disabled, everything should be included
      expect(chunk.code).toContain("used");
      expect(chunk.code).toContain("unused");
    }
    await build.close();
  });

  it("keeps entry module exports even if unused internally", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      ["export const foo = 1;", "export const bar = 2;", ""].join("\n"),
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });
    const chunk = output[0];

    if (chunk.type === "chunk") {
      // Entry exports are always preserved
      expect(chunk.code).toContain("foo");
      expect(chunk.code).toContain("bar");
    }
    await build.close();
  });

  it("removes unused functions while keeping used ones", async () => {
    const utilsPath = join(tempDir, "utils.js");
    await writeFile(
      utilsPath,
      [
        "export const add = (a, b) => a + b;",
        "export const subtract = (a, b) => a - b;",
        "export const multiply = (a, b) => a * b;",
        "",
      ].join("\n"),
    );

    const mainPath = join(tempDir, "main.js");
    await writeFile(
      mainPath,
      [
        'import { add } from "./utils.js";',
        "export const sum = add(1, 2);",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: mainPath });
    const { output } = await build.generate({ format: "es" });
    const chunk = output[0];

    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("add");
      expect(chunk.code).not.toContain("subtract");
      expect(chunk.code).not.toContain("multiply");
    }
    await build.close();
  });

  it("handles modules with no exports gracefully", async () => {
    const sideEffectPath = join(tempDir, "side-effect.js");
    await writeFile(sideEffectPath, "console.log('init');\n");

    const mainPath = join(tempDir, "main.js");
    await writeFile(
      mainPath,
      ['import "./side-effect.js";', "export const x = 1;", ""].join("\n"),
    );

    const build = await rollup({ input: mainPath });
    const { output } = await build.generate({ format: "es" });
    const chunk = output[0];

    if (chunk.type === "chunk") {
      // Side-effect-only module should still be included
      expect(chunk.code).toContain("console.log");
      expect(chunk.code).toContain("init");
    }
    await build.close();
  });

  it("produces valid output with three-module chain and tree-shaking", async () => {
    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      [
        "export const needed = 'keep';",
        "export const notNeeded = 'drop';",
        "",
      ].join("\n"),
    );

    const bPath = join(tempDir, "b.js");
    await writeFile(
      bPath,
      [
        'import { needed } from "./a.js";',
        "export const middle = needed;",
        "export const extra = 'extra';",
        "",
      ].join("\n"),
    );

    const cPath = join(tempDir, "c.js");
    await writeFile(
      cPath,
      [
        'import { middle } from "./b.js";',
        "export const final_val = middle;",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: cPath });
    const { output } = await build.generate({ format: "es" });
    const chunk = output[0];

    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("needed");
      expect(chunk.code).toContain("keep");
      expect(chunk.code).toContain("final_val");
      expect(chunk.code).not.toContain("notNeeded");
      expect(chunk.code).not.toContain("'drop'");
    }
    await build.close();
  });

  it("works with CJS format and tree-shaking enabled", async () => {
    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      ["export const kept = 'yes';", "export const dropped = 'no';", ""].join(
        "\n",
      ),
    );

    const bPath = join(tempDir, "b.js");
    await writeFile(
      bPath,
      ['import { kept } from "./a.js";', "export const out = kept;", ""].join(
        "\n",
      ),
    );

    const build = await rollup({ input: bPath });
    const { output } = await build.generate({ format: "cjs" });
    const chunk = output[0];

    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("kept");
      expect(chunk.code).not.toContain("dropped");
    }
    await build.close();
  });
});
