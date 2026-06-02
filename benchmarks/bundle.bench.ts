/**
 * @module benchmarks/bundle.bench
 * @description End-to-end bundle benchmarks measuring rollup() + generate()
 * performance on sample inputs of varying sizes.
 */

import { bench, describe, beforeAll } from "vitest";
import { rollup } from "../src/rollup.js";
import type { RollupBuild, InputOptions, OutputOptions } from "../src/types.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Generates a set of interconnected JS modules in a temporary directory.
 *
 * @param dir - The directory to write modules into.
 * @param moduleCount - The number of modules to generate.
 */
const generateFixtureModules = (dir: string, moduleCount: number): string => {
  mkdirSync(dir, { recursive: true });

  // Generate leaf modules that export functions
  for (let i = 0; i < moduleCount; i++) {
    const source = [
      `export const value${i} = ${i};`,
      `export const compute${i} = (x) => x + ${i};`,
      `export const transform${i} = (x) => x * ${i + 1};`,
      `const internal${i} = ${i * 2};`,
      `export const combined${i} = (x) => compute${i}(x) + internal${i};`,
    ].join("\n");
    writeFileSync(join(dir, `module${i}.js`), source);
  }

  // Generate entry point that imports from all modules
  const imports = Array.from(
    { length: moduleCount },
    (_, i) => `import { compute${i}, combined${i} } from './module${i}.js';`,
  ).join("\n");

  const usages = Array.from(
    { length: moduleCount },
    (_, i) => `  result += compute${i}(${i}) + combined${i}(${i});`,
  ).join("\n");

  const entry = [
    imports,
    "",
    "let result = 0;",
    usages,
    "export default result;",
  ].join("\n");

  const entryPath = join(dir, "entry.js");
  writeFileSync(entryPath, entry);
  return entryPath;
};

const outputOptions: OutputOptions = { format: "es" };

describe("bundle", () => {
  let smallEntry: string;
  let mediumEntry: string;
  let largeEntry: string;
  let baseDir: string;

  beforeAll(() => {
    baseDir = join(tmpdir(), `steamroller-bench-${Date.now()}`);
    smallEntry = generateFixtureModules(join(baseDir, "small"), 10);
    mediumEntry = generateFixtureModules(join(baseDir, "medium"), 50);
    largeEntry = generateFixtureModules(join(baseDir, "large"), 200);

    return () => {
      rmSync(baseDir, { recursive: true, force: true });
    };
  });

  bench(
    "bundle-small (10 modules)",
    async () => {
      const bundle: RollupBuild = await rollup({ input: smallEntry });
      await bundle.generate(outputOptions);
    },
    { iterations: 20, warmupIterations: 2 },
  );

  bench(
    "bundle-medium (50 modules)",
    async () => {
      const bundle: RollupBuild = await rollup({ input: mediumEntry });
      await bundle.generate(outputOptions);
    },
    { iterations: 10, warmupIterations: 1 },
  );

  bench(
    "bundle-large (200 modules)",
    async () => {
      const bundle: RollupBuild = await rollup({ input: largeEntry });
      await bundle.generate(outputOptions);
    },
    { iterations: 5, warmupIterations: 1 },
  );
});
