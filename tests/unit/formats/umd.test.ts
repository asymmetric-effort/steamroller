/**
 * @module tests/unit/formats/umd
 * @description Tests for UMD format output (#77).
 */

import { describe, expect, it } from "bun:test";
import { umdFormat } from "../../../src/formats/umd.js";
import type {
  ExportBinding,
  FormatOptions,
  ImportBinding,
} from "../../../src/formats/shared.js";

describe("formats/umd", () => {
  describe("wrapChunk", () => {
    it("should generate tri-format detection wrapper", () => {
      const options: FormatOptions = { exports: "named", name: "MyLib" };
      const result = umdFormat.wrapChunk("const x = 1;", options);
      expect(result).toContain("typeof define === 'function' && define.amd");
      expect(result).toContain("typeof exports === 'object'");
      expect(result).toContain("typeof module");
      expect(result).toContain("globalThis");
    });

    it("should use provided name for global", () => {
      const options: FormatOptions = { exports: "named", name: "MyModule" };
      const result = umdFormat.wrapChunk("", options);
      expect(result).toContain("global.MyModule");
    });

    it("should default name to module", () => {
      const options: FormatOptions = { exports: "named" };
      const result = umdFormat.wrapChunk("", options);
      expect(result).toContain("global.module");
    });

    it("should include AMD define call", () => {
      const options: FormatOptions = { exports: "named", name: "MyLib" };
      const result = umdFormat.wrapChunk("", options);
      expect(result).toContain("define(");
    });

    it("should include AMD id when specified", () => {
      const options: FormatOptions = {
        exports: "named",
        name: "MyLib",
        amd: { id: "my-lib" },
      };
      const result = umdFormat.wrapChunk("", options);
      expect(result).toContain("'my-lib'");
    });

    it("should use custom define function name", () => {
      const options: FormatOptions = {
        exports: "named",
        name: "MyLib",
        amd: { define: "customDefine" },
      };
      const result = umdFormat.wrapChunk("", options);
      expect(result).toContain("customDefine");
      expect(result).toContain("typeof customDefine === 'function'");
    });

    it("should include use strict by default", () => {
      const options: FormatOptions = { exports: "named", name: "MyLib" };
      const result = umdFormat.wrapChunk("", options);
      expect(result).toContain("'use strict';");
    });

    it("should omit strict when strict is false", () => {
      const options: FormatOptions = {
        exports: "named",
        name: "MyLib",
        strict: false,
      };
      const result = umdFormat.wrapChunk("", options);
      expect(result).not.toContain("'use strict'");
    });

    it("should handle external imports in all three patterns", () => {
      const options: FormatOptions = {
        exports: "named",
        name: "MyLib",
        externalImports: [
          { source: "lodash", imported: "default", local: "_" },
        ],
        globals: { lodash: "_" },
      };
      const result = umdFormat.wrapChunk("", options);
      /* AMD: dependency array */
      expect(result).toContain("'lodash'");
      /* CJS: require */
      expect(result).toContain("require('lodash')");
      /* Global: global reference */
      expect(result).toContain("global._");
    });

    it("should include return statement for exports", () => {
      const options: FormatOptions = {
        exports: "named",
        name: "MyLib",
        exportBindings: [{ exported: "foo", local: "foo" }],
      };
      const result = umdFormat.wrapChunk("const foo = 1;", options);
      expect(result).toContain("return");
      expect(result).toContain("foo");
    });

    it("should return single value for default export", () => {
      const options: FormatOptions = {
        exports: "default",
        name: "MyLib",
        exportBindings: [{ exported: "default", local: "val" }],
      };
      const result = umdFormat.wrapChunk("const val = 42;", options);
      expect(result).toContain("return val;");
    });

    it("should handle renamed export bindings in return block", () => {
      const options: FormatOptions = {
        exports: "named",
        name: "MyLib",
        exportBindings: [
          { exported: "bar", local: "foo" },
          { exported: "baz", local: "qux" },
        ],
      };
      const result = umdFormat.wrapChunk("const foo = 1;", options);
      expect(result).toContain("bar: foo");
      expect(result).toContain("baz: qux");
    });

    it("should fallback global name when not in globals map", () => {
      const options: FormatOptions = {
        exports: "named",
        name: "MyLib",
        externalImports: [
          { source: "my-lib", imported: "default", local: "myLib" },
        ],
      };
      const result = umdFormat.wrapChunk("", options);
      expect(result).toContain("global.my_lib");
    });

    it("should force .js extension for imports when configured", () => {
      const options: FormatOptions = {
        exports: "named",
        name: "MyLib",
        amd: { forceJsExtensionForImports: true },
        externalImports: [
          { source: "lodash", imported: "default", local: "_" },
        ],
        globals: { lodash: "_" },
      };
      const result = umdFormat.wrapChunk("", options);
      expect(result).toContain("'lodash.js'");
    });
  });

  describe("getExternalImportCode", () => {
    it("should return empty string for no bindings", () => {
      const result = umdFormat.getExternalImportCode([]);
      expect(result).toBe("");
    });

    it("should generate comment with dependency names", () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: "lodash", imported: "default", local: "_" },
      ];
      const result = umdFormat.getExternalImportCode(bindings);
      expect(result).toContain("'lodash'");
    });
  });

  describe("getExportCode", () => {
    it("should return empty string for no bindings", () => {
      const result = umdFormat.getExportCode([]);
      expect(result).toBe("");
    });

    it("should generate exports assignments", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: "foo", local: "foo" },
        { exported: "bar", local: "baz" },
      ];
      const result = umdFormat.getExportCode(bindings);
      expect(result).toContain("exports.foo = foo;");
      expect(result).toContain("exports.bar = baz;");
    });
  });
});
