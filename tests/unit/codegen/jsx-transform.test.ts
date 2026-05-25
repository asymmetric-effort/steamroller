/**
 * @module tests/unit/codegen/jsx-transform.test
 * @description Unit tests for JSX transform output (Issue #39).
 */

import { describe, it, expect } from "vitest";
import {
  transformJsxElement,
  transformJsxFragment,
  getJsxImportSource,
} from "../../../src/codegen/jsx-transform.js";
import type {
  JsxElementNode,
  JsxFragmentNode,
  JsxTransformOptions,
} from "../../../src/codegen/jsx-transform.js";

const makeElement = (
  tag: string,
  attributes: ReadonlyArray<Record<string, unknown>> = [],
  children: ReadonlyArray<Record<string, unknown>> = [],
  selfClosing = true,
): JsxElementNode => ({
  type: "JSXElement",
  start: 0,
  end: 0,
  openingElement: {
    name: { name: tag },
    attributes: attributes as JsxElementNode["openingElement"]["attributes"],
    selfClosing,
  },
  children: children as JsxElementNode["children"],
});

const makeFragment = (
  children: ReadonlyArray<Record<string, unknown>> = [],
): JsxFragmentNode => ({
  type: "JSXFragment",
  start: 0,
  end: 0,
  children: children as JsxFragmentNode["children"],
});

