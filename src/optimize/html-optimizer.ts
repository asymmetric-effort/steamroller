/**
 * @module optimize/html-optimizer
 * @description Zero-dependency HTML optimizer.
 * Applies a configurable set of optimization passes to HTML markup.
 */

import { parseHtml } from "../html/html-parser.js";
import type {
  HtmlDocument,
  Element,
  HtmlChildNode,
  Attribute,
} from "../html/html-ast.js";

// ============================================================
// Types
// ============================================================

/** Options for HTML optimization passes. */
export interface HtmlOptimizeOptions {
  /** Remove HTML comments (preserving conditional comments). Default: true */
  readonly removeComments?: boolean;
  /** Collapse whitespace (respecting pre/code/textarea). Default: true */
  readonly collapseWhitespace?: boolean;
  /** Shorten boolean attributes (checked="checked" -> checked). Default: true */
  readonly shortenBooleanAttrs?: boolean;
  /** Remove attribute quotes when safe. Default: true */
  readonly removeAttributeQuotes?: boolean;
  /** Remove empty attributes. Default: true */
  readonly removeEmptyAttributes?: boolean;
  /** Remove redundant attributes (type="text/javascript" on script, etc.). Default: true */
  readonly removeRedundantAttributes?: boolean;
}

// ============================================================
// Constants
// ============================================================

/** HTML boolean attributes that can be shortened. */
const BOOLEAN_ATTRS = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
]);

/** Elements that preserve whitespace. */
const PREFORMATTED_ELEMENTS = new Set(["pre", "code", "textarea", "script"]);

/** Redundant attribute-value pairs that can be removed. */
const REDUNDANT_ATTRS: ReadonlyArray<{
  tag: string;
  attr: string;
  value: string;
}> = [
  { tag: "script", attr: "type", value: "text/javascript" },
  { tag: "script", attr: "language", value: "javascript" },
  { tag: "style", attr: "type", value: "text/css" },
  { tag: "link", attr: "type", value: "text/css" },
  { tag: "form", attr: "method", value: "get" },
  { tag: "input", attr: "type", value: "text" },
  { tag: "a", attr: "shape", value: "rect" },
  { tag: "area", attr: "shape", value: "rect" },
];

/** Attributes that are safe to remove when empty. */
const SAFE_EMPTY_ATTRS = new Set([
  "class",
  "id",
  "style",
  "title",
  "lang",
  "dir",
]);

// ============================================================
// Core optimizer
// ============================================================

/**
 * Optimize an HTML string.
 *
 * @param source - The HTML source markup.
 * @param options - Optimization options.
 * @returns The optimized HTML string.
 */
export const optimizeHtml = (
  source: string,
  options?: HtmlOptimizeOptions,
): string => {
  const opts: Required<HtmlOptimizeOptions> = {
    removeComments: options?.removeComments ?? true,
    collapseWhitespace: options?.collapseWhitespace ?? true,
    shortenBooleanAttrs: options?.shortenBooleanAttrs ?? true,
    removeAttributeQuotes: options?.removeAttributeQuotes ?? true,
    removeEmptyAttributes: options?.removeEmptyAttributes ?? true,
    removeRedundantAttributes: options?.removeRedundantAttributes ?? true,
  };

  const doc = parseHtml(source, { mode: "html", recover: true });

  let children = cloneChildren(doc.children);

  // 1. removeComments (preserve conditional comments)
  if (opts.removeComments) {
    children = filterComments(children);
  }

  // 2. removeRedundantAttributes
  if (opts.removeRedundantAttributes) {
    children = mapElements(children, (el) =>
      removeRedundantAttrsFromElement(el),
    );
  }

  // 3. removeEmptyAttributes
  if (opts.removeEmptyAttributes) {
    children = mapElements(children, (el) => removeEmptyAttrsFromElement(el));
  }

  // 4. shortenBooleanAttrs
  if (opts.shortenBooleanAttrs) {
    children = mapElements(children, (el) => shortenBooleanAttrsOnElement(el));
  }

  // 5. removeAttributeQuotes
  if (opts.removeAttributeQuotes) {
    children = mapElements(children, (el) => removeQuotesOnElement(el));
  }

  // 6. collapseWhitespace
  if (opts.collapseWhitespace) {
    children = collapseWhitespacePass(children, false);
  }

  return serializeHtmlDocument(doc, children);
};

// ============================================================
// Mutable node types
// ============================================================

interface MutableElement {
  type: "Element";
  tagName: string;
  namespace?: string;
  attributes: MutableAttribute[];
  children: MutableChild[];
  selfClosing: boolean;
}

interface MutableAttribute {
  type: "Attribute";
  name: string;
  namespace?: string;
  value: string | null;
  quote: "'" | '"' | null;
}

interface MutableText {
  type: "Text";
  value: string;
}

interface MutableComment {
  type: "Comment";
  value: string;
}

interface MutableCdata {
  type: "CdataSection";
  value: string;
}

interface MutablePI {
  type: "ProcessingInstruction";
  target: string;
  data: string;
}

type MutableChild =
  MutableElement | MutableText | MutableComment | MutableCdata | MutablePI;

// ============================================================
// Clone AST to mutable form
// ============================================================

const cloneChildren = (
  children: ReadonlyArray<HtmlChildNode>,
): MutableChild[] => {
  return children.map(cloneChild);
};

