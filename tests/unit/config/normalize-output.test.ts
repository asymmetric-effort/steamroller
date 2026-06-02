/**
 * @module tests/unit/config/normalize-output
 * @description Tests for output options normalization.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeOutputOptions,
  normalizeInterop,
  normalizeGlobals,
  normalizeAddon,
  normalizeOutputPlugins,
} from "../../../src/config/normalize-output.js";
import { normalizeInputOptions } from "../../../src/config/normalize-input.js";
import type {
  NormalizedInputOptions,
  OutputPlugin,
} from "../../../src/types.js";

const getDefaultInputOptions = (): NormalizedInputOptions =>
  normalizeInputOptions({});

describe("normalizeInterop", () => {
  it("returns default-returning function for undefined", () => {
    const fn = normalizeInterop(undefined);
    expect(fn(null)).toBe("default");
    expect(fn("lodash")).toBe("default");
  });

  it("wraps static value into function", () => {
    const fn = normalizeInterop("auto");
    expect(fn(null)).toBe("auto");
  });

  it("passes through function form", () => {
    const fn = normalizeInterop((id) =>
      id === "lodash" ? "esModule" : "auto",
    );
    expect(fn("lodash")).toBe("esModule");
    expect(fn("react")).toBe("auto");
  });

  it("wraps boolean value", () => {
    const fn = normalizeInterop(true);
    expect(fn(null)).toBe(true);
  });
});

describe("normalizeGlobals", () => {
  it("returns empty-string function for undefined", () => {
    const fn = normalizeGlobals(undefined);
    expect((fn as (name: string) => string)("anything")).toBe("");
  });

  it("wraps record into lookup function", () => {
    const fn = normalizeGlobals({ jquery: "$", lodash: "_" });
    expect((fn as (name: string) => string)("jquery")).toBe("$");
    expect((fn as (name: string) => string)("unknown")).toBe("");
  });

  it("passes through function form", () => {
    const fn = normalizeGlobals((name) => name.toUpperCase());
    expect((fn as (name: string) => string)("react")).toBe("REACT");
  });
});

describe("normalizeAddon", () => {
  it("returns empty-string function for undefined", () => {
    const fn = normalizeAddon(undefined);
    expect(fn()).toBe("");
  });

  it("wraps string value", () => {
    const fn = normalizeAddon("/* banner */");
    expect(fn()).toBe("/* banner */");
  });

  it("passes through function form", () => {
    const fn = normalizeAddon(() => "/* dynamic */");
    expect(fn()).toBe("/* dynamic */");
  });

  it("supports async functions", async () => {
    const fn = normalizeAddon(async () => "/* async */");
    const result = await fn();
    expect(result).toBe("/* async */");
  });
});

describe("normalizeOutputPlugins", () => {
  it("returns empty array for undefined", () => {
    const result = normalizeOutputPlugins(undefined);
    expect(result).toEqual([]);
  });

  it("filters null and false values", () => {
    const plugin: OutputPlugin = { name: "test" };
    const result = normalizeOutputPlugins([
      plugin,
      null,
      false,
    ] as unknown as ReadonlyArray<OutputPlugin>);
    expect(result).toEqual([plugin]);
  });

  it("flattens nested arrays", () => {
    const p1: OutputPlugin = { name: "p1" };
    const p2: OutputPlugin = { name: "p2" };
    const result = normalizeOutputPlugins([
      p1,
      [p2],
    ] as unknown as ReadonlyArray<OutputPlugin>);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(p1);
    expect(result[1]).toBe(p2);
  });
});

