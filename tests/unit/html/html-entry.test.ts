/**
 * @module tests/unit/html/html-entry
 * @description Unit tests for HTML dependency extraction: script, link, img,
 * and various attribute patterns.
 */

import { describe, it, expect } from "vitest";
import { parseHtml } from "../../../src/html/html-parser.js";
import { extractHtmlDependencies } from "../../../src/html/html-entry.js";

describe("HTML Entry / Dependency Extraction", () => {
  // ============================================================
  // Script dependencies
  // ============================================================

  it("extracts script src dependencies", () => {
    const doc = parseHtml('<script src="app.js"></script>');
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(1);
    expect(deps[0].type).toBe("script");
    expect(deps[0].specifier).toBe("app.js");
  });

  it("extracts module script dependencies", () => {
    const doc = parseHtml('<script type="module" src="main.mjs"></script>');
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(1);
    expect(deps[0].type).toBe("module");
    expect(deps[0].specifier).toBe("main.mjs");
  });

  it("ignores inline scripts without src", () => {
    const doc = parseHtml("<script>console.log('hi');</script>");
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(0);
  });

  // ============================================================
  // Link dependencies
  // ============================================================

  it("extracts stylesheet link dependencies", () => {
    const doc = parseHtml('<link rel="stylesheet" href="style.css">');
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(1);
    expect(deps[0].type).toBe("stylesheet");
    expect(deps[0].specifier).toBe("style.css");
  });

  it("extracts preload link dependencies", () => {
    const doc = parseHtml('<link rel="preload" href="font.woff2" as="font">');
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(1);
    expect(deps[0].type).toBe("preload");
    expect(deps[0].specifier).toBe("font.woff2");
  });

  it("extracts icon link dependencies", () => {
    const doc = parseHtml('<link rel="icon" href="favicon.ico">');
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(1);
    expect(deps[0].type).toBe("icon");
    expect(deps[0].specifier).toBe("favicon.ico");
  });

  it("extracts modulepreload link dependencies", () => {
    const doc = parseHtml('<link rel="modulepreload" href="lib.mjs">');
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(1);
    expect(deps[0].type).toBe("module");
    expect(deps[0].specifier).toBe("lib.mjs");
  });

  // ============================================================
  // Image dependencies
  // ============================================================

  it("extracts img src dependencies", () => {
    const doc = parseHtml('<img src="photo.jpg" alt="Photo">');
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(1);
    expect(deps[0].type).toBe("image");
    expect(deps[0].specifier).toBe("photo.jpg");
  });

  it("ignores img without src", () => {
    const doc = parseHtml('<img alt="placeholder">');
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(0);
  });

  // ============================================================
  // Multiple and nested dependencies
  // ============================================================

  it("extracts multiple dependencies from a full document", () => {
    const html = `
      <html>
        <head>
          <link rel="stylesheet" href="style.css">
          <script src="vendor.js"></script>
        </head>
        <body>
          <img src="hero.png">
          <script type="module" src="app.mjs"></script>
        </body>
      </html>
    `;
    const doc = parseHtml(html);
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(4);
    expect(deps[0].type).toBe("stylesheet");
    expect(deps[1].type).toBe("script");
    expect(deps[2].type).toBe("image");
    expect(deps[3].type).toBe("module");
  });

  it("includes location information on dependencies", () => {
    const doc = parseHtml('<script src="app.js"></script>');
    const deps = extractHtmlDependencies(doc);
    expect(deps[0].loc).toBeDefined();
    expect(deps[0].loc.start.offset).toBe(0);
    expect(deps[0].loc.start.line).toBe(1);
  });

  it("includes attributes on dependencies", () => {
    const doc = parseHtml('<script src="app.js" defer async></script>');
    const deps = extractHtmlDependencies(doc);
    expect(deps[0].attributes).toHaveLength(3);
    const names = deps[0].attributes.map((a) => a.name);
    expect(names).toContain("src");
    expect(names).toContain("defer");
    expect(names).toContain("async");
  });

  it("extracts prefetch link dependencies", () => {
    const doc = parseHtml('<link rel="prefetch" href="next-page.js">');
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(1);
    expect(deps[0].type).toBe("prefetch");
    expect(deps[0].specifier).toBe("next-page.js");
  });

  it("handles mixed case attribute names", () => {
    const doc = parseHtml('<SCRIPT SRC="app.js"></SCRIPT>');
    const deps = extractHtmlDependencies(doc);
    expect(deps).toHaveLength(1);
    expect(deps[0].specifier).toBe("app.js");
  });
});