const cloneChild = (node: HtmlChildNode): MutableChild => {
  switch (node.type) {
    case "Element":
      return {
        type: "Element",
        tagName: node.tagName,
        namespace: node.namespace,
        attributes: node.attributes.map((a) => ({
          type: "Attribute" as const,
          name: a.name,
          namespace: a.namespace,
          value: a.value,
          quote: a.quote,
        })),
        children: cloneChildren(node.children),
        selfClosing: node.selfClosing,
      };
    case "Text":
      return { type: "Text", value: node.value };
    case "Comment":
      return { type: "Comment", value: node.value };
    case "CdataSection":
      return { type: "CdataSection", value: node.value };
    case "ProcessingInstruction":
      return {
        type: "ProcessingInstruction",
        target: node.target,
        data: node.data,
      };
  }
};

// ============================================================
// Transformation helpers
// ============================================================

/** Recursively apply a transform to all elements. */
const mapElements = (
  children: MutableChild[],
  fn: (el: MutableElement) => MutableElement,
): MutableChild[] => {
  return children.map((child) => {
    if (child.type !== "Element") return child;
    const transformed = fn(child);
    transformed.children = mapElements(transformed.children, fn);
    return transformed;
  });
};

/** Remove comments, preserving conditional comments (<!--[if ...]--> etc.). */
const filterComments = (children: MutableChild[]): MutableChild[] => {
  const result: MutableChild[] = [];
  for (const child of children) {
    if (child.type === "Comment") {
      // Preserve conditional comments
      if (
        child.value.startsWith("[if ") ||
        child.value.startsWith("[endif") ||
        child.value.startsWith("<!--[if")
      ) {
        result.push(child);
      }
      continue;
    }
    if (child.type === "Element") {
      child.children = filterComments(child.children);
    }
    result.push(child);
  }
  return result;
};

/** Remove redundant attributes (e.g. type="text/javascript" on script). */
const removeRedundantAttrsFromElement = (
  el: MutableElement,
): MutableElement => {
  el.attributes = el.attributes.filter((attr) => {
    for (const rule of REDUNDANT_ATTRS) {
      if (
        el.tagName === rule.tag &&
        attr.name === rule.attr &&
        attr.value === rule.value
      ) {
        return false;
      }
    }
    return true;
  });
  return el;
};

/** Remove safe empty attributes (class="", id="", etc.). */
const removeEmptyAttrsFromElement = (el: MutableElement): MutableElement => {
  el.attributes = el.attributes.filter((attr) => {
    if (attr.value === "" && SAFE_EMPTY_ATTRS.has(attr.name)) {
      return false;
    }
    return true;
  });
  return el;
};

/** Shorten boolean attributes: checked="checked" -> checked (null value). */
const shortenBooleanAttrsOnElement = (el: MutableElement): MutableElement => {
  el.attributes = el.attributes.map((attr) => {
    if (
      BOOLEAN_ATTRS.has(attr.name) &&
      (attr.value === attr.name || attr.value === "" || attr.value === "true")
    ) {
      return { ...attr, value: null, quote: null };
    }
    return attr;
  });
  return el;
};

/** Remove attribute quotes when safe (value has no special chars). */
const removeQuotesOnElement = (el: MutableElement): MutableElement => {
  el.attributes = el.attributes.map((attr) => {
    if (attr.value === null || attr.value === "") return attr;
    // Safe to remove quotes if value has no whitespace or special characters
    if (/^[a-zA-Z0-9_\-./]+$/.test(attr.value)) {
      return { ...attr, quote: null };
    }
    return attr;
  });
  return el;
};

/** Collapse whitespace in text nodes, respecting preformatted elements. */
const collapseWhitespacePass = (
  children: MutableChild[],
  inPreformatted: boolean,
): MutableChild[] => {
  const result: MutableChild[] = [];
  for (const child of children) {
    if (child.type === "Text") {
      if (inPreformatted) {
        result.push(child);
      } else {
        const collapsed = child.value.replace(/\s+/g, " ");
        if (collapsed.length > 0) {
          result.push({ ...child, value: collapsed });
        }
      }
    } else if (child.type === "Element") {
      const isPreformatted =
        inPreformatted || PREFORMATTED_ELEMENTS.has(child.tagName);
      child.children = collapseWhitespacePass(child.children, isPreformatted);
      result.push(child);
    } else {
      result.push(child);
    }
  }
  return result;
};

// ============================================================
// Serializer
// ============================================================

/** HTML void elements that should not have closing tags. */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const serializeHtmlDocument = (
  doc: HtmlDocument,
  children: MutableChild[],
): string => {
  let result = "";

  if (doc.doctype) {
    result += `<!DOCTYPE ${doc.doctype.name}>`;
  }

  for (const child of children) {
    result += serializeChild(child);
  }

  return result;
};

const serializeChild = (node: MutableChild): string => {
  switch (node.type) {
    case "Element":
      return serializeElement(node);
    case "Text":
      return node.value;
    case "Comment":
      return `<!--${node.value}-->`;
    case "CdataSection":
      return `<![CDATA[${node.value}]]>`;
    case "ProcessingInstruction":
      return `<?${node.target} ${node.data}?>`;
  }
};

const serializeElement = (el: MutableElement): string => {
  let result = `<${el.tagName}`;

  for (const attr of el.attributes) {
    result += ` ${serializeAttribute(attr)}`;
  }

  if (VOID_ELEMENTS.has(el.tagName)) {
    result += ">";
    return result;
  }

  if (el.selfClosing) {
    result += "/>";
    return result;
  }

  result += ">";
  for (const child of el.children) {
    result += serializeChild(child);
  }
  result += `</${el.tagName}>`;
  return result;
};

const serializeAttribute = (attr: MutableAttribute): string => {
  if (attr.value === null) {
    return attr.name;
  }
  if (attr.quote === null) {
    return `${attr.name}=${attr.value}`;
  }
  return `${attr.name}=${attr.quote}${attr.value}${attr.quote}`;
};
