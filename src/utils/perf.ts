/**
 * Performance instrumentation utilities for build profiling.
 *
 * Provides start/end timers with memory tracking and serialized
 * timing output via the getTimings() API.
 *
 * @module utils/perf
 */

/**
 * Serialized timing data: each entry is a readonly 3-element tuple
 * of [elapsedMs, memoryDeltaBytes, totalHeapBytes].
 */
export type SerializedTimings = Readonly<
  Record<string, readonly [number, number, number]>
>;

/** Phase label for parsing. */
export const PERF_PARSE = "PARSE" as const;

/** Phase label for resolving module IDs. */
export const PERF_RESOLVE_ID = "RESOLVE_ID" as const;

/** Phase label for transforming source. */
export const PERF_TRANSFORM = "TRANSFORM" as const;

/** Phase label for building the bundle. */
export const PERF_BUILD = "BUILD" as const;

/** Phase label for code generation. */
export const PERF_GENERATE = "GENERATE" as const;

/** Phase label for tree-shaking. */
export const PERF_TREESHAKE = "TREESHAKE" as const;

/** Phase label for rendering chunks. */
export const PERF_RENDER_CHUNK = "RENDER_CHUNK" as const;

/** Phase label for writing output. */
export const PERF_WRITE = "WRITE" as const;

/**
 * Timer interface for recording phase durations and memory usage.
 * Exposes start/end for individual phases and getTimings for results.
 */
export interface PerfTimer {
  readonly start: (label: string) => void;
  readonly end: (label: string) => void;
  readonly getTimings: () => SerializedTimings;
  readonly reset: () => void;
}

/**
 * Internal mutable type for accumulating timing data inside the Map.
 * Properties must be mutable so that elapsed/memory values can be
 * accumulated across multiple start/end calls for the same label.
 */
interface TimingEntry {
  startTime: number;
  startMemory: number;
  elapsed: number;
  memory: number;
  totalMemory: number;
}

/**
 * Create a no-op timer that does nothing.
 * Used when performance instrumentation is disabled.
 */
export const createNoopTimer = (): PerfTimer => {
  return {
    start: (): void => {},
    end: (): void => {},
    getTimings: (): SerializedTimings => ({}),
    reset: (): void => {},
  };
};

/**
 * Create an active performance timer that records elapsed time
 * and heap memory deltas for each labeled phase.
 */
export const createPerfTimer = (): PerfTimer => {
  const timings = new Map<string, TimingEntry>();

  return {
    start: (label: string): void => {
      const startTime = performance.now();
      const memUsage = process.memoryUsage();
      const existing = timings.get(label);
      if (existing) {
        existing.startTime = startTime;
        existing.startMemory = memUsage.heapUsed;
      } else {
        timings.set(label, {
          startTime,
          startMemory: memUsage.heapUsed,
          elapsed: 0,
          memory: 0,
          totalMemory: memUsage.heapTotal,
        });
      }
    },
    end: (label: string): void => {
      const endTime = performance.now();
      const memUsage = process.memoryUsage();
      const entry = timings.get(label);
      if (!entry) {
        return;
      }
      entry.elapsed += endTime - entry.startTime;
      entry.memory += memUsage.heapUsed - entry.startMemory;
      entry.totalMemory = memUsage.heapTotal;
    },
    getTimings: (): SerializedTimings => {
      const result: Record<string, readonly [number, number, number]> = {};
      timings.forEach((value: TimingEntry, key: string) => {
        result[key] = [value.elapsed, value.memory, value.totalMemory] as const;
      });
      return result;
    },
    reset: (): void => {
      timings.clear();
    },
  };
};

/**
 * Factory function: create the appropriate timer based on the perf option.
 *
 * @param enabled - Whether performance instrumentation is active
 * @returns A PerfTimer (active or no-op)
 */
export const createTimer = (enabled: boolean): PerfTimer => {
  return enabled ? createPerfTimer() : createNoopTimer();
};
