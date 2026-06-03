/**
 * @module tests/unit/loaders/wasm-loader
 * @description Unit tests for the built-in WASM loader plugin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import {
  isWASMFile,
  generateWASMModule,
  wasmLoader,
} from "../../../src/loaders/wasm-loader.js";

// Mock fs.readFileSync
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

describe("isWASMFile", () => {
  it("returns true for .wasm files", () => {
    expect(isWASMFile("module.wasm")).toBe(true);
    expect(isWASMFile("/path/to/file.wasm")).toBe(true);
  });

  it("returns false for non-wasm files", () => {
    expect(isWASMFile("script.js")).toBe(false);
    expect(isWASMFile("module.js")).toBe(false);
    expect(isWASMFile("file.wasml")).toBe(false);
  });

  it("ignores query parameters", () => {
    expect(isWASMFile("module.wasm?init")).toBe(true);
  });
});

describe("generateWASMModule", () => {
  it("generates an init function that fetches the wasm file", () => {
    const code = generateWASMModule("assets/module-abc12345.wasm");
    expect(code).toContain("assets/module-abc12345.wasm");
    expect(code).toContain("export async function init");
    expect(code).toContain("WebAssembly.instantiate");
    expect(code).toContain("export default init");
  });

  it("accepts importObject parameter", () => {
    const code = generateWASMModule("assets/test.wasm");
    expect(code).toContain("importObject");
  });

  it("returns instance and module from init", () => {
    const code = generateWASMModule("assets/test.wasm");
    expect(code).toContain("return { instance, module }");
  });
});

describe("wasmLoader plugin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("has the correct name", () => {
    const plugin = wasmLoader();
    expect(plugin.name).toBe("steamroller:wasm");
  });

  it("load returns null for non-wasm files", () => {
    const plugin = wasmLoader();
    const result = (plugin.load as (id: string) => unknown)("script.js");
    expect(result).toBeNull();
  });

  it("load reads wasm file and returns init module", () => {
    const wasmContent = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
    vi.mocked(fs.readFileSync).mockReturnValue(
      wasmContent as unknown as string,
    );

    const plugin = wasmLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/module.wasm",
    ) as { code: string; meta: Record<string, unknown> };

    expect(result).not.toBeNull();
    expect(result.code).toContain("export async function init");
    expect(result.code).toContain("assets/module-");
    expect(result.meta).toBeDefined();
    expect(result.meta.asset).toBeDefined();
  });

  it("load returns null when file cannot be read", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const plugin = wasmLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/missing.wasm",
    );
    expect(result).toBeNull();
  });

  it("supports custom output directory", () => {
    const wasmContent = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
    vi.mocked(fs.readFileSync).mockReturnValue(
      wasmContent as unknown as string,
    );

    const plugin = wasmLoader({ outputDir: "wasm" });
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/module.wasm",
    ) as { code: string };

    expect(result.code).toContain("wasm/module-");
  });
});
