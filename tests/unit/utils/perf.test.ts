/**
 * Tests for src/utils/perf.ts
 *
 * Covers createNoopTimer, createPerfTimer, createTimer factory,
 * and all exported phase constants.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createNoopTimer,
  createPerfTimer,
  createTimer,
  PERF_PARSE,
  PERF_RESOLVE_ID,
  PERF_TRANSFORM,
  PERF_BUILD,
  PERF_GENERATE,
  PERF_TREESHAKE,
  PERF_RENDER_CHUNK,
  PERF_WRITE,
} from "../../../src/utils/perf";
import type { PerfTimer, SerializedTimings } from "../../../src/utils/perf";

describe("perf", () => {
  describe("phase constants", () => {
    it("should export correct phase label strings", () => {
      expect(PERF_PARSE).toBe("PARSE");
      expect(PERF_RESOLVE_ID).toBe("RESOLVE_ID");
      expect(PERF_TRANSFORM).toBe("TRANSFORM");
      expect(PERF_BUILD).toBe("BUILD");
      expect(PERF_GENERATE).toBe("GENERATE");
      expect(PERF_TREESHAKE).toBe("TREESHAKE");
      expect(PERF_RENDER_CHUNK).toBe("RENDER_CHUNK");
      expect(PERF_WRITE).toBe("WRITE");
    });
  });

  describe("createNoopTimer", () => {
    it("should return a PerfTimer object with all required methods", () => {
      const timer = createNoopTimer();
      expect(typeof timer.start).toBe("function");
      expect(typeof timer.end).toBe("function");
      expect(typeof timer.getTimings).toBe("function");
      expect(typeof timer.reset).toBe("function");
    });

    it("should not throw when start is called", () => {
      const timer = createNoopTimer();
      expect(() => timer.start("test")).not.toThrow();
    });

    it("should not throw when end is called", () => {
      const timer = createNoopTimer();
      expect(() => timer.end("test")).not.toThrow();
    });

    it("should return an empty object from getTimings", () => {
      const timer = createNoopTimer();
      timer.start("test");
      timer.end("test");
      const timings: SerializedTimings = timer.getTimings();
      expect(timings).toEqual({});
    });

    it("should not throw when reset is called", () => {
      const timer = createNoopTimer();
      expect(() => timer.reset()).not.toThrow();
    });

    it("should return empty object from getTimings after reset", () => {
      const timer = createNoopTimer();
      timer.reset();
      expect(timer.getTimings()).toEqual({});
    });
  });

  describe("createPerfTimer", () => {
    it("should return a PerfTimer with all required methods", () => {
      const timer = createPerfTimer();
      expect(typeof timer.start).toBe("function");
      expect(typeof timer.end).toBe("function");
      expect(typeof timer.getTimings).toBe("function");
      expect(typeof timer.reset).toBe("function");
    });

    it("should produce a timing entry after start + end", () => {
      const timer = createPerfTimer();
      timer.start("phase1");
      timer.end("phase1");
      const timings = timer.getTimings();
      expect(timings).toHaveProperty("phase1");
      const entry = timings["phase1"];
      expect(entry).toBeDefined();
      expect(Array.isArray(entry)).toBe(true);
      expect(entry).toHaveLength(3);
    });

    it("should return a 3-element tuple with numeric values", () => {
      const timer = createPerfTimer();
      timer.start("myPhase");
      timer.end("myPhase");
      const timings = timer.getTimings();
      const [elapsed, memory, totalMemory] = timings["myPhase"]!;
      expect(typeof elapsed).toBe("number");
      expect(typeof memory).toBe("number");
      expect(typeof totalMemory).toBe("number");
    });

    it("should record non-negative elapsed time", () => {
      const timer = createPerfTimer();
      timer.start("elapsed-test");
      timer.end("elapsed-test");
      const timings = timer.getTimings();
      const [elapsed] = timings["elapsed-test"]!;
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });

    it("should record positive totalMemory", () => {
      const timer = createPerfTimer();
      timer.start("mem-test");
      timer.end("mem-test");
      const timings = timer.getTimings();
      const [, , totalMemory] = timings["mem-test"]!;
      expect(totalMemory).toBeGreaterThan(0);
    });

    it("should accumulate time across multiple start/end calls", () => {
      const timer = createPerfTimer();
      timer.start("accum");
      timer.end("accum");
      const first = timer.getTimings()["accum"]![0];

      timer.start("accum");
      timer.end("accum");
      const second = timer.getTimings()["accum"]![0];

      expect(second).toBeGreaterThanOrEqual(first);
    });

    it("should handle end without prior start as a no-op", () => {
      const timer = createPerfTimer();
      expect(() => timer.end("nonexistent")).not.toThrow();
      const timings = timer.getTimings();
      expect(timings).not.toHaveProperty("nonexistent");
    });

    it("should track multiple labels independently", () => {
      const timer = createPerfTimer();
      timer.start("a");
      timer.end("a");
      timer.start("b");
      timer.end("b");
      const timings = timer.getTimings();
      expect(timings).toHaveProperty("a");
      expect(timings).toHaveProperty("b");
      expect(timings["a"]).toHaveLength(3);
      expect(timings["b"]).toHaveLength(3);
    });

    it("should clear all timings on reset", () => {
      const timer = createPerfTimer();
      timer.start("clear-me");
      timer.end("clear-me");
      expect(Object.keys(timer.getTimings())).toHaveLength(1);
      timer.reset();
      expect(timer.getTimings()).toEqual({});
    });

    it("should allow recording new timings after reset", () => {
      const timer = createPerfTimer();
      timer.start("before");
      timer.end("before");
      timer.reset();
      timer.start("after");
      timer.end("after");
      const timings = timer.getTimings();
      expect(timings).not.toHaveProperty("before");
      expect(timings).toHaveProperty("after");
    });

    it("should return empty object from getTimings when nothing recorded", () => {
      const timer = createPerfTimer();
      expect(timer.getTimings()).toEqual({});
    });

    it("should handle start called multiple times before end", () => {
      const timer = createPerfTimer();
      timer.start("restart");
      timer.start("restart");
      timer.end("restart");
      const timings = timer.getTimings();
      expect(timings).toHaveProperty("restart");
      expect(timings["restart"]![0]).toBeGreaterThanOrEqual(0);
    });
  });

  describe("createTimer", () => {
    it("should return an active timer when enabled is true", () => {
      const timer = createTimer(true);
      timer.start("test");
      timer.end("test");
      const timings = timer.getTimings();
      expect(timings).toHaveProperty("test");
      expect(timings["test"]).toHaveLength(3);
    });

    it("should return a noop timer when enabled is false", () => {
      const timer = createTimer(false);
      timer.start("test");
      timer.end("test");
      const timings = timer.getTimings();
      expect(timings).toEqual({});
    });
  });
});
