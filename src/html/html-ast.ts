/**
 * @module html/html-ast
 * @description AST type definitions for the HTML/XML parser.
 * Covers documents, elements, attributes, text, comments,
 * CDATA sections, processing instructions, and doctypes.
 */

// ============================================================
// Position tracking
// ============================================================

/** Source position for an HTML AST node. */
export interface HtmlPosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

/** Location span for an HTML AST node. */
export interface HtmlLocation {
  readonly start: HtmlPosition;
  readonly end: HtmlPosition;
}

// ============================================================
// Base node
// ============================================================

/** Base interface for all HTML AST nodes. */
export interface HtmlBaseNode {
  readonly type: string;
  readonly loc: HtmlLocation;
}

// ============================================================
// Document (root)
// ============================================================

/** The root node of an HTML/XML AST. */
export interface HtmlDocument extends HtmlBaseNode {
  readonly type: "HtmlDocument";
  readonly mode: "html" | "xml";
  readonly doctype?: Doctype;
  readonly children: ReadonlyArray<HtmlChildNode>;
}

// ============================================================
// Elements
// ============================================================

/** An HTML/XML element node. */
export interface Element extends HtmlBaseNode {
  readonly type: "Element";
  readonly tagName: string;
  readonly namespace?: string;
  readonly attributes: ReadonlyArray<Attribute>;
  readonly children: ReadonlyArray<HtmlChildNode>;
  readonly selfClosing: boolean;
}

/** An attribute on an element. */
export interface Attribute extends HtmlBaseNode {
  readonly type: "Attribute";
  readonly name: string;
  readonly namespace?: string;
  readonly value: string | null;
  readonly quote: "'" | '"' | null;
}

// ============================================================
// Text and data nodes
// ============================================================

/** A text node. */
export interface Text extends HtmlBaseNode {
  readonly type: "Text";
  readonly value: string;
}

/** An HTML/XML comment node. */
export interface Comment extends HtmlBaseNode {
  readonly type: "Comment";
  readonly value: string;
}

/** A CDATA section (XML only). */
export interface CdataSection extends HtmlBaseNode {
  readonly type: "CdataSection";
  readonly value: string;
}

/** A processing instruction (XML). */
export interface ProcessingInstruction extends HtmlBaseNode {
  readonly type: "ProcessingInstruction";
  readonly target: string;
  readonly data: string;
}

/** A DOCTYPE declaration. */
export interface Doctype extends HtmlBaseNode {
  readonly type: "Doctype";
  readonly name: string;
  readonly publicId?: string;
  readonly systemId?: string;
}

// ============================================================
// Union types
// ============================================================

/** Any node that can appear as a child of an element or document. */
export type HtmlChildNode =
  | Element
  | Text
  | Comment
  | CdataSection
  | ProcessingInstruction;

/** Any node in the HTML AST. */
export type HtmlNode =
  | HtmlDocument
  | Element
  | Attribute
  | Text
  | Comment
  | CdataSection
  | ProcessingInstruction
  | Doctype;
