/**
 * @module tests/unit/module/synthetic-exports
 * @description Unit tests for syntheticNamedExports resolution, validation,
 * and code generation utilities.
 */

import { describe, expect, it } from "bun:test";

import {
  generateSyntheticAccess,
  getFallbackExportName,
  resolveSyntheticExport,
  validateSyntheticExports,
} from "../../../src/module/synthetic-exports.js";
import {
  EXTERNAL_SYNTHETIC_EXPORTS,
  SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT,
} from "../../../src/utils/error-codes.js";

describe("getFallbackExportName", () => {
  it("returns 'default' when syntheticNamedExports is true", () => {
    expect(getFallbackExportName(true)).toBe("default");
  });

  it("returns the string value when syntheticNamedExports is a string", () => {
    expect(getFallbackExportName("__module")).toBe("__module");
  });

  it("returns the string value for empty string", () => {
    expect(getFallbackExportName("")).toBe("");
  });

  it("returns null when syntheticNamedExports is false", () => {
    expect(getFallbackExportName(false)).toBeNull();
  });

  it("returns the provided custom namespace name", () => {
    expect(getFallbackExportName("namespace")).toBe("namespace");
  });
});

describe("resolveSyntheticExport", () => {
  it("returns null if the module actually exports the requested name", () => {
    const result = resolveSyntheticExport(
      "foo",
      ["foo", "bar", "default"],
      true,
    );
    expect(result).toBeNull();
  });

  it("returns null when syntheticNamedExports is false", () => {
    const result = resolveSyntheticExport("foo", ["default"], false);
    expect(result).toBeNull();
  });

  it("returns a resolution when the name is not exported and fallback exists", () => {
    const result = resolveSyntheticExport("foo", ["default", "bar"], true);
    expect(result).toEqual({
      type: "synthetic",
      fallbackExport: "default",
      requestedName: "foo",
    });
  });

  it("uses a custom fallback name from string config", () => {
    const result = resolveSyntheticExport("baz", ["__module"], "__module");
    expect(result).toEqual({
      type: "synthetic",
      fallbackExport: "__module",
      requestedName: "baz",
    });
  });

  it("returns null if the fallback export does not exist in module exports", () => {
    const result = resolveSyntheticExport("foo", ["bar", "baz"], true);
    expect(result).toBeNull();
  });

  it("returns null if the fallback export name is not in the exports array", () => {
    const result = resolveSyntheticExport("foo", ["bar"], "missing");
    expect(result).toBeNull();
  });

  it("returns resolution with type 'synthetic'", () => {
    const result = resolveSyntheticExport("x", ["default"], true);
    expect(result?.type).toBe("synthetic");
  });

  it("handles empty exports array", () => {
    const result = resolveSyntheticExport("foo", [], true);
    expect(result).toBeNull();
  });

  it("handles empty string fallback export name", () => {
    const result = resolveSyntheticExport("foo", [""], "");
    expect(result).toEqual({
      type: "synthetic",
      fallbackExport: "",
      requestedName: "foo",
    });
  });
});

describe("validateSyntheticExports", () => {
  it("returns null when syntheticNamedExports is false", () => {
    const result = validateSyntheticExports("./mod", false, ["default"], false);
    expect(result).toBeNull();
  });

  it("returns an error for external modules with syntheticNamedExports", () => {
    const result = validateSyntheticExports("lodash", true, ["default"], true);
    expect(result).toEqual({
      code: EXTERNAL_SYNTHETIC_EXPORTS,
      message: "External module 'lodash' cannot have syntheticNamedExports",
    });
  });

  it("returns an error for external modules with string syntheticNamedExports", () => {
    const result = validateSyntheticExports(
      "lodash",
      "__module",
      ["__module"],
      true,
    );
    expect(result).toEqual({
      code: EXTERNAL_SYNTHETIC_EXPORTS,
      message: "External module 'lodash' cannot have syntheticNamedExports",
    });
  });

  it("returns an error when the fallback export is missing", () => {
    const result = validateSyntheticExports(
      "./mod",
      true,
      ["foo", "bar"],
      false,
    );
    expect(result).toEqual({
      code: SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT,
      message:
        "Module './mod' has syntheticNamedExports set to 'default' but does not export 'default'",
    });
  });

  it("returns an error when custom fallback export is missing", () => {
    const result = validateSyntheticExports(
      "./mod",
      "__ns",
      ["default", "foo"],
      false,
    );
    expect(result).toEqual({
      code: SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT,
      message:
        "Module './mod' has syntheticNamedExports set to '__ns' but does not export '__ns'",
    });
  });

  it("returns null when configuration is valid with true", () => {
    const result = validateSyntheticExports(
      "./mod",
      true,
      ["default", "foo"],
      false,
    );
    expect(result).toBeNull();
  });

  it("returns null when configuration is valid with custom string", () => {
    const result = validateSyntheticExports(
      "./mod",
      "__ns",
      ["__ns", "foo"],
      false,
    );
    expect(result).toBeNull();
  });

  it("returns null for empty string syntheticNamedExports (falsy)", () => {
    const result = validateSyntheticExports("./mod", "", ["default"], false);
    expect(result).toBeNull();
  });

  it("includes moduleId in error messages", () => {
    const result = validateSyntheticExports(
      "/path/to/module.js",
      true,
      [],
      true,
    );
    expect(result?.message).toContain("/path/to/module.js");
  });
});

describe("generateSyntheticAccess", () => {
  it("produces correct property access for simple names", () => {
    expect(generateSyntheticAccess("mod_default", "foo")).toBe(
      "mod_default.foo",
    );
  });

  it("produces correct property access for underscore names", () => {
    expect(generateSyntheticAccess("_ns", "_private")).toBe("_ns._private");
  });

  it("produces correct property access with dollar sign names", () => {
    expect(generateSyntheticAccess("$mod", "$value")).toBe("$mod.$value");
  });

  it("handles single character names", () => {
    expect(generateSyntheticAccess("a", "b")).toBe("a.b");
  });

  it("handles longer binding and property names", () => {
    expect(
      generateSyntheticAccess("myModule_namespace", "someExportedValue"),
    ).toBe("myModule_namespace.someExportedValue");
  });
});
