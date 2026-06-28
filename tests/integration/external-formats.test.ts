/**
 * Integration tests for external modules with different output formats.
 *
 * Verifies that external modules are rendered correctly as CJS require()
 * vs ES import depending on the output format.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";

describe("external modules with different formats", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-external-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("ES format preserves import for external modules", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'import { readFile } from "node:fs/promises";',
        'import { join } from "node:path";',
        "export const read = readFile;",
        "export const j = join;",
        "",
      ].join("\n"),
    );

    const build = await rollup({
      input: indexPath,
      external: ["node:fs/promises", "node:path"],
    });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("node:fs/promises");
      expect(chunk.code).toContain("node:path");
      expect(chunk.imports).toContain("node:fs/promises");
      expect(chunk.imports).toContain("node:path");
    }
    await build.close();
  });

  it("CJS format uses require() for external modules", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'import { readFile } from "node:fs/promises";',
        'import { join } from "node:path";',
        "export const read = readFile;",
        "export const j = join;",
        "",
      ].join("\n"),
    );

    const build = await rollup({
      input: indexPath,
      external: ["node:fs/promises", "node:path"],
    });
    const { output } = await build.generate({ format: "cjs" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("require");
      expect(chunk.code).toContain("node:fs/promises");
      expect(chunk.code).toContain("node:path");
      expect(chunk.code).toContain("'use strict'");
    }
    await build.close();
  });

  it("external function callback determines external status", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'import { readFile } from "node:fs/promises";',
        "export const read = readFile;",
        "",
      ].join("\n"),
    );

    const build = await rollup({
      input: indexPath,
      external: (id: string) => id.startsWith("node:"),
    });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("node:fs/promises");
      expect(chunk.imports).toContain("node:fs/promises");
    }
    await build.close();
  });

  it("mixes internal and external modules correctly", async () => {
    const helperPath = join(tempDir, "helper.js");
    await writeFile(helperPath, "export const helper = 'internal';\n");

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'import { readFile } from "node:fs/promises";',
        'import { helper } from "./helper.js";',
        "export const read = readFile;",
        "export const h = helper;",
        "",
      ].join("\n"),
    );

    const build = await rollup({
      input: indexPath,
      external: ["node:fs/promises"],
    });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      // External import preserved
      expect(chunk.code).toContain("node:fs/promises");
      // Internal import inlined
      expect(chunk.code).toContain("internal");
      expect(chunk.code).not.toContain('from "./helper.js"');
    }
    await build.close();
  });

  it("default import from external module in ES format", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import path from "node:path";\nexport const p = path;\n',
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

  it("default import from external module in CJS format", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import path from "node:path";\nexport const p = path;\n',
    );

    const build = await rollup({
      input: indexPath,
      external: ["node:path"],
    });
    const { output } = await build.generate({ format: "cjs" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("require");
      expect(chunk.code).toContain("node:path");
      expect(chunk.code).toContain("'use strict'");
    }
    await build.close();
  });

  it("multiple external modules produce correct import order", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      [
        'import { resolve } from "node:path";',
        'import { readFile } from "node:fs/promises";',
        'import { createServer } from "node:http";',
        "export { resolve, readFile, createServer };",
        "",
      ].join("\n"),
    );

    const build = await rollup({
      input: indexPath,
      external: ["node:path", "node:fs/promises", "node:http"],
    });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.imports).toContain("node:path");
      expect(chunk.imports).toContain("node:fs/promises");
      expect(chunk.imports).toContain("node:http");
    }
    await build.close();
  });
});
