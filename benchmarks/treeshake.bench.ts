/**
 * @module benchmarks/treeshake.bench
 * @description Tree-shaking performance benchmarks. Measures how efficiently
 * the bundler eliminates unused code by comparing bundles with and without
 * tree-shaking on inputs with varying amounts of dead code.
 */

import { bench, describe, beforeAll } from "vitest";
import { rollup } from "../src/rollup.js";
import type { RollupBuild, OutputOptions } from "../src/types.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Generates a module graph where only a fraction of exports are actually used.
 * This creates an ideal scenario for measuring tree-shaking effectiveness.
 *
 * @param dir - Directory to write fixture files into.
 * @param moduleCount - Total number of modules to generate.
 * @param usedFraction - Fraction of exports that are actually imported by entry (0-1).
 * @returns The path to the entry module.
 */
const generateTreeShakeFixtures = (
  dir: string,
  moduleCount: number,
  usedFraction: number,
): string => {
  mkdirSync(dir, { recursive: true });

  // Each module exports several functions, some used and some not
  for (let i = 0; i < moduleCount; i++) {
    const lines = [
      `export const used${i} = (x) => x + ${i};`,
      `export const unused_a${i} = (x) => x * ${i};`,
      `export const unused_b${i} = (x) => x - ${i};`,
      `export const unused_c${i} = (x) => x / (${i} + 1);`,
      `export const unused_d${i} = { value: ${i}, label: 'item${i}' };`,
    ];
    writeFileSync(join(dir, `mod${i}.js`), lines.join("\n"));
  }

  // Entry imports only a subset of the modules
  const usedCount = Math.max(1, Math.floor(moduleCount * usedFraction));
  const imports = Array.from(
    { length: usedCount },
    (_, i) => `import { used${i} } from './mod${i}.js';`,
  ).join("\n");

  const usages = Array.from(
    { length: usedCount },
    (_, i) => `  used${i}(${i})`,
  ).join(",\n");

  const entry = [imports, "", `export const results = [`, usages, `];`].join(
    "\n",
  );

  const entryPath = join(dir, "entry.js");
  writeFileSync(entryPath, entry);
  return entryPath;
};

const outputOptions: OutputOptions = { format: "es" };

describe("tree-shaking", () => {
  let sparseSmallEntry: string;
  let sparseMediumEntry: string;
  let sparseLargeEntry: string;
  let denseEntry: string;
  let baseDir: string;

  beforeAll(() => {
    baseDir = join(tmpdir(), `steamroller-treeshake-bench-${Date.now()}`);

    // Sparse: only 10% of exports used (heavy tree-shaking)
    sparseSmallEntry = generateTreeShakeFixtures(
      join(baseDir, "sparse-small"),
      10,
      0.1,
    );
    sparseMediumEntry = generateTreeShakeFixtures(
      join(baseDir, "sparse-medium"),
      50,
      0.1,
    );
    sparseLargeEntry = generateTreeShakeFixtures(
      join(baseDir, "sparse-large"),
      200,
      0.1,
    );

    // Dense: 90% of exports used (light tree-shaking)
    denseEntry = generateTreeShakeFixtures(join(baseDir, "dense"), 50, 0.9);

    return () => {
      rmSync(baseDir, { recursive: true, force: true });
    };
  });

  bench(
    "treeshake-small-sparse (10 modules, 10% used)",
    async () => {
      const bundle: RollupBuild = await rollup({
        input: sparseSmallEntry,
        treeshake: true,
      });
      await bundle.generate(outputOptions);
    },
    { iterations: 20, warmupIterations: 2 },
  );

  bench(
    "treeshake-medium-sparse (50 modules, 10% used)",
    async () => {
      const bundle: RollupBuild = await rollup({
        input: sparseMediumEntry,
        treeshake: true,
      });
      await bundle.generate(outputOptions);
    },
    { iterations: 10, warmupIterations: 1 },
  );

  bench(
    "treeshake-large-sparse (200 modules, 10% used)",
    async () => {
      const bundle: RollupBuild = await rollup({
        input: sparseLargeEntry,
        treeshake: true,
      });
      await bundle.generate(outputOptions);
    },
    { iterations: 5, warmupIterations: 1 },
  );

  bench(
    "treeshake-medium-dense (50 modules, 90% used)",
    async () => {
      const bundle: RollupBuild = await rollup({
        input: denseEntry,
        treeshake: true,
      });
      await bundle.generate(outputOptions);
    },
    { iterations: 10, warmupIterations: 1 },
  );

  bench(
    "no-treeshake-medium (50 modules, baseline)",
    async () => {
      const bundle: RollupBuild = await rollup({
        input: sparseMediumEntry,
        treeshake: false,
      });
      await bundle.generate(outputOptions);
    },
    { iterations: 10, warmupIterations: 1 },
  );
});
