/**
 * @module benchmarks/run
 * @description Benchmark runner using performance.now() for accurate timing.
 * Provides infrastructure for running and reporting parse/bundle benchmarks.
 */

/** A single benchmark result. */
export interface BenchmarkResult {
  readonly name: string;
  readonly iterations: number;
  readonly totalMs: number;
  readonly avgMs: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly opsPerSecond: number;
}

/** Configuration for a benchmark run. */
export interface BenchmarkConfig {
  readonly name: string;
  readonly iterations: number;
  readonly warmupIterations?: number;
  readonly fn: () => void;
}

/** Summary of all benchmark runs. */
export interface BenchmarkSuite {
  readonly name: string;
  readonly results: ReadonlyArray<BenchmarkResult>;
  readonly totalDuration: number;
}

/**
 * Runs a single benchmark function for the given number of iterations.
 */
export const runBenchmark = (config: BenchmarkConfig): BenchmarkResult => {
  const warmup = config.warmupIterations ?? 3;

  // Warmup phase
  for (let i = 0; i < warmup; i++) {
    config.fn();
  }

  const timings: Array<number> = [];

  for (let i = 0; i < config.iterations; i++) {
    const start = performance.now();
    config.fn();
    const end = performance.now();
    timings.push(end - start);
  }

  let totalMs = 0;
  let minMs = Infinity;
  let maxMs = -Infinity;

  for (let i = 0; i < timings.length; i++) {
    const t = timings[i];
    totalMs += t;
    if (t < minMs) {
      minMs = t;
    }
    if (t > maxMs) {
      maxMs = t;
    }
  }

  const avgMs = totalMs / config.iterations;
  const opsPerSecond = avgMs > 0 ? 1000 / avgMs : Infinity;

  return {
    name: config.name,
    iterations: config.iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    opsPerSecond,
  };
};

/**
 * Runs a suite of benchmarks and returns aggregated results.
 */
export const runBenchmarkSuite = (
  name: string,
  configs: ReadonlyArray<BenchmarkConfig>,
): BenchmarkSuite => {
  const start = performance.now();
  const results: Array<BenchmarkResult> = [];

  for (let i = 0; i < configs.length; i++) {
    results.push(runBenchmark(configs[i]));
  }

  return {
    name,
    results,
    totalDuration: performance.now() - start,
  };
};

/**
 * Formats a benchmark result as a human-readable string.
 */
export const formatResult = (result: BenchmarkResult): string => {
  return (
    `${result.name}: ${result.avgMs.toFixed(3)}ms avg ` +
    `(${result.minMs.toFixed(3)}ms min, ${result.maxMs.toFixed(3)}ms max) ` +
    `${result.opsPerSecond.toFixed(1)} ops/s ` +
    `(${result.iterations} iterations)`
  );
};
