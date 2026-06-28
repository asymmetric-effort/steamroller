/**
 * @module tests/integration/asset-imports
 * @description Integration tests for built-in asset/JSON/text import support.
 * Tests end-to-end behavior of the loader plugins.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { vi } from "../vi-compat.js";
import * as fs from "node:fs";
import {
  jsonLoader,
  generateJSONModule,
} from "../../src/loaders/json-loader.js";
import {
  assetLoader,
  computeAssetHash,
} from "../../src/loaders/asset-loader.js";
import { textLoader } from "../../src/loaders/text-loader.js";
import { wasmLoader } from "../../src/loaders/wasm-loader.js";
import { createBuiltinLoaders } from "../../src/loaders/index.js";

// Mock fs.readFileSync
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

describe("JSON import end-to-end", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("imports a package.json with named exports", () => {
    const pkg = {
      name: "my-package",
      version: "2.0.0",
      private: true,
      dependencies: { lodash: "^4.0.0" },
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(pkg));

    const plugin = jsonLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/project/package.json",
    ) as { code: string };

    expect(result.code).toContain('export const name = "my-package";');
    expect(result.code).toContain('export const version = "2.0.0";');
    expect(result.code).toContain("export const dependencies = ");
    expect(result.code).toContain("export default");
  });

  it("handles JSON with special characters in values", () => {
    const data = { description: 'A "great" library\nwith newlines' };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(data));

    const plugin = jsonLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/project/data.json",
    ) as { code: string };

    expect(result.code).toContain("\\n");
    expect(result.code).toContain('\\"');
  });
});

describe("Asset import end-to-end", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("imports a PNG and returns hashed asset path", () => {
    const pngData = Buffer.from("fake-png-data");
    vi.mocked(fs.readFileSync).mockReturnValue(pngData as unknown as string);

    const plugin = assetLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/src/images/logo.png",
    ) as { code: string; meta: Record<string, unknown> };

    const hash = computeAssetHash(pngData);
    expect(result.code).toContain(`assets/logo-${hash}.png`);
    expect(result.meta.asset).toBeDefined();
  });

  it("imports an SVG with ?inline and returns data URL", () => {
    const svgContent = '<svg width="100" height="100"></svg>';
    vi.mocked(fs.readFileSync).mockReturnValue(
      Buffer.from(svgContent) as unknown as string,
    );

    const plugin = assetLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/src/icons/arrow.svg?inline",
    ) as { code: string };

    expect(result.code).toContain("data:image/svg+xml;base64,");
    expect(result.code).toContain("export default");
  });

  it("copies asset to output directory via meta", () => {
    const fontData = Buffer.from("font-binary-data");
    vi.mocked(fs.readFileSync).mockReturnValue(fontData as unknown as string);

    const plugin = assetLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/src/fonts/roboto.woff2",
    ) as { meta: { asset: { fileName: string; outputPath: string } } };

    expect(result.meta.asset.fileName).toContain("roboto-");
    expect(result.meta.asset.fileName).toContain(".woff2");
    expect(result.meta.asset.outputPath).toContain("assets/");
  });
});

describe("createBuiltinLoaders", () => {
  it("creates all loaders by default", () => {
    const loaders = createBuiltinLoaders();
    expect(loaders).toHaveLength(4);
    const names = loaders.map((l) => l.name);
    expect(names).toContain("steamroller:json");
    expect(names).toContain("steamroller:asset");
    expect(names).toContain("steamroller:text");
    expect(names).toContain("steamroller:wasm");
  });

  it("can disable individual loaders", () => {
    const loaders = createBuiltinLoaders({
      json: false,
      wasm: false,
    });
    expect(loaders).toHaveLength(2);
    const names = loaders.map((l) => l.name);
    expect(names).toContain("steamroller:asset");
    expect(names).toContain("steamroller:text");
  });

  it("can pass options to individual loaders", () => {
    const loaders = createBuiltinLoaders({
      asset: { outputDir: "static" },
    });
    const assetPlugin = loaders.find((l) => l.name === "steamroller:asset")!;
    expect(assetPlugin).toBeDefined();

    // Verify options are passed by testing behavior
    const content = Buffer.from("test");
    vi.mocked(fs.readFileSync).mockReturnValue(content as unknown as string);
    const result = (assetPlugin.load as (id: string) => unknown)(
      "/path/img.png",
    ) as { code: string };
    expect(result.code).toContain("static/img-");
  });
});
