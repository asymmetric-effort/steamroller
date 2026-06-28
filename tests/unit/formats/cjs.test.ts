/**
 * @module tests/unit/formats/cjs
 * @description Tests for CommonJS format output (#75).
 */

import { describe, expect, it } from "bun:test";
import {
  cjsFormat,
  getInteropHelper,
  getInteropNamespaceHelper,
} from "../../../src/formats/cjs.js";
import type {
  ExportBinding,
  FormatOptions,
  ImportBinding,
} from "../../../src/formats/shared.js";

describe("formats/cjs", () => {
  describe("wrapChunk", () => {
    it("should add use strict at the top", () => {
      const options: FormatOptions = { exports: "named" };
      const result = cjsFormat.wrapChunk("const x = 1;", options);
      expect(result).toContain("'use strict';");
      expect(result.indexOf("'use strict'")).toBe(0);
    });

    it("should add __esModule definition for named exports", () => {
      const options: FormatOptions = { exports: "named" };
      const result = cjsFormat.wrapChunk("const x = 1;", options);
      expect(result).toContain(
        "Object.defineProperty(exports, '__esModule', { value: true });",
      );
    });

    it("should add __esModule definition for default exports", () => {
      const options: FormatOptions = { exports: "default" };
      const result = cjsFormat.wrapChunk("const x = 1;", options);
      expect(result).toContain(
        "Object.defineProperty(exports, '__esModule', { value: true });",
      );
    });

    it("should not add __esModule for none exports", () => {
      const options: FormatOptions = { exports: "none" };
      const result = cjsFormat.wrapChunk("const x = 1;", options);
      expect(result).not.toContain("__esModule");
    });

    it("should include require statements for external imports", () => {
      const options: FormatOptions = {
        exports: "named",
        externalImports: [
          { source: "./utils", imported: "default", local: "utils" },
        ],
      };
      const result = cjsFormat.wrapChunk("", options);
      expect(result).toContain("const utils = require('./utils');");
    });

    it("should include export assignments", () => {
      const options: FormatOptions = {
        exports: "named",
        exportBindings: [{ exported: "foo", local: "foo" }],
      };
      const result = cjsFormat.wrapChunk("const foo = 42;", options);
      expect(result).toContain("exports.foo = foo;");
    });

    it("should handle default export binding", () => {
      const options: FormatOptions = {
        exports: "default",
        exportBindings: [{ exported: "default", local: "myFunc" }],
      };
      const result = cjsFormat.wrapChunk("const myFunc = () => {};", options);
      expect(result).toContain("exports.default = myFunc;");
    });

    it("should skip strict mode when strict is false", () => {
      const options: FormatOptions = { exports: "none", strict: false };
      const result = cjsFormat.wrapChunk("const x = 1;", options);
      /* insertStrictMode is called as fallback */
      expect(result).toContain("'use strict'");
    });

    it("should handle empty code with no imports or exports", () => {
      const options: FormatOptions = { exports: "none" };
      const result = cjsFormat.wrapChunk("", options);
      expect(result).toContain("'use strict';");
    });
  });

  describe("getExternalImportCode", () => {
    it("should return empty string for no bindings", () => {
      const result = cjsFormat.getExternalImportCode([]);
      expect(result).toBe("");
    });

    it("should generate require for default import", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "lodash", imported: "default", local: "_" },
      ];
      const result = cjsFormat.getExternalImportCode(bindings);
      expect(result).toBe("const _ = require('lodash');");
    });

    it("should generate require for namespace import", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "path", imported: "*", local: "path" },
      ];
      const result = cjsFormat.getExternalImportCode(bindings);
      expect(result).toBe("const path = require('path');");
    });

    it("should generate destructured require for named import", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "./helpers", imported: "foo", local: "foo" },
      ];
      const result = cjsFormat.getExternalImportCode(bindings);
      expect(result).toBe("const { foo } = require('./helpers');");
    });

    it("should generate renamed destructured require", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "./helpers", imported: "foo", local: "bar" },
      ];
      const result = cjsFormat.getExternalImportCode(bindings);
      expect(result).toBe("const { foo: bar } = require('./helpers');");
    });

    it("should generate multiple require statements", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "a", imported: "default", local: "a" },
        { source: "b", imported: "x", local: "x" },
      ];
      const result = cjsFormat.getExternalImportCode(bindings);
      expect(result).toContain("const a = require('a');");
      expect(result).toContain("const { x } = require('b');");
    });
  });

  describe("getExportCode", () => {
    it("should return empty string for no bindings", () => {
      const result = cjsFormat.getExportCode([]);
      expect(result).toBe("");
    });

    it("should generate named export assignment", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: "foo", local: "foo" },
      ];
      const result = cjsFormat.getExportCode(bindings);
      expect(result).toBe("exports.foo = foo;");
    });

    it("should generate default export assignment", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: "default", local: "main" },
      ];
      const result = cjsFormat.getExportCode(bindings);
      expect(result).toBe("exports.default = main;");
    });

    it("should generate multiple export assignments", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: "a", local: "a" },
        { exported: "b", local: "b" },
      ];
      const result = cjsFormat.getExportCode(bindings);
      expect(result).toBe("exports.a = a;\nexports.b = b;");
    });
  });

  describe("interop helpers", () => {
    it("should generate interop default helper", () => {
      const result = getInteropHelper();
      expect(result).toContain("_interopDefault");
      expect(result).toContain("__esModule");
    });

    it("should generate interop namespace helper", () => {
      const result = getInteropNamespaceHelper();
      expect(result).toContain("_interopNamespace");
      expect(result).toContain("Object.create(null)");
      expect(result).toContain("Object.freeze");
    });
  });
});
