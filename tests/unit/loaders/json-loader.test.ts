/**
 * @module tests/unit/loaders/json-loader
 * @description Unit tests for the built-in JSON loader plugin.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { vi } from "../../vi-compat.js";
import * as fs from "node:fs";
import {
  isJSONFile,
  generateJSONModule,
  jsonLoader,
} from "../../../src/loaders/json-loader.js";

// Mock fs.readFileSync
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

describe("isJSONFile", () => {
  it("returns true for .json files", () => {
    expect(isJSONFile("data.json")).toBe(true);
    expect(isJSONFile("/path/to/package.json")).toBe(true);
  });

  it("returns false for non-JSON files", () => {
    expect(isJSONFile("script.js")).toBe(false);
    expect(isJSONFile("styles.css")).toBe(false);
    expect(isJSONFile("data.jsonl")).toBe(false);
  });

  it("ignores query parameters", () => {
    expect(isJSONFile("data.json?raw")).toBe(true);
    expect(isJSONFile("script.js?json")).toBe(false);
  });

  it("supports custom extensions", () => {
    expect(isJSONFile("data.json5", [".json5"])).toBe(true);
    expect(isJSONFile("data.json", [".json5"])).toBe(false);
  });
});

describe("generateJSONModule", () => {
  it("generates named exports for top-level string keys", () => {
    const data = { name: "test", version: "1.0.0" };
    const code = generateJSONModule(data, true);
    expect(code).toContain('export const name = "test";');
    expect(code).toContain('export const version = "1.0.0";');
    expect(code).toContain("export default {name, version};");
  });

  it("generates named exports for number values", () => {
    const data = { count: 42, ratio: 3.14 };
    const code = generateJSONModule(data, true);
    expect(code).toContain("export const count = 42;");
    expect(code).toContain("export const ratio = 3.14;");
  });

  it("generates named exports for boolean values", () => {
    const data = { enabled: true, debug: false };
    const code = generateJSONModule(data, true);
    expect(code).toContain("export const enabled = true;");
    expect(code).toContain("export const debug = false;");
  });

  it("generates named exports for null values", () => {
    const data = { value: null };
    const code = generateJSONModule(data, true);
    expect(code).toContain("export const value = null;");
  });

  it("generates named exports for array values", () => {
    const data = { items: [1, 2, 3] };
    const code = generateJSONModule(data, true);
    expect(code).toContain("export const items = [1, 2, 3];");
  });

  it("generates named exports for nested objects", () => {
    const data = { config: { debug: true, level: 5 } };
    const code = generateJSONModule(data, true);
    expect(code).toContain("export const config = {debug: true, level: 5};");
  });

  it("skips named exports for invalid identifiers", () => {
    const data = { "valid-key": "value", validKey: "ok", "123": "nope" };
    const code = generateJSONModule(data, true);
    expect(code).not.toContain("export const valid-key");
    expect(code).not.toContain("export const 123");
    expect(code).toContain('export const validKey = "ok";');
    // Default export should inline invalid keys and reference valid ones
    expect(code).toContain('"valid-key"');
    expect(code).toContain('"123"');
  });

  it("only generates default export when namedExports is false", () => {
    const data = { name: "test" };
    const code = generateJSONModule(data, false);
    expect(code).not.toContain("export const name");
    expect(code).toContain("export default");
  });

  it("handles arrays as root value", () => {
    const data = [1, 2, 3];
    const code = generateJSONModule(data, true);
    expect(code).toContain("export default [1, 2, 3];");
    // No named exports for array root
    expect(code).not.toContain("export const");
  });

  it("handles primitive root values", () => {
    expect(generateJSONModule("hello", true)).toContain(
      'export default "hello";',
    );
    expect(generateJSONModule(42, true)).toContain("export default 42;");
    expect(generateJSONModule(true, true)).toContain("export default true;");
    expect(generateJSONModule(null, true)).toContain("export default null;");
  });

  it("escapes special characters in strings", () => {
    const data = { msg: 'line1\nline2\ttab"quote' };
    const code = generateJSONModule(data, true);
    expect(code).toContain("\\n");
    expect(code).toContain("\\t");
    expect(code).toContain('\\"');
  });

  it("generates tree-shakeable named exports with default referencing identifiers", () => {
    const data = { name: "foo", version: "1.0" };
    const code = generateJSONModule(data, true);
    // Each named export should be a separate export const declaration
    expect(code).toContain('export const name = "foo";');
    expect(code).toContain('export const version = "1.0";');
    // Default export should reference identifiers, not inline values
    expect(code).toContain("export default {name, version};");
    // Should NOT have the full object literal in the default export
    expect(code).not.toContain('export default {name: "foo"');
  });

  it("default export references valid identifiers and inlines invalid keys", () => {
    const data = { ok: 1, "not-valid": 2 };
    const code = generateJSONModule(data, true);
    expect(code).toContain("export const ok = 1;");
    expect(code).not.toContain("export const not-valid");
    // Default should reference ok by identifier, but inline "not-valid"
    expect(code).toContain('export default {ok, "not-valid": 2};');
  });
});

describe("jsonLoader plugin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("has the correct name", () => {
    const plugin = jsonLoader();
    expect(plugin.name).toBe("steamroller:json");
  });

  it("load returns null for non-JSON files", () => {
    const plugin = jsonLoader();
    const result = (plugin.load as (id: string) => unknown)("script.js");
    expect(result).toBeNull();
  });

  it("load reads and parses JSON files", () => {
    const mockData = JSON.stringify({ name: "pkg", version: "1.0.0" });
    vi.mocked(fs.readFileSync).mockReturnValue(mockData);

    const plugin = jsonLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/package.json",
    ) as { code: string };

    expect(result).not.toBeNull();
    expect(result.code).toContain('export const name = "pkg";');
    expect(result.code).toContain('export const version = "1.0.0";');
    expect(result.code).toContain("export default");
  });

  it("load returns null when file cannot be read", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const plugin = jsonLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/missing.json",
    );
    expect(result).toBeNull();
  });

  it("resolveId returns null for all inputs", () => {
    const plugin = jsonLoader();
    const resolve = plugin.resolveId as (source: string) => unknown;
    expect(resolve("data.json")).toBeNull();
    expect(resolve("script.js")).toBeNull();
  });

  it("respects namedExports: false option", () => {
    const mockData = JSON.stringify({ name: "test" });
    vi.mocked(fs.readFileSync).mockReturnValue(mockData);

    const plugin = jsonLoader({ namedExports: false });
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/data.json",
    ) as { code: string };

    expect(result.code).not.toContain("export const name");
    expect(result.code).toContain("export default");
  });
});
