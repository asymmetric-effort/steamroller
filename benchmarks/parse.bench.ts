/**
 * @module benchmarks/parse.bench
 * @description Parser benchmarks measuring parse performance across various
 * source sizes and complexity levels.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "../src/parser/parser.js";
import { runBenchmarkSuite, formatResult } from "./run.js";
import type { BenchmarkConfig, BenchmarkSuite } from "./run.js";

const FIXTURES_DIR = join(import.meta.dirname ?? ".", "fixtures");

/**
 * Generates a synthetic JavaScript source of approximately the given size.
 */
export const generateSource = (approxBytes: number): string => {
  const line = "const x_NNNN = { a: 1, b: 'hello', c: [1, 2, 3] };\n";
  const linesNeeded = Math.ceil(approxBytes / line.length);
  const parts: Array<string> = [];

  for (let i = 0; i < linesNeeded; i++) {
    parts.push(line.replace("NNNN", String(i)));
  }

  return parts.join("");
};

/**
 * Creates benchmark configurations for parsing various source sizes.
 */
export const createParseBenchmarks = (
  iterations: number,
): ReadonlyArray<BenchmarkConfig> => {
  const small = generateSource(500);
  const medium = generateSource(5000);
  const large = generateSource(50000);

  return [
    {
      name: "parse-500b",
      iterations,
      fn: () => {
        parse(small);
      },
    },
    {
      name: "parse-5kb",
      iterations,
      fn: () => {
        parse(medium);
      },
    },
    {
      name: "parse-50kb",
      iterations,
      fn: () => {
        parse(large);
      },
    },
  ];
};

/**
 * Creates benchmark configs from fixture files if they exist.
 */
export const createFixtureBenchmarks = (
  iterations: number,
): ReadonlyArray<BenchmarkConfig> => {
  const configs: Array<BenchmarkConfig> = [];
  const fixtureFiles = [
    "small-module.js",
    "medium-module.js",
    "large-module.js",
  ];

  for (let i = 0; i < fixtureFiles.length; i++) {
    const fileName = fixtureFiles[i];
    const filePath = join(FIXTURES_DIR, fileName);

    try {
      const source = readFileSync(filePath, "utf-8");
      configs.push({
        name: `parse-fixture-${fileName}`,
        iterations,
        fn: () => {
          parse(source);
        },
      });
    } catch {
      // Fixture not available, skip
    }
  }

  return configs;
};

/**
 * Runs the full parse benchmark suite.
 */
export const runParseBenchmarks = (iterations = 100): BenchmarkSuite => {
  const configs = [
    ...createParseBenchmarks(iterations),
    ...createFixtureBenchmarks(iterations),
  ];

  return runBenchmarkSuite("parser", configs);
};

/** Entry point for standalone execution. */
export const main = (): void => {
  const suite = runParseBenchmarks(50);
  for (let i = 0; i < suite.results.length; i++) {
    const formatted = formatResult(suite.results[i]);
    process.stdout.write(formatted + "\n");
  }
  process.stdout.write(`\nTotal: ${suite.totalDuration.toFixed(1)}ms\n`);
};
