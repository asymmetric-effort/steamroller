/**
 * @module optimize/svg-optimizer
 * @description SVGO-inspired, zero-dependency SVG optimizer.
 * Applies a configurable set of optimization passes to SVG markup.
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

/** Options for SVG optimization passes. */
export interface SvgOptimizeOptions {
  /** Remove XML comments. Default: true */
  readonly removeComments?: boolean;
  /** Remove DOCTYPE declarations. Default: true */
  readonly removeDoctype?: boolean;
  /** Remove XML declarations (<?xml ...?>). Default: true */
  readonly removeXmlDeclaration?: boolean;
  /** Remove <metadata> elements. Default: true */
  readonly removeMetadata?: boolean;
  /** Remove empty <g> elements. Default: true */
  readonly removeEmptyGroups?: boolean;
  /** Unwrap single-child <g> elements with no attributes. Default: true */
  readonly collapseGroups?: boolean;
  /** Remove attributes matching SVG defaults. Default: true */
  readonly removeDefaultAttrs?: boolean;
  /** Remove unreferenced xmlns:* declarations. Default: true */
  readonly removeUnusedNamespaces?: boolean;
  /** Sort attributes for deterministic output. Default: true */
  readonly sortAttrs?: boolean;
  /** Shorten long IDs to sequential short names. Default: true */
  readonly shortenIds?: boolean;
  /** Optimize path d="..." data. Default: true */
  readonly convertPathData?: boolean;
  /** Clean up numeric values (0.5 -> .5, etc.). Default: true */
  readonly cleanupNumericValues?: boolean;
  /** Collapse whitespace in text nodes. Default: true */
  readonly collapseWhitespace?: boolean;
  /** Decimal precision for path data. Default: 3 */
  readonly precision?: number;
}

// ============================================================
// Default attribute values in SVG
// ============================================================

/** Attributes that can be removed when they match SVG defaults. */
const SVG_DEFAULT_ATTRS: Readonly<Record<string, string>> = {
  fill: "black",
  stroke: "none",
  "stroke-width": "1",
  "stroke-linecap": "butt",
  "stroke-linejoin": "miter",
  "stroke-dashoffset": "0",
  "stroke-opacity": "1",
  "fill-opacity": "1",
  "fill-rule": "nonzero",
  opacity: "1",
  "clip-rule": "nonzero",
  display: "inline",
  visibility: "visible",
  overflow: "visible",
};

/** Canonical attribute ordering for sortAttrs. */
const ATTR_ORDER: ReadonlyArray<string> = [
  "id",
  "class",
  "xmlns",
  "x",
  "y",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
  "viewBox",
  "d",
  "fill",
  "stroke",
  "stroke-width",
  "transform",
  "style",
];

// ============================================================
// ID shortener
// ============================================================

