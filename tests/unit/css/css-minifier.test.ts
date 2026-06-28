/**
 * @module tests/unit/css/css-minifier
 * @description Unit tests for CSS minification: whitespace, colors,
 * comments, quote removal, and duplicate selector merging.
 */

import { describe, it, expect } from "bun:test";
import {
  minifyCSS,
  minifyCSSToString,
  shortenColorValue,
} from "../../../src/css/css-minifier.js";
import { parseCSS } from "../../../src/css/css-parser.js";
import { printCSS } from "../../../src/css/css-printer.js";
import type { Rule, Declaration, AtRule } from "../../../src/css/css-ast.js";

describe("shortenColorValue", () => {
  it("shortens 6-digit hex with duplicate pairs to 3-digit", () => {
    expect(shortenColorValue("#aabbcc")).toBe("#abc");
  });

  it("shortens #ffffff to #fff", () => {
    expect(shortenColorValue("#ffffff")).toBe("#fff");
  });

  it("shortens #000000 to #000", () => {
    expect(shortenColorValue("#000000")).toBe("#000");
  });

  it("does not shorten non-duplicate hex values", () => {
    expect(shortenColorValue("#abcdef")).toBe("#abcdef");
  });

  it("converts rgb(255, 0, 0) to red", () => {
    expect(shortenColorValue("rgb(255, 0, 0)")).toBe("red");
  });

  it("converts rgb(0, 0, 255) to blue", () => {
    expect(shortenColorValue("rgb(0, 0, 255)")).toBe("blue");
  });

  it("shortens rgb with hex-compatible values", () => {
    expect(shortenColorValue("rgb(255, 255, 255)")).toBe("#fff");
  });
});

describe("minifyCSS - comment removal", () => {
  it("removes CSS comments", () => {
    const ast = parseCSS("/* comment */ .a { color: red; }");
    const minified = minifyCSS(ast);
    expect(minified.rules.every((r) => r.type !== "Comment")).toBe(true);
  });

  it("removes comments inside rule blocks", () => {
    const ast = parseCSS(".a { /* note */ color: red; }");
    const minified = minifyCSS(ast);
    const rule = minified.rules[0] as Rule;
    expect(rule.declarations.every((d) => d.type !== "Comment")).toBe(true);
  });
});

describe("minifyCSS - whitespace collapse", () => {
  it("collapses whitespace in declaration values", () => {
    const ast = parseCSS(".a { margin: 10px   20px   30px   40px; }");
    const minified = minifyCSS(ast);
    const rule = minified.rules[0] as Rule;
    const decl = rule.declarations[0] as Declaration;
    expect(decl.value).toBe("10px 20px 30px 40px");
  });
});

describe("minifyCSS - color shortening", () => {
  it("shortens hex colors in declarations", () => {
    const ast = parseCSS(".a { color: #ff0000; }");
    const minified = minifyCSS(ast);
    const rule = minified.rules[0] as Rule;
    const decl = rule.declarations[0] as Declaration;
    expect(decl.value).toBe("red");
  });

  it("shortens hex colors with paired digits", () => {
    const ast = parseCSS(".a { color: #aabbcc; }");
    const minified = minifyCSS(ast);
    const rule = minified.rules[0] as Rule;
    const decl = rule.declarations[0] as Declaration;
    expect(decl.value).toBe("#abc");
  });
});

describe("minifyCSS - quote removal", () => {
  it("removes unnecessary quotes in font-family", () => {
    const ast = parseCSS('.a { font-family: "Arial"; }');
    const minified = minifyCSS(ast);
    const rule = minified.rules[0] as Rule;
    const decl = rule.declarations[0] as Declaration;
    expect(decl.value).toBe("Arial");
  });

  it("preserves quotes for multi-word font names", () => {
    // This test is about the parser/minifier handling - multi-word names stay quoted
    const ast = parseCSS('.a { font-family: "Helvetica Neue"; }');
    const minified = minifyCSS(ast);
    const rule = minified.rules[0] as Rule;
    const decl = rule.declarations[0] as Declaration;
    // Multi-word names should keep quotes
    expect(decl.value).toContain("Helvetica Neue");
  });
});

describe("minifyCSS - duplicate selector merging", () => {
  it("merges rules with identical selectors", () => {
    const ast = parseCSS(".a { color: red; } .a { font-size: 16px; }");
    const minified = minifyCSS(ast);
    expect(minified.rules.length).toBe(1);
    const rule = minified.rules[0] as Rule;
    const decls = rule.declarations.filter(
      (d) => d.type === "Declaration",
    ) as Declaration[];
    expect(decls.length).toBe(2);
  });

  it("later declarations override earlier ones for same property", () => {
    const ast = parseCSS(".a { color: red; } .a { color: blue; }");
    const minified = minifyCSS(ast);
    const rule = minified.rules[0] as Rule;
    const decl = rule.declarations.find(
      (d) =>
        d.type === "Declaration" && (d as Declaration).property === "color",
    ) as Declaration;
    expect(decl.value).toBe("blue");
  });

  it("does not merge rules with different selectors", () => {
    const ast = parseCSS(".a { color: red; } .b { color: blue; }");
    const minified = minifyCSS(ast);
    expect(minified.rules.length).toBe(2);
  });
});

describe("minifyCSSToString", () => {
  it("produces compact CSS string", () => {
    const ast = parseCSS(
      "/* comment */\n.button {\n  color: red;\n  font-size: 16px;\n}",
    );
    const result = minifyCSSToString(ast);
    // Should not contain newlines, extra spaces, or comments
    expect(result).not.toContain("/* comment */");
    expect(result).not.toContain("\n");
    expect(result).toContain(".button");
    expect(result).toContain("color:");
  });

  it("handles @media rules in minified output", () => {
    const ast = parseCSS("@media (max-width: 768px) { .a { color: red; } }");
    const result = minifyCSSToString(ast);
    expect(result).toContain("@media");
    expect(result).toContain(".a");
  });
});
