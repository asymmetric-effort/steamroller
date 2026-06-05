/**
 * @module tests/unit/importmap/generate-importmap
 * @description Unit tests for import map generation from build output.
 */

import { describe, it, expect } from "vitest";
import {
  generateImportMap,
  serializeImportMap,
  isOutputChunk,
} from "../../../src/importmap/generate-importmap.js";
import type {
  RollupOutput,
  OutputChunk,
  OutputAsset,
} from "../../../src/types.js";
import type { ImportMapJson } from "../../../src/importmap/types.js";

/**
 * Helper to create a minimal OutputChunk for testing.
 */
const makeChunk = (
  overrides: Partial<OutputChunk> & { fileName: string },
): OutputChunk => ({
  type: "chunk",
  code: "",
  map: null,
  sourcemapFileName: null,
  preliminaryFileName: overrides.fileName,
  exports: [],
  facadeModuleId: null,
  isDynamicEntry: false,
  isEntry: true,
  isImplicitEntry: false,
  moduleIds: [],
  name: "bundle",
  dynamicImports: [],
  implicitlyLoadedBefore: [],
  importedBindings: {},
  imports: [],
  modules: {},
  referencedFiles: [],
  ...overrides,
});

/**
 * Helper to create a minimal OutputAsset for testing.
 */
const makeAsset = (
  overrides: Partial<OutputAsset> & { fileName: string },
): OutputAsset => ({
  type: "asset",
  name: undefined,
  names: [],
  needsCodeReference: false,
  originalFileName: null,
  originalFileNames: [],
  source: "",
  ...overrides,
});

/**
 * Helper to create a RollupOutput from chunks and assets.
 */
const makeOutput = (
  items: ReadonlyArray<OutputChunk | OutputAsset>,
): RollupOutput => ({
  output: items as unknown as readonly [
    OutputChunk,
    ...(OutputChunk | OutputAsset)[],
  ],
});

