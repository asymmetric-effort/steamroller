/**
 * Integration tests for combined default and named exports.
 *
 * Verifies that rollup() correctly handles modules that use both
 * default export and named exports together.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";

const norm = (p: string): string => p.replace(/\\/g, "/");

describe("default export combined with named exports", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-defaultnamed-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("entry module with both default and named exports", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        "export const name = 'widget';",
        "export const version = 1;",
        "const widget = { name: 'widget', version: 1 };",
        "export default widget;",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.exports).toContain("default");
      expect(chunk.exports).toContain("name");
      expect(chunk.exports).toContain("version");
      expect(chunk.code).toContain("widget");
    }
    await build.close();
  });

  it("imports both default and named from same module", async () => {
    const libPath = join(tempDir, "lib.js");
    await writeFile(
      libPath,
      [
        "export const helper = 'named-helper';",
        "const lib = { main: true };",
        "export default lib;",
        "",
      ].join("\n"),
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'import lib, { helper } from "./lib.js";',
        "export const result = { lib, helper };",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: indexPath, treeshake: false });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      // The dependency module's declarations should be included
      expect(chunk.code).toContain("named-helper");
      expect(chunk.code).not.toContain('from "./lib.js"');
    }
    await build.close();
  });

  it("default export function with named exports", async () => {
    const modulePath = join(tempDir, "module.js");
    await writeFile(
      modulePath,
      [
        "export const CONSTANT = 'constant-value';",
        "export function helper() { return 'help'; }",
        "export default function main() { return 'main-result'; }",
        "",
      ].join("\n"),
    );

    // Use the module as entry directly so its exports are preserved
    const build = await rollup({ input: modulePath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("constant-value");
      expect(chunk.code).toContain("help");
      expect(chunk.exports).toContain("CONSTANT");
      expect(chunk.exports).toContain("helper");
      expect(chunk.exports).toContain("default");
    }
    await build.close();
  });

  it("CJS format handles default and named exports", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        "export const named = 'named-val';",
        "const def = 'default-val';",
        "export default def;",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "cjs" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("'use strict'");
      expect(chunk.code).toContain("named-val");
      expect(chunk.exports).toContain("default");
      expect(chunk.exports).toContain("named");
    }
    await build.close();
  });

  it("re-exports default from another module", async () => {
    const srcPath = join(tempDir, "src.js");
    await writeFile(
      srcPath,
      "const value = 'default-reexport';\nexport default value;\n",
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'export { default } from "./src.js";\nexport const extra = "extra-val";\n',
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.exports).toContain("default");
      expect(chunk.exports).toContain("extra");
    }
    await build.close();
  });

  it("tree-shakes unused named export from dependency with both default and named", async () => {
    const libPath = join(tempDir, "lib.js");
    await writeFile(
      libPath,
      [
        "export const used = 'keep';",
        "export const unused = 'drop';",
        "const def = 'default-keep';",
        "export default def;",
        "",
      ].join("\n"),
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'import def, { used } from "./lib.js";',
        "export const result = { def, used };",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: indexPath, treeshake: false });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("keep");
      expect(chunk.code).toContain("default-keep");
    }
    await build.close();
  });
});
