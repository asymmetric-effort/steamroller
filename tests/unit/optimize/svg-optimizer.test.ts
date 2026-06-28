/**
 * @module tests/unit/optimize/svg-optimizer
 * @description Unit tests for the SVG optimizer: all optimization passes
 * including comment removal, metadata removal, group handling, ID shortening,
 * path data optimization, numeric cleanup, attribute sorting, and more.
 */

import { describe, it, expect } from "bun:test";
import { optimizeSvg } from "../../../src/optimize/svg-optimizer.js";

describe("SVG Optimizer", () => {
  // ============================================================
  // removeComments
  // ============================================================

  it("removes XML comments", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><!-- comment --><rect/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("<!-- comment -->");
    expect(result).toContain("<rect/>");
  });

  it("removes nested comments", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><!-- nested --><rect/></g></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("nested");
    expect(result).toContain("<rect/>");
  });

  it("preserves comments when disabled", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><!-- keep --><rect/></svg>';
    const result = optimizeSvg(input, { removeComments: false });
    expect(result).toContain("<!-- keep -->");
  });

  // ============================================================
  // removeXmlDeclaration
  // ============================================================

  it("removes XML declaration", () => {
    const input =
      '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("<?xml");
  });

  it("preserves XML declaration when disabled", () => {
    const input =
      '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const result = optimizeSvg(input, { removeXmlDeclaration: false });
    expect(result).toContain("<?xml");
  });

  // ============================================================
  // removeDoctype
  // ============================================================

  it("removes DOCTYPE declaration", () => {
    const input =
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("DOCTYPE");
  });

  // ============================================================
  // removeMetadata
  // ============================================================

  it("removes metadata elements", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><metadata><rdf:RDF/></metadata><rect/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("metadata");
    expect(result).toContain("<rect/>");
  });

  it("preserves metadata when disabled", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><metadata>data</metadata><rect/></svg>';
    const result = optimizeSvg(input, { removeMetadata: false });
    expect(result).toContain("metadata");
  });

  // ============================================================
  // removeEmptyGroups
  // ============================================================

  it("removes empty g elements", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><g></g><rect/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("<g");
    expect(result).toContain("<rect/>");
  });

  it("removes nested empty g elements", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><g></g></g><rect/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("<g");
  });

  // ============================================================
  // collapseGroups
  // ============================================================

  it("unwraps single-child g with no attributes", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><rect/></g></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("<g>");
    expect(result).toContain("<rect/>");
  });

  it("does not collapse g with attributes", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(10,10)"><rect/></g></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain("<g");
    expect(result).toContain("transform");
  });

  it("does not collapse g with multiple children", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><g><rect/><circle/></g></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain("<g>");
  });

  // ============================================================
  // removeDefaultAttrs
  // ============================================================

  it('removes fill="black" default', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="black"/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain('fill="black"');
    expect(result).toContain("<rect/>");
  });

  it('removes stroke="none" default', () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect stroke="none"/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain('stroke="none"');
  });

  it("preserves non-default fill values", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="red"/></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain('fill="red"');
  });

  // ============================================================
  // removeUnusedNamespaces
  // ============================================================

  it("removes unused xmlns:* declarations", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:unused="http://example.com"><rect/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("xmlns:unused");
  });

  it("preserves used xmlns:xlink when xlink:href is present", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#foo"/></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain("xmlns:xlink");
  });

  // ============================================================
  // sortAttrs
  // ============================================================

  it("sorts attributes in canonical order", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="red" width="10" id="r1" height="20"/></svg>';
    const result = optimizeSvg(input);
    const rectMatch = result.match(/<rect[^/]*/);
    expect(rectMatch).not.toBeNull();
    const rectStr = rectMatch![0];
    const idPos = rectStr.indexOf("id=");
    const widthPos = rectStr.indexOf("width=");
    const heightPos = rectStr.indexOf("height=");
    const fillPos = rectStr.indexOf("fill=");
    expect(idPos).toBeLessThan(widthPos);
    expect(widthPos).toBeLessThan(heightPos);
    expect(heightPos).toBeLessThan(fillPos);
  });

  // ============================================================
  // shortenIds
  // ============================================================

  it("shortens long IDs to sequential names", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect id="longIdentifierName"/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("longIdentifierName");
    expect(result).toContain('id="a"');
  });

  it("updates url(#id) references when IDs are shortened", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="myGradient"/></defs><rect fill="url(#myGradient)"/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("myGradient");
    expect(result).toContain('id="a"');
    expect(result).toContain("url(#a)");
  });

  it("updates href references when IDs are shortened", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="longSymbolId"/><use href="#longSymbolId"/></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain('href="#a"');
  });

  it("does not shorten already-short IDs", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect id="a"/></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain('id="a"');
  });

  // ============================================================
  // convertPathData
  // ============================================================

  it("optimizes path data by reducing precision", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 10.12345 20.67890 L 30.11111 40.22222"/></svg>';
    const result = optimizeSvg(input);
    expect(result).not.toContain("10.12345");
    expect(result).toContain("10.123");
  });

  it("removes redundant whitespace in path data", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M  10  20  L  30  40"/></svg>';
    const result = optimizeSvg(input);
    // Should not have multiple consecutive spaces
    expect(result).not.toMatch(/d="[^"]*  /);
  });

  it("handles path with Z command", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 0 0 L 10 0 L 10 10 Z"/></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain("Z");
  });

  // ============================================================
  // cleanupNumericValues
  // ============================================================

  it("cleans 0.5 to .5", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5"/></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain('x=".5"');
    expect(result).toContain('y=".5"');
  });

  it("cleans 1.000 to 1", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1.000"/></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain('width="1"');
  });

  it("cleans 0px to 0", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect stroke-width="0px"/></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain('stroke-width="0"');
  });

  // ============================================================
  // collapseWhitespace
  // ============================================================

  it("collapses whitespace in text nodes", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>  hello   world  </text></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain("hello world");
    expect(result).not.toMatch(/  /);
  });

  it("removes whitespace-only text nodes", () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg">\n  <rect/>\n</svg>';
    const result = optimizeSvg(input);
    expect(result).not.toMatch(/\n/);
  });

  // ============================================================
  // Combined optimizations
  // ============================================================

  it("handles a complex SVG with multiple optimizations", () => {
    const input = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Test -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:unused="http://example.com">
  <metadata><title>Test</title></metadata>
  <g>
    <g>
      <rect id="myRectangle" fill="black" width="0.500" height="1.000"/>
    </g>
  </g>
</svg>`;
    const result = optimizeSvg(input);
    expect(result).not.toContain("<?xml");
    expect(result).not.toContain("<!-- Generator");
    expect(result).not.toContain("metadata");
    expect(result).not.toContain("xmlns:unused");
    expect(result).not.toContain("myRectangle");
    expect(result).not.toContain('fill="black"');
    expect(result).toContain(".5");
    expect(result).toContain('width=".5"');
  });

  it("produces valid SVG output", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';
    const result = optimizeSvg(input);
    expect(result).toContain("<svg");
    expect(result).toContain("</svg>");
    expect(result).toContain("circle");
  });

  it("handles empty SVG", () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"/>';
    const result = optimizeSvg(input);
    expect(result).toContain("svg");
  });

  // ============================================================
  // Options disable
  // ============================================================

  it("can disable all optimizations", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg"><!-- comment --><rect id="longIdentifier" fill="black"/></svg>';
    const result = optimizeSvg(input, {
      removeComments: false,
      removeDoctype: false,
      removeXmlDeclaration: false,
      removeMetadata: false,
      removeEmptyGroups: false,
      collapseGroups: false,
      removeDefaultAttrs: false,
      removeUnusedNamespaces: false,
      sortAttrs: false,
      shortenIds: false,
      convertPathData: false,
      cleanupNumericValues: false,
      collapseWhitespace: false,
    });
    expect(result).toContain("<!-- comment -->");
    expect(result).toContain('fill="black"');
  });
});
