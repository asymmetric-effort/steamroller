/**
 * @module html/html-entry
 * @description Dependency extraction from HTML documents.
 * Extracts script src, link href, img src, and other resource references
 * from a parsed HTML AST for use as bundler entry points.
 */

import type { HtmlDocument, Element, HtmlLocation } from "./html-ast.js";

// ============================================================
// Dependency types
// ============================================================

/** The type of an extracted HTML dependency. */
export type HtmlDependencyType =
  | "script"
  | "stylesheet"
  | "image"
  | "preload"
  | "prefetch"
  | "icon"
  | "module"
  | "import"
  | "other";

/** A dependency extracted from an HTML document. */
export interface HtmlDependency {
  /** The type of dependency. */
  readonly type: HtmlDependencyType;
  /** The specifier (URL or path) of the dependency. */
  readonly specifier: string;
  /** Additional attributes from the source element. */
  readonly attributes: ReadonlyArray<{
    readonly name: string;
    readonly value: string | null;
  }>;
  /** Source location of the element that references this dependency. */
  readonly loc: HtmlLocation;
}

// ============================================================
// Extraction
// ============================================================

/**
 * Extract all dependencies from an HTML document AST.
 *
 * @param doc - The parsed HtmlDocument.
 * @returns Array of extracted HtmlDependency objects.
 */
export const extractHtmlDependencies = (
  doc: HtmlDocument,
): ReadonlyArray<HtmlDependency> => {
  const deps: Array<HtmlDependency> = [];
  visitChildren(doc.children, deps);
  return deps;
};

/**
 * Recursively visit child nodes to extract dependencies.
 */
const visitChildren = (
  children: ReadonlyArray<Element | { readonly type: string }>,
  deps: Array<HtmlDependency>,
): void => {
  for (const child of children) {
    if (child.type === "Element") {
      visitElement(child as Element, deps);
    }
  }
};

/**
 * Visit an element and extract any dependency it declares.
 */
const visitElement = (el: Element, deps: Array<HtmlDependency>): void => {
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case "script":
      extractScriptDep(el, deps);
      break;
    case "link":
      extractLinkDep(el, deps);
      break;
    case "img":
      extractImgDep(el, deps);
      break;
    case "source":
      extractSourceDep(el, deps);
      break;
    case "video":
    case "audio":
      extractMediaDep(el, deps);
      break;
    case "a":
      extractAnchorDep(el, deps);
      break;
    default:
      break;
  }

  // Recurse into children
  visitChildren(el.children, deps);
};

/**
 * Get an attribute value by name (case-insensitive for HTML).
 */
const getAttr = (el: Element, name: string): string | null => {
  for (const attr of el.attributes) {
    if (attr.name.toLowerCase() === name.toLowerCase()) {
      return attr.value;
    }
  }
  return null;
};

/**
 * Convert element attributes to the simplified format.
 */
const attrPairs = (
  el: Element,
): ReadonlyArray<{ readonly name: string; readonly value: string | null }> =>
  el.attributes.map((a) => ({ name: a.name, value: a.value }));

/**
 * Extract dependency from a <script> element.
 */
const extractScriptDep = (el: Element, deps: Array<HtmlDependency>): void => {
  const src = getAttr(el, "src");
  if (src === null || src === "") {
    return;
  }

  const typeAttr = getAttr(el, "type");
  const isModule =
    typeAttr === "module" ||
    typeAttr === "importmap" ||
    typeAttr === "modulepreload";
  const depType: HtmlDependencyType = isModule ? "module" : "script";

  deps.push({
    type: depType,
    specifier: src,
    attributes: attrPairs(el),
    loc: el.loc,
  });
};

/**
 * Extract dependency from a <link> element.
 */
const extractLinkDep = (el: Element, deps: Array<HtmlDependency>): void => {
  const href = getAttr(el, "href");
  if (href === null || href === "") {
    return;
  }

  const rel = (getAttr(el, "rel") ?? "").toLowerCase();
  let depType: HtmlDependencyType;

  if (rel === "stylesheet") {
    depType = "stylesheet";
  } else if (rel === "preload") {
    depType = "preload";
  } else if (rel === "prefetch") {
    depType = "prefetch";
  } else if (
    rel === "icon" ||
    rel === "shortcut icon" ||
    rel === "apple-touch-icon"
  ) {
    depType = "icon";
  } else if (rel === "modulepreload") {
    depType = "module";
  } else {
    depType = "other";
  }

  deps.push({
    type: depType,
    specifier: href,
    attributes: attrPairs(el),
    loc: el.loc,
  });
};

/**
 * Extract dependency from an <img> element.
 */
const extractImgDep = (el: Element, deps: Array<HtmlDependency>): void => {
  const src = getAttr(el, "src");
  if (src === null || src === "") {
    return;
  }

  deps.push({
    type: "image",
    specifier: src,
    attributes: attrPairs(el),
    loc: el.loc,
  });
};

/**
 * Extract dependency from a <source> element.
 */
const extractSourceDep = (el: Element, deps: Array<HtmlDependency>): void => {
  const src = getAttr(el, "src") ?? getAttr(el, "srcset");
  if (src === null || src === "") {
    return;
  }

  deps.push({
    type: "other",
    specifier: src,
    attributes: attrPairs(el),
    loc: el.loc,
  });
};

/**
 * Extract dependency from a <video> or <audio> element.
 */
const extractMediaDep = (el: Element, deps: Array<HtmlDependency>): void => {
  const src = getAttr(el, "src");
  if (src === null || src === "") {
    return;
  }

  deps.push({
    type: "other",
    specifier: src,
    attributes: attrPairs(el),
    loc: el.loc,
  });
};

/**
 * Extract dependency from an <a> element with download attribute.
 */
const extractAnchorDep = (el: Element, deps: Array<HtmlDependency>): void => {
  const href = getAttr(el, "href");
  const download = getAttr(el, "download");
  if (href === null || href === "" || download === null) {
    return;
  }

  deps.push({
    type: "other",
    specifier: href,
    attributes: attrPairs(el),
    loc: el.loc,
  });
};
