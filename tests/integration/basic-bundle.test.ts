/**
 * Integration tests for the rollup() function with module graph construction.
 *
 * Tests verify that rollup() correctly resolves, loads, and parses modules,
 * building a module graph and producing a RollupBuild with watchFiles and cache.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";

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

    expect(build.watchFiles).toContain(indexPath);
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

    expect(build.watchFiles).toContain(indexPath);
    expect(build.watchFiles).toContain(helperPath);
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

    expect(build.watchFiles).toContain(indexPath);
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

    expect(build.watchFiles).toContain(aPath);
    expect(build.watchFiles).toContain(bPath);
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

    expect(build.watchFiles).toContain(indexPath);
    expect(build.watchFiles).toContain(helperPath);
    expect(build.watchFiles).toContain(utilPath);
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
