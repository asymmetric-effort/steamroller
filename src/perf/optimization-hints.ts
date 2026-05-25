/**
 * Module graph and codegen performance optimization utilities.
 *
 * Provides object pooling for frequently created/destroyed objects,
 * and array-based string concatenation for hot code generation loops.
 *
 * @module perf/optimization-hints
 */

/** An object pool that recycles instances to reduce GC pressure. */
export interface ObjectPool<T> {
  readonly acquire: () => T;
  readonly release: (obj: T) => void;
  readonly size: () => number;
  readonly clear: () => void;
}

/**
 * Create an object pool for frequently allocated/freed objects.
 *
 * Objects are created via factory, reset before reuse via the reset function,
 * and the pool is bounded to maxSize to prevent unbounded memory growth.
 *
 * @param factory - Function to create a new instance.
 * @param reset - Function to reset an instance for reuse.
 * @param maxSize - Maximum number of objects to keep pooled.
 * @returns An ObjectPool interface for acquiring and releasing objects.
 */
export const createObjectPool = <T>(
  factory: () => T,
  reset: (obj: T) => void,
  maxSize: number,
): ObjectPool<T> => {
  const pool: T[] = [];

  const acquire = (): T => {
    if (pool.length > 0) {
      return pool.pop() as T;
    }
    return factory();
  };

  const release = (obj: T): void => {
    if (pool.length < maxSize) {
      reset(obj);
      pool.push(obj);
    }
  };

  const size = (): number => pool.length;

  const clear = (): void => {
    pool.length = 0;
  };

  return { acquire, release, size, clear };
};

/** A string builder that uses array-based concatenation. */
export interface StringBuilder {
  readonly append: (str: string) => void;
  readonly toString: () => string;
  readonly length: () => number;
  readonly clear: () => void;
}

/**
 * Create a string builder for efficient string concatenation in hot loops.
 *
 * Uses an internal array and joins at the end, which is faster than
 * repeated += concatenation for large numbers of appends.
 *
 * @returns A StringBuilder interface.
 */
export const createStringBuilder = (): StringBuilder => {
  const parts: string[] = [];
  let totalLength = 0;

  const append = (str: string): void => {
    parts.push(str);
    totalLength += str.length;
  };

  const toString = (): string => parts.join("");

  const length = (): number => totalLength;

  const clear = (): void => {
    parts.length = 0;
    totalLength = 0;
  };

  return { append, toString, length, clear };
};
