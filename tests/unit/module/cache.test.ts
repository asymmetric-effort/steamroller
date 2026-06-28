/**
 * @module tests/unit/module/cache
 * @description Unit tests for RollupCache and PluginCache.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { RollupCache, PluginCache } from "../../../src/module/cache.js";
import type {
  CachedModuleData,
  RollupCacheData,
} from "../../../src/module/cache.js";

const createModuleData = (
  overrides?: Partial<CachedModuleData>,
): CachedModuleData => ({
  code: "const x = 1;",
  ast: { type: "Program", body: [], sourceType: "module" },
  dependencies: ["./dep-a.ts"],
  transformDependencies: [],
  meta: {},
  syntheticNamedExports: false,
  moduleSideEffects: true,
  ...overrides,
});

describe("RollupCache", () => {
  let cache: RollupCache;

  beforeEach(() => {
    cache = new RollupCache();
  });

  describe("constructor", () => {
    it("should create an empty cache", () => {
      expect(cache.size).toBe(0);
      expect(cache.getBuildCount()).toBe(0);
    });

    it("should initialize from RollupCacheData", () => {
      const data: RollupCacheData = {
        modules: [
          { id: "./a.ts", ...createModuleData() },
          { id: "./b.ts", ...createModuleData({ code: "const y = 2;" }) },
        ],
      };
      const loaded = new RollupCache(data);
      expect(loaded.size).toBe(2);
      expect(loaded.hasModule("./a.ts")).toBe(true);
      expect(loaded.hasModule("./b.ts")).toBe(true);
    });

    it("should handle empty modules array", () => {
      const loaded = new RollupCache({ modules: [] });
      expect(loaded.size).toBe(0);
    });
  });

  describe("getModule", () => {
    it("should return undefined for missing module", () => {
      expect(cache.getModule("./missing.ts")).toBeUndefined();
    });

    it("should return cached module data", () => {
      const data = createModuleData();
      cache.setModule("./a.ts", data);
      const result = cache.getModule("./a.ts");
      expect(result).toEqual(data);
    });

    it("should update lastAccessed on get", () => {
      cache.setModule("./a.ts", createModuleData());
      cache.incrementBuild();
      cache.incrementBuild();
      // Access updates the timestamp, so it should survive purge
      cache.getModule("./a.ts");
      cache.purgeExpired(3);
      expect(cache.hasModule("./a.ts")).toBe(true);
    });
  });

  describe("setModule", () => {
    it("should store module data", () => {
      const data = createModuleData();
      cache.setModule("./a.ts", data);
      expect(cache.size).toBe(1);
      expect(cache.getModule("./a.ts")).toEqual(data);
    });

    it("should overwrite existing entries", () => {
      cache.setModule("./a.ts", createModuleData({ code: "old" }));
      cache.setModule("./a.ts", createModuleData({ code: "new" }));
      expect(cache.size).toBe(1);
      expect(cache.getModule("./a.ts")!.code).toBe("new");
    });
  });

  describe("hasModule", () => {
    it("should return false for missing modules", () => {
      expect(cache.hasModule("./missing.ts")).toBe(false);
    });

    it("should return true for existing modules", () => {
      cache.setModule("./a.ts", createModuleData());
      expect(cache.hasModule("./a.ts")).toBe(true);
    });
  });

  describe("deleteModule", () => {
    it("should remove existing module", () => {
      cache.setModule("./a.ts", createModuleData());
      const result = cache.deleteModule("./a.ts");
      expect(result).toBe(true);
      expect(cache.size).toBe(0);
    });

    it("should return false for missing module", () => {
      expect(cache.deleteModule("./missing.ts")).toBe(false);
    });
  });

  describe("incrementBuild", () => {
    it("should increment the build counter", () => {
      expect(cache.getBuildCount()).toBe(0);
      cache.incrementBuild();
      expect(cache.getBuildCount()).toBe(1);
      cache.incrementBuild();
      expect(cache.getBuildCount()).toBe(2);
    });
  });

  describe("purgeExpired", () => {
    it("should not purge recently accessed modules", () => {
      cache.setModule("./a.ts", createModuleData());
      cache.incrementBuild();
      cache.purgeExpired(3);
      expect(cache.hasModule("./a.ts")).toBe(true);
    });

    it("should purge modules older than expiry builds", () => {
      cache.setModule("./old.ts", createModuleData());
      cache.incrementBuild();
      cache.incrementBuild();
      cache.incrementBuild();
      cache.purgeExpired(3);
      expect(cache.hasModule("./old.ts")).toBe(false);
    });

    it("should keep modules accessed within expiry window", () => {
      cache.setModule("./a.ts", createModuleData());
      cache.incrementBuild();
      cache.getModule("./a.ts"); // refresh access
      cache.incrementBuild();
      cache.incrementBuild();
      cache.purgeExpired(3);
      expect(cache.hasModule("./a.ts")).toBe(true);
    });

    it("should purge selectively", () => {
      cache.setModule("./old.ts", createModuleData());
      cache.incrementBuild();
      cache.incrementBuild();
      cache.setModule("./new.ts", createModuleData());
      cache.incrementBuild();
      cache.purgeExpired(3);
      expect(cache.hasModule("./old.ts")).toBe(false);
      expect(cache.hasModule("./new.ts")).toBe(true);
    });

    it("should handle expiry of 1 (immediate)", () => {
      cache.setModule("./a.ts", createModuleData());
      cache.incrementBuild();
      cache.purgeExpired(1);
      expect(cache.hasModule("./a.ts")).toBe(false);
    });

    it("should not purge anything with large expiry", () => {
      cache.setModule("./a.ts", createModuleData());
      cache.incrementBuild();
      cache.incrementBuild();
      cache.purgeExpired(100);
      expect(cache.hasModule("./a.ts")).toBe(true);
    });
  });

  describe("serialize", () => {
    it("should serialize empty cache", () => {
      const result = cache.serialize();
      expect(result.modules).toEqual([]);
    });

    it("should serialize all cached modules", () => {
      const dataA = createModuleData({ code: "a" });
      const dataB = createModuleData({ code: "b" });
      cache.setModule("./a.ts", dataA);
      cache.setModule("./b.ts", dataB);

      const result = cache.serialize();
      expect(result.modules).toHaveLength(2);

      const ids = result.modules.map((m) => m.id);
      expect(ids).toContain("./a.ts");
      expect(ids).toContain("./b.ts");

      const moduleA = result.modules.find((m) => m.id === "./a.ts");
      expect(moduleA!.code).toBe("a");
      expect(moduleA!.dependencies).toEqual(["./dep-a.ts"]);
    });

    it("should round-trip through constructor", () => {
      cache.setModule("./a.ts", createModuleData({ code: "hello" }));
      cache.setModule("./b.ts", createModuleData({ code: "world" }));

      const serialized = cache.serialize();
      const restored = new RollupCache(serialized);

      expect(restored.size).toBe(2);
      expect(restored.getModule("./a.ts")!.code).toBe("hello");
      expect(restored.getModule("./b.ts")!.code).toBe("world");
    });
  });

  describe("size", () => {
    it("should reflect module count", () => {
      expect(cache.size).toBe(0);
      cache.setModule("./a.ts", createModuleData());
      expect(cache.size).toBe(1);
      cache.setModule("./b.ts", createModuleData());
      expect(cache.size).toBe(2);
      cache.deleteModule("./a.ts");
      expect(cache.size).toBe(1);
    });
  });
});

describe("PluginCache", () => {
  let pluginCache: PluginCache;

  beforeEach(() => {
    pluginCache = new PluginCache();
  });

  describe("set and get", () => {
    it("should store and retrieve string values", () => {
      pluginCache.set("key1", "value1");
      expect(pluginCache.get<string>("key1")).toBe("value1");
    });

    it("should store and retrieve numeric values", () => {
      pluginCache.set("count", 42);
      expect(pluginCache.get<number>("count")).toBe(42);
    });

    it("should store and retrieve object values", () => {
      const obj = { nested: { data: [1, 2, 3] } };
      pluginCache.set("obj", obj);
      expect(pluginCache.get("obj")).toEqual(obj);
    });

    it("should store null values", () => {
      pluginCache.set("nullable", null);
      expect(pluginCache.get("nullable")).toBeNull();
    });

    it("should overwrite existing values", () => {
      pluginCache.set("key", "old");
      pluginCache.set("key", "new");
      expect(pluginCache.get<string>("key")).toBe("new");
    });
  });

  describe("get (error cases)", () => {
    it("should throw for missing keys", () => {
      expect(() => pluginCache.get("missing")).toThrow(
        'PluginCache.get: no entry found for key "missing"',
      );
    });
  });

  describe("has", () => {
    it("should return false for missing keys", () => {
      expect(pluginCache.has("missing")).toBe(false);
    });

    it("should return true for existing keys", () => {
      pluginCache.set("exists", true);
      expect(pluginCache.has("exists")).toBe(true);
    });

    it("should return true for keys with falsy values", () => {
      pluginCache.set("zero", 0);
      pluginCache.set("empty", "");
      pluginCache.set("null", null);
      expect(pluginCache.has("zero")).toBe(true);
      expect(pluginCache.has("empty")).toBe(true);
      expect(pluginCache.has("null")).toBe(true);
    });
  });

  describe("delete", () => {
    it("should delete existing keys and return true", () => {
      pluginCache.set("key", "value");
      const result = pluginCache.delete("key");
      expect(result).toBe(true);
      expect(pluginCache.has("key")).toBe(false);
    });

    it("should return false for missing keys", () => {
      expect(pluginCache.delete("missing")).toBe(false);
    });

    it("should make get throw after deletion", () => {
      pluginCache.set("key", "value");
      pluginCache.delete("key");
      expect(() => pluginCache.get("key")).toThrow();
    });
  });

  describe("size", () => {
    it("should be 0 for new cache", () => {
      expect(pluginCache.size).toBe(0);
    });

    it("should track additions and deletions", () => {
      pluginCache.set("a", 1);
      pluginCache.set("b", 2);
      expect(pluginCache.size).toBe(2);
      pluginCache.delete("a");
      expect(pluginCache.size).toBe(1);
    });
  });
});
