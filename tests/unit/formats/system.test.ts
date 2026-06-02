/**
 * @module tests/unit/formats/system
 * @description Tests for SystemJS format output (#82).
 */

import { describe, expect, it } from "vitest";
import { systemFormat } from "../../../src/formats/system.js";
import type {
  ExportBinding,
  FormatOptions,
  ImportBinding,
} from "../../../src/formats/shared.js";

describe("formats/system", () => {
  describe("wrapChunk", () => {
    it("should wrap code in System.register", () => {
      const options: FormatOptions = { exports: "none" };
      const result = systemFormat.wrapChunk("const x = 1;", options);
      expect(result).toContain("System.register(");
      expect(result).toContain("_export");
      expect(result).toContain("_context");
    });

    it("should include dependency array", () => {
      const options: FormatOptions = {
        exports: "none",
        externalImports: [
          { source: "lodash", imported: "default", local: "_" },
        ],
      };
      const result = systemFormat.wrapChunk("", options);
      expect(result).toContain("['lodash']");
    });

    it("should deduplicate dependencies from same source", () => {
      const options: FormatOptions = {
        exports: "none",
        externalImports: [
          { source: "lodash", imported: "map", local: "map" },
          { source: "lodash", imported: "filter", local: "filter" },
        ],
      };
      const result = systemFormat.wrapChunk("", options);
      /* Should only appear once */
      const matches = result.match(/'lodash'/g);
      expect(matches).toHaveLength(1);
    });

    it("should generate setters for imports", () => {
      const options: FormatOptions = {
        exports: "none",
        externalImports: [{ source: "lodash", imported: "map", local: "map" }],
      };
      const result = systemFormat.wrapChunk("", options);
      expect(result).toContain("setters:");
      expect(result).toContain("function(module)");
      expect(result).toContain("map = module.map");
    });

    it("should handle namespace imports in setters", () => {
      const options: FormatOptions = {
        exports: "none",
        externalImports: [{ source: "lodash", imported: "*", local: "_" }],
      };
      const result = systemFormat.wrapChunk("", options);
      expect(result).toContain("_ = module;");
    });

    it("should include live export calls via _export", () => {
      const options: FormatOptions = {
        exports: "named",
        exportBindings: [{ exported: "foo", local: "foo" }],
      };
      const result = systemFormat.wrapChunk("const foo = 42;", options);
      expect(result).toContain("_export('foo', foo)");
    });

    it("should include multiple live export calls", () => {
      const options: FormatOptions = {
        exports: "named",
        exportBindings: [
          { exported: "a", local: "a" },
          { exported: "b", local: "b" },
        ],
      };
      const result = systemFormat.wrapChunk("", options);
      expect(result).toContain("_export('a', a)");
      expect(result).toContain("_export('b', b)");
    });

    it("should include execute function", () => {
      const options: FormatOptions = { exports: "none" };
      const result = systemFormat.wrapChunk("const x = 1;", options);
      expect(result).toContain("execute:");
    });

    it("should declare variables for imported bindings", () => {
      const options: FormatOptions = {
        exports: "none",
        externalImports: [
          { source: "lodash", imported: "default", local: "_" },
        ],
      };
      const result = systemFormat.wrapChunk("", options);
      expect(result).toContain("var _");
    });

    it("should include use strict by default", () => {
      const options: FormatOptions = { exports: "none" };
      const result = systemFormat.wrapChunk("", options);
      expect(result).toContain("'use strict'");
    });

    it("should handle empty setters array when no imports", () => {
      const options: FormatOptions = { exports: "none" };
      const result = systemFormat.wrapChunk("", options);
      expect(result).toContain("setters: []");
    });

    it("should handle systemNullSetters option", () => {
      const options: FormatOptions = {
        exports: "none",
        systemNullSetters: true,
        externalImports: [
          { source: "lodash", imported: "default", local: "_" },
        ],
      };
      const result = systemFormat.wrapChunk("", options);
      expect(result).toContain("setters:");
    });

    it("should omit use strict when strict is false", () => {
      const options: FormatOptions = { exports: "none", strict: false };
      const result = systemFormat.wrapChunk("", options);
      // With strict false, the strict directive should not appear
      const strictCount = (result.match(/'use strict'/g) ?? []).length;
      expect(strictCount).toBe(0);
    });
  });

  describe("getExternalImportCode", () => {
    it("should return empty string for no bindings", () => {
      const result = systemFormat.getExternalImportCode([]);
      expect(result).toBe("");
    });

    it("should generate comment with dependency names", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "lodash", imported: "default", local: "_" },
      ];
      const result = systemFormat.getExternalImportCode(bindings);
      expect(result).toContain("'lodash'");
    });

    it("should deduplicate sources in comment", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "lodash", imported: "map", local: "map" },
        { source: "lodash", imported: "filter", local: "filter" },
      ];
      const result = systemFormat.getExternalImportCode(bindings);
      const matches = result.match(/'lodash'/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe("getExportCode", () => {
    it("should return empty string for no bindings", () => {
      const result = systemFormat.getExportCode([]);
      expect(result).toBe("");
    });

    it("should generate _export calls", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: "foo", local: "foo" },
      ];
      const result = systemFormat.getExportCode(bindings);
      expect(result).toBe("_export('foo', foo);");
    });

    it("should generate multiple _export calls", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: "a", local: "a" },
        { exported: "b", local: "b" },
      ];
      const result = systemFormat.getExportCode(bindings);
      expect(result).toContain("_export('a', a);");
      expect(result).toContain("_export('b', b);");
    });
  });

  describe("wrapChunk with empty external imports", () => {
    it("should handle empty setters for external modules with systemNullSetters", () => {
      const options: FormatOptions = {
        exports: "named",
        externalImports: [],
        exportBindings: [{ exported: "x", local: "x" }],
      };
      const result = systemFormat.wrapChunk("const x = 1;", options);
      expect(result).toContain("System.register(");
    });

    it("should handle external imports with bindings", () => {
      const options: FormatOptions = {
        exports: "named",
        externalImports: [
          { source: "lodash", imported: "map", local: "map" },
        ] as ReadonlyArray<ImportBinding>,
        exportBindings: [{ exported: "result", local: "result" }],
      };
      const result = systemFormat.wrapChunk(
        "const result = map([1,2], x => x);",
        options,
      );
      expect(result).toContain("System.register(");
      expect(result).toContain("lodash");
    });
  });
});