describe("jsx-transform", () => {
  describe("transformJsxElement", () => {
    const reactOptions: JsxTransformOptions = { mode: "react" };

    it("transforms a simple element to React.createElement", () => {
      const node = makeElement("div");
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("div", null)');
    });

    it("transforms a component (uppercase) without quoting", () => {
      const node = makeElement("App");
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe("React.createElement(App, null)");
    });

    it("handles string attributes", () => {
      const node = makeElement("div", [
        {
          type: "JSXAttribute",
          name: { name: "className" },
          value: { value: "foo" },
        },
      ]);
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("div", {"className": "foo"})');
    });

    it("handles boolean attributes (null value)", () => {
      const node = makeElement("input", [
        {
          type: "JSXAttribute",
          name: { name: "disabled" },
          value: null,
        },
      ]);
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("input", {"disabled": true})');
    });

    it("handles spread attributes with Object.assign", () => {
      const node = makeElement("div", [
        {
          type: "JSXSpreadAttribute",
          argument: { name: "props" },
        },
      ]);
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("div", Object.assign(props))');
    });

    it("handles mixed spread and regular attributes", () => {
      const node = makeElement("div", [
        {
          type: "JSXAttribute",
          name: { name: "id" },
          value: { value: "main" },
        },
        {
          type: "JSXSpreadAttribute",
          argument: { name: "rest" },
        },
      ]);
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe(
        'React.createElement("div", Object.assign({"id": "main"}, rest))',
      );
    });

    it("handles text children", () => {
      const node = makeElement(
        "p",
        [],
        [{ type: "JSXText", value: "Hello", start: 0, end: 5 }],
      );
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("p", null, "Hello")');
    });

    it("handles expression children", () => {
      const node = makeElement(
        "span",
        [],
        [
          {
            type: "JSXExpressionContainer",
            expression: { name: "count" },
            start: 0,
            end: 0,
          },
        ],
      );
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("span", null, count)');
    });

    it("handles multiple children", () => {
      const node = makeElement(
        "div",
        [],
        [
          { type: "JSXText", value: "A", start: 0, end: 1 },
          { type: "JSXText", value: "B", start: 1, end: 2 },
        ],
      );
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("div", null, "A", "B")');
    });

    it("skips whitespace-only text children", () => {
      const node = makeElement(
        "div",
        [],
        [{ type: "JSXText", value: "   \n  ", start: 0, end: 5 }],
      );
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("div", null)');
    });

    it("handles nested JSX children as null placeholder", () => {
      const node = makeElement(
        "div",
        [],
        [{ type: "JSXElement", start: 0, end: 0 }],
      );
      const result = transformJsxElement(node, reactOptions);
      expect(result).toContain("null");
    });

    it("uses custom factory when provided", () => {
      const node = makeElement("div");
      const result = transformJsxElement(node, {
        mode: "react",
        factory: "h",
      });
      expect(result).toBe('h("div", null)');
    });

    it("preserves JSX in preserve mode", () => {
      const node = makeElement("div");
      const result = transformJsxElement(node, { mode: "preserve" });
      expect(result).toBe("<div />");
    });

    it("uses jsx/jsxs in react-jsx mode with no children", () => {
      const node = makeElement("div");
      const result = transformJsxElement(node, { mode: "react-jsx" });
      expect(result).toBe('jsx("div", null)');
    });

    it("uses jsx in react-jsx mode with one child", () => {
      const node = makeElement(
        "div",
        [],
        [{ type: "JSXText", value: "Hi", start: 0, end: 2 }],
      );
      const result = transformJsxElement(node, { mode: "react-jsx" });
      expect(result).toBe('jsx("div", {children: "Hi"})');
    });

    it("uses jsxs in react-jsx mode with multiple children", () => {
      const node = makeElement(
        "div",
        [],
        [
          { type: "JSXText", value: "A", start: 0, end: 1 },
          { type: "JSXText", value: "B", start: 1, end: 2 },
        ],
      );
      const result = transformJsxElement(node, { mode: "react-jsx" });
      expect(result).toBe('jsxs("div", {children: ["A", "B"]})');
    });

    it("merges props and children in react-jsx mode", () => {
      const node = makeElement(
        "div",
        [
          {
            type: "JSXAttribute",
            name: { name: "id" },
            value: { value: "x" },
          },
        ],
        [{ type: "JSXText", value: "Hi", start: 0, end: 2 }],
      );
      const result = transformJsxElement(node, { mode: "react-jsx" });
      expect(result).toBe(
        'jsx("div", Object.assign({"id": "x"}, {children: "Hi"}))',
      );
    });

    it("handles attribute with non-string, no-raw value (falls back to true)", () => {
      const node = makeElement("div", [
        {
          type: "JSXAttribute",
          name: { name: "data" },
          value: { value: 123 },
        },
      ]);
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("div", {"data": true})');
    });

    it("handles attribute with raw value", () => {
      const node = makeElement("div", [
        {
          type: "JSXAttribute",
          name: { name: "count" },
          value: { raw: "42" },
        },
      ]);
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("div", {"count": 42})');
    });

    it("handles expression child with raw", () => {
      const node = makeElement(
        "span",
        [],
        [
          {
            type: "JSXExpressionContainer",
            expression: { raw: "1 + 2" },
            start: 0,
            end: 0,
          },
        ],
      );
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("span", null, 1 + 2)');
    });

    it("handles unknown child type as null", () => {
      const node = makeElement(
        "div",
        [],
        [{ type: "Unknown", start: 0, end: 0 }],
      );
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("div", null, null)');
    });

    it("handles element name from value property", () => {
      const el: JsxElementNode = {
        type: "JSXElement",
        start: 0,
        end: 0,
        openingElement: {
          name: { value: "custom-el" } as unknown as {
            readonly name?: string;
            readonly value?: string;
          },
          attributes: [],
          selfClosing: true,
        },
        children: [],
      };
      const result = transformJsxElement(el, reactOptions);
      expect(result).toBe('React.createElement("custom-el", null)');
    });

    it("handles preserve mode with name from value", () => {
      const el: JsxElementNode = {
        type: "JSXElement",
        start: 0,
        end: 0,
        openingElement: {
          name: { value: "my-tag" } as unknown as {
            readonly name?: string;
            readonly value?: string;
          },
          attributes: [],
          selfClosing: true,
        },
        children: [],
      };
      const result = transformJsxElement(el, { mode: "preserve" });
      expect(result).toBe("<my-tag />");
    });

    it("handles spread attribute with raw fallback", () => {
      const node = makeElement("div", [
        {
          type: "JSXSpreadAttribute",
          argument: { raw: "getProps()" },
        },
      ]);
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe(
        'React.createElement("div", Object.assign(getProps()))',
      );
    });

    it("handles expression child with no name or raw (undefined)", () => {
      const node = makeElement(
        "div",
        [],
        [
          {
            type: "JSXExpressionContainer",
            expression: {},
            start: 0,
            end: 0,
          },
        ],
      );
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("div", null, undefined)');
    });

    it("falls back to div when name is missing in react mode", () => {
      const el: JsxElementNode = {
        type: "JSXElement",
        start: 0,
        end: 0,
        openingElement: {
          name: {} as unknown as {
            readonly name?: string;
            readonly value?: string;
          },
          attributes: [],
          selfClosing: true,
        },
        children: [],
      };
      const result = transformJsxElement(el, reactOptions);
      expect(result).toBe('React.createElement("div", null)');
    });

    it("falls back to div when name is missing in preserve mode", () => {
      const el: JsxElementNode = {
        type: "JSXElement",
        start: 0,
        end: 0,
        openingElement: {
          name: {} as unknown as {
            readonly name?: string;
            readonly value?: string;
          },
          attributes: [],
          selfClosing: true,
        },
        children: [],
      };
      const result = transformJsxElement(el, { mode: "preserve" });
      expect(result).toBe("<div />");
    });

    it("uses jsxs with props and multiple children in react-jsx mode", () => {
      const node = makeElement(
        "div",
        [
          {
            type: "JSXAttribute",
            name: { name: "className" },
            value: { value: "wrap" },
          },
        ],
        [
          { type: "JSXText", value: "A", start: 0, end: 1 },
          { type: "JSXText", value: "B", start: 1, end: 2 },
        ],
      );
      const result = transformJsxElement(node, { mode: "react-jsx" });
      expect(result).toBe(
        'jsxs("div", Object.assign({"className": "wrap"}, {children: ["A", "B"]}))',
      );
    });

    it("handles expression child with no expression property", () => {
      const node = makeElement(
        "div",
        [],
        [
          {
            type: "JSXExpressionContainer",
            start: 0,
            end: 0,
          },
        ],
      );
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("div", null, undefined)');
    });

    it("handles spread attribute with no name or raw", () => {
      const node = makeElement("div", [
        {
          type: "JSXSpreadAttribute",
          argument: {},
        },
      ]);
      const result = transformJsxElement(node, reactOptions);
      expect(result).toBe('React.createElement("div", Object.assign({}))');
    });
  });

  describe("transformJsxFragment", () => {
    const reactOptions: JsxTransformOptions = { mode: "react" };

    it("transforms empty fragment in classic mode", () => {
      const node = makeFragment();
      const result = transformJsxFragment(node, reactOptions);
      expect(result).toBe("React.createElement(React.Fragment, null)");
    });

    it("transforms fragment with children", () => {
      const node = makeFragment([
        { type: "JSXText", value: "Hello", start: 0, end: 5 },
      ]);
      const result = transformJsxFragment(node, reactOptions);
      expect(result).toBe('React.createElement(React.Fragment, null, "Hello")');
    });

    it("uses custom fragment identifier", () => {
      const node = makeFragment();
      const result = transformJsxFragment(node, {
        mode: "react",
        fragment: "Fragment",
      });
      expect(result).toBe("React.createElement(Fragment, null)");
    });

    it("preserves fragment in preserve mode", () => {
      const node = makeFragment();
      const result = transformJsxFragment(node, { mode: "preserve" });
      expect(result).toBe("<></>");
    });

    it("uses jsx in react-jsx mode with one child", () => {
      const node = makeFragment([
        { type: "JSXText", value: "Hi", start: 0, end: 2 },
      ]);
      const result = transformJsxFragment(node, { mode: "react-jsx" });
      expect(result).toBe('jsx(React.Fragment, {children: "Hi"})');
    });

    it("uses jsxs in react-jsx mode with multiple children", () => {
      const node = makeFragment([
        { type: "JSXText", value: "A", start: 0, end: 1 },
        { type: "JSXText", value: "B", start: 1, end: 2 },
      ]);
      const result = transformJsxFragment(node, { mode: "react-jsx" });
      expect(result).toBe('jsxs(React.Fragment, {children: ["A", "B"]})');
    });

    it("uses jsx with empty props when no children in react-jsx mode", () => {
      const node = makeFragment();
      const result = transformJsxFragment(node, { mode: "react-jsx" });
      expect(result).toBe("jsx(React.Fragment, {})");
    });

    it("uses custom fragment in react-jsx mode", () => {
      const node = makeFragment();
      const result = transformJsxFragment(node, {
        mode: "react-jsx",
        fragment: "MyFragment",
      });
      expect(result).toBe("jsx(MyFragment, {})");
    });

    it("uses custom factory for fragment in classic mode", () => {
      const node = makeFragment();
      const result = transformJsxFragment(node, {
        mode: "react",
        factory: "h",
      });
      expect(result).toBe("h(React.Fragment, null)");
    });
  });

  describe("getJsxImportSource", () => {
    it("returns default import source", () => {
      const result = getJsxImportSource({ mode: "react-jsx" });
      expect(result).toBe("react/jsx-runtime");
    });

    it("returns custom import source", () => {
      const result = getJsxImportSource({
        mode: "react-jsx",
        importSource: "preact/jsx-runtime",
      });
      expect(result).toBe("preact/jsx-runtime");
    });
  });
});
