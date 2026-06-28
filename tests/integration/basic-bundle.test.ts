/**
 * Integration tests for the rollup() function with module graph construction.
 *
 * Tests verify that rollup() correctly resolves, loads, and parses modules,
 * building a module graph and producing a RollupBuild with watchFiles and cache.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";

/** Normalize Windows backslashes to forward slashes for cross-platform comparison. */
const norm = (p: string): string => p.replace(/\\/g, "/");

describe("rollup() module graph integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-integration-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("resolves and loads a single entry module", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, 'export const greeting = "hello";\n');

    const build = await rollup({ input: indexPath });

    expect(build.watchFiles.map(norm)).toContain(norm(indexPath));
    expect(build.closed).toBe(false);
    await build.close();
    expect(build.closed).toBe(true);
  });

  it("resolves and loads entry with a relative import", async () => {
    const helperPath = join(tempDir, "helper.js");
    await writeFile(helperPath, "export const value = 42;\n");

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import { value } from "./helper.js";\nexport const result = value;\n',
    );

    const build = await rollup({ input: indexPath });

    expect(build.watchFiles.map(norm)).toContain(norm(indexPath));
    expect(build.watchFiles.map(norm)).toContain(norm(helperPath));
    expect(build.watchFiles.length).toBeGreaterThanOrEqual(2);
    await build.close();
  });

  it("handles external modules", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import fs from "node:fs";\nexport const x = fs;\n',
    );

    const build = await rollup({
      input: indexPath,
      external: ["node:fs"],
    });

    expect(build.watchFiles.map(norm)).toContain(norm(indexPath));
    // External modules appear in watchFiles
    expect(build.watchFiles.some((f) => f === "node:fs")).toBe(true);
    await build.close();
  });

  it("supports multiple entry points", async () => {
    const aPath = join(tempDir, "a.js");
    const bPath = join(tempDir, "b.js");
    await writeFile(aPath, "export const a = 1;\n");
    await writeFile(bPath, "export const b = 2;\n");

    const build = await rollup({ input: [aPath, bPath] });

    expect(build.watchFiles.map(norm)).toContain(norm(aPath));
    expect(build.watchFiles.map(norm)).toContain(norm(bPath));
    await build.close();
  });

  it("passes cache from options through to build", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const cache = { modules: [], plugins: {} };
    const build = await rollup({ input: indexPath, cache });

    expect(build.cache).toBe(cache);
    await build.close();
  });

  it("populates watchFiles with all resolved module paths", async () => {
    const libDir = join(tempDir, "lib");
    await mkdir(libDir);

    const utilPath = join(libDir, "util.js");
    await writeFile(utilPath, 'export const util = "util";\n');

    const helperPath = join(tempDir, "helper.js");
    await writeFile(
      helperPath,
      'import { util } from "./lib/util.js";\nexport const helper = util;\n',
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import { helper } from "./helper.js";\nexport const main = helper;\n',
    );

    const build = await rollup({ input: indexPath });

    expect(build.watchFiles.map(norm)).toContain(norm(indexPath));
    expect(build.watchFiles.map(norm)).toContain(norm(helperPath));
    expect(build.watchFiles.map(norm)).toContain(norm(utilPath));
    expect(build.watchFiles.length).toBe(3);
    await build.close();
  });

  it("calls plugin hooks during graph construction", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const hooksCalled: Array<string> = [];

    const build = await rollup({
      input: indexPath,
      plugins: [
        {
          name: "test-plugin",
          buildStart() {
            hooksCalled.push("buildStart");
          },
          buildEnd() {
            hooksCalled.push("buildEnd");
          },
        },
      ],
    });

    expect(hooksCalled).toContain("buildStart");
    expect(hooksCalled).toContain("buildEnd");
    await build.close();
  });

  it("throws on unresolvable entry point", async () => {
    const missingPath = join(tempDir, "nonexistent.js");

    await expect(rollup({ input: missingPath })).rejects.toThrow(
      /ENOENT|Could not resolve entry/,
    );
  });

  it("throws UNRESOLVED_ENTRY for bare specifier entry", async () => {
    await expect(rollup({ input: "nonexistent-bare-module" })).rejects.toThrow(
      /Could not resolve entry/,
    );
  });

  it("generate() produces output from the build", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const build = await rollup({ input: indexPath });
    const output = await build.generate({ format: "es" });

    expect(output.output).toHaveLength(1);
    expect(output.output[0].type).toBe("chunk");
    await build.close();
  });
});

