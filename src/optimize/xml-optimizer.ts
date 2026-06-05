/**
 * @module optimize/xml-optimizer
 * @description Zero-dependency XML optimizer.
 * Applies a minimal set of optimization passes: remove comments,
 * collapse whitespace, and remove unused namespace declarations.
 */

import { parseHtml } from "../html/html-parser.js";
import type { HtmlChildNode } from "../html/html-ast.js";

// ============================================================
// Types
// ============================================================

/** Options for XML optimization. */
export interface XmlOptimizeOptions {
  /** Remove XML comments. Default: true */
  readonly removeComments?: boolean;
  /** Collapse whitespace in text nodes. Default: true */
  readonly collapseWhitespace?: boolean;
  /** Remove unreferenced xmlns:* declarations. Default: true */
  readonly removeUnusedNamespaces?: boolean;
}

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
  | MutableElement
  | MutableText
  | MutableComment
  | MutableCdata
  | MutablePI;

// ============================================================
// Core optimizer
// ============================================================

/**
 * Optimize an XML string.
 *
 * @param source - The XML source markup.
 * @param options - Optimization options.
 * @returns The optimized XML string.
 */
export const optimizeXml = (
  source: string,
  options?: XmlOptimizeOptions,
): string => {
  const opts: Required<XmlOptimizeOptions> = {
    removeComments: options?.removeComments ?? true,
    collapseWhitespace: options?.collapseWhitespace ?? true,
    removeUnusedNamespaces: options?.removeUnusedNamespaces ?? true,
  };

  const doc = parseHtml(source, { mode: "xml", recover: true });

  let children = cloneChildren(doc.children);

  // 1. removeComments
  if (opts.removeComments) {
    children = filterDeep(children, (n) => n.type !== "Comment");
  }

  // 2. removeUnusedNamespaces
  if (opts.removeUnusedNamespaces) {
    children = mapElements(children, (el) =>
      removeUnusedNamespacesFromElement(el, children),
    );
  }

  // 3. collapseWhitespace
  if (opts.collapseWhitespace) {
    children = collapseWhitespacePass(children);
  }

  return serializeXmlDocument(doc, children);
};

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

/** Recursively filter nodes by predicate. */
const filterDeep = (
  children: MutableChild[],
  pred: (n: MutableChild) => boolean,
): MutableChild[] => {
  const result: MutableChild[] = [];
  for (const child of children) {
    if (!pred(child)) continue;
    if (child.type === "Element") {
      child.children = filterDeep(child.children, pred);
    }
    result.push(child);
  }
  return result;
};

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

/** Remove unused xmlns:* namespace declarations from root elements. */
const removeUnusedNamespacesFromElement = (
  el: MutableElement,
  allChildren: MutableChild[],
): MutableElement => {
  // Only operate on elements that have xmlns: attributes
  const hasNsAttrs = el.attributes.some((a) => a.name.startsWith("xmlns:"));
  if (!hasNsAttrs) return el;

  const usedPrefixes = new Set<string>();
  collectUsedPrefixes(allChildren, usedPrefixes);

  el.attributes = el.attributes.filter((attr) => {
    if (attr.name.startsWith("xmlns:")) {
      const prefix = attr.name.slice(6);
      return usedPrefixes.has(prefix);
    }
    return true;
  });

  return el;
};

const collectUsedPrefixes = (
  children: MutableChild[],
  prefixes: Set<string>,
): void => {
  for (const child of children) {
    if (child.type !== "Element") continue;

    if (child.tagName.includes(":")) {
      prefixes.add(child.tagName.split(":")[0]);
    }

    for (const attr of child.attributes) {
      if (attr.name.includes(":") && !attr.name.startsWith("xmlns:")) {
        prefixes.add(attr.name.split(":")[0]);
      }
    }

    collectUsedPrefixes(child.children, prefixes);
  }
};

/** Collapse whitespace in text nodes. */
const collapseWhitespacePass = (children: MutableChild[]): MutableChild[] => {
  const result: MutableChild[] = [];
  for (const child of children) {
    if (child.type === "Text") {
      const collapsed = child.value.replace(/\s+/g, " ");
      if (collapsed === " " || collapsed === "") continue;
      result.push({ ...child, value: collapsed });
    } else if (child.type === "Element") {
      child.children = collapseWhitespacePass(child.children);
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

const serializeXmlDocument = (
  doc: { doctype?: { name: string; publicId?: string; systemId?: string } },
  children: MutableChild[],
): string => {
  let result = "";

  if (doc.doctype) {
    result += `<!DOCTYPE ${doc.doctype.name}`;
    if (doc.doctype.publicId !== undefined) {
      result += ` PUBLIC "${doc.doctype.publicId}"`;
      if (doc.doctype.systemId !== undefined) {
        result += ` "${doc.doctype.systemId}"`;
      }
    } else if (doc.doctype.systemId !== undefined) {
      result += ` SYSTEM "${doc.doctype.systemId}"`;
    }
    result += ">";
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

  if (el.selfClosing || el.children.length === 0) {
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
  const quote = attr.quote ?? '"';
  return `${attr.name}=${quote}${attr.value}${quote}`;
};
