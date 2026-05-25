/**
 * @module tests/unit/codegen/interop
 * @description Unit tests for interop mode helpers.
 */

import { describe, it, expect } from "vitest";
import {
  generateInteropHelper,
  generateNamespaceAccess,
  generateDefaultAccess,
  normalizeInterop,
} from "../../../src/codegen/interop.js";
import type { InteropType } from "../../../src/codegen/interop.js";

describe("codegen/interop", () => {
  describe("generateInteropHelper", () => {
    it("returns empty string for esModule mode", () => {
      const result = generateInteropHelper("esModule", true);
      expect(result).toBe("");
    });

    it("returns empty string for defaultOnly mode", () => {
      const result = generateInteropHelper("defaultOnly", false);
      expect(result).toBe("");
    });

    it("returns empty string for boolean false (esModule)", () => {
      const result = generateInteropHelper(false, true);
      expect(result).toBe("");
    });

    it("generates _interopDefault and _interopNamespace for auto mode", () => {
      const result = generateInteropHelper("auto", true);
      expect(result).toContain("function _interopDefault(e)");
      expect(result).toContain("function _interopNamespace(e)");
      expect(result).toContain("e.__esModule");
      expect(result).toContain("Object.freeze(n)");
    });

    it("generates _interopDefault and _interopNamespace for boolean true (auto)", () => {
      const result = generateInteropHelper(true, true);
      expect(result).toContain("function _interopDefault(e)");
      expect(result).toContain("function _interopNamespace(e)");
    });

    it("uses const bindings when constBindings is true in auto mode", () => {
      const result = generateInteropHelper("auto", true);
      expect(result).toContain("const n = Object.create(null)");
      expect(result).toContain("const k in e");
      expect(result).toContain("const d = Object.getOwnPropertyDescriptor");
    });

    it("uses var bindings when constBindings is false in auto mode", () => {
      const result = generateInteropHelper("auto", false);
      expect(result).toContain("var n = Object.create(null)");
      expect(result).toContain("var k in e");
      expect(result).toContain("var d = Object.getOwnPropertyDescriptor");
    });

    it("generates only _interopDefault for default mode", () => {
      const result = generateInteropHelper("default", true);
      expect(result).toContain("function _interopDefault(e)");
      expect(result).not.toContain("function _interopNamespace(e)");
    });

    it("includes hasOwnProperty check in auto mode helper", () => {
      const result = generateInteropHelper("auto", true);
      expect(result).toContain(
        "Object.prototype.hasOwnProperty.call(e, 'default')",
      );
    });

    it("includes hasOwnProperty check in default mode helper", () => {
      const result = generateInteropHelper("default", false);
      expect(result).toContain(
        "Object.prototype.hasOwnProperty.call(e, 'default')",
      );
    });
  });

  describe("generateNamespaceAccess", () => {
    it("returns localName directly for esModule mode", () => {
      const result = generateNamespaceAccess("myModule", "esModule");
      expect(result).toBe("myModule");
    });

    it("returns localName directly for default mode", () => {
      const result = generateNamespaceAccess("myModule", "default");
      expect(result).toBe("myModule");
    });

    it("wraps in object literal for defaultOnly mode", () => {
      const result = generateNamespaceAccess("myModule", "defaultOnly");
      expect(result).toBe("{ 'default': myModule }");
    });

    it("wraps in _interopNamespace for auto mode", () => {
      const result = generateNamespaceAccess("myModule", "auto");
      expect(result).toBe("_interopNamespace(myModule)");
    });

    it("handles boolean true as auto mode", () => {
      const result = generateNamespaceAccess("ext", true);
      expect(result).toBe("_interopNamespace(ext)");
    });

    it("handles boolean false as esModule mode", () => {
      const result = generateNamespaceAccess("ext", false);
      expect(result).toBe("ext");
    });

    it("handles various local name formats", () => {
      expect(generateNamespaceAccess("_react", "auto")).toBe(
        "_interopNamespace(_react)",
      );
      expect(generateNamespaceAccess("$lodash", "defaultOnly")).toBe(
        "{ 'default': $lodash }",
      );
      expect(generateNamespaceAccess("require$$1", "esModule")).toBe(
        "require$$1",
      );
    });
  });

  describe("generateDefaultAccess", () => {
    it("accesses ['default'] property for esModule mode", () => {
      const result = generateDefaultAccess("myModule", "esModule");
      expect(result).toBe("myModule['default']");
    });

    it("wraps in _interopDefault for default mode", () => {
      const result = generateDefaultAccess("myModule", "default");
      expect(result).toBe("_interopDefault(myModule)");
    });

    it("returns localName directly for defaultOnly mode", () => {
      const result = generateDefaultAccess("myModule", "defaultOnly");
      expect(result).toBe("myModule");
    });

    it("wraps in _interopDefault for auto mode", () => {
      const result = generateDefaultAccess("myModule", "auto");
      expect(result).toBe("_interopDefault(myModule)");
    });

    it("handles boolean true as auto mode", () => {
      const result = generateDefaultAccess("ext", true);
      expect(result).toBe("_interopDefault(ext)");
    });

    it("handles boolean false as esModule mode", () => {
      const result = generateDefaultAccess("ext", false);
      expect(result).toBe("ext['default']");
    });

    it("handles various local name formats", () => {
      expect(generateDefaultAccess("_react", "auto")).toBe(
        "_interopDefault(_react)",
      );
      expect(generateDefaultAccess("$lodash", "defaultOnly")).toBe("$lodash");
      expect(generateDefaultAccess("require$$1", "esModule")).toBe(
        "require$$1['default']",
      );
    });
  });

  describe("normalizeInterop", () => {
    it("returns a function when given a string interop type", () => {
      const resolver = normalizeInterop("auto");
      expect(typeof resolver).toBe("function");
    });

    it("resolver returns auto for string auto", () => {
      const resolver = normalizeInterop("auto");
      expect(resolver("some-module")).toBe("auto");
      expect(resolver(null)).toBe("auto");
    });

    it("resolver returns esModule for string esModule", () => {
      const resolver = normalizeInterop("esModule");
      expect(resolver("mod")).toBe("esModule");
    });

    it("resolver returns default for string default", () => {
      const resolver = normalizeInterop("default");
      expect(resolver("mod")).toBe("default");
    });

    it("resolver returns defaultOnly for string defaultOnly", () => {
      const resolver = normalizeInterop("defaultOnly");
      expect(resolver("mod")).toBe("defaultOnly");
    });

    it("normalizes boolean true to auto", () => {
      const resolver = normalizeInterop(true);
      expect(resolver("mod")).toBe("auto");
      expect(resolver(null)).toBe("auto");
    });

    it("normalizes boolean false to esModule", () => {
      const resolver = normalizeInterop(false);
      expect(resolver("mod")).toBe("esModule");
      expect(resolver(null)).toBe("esModule");
    });

    it("wraps a function and normalizes its return values", () => {
      const customFn = (id: string | null): InteropType => {
        if (id === "react") return "esModule";
        if (id === "lodash") return "defaultOnly";
        if (id === null) return true;
        return "auto";
      };
      const resolver = normalizeInterop(customFn);
      expect(resolver("react")).toBe("esModule");
      expect(resolver("lodash")).toBe("defaultOnly");
      expect(resolver(null)).toBe("auto");
      expect(resolver("other")).toBe("auto");
    });

    it("normalizes boolean returns from custom function", () => {
      const customFn = (id: string | null): InteropType => {
        if (id === "legacy") return true;
        return false;
      };
      const resolver = normalizeInterop(customFn);
      expect(resolver("legacy")).toBe("auto");
      expect(resolver("modern")).toBe("esModule");
    });

    it("returns consistent results for repeated calls", () => {
      const resolver = normalizeInterop("default");
      expect(resolver("a")).toBe("default");
      expect(resolver("b")).toBe("default");
      expect(resolver(null)).toBe("default");
    });
  });
});