describe("normalizeOutputOptions", () => {
  it("produces valid defaults with minimal options", () => {
    const result = normalizeOutputOptions({}, getDefaultInputOptions());
    expect(result.format).toBe("es");
    expect(result.compact).toBe(false);
    expect(result.strict).toBe(true);
    expect(result.freeze).toBe(true);
    expect(result.sourcemap).toBe(false);
    expect(result.exports).toBe("auto");
    expect(result.esModule).toBe("if-default-prop");
    expect(result.dynamicImportInCjs).toBe(true);
    expect(result.externalImportAttributes).toBe(true);
    expect(result.externalLiveBindings).toBe(true);
    expect(result.hoistTransitiveImports).toBe(true);
    expect(result.systemNullSetters).toBe(true);
    expect(result.validate).toBe(false);
    expect(result.noConflict).toBe(false);
    expect(result.extend).toBe(false);
    expect(result.inlineDynamicImports).toBe(false);
    expect(result.preserveModules).toBe(false);
    expect(result.hashCharacters).toBe("base64");
    expect(result.virtualDirname).toBe("__virtual__");
  });

  it("throws on invalid format", () => {
    expect(() =>
      normalizeOutputOptions(
        { format: "invalid" as unknown as "es" },
        getDefaultInputOptions(),
      ),
    ).toThrow(/Invalid output format/);
  });

  it("throws with INVALID_OPTION code on invalid format", () => {
    try {
      normalizeOutputOptions(
        { format: "invalid" as unknown as "es" },
        getDefaultInputOptions(),
      );
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe("INVALID_OPTION");
    }
  });

  it("throws when both dir and file are specified", () => {
    expect(() =>
      normalizeOutputOptions(
        { dir: "dist", file: "dist/bundle.js" },
        getDefaultInputOptions(),
      ),
    ).toThrow(/Cannot specify both/);
  });

  it("throws with INVALID_OPTION code when dir and file conflict", () => {
    try {
      normalizeOutputOptions(
        { dir: "dist", file: "dist/bundle.js" },
        getDefaultInputOptions(),
      );
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe("INVALID_OPTION");
    }
  });

  it("normalizes dir option", () => {
    const result = normalizeOutputOptions(
      { dir: "dist" },
      getDefaultInputOptions(),
    );
    expect(result.dir).toBe("dist");
    expect(result.file).toBeUndefined();
  });

  it("normalizes file option", () => {
    const result = normalizeOutputOptions(
      { file: "dist/bundle.js" },
      getDefaultInputOptions(),
    );
    expect(result.file).toBe("dist/bundle.js");
    expect(result.dir).toBeUndefined();
  });

  it("normalizes banner/footer/intro/outro to functions", () => {
    const result = normalizeOutputOptions(
      { banner: "/* hi */", footer: "/* bye */" },
      getDefaultInputOptions(),
    );
    expect(result.banner()).toBe("/* hi */");
    expect(result.footer()).toBe("/* bye */");
    expect(result.intro()).toBe("");
    expect(result.outro()).toBe("");
  });

  it("normalizes interop to function", () => {
    const result = normalizeOutputOptions(
      { interop: "auto" },
      getDefaultInputOptions(),
    );
    expect(result.interop(null)).toBe("auto");
  });

  it("normalizes globals record to function", () => {
    const result = normalizeOutputOptions(
      { globals: { jquery: "$" } },
      getDefaultInputOptions(),
    );
    expect((result.globals as (name: string) => string)("jquery")).toBe("$");
  });

  it("normalizes generatedCode es2015 preset", () => {
    const result = normalizeOutputOptions(
      { generatedCode: "es2015" },
      getDefaultInputOptions(),
    );
    expect(result.generatedCode.arrowFunctions).toBe(true);
    expect(result.generatedCode.constBindings).toBe(true);
    expect(result.generatedCode.objectShorthand).toBe(true);
    expect(result.generatedCode.symbols).toBe(true);
  });

  it("normalizes generatedCode es5 preset", () => {
    const result = normalizeOutputOptions(
      { generatedCode: "es5" },
      getDefaultInputOptions(),
    );
    expect(result.generatedCode.arrowFunctions).toBe(false);
    expect(result.generatedCode.constBindings).toBe(false);
  });

  it("normalizes generatedCode object", () => {
    const result = normalizeOutputOptions(
      { generatedCode: { arrowFunctions: true, constBindings: true } },
      getDefaultInputOptions(),
    );
    expect(result.generatedCode.arrowFunctions).toBe(true);
    expect(result.generatedCode.constBindings).toBe(true);
    expect(result.generatedCode.objectShorthand).toBe(false);
  });

  it("normalizes AMD options", () => {
    const result = normalizeOutputOptions(
      { amd: { autoId: true, define: "require" } },
      getDefaultInputOptions(),
    );
    expect(result.amd.autoId).toBe(true);
    expect(result.amd.define).toBe("require");
    expect(result.amd.basePath).toBe("");
  });

  it("normalizes AMD options with defaults for missing fields", () => {
    const result = normalizeOutputOptions(
      { amd: {} },
      getDefaultInputOptions(),
    );
    expect(result.amd.autoId).toBe(false);
    expect(result.amd.basePath).toBe("");
    expect(result.amd.define).toBe("define");
    expect(result.amd.forceJsExtensionForImports).toBe(false);
    expect(result.amd.id).toBeUndefined();
  });

  it("normalizes generatedCode with partial object fields", () => {
    const result = normalizeOutputOptions(
      { generatedCode: { arrowFunctions: true } },
      getDefaultInputOptions(),
    );
    expect(result.generatedCode.arrowFunctions).toBe(true);
    expect(result.generatedCode.constBindings).toBe(false);
    expect(result.generatedCode.objectShorthand).toBe(false);
    expect(result.generatedCode.symbols).toBe(false);
  });

  it("sets minifyInternalExports based on format", () => {
    const es = normalizeOutputOptions(
      { format: "es" },
      getDefaultInputOptions(),
    );
    expect(es.minifyInternalExports).toBe(true);

    const cjs = normalizeOutputOptions(
      { format: "cjs" },
      getDefaultInputOptions(),
    );
    expect(cjs.minifyInternalExports).toBe(false);
  });

  it("normalizes sanitizeFileName to function", () => {
    const result = normalizeOutputOptions({}, getDefaultInputOptions());
    expect(result.sanitizeFileName("file\0name")).toBe("file_name");
    expect(result.sanitizeFileName("file?name")).toBe("file_name");
  });

  it("sanitizeFileName false passes through", () => {
    const result = normalizeOutputOptions(
      { sanitizeFileName: false },
      getDefaultInputOptions(),
    );
    expect(result.sanitizeFileName("file\0name")).toBe("file\0name");
  });

  it("sanitizeFileName custom function", () => {
    const result = normalizeOutputOptions(
      { sanitizeFileName: (name) => name.replace(/x/g, "y") },
      getDefaultInputOptions(),
    );
    expect(result.sanitizeFileName("xfile")).toBe("yfile");
  });

  it("sourcemapIgnoreList defaults to node_modules check", () => {
    const result = normalizeOutputOptions({}, getDefaultInputOptions());
    expect(result.sourcemapIgnoreList("../node_modules/x.js", "map.js")).toBe(
      true,
    );
    expect(result.sourcemapIgnoreList("./src/x.js", "map.js")).toBe(false);
  });

  it("accepts all valid formats", () => {
    const formats = ["amd", "cjs", "es", "iife", "system", "umd"] as const;
    for (let i = 0; i < formats.length; i++) {
      const result = normalizeOutputOptions(
        { format: formats[i] },
        getDefaultInputOptions(),
      );
      expect(result.format).toBe(formats[i]);
    }
  });

  it("normalizes generatedCode with partial object", () => {
    const result = normalizeOutputOptions(
      { generatedCode: { arrowFunctions: true } },
      getDefaultInputOptions(),
    );
    expect(result.generatedCode.arrowFunctions).toBe(true);
    expect(result.generatedCode.constBindings).toBe(false);
  });

  it("normalizes output plugins with nested array", () => {
    const p1: OutputPlugin = { name: "p1" };
    const p2: OutputPlugin = { name: "p2" };
    const result = normalizeOutputPlugins([p1, [p2]]);
    expect(result.length).toBe(2);
  });

  it("normalizes output plugins with null/false entries", () => {
    const p1: OutputPlugin = { name: "p1" };
    const result = normalizeOutputPlugins([
      p1,
      null as unknown as OutputPlugin,
      false as unknown as OutputPlugin,
    ]);
    expect(result.length).toBe(1);
  });

  it("normalizes indent option false to true", () => {
    const result = normalizeOutputOptions(
      { indent: false },
      getDefaultInputOptions(),
    );
    expect(result.indent).toBe(true);
  });

  it("normalizes indent option string value", () => {
    const result = normalizeOutputOptions(
      { indent: "\t" },
      getDefaultInputOptions(),
    );
    expect(result.indent).toBe("\t");
  });
});
