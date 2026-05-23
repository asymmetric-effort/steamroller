/**
 * Async utilities for single-threaded concurrency control.
 *
 * Provides event-loop yielding for non-blocking AST parsing,
 * bounded-concurrency task execution, and abort-signal checking.
 *
 * @module async-utils
 */

import { createSemaphore } from './semaphore.js';

/**
 * Yield to the event loop so other microtasks and I/O callbacks
 * can execute. Used by parseAstAsync to avoid blocking.
 *
 * @returns A promise that resolves on the next macrotask.
 */
export const yieldToEventLoop = (): Promise<void> => {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

/**
 * Run an array of async task factories with a concurrency limit.
 *
 * Tasks are started eagerly up to `concurrency` and the semaphore
 * gates additional starts until earlier tasks complete.
 *
 * @param tasks - Factory functions that produce promises.
 * @param concurrency - Maximum parallel executions.
 * @returns Results in the same order as the input tasks.
 * @throws {Error} If concurrency is less than 1 or not an integer.
 */
export const runParallel = async <T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  concurrency: number,
): Promise<ReadonlyArray<T>> => {
  if (tasks.length === 0) {
    return [];
  }

  const semaphore = createSemaphore(concurrency);

  const results = await Promise.all(
    tasks.map(async (task) => {
      await semaphore.acquire();
      try {
        return await task();
      } finally {
        semaphore.release();
      }
    }),
  );

  return results;
};

/**
 * Check whether an {@link AbortSignal} has been aborted and throw if so.
 *
 * @param signal - Optional abort signal to check.
 * @throws {Error} If the signal is aborted.
 */
export const checkAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new Error('Operation aborted');
  }
};