describe("generateImportMap", () => {
  it("returns empty imports when output has no external imports", () => {
    const output = makeOutput([makeChunk({ fileName: "bundle.js" })]);
    const result = generateImportMap(output);
    expect(result.imports).toEqual({});
    expect(result.scopes).toBeUndefined();
  });

  it("maps bare specifiers from chunk imports to esm.sh by default", () => {
    const output = makeOutput([
      makeChunk({ fileName: "bundle.js", imports: ["react", "react-dom"] }),
    ]);
    const result = generateImportMap(output);
    expect(result.imports["react"]).toBe("https://esm.sh/react");
    expect(result.imports["react-dom"]).toBe("https://esm.sh/react-dom");
  });

  it("uses configured externals with version pinning", () => {
    const output = makeOutput([
      makeChunk({ fileName: "bundle.js", imports: ["react"] }),
    ]);
    const result = generateImportMap(output, {
      externals: { react: "18.2.0" },
    });
    expect(result.imports["react"]).toBe("https://esm.sh/react@18.2.0");
  });

  it("resolves to the specified CDN provider", () => {
    const output = makeOutput([
      makeChunk({ fileName: "bundle.js", imports: ["vue"] }),
    ]);
    const result = generateImportMap(output, {
      cdn: "unpkg",
      externals: { vue: "3.3.4" },
    });
    expect(result.imports["vue"]).toBe("https://unpkg.com/vue@3.3.4");
  });

  it("resolves to jsdelivr CDN", () => {
    const output = makeOutput([
      makeChunk({ fileName: "bundle.js", imports: ["lodash"] }),
    ]);
    const result = generateImportMap(output, {
      cdn: "jsdelivr",
      externals: { lodash: "4.17.21" },
    });
    expect(result.imports["lodash"]).toBe(
      "https://cdn.jsdelivr.net/npm/lodash@4.17.21",
    );
  });

  it("resolves to skypack CDN", () => {
    const output = makeOutput([
      makeChunk({ fileName: "bundle.js", imports: ["preact"] }),
    ]);
    const result = generateImportMap(output, {
      cdn: "skypack",
      externals: { preact: "10.15.0" },
    });
    expect(result.imports["preact"]).toBe(
      "https://cdn.skypack.dev/preact@10.15.0",
    );
  });

  it("ignores relative imports from chunks", () => {
    const output = makeOutput([
      makeChunk({
        fileName: "bundle.js",
        imports: ["./utils.js", "../lib.js", "react"],
      }),
    ]);
    const result = generateImportMap(output);
    expect(result.imports["./utils.js"]).toBeUndefined();
    expect(result.imports["../lib.js"]).toBeUndefined();
    expect(result.imports["react"]).toBe("https://esm.sh/react");
  });

  it("ignores absolute URL imports from chunks", () => {
    const output = makeOutput([
      makeChunk({
        fileName: "bundle.js",
        imports: ["https://example.com/lib.js", "react"],
      }),
    ]);
    const result = generateImportMap(output);
    expect(result.imports["https://example.com/lib.js"]).toBeUndefined();
    expect(result.imports["react"]).toBe("https://esm.sh/react");
  });

  it("adds local chunk references with baseUrl prefix", () => {
    const output = makeOutput([
      makeChunk({ fileName: "main.js", isEntry: true }),
      makeChunk({ fileName: "chunk-abc.js", isEntry: false }),
    ]);
    const result = generateImportMap(output, { baseUrl: "/assets/" });
    expect(result.imports["./chunk-abc.js"]).toBe("/assets/chunk-abc.js");
  });

  it("uses default baseUrl of ./ when not specified", () => {
    const output = makeOutput([
      makeChunk({ fileName: "main.js", isEntry: true }),
      makeChunk({ fileName: "vendor.js", isEntry: false }),
    ]);
    const result = generateImportMap(output);
    expect(result.imports["./vendor.js"]).toBe("./vendor.js");
  });

  it("does not add entry chunks as local references", () => {
    const output = makeOutput([
      makeChunk({ fileName: "main.js", isEntry: true }),
    ]);
    const result = generateImportMap(output);
    expect(result.imports["./main.js"]).toBeUndefined();
  });

  it("generates scoped imports for version conflicts", () => {
    const output = makeOutput([
      makeChunk({
        fileName: "main.js",
        isEntry: true,
        imports: ["react"],
      }),
      makeChunk({
        fileName: "legacy.js",
        isEntry: false,
        imports: ["react"],
      }),
    ]);
    const result = generateImportMap(output, {
      externals: {
        react: "18.2.0",
        "react>legacy.js": "17.0.2",
      },
    });
    expect(result.imports["react"]).toBe("https://esm.sh/react@18.2.0");
    expect(result.scopes).toBeDefined();
    expect(result.scopes!["./legacy.js"]).toBeDefined();
    expect(result.scopes!["./legacy.js"]["react"]).toBe(
      "https://esm.sh/react@17.0.2",
    );
  });

  it("handles multiple scoped overrides", () => {
    const output = makeOutput([
      makeChunk({ fileName: "main.js", isEntry: true, imports: ["react"] }),
    ]);
    const result = generateImportMap(output, {
      externals: {
        react: "18.2.0",
        "react>chunk-a.js": "17.0.2",
        "lodash>chunk-a.js": "4.17.20",
      },
    });
    expect(result.scopes!["./chunk-a.js"]["react"]).toBe(
      "https://esm.sh/react@17.0.2",
    );
    expect(result.scopes!["./chunk-a.js"]["lodash"]).toBe(
      "https://esm.sh/lodash@4.17.20",
    );
  });

  it("does not include scopes when there are no version conflicts", () => {
    const output = makeOutput([
      makeChunk({ fileName: "bundle.js", imports: ["react"] }),
    ]);
    const result = generateImportMap(output, {
      externals: { react: "18.2.0" },
    });
    expect(result.scopes).toBeUndefined();
  });

  it("skips assets in import map generation", () => {
    const output = makeOutput([
      makeChunk({ fileName: "bundle.js", imports: ["react"] }),
      makeAsset({ fileName: "style.css", source: "body{}" }),
    ]);
    const result = generateImportMap(output, {
      externals: { react: "18.2.0" },
    });
    expect(result.imports["react"]).toBe("https://esm.sh/react@18.2.0");
    // No CSS reference in import map
    expect(Object.keys(result.imports)).not.toContain("style.css");
  });

  it("handles multiple chunks with overlapping external imports", () => {
    const output = makeOutput([
      makeChunk({
        fileName: "main.js",
        isEntry: true,
        imports: ["react", "lodash"],
      }),
      makeChunk({
        fileName: "vendor.js",
        isEntry: false,
        imports: ["react"],
      }),
    ]);
    const result = generateImportMap(output, {
      externals: { react: "18.2.0", lodash: "4.17.21" },
    });
    expect(result.imports["react"]).toBe("https://esm.sh/react@18.2.0");
    expect(result.imports["lodash"]).toBe("https://esm.sh/lodash@4.17.21");
  });
});

describe("serializeImportMap", () => {
  it("serializes an import map to formatted JSON", () => {
    const map: ImportMapJson = {
      imports: { react: "https://esm.sh/react@18.2.0" },
    };
    const result = serializeImportMap(map);
    const parsed = JSON.parse(result);
    expect(parsed.imports.react).toBe("https://esm.sh/react@18.2.0");
  });

  it("includes scopes in serialized output", () => {
    const map: ImportMapJson = {
      imports: { react: "https://esm.sh/react@18.2.0" },
      scopes: {
        "./legacy/": { react: "https://esm.sh/react@17.0.2" },
      },
    };
    const result = serializeImportMap(map);
    const parsed = JSON.parse(result);
    expect(parsed.scopes["./legacy/"].react).toBe(
      "https://esm.sh/react@17.0.2",
    );
  });

  it("produces indented JSON", () => {
    const map: ImportMapJson = { imports: { a: "b" } };
    const result = serializeImportMap(map);
    expect(result).toContain("\n");
    expect(result).toContain("  ");
  });
});

describe("isOutputChunk", () => {
  it("returns true for a chunk", () => {
    const chunk = makeChunk({ fileName: "bundle.js" });
    expect(isOutputChunk(chunk)).toBe(true);
  });

  it("returns false for an asset", () => {
    const asset = makeAsset({ fileName: "style.css" });
    expect(isOutputChunk(asset)).toBe(false);
  });
});
