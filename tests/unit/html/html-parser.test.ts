/**
 * @module tests/unit/html/html-parser
 * @description Unit tests for the HTML/XML parser: elements, attributes,
 * nesting, void elements, optional closing tags, raw text elements,
 * XML mode, namespaces, CDATA, processing instructions, error recovery,
 * and position tracking.
 */

import { describe, it, expect } from "vitest";
import { parseHtml } from "../../../src/html/html-parser.js";
import type { Element, Text, Comment } from "../../../src/html/html-ast.js";

describe("HTML Parser", () => {
  // ============================================================
  // Basic elements and attributes
  // ============================================================

  it("parses a simple element", () => {
    const doc = parseHtml("<div></div>");
    expect(doc.mode).toBe("html");
    expect(doc.children).toHaveLength(1);
    expect(doc.children[0].type).toBe("Element");
    const el = doc.children[0] as Element;
    expect(el.tagName).toBe("div");
    expect(el.children).toHaveLength(0);
  });

  it("parses nested elements", () => {
    const doc = parseHtml("<div><span>hello</span></div>");
    const div = doc.children[0] as Element;
    expect(div.tagName).toBe("div");
    expect(div.children).toHaveLength(1);
    const span = div.children[0] as Element;
    expect(span.tagName).toBe("span");
    expect(span.children).toHaveLength(1);
    expect((span.children[0] as Text).value).toBe("hello");
  });

  it("parses deeply nested elements", () => {
    const doc = parseHtml("<div><ul><li><a>link</a></li></ul></div>");
    const div = doc.children[0] as Element;
    const ul = div.children[0] as Element;
    const li = ul.children[0] as Element;
    const a = li.children[0] as Element;
    expect(a.tagName).toBe("a");
    expect((a.children[0] as Text).value).toBe("link");
  });

  it("parses element with text content", () => {
    const doc = parseHtml("<p>Hello, world!</p>");
    const p = doc.children[0] as Element;
    expect(p.tagName).toBe("p");
    expect(p.children).toHaveLength(1);
    const text = p.children[0] as Text;
    expect(text.type).toBe("Text");
    expect(text.value).toBe("Hello, world!");
  });

  it("parses quoted attributes", () => {
    const doc = parseHtml('<div class="foo" id="bar"></div>');
    const el = doc.children[0] as Element;
    expect(el.attributes).toHaveLength(2);
    expect(el.attributes[0].name).toBe("class");
    expect(el.attributes[0].value).toBe("foo");
    expect(el.attributes[0].quote).toBe('"');
    expect(el.attributes[1].name).toBe("id");
    expect(el.attributes[1].value).toBe("bar");
  });

  it("parses single-quoted attributes", () => {
    const doc = parseHtml("<div class='foo'></div>");
    const el = doc.children[0] as Element;
    expect(el.attributes[0].value).toBe("foo");
    expect(el.attributes[0].quote).toBe("'");
  });

  it("parses boolean attributes", () => {
    const doc = parseHtml("<input disabled readonly>");
    const el = doc.children[0] as Element;
    expect(el.attributes).toHaveLength(2);
    expect(el.attributes[0].name).toBe("disabled");
    expect(el.attributes[0].value).toBeNull();
    expect(el.attributes[1].name).toBe("readonly");
    expect(el.attributes[1].value).toBeNull();
  });

  it("parses unquoted attributes", () => {
    const doc = parseHtml("<div class=foo></div>");
    const el = doc.children[0] as Element;
    expect(el.attributes[0].name).toBe("class");
    expect(el.attributes[0].value).toBe("foo");
    expect(el.attributes[0].quote).toBeNull();
  });

  it("normalizes HTML tag names to lowercase", () => {
    const doc = parseHtml("<DIV><SPAN></SPAN></DIV>");
    const el = doc.children[0] as Element;
    expect(el.tagName).toBe("div");
    const span = el.children[0] as Element;
    expect(span.tagName).toBe("span");
  });

  // ============================================================
  // Void elements
  // ============================================================

  it("handles void elements without closing tags", () => {
    const doc = parseHtml("<br><hr><img><input>");
    expect(doc.children).toHaveLength(4);
    for (const child of doc.children) {
      const el = child as Element;
      expect(el.selfClosing).toBe(true);
      expect(el.children).toHaveLength(0);
    }
  });

  it("handles void elements with self-closing syntax", () => {
    const doc = parseHtml("<br /><img />");
    expect(doc.children).toHaveLength(2);
    expect((doc.children[0] as Element).tagName).toBe("br");
    expect((doc.children[1] as Element).tagName).toBe("img");
  });

  it("handles void elements with attributes", () => {
    const doc = parseHtml(
      '<meta charset="utf-8"><link rel="stylesheet" href="style.css">',
    );
    expect(doc.children).toHaveLength(2);
    const meta = doc.children[0] as Element;
    expect(meta.tagName).toBe("meta");
    expect(meta.attributes[0].name).toBe("charset");
    const link = doc.children[1] as Element;
    expect(link.tagName).toBe("link");
    expect(link.attributes).toHaveLength(2);
  });

  // ============================================================
  // Optional closing tags
  // ============================================================

  it("auto-closes <p> when another block element opens", () => {
    const doc = parseHtml("<p>one<p>two");
    expect(doc.children).toHaveLength(2);
    const p1 = doc.children[0] as Element;
    const p2 = doc.children[1] as Element;
    expect(p1.tagName).toBe("p");
    expect((p1.children[0] as Text).value).toBe("one");
    expect(p2.tagName).toBe("p");
    expect((p2.children[0] as Text).value).toBe("two");
  });

  it("auto-closes <li> when another <li> opens", () => {
    const doc = parseHtml("<ul><li>one<li>two<li>three</ul>");
    const ul = doc.children[0] as Element;
    expect(ul.children).toHaveLength(3);
    for (const child of ul.children) {
      expect((child as Element).tagName).toBe("li");
    }
  });

  it("auto-closes <td> when another <td> opens", () => {
    const doc = parseHtml("<table><tr><td>a<td>b</tr></table>");
    const table = doc.children[0] as Element;
    const tr = table.children[0] as Element;
    expect(tr.children).toHaveLength(2);
    expect((tr.children[0] as Element).tagName).toBe("td");
    expect((tr.children[1] as Element).tagName).toBe("td");
  });

  it("auto-closes <dt>/<dd> siblings", () => {
    const doc = parseHtml("<dl><dt>term<dd>def<dt>term2<dd>def2</dl>");
    const dl = doc.children[0] as Element;
    expect(dl.children).toHaveLength(4);
    expect((dl.children[0] as Element).tagName).toBe("dt");
    expect((dl.children[1] as Element).tagName).toBe("dd");
    expect((dl.children[2] as Element).tagName).toBe("dt");
    expect((dl.children[3] as Element).tagName).toBe("dd");
  });

  it("auto-closes <option> siblings", () => {
    const doc = parseHtml("<select><option>a<option>b<option>c</select>");
    const select = doc.children[0] as Element;
    expect(select.children).toHaveLength(3);
    for (const child of select.children) {
      expect((child as Element).tagName).toBe("option");
    }
  });

  // ============================================================
  // Raw text elements (script/style)
  // ============================================================

  it("parses script content as raw text", () => {
    const doc = parseHtml('<script>const x = "<div>";</script>');
    const script = doc.children[0] as Element;
    expect(script.tagName).toBe("script");
    expect(script.children).toHaveLength(1);
    const text = script.children[0] as Text;
    expect(text.value).toBe('const x = "<div>";');
  });

  it("parses style content as raw text", () => {
    const doc = parseHtml("<style>div > p { color: red; }</style>");
    const style = doc.children[0] as Element;
    expect(style.tagName).toBe("style");
    expect(style.children).toHaveLength(1);
    const text = style.children[0] as Text;
    expect(text.value).toBe("div > p { color: red; }");
  });

  it("handles empty script element", () => {
    const doc = parseHtml("<script></script>");
    const script = doc.children[0] as Element;
    expect(script.tagName).toBe("script");
    expect(script.children).toHaveLength(0);
  });

  it("handles script with attributes", () => {
    const doc = parseHtml('<script type="module" src="app.js"></script>');
    const script = doc.children[0] as Element;
    expect(script.attributes).toHaveLength(2);
    expect(script.attributes[0].name).toBe("type");
    expect(script.attributes[0].value).toBe("module");
  });

  // ============================================================
  // Comments
  // ============================================================

  it("parses HTML comments", () => {
    const doc = parseHtml("<!-- this is a comment -->");
    expect(doc.children).toHaveLength(1);
    const comment = doc.children[0] as Comment;
    expect(comment.type).toBe("Comment");
    expect(comment.value).toBe(" this is a comment ");
  });

  it("parses comments between elements", () => {
    const doc = parseHtml("<div></div><!-- between --><span></span>");
    expect(doc.children).toHaveLength(3);
    expect(doc.children[0].type).toBe("Element");
    expect(doc.children[1].type).toBe("Comment");
    expect(doc.children[2].type).toBe("Element");
  });

  // ============================================================
  // Doctype
  // ============================================================

  it("parses HTML5 doctype", () => {
    const doc = parseHtml("<!DOCTYPE html><html></html>");
    expect(doc.doctype).toBeDefined();
    expect(doc.doctype!.name).toBe("html");
  });

  it("parses doctype with public and system identifiers", () => {
    const doc = parseHtml(
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">',
    );
    expect(doc.doctype).toBeDefined();
    expect(doc.doctype!.publicId).toBe("-//W3C//DTD XHTML 1.0 Strict//EN");
    expect(doc.doctype!.systemId).toBe(
      "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd",
    );
  });

  // ============================================================
  // XML mode: namespaces
  // ============================================================

  it("parses XML with namespace prefixes", () => {
    const doc = parseHtml(
      '<root xmlns:ns="http://example.com"><ns:child /></root>',
      {
        mode: "xml",
      },
    );
    const root = doc.children[0] as Element;
    expect(root.tagName).toBe("root");
    const child = root.children[0] as Element;
    expect(child.tagName).toBe("ns:child");
    expect(child.namespace).toBe("ns");
    expect(child.selfClosing).toBe(true);
  });

  it("preserves case in XML mode", () => {
    const doc = parseHtml("<Root><ChildNode /></Root>", { mode: "xml" });
    const root = doc.children[0] as Element;
    expect(root.tagName).toBe("Root");
    const child = root.children[0] as Element;
    expect(child.tagName).toBe("ChildNode");
  });

  it("parses XML attributes with namespaces", () => {
    const doc = parseHtml('<root xml:lang="en"></root>', { mode: "xml" });
    const root = doc.children[0] as Element;
    expect(root.attributes[0].name).toBe("xml:lang");
    expect(root.attributes[0].namespace).toBe("xml");
    expect(root.attributes[0].value).toBe("en");
  });

  // ============================================================
  // XML mode: CDATA
  // ============================================================

  it("parses CDATA sections in XML mode", () => {
    const doc = parseHtml("<root><![CDATA[some <data> & more]]></root>", {
      mode: "xml",
    });
    const root = doc.children[0] as Element;
    expect(root.children).toHaveLength(1);
    expect(root.children[0].type).toBe("CdataSection");
    expect(
      root.children[0].type === "CdataSection" && root.children[0].value,
    ).toBe("some <data> & more");
  });

  // ============================================================
  // XML mode: Processing Instructions
  // ============================================================

  it("parses processing instructions", () => {
    const doc = parseHtml('<?xml version="1.0"?><root></root>', {
      mode: "xml",
    });
    expect(doc.children).toHaveLength(2);
    expect(doc.children[0].type).toBe("ProcessingInstruction");
    if (doc.children[0].type === "ProcessingInstruction") {
      expect(doc.children[0].target).toBe("xml");
      expect(doc.children[0].data).toBe('version="1.0"');
    }
  });

  it("parses processing instruction with complex data", () => {
    const doc = parseHtml(
      '<?xml-stylesheet type="text/xsl" href="style.xsl"?><root></root>',
      {
        mode: "xml",
      },
    );
    const pi = doc.children[0];
    expect(pi.type).toBe("ProcessingInstruction");
    if (pi.type === "ProcessingInstruction") {
      expect(pi.target).toBe("xml-stylesheet");
    }
  });

  // ============================================================
  // XML mode: strict well-formedness
  // ============================================================

  it("throws on mismatched tags in XML mode without recovery", () => {
    expect(() => {
      parseHtml("<root><child></wrong></root>", { mode: "xml" });
    }).toThrow();
  });

  it("throws on unclosed elements in XML mode without recovery", () => {
    expect(() => {
      parseHtml("<root><child>", { mode: "xml" });
    }).toThrow();
  });

  // ============================================================
  // Error recovery
  // ============================================================

  it("recovers from mismatched closing tags", () => {
    const doc = parseHtml("<div><span></div>", {
      mode: "html",
      recover: true,
    });
    expect(doc.children.length).toBeGreaterThanOrEqual(1);
  });

  it("recovers from stray closing tags at document level", () => {
    const doc = parseHtml("</div><p>text</p>", {
      mode: "html",
      recover: true,
    });
    expect(doc.children.length).toBeGreaterThanOrEqual(1);
  });

  it("recovers from unclosed elements in XML mode", () => {
    const doc = parseHtml("<root><child>", {
      mode: "xml",
      recover: true,
    });
    expect(doc.children.length).toBeGreaterThanOrEqual(1);
  });

  // ============================================================
  // Position tracking
  // ============================================================

  it("tracks position for elements", () => {
    const doc = parseHtml("<div></div>");
    const el = doc.children[0] as Element;
    expect(el.loc.start.offset).toBe(0);
    expect(el.loc.start.line).toBe(1);
    expect(el.loc.start.column).toBe(0);
    expect(el.loc.end.offset).toBe(11);
  });

  it("tracks position across multiple lines", () => {
    const source = "<div>\n  <span></span>\n</div>";
    const doc = parseHtml(source);
    const div = doc.children[0] as Element;
    expect(div.loc.start.line).toBe(1);
    // The span is on line 2
    const span = div.children[1] as Element;
    expect(span.loc.start.line).toBe(2);
  });

  it("tracks position for attributes", () => {
    const doc = parseHtml('<div class="foo"></div>');
    const el = doc.children[0] as Element;
    expect(el.attributes[0].loc.start.offset).toBe(5);
  });

  it("tracks position for text nodes", () => {
    const doc = parseHtml("<p>hello</p>");
    const p = doc.children[0] as Element;
    const text = p.children[0] as Text;
    expect(text.loc.start.offset).toBe(3);
    expect(text.loc.end.offset).toBe(8);
  });

  it("tracks position for comments", () => {
    const doc = parseHtml("<!-- comment -->");
    const comment = doc.children[0] as Comment;
    expect(comment.loc.start.offset).toBe(0);
    expect(comment.loc.end.offset).toBe(16);
  });

  // ============================================================
  // Edge cases
  // ============================================================

  it("handles empty input", () => {
    const doc = parseHtml("");
    expect(doc.children).toHaveLength(0);
  });

  it("handles text-only input", () => {
    const doc = parseHtml("hello world");
    expect(doc.children).toHaveLength(1);
    expect(doc.children[0].type).toBe("Text");
  });

  it("handles multiple root elements", () => {
    const doc = parseHtml("<div></div><span></span>");
    expect(doc.children).toHaveLength(2);
  });

  it("handles whitespace between elements", () => {
    const doc = parseHtml("<div> </div>");
    const el = doc.children[0] as Element;
    expect(el.children).toHaveLength(1);
    expect((el.children[0] as Text).value).toBe(" ");
  });

  it("parses a full HTML document", () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Test</title>
</head>
<body>
  <h1>Hello</h1>
  <p>World</p>
</body>
</html>`;
    const doc = parseHtml(html);
    expect(doc.doctype).toBeDefined();
    expect(doc.doctype!.name).toBe("html");
    expect(doc.children.length).toBeGreaterThanOrEqual(1);
  });
});
