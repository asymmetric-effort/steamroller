/**
 * @module html/html-printer
 * @description HTML/XML AST-to-markup serializer with pretty-print and minified modes.
 * Supports configurable indentation and whitespace control.
 */

import type {
  HtmlDocument,
  Element,
  Attribute,
  HtmlChildNode,
} from "./html-ast.js";

// ============================================================
// Printer options
// ============================================================

/** Options for the HTML printer. */
export interface HtmlPrinterOptions {
  /** Whether to minify the output (collapse whitespace, remove optional whitespace). */
  readonly minify?: boolean;
  /** Indentation string for pretty-print mode. Defaults to "  " (two spaces). */
  readonly indent?: string;
}

// ============================================================
// Constants
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

// ============================================================
// Printer
// ============================================================

/**
 * Print an HTML/XML AST back to markup.
 *
 * @param ast - The HtmlDocument AST to print.
 * @param options - Printer options.
 * @returns The serialized markup string.
 */
export const printHtml = (
  ast: HtmlDocument,
  options?: HtmlPrinterOptions,
): string => {
  const printer = new HtmlPrinter(ast.mode, options);
  return printer.printDocument(ast);
};

/**
 * HTML/XML AST serializer.
 */
class HtmlPrinter {
  private readonly mode: "html" | "xml";
  private readonly minify: boolean;
  private readonly indentStr: string;
  private depth: number;

  constructor(mode: "html" | "xml", options?: HtmlPrinterOptions) {
    this.mode = mode;
    this.minify = options?.minify ?? false;
    this.indentStr = options?.indent ?? "  ";
    this.depth = 0;
  }

  private get newline(): string {
    return this.minify ? "" : "\n";
  }

  private indent(): string {
    if (this.minify) {
      return "";
    }
    return this.indentStr.repeat(this.depth);
  }

  printDocument(doc: HtmlDocument): string {
    let result = "";

    // XML declaration
    if (this.mode === "xml" && !this.minify) {
      result += `<?xml version="1.0" encoding="UTF-8"?>${this.newline}`;
    }

    // Doctype
    if (doc.doctype) {
      result += this.printDoctype(doc.doctype);
    }

    // Children
    for (const child of doc.children) {
      result += this.printChild(child);
    }

    return result;
  }

  private printDoctype(doctype: {
    readonly name: string;
    readonly publicId?: string;
    readonly systemId?: string;
  }): string {
    let result = `<!DOCTYPE ${doctype.name}`;
    if (doctype.publicId !== undefined) {
      result += ` PUBLIC "${doctype.publicId}"`;
      if (doctype.systemId !== undefined) {
        result += ` "${doctype.systemId}"`;
      }
    } else if (doctype.systemId !== undefined) {
      result += ` SYSTEM "${doctype.systemId}"`;
    }
    result += `>${this.newline}`;
    return result;
  }

  private printChild(node: HtmlChildNode): string {
    switch (node.type) {
      case "Element":
        return this.printElement(node);
      case "Text":
        return this.printText(node.value);
      case "Comment":
        return this.printComment(node.value);
      case "CdataSection":
        return `${this.indent()}<![CDATA[${node.value}]]>${this.newline}`;
      case "ProcessingInstruction":
        return `${this.indent()}<?${node.target} ${node.data}?>${this.newline}`;
      default:
        return "";
    }
  }

  private printElement(el: Element): string {
    const ind = this.indent();
    let result = `${ind}<${el.tagName}`;

    // Attributes
    for (const attr of el.attributes) {
      result += ` ${this.printAttribute(attr)}`;
    }

    // Self-closing or void
    if (
      el.selfClosing ||
      (this.mode === "html" && VOID_ELEMENTS.has(el.tagName))
    ) {
      if (this.mode === "xml") {
        result += ` />${this.newline}`;
      } else {
        result += `>${this.newline}`;
      }
      return result;
    }

    result += ">";

    // If no children, close immediately
    if (el.children.length === 0) {
      result += `</${el.tagName}>${this.newline}`;
      return result;
    }

    // If all children are text nodes and short, inline them
    const allText = el.children.length === 1 && el.children[0].type === "Text";
    if (allText && !this.minify) {
      result += el.children[0].type === "Text" ? el.children[0].value : "";
      result += `</${el.tagName}>${this.newline}`;
      return result;
    }

    if (allText && this.minify) {
      result += el.children[0].type === "Text" ? el.children[0].value : "";
      result += `</${el.tagName}>`;
      return result;
    }

    result += this.newline;
    this.depth++;
    for (const child of el.children) {
      result += this.printChild(child);
    }
    this.depth--;
    result += `${this.indent()}</${el.tagName}>${this.newline}`;

    return result;
  }

  private printAttribute(attr: Attribute): string {
    if (attr.value === null) {
      return attr.name;
    }
    const quote = attr.quote ?? '"';
    return `${attr.name}=${quote}${attr.value}${quote}`;
  }

  private printText(value: string): string {
    if (this.minify) {
      // In minify mode, collapse whitespace-only text to nothing
      if (value.trim().length === 0) {
        return "";
      }
      return value.trim();
    }
    // In pretty mode, if the text is only whitespace, collapse it
    if (value.trim().length === 0) {
      return "";
    }
    return `${this.indent()}${value.trim()}${this.newline}`;
  }

  private printComment(value: string): string {
    if (this.minify) {
      return "";
    }
    return `${this.indent()}<!--${value}-->${this.newline}`;
  }
}
