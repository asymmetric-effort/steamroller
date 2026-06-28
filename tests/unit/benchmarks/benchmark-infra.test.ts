import { describe, it, expect } from "bun:test";
import {
  runBenchmark,
  runBenchmarkSuite,
  formatResult,
} from "../../../benchmarks/run.js";
import type { BenchmarkConfig } from "../../../benchmarks/run.js";

describe("benchmark infrastructure", () => {
  describe("runBenchmark", () => {
    it("produces timing results for a simple function", () => {
      const config: BenchmarkConfig = {
        name: "simple-add",
        iterations: 10,
        fn: () => {
          const _x = 1 + 1;
        },
      };

      const result = runBenchmark(config);
      expect(result.name).toBe("simple-add");
      expect(result.iterations).toBe(10);
      expect(result.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.avgMs).toBeGreaterThanOrEqual(0);
      expect(result.minMs).toBeGreaterThanOrEqual(0);
      expect(result.maxMs).toBeGreaterThanOrEqual(result.minMs);
      expect(result.opsPerSecond).toBeGreaterThan(0);
    });

    it("respects iteration count", () => {
      let count = 0;
      const config: BenchmarkConfig = {
        name: "counter",
        iterations: 5,
        warmupIterations: 0,
        fn: () => {
          count++;
        },
      };

      runBenchmark(config);
      expect(count).toBe(5);
    });

    it("executes warmup iterations", () => {
      let count = 0;
      const config: BenchmarkConfig = {
        name: "warmup-test",
        iterations: 3,
        warmupIterations: 2,
        fn: () => {
          count++;
        },
      };

      runBenchmark(config);
      expect(count).toBe(5); // 2 warmup + 3 measured
    });

    it("uses default warmup of 3 when not specified", () => {
      let count = 0;
      const config: BenchmarkConfig = {
        name: "default-warmup",
        iterations: 2,
        fn: () => {
          count++;
        },
      };

      runBenchmark(config);
      expect(count).toBe(5); // 3 default warmup + 2 measured
    });

    it("handles zero-time operations", () => {
      const config: BenchmarkConfig = {
        name: "noop",
        iterations: 10,
        warmupIterations: 0,
        fn: () => {
          /* noop */
        },
      };

      const result = runBenchmark(config);
      expect(result.avgMs).toBeGreaterThanOrEqual(0);
      expect(result.totalMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("runBenchmarkSuite", () => {
    it("runs multiple benchmarks and returns aggregated results", () => {
      const configs: ReadonlyArray<BenchmarkConfig> = [
        { name: "bench-1", iterations: 5, warmupIterations: 0, fn: () => {} },
        { name: "bench-2", iterations: 5, warmupIterations: 0, fn: () => {} },
        { name: "bench-3", iterations: 5, warmupIterations: 0, fn: () => {} },
      ];

      const suite = runBenchmarkSuite("test-suite", configs);
      expect(suite.name).toBe("test-suite");
      expect(suite.results).toHaveLength(3);
      expect(suite.totalDuration).toBeGreaterThanOrEqual(0);
      expect(suite.results[0].name).toBe("bench-1");
      expect(suite.results[1].name).toBe("bench-2");
      expect(suite.results[2].name).toBe("bench-3");
    });

    it("handles empty config array", () => {
      const suite = runBenchmarkSuite("empty", []);
      expect(suite.name).toBe("empty");
      expect(suite.results).toHaveLength(0);
      expect(suite.totalDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("formatResult", () => {
    it("produces a formatted string with benchmark details", () => {
      const result = {
        name: "test-bench",
        iterations: 100,
        totalMs: 500,
        avgMs: 5.0,
        minMs: 3.0,
        maxMs: 8.0,
        opsPerSecond: 200,
      };

      const formatted = formatResult(result);
      expect(formatted).toContain("test-bench");
      expect(formatted).toContain("5.000ms avg");
      expect(formatted).toContain("3.000ms min");
      expect(formatted).toContain("8.000ms max");
      expect(formatted).toContain("200.0 ops/s");
      expect(formatted).toContain("100 iterations");
    });

    it("handles very small timing values", () => {
      const result = {
        name: "fast",
        iterations: 1000,
        totalMs: 0.5,
        avgMs: 0.0005,
        minMs: 0.0001,
        maxMs: 0.001,
        opsPerSecond: 2000000,
      };

      const formatted = formatResult(result);
      expect(formatted).toContain("fast");
      expect(typeof formatted).toBe("string");
    });
  });
});
