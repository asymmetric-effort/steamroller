/**
 * Compatibility shim that maps vitest's `vi` API to bun:test's mock API
 * and NogginLessDom's timer API. Used by test files that need module
 * mocking, spy functionality, or fake timers.
 */
import { mock, spyOn } from "bun:test";
import {
  useFakeTimers as nldUseFakeTimers,
  useRealTimers as nldUseRealTimers,
} from "@asymmetric-effort/nogginlessdom";

type AnyFunction = (...args: Array<any>) => any;

let clock: ReturnType<typeof nldUseFakeTimers> | null = null;

export const vi = {
  fn: (impl?: AnyFunction) => mock(impl ?? (() => undefined)),
  spyOn,
  mock: mock.module,
  mocked: <T>(fn: T): T => fn,
  restoreAllMocks: () => mock.restore(),
  resetAllMocks: () => mock.clearAllMocks(),
  clearAllMocks: () => mock.clearAllMocks(),
  resetModules: () => {
    /* bun handles module cache per-test; this is a no-op */
  },
  importActual: async <T>(moduleName: string): Promise<T> => {
    // Use require for Node built-in modules to bypass mock.module interception
    if (moduleName.startsWith("node:") || !moduleName.includes("/")) {
      return require(moduleName) as T;
    }
    return import(moduleName) as Promise<T>;
  },
  useFakeTimers: () => {
    clock = nldUseFakeTimers();
    return clock;
  },
  useRealTimers: () => {
    clock = null;
    nldUseRealTimers();
  },
  advanceTimersByTime: (ms: number) => {
    if (!clock) throw new Error("Call vi.useFakeTimers() first");
    clock.advanceTimersByTime(ms);
  },
  advanceTimersByTimeAsync: async (ms: number) => {
    if (!clock) throw new Error("Call vi.useFakeTimers() first");
    await clock.advanceTimersByTimeAsync(ms);
  },
  runAllTimers: () => {
    if (!clock) throw new Error("Call vi.useFakeTimers() first");
    clock.runAllTimers();
  },
  setSystemTime: (time: number | Date) => {
    if (!clock) throw new Error("Call vi.useFakeTimers() first");
    clock.setSystemTime(time);
  },
};
