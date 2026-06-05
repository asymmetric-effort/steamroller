/**
 * @module tests/unit/html/html-printer
 * @description Unit tests for the HTML/XML printer: pretty-print mode,
 * minified mode, and round-trip fidelity.
 */

import { describe, it, expect } from "vitest";
import { parseHtml } from "../../../src/html/html-parser.js";
import { printHtml } from "../../../src/html/html-printer.js";
import type { Element, Text } from "../../../src/html/html-ast.js";

describe("HTML Printer", () => {
  // ============================================================
  // Pretty-print mode
  // ============================================================

  it("pretty-prints a simple element", () => {
    const doc = parseHtml("<div></div>");
    const result = printHtml(doc);
    expect(result).toContain("<div>");
    expect(result).toContain("</div>");
  });

  it("pretty-prints nested elements with indentation", () => {
    const doc = parseHtml("<div><span>text</span></div>");
    const result = printHtml(doc);
    expect(result).toContain("<div>");
    expect(result).toContain("  <span>");
    expect(result).toContain("</div>");
  });

  it("pretty-prints with custom indent", () => {
    const doc = parseHtml("<div><span>text</span></div>");
    const result = printHtml(doc, { indent: "\t" });
    expect(result).toContain("\t<span>");
  });

  it("pretty-prints attributes", () => {
    const doc = parseHtml('<div class="foo" id="bar"></div>');
    const result = printHtml(doc);
    expect(result).toContain('class="foo"');
    expect(result).toContain('id="bar"');
  });

  it("pretty-prints void elements without closing tags", () => {
    const doc = parseHtml("<br><hr>");
    const result = printHtml(doc);
    expect(result).toContain("<br>");
    expect(result).toContain("<hr>");
    expect(result).not.toContain("</br>");
    expect(result).not.toContain("</hr>");
  });

  it("pretty-prints comments", () => {
    const doc = parseHtml("<!-- hello -->");
    const result = printHtml(doc);
    expect(result).toContain("<!-- hello -->");
  });

  it("pretty-prints doctype", () => {
    const doc = parseHtml("<!DOCTYPE html><html></html>");
    const result = printHtml(doc);
    expect(result).toContain("<!DOCTYPE html>");
  });

  // ============================================================
  // Minified mode
  // ============================================================

  it("minifies output by removing unnecessary whitespace", () => {
    const doc = parseHtml("<div>\n  <span>text</span>\n</div>");
    const result = printHtml(doc, { minify: true });
    expect(result).not.toContain("\n");
    expect(result).toContain("<div>");
    expect(result).toContain("<span>text</span>");
  });

  it("strips comments in minified mode", () => {
    const doc = parseHtml("<!-- comment --><div></div>");
    const result = printHtml(doc, { minify: true });
    expect(result).not.toContain("<!--");
    expect(result).toContain("<div>");
  });

  it("minifies a full document", () => {
    const html = '<div class="a"><p>text</p></div>';
    const doc = parseHtml(html);
    const result = printHtml(doc, { minify: true });
    expect(result).not.toContain("\n");
    expect(result).toContain('<div class="a">');
    expect(result).toContain("<p>text</p>");
  });

  // ============================================================
  // XML mode printing
  // ============================================================

  it("prints self-closing tags in XML mode", () => {
    const doc = parseHtml("<root><empty /></root>", { mode: "xml" });
    const result = printHtml(doc);
    expect(result).toContain("<empty />");
  });

  it("prints XML declaration in XML mode", () => {
    const doc = parseHtml("<root></root>", { mode: "xml" });
    const result = printHtml(doc);
    expect(result).toContain("<?xml");
  });

  // ============================================================
  // Round-trip: parse -> print -> parse
  // ============================================================

  it("round-trips a simple element", () => {
    const html = "<div></div>";
    const doc1 = parseHtml(html);
    const printed = printHtml(doc1);
    const doc2 = parseHtml(printed);
    const elements = doc2.children.filter((c) => c.type === "Element");
    expect(elements).toHaveLength(1);
    expect((elements[0] as Element).tagName).toBe("div");
  });

  it("round-trips nested elements", () => {
    const html = '<div class="a"><span>hello</span></div>';
    const doc1 = parseHtml(html);
    const printed = printHtml(doc1);
    const doc2 = parseHtml(printed);
    const elements = doc2.children.filter((c) => c.type === "Element");
    const div = elements[0] as Element;
    expect(div.tagName).toBe("div");
    expect(div.attributes[0].value).toBe("a");
    const span = div.children.find((c) => c.type === "Element") as Element;
    expect(span.tagName).toBe("span");
  });

  it("round-trips void elements", () => {
    const html = '<img src="a.png"><br>';
    const doc1 = parseHtml(html);
    const printed = printHtml(doc1);
    const doc2 = parseHtml(printed);
    const elements = doc2.children.filter((c) => c.type === "Element");
    expect(elements).toHaveLength(2);
    expect((elements[0] as Element).tagName).toBe("img");
    expect((elements[1] as Element).tagName).toBe("br");
  });

  it("round-trips elements with multiple attributes", () => {
    const html = '<input type="text" name="q" value="search">';
    const doc1 = parseHtml(html);
    const printed = printHtml(doc1);
    const doc2 = parseHtml(printed);
    const elements = doc2.children.filter((c) => c.type === "Element");
    const input = elements[0] as Element;
    expect(input.attributes).toHaveLength(3);
    expect(input.attributes[0].value).toBe("text");
    expect(input.attributes[1].value).toBe("q");
    expect(input.attributes[2].value).toBe("search");
  });
});