describe("generate() code generation", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-codegen-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("produces non-empty code from a single module", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const greeting = 'hello';\n");

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    expect(chunk.type).toBe("chunk");
    if (chunk.type === "chunk") {
      expect(chunk.code.length).toBeGreaterThan(0);
      expect(chunk.code).toContain("greeting");
      expect(chunk.code).toContain("hello");
    }
    await build.close();
  });

  it("concatenates multiple modules and removes internal imports", async () => {
    const helperPath = join(tempDir, "helper.js");
    await writeFile(helperPath, "export const value = 42;\n");

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import { value } from "./helper.js";\nexport const result = value + 1;\n',
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code.length).toBeGreaterThan(0);
      expect(chunk.code).toContain("value");
      expect(chunk.code).toContain("42");
      expect(chunk.code).toContain("result");
      // Internal imports should be removed
      expect(chunk.code).not.toContain('from "./helper.js"');
      expect(chunk.code).not.toContain("from './helper.js'");
    }
    await build.close();
  });

  it("preserves external imports in ES format", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import { readFile } from "node:fs/promises";\nexport const read = readFile;\n',
    );

    const build = await rollup({
      input: indexPath,
      external: ["node:fs/promises"],
    });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("node:fs/promises");
      expect(chunk.imports).toContain("node:fs/promises");
    }
    await build.close();
  });

  it("generates CJS format with require() wrapping", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import { readFile } from "node:fs/promises";\nexport const read = readFile;\n',
    );

    const build = await rollup({
      input: indexPath,
      external: ["node:fs/promises"],
    });
    const { output } = await build.generate({ format: "cjs" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("require");
      expect(chunk.code).toContain("node:fs/promises");
      expect(chunk.code).toContain("'use strict'");
    }
    await build.close();
  });

  it("includes module IDs in the output chunk", async () => {
    const helperPath = join(tempDir, "helper.js");
    await writeFile(helperPath, "export const h = 1;\n");

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import { h } from "./helper.js";\nexport const x = h;\n',
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.moduleIds.map(norm)).toContain(norm(indexPath));
      expect(chunk.moduleIds.map(norm)).toContain(norm(helperPath));
    }
    await build.close();
  });

  it("populates exports array from entry module exports", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      "export const foo = 1;\nexport const bar = 2;\n",
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.exports).toContain("foo");
      expect(chunk.exports).toContain("bar");
    }
    await build.close();
  });

  it("sets facadeModuleId to entry module ID", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(norm(chunk.facadeModuleId ?? "")).toBe(norm(indexPath));
    }
    await build.close();
  });

  it("applies banner addon to output", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({
      format: "es",
      banner: "/* MIT License */",
    });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toMatch(/^\/\* MIT License \*\//);
    }
    await build.close();
  });

  it("applies footer addon to output", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({
      format: "es",
      footer: "/* end */",
    });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("/* end */");
    }
    await build.close();
  });

  it("handles default exports", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "const x = 42;\nexport default x;\n");

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code.length).toBeGreaterThan(0);
      expect(chunk.exports).toContain("default");
    }
    await build.close();
  });

  it("handles three-module dependency chain", async () => {
    const aPath = join(tempDir, "a.js");
    await writeFile(aPath, "export const a = 'aaa';\n");

    const bPath = join(tempDir, "b.js");
    await writeFile(
      bPath,
      'import { a } from "./a.js";\nexport const b = a + "bbb";\n',
    );

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import { b } from "./b.js";\nexport const result = b;\n',
    );

    const build = await rollup({ input: indexPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("aaa");
      expect(chunk.code).toContain("bbb");
      expect(chunk.code).toContain("result");
      // Internal imports removed
      expect(chunk.code).not.toContain('from "./a.js"');
      expect(chunk.code).not.toContain('from "./b.js"');
    }
    await build.close();
  });
});
