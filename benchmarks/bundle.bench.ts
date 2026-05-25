/**
 * @module benchmarks/bundle.bench
 * @description End-to-end bundle benchmarks (placeholder).
 * Will measure full bundling performance once E2E pipeline is functional.
 */

import { runBenchmarkSuite, formatResult } from "./run.js";
import type { BenchmarkConfig, BenchmarkSuite } from "./run.js";

/** Placeholder bundle operation for benchmarking infrastructure testing. */
const placeholderBundle = (source: string): string => {
  // Simulates minimal bundling work for infrastructure verification
  return `// bundled\n${source}`;
};

/**
 * Creates benchmark configurations for bundle operations.
 * Currently uses placeholder implementation.
 */
export const createBundleBenchmarks = (
  iterations: number,
): ReadonlyArray<BenchmarkConfig> => {
  const smallSource = "export const x = 1;\nexport const y = 2;\n";
  const mediumSource = Array.from(
    { length: 50 },
    (_, i) => `export const var${i} = ${i};\n`,
  ).join("");

  return [
    {
      name: "bundle-small",
      iterations,
      fn: () => {
        placeholderBundle(smallSource);
      },
    },
    {
      name: "bundle-medium",
      iterations,
      fn: () => {
        placeholderBundle(mediumSource);
      },
    },
  ];
};

/**
 * Runs the full bundle benchmark suite.
 */
export const runBundleBenchmarks = (iterations = 100): BenchmarkSuite => {
  const configs = createBundleBenchmarks(iterations);
  return runBenchmarkSuite("bundle", configs);
};

/** Entry point for standalone execution. */
export const main = (): void => {
  const suite = runBundleBenchmarks(50);
  for (let i = 0; i < suite.results.length; i++) {
    const formatted = formatResult(suite.results[i]);
    process.stdout.write(formatted + "\n");
  }
  process.stdout.write(`\nTotal: ${suite.totalDuration.toFixed(1)}ms\n`);
};
