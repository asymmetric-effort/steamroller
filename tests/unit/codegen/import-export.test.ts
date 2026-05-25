/**
 * @module tests/unit/codegen/import-export
 * @description Unit tests for format-specific import/export rewriting utilities.
 */

import { describe, expect, it } from "vitest";
import {
  generateEsModuleMarker,
  generateExportCode,
  generateImportCode,
  generateNamespaceObject,
} from "../../../src/codegen/import-export.js";
import type {
  ExportBinding,
  ImportBinding,
  RewriteOptions,
} from "../../../src/codegen/import-export.js";

const baseOptions: RewriteOptions = {
  format: "es",
  esModule: false,
  externalLiveBindings: true,
  freeze: true,
  interop: "auto",
  constBindings: true,
};

describe("codegen/import-export", () => {
  describe("generateImportCode", () => {
    describe("ES format", () => {
      const options: RewriteOptions = { ...baseOptions, format: "es" };

      it("generates default import", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          {
            source: "lodash",
            imported: "default",
            local: "_",
            type: "default",
          },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("import _ from 'lodash';");
      });

      it("generates named imports", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "utils", imported: "foo", local: "foo", type: "named" },
          { source: "utils", imported: "bar", local: "baz", type: "named" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("import { foo, bar as baz } from 'utils';");
      });

      it("generates namespace import", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "React", imported: "*", local: "React", type: "namespace" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("import * as React from 'React';");
      });

      it("generates combined default and named imports", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "mod", imported: "default", local: "def", type: "default" },
          { source: "mod", imported: "named1", local: "named1", type: "named" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("import def, { named1 } from 'mod';");
      });

      it("handles multiple sources", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "a", imported: "x", local: "x", type: "named" },
          { source: "b", imported: "y", local: "y", type: "named" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toContain("import { x } from 'a';");
        expect(result).toContain("import { y } from 'b';");
      });

      it("returns empty string for empty bindings", () => {
        const result = generateImportCode([], options);
        expect(result).toBe("");
      });
    });

    describe("CJS format", () => {
      const options: RewriteOptions = { ...baseOptions, format: "cjs" };

      it("generates require for named imports", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "utils", imported: "foo", local: "foo", type: "named" },
          { source: "utils", imported: "bar", local: "baz", type: "named" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("const { foo, bar: baz } = require('utils');");
      });

      it("generates require for default import with .default access", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          {
            source: "lodash",
            imported: "default",
            local: "_",
            type: "default",
          },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("const _ = require('lodash').default;");
      });

      it("generates require for default import with defaultOnly interop", () => {
        const opts: RewriteOptions = { ...options, interop: "defaultOnly" };
        const bindings: ReadonlyArray<ImportBinding> = [
          {
            source: "lodash",
            imported: "default",
            local: "_",
            type: "default",
          },
        ];
        const result = generateImportCode(bindings, opts);
        expect(result).toBe("const _ = require('lodash');");
      });

      it("generates require for namespace import", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "fs", imported: "*", local: "fs", type: "namespace" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("const fs = require('fs');");
      });

      it("uses var when constBindings is false", () => {
        const opts: RewriteOptions = { ...options, constBindings: false };
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "x", imported: "a", local: "a", type: "named" },
        ];
        const result = generateImportCode(bindings, opts);
        expect(result).toBe("var { a } = require('x');");
      });

      it("returns empty string for empty bindings", () => {
        const result = generateImportCode([], options);
        expect(result).toBe("");
      });

      it("handles multiple sources with different binding types", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          {
            source: "a",
            imported: "default",
            local: "aDefault",
            type: "default",
          },
          { source: "a", imported: "foo", local: "foo", type: "named" },
          { source: "b", imported: "*", local: "bAll", type: "namespace" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toContain("const aDefault = require('a').default;");
        expect(result).toContain("const { foo } = require('a');");
        expect(result).toContain("const bAll = require('b');");
      });
    });

    describe("IIFE/UMD format", () => {
      const options: RewriteOptions = { ...baseOptions, format: "iife" };

      it("generates global access for named imports", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "myLib", imported: "foo", local: "foo", type: "named" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("const foo = globalThis.myLib.foo;");
      });

      it("generates global access for default imports", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          {
            source: "myLib",
            imported: "default",
            local: "lib",
            type: "default",
          },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("const lib = globalThis.myLib.default;");
      });

      it("generates global access for namespace imports", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "myLib", imported: "*", local: "lib", type: "namespace" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("const lib = globalThis.myLib;");
      });

      it("sanitizes source names for global access", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          {
            source: "@scope/my-lib",
            imported: "foo",
            local: "foo",
            type: "named",
          },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("const foo = globalThis.scope_my_lib.foo;");
      });

      it("uses var when constBindings is false", () => {
        const opts: RewriteOptions = { ...options, constBindings: false };
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "lib", imported: "x", local: "x", type: "named" },
        ];
        const result = generateImportCode(bindings, opts);
        expect(result).toBe("var x = globalThis.lib.x;");
      });

      it("falls back to _module for sources that sanitize to empty string", () => {
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "---", imported: "x", local: "x", type: "named" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("const x = globalThis._module.x;");
      });

      it("UMD format uses same logic as IIFE", () => {
        const umdOpts: RewriteOptions = { ...baseOptions, format: "umd" };
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "lib", imported: "x", local: "x", type: "named" },
        ];
        const result = generateImportCode(bindings, umdOpts);
        expect(result).toBe("const x = globalThis.lib.x;");
      });

      it("returns empty string for empty bindings", () => {
        const result = generateImportCode([], options);
        expect(result).toBe("");
      });
    });

    describe("AMD format", () => {
      it("returns empty string (AMD uses define() deps array)", () => {
        const options: RewriteOptions = { ...baseOptions, format: "amd" };
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "lib", imported: "x", local: "x", type: "named" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("");
      });
    });

    describe("SystemJS format", () => {
      it("returns empty string (SystemJS uses setters)", () => {
        const options: RewriteOptions = { ...baseOptions, format: "system" };
        const bindings: ReadonlyArray<ImportBinding> = [
          { source: "lib", imported: "x", local: "x", type: "named" },
        ];
        const result = generateImportCode(bindings, options);
        expect(result).toBe("");
      });
    });
  });

  describe("generateExportCode", () => {
    describe("ES format", () => {
      const options: RewriteOptions = { ...baseOptions, format: "es" };

      it("generates named exports", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "foo", exported: "foo", type: "named" },
          { local: "bar", exported: "baz", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("export { foo, bar as baz };");
      });

      it("generates default export", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "myVal", exported: "default", type: "default" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("export default myVal;");
      });

      it("generates combined default and named exports", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "main", exported: "default", type: "default" },
          { local: "helper", exported: "helper", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toContain("export default main;");
        expect(result).toContain("export { helper };");
      });

      it("returns empty string for empty bindings", () => {
        const result = generateExportCode([], options);
        expect(result).toBe("");
      });
    });

    describe("CJS format with live bindings", () => {
      const options: RewriteOptions = {
        ...baseOptions,
        format: "cjs",
        externalLiveBindings: true,
      };

      it("generates Object.defineProperty for named exports", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "foo", exported: "foo", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe(
          "Object.defineProperty(exports, 'foo', { enumerable: true, get: function() { return foo; } });",
        );
      });

      it("generates Object.defineProperty for default export", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "myDefault", exported: "default", type: "default" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe(
          "Object.defineProperty(exports, 'default', { enumerable: true, get: function() { return myDefault; } });",
        );
      });

      it("generates multiple defineProperty calls", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "a", exported: "a", type: "named" },
          { local: "b", exported: "b", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        const lines = result.split("\n");
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain("'a'");
        expect(lines[1]).toContain("'b'");
      });
    });

    describe("CJS format without live bindings", () => {
      const options: RewriteOptions = {
        ...baseOptions,
        format: "cjs",
        externalLiveBindings: false,
      };

      it("generates simple assignment for named exports", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "foo", exported: "foo", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("exports.foo = foo;");
      });

      it("generates simple assignment for default export", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "myDefault", exported: "default", type: "default" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("exports.default = myDefault;");
      });

      it("generates multiple assignments", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "x", exported: "x", type: "named" },
          { local: "y", exported: "y", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("exports.x = x;\nexports.y = y;");
      });

      it("returns empty string for empty bindings", () => {
        const result = generateExportCode([], options);
        expect(result).toBe("");
      });
    });

    describe("IIFE/UMD format", () => {
      it("generates live binding exports for IIFE", () => {
        const options: RewriteOptions = {
          ...baseOptions,
          format: "iife",
          externalLiveBindings: true,
        };
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "foo", exported: "foo", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toContain("Object.defineProperty(exports, 'foo'");
      });

      it("generates simple assignment exports for IIFE without live bindings", () => {
        const options: RewriteOptions = {
          ...baseOptions,
          format: "iife",
          externalLiveBindings: false,
        };
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "foo", exported: "foo", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("exports.foo = foo;");
      });

      it("UMD format uses same logic as IIFE", () => {
        const options: RewriteOptions = {
          ...baseOptions,
          format: "umd",
          externalLiveBindings: false,
        };
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "bar", exported: "bar", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("exports.bar = bar;");
      });

      it("generates export for default type in IIFE", () => {
        const options: RewriteOptions = {
          ...baseOptions,
          format: "iife",
          externalLiveBindings: false,
        };
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "main", exported: "default", type: "default" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("exports.default = main;");
      });

      it("returns empty string for empty bindings", () => {
        const options: RewriteOptions = { ...baseOptions, format: "iife" };
        const result = generateExportCode([], options);
        expect(result).toBe("");
      });
    });

    describe("AMD format", () => {
      it("uses CJS-style exports (same as CJS format)", () => {
        const options: RewriteOptions = {
          ...baseOptions,
          format: "amd",
          externalLiveBindings: true,
        };
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "foo", exported: "foo", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toContain("Object.defineProperty(exports, 'foo'");
      });

      it("uses simple assignment without live bindings", () => {
        const options: RewriteOptions = {
          ...baseOptions,
          format: "amd",
          externalLiveBindings: false,
        };
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "foo", exported: "foo", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("exports.foo = foo;");
      });
    });

    describe("SystemJS format", () => {
      const options: RewriteOptions = { ...baseOptions, format: "system" };

      it("generates exports() calls for named exports", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "foo", exported: "foo", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("exports('foo', foo);");
      });

      it("generates exports() call for default export", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "myVal", exported: "default", type: "default" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("exports('default', myVal);");
      });

      it("generates multiple exports() calls", () => {
        const bindings: ReadonlyArray<ExportBinding> = [
          { local: "a", exported: "a", type: "named" },
          { local: "b", exported: "b", type: "named" },
        ];
        const result = generateExportCode(bindings, options);
        expect(result).toBe("exports('a', a);\nexports('b', b);");
      });

      it("returns empty string for empty bindings", () => {
        const result = generateExportCode([], options);
        expect(result).toBe("");
      });
    });
  });

  describe("generateEsModuleMarker", () => {
    it("generates marker when esModule is true", () => {
      const options: RewriteOptions = { ...baseOptions, esModule: true };
      const result = generateEsModuleMarker(options);
      expect(result).toBe(
        "Object.defineProperty(exports, '__esModule', { value: true });",
      );
    });

    it("generates marker when esModule is 'if-default-prop'", () => {
      const options: RewriteOptions = {
        ...baseOptions,
        esModule: "if-default-prop",
      };
      const result = generateEsModuleMarker(options);
      expect(result).toBe(
        "Object.defineProperty(exports, '__esModule', { value: true });",
      );
    });

    it("returns empty string when esModule is false", () => {
      const options: RewriteOptions = { ...baseOptions, esModule: false };
      const result = generateEsModuleMarker(options);
      expect(result).toBe("");
    });

    it("returns empty string when esModule is undefined", () => {
      const options: RewriteOptions = {
        format: "cjs",
        interop: "auto",
        constBindings: true,
      };
      const result = generateEsModuleMarker(options);
      expect(result).toBe("");
    });
  });

  describe("generateNamespaceObject", () => {
    it("generates frozen namespace object with bindings", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { local: "foo", exported: "foo", type: "named" },
        { local: "bar", exported: "baz", type: "named" },
      ];
      const options: RewriteOptions = { ...baseOptions, freeze: true };
      const result = generateNamespaceObject(bindings, "ns", options);
      expect(result).toContain("const ns = Object.freeze(");
      expect(result).toContain("foo");
      expect(result).toContain("baz: bar");
    });

    it("generates unfrozen namespace object when freeze is false", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { local: "foo", exported: "foo", type: "named" },
      ];
      const options: RewriteOptions = { ...baseOptions, freeze: false };
      const result = generateNamespaceObject(bindings, "ns", options);
      expect(result).not.toContain("Object.freeze");
      expect(result).toContain("const ns = {");
    });

    it("uses var when constBindings is false", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { local: "x", exported: "x", type: "named" },
      ];
      const options: RewriteOptions = { ...baseOptions, constBindings: false };
      const result = generateNamespaceObject(bindings, "myNs", options);
      expect(result).toContain("var myNs = ");
    });

    it("handles empty bindings with freeze", () => {
      const options: RewriteOptions = { ...baseOptions, freeze: true };
      const result = generateNamespaceObject([], "empty", options);
      expect(result).toBe("const empty = Object.freeze({});");
    });

    it("handles empty bindings without freeze", () => {
      const options: RewriteOptions = { ...baseOptions, freeze: false };
      const result = generateNamespaceObject([], "empty", options);
      expect(result).toBe("const empty = {};");
    });

    it("handles default export binding in namespace", () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { local: "myDefault", exported: "default", type: "default" },
        { local: "named1", exported: "named1", type: "named" },
      ];
      const options: RewriteOptions = { ...baseOptions, freeze: true };
      const result = generateNamespaceObject(bindings, "ns", options);
      expect(result).toContain("default: myDefault");
      expect(result).toContain("named1");
    });

    it("generates frozen empty object when freeze undefined (defaults true)", () => {
      const options: RewriteOptions = {
        format: "cjs",
        interop: "auto",
        constBindings: true,
      };
      const result = generateNamespaceObject([], "ns", options);
      expect(result).toBe("const ns = Object.freeze({});");
    });

    it("uses var for empty bindings when constBindings is false", () => {
      const options: RewriteOptions = { ...baseOptions, constBindings: false };
      const result = generateNamespaceObject([], "ns", options);
      expect(result).toBe("var ns = Object.freeze({});");
    });
  });
});
