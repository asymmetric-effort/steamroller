/**
 * Tests for src/define-config.ts and src/version.ts
 *
 * Covers defineConfig() with single object, array, sync function,
 * and async function forms, plus the VERSION constant.
 */
import { describe, it, expect } from "vitest";
import { defineConfig, VERSION } from "../../src/index";
import type { RollupOptions, RollupOptionsFunction } from "../../src/index";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("VERSION", () => {
  it("is a string", () => {
    expect(typeof VERSION).toBe("string");
  });

  it("matches the version in package.json", () => {
    const pkgPath = resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      version: string;
    };
    expect(VERSION).toBe(pkg.version);
  });

  it("follows semver format", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("defineConfig", () => {
  describe("single object form", () => {
    it("returns the same object reference", () => {
      const config: RollupOptions = { input: "src/index.ts" };
      const result = defineConfig(config);
      expect(result).toBe(config);
    });

    it("preserves all properties", () => {
      const config: RollupOptions = {
        input: "src/index.ts",
        output: { file: "dist/bundle.js", format: "esm" },
      };
      const result = defineConfig(config);
      expect(result).toEqual(config);
    });

    it("works with an empty object", () => {
      const config: RollupOptions = {};
      const result = defineConfig(config);
      expect(result).toBe(config);
    });
  });

  describe("array form", () => {
    it("returns the same array reference", () => {
      const configs: ReadonlyArray<RollupOptions> = [
        { input: "src/a.ts" },
        { input: "src/b.ts" },
      ];
      const result = defineConfig(configs);
      expect(result).toBe(configs);
    });

    it("preserves all elements", () => {
      const configs: ReadonlyArray<RollupOptions> = [
        { input: "src/a.ts" },
        { input: "src/b.ts" },
      ];
      const result = defineConfig(configs);
      expect(result).toHaveLength(2);
    });

    it("works with an empty array", () => {
      const configs: ReadonlyArray<RollupOptions> = [];
      const result = defineConfig(configs);
      expect(result).toBe(configs);
    });

    it("works with a single-element array", () => {
      const configs: ReadonlyArray<RollupOptions> = [{ input: "src/index.ts" }];
      const result = defineConfig(configs);
      expect(result).toBe(configs);
    });
  });

  describe("function form", () => {
    it("returns the same function reference (sync)", () => {
      const fn: RollupOptionsFunction = (_args) => ({ input: "src/index.ts" });
      const result = defineConfig(fn);
      expect(result).toBe(fn);
    });

    it("returned function is callable and produces expected output", () => {
      const fn: RollupOptionsFunction = (args) => ({
        input: args["entry"] as string,
      });
      const result = defineConfig(fn) as RollupOptionsFunction;
      expect(result({ entry: "main.ts" })).toEqual({ input: "main.ts" });
    });

    it("returns the same function reference (async)", () => {
      const fn: RollupOptionsFunction = async (_args) =>
        Promise.resolve({ input: "src/index.ts" });
      const result = defineConfig(fn);
      expect(result).toBe(fn);
    });

    it("works with a function returning an array", () => {
      const fn: RollupOptionsFunction = (_args) => [
        { input: "src/a.ts" },
        { input: "src/b.ts" },
      ];
      const result = defineConfig(fn) as RollupOptionsFunction;
      const output = result({});
      expect(Array.isArray(output)).toBe(true);
    });

    it("works with an async function returning an array", async () => {
      const fn: RollupOptionsFunction = async (_args) =>
        Promise.resolve([{ input: "src/a.ts" }]);
      const result = defineConfig(fn) as RollupOptionsFunction;
      const output = await result({});
      expect(Array.isArray(output)).toBe(true);
    });
  });
});
