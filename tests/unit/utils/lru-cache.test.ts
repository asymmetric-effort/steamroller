import { describe, it, expect } from "bun:test";
import { LruCache } from "../../../src/utils/lru-cache";

describe("LruCache", () => {
  describe("constructor", () => {
    it("creates a cache with valid maxSize", () => {
      const cache = new LruCache<string, number>(5);
      expect(cache.size).toBe(0);
    });

    it("throws on maxSize < 1", () => {
      expect(() => new LruCache<string, number>(0)).toThrow(
        "LruCache: maxSize must be a positive integer",
      );
    });

    it("throws on negative maxSize", () => {
      expect(() => new LruCache<string, number>(-1)).toThrow(
        "LruCache: maxSize must be a positive integer",
      );
    });

    it("throws on non-integer maxSize", () => {
      expect(() => new LruCache<string, number>(2.5)).toThrow(
        "LruCache: maxSize must be a positive integer",
      );
    });
  });

  describe("set() and get()", () => {
    it("stores and retrieves a value", () => {
      const cache = new LruCache<string, number>(3);
      cache.set("a", 1);
      expect(cache.get("a")).toBe(1);
    });

    it("returns undefined for non-existent key", () => {
      const cache = new LruCache<string, number>(3);
      expect(cache.get("missing")).toBeUndefined();
    });

    it("updates existing key without changing size", () => {
      const cache = new LruCache<string, number>(3);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("a", 10);
      expect(cache.size).toBe(2);
      expect(cache.get("a")).toBe(10);
    });

    it("handles multiple types as keys", () => {
      const cache = new LruCache<number, string>(3);
      cache.set(1, "one");
      cache.set(2, "two");
      expect(cache.get(1)).toBe("one");
      expect(cache.get(2)).toBe("two");
    });
  });

  describe("eviction", () => {
    it("evicts oldest entry when max size exceeded", () => {
      const cache = new LruCache<string, number>(3);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      cache.set("d", 4);
      expect(cache.size).toBe(3);
      expect(cache.has("a")).toBe(false);
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
    });

    it("evicts correct entry after get() promotes a key", () => {
      const cache = new LruCache<string, number>(3);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      // promote 'a' to most recent
      cache.get("a");
      // insert 'd' — should evict 'b' (now oldest)
      cache.set("d", 4);
      expect(cache.has("b")).toBe(false);
      expect(cache.has("a")).toBe(true);
      expect(cache.has("c")).toBe(true);
      expect(cache.has("d")).toBe(true);
    });

    it("evicts correct entry after set() updates existing key", () => {
      const cache = new LruCache<string, number>(3);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      // update 'a' — moves it to most recent
      cache.set("a", 10);
      // insert 'd' — should evict 'b' (now oldest)
      cache.set("d", 4);
      expect(cache.has("b")).toBe(false);
      expect(cache.has("a")).toBe(true);
      expect(cache.get("a")).toBe(10);
    });
  });

  describe("has()", () => {
    it("returns true for existing key", () => {
      const cache = new LruCache<string, number>(3);
      cache.set("a", 1);
      expect(cache.has("a")).toBe(true);
    });

    it("returns false for non-existing key", () => {
      const cache = new LruCache<string, number>(3);
      expect(cache.has("missing")).toBe(false);
    });
  });

  describe("delete()", () => {
    it("returns true and removes existing key", () => {
      const cache = new LruCache<string, number>(3);
      cache.set("a", 1);
      expect(cache.delete("a")).toBe(true);
      expect(cache.has("a")).toBe(false);
      expect(cache.size).toBe(0);
    });

    it("returns false for non-existing key", () => {
      const cache = new LruCache<string, number>(3);
      expect(cache.delete("missing")).toBe(false);
    });
  });

  describe("clear()", () => {
    it("removes all entries", () => {
      const cache = new LruCache<string, number>(3);
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.has("a")).toBe(false);
      expect(cache.has("b")).toBe(false);
      expect(cache.has("c")).toBe(false);
    });
  });

  describe("size", () => {
    it("reflects current entry count", () => {
      const cache = new LruCache<string, number>(5);
      expect(cache.size).toBe(0);
      cache.set("a", 1);
      expect(cache.size).toBe(1);
      cache.set("b", 2);
      expect(cache.size).toBe(2);
      cache.delete("a");
      expect(cache.size).toBe(1);
    });
  });

  describe("edge: max size of 1", () => {
    it("holds only one entry at a time", () => {
      const cache = new LruCache<string, number>(1);
      cache.set("a", 1);
      expect(cache.size).toBe(1);
      expect(cache.get("a")).toBe(1);

      cache.set("b", 2);
      expect(cache.size).toBe(1);
      expect(cache.has("a")).toBe(false);
      expect(cache.get("b")).toBe(2);
    });

    it("updates in place without eviction", () => {
      const cache = new LruCache<string, number>(1);
      cache.set("a", 1);
      cache.set("a", 2);
      expect(cache.size).toBe(1);
      expect(cache.get("a")).toBe(2);
    });
  });
});
