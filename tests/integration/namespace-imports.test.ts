/**
 * Integration tests for namespace imports.
 *
 * Verifies that rollup() correctly handles import * as ns patterns,
 * including property access, re-export, and interaction with tree-shaking.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";

describe("namespace imports (import * as ns)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-namespace-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("bundles namespace import with property access", async () => {
    const mathPath = join(tempDir, "math.js");
    await writeFile(
      mathPath,
      "export const add = (a, b) => a + b;\nexport const PI = 3.14;\n",
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'import * as math from "./math.js";',
        "export const result = math.add(1, 2);",
        "export const pi = math.PI;",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: indexPath, treeshake: false });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("add");
      expect(chunk.code).toContain("3.14");
      expect(chunk.code).not.toContain('from "./math.js"');
    }
    await build.close();
  });

  it("handles namespace import passed as a value", async () => {
    const configPath = join(tempDir, "config.js");
    await writeFile(
      configPath,
      "export const host = 'localhost';\nexport const port = 3000;\n",
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'import * as config from "./config.js";',
        "export const settings = config;",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: indexPath, treeshake: false });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("localhost");
      expect(chunk.code).toContain("3000");
    }
    await build.close();
  });

  it("namespace import works with CJS format", async () => {
    const utilsPath = join(tempDir, "utils.js");
    await writeFile(
      utilsPath,
      "export const greet = (name) => `Hello, ${name}`;\n",
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import * as utils from "./utils.js";\nexport const msg = utils.greet("world");\n',
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "cjs" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("'use strict'");
      expect(chunk.code).toContain("greet");
    }
    await build.close();
  });

  it("namespace import from external module is preserved", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import * as path from "node:path";\nexport const sep = path.sep;\n',
    );

    const build = await rollup({
      input: indexPath,
      external: ["node:path"],
    });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("node:path");
      expect(chunk.imports).toContain("node:path");
    }
    await build.close();
  });

  it("namespace import combined with named imports from same module", async () => {
    const libPath = join(tempDir, "lib.js");
    await writeFile(
      libPath,
      "export const x = 1;\nexport const y = 2;\nexport const z = 3;\n",
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'import * as lib from "./lib.js";',
        'import { x } from "./lib.js";',
        "export const all = lib;",
        "export const single = x;",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: indexPath, treeshake: false });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code.length).toBeGreaterThan(0);
    }
    await build.close();
  });
});
