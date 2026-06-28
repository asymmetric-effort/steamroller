/**
 * Integration tests for circular dependency handling.
 *
 * Verifies that rollup() can handle circular dependencies between modules,
 * producing warnings but still generating a valid bundle.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";

const norm = (p: string): string => p.replace(/\\/g, "/");

describe("circular dependency handling", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-circular-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("bundles two modules with a simple circular import", async () => {
    const aPath = join(tempDir, "a.js");
    const bPath = join(tempDir, "b.js");

    await writeFile(
      aPath,
      [
        'import { b } from "./b.js";',
        "export const a = 'a-val';",
        "export const aUsesB = b;",
        "",
      ].join("\n"),
    );

    await writeFile(
      bPath,
      [
        'import { a } from "./a.js";',
        "export const b = 'b-val';",
        "export const bUsesA = a;",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: aPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    expect(chunk.type).toBe("chunk");
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("a-val");
      expect(chunk.code).toContain("b-val");
      // Internal imports between a and b should be removed
      expect(chunk.code).not.toContain('from "./b.js"');
      expect(chunk.code).not.toContain('from "./a.js"');
    }
    await build.close();
  });

  it("resolves all modules in a circular graph into watchFiles", async () => {
    const aPath = join(tempDir, "a.js");
    const bPath = join(tempDir, "b.js");

    await writeFile(
      aPath,
      'import { b } from "./b.js";\nexport const a = b;\n',
    );
    await writeFile(
      bPath,
      'import { a } from "./a.js";\nexport const b = a;\n',
    );

    const build = await rollup({ input: aPath });

    expect(build.watchFiles.map(norm)).toContain(norm(aPath));
    expect(build.watchFiles.map(norm)).toContain(norm(bPath));
    await build.close();
  });

  it("handles a three-module circular dependency chain", async () => {
    const aPath = join(tempDir, "a.js");
    const bPath = join(tempDir, "b.js");
    const cPath = join(tempDir, "c.js");

    await writeFile(
      aPath,
      'import { c } from "./c.js";\nexport const a = "a:" + c;\n',
    );
    await writeFile(
      bPath,
      'import { a } from "./a.js";\nexport const b = "b:" + a;\n',
    );
    await writeFile(
      cPath,
      'import { b } from "./b.js";\nexport const c = "c:" + b;\n',
    );

    const build = await rollup({ input: aPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    expect(chunk.type).toBe("chunk");
    if (chunk.type === "chunk") {
      expect(chunk.code.length).toBeGreaterThan(0);
      // All module values should be present in the bundle
      expect(chunk.moduleIds.map(norm)).toContain(norm(aPath));
      expect(chunk.moduleIds.map(norm)).toContain(norm(bPath));
      expect(chunk.moduleIds.map(norm)).toContain(norm(cPath));
    }
    await build.close();
  });

  it("produces valid CJS output with circular dependencies", async () => {
    const aPath = join(tempDir, "a.js");
    const bPath = join(tempDir, "b.js");

    await writeFile(
      aPath,
      'import { b } from "./b.js";\nexport const a = "hello";\nexport const aUsesB = b;\n',
    );
    await writeFile(
      bPath,
      'import { a } from "./a.js";\nexport const b = "world";\nexport const bUsesA = a;\n',
    );

    const build = await rollup({ input: aPath });
    const { output } = await build.generate({ format: "cjs" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("'use strict'");
      expect(chunk.code).toContain("hello");
      expect(chunk.code).toContain("world");
    }
    await build.close();
  });

  it("handles self-referencing module", async () => {
    const aPath = join(tempDir, "a.js");

    await writeFile(
      aPath,
      ["export const value = 42;", "export const self = value;", ""].join("\n"),
    );

    const build = await rollup({ input: aPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("42");
      expect(chunk.code).toContain("value");
    }
    await build.close();
  });
});