/** Generate a short sequential ID: a, b, ..., z, aa, ab, ... */
const generateShortId = (index: number): string => {
  let result = "";
  let n = index;
  do {
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return result;
};

// ============================================================
// Numeric cleanup helpers
// ============================================================

/** Clean a numeric string: 0.5->.5, 1.000->1, 0px->0 */
const cleanNumericValue = (value: string): string => {
  return value.replace(
    /(-?\d+\.?\d*)(px|pt|em|rem|%)?/g,
    (_match, numStr: string, unit: string | undefined) => {
      const num = parseFloat(numStr);
      if (isNaN(num)) return _match;

      // 0px -> 0 (drop units on zero)
      if (num === 0 && unit) return "0";

      let cleaned = String(num);

      // 0.5 -> .5
      if (cleaned.startsWith("0.")) {
        cleaned = cleaned.slice(1);
      }
      // -0.5 -> -.5
      if (cleaned.startsWith("-0.")) {
        cleaned = "-" + cleaned.slice(2);
      }

      return cleaned + (unit ?? "");
    },
  );
};

// ============================================================
// Path data optimizer
// ============================================================

/** Optimize SVG path data string. */
const optimizePathData = (d: string, precision: number): string => {
  // Remove redundant whitespace
  let result = d.replace(/\s+/g, " ").trim();

  // Remove spaces after command letters
  result = result.replace(/([MmLlHhVvCcSsQqTtAaZz])\s+/g, "$1");

  // Remove spaces before command letters
  result = result.replace(/\s+([MmLlHhVvCcSsQqTtAaZz])/g, "$1");

  // Use comma as separator, then clean
  result = result.replace(/\s*,\s*/g, ",");

  // Replace space between numbers with comma
  result = result.replace(/(\d)\s+(\d)/g, "$1,$2");
  result = result.replace(/(\d)\s+(-)/g, "$1,$2");

  // Reduce precision of numbers
  const factor = Math.pow(10, precision);
  result = result.replace(/-?\d+\.?\d*/g, (match) => {
    const num = parseFloat(match);
    if (isNaN(num)) return match;
    const rounded = Math.round(num * factor) / factor;
    let s = String(rounded);
    // Clean leading zeros: 0.5 -> .5
    if (s.startsWith("0.")) s = s.slice(1);
    if (s.startsWith("-0.")) s = "-" + s.slice(2);
    return s;
  });

  // Remove trailing zeros after decimal point
  result = result.replace(/(\.\d*?)0+(?=\D|$)/g, "$1");
  result = result.replace(/\.(?=\D|$)/g, "");

  return result;
};

// ============================================================
// Core optimizer
// ============================================================

/**
 * Optimize an SVG string.
 *
 * @param source - The SVG source markup.
 * @param options - Optimization options.
 * @returns The optimized SVG string.
 */
export const optimizeSvg = (
  source: string,
  options?: SvgOptimizeOptions,
): string => {
  const opts: Required<SvgOptimizeOptions> = {
    removeComments: options?.removeComments ?? true,
    removeDoctype: options?.removeDoctype ?? true,
    removeXmlDeclaration: options?.removeXmlDeclaration ?? true,
    removeMetadata: options?.removeMetadata ?? true,
    removeEmptyGroups: options?.removeEmptyGroups ?? true,
    collapseGroups: options?.collapseGroups ?? true,
    removeDefaultAttrs: options?.removeDefaultAttrs ?? true,
    removeUnusedNamespaces: options?.removeUnusedNamespaces ?? true,
    sortAttrs: options?.sortAttrs ?? true,
    shortenIds: options?.shortenIds ?? true,
    convertPathData: options?.convertPathData ?? true,
    cleanupNumericValues: options?.cleanupNumericValues ?? true,
    collapseWhitespace: options?.collapseWhitespace ?? true,
    precision: options?.precision ?? 3,
  };

  const doc = parseHtml(source, { mode: "xml", recover: true });

  // Build mutable working tree
  let children = cloneChildren(doc.children);

  // 1. removeXmlDeclaration — strip <?xml ...?> PIs
  if (opts.removeXmlDeclaration) {
    children = children.filter(
      (n) => !(n.type === "ProcessingInstruction" && n.target === "xml"),
    );
  }

  // 2. removeDoctype (handled at document level — doc.doctype)
  // We'll just skip doctype in output

  // 3. removeComments
  if (opts.removeComments) {
    children = filterDeep(children, (n) => n.type !== "Comment");
  }

  // 4. removeMetadata
  if (opts.removeMetadata) {
    children = filterDeep(
      children,
      (n) => !(n.type === "Element" && n.tagName === "metadata"),
    );
  }

  // 5. removeEmptyGroups
  if (opts.removeEmptyGroups) {
    children = removeEmptyGroups(children);
  }

  // 6. collapseGroups
  if (opts.collapseGroups) {
    children = collapseGroupsPass(children);
  }

  // 7. shortenIds — collect ID map, rename
  let idMap: Map<string, string> | undefined;
  if (opts.shortenIds) {
    idMap = buildIdMap(children);
    if (idMap.size > 0) {
      children = renameIds(children, idMap);
    }
  }

  // 8. removeDefaultAttrs
  if (opts.removeDefaultAttrs) {
    children = mapElements(children, (el) => removeDefaultAttrsFromElement(el));
  }

  // 9. removeUnusedNamespaces
  if (opts.removeUnusedNamespaces) {
    children = mapElements(children, (el) =>
      removeUnusedNamespacesFromElement(el, children),
    );
  }

  // 10. sortAttrs
  if (opts.sortAttrs) {
    children = mapElements(children, (el) => sortAttrsOnElement(el));
  }

  // 11. convertPathData
  if (opts.convertPathData) {
    children = mapElements(children, (el) =>
      convertPathDataOnElement(el, opts.precision),
    );
  }

  // 12. cleanupNumericValues
  if (opts.cleanupNumericValues) {
    children = mapElements(children, (el) => cleanupNumericOnElement(el));
  }

  // 13. collapseWhitespace
  if (opts.collapseWhitespace) {
    children = collapseWhitespacePass(children);
  }

  // Serialize back to string
  const docForPrint: MutableDoc = {
    mode: "xml",
    doctype: opts.removeDoctype ? undefined : doc.doctype,
    children,
  };

  return serializeDocument(docForPrint);
};

// ============================================================
// Mutable node types for in-memory transformations
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

interface MutableDoc {
  mode: "html" | "xml";
  doctype?: HtmlDocument["doctype"];
  children: MutableChild[];
}

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
// Tree transformation helpers
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

/** Remove empty <g> elements recursively. */
const removeEmptyGroups = (children: MutableChild[]): MutableChild[] => {
  const result: MutableChild[] = [];
  for (const child of children) {
    if (child.type === "Element") {
      child.children = removeEmptyGroups(child.children);
      // Skip empty <g> elements
      if (child.tagName === "g" && child.children.length === 0) {
        continue;
      }
    }
    result.push(child);
  }
  return result;
};

/** Collapse single-child <g> elements with no meaningful attributes. */
const collapseGroupsPass = (children: MutableChild[]): MutableChild[] => {
  const result: MutableChild[] = [];
  for (const child of children) {
    if (child.type === "Element") {
      child.children = collapseGroupsPass(child.children);
      // Unwrap single-child <g> with no attributes (or only xmlns attrs)
      if (
        child.tagName === "g" &&
        child.children.length === 1 &&
        child.attributes.filter((a) => !a.name.startsWith("xmlns")).length === 0
      ) {
        result.push(child.children[0]);
        continue;
      }
    }
    result.push(child);
  }
  return result;
};

/** Build a map of old IDs to short sequential IDs. */
const buildIdMap = (children: MutableChild[]): Map<string, string> => {
  const ids: string[] = [];
  collectIds(children, ids);

  // Only shorten IDs that are longer than the replacement would be
  const map = new Map<string, string>();
  let index = 0;
  for (const id of ids) {
    const shortId = generateShortId(index);
    if (shortId.length < id.length) {
      map.set(id, shortId);
      index++;
    }
  }
  return map;
};

const collectIds = (children: MutableChild[], ids: string[]): void => {
  for (const child of children) {
    if (child.type === "Element") {
      for (const attr of child.attributes) {
        if (attr.name === "id" && attr.value !== null) {
          ids.push(attr.value);
        }
      }
      collectIds(child.children, ids);
    }
  }
};

/** Rename IDs and update url(#id) references. */
const renameIds = (
  children: MutableChild[],
  idMap: Map<string, string>,
): MutableChild[] => {
  return children.map((child) => {
    if (child.type !== "Element") return child;

    child.attributes = child.attributes.map((attr) => {
      // Rename id attribute values
      if (attr.name === "id" && attr.value !== null && idMap.has(attr.value)) {
        return { ...attr, value: idMap.get(attr.value)! };
      }
      // Update url(#id) references in attribute values
      if (attr.value !== null) {
        let newValue = attr.value;
        for (const [oldId, newId] of idMap) {
          newValue = newValue.replace(
            new RegExp(`url\\(#${escapeRegExp(oldId)}\\)`, "g"),
            `url(#${newId})`,
          );
          // Also handle href="#id" and xlink:href="#id"
          if (
            (attr.name === "href" || attr.name === "xlink:href") &&
            newValue === `#${oldId}`
          ) {
            newValue = `#${newId}`;
          }
        }
        if (newValue !== attr.value) {
          return { ...attr, value: newValue };
        }
      }
      return attr;
    });

    child.children = renameIds(child.children, idMap);
    return child;
  });
};

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Remove attributes that match SVG defaults. */
const removeDefaultAttrsFromElement = (el: MutableElement): MutableElement => {
  el.attributes = el.attributes.filter((attr) => {
    const defaultValue = SVG_DEFAULT_ATTRS[attr.name];
    if (defaultValue !== undefined && attr.value === defaultValue) {
      return false;
    }
    return true;
  });
  return el;
};

/** Remove unused xmlns:* namespace declarations from the root SVG element. */
const removeUnusedNamespacesFromElement = (
  el: MutableElement,
  allChildren: MutableChild[],
): MutableElement => {
  if (el.tagName !== "svg") return el;

  const usedPrefixes = new Set<string>();
  collectUsedPrefixes(allChildren, usedPrefixes);

  el.attributes = el.attributes.filter((attr) => {
    if (attr.name.startsWith("xmlns:")) {
      const prefix = attr.name.slice(6);
      // Always keep xmlns:xlink if xlink:href is used
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

    // Check tag name for prefix
    if (child.tagName.includes(":")) {
      prefixes.add(child.tagName.split(":")[0]);
    }

    // Check attributes for prefix usage
    for (const attr of child.attributes) {
      if (attr.name.includes(":") && !attr.name.startsWith("xmlns:")) {
        prefixes.add(attr.name.split(":")[0]);
      }
    }

    collectUsedPrefixes(child.children, prefixes);
  }
};

/** Sort attributes in canonical order. */
const sortAttrsOnElement = (el: MutableElement): MutableElement => {
  el.attributes = [...el.attributes].sort((a, b) => {
    const aIdx = ATTR_ORDER.indexOf(a.name);
    const bIdx = ATTR_ORDER.indexOf(b.name);
    const aOrder = aIdx === -1 ? ATTR_ORDER.length : aIdx;
    const bOrder = bIdx === -1 ? ATTR_ORDER.length : bIdx;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });
  return el;
};

/** Optimize path d attribute data. */
const convertPathDataOnElement = (
  el: MutableElement,
  precision: number,
): MutableElement => {
  if (el.tagName !== "path") return el;
  el.attributes = el.attributes.map((attr) => {
    if (attr.name === "d" && attr.value !== null) {
      return { ...attr, value: optimizePathData(attr.value, precision) };
    }
    return attr;
  });
  return el;
};

/** Clean up numeric values in attributes. */
const cleanupNumericOnElement = (el: MutableElement): MutableElement => {
  const numericAttrs = new Set([
    "x",
    "y",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "x1",
    "y1",
    "x2",
    "y2",
    "width",
    "height",
    "stroke-width",
    "stroke-dashoffset",
    "stroke-opacity",
    "fill-opacity",
    "opacity",
    "font-size",
    "dx",
    "dy",
  ]);

  el.attributes = el.attributes.map((attr) => {
    if (attr.value !== null && numericAttrs.has(attr.name)) {
      return { ...attr, value: cleanNumericValue(attr.value) };
    }
    return attr;
  });
  return el;
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

const serializeDocument = (doc: MutableDoc): string => {
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

  for (const child of doc.children) {
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
