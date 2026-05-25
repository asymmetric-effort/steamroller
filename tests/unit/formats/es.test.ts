/**
 * @module tests/unit/formats/es
 * @description Tests for ES module format output (#73).
 */

import { describe, expect, it } from "vitest";
import { esFormat } from "../../../src/formats/es.js";
import type {
  ExportBinding,
  FormatOptions,
  ImportBinding,
} from "../../../src/formats/shared.js";

describe("formats/es", () => {
  describe("wrapChunk", () => {
    it("should pass code through without wrapping", () => {
      const options: FormatOptions = { exports: "named" };
      const result = esFormat.wrapChunk("const x = 1;", options);
      expect(result).toBe("const x = 1;");
    });

    it("should not add strict mode directive", () => {
      const options: FormatOptions = { exports: "named", strict: true };
      const result = esFormat.wrapChunk("const x = 1;", options);
      expect(result).not.toContain("'use strict'");
    });

    it("should preserve top-level await", () => {
      const code = 'const data = await fetch("/api");';
      const options: FormatOptions = { exports: "named" };
      const result = esFormat.wrapChunk(code, options);
      expect(result).toBe(code);
    });

    it("should handle empty code", () => {
      const options: FormatOptions = { exports: "none" };
      const result = esFormat.wrapChunk("", options);
      expect(result).toBe("");
    });
  });

  describe("getExternalImportCode", () => {
    it("should return empty string for no bindings", () => {
      const result = esFormat.getExternalImportCode([]);
      expect(result).toBe("");
    });

    it("should generate default import statement", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "./utils", imported: "default", local: "utils" },
      ];
      const result = esFormat.getExternalImportCode(bindings);
      expect(result).toBe("import utils from './utils';");
    });

    it("should generate namespace import statement", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "lodash", imported: "*", local: "_" },
      ];
      const result = esFormat.getExternalImportCode(bindings);
      expect(result).toBe("import * as _ from 'lodash';");
    });

    it("should generate named import with same name", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "./helpers", imported: "foo", local: "foo" },
      ];
      const result = esFormat.getExternalImportCode(bindings);
      expect(result).toBe("import { foo } from './helpers';");
    });

    it("should generate renamed named import", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "./helpers", imported: "foo", local: "bar" },
      ];
      const result = esFormat.getExternalImportCode(bindings);
      expect(result).toBe("import { foo as bar } from './helpers';");
    });

    it("should generate multiple imports from same source", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "./utils", imported: "a", local: "a" },
        { source: "./utils", imported: "b", local: "b" },
      ];
      const result = esFormat.getExternalImportCode(bindings);
      expect(result).toContain("import { a } from './utils';");
      expect(result).toContain("import { b } from './utils';");
    });

    it("should handle multiple sources", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "./a", imported: "default", local: "a" },
        { source: "./b", imported: "foo", local: "foo" },
      ];
      const result = esFormat.getExternalImportCode(bindings);
      expect(result).toContain("import a from './a';");
      expect(result).toContain("import { foo } from './b';");
    });
  });

  describe("getExportCode", () => {
    it("should return empty string for no bindings", () => {
      const result = esFormat.getExportCode([]);
      expect(result).toBe("");
    });

    it("should generate default export", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: "default", local: "myFunc" },
      ];
      const result = esFormat.getExportCode(bindings);
      expect(result).toBe("export default myFunc;");
    });

    it("should generate named export with same name", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: "foo", local: "foo" },
      ];
      const result = esFormat.getExportCode(bindings);
      expect(result).toBe("export { foo };");
    });

    it("should generate renamed export", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: "bar", local: "foo" },
      ];
      const result = esFormat.getExportCode(bindings);
      expect(result).toBe("export { foo as bar };");
    });

    it("should generate multiple exports", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: "a", local: "a" },
        { exported: "b", local: "b" },
      ];
      const result = esFormat.getExportCode(bindings);
      expect(result).toBe("export { a };\nexport { b };");
    });
  });
});
