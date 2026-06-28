/**
 * @module tests/unit/optimize/xml-optimizer
 * @description Unit tests for the XML optimizer: comment removal,
 * whitespace collapsing, and unused namespace removal.
 */

import { describe, it, expect } from "bun:test";
import { optimizeXml } from "../../../src/optimize/xml-optimizer.js";

describe("XML Optimizer", () => {
  // ============================================================
  // removeComments
  // ============================================================

  it("removes XML comments", () => {
    const input = "<root><!-- comment --><child/></root>";
    const result = optimizeXml(input);
    expect(result).not.toContain("<!-- comment -->");
    expect(result).toContain("<child/>");
  });

  it("removes nested comments", () => {
    const input = "<root><parent><!-- nested --><child/></parent></root>";
    const result = optimizeXml(input);
    expect(result).not.toContain("nested");
  });

  it("preserves comments when disabled", () => {
    const input = "<root><!-- keep --><child/></root>";
    const result = optimizeXml(input, { removeComments: false });
    expect(result).toContain("<!-- keep -->");
  });

  // ============================================================
  // collapseWhitespace
  // ============================================================

  it("collapses whitespace in text nodes", () => {
    const input = "<root>  hello   world  </root>";
    const result = optimizeXml(input);
    expect(result).not.toMatch(/  /);
  });

  it("removes whitespace-only text nodes", () => {
    const input = "<root>\n  <child/>\n</root>";
    const result = optimizeXml(input);
    expect(result).not.toContain("\n");
  });

  it("preserves whitespace when disabled", () => {
    const input = "<root>  hello   world  </root>";
    const result = optimizeXml(input, { collapseWhitespace: false });
    expect(result).toContain("  hello   world  ");
  });

  // ============================================================
  // removeUnusedNamespaces
  // ============================================================

  it("removes unused xmlns:* declarations", () => {
    const input = '<root xmlns:unused="http://example.com"><child/></root>';
    const result = optimizeXml(input);
    expect(result).not.toContain("xmlns:unused");
  });

  it("preserves used namespace declarations", () => {
    const input = '<root xmlns:ns="http://example.com"><ns:child/></root>';
    const result = optimizeXml(input);
    expect(result).toContain("xmlns:ns");
  });

  it("preserves namespaces used in attributes", () => {
    const input =
      '<root xmlns:app="http://example.com"><child app:type="test"/></root>';
    const result = optimizeXml(input);
    expect(result).toContain("xmlns:app");
  });

  // ============================================================
  // Combined and edge cases
  // ============================================================

  it("handles a complex XML document", () => {
    const input = `<!-- header comment -->
<root xmlns:unused="http://example.com" xmlns:ns="http://example.org">
  <!-- inner comment -->
  <ns:child>  hello   world  </ns:child>
  <other/>
</root>`;
    const result = optimizeXml(input);
    expect(result).not.toContain("<!-- header");
    expect(result).not.toContain("<!-- inner");
    expect(result).not.toContain("xmlns:unused");
    expect(result).toContain("xmlns:ns");
    expect(result).not.toMatch(/  /);
  });

  it("handles empty elements", () => {
    const input = "<root><empty/></root>";
    const result = optimizeXml(input);
    expect(result).toContain("<empty/>");
  });

  it("can disable all optimizations", () => {
    const input =
      '<!-- comment --><root xmlns:ns="http://example.com">\n  <child/>\n</root>';
    const result = optimizeXml(input, {
      removeComments: false,
      collapseWhitespace: false,
      removeUnusedNamespaces: false,
    });
    expect(result).toContain("<!-- comment -->");
    expect(result).toContain("\n");
    expect(result).toContain("xmlns:ns");
  });
});
