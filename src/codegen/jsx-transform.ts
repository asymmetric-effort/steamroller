/**
 * @module codegen/jsx-transform
 * @description Transforms JSX AST nodes into function call expressions
 * during code generation. Supports classic React.createElement, automatic
 * react-jsx runtime, and preserve mode.
 */

import type { RollupAstNode } from "../types.js";

/** JSX transform mode. */
export type JsxMode = "react" | "react-jsx" | "preserve";

/** Options for the JSX transform. */
export interface JsxTransformOptions {
  /** Which JSX runtime to target. */
  readonly mode: JsxMode;
  /** Factory function for classic mode (default: "React.createElement"). */
  readonly factory?: string;
  /** Fragment identifier (default: "React.Fragment"). */
  readonly fragment?: string;
  /** Import source for react-jsx mode (default: "react/jsx-runtime"). */
  readonly importSource?: string;
}

/** A JSX attribute node. */
export interface JsxAttribute {
  readonly type: "JSXAttribute";
  readonly name: { readonly name: string };
  readonly value: { readonly raw?: string; readonly value?: unknown } | null;
  readonly [key: string]: unknown;
}

/** A JSX spread attribute node. */
export interface JsxSpreadAttribute {
  readonly type: "JSXSpreadAttribute";
  readonly argument: { readonly name?: string; readonly raw?: string };
  readonly [key: string]: unknown;
}

/** A JSX element node. */
export interface JsxElementNode extends RollupAstNode {
  readonly type: "JSXElement";
  readonly openingElement: {
    readonly name: { readonly name?: string; readonly value?: string };
    readonly attributes: ReadonlyArray<JsxAttribute | JsxSpreadAttribute>;
    readonly selfClosing: boolean;
  };
  readonly children: ReadonlyArray<RollupAstNode>;
}

/** A JSX fragment node. */
export interface JsxFragmentNode extends RollupAstNode {
  readonly type: "JSXFragment";
  readonly children: ReadonlyArray<RollupAstNode>;
}

const DEFAULT_FACTORY = "React.createElement";
const DEFAULT_FRAGMENT = "React.Fragment";
const DEFAULT_IMPORT_SOURCE = "react/jsx-runtime";

/**
 * Serialize a JSX attribute value to a string expression.
 */
const serializeAttributeValue = (
  value: { readonly raw?: string; readonly value?: unknown } | null,
): string => {
  if (value === null) {
    return "true";
  }
  if (typeof value.value === "string") {
    return JSON.stringify(value.value);
  }
  if (value.raw !== undefined) {
    return String(value.raw);
  }
  return "true";
};

/**
 * Build props object string from JSX attributes.
 */
const buildProps = (
  attributes: ReadonlyArray<JsxAttribute | JsxSpreadAttribute>,
): string => {
  if (attributes.length === 0) {
    return "null";
  }

  const hasSpread = attributes.some((a) => a.type === "JSXSpreadAttribute");
  if (hasSpread) {
    const parts: Array<string> = [];
    for (const attr of attributes) {
      if (attr.type === "JSXSpreadAttribute") {
        const spread = attr as JsxSpreadAttribute;
        parts.push(spread.argument.name ?? spread.argument.raw ?? "{}");
      } else {
        const regular = attr as JsxAttribute;
        const key = regular.name.name;
        const val = serializeAttributeValue(regular.value);
        parts.push(`{${JSON.stringify(key)}: ${val}}`);
      }
    }
    return `Object.assign(${parts.join(", ")})`;
  }

  const entries: Array<string> = [];
  for (const attr of attributes) {
    const regular = attr as JsxAttribute;
    const key = regular.name.name;
    const val = serializeAttributeValue(regular.value);
    entries.push(`${JSON.stringify(key)}: ${val}`);
  }
  return `{${entries.join(", ")}}`;
};

/**
 * Serialize JSX children to argument strings.
 */
const serializeChildren = (
  children: ReadonlyArray<RollupAstNode>,
): ReadonlyArray<string> => {
  const result: Array<string> = [];
  for (const child of children) {
    if (child.type === "JSXText") {
      const text = String((child as { readonly value?: string }).value ?? "");
      const trimmed = text.replace(/^\s+|\s+$/g, " ").trim();
      if (trimmed.length > 0) {
        result.push(JSON.stringify(trimmed));
      }
    } else if (child.type === "JSXExpressionContainer") {
      const expr = (
        child as {
          readonly expression?: {
            readonly name?: string;
            readonly raw?: string;
          };
        }
      ).expression;
      result.push(expr?.name ?? expr?.raw ?? "undefined");
    } else if (child.type === "JSXElement" || child.type === "JSXFragment") {
      result.push(`/* nested JSX */null`);
    } else {
      result.push("null");
    }
  }
  return result;
};

/**
 * Transform a JSX element node to a function call string.
 *
 * @param node - The JSX element AST node
 * @param options - Transform configuration
 * @returns The generated function call code
 */
export const transformJsxElement = (
  node: JsxElementNode,
  options: JsxTransformOptions,
): string => {
  const mode = options.mode;

  if (mode === "preserve") {
    const tag =
      node.openingElement.name.name ?? node.openingElement.name.value ?? "div";
    return `<${tag} />`;
  }

  const tag =
    node.openingElement.name.name ?? node.openingElement.name.value ?? "div";
  const isComponent = tag[0] === tag[0].toUpperCase();
  const tagStr = isComponent ? tag : JSON.stringify(tag);
  const props = buildProps(node.openingElement.attributes);
  const children = serializeChildren(node.children);

  if (mode === "react-jsx") {
    const fn = children.length > 1 ? "jsxs" : "jsx";
    const allProps =
      children.length > 0
        ? props === "null"
          ? `{children: ${children.length === 1 ? children[0] : `[${children.join(", ")}]`}}`
          : `Object.assign(${props}, {children: ${children.length === 1 ? children[0] : `[${children.join(", ")}]`}})`
        : props;
    return `${fn}(${tagStr}, ${allProps})`;
  }

  // Classic react mode
  const factory = options.factory ?? DEFAULT_FACTORY;
  const args = [tagStr, props, ...children];
  return `${factory}(${args.join(", ")})`;
};

/**
 * Transform a JSX fragment node to a function call string.
 *
 * @param node - The JSX fragment AST node
 * @param options - Transform configuration
 * @returns The generated function call code
 */
export const transformJsxFragment = (
  node: JsxFragmentNode,
  options: JsxTransformOptions,
): string => {
  const mode = options.mode;

  if (mode === "preserve") {
    return "<></>";
  }

  const children = serializeChildren(node.children);
  const fragment = options.fragment ?? DEFAULT_FRAGMENT;

  if (mode === "react-jsx") {
    const fn = children.length > 1 ? "jsxs" : "jsx";
    const props =
      children.length > 0
        ? `{children: ${children.length === 1 ? children[0] : `[${children.join(", ")}]`}}`
        : "{}";
    return `${fn}(${fragment}, ${props})`;
  }

  // Classic react mode
  const factory = options.factory ?? DEFAULT_FACTORY;
  const args = [fragment, "null", ...children];
  return `${factory}(${args.join(", ")})`;
};

/** Get the default import source for react-jsx mode. */
export const getJsxImportSource = (options: JsxTransformOptions): string => {
  return options.importSource ?? DEFAULT_IMPORT_SOURCE;
};
