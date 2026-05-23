/**
 * Tests for src/utils/error-codes.ts
 *
 * Verifies that all error/warning codes are string constants with
 * values matching their export names, and that no duplicate values exist.
 */
import { describe, it, expect } from "vitest";
import * as errorCodes from "../../../src/utils/error-codes.js";

/** All expected error code names. */
const EXPECTED_CODES: ReadonlyArray<string> = [
  "ADDON_ERROR",
  "ALREADY_CLOSED",
  "AMBIGUOUS_EXTERNAL_NAMESPACES",
  "ANONYMOUS_PLUGIN_CACHE",
  "ASSET_NOT_FINALISED",
  "ASSET_NOT_FOUND",
  "ASSET_SOURCE_ALREADY_SET",
  "ASSET_SOURCE_MISSING",
  "BAD_LOADER",
  "CANNOT_CALL_NAMESPACE",
  "CANNOT_EMIT_FROM_OPTIONS_HOOK",
  "CHUNK_NOT_GENERATED",
  "CHUNK_INVALID",
  "CIRCULAR_DEPENDENCY",
  "CIRCULAR_REEXPORT",
  "CYCLIC_CROSS_CHUNK_REEXPORT",
  "DEPRECATED_FEATURE",
  "DUPLICATE_PLUGIN_NAME",
  "EMPTY_BUNDLE",
  "EVAL",
  "EXTERNAL_MODULES_CANNOT_BE_INCLUDED_IN_MANUAL_CHUNKS",
  "EXTERNAL_MODULES_CANNOT_BE_TRANSFORMED_TO_MODULES",
  "EXTERNAL_SYNTHETIC_EXPORTS",
  "FILE_NAME_CONFLICT",
  "FILE_NOT_FOUND",
  "FIRST_SIDE_EFFECT",
  "ILLEGAL_IDENTIFIER_AS_NAME",
  "ILLEGAL_REASSIGNMENT",
  "INCONSISTENT_IMPORT_ASSERTIONS",
  "INVALID_CHUNK",
  "INVALID_EXPORT_OPTION",
  "INVALID_EXTERNAL_ID",
  "INVALID_IMPORT_ATTRIBUTE",
  "INVALID_LOG_POSITION",
  "INVALID_OPTION",
  "INVALID_PLUGIN_HOOK",
  "INVALID_ROLLUP_PHASE",
  "INVALID_SETASSETSOURCE",
  "INVALID_TLA_FORMAT",
  "MISSING_CONFIG",
  "MISSING_EXPORT",
  "MISSING_EXTERNAL_CONFIG",
  "MISSING_GLOBAL_NAME",
  "MISSING_IMPLICIT_DEPENDANT",
  "MISSING_NAME_OPTION_FOR_IIFE_EXPORT",
  "MISSING_NODE_BUILTINS",
  "MISSING_OPTION",
  "MIXED_EXPORTS",
  "MODULE_LEVEL_DIRECTIVE",
  "NAMESPACE_CONFLICT",
  "NO_TRANSFORM_MAP_OR_AST_WITHOUT_CODE",
  "OPTIMIZE_CHUNK_STATUS",
  "PARSE_ERROR",
  "PLUGIN_ERROR",
  "SHIMMED_EXPORT",
  "SOURCEMAP_BROKEN",
  "SOURCEMAP_ERROR",
  "SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT",
  "THIS_IS_UNDEFINED",
  "UNEXPECTED_NAMED_IMPORT",
  "UNKNOWN_OPTION",
  "UNRESOLVED_ENTRY",
  "UNRESOLVED_IMPORT",
  "UNUSED_EXTERNAL_IMPORT",
  "VALIDATION_ERROR",
] as const;

describe("error-codes", () => {
  it("exports the expected number of error codes", () => {
    const exportedKeys = Object.keys(errorCodes);
    expect(exportedKeys.length).toBe(EXPECTED_CODES.length);
  });

  it("exports all expected error code names", () => {
    const exportedKeys = Object.keys(errorCodes);
    for (const code of EXPECTED_CODES) {
      expect(exportedKeys).toContain(code);
    }
  });

  it("has no unexpected exports beyond the known codes", () => {
    const exportedKeys = Object.keys(errorCodes);
    for (const key of exportedKeys) {
      expect(EXPECTED_CODES).toContain(key);
    }
  });

  it("every code value is a string", () => {
    const entries = Object.entries(errorCodes);
    for (const [key, value] of entries) {
      expect(typeof value).toBe("string");
      // Suppress unused variable warning
      void key;
    }
  });

  it("every code value matches its export name", () => {
    const entries = Object.entries(errorCodes);
    for (const [key, value] of entries) {
      expect(value).toBe(key);
    }
  });

  it("has no duplicate code values", () => {
    const values = Object.values(errorCodes);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("every code value is non-empty", () => {
    const values = Object.values(errorCodes);
    for (const value of values) {
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("every code value contains only uppercase letters and underscores", () => {
    const values = Object.values(errorCodes);
    for (const value of values) {
      expect(value).toMatch(/^[A-Z_]+$/);
    }
  });

  it("individual codes have correct values", () => {
    expect(errorCodes.ADDON_ERROR).toBe("ADDON_ERROR");
    expect(errorCodes.PARSE_ERROR).toBe("PARSE_ERROR");
    expect(errorCodes.UNRESOLVED_IMPORT).toBe("UNRESOLVED_IMPORT");
    expect(errorCodes.CIRCULAR_DEPENDENCY).toBe("CIRCULAR_DEPENDENCY");
    expect(errorCodes.MISSING_EXPORT).toBe("MISSING_EXPORT");
    expect(errorCodes.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(errorCodes.EVAL).toBe("EVAL");
    expect(errorCodes.PLUGIN_ERROR).toBe("PLUGIN_ERROR");
    expect(errorCodes.EMPTY_BUNDLE).toBe("EMPTY_BUNDLE");
    expect(errorCodes.SOURCEMAP_ERROR).toBe("SOURCEMAP_ERROR");
  });

  it("exports at least 60 error codes", () => {
    const count = Object.keys(errorCodes).length;
    expect(count).toBeGreaterThanOrEqual(60);
  });
});
