/**
 * Zero-dependency LRU cache using Map for O(1) access
 * with insertion-order eviction.
 *
 * @module lru-cache
 */

/**
 * Least-recently-used cache with configurable max size.
 * Uses Map's insertion-order iteration to track recency.
 */
export class LruCache<K, V> {
  /** Internal storage; insertion order = access recency. */
  private readonly cache: Map<K, V>;

  /** Maximum number of entries before eviction. */
  private readonly maxSize: number;

  constructor(maxSize: number) {
    if (maxSize < 1 || !Number.isInteger(maxSize)) {
      throw new Error("LruCache: maxSize must be a positive integer");
    }
    this.maxSize = maxSize;
    this.cache = new Map<K, V>();
  }

  /** Number of entries currently stored. */
  get size(): number {
    return this.cache.size;
  }

  /** Retrieve a value and promote the key to most-recent. */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    const value = this.cache.get(key) as V;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /** Insert or update a key-value pair; evicts oldest on overflow. */
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value as K;
      this.cache.delete(oldest);
    }
    this.cache.set(key, value);
  }

  /** Check whether a key exists without promoting it. */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /** Remove a key. Returns true if the key existed. */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this.cache.clear();
  }
}
