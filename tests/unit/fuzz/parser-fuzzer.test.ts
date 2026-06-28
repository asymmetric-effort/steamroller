import { describe, it, expect } from "bun:test";
import {
  generateRandomSource,
  fuzzParser,
  createRng,
} from "../../fuzz/parser-fuzzer.js";

describe("parser fuzzer", () => {
  describe("createRng", () => {
    it("produces deterministic results for the same seed", () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);

      const values1 = [rng1.next(), rng1.next(), rng1.next()];
      const values2 = [rng2.next(), rng2.next(), rng2.next()];

      expect(values1).toEqual(values2);
    });

    it("produces different results for different seeds", () => {
      const rng1 = createRng(1);
      const rng2 = createRng(2);

      const val1 = rng1.next();
      const val2 = rng2.next();
      expect(val1).not.toBe(val2);
    });

    it("produces values between 0 and 1", () => {
      const rng = createRng(12345);
      for (let i = 0; i < 100; i++) {
        const val = rng.next();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });
  });

  describe("generateRandomSource", () => {
    it("produces a non-empty string", () => {
      const source = generateRandomSource(1, 50);
      expect(source.length).toBeGreaterThan(0);
    });

    it("produces deterministic output for the same seed", () => {
      const source1 = generateRandomSource(42, 100);
      const source2 = generateRandomSource(42, 100);
      expect(source1).toBe(source2);
    });

    it("produces different output for different seeds", () => {
      const source1 = generateRandomSource(1, 100);
      const source2 = generateRandomSource(2, 100);
      expect(source1).not.toBe(source2);
    });

    it("produces output of approximately the requested length", () => {
      const source = generateRandomSource(1, 200);
      // Should be at least the requested length (may be slightly over)
      expect(source.length).toBeGreaterThanOrEqual(200);
    });

    it("handles small length values", () => {
      const source = generateRandomSource(1, 10);
      expect(source.length).toBeGreaterThanOrEqual(10);
    });

    it("contains JavaScript-like tokens", () => {
      const source = generateRandomSource(1, 500);
      // Should contain at least some recognizable JavaScript constructs
      const hasJsContent =
        source.includes("const") ||
        source.includes("function") ||
        source.includes("class") ||
        source.includes("//") ||
        source.includes("if");
      expect(hasJsContent).toBe(true);
    });
  });

  describe("fuzzParser", () => {
    it("runs without crashes on small iterations", () => {
      const result = fuzzParser(20, 100);
      expect(result.crashed).toBe(0);
      expect(result.totalIterations).toBe(20);
      expect(result.passed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it("reports correct total iterations", () => {
      const result = fuzzParser(10, 50);
      expect(result.totalIterations).toBe(10);
      expect(result.passed + result.crashed).toBe(10);
    });

    it("counts syntax errors as passes", () => {
      const result = fuzzParser(30, 200);
      // Random source often produces syntax errors which is expected
      expect(result.passed).toBeGreaterThan(0);
      expect(result.crashed).toBe(0);
    });

    it("handles very small max length", () => {
      const result = fuzzParser(5, 10);
      expect(result.crashed).toBe(0);
      expect(result.totalIterations).toBe(5);
    });

    it("handles larger iterations without crashing", () => {
      const result = fuzzParser(50, 300);
      expect(result.crashed).toBe(0);
      expect(result.passed).toBe(50);
    });

    it("syntaxErrors count is non-negative", () => {
      const result = fuzzParser(20, 150);
      expect(result.syntaxErrors).toBeGreaterThanOrEqual(0);
      // passed includes syntaxErrors
      expect(result.passed).toBeGreaterThanOrEqual(result.syntaxErrors);
    });
  });
});
