/**
 * @module tests/unit/loaders/asset-loader
 * @description Unit tests for the built-in asset loader plugin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import {
  isAssetFile,
  parseAssetId,
  computeAssetHash,
  buildAssetFileName,
  getMimeType,
  assetLoader,
  DEFAULT_ASSET_EXTENSIONS,
} from "../../../src/loaders/asset-loader.js";

// Mock fs.readFileSync
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

describe("DEFAULT_ASSET_EXTENSIONS", () => {
  it("includes common image formats", () => {
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".png");
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".jpg");
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".jpeg");
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".gif");
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".svg");
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".webp");
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".ico");
  });

  it("includes font formats", () => {
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".woff");
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".woff2");
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".ttf");
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".eot");
  });

  it("includes wasm", () => {
    expect(DEFAULT_ASSET_EXTENSIONS).toContain(".wasm");
  });
});

describe("isAssetFile", () => {
  it("returns true for known asset extensions", () => {
    expect(isAssetFile("logo.png")).toBe(true);
    expect(isAssetFile("/path/to/image.jpg")).toBe(true);
    expect(isAssetFile("font.woff2")).toBe(true);
    expect(isAssetFile("icon.svg")).toBe(true);
  });

  it("returns false for non-asset files", () => {
    expect(isAssetFile("script.js")).toBe(false);
    expect(isAssetFile("styles.css")).toBe(false);
    expect(isAssetFile("data.json")).toBe(false);
  });

  it("ignores query parameters", () => {
    expect(isAssetFile("icon.png?inline")).toBe(true);
    expect(isAssetFile("icon.svg?raw")).toBe(true);
  });

  it("supports custom extensions", () => {
    expect(isAssetFile("model.obj", [".obj"])).toBe(true);
    expect(isAssetFile("image.png", [".obj"])).toBe(false);
  });
});

describe("parseAssetId", () => {
  it("parses a simple path with no query", () => {
    const result = parseAssetId("/path/to/logo.png");
    expect(result.path).toBe("/path/to/logo.png");
    expect(result.inline).toBe(false);
    expect(result.raw).toBe(false);
  });

  it("parses ?inline query", () => {
    const result = parseAssetId("/path/to/icon.png?inline");
    expect(result.path).toBe("/path/to/icon.png");
    expect(result.inline).toBe(true);
    expect(result.raw).toBe(false);
  });

  it("parses ?raw query", () => {
    const result = parseAssetId("/path/to/icon.svg?raw");
    expect(result.path).toBe("/path/to/icon.svg");
    expect(result.inline).toBe(false);
    expect(result.raw).toBe(true);
  });
});

describe("computeAssetHash", () => {
  it("returns an 8-character hex string", () => {
    const hash = computeAssetHash(Buffer.from("hello world"));
    expect(hash).toHaveLength(8);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("returns different hashes for different content", () => {
    const hash1 = computeAssetHash(Buffer.from("content1"));
    const hash2 = computeAssetHash(Buffer.from("content2"));
    expect(hash1).not.toBe(hash2);
  });

  it("returns the same hash for the same content", () => {
    const hash1 = computeAssetHash(Buffer.from("same content"));
    const hash2 = computeAssetHash(Buffer.from("same content"));
    expect(hash1).toBe(hash2);
  });
});

describe("buildAssetFileName", () => {
  it("inserts hash before the extension", () => {
    const result = buildAssetFileName("/path/to/logo.png", "abc12345");
    expect(result).toBe("logo-abc12345.png");
  });

  it("handles files with dots in the name", () => {
    const result = buildAssetFileName("/path/to/icon.min.svg", "def67890");
    expect(result).toBe("icon.min-def67890.svg");
  });
});

describe("getMimeType", () => {
  it("returns correct MIME types for known extensions", () => {
    expect(getMimeType(".png")).toBe("image/png");
    expect(getMimeType(".jpg")).toBe("image/jpeg");
    expect(getMimeType(".svg")).toBe("image/svg+xml");
    expect(getMimeType(".woff2")).toBe("font/woff2");
    expect(getMimeType(".wasm")).toBe("application/wasm");
  });

  it("returns application/octet-stream for unknown extensions", () => {
    expect(getMimeType(".xyz")).toBe("application/octet-stream");
  });
});

describe("assetLoader plugin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("has the correct name", () => {
    const plugin = assetLoader();
    expect(plugin.name).toBe("steamroller:asset");
  });

  it("load returns null for non-asset files", () => {
    const plugin = assetLoader();
    const result = (plugin.load as (id: string) => unknown)("script.js");
    expect(result).toBeNull();
  });

  it("load emits asset URL for standard imports", () => {
    const content = Buffer.from("PNG file content");
    vi.mocked(fs.readFileSync).mockReturnValue(content as unknown as string);

    const plugin = assetLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/logo.png",
    ) as { code: string; meta: Record<string, unknown> };

    expect(result).not.toBeNull();
    expect(result.code).toContain("export default");
    expect(result.code).toContain("assets/logo-");
    expect(result.code).toContain(".png");
    expect(result.meta).toBeDefined();
    expect(result.meta.asset).toBeDefined();
  });

  it("load returns base64 data URL for ?inline", () => {
    const content = Buffer.from("PNG file content");
    vi.mocked(fs.readFileSync).mockReturnValue(content as unknown as string);

    const plugin = assetLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/icon.png?inline",
    ) as { code: string };

    expect(result).not.toBeNull();
    expect(result.code).toContain("data:image/png;base64,");
    expect(result.code).toContain("export default");
  });

  it("load returns raw string for ?raw", () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    vi.mocked(fs.readFileSync).mockReturnValue(
      Buffer.from(svgContent) as unknown as string,
    );

    const plugin = assetLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/icon.svg?raw",
    ) as { code: string };

    expect(result).not.toBeNull();
    expect(result.code).toContain("export default");
    expect(result.code).toContain("svg");
  });

  it("load returns null when file cannot be read", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const plugin = assetLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/missing.png",
    );
    expect(result).toBeNull();
  });

  it("supports custom output directory", () => {
    const content = Buffer.from("image data");
    vi.mocked(fs.readFileSync).mockReturnValue(content as unknown as string);

    const plugin = assetLoader({ outputDir: "static" });
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/img.png",
    ) as { code: string };

    expect(result.code).toContain("static/img-");
  });

  it("resolveId returns null for all inputs", () => {
    const plugin = assetLoader();
    const resolve = plugin.resolveId as (source: string) => unknown;
    expect(resolve("logo.png")).toBeNull();
    expect(resolve("script.js")).toBeNull();
  });
});
