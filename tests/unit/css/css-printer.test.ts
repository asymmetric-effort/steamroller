/**
 * @module tests/unit/css/css-printer
 * @description Unit tests for the CSS printer: pretty-print and minified output.
 */

import { describe, it, expect } from "vitest";
import { printCSS } from "../../../src/css/css-printer.js";
import { parseCSS } from "../../../src/css/css-parser.js";

describe("printCSS - pretty-print mode", () => {
  it("prints a simple rule with proper formatting", () => {
    const ast = parseCSS(".button { color: red; }");
    const output = printCSS(ast);
    expect(output).toContain(".button");
    expect(output).toContain("color:");
    expect(output).toContain("red");
    expect(output).toContain("{");
    expect(output).toContain("}");
  });

  it("prints nested at-rules", () => {
    const ast = parseCSS("@media (max-width: 768px) { .a { color: red; } }");
    const output = printCSS(ast);
    expect(output).toContain("@media");
    expect(output).toContain(".a");
    expect(output).toContain("color:");
  });

  it("prints comments", () => {
    const ast = parseCSS("/* hello */ .a { color: red; }");
    const output = printCSS(ast);
    expect(output).toContain("/* hello */");
  });

  it("preserves !important", () => {
    const ast = parseCSS(".a { color: red !important; }");
    const output = printCSS(ast);
    expect(output).toContain("!important");
  });

  it("prints multiple selectors", () => {
    const ast = parseCSS("h1, h2 { color: red; }");
    const output = printCSS(ast);
    expect(output).toContain("h1");
    expect(output).toContain("h2");
  });
});

describe("printCSS - minified mode", () => {
  it("removes whitespace and newlines", () => {
    const ast = parseCSS(".button {\n  color: red;\n  font-size: 16px;\n}");
    const output = printCSS(ast, { minify: true });
    expect(output).not.toContain("\n");
    // Should have minimal whitespace
    expect(output.length).toBeLessThan(50);
  });

  it("removes comments in minified mode", () => {
    const ast = parseCSS("/* comment */ .a { color: red; }");
    const output = printCSS(ast, { minify: true });
    expect(output).not.toContain("comment");
  });

  it("produces valid CSS in minified mode", () => {
    const ast = parseCSS("@media (max-width: 768px) { .a { color: red; } }");
    const output = printCSS(ast, { minify: true });
    expect(output).toContain("@media");
    expect(output).toContain(".a");
    expect(output).toContain("color:");
    expect(output).toContain("red");
  });
});

describe("printCSS - custom indent", () => {
  it("uses custom indentation string", () => {
    const ast = parseCSS(".a { color: red; }");
    const output = printCSS(ast, { indent: "\t" });
    expect(output).toContain("\tcolor:");
  });
});

describe("printCSS - round-trip", () => {
  it("round-trips a simple stylesheet", () => {
    const input = ".button { color: red; }";
    const ast = parseCSS(input);
    const output = printCSS(ast);
    const ast2 = parseCSS(output);
    expect(ast2.rules.length).toBe(ast.rules.length);
  });
});
