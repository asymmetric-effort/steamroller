/**
 * Error code parity tests.
 *
 * Verifies that all exported error codes are string constants,
 * match rollup's known codes, and that error construction utilities
 * produce correctly structured output.
 *
 * @module tests/unit/error-parity.test
 */

import { describe, it, expect } from "bun:test";
import * as errorCodes from "../../src/utils/error-codes.js";
import {
  createRollupError,
  createRollupWarning,
  generateCodeFrame,
} from "../../src/utils/errors.js";

/** Reference list of rollup's known error codes for parity verification. */
const ROLLUP_KNOWN_CODES: ReadonlyArray<string> = [
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
];

describe("error code parity", () => {
  const exportedEntries = Object.entries(errorCodes);
  const exportedValues = Object.values(errorCodes);

  describe("structural validation", () => {
    it("should export at least one error code", () => {
      expect(exportedEntries.length).toBeGreaterThan(0);
    });

    it("should export only string constants", () => {
      for (let i = 0; i < exportedEntries.length; i++) {
        const [key, value] = exportedEntries[i];
        expect(typeof value).toBe("string");
        expect(value).toBe(key);
      }
    });

    it("should have no duplicate error code values", () => {
      const seen = new Set<string>();
      for (let i = 0; i < exportedValues.length; i++) {
        const value = exportedValues[i];
        expect(seen.has(value)).toBe(false);
        seen.add(value);
      }
    });

    it("should use UPPER_SNAKE_CASE format", () => {
      const pattern = /^[A-Z][A-Z0-9_]*$/;
      for (let i = 0; i < exportedEntries.length; i++) {
        const [key] = exportedEntries[i];
        expect(pattern.test(key)).toBe(true);
      }
    });

    it("should have the export name match its value", () => {
      for (let i = 0; i < exportedEntries.length; i++) {
        const [key, value] = exportedEntries[i];
        expect(value).toBe(key);
      }
    });
  });

  describe("rollup parity", () => {
    it("should include all known rollup error codes", () => {
      const ourCodes = new Set(exportedValues);
      const missing: string[] = [];

      for (let i = 0; i < ROLLUP_KNOWN_CODES.length; i++) {
        if (!ourCodes.has(ROLLUP_KNOWN_CODES[i])) {
          missing.push(ROLLUP_KNOWN_CODES[i]);
        }
      }

      expect(missing).toEqual([]);
    });

    it("should have exact count matching known codes", () => {
      expect(exportedEntries.length).toBe(ROLLUP_KNOWN_CODES.length);
    });
  });

  describe("createRollupError", () => {
    it("should produce error with code and message", () => {
      const error = createRollupError(
        errorCodes.PARSE_ERROR,
        "Unexpected token",
      );

      expect(error.code).toBe("PARSE_ERROR");
      expect(error.message).toBe("Unexpected token");
    });

    it("should include optional properties", () => {
      const error = createRollupError(
        errorCodes.FILE_NOT_FOUND,
        "File missing",
        { id: "/path/to/file.js", plugin: "test-plugin" },
      );

      expect(error.code).toBe("FILE_NOT_FOUND");
      expect(error.id).toBe("/path/to/file.js");
      expect(error.plugin).toBe("test-plugin");
    });

    it("should produce error for each known code", () => {
      for (let i = 0; i < exportedEntries.length; i++) {
        const [, code] = exportedEntries[i];
        const error = createRollupError(code, `Test message for ${code}`);
        expect(error.code).toBe(code);
        expect(error.message).toContain(code);
      }
    });

    it("should include location info when provided", () => {
      const error = createRollupError(
        errorCodes.PARSE_ERROR,
        "Unexpected token",
        {
          loc: { file: "test.js", line: 5, column: 10 },
          pos: 42,
        },
      );

      expect(error.loc?.line).toBe(5);
      expect(error.loc?.column).toBe(10);
      expect(error.pos).toBe(42);
    });
  });

  describe("createRollupWarning", () => {
    it("should produce warning with code and message", () => {
      const warning = createRollupWarning(
        errorCodes.CIRCULAR_DEPENDENCY,
        "Circular dependency detected",
      );

      expect(warning.code).toBe("CIRCULAR_DEPENDENCY");
      expect(warning.message).toBe("Circular dependency detected");
    });

    it("should include optional properties", () => {
      const warning = createRollupWarning(
        errorCodes.UNUSED_EXTERNAL_IMPORT,
        "Unused import",
        { exporter: "lodash", reexporter: "utils.js" },
      );

      expect(warning.exporter).toBe("lodash");
      expect(warning.reexporter).toBe("utils.js");
    });
  });

  describe("generateCodeFrame", () => {
    const source = "const x = 1;\nconst y = 2;\nconst z = 3;\nreturn x + y;";

    it("should produce a code frame with marker on error line", () => {
      const frame = generateCodeFrame(source, 2, 6);

      expect(frame).toContain(">");
      expect(frame).toContain("^");
      expect(frame).toContain("const y = 2;");
    });

    it("should include context lines", () => {
      const frame = generateCodeFrame(source, 2, 0, 1);

      expect(frame).toContain("const x = 1;");
      expect(frame).toContain("const y = 2;");
      expect(frame).toContain("const z = 3;");
    });

    it("should handle first line", () => {
      const frame = generateCodeFrame(source, 1, 0);

      expect(frame).toContain("const x = 1;");
      expect(frame).toContain(">");
    });

    it("should handle last line", () => {
      const frame = generateCodeFrame(source, 4, 0);

      expect(frame).toContain("return x + y;");
      expect(frame).toContain(">");
    });

    it("should handle single-line source", () => {
      const frame = generateCodeFrame("single line", 1, 3);

      expect(frame).toContain("single line");
      expect(frame).toContain("^");
    });

    it("should respect custom context lines parameter", () => {
      const longSource =
        "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9";
      const frame = generateCodeFrame(longSource, 5, 0, 0);

      expect(frame).toContain("line5");
      expect(frame).not.toContain("line3");
      expect(frame).not.toContain("line7");
    });
  });
});
