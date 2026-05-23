/**
 * Async semaphore for limiting concurrent operations.
 *
 * Used to enforce maxParallelFileOps concurrency limits
 * in a single-threaded async environment.
 *
 * @module semaphore
 */

/** Public interface for an async semaphore. */
export interface Semaphore {
  /** Acquire a slot; resolves immediately if available, otherwise waits. */
  readonly acquire: () => Promise<void>;
  /** Release a slot, waking the next waiter if any. */
  readonly release: () => void;
  /** Number of callers currently waiting for a slot. */
  readonly pending: number;
  /** Number of slots currently available. */
  readonly available: number;
}

/**
 * Create an async semaphore that limits concurrency to `maxConcurrency`.
 *
 * @param maxConcurrency - Maximum number of concurrent holders.
 * @returns A {@link Semaphore} instance.
 * @throws {Error} If maxConcurrency is less than 1 or not an integer.
 */
export const createSemaphore = (maxConcurrency: number): Semaphore => {
  if (maxConcurrency < 1 || !Number.isInteger(maxConcurrency)) {
    throw new Error(
      `maxConcurrency must be a positive integer, got ${String(maxConcurrency)}`,
    );
  }

  const queue: Array<() => void> = [];
  const state = { current: 0 };

  const acquire = (): Promise<void> => {
    if (state.current < maxConcurrency) {
      state.current++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      queue.push(resolve);
    });
  };

  const release = (): void => {
    const next = queue.shift();
    if (next) {
      next();
    } else {
      state.current = Math.max(0, state.current - 1);
    }
  };

  return {
    acquire,
    release,
    get pending() {
      return queue.length;
    },
    get available() {
      return maxConcurrency - state.current;
    },
  };
};
