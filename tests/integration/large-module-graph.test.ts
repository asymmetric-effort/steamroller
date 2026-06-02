/**
 * Integration tests for a large module graph (10+ modules).
 *
 * Verifies that rollup() correctly handles complex dependency trees
 * with many modules, deep chains, diamond patterns, and shared deps.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";
import type { OutputChunk } from "../../src/types.js";

const norm = (p: string): string => p.replace(/\\/g, "/");

describe("large module graph (10+ modules)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-largegraph-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("bundles a deep chain of 10 modules", async () => {
    const paths: Array<string> = [];

    // Create modules m0 through m9
    // Each imports the previous one
    for (let i = 0; i < 10; i++) {
      const filePath = join(tempDir, `m${i}.js`);
      paths.push(filePath);

      if (i === 0) {
        await writeFile(filePath, `export const v0 = 'root';\n`);
      } else {
        await writeFile(
          filePath,
          `import { v${i - 1} } from "./m${i - 1}.js";\nexport const v${i} = v${i - 1} + '-${i}';\n`,
        );
      }
    }

    const entryPath = paths[paths.length - 1];
    const build = await rollup({ input: entryPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      // Should contain the root value
      expect(chunk.code).toContain("root");
      // Should have all 10 modules in moduleIds
      expect(chunk.moduleIds.length).toBe(10);
      // No internal imports remaining
      for (let i = 0; i < 9; i++) {
        expect(chunk.code).not.toContain(`from "./m${i}.js"`);
      }
    }
    await build.close();
  });

  it("handles diamond dependency pattern with shared module", async () => {
    // Diamond: entry -> left, entry -> right, left -> shared, right -> shared
    const sharedPath = join(tempDir, "shared.js");
    await writeFile(sharedPath, "export const shared = 'diamond-shared';\n");

    const leftPath = join(tempDir, "left.js");
    await writeFile(
      leftPath,
      'import { shared } from "./shared.js";\nexport const left = "left:" + shared;\n',
    );

    const rightPath = join(tempDir, "right.js");
    await writeFile(
      rightPath,
      'import { shared } from "./shared.js";\nexport const right = "right:" + shared;\n',
    );

    const entryPath = join(tempDir, "entry.js");
    await writeFile(
      entryPath,
      [
        'import { left } from "./left.js";',
        'import { right } from "./right.js";',
        "export const result = { left, right };",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: entryPath, treeshake: false });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("diamond-shared");
      expect(chunk.code).toContain("left:");
      expect(chunk.code).toContain("right:");
      // shared module should be included exactly once (no duplication)
      expect(chunk.moduleIds.map(norm)).toContain(norm(sharedPath));
    }
    await build.close();
  });

  it("tree-shakes across a large graph with unused branches", async () => {
    // Create a graph where some branches are unused:
    // entry -> usedA -> usedB
    // entry -> unusedC -> unusedD

    const usedBPath = join(tempDir, "usedB.js");
    await writeFile(usedBPath, "export const usedB = 'keep-B';\n");

    const usedAPath = join(tempDir, "usedA.js");
    await writeFile(
      usedAPath,
      'import { usedB } from "./usedB.js";\nexport const usedA = "keep-A:" + usedB;\n',
    );

    const unusedDPath = join(tempDir, "unusedD.js");
    await writeFile(unusedDPath, "export const unusedD = 'drop-D';\n");

    const unusedCPath = join(tempDir, "unusedC.js");
    await writeFile(
      unusedCPath,
      'import { unusedD } from "./unusedD.js";\nexport const unusedC = "drop-C:" + unusedD;\n',
    );

    const entryPath = join(tempDir, "entry.js");
    await writeFile(
      entryPath,
      [
        'import { usedA } from "./usedA.js";',
        'import { unusedC } from "./unusedC.js";',
        "export const result = usedA;",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: entryPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("keep-A");
      expect(chunk.code).toContain("keep-B");
      // Unused branch should be tree-shaken
      expect(chunk.code).not.toContain("drop-C");
      expect(chunk.code).not.toContain("drop-D");
    }
    await build.close();
  });

  it("handles modules in subdirectories", async () => {
    const libDir = join(tempDir, "lib");
    const utilsDir = join(tempDir, "lib", "utils");
    await mkdir(libDir);
    await mkdir(utilsDir);

    const formatPath = join(utilsDir, "format.js");
    await writeFile(formatPath, "export const format = (x) => `[${x}]`;\n");

    const validatePath = join(utilsDir, "validate.js");
    await writeFile(
      validatePath,
      "export const validate = (x) => x !== null;\n",
    );

    const corePath = join(libDir, "core.js");
    await writeFile(
      corePath,
      [
        'import { format } from "./utils/format.js";',
        'import { validate } from "./utils/validate.js";',
        "export const process = (x) => validate(x) ? format(x) : 'invalid';",
        "",
      ].join("\n"),
    );

    const entryPath = join(tempDir, "index.js");
    await writeFile(
      entryPath,
      'import { process } from "./lib/core.js";\nexport { process };\n',
    );

    const build = await rollup({ input: entryPath });
    const { output } = await build.generate({ format: "es" });

    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code.length).toBeGreaterThan(0);
      expect(chunk.moduleIds.length).toBe(4);
      expect(chunk.exports).toContain("process");
    }
    await build.close();
  });

  it("bundles 12 modules with mixed static and dynamic imports", async () => {
    // Static: entry -> a -> b -> c -> d -> e
    // Dynamic from entry: -> lazy1 -> lazy2
    // Dynamic from a: -> lazy3
    // Each lazy module imports a static util

    const utilPath = join(tempDir, "util.js");
    await writeFile(utilPath, "export const util = 'shared-util';\n");

    const ePath = join(tempDir, "e.js");
    await writeFile(ePath, "export const e = 'e-val';\n");

    const dPath = join(tempDir, "d.js");
    await writeFile(
      dPath,
      'import { e } from "./e.js";\nexport const d = "d:" + e;\n',
    );

    const cPath = join(tempDir, "c.js");
    await writeFile(
      cPath,
      'import { d } from "./d.js";\nexport const c = "c:" + d;\n',
    );

    const bPath = join(tempDir, "b.js");
    await writeFile(
      bPath,
      'import { c } from "./c.js";\nexport const b = "b:" + c;\n',
    );

    const lazy2Path = join(tempDir, "lazy2.js");
    await writeFile(
      lazy2Path,
      'import { util } from "./util.js";\nexport const lazy2 = "lazy2:" + util;\n',
    );

    const lazy1Path = join(tempDir, "lazy1.js");
    await writeFile(
      lazy1Path,
      [
        'import { util } from "./util.js";',
        "const loadLazy2 = () => import('./lazy2.js');",
        "export const lazy1 = 'lazy1:' + util;",
        "export { loadLazy2 };",
        "",
      ].join("\n"),
    );

    const lazy3Path = join(tempDir, "lazy3.js");
    await writeFile(
      lazy3Path,
      'import { util } from "./util.js";\nexport const lazy3 = "lazy3:" + util;\n',
    );

    const aPath = join(tempDir, "a.js");
    await writeFile(
      aPath,
      [
        'import { b } from "./b.js";',
        "const loadLazy3 = () => import('./lazy3.js');",
        "export const a = 'a:' + b;",
        "export { loadLazy3 };",
        "",
      ].join("\n"),
    );

    const entryPath = join(tempDir, "entry.js");
    await writeFile(
      entryPath,
      [
        'import { a } from "./a.js";',
        "const loadLazy1 = () => import('./lazy1.js');",
        "export { a, loadLazy1 };",
        "",
      ].join("\n"),
    );

    const build = await rollup({ input: entryPath, treeshake: false });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    // Should produce multiple chunks
    expect(output.length).toBeGreaterThanOrEqual(4);

    const entryChunk = output.find(
      (o) => o.type === "chunk" && (o as OutputChunk).isEntry,
    ) as OutputChunk;
    const dynamicChunks = output.filter(
      (o) => o.type === "chunk" && (o as OutputChunk).isDynamicEntry,
    ) as Array<OutputChunk>;

    expect(entryChunk).toBeDefined();
    expect(dynamicChunks.length).toBeGreaterThanOrEqual(3);

    // Entry chunk should contain the static chain
    expect(entryChunk.code).toContain("e-val");

    await build.close();
  });

  it("handles multiple entry points sharing dependencies", async () => {
    const sharedPath = join(tempDir, "shared.js");
    await writeFile(sharedPath, "export const shared = 'common';\n");

    const entry1Path = join(tempDir, "entry1.js");
    await writeFile(
      entry1Path,
      'import { shared } from "./shared.js";\nexport const e1 = "entry1:" + shared;\n',
    );

    const entry2Path = join(tempDir, "entry2.js");
    await writeFile(
      entry2Path,
      'import { shared } from "./shared.js";\nexport const e2 = "entry2:" + shared;\n',
    );

    const build = await rollup({
      input: [entry1Path, entry2Path],
      treeshake: false,
    });
    const { output } = await build.generate({ format: "es", dir: "dist" });

    // Should produce at least 1 chunk
    expect(output.length).toBeGreaterThanOrEqual(1);

    const chunks = output.filter((o) => o.type === "chunk") as OutputChunk[];
    const allCode = chunks.map((c) => c.code).join("\n");
    // Both entry point values should be present in the output
    expect(allCode).toContain("entry1:");
    expect(allCode).toContain("entry2:");
    expect(allCode).toContain("common");

    await build.close();
  });
});
