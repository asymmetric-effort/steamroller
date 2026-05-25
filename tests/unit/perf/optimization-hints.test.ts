/**
 * Tests for module graph and codegen performance optimization utilities.
 *
 * Verifies object pool acquire/release behavior and string builder
 * concatenation functionality.
 *
 * @module tests/unit/perf/optimization-hints.test
 */

import { describe, it, expect } from "vitest";
import {
  createObjectPool,
  createStringBuilder,
} from "../../../src/perf/optimization-hints.js";

describe("optimization-hints", () => {
  describe("createObjectPool", () => {
    interface TestNode {
      type: string;
      value: number;
    }

    const factory = (): TestNode => ({ type: "", value: 0 });
    const reset = (obj: TestNode): void => {
      obj.type = "";
      obj.value = 0;
    };

    it("should create objects via factory when pool is empty", () => {
      const pool = createObjectPool(factory, reset, 10);
      const obj = pool.acquire();

      expect(obj).toEqual({ type: "", value: 0 });
    });

    it("should return released objects on acquire", () => {
      const pool = createObjectPool(factory, reset, 10);
      const obj1 = pool.acquire();
      obj1.type = "identifier";
      obj1.value = 42;

      pool.release(obj1);
      const obj2 = pool.acquire();

      expect(obj2).toBe(obj1);
      expect(obj2.type).toBe("");
      expect(obj2.value).toBe(0);
    });

    it("should reset objects on release", () => {
      const pool = createObjectPool(factory, reset, 10);
      const obj = pool.acquire();
      obj.type = "literal";
      obj.value = 99;

      pool.release(obj);

      expect(obj.type).toBe("");
      expect(obj.value).toBe(0);
    });

    it("should respect maxSize limit", () => {
      const pool = createObjectPool(factory, reset, 2);

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();
      const obj3 = pool.acquire();

      pool.release(obj1);
      pool.release(obj2);
      pool.release(obj3);

      expect(pool.size()).toBe(2);
    });

    it("should report pool size correctly", () => {
      const pool = createObjectPool(factory, reset, 10);

      expect(pool.size()).toBe(0);

      const obj1 = pool.acquire();
      const obj2 = pool.acquire();
      pool.release(obj1);

      expect(pool.size()).toBe(1);

      pool.release(obj2);

      expect(pool.size()).toBe(2);
    });

    it("should clear all pooled objects", () => {
      const pool = createObjectPool(factory, reset, 10);
      const obj1 = pool.acquire();
      const obj2 = pool.acquire();

      pool.release(obj1);
      pool.release(obj2);
      expect(pool.size()).toBe(2);

      pool.clear();
      expect(pool.size()).toBe(0);
    });

    it("should create new object after clear", () => {
      const pool = createObjectPool(factory, reset, 10);
      const obj1 = pool.acquire();
      pool.release(obj1);
      pool.clear();

      const obj2 = pool.acquire();
      expect(obj2).not.toBe(obj1);
    });

    it("should handle maxSize of zero", () => {
      const pool = createObjectPool(factory, reset, 0);
      const obj = pool.acquire();
      pool.release(obj);

      expect(pool.size()).toBe(0);
    });

    it("should handle rapid acquire/release cycles", () => {
      const pool = createObjectPool(factory, reset, 5);

      for (let i = 0; i < 100; i++) {
        const obj = pool.acquire();
        obj.value = i;
        pool.release(obj);
      }

      expect(pool.size()).toBe(1);
    });
  });

  describe("createStringBuilder", () => {
    it("should produce empty string initially", () => {
      const sb = createStringBuilder();
      expect(sb.toString()).toBe("");
    });

    it("should append strings", () => {
      const sb = createStringBuilder();
      sb.append("hello");
      sb.append(" ");
      sb.append("world");

      expect(sb.toString()).toBe("hello world");
    });

    it("should track total length", () => {
      const sb = createStringBuilder();
      sb.append("abc");
      sb.append("de");

      expect(sb.length()).toBe(5);
    });

    it("should report zero length when empty", () => {
      const sb = createStringBuilder();
      expect(sb.length()).toBe(0);
    });

    it("should clear all content", () => {
      const sb = createStringBuilder();
      sb.append("content");
      sb.clear();

      expect(sb.toString()).toBe("");
      expect(sb.length()).toBe(0);
    });

    it("should handle empty string appends", () => {
      const sb = createStringBuilder();
      sb.append("");
      sb.append("a");
      sb.append("");

      expect(sb.toString()).toBe("a");
      expect(sb.length()).toBe(1);
    });

    it("should handle multiline content", () => {
      const sb = createStringBuilder();
      sb.append("line1\n");
      sb.append("line2\n");
      sb.append("line3");

      expect(sb.toString()).toBe("line1\nline2\nline3");
    });

    it("should handle many appends efficiently", () => {
      const sb = createStringBuilder();

      for (let i = 0; i < 1000; i++) {
        sb.append("x");
      }

      expect(sb.length()).toBe(1000);
      expect(sb.toString().length).toBe(1000);
    });

    it("should be reusable after clear", () => {
      const sb = createStringBuilder();
      sb.append("first");
      sb.clear();
      sb.append("second");

      expect(sb.toString()).toBe("second");
      expect(sb.length()).toBe(6);
    });

    it("should handle special characters", () => {
      const sb = createStringBuilder();
      sb.append("tab\there");
      sb.append("\n");
      sb.append("unicode: \u2603");

      expect(sb.toString()).toBe("tab\there\nunicode: \u2603");
    });
  });
});
