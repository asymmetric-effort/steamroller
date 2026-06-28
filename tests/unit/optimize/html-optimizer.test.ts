/**
 * @module tests/unit/optimize/html-optimizer
 * @description Unit tests for the HTML optimizer: comment removal,
 * whitespace collapsing, boolean attribute shortening, quote removal,
 * empty attribute removal, and redundant attribute removal.
 */

import { describe, it, expect } from "bun:test";
import { optimizeHtml } from "../../../src/optimize/html-optimizer.js";

describe("HTML Optimizer", () => {
  // ============================================================
  // removeComments
  // ============================================================

  it("removes HTML comments", () => {
    const input = "<div><!-- comment --><p>hello</p></div>";
    const result = optimizeHtml(input);
    expect(result).not.toContain("<!-- comment -->");
    expect(result).toContain("<p>");
  });

  it("preserves conditional comments", () => {
    const input =
      "<div><!--[if IE]><p>old browser</p><![endif]--><p>hello</p></div>";
    const result = optimizeHtml(input);
    expect(result).toContain("[if IE]");
  });

  it("removes nested comments", () => {
    const input = "<div><span><!-- nested --></span></div>";
    const result = optimizeHtml(input);
    expect(result).not.toContain("nested");
  });

  // ============================================================
  // collapseWhitespace
  // ============================================================

  it("collapses whitespace in text nodes", () => {
    const input = "<div>  hello   world  </div>";
    const result = optimizeHtml(input);
    expect(result).toContain(" hello world ");
    expect(result).not.toMatch(/  /);
  });

  it("preserves whitespace in pre elements", () => {
    const input = "<pre>  hello   world  </pre>";
    const result = optimizeHtml(input);
    expect(result).toContain("  hello   world  ");
  });

  it("preserves whitespace in code elements", () => {
    const input = "<code>  var x = 1;  </code>";
    const result = optimizeHtml(input);
    expect(result).toContain("  var x = 1;  ");
  });

  it("preserves whitespace in textarea elements", () => {
    const input = "<textarea>  hello   world  </textarea>";
    const result = optimizeHtml(input);
    expect(result).toContain("  hello   world  ");
  });

  // ============================================================
  // shortenBooleanAttrs
  // ============================================================

  it('shortens checked="checked" to checked', () => {
    const input = '<input checked="checked">';
    const result = optimizeHtml(input);
    expect(result).toContain(" checked");
    expect(result).not.toContain('checked="checked"');
  });

  it('shortens disabled="disabled" to disabled', () => {
    const input = '<input disabled="disabled">';
    const result = optimizeHtml(input);
    expect(result).toContain(" disabled");
    expect(result).not.toContain('disabled="disabled"');
  });

  it('shortens readonly="true" to readonly', () => {
    const input = '<input readonly="true">';
    const result = optimizeHtml(input);
    expect(result).toContain(" readonly");
    expect(result).not.toContain('="true"');
  });

  // ============================================================
  // removeAttributeQuotes
  // ============================================================

  it("removes quotes from simple attribute values", () => {
    const input = '<div class="foo"></div>';
    const result = optimizeHtml(input);
    expect(result).toContain("class=foo");
  });

  it("keeps quotes for values with spaces", () => {
    const input = '<div class="foo bar"></div>';
    const result = optimizeHtml(input);
    expect(result).toContain('class="foo bar"');
  });

  it("keeps quotes for values with special characters", () => {
    const input = '<a href="https://example.com?a=1&b=2"></a>';
    const result = optimizeHtml(input);
    expect(result).toContain('"');
  });

  // ============================================================
  // removeEmptyAttributes
  // ============================================================

  it('removes empty class=""', () => {
    const input = '<div class=""></div>';
    const result = optimizeHtml(input);
    expect(result).not.toContain("class");
  });

  it('removes empty id=""', () => {
    const input = '<div id=""></div>';
    const result = optimizeHtml(input);
    expect(result).not.toContain("id");
  });

  it('removes empty style=""', () => {
    const input = '<div style=""></div>';
    const result = optimizeHtml(input);
    expect(result).not.toContain("style");
  });

  // ============================================================
  // removeRedundantAttributes
  // ============================================================

  it('removes type="text/javascript" from script', () => {
    const input = '<script type="text/javascript">var x = 1;</script>';
    const result = optimizeHtml(input);
    expect(result).not.toContain("text/javascript");
    expect(result).toContain("<script>");
  });

  it('removes type="text/css" from style', () => {
    const input = '<style type="text/css">body{}</style>';
    const result = optimizeHtml(input);
    expect(result).not.toContain("text/css");
  });

  it('removes method="get" from form', () => {
    const input = '<form method="get"></form>';
    const result = optimizeHtml(input);
    expect(result).not.toContain("method");
  });

  it('removes type="text" from input', () => {
    const input = '<input type="text">';
    const result = optimizeHtml(input);
    expect(result).not.toContain("type");
  });

  // ============================================================
  // Combined and edge cases
  // ============================================================

  it("handles a full HTML document", () => {
    const input = `<!DOCTYPE html>
<html>
  <head>
    <!-- meta -->
    <script type="text/javascript" src="app.js"></script>
  </head>
  <body>
    <div class="container">
      <input type="text" disabled="disabled">
    </div>
  </body>
</html>`;
    const result = optimizeHtml(input);
    expect(result).not.toContain("<!-- meta -->");
    expect(result).not.toContain("text/javascript");
    expect(result).not.toContain('type="text"');
    expect(result).not.toContain('disabled="disabled"');
    expect(result).toContain("<!DOCTYPE html>");
  });

  it("handles empty input", () => {
    const result = optimizeHtml("");
    expect(result).toBe("");
  });

  it("can disable all optimizations", () => {
    const input =
      '<!-- comment --><div class="" style=""><input checked="checked"></div>';
    const result = optimizeHtml(input, {
      removeComments: false,
      collapseWhitespace: false,
      shortenBooleanAttrs: false,
      removeAttributeQuotes: false,
      removeEmptyAttributes: false,
      removeRedundantAttributes: false,
    });
    expect(result).toContain("<!-- comment -->");
    expect(result).toContain('checked="checked"');
    expect(result).toContain('class=""');
  });
});
