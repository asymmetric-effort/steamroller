/**
 * @module tests/unit/css/css-modules
 * @description Unit tests for CSS Modules: class scoping, composes,
 * :local() and :global() handling, and JS mapping generation.
 */

import { describe, it, expect } from "bun:test";
import {
  processCSSModule,
  scopeClassName,
  generateHash,
  generateJSMapping,
} from "../../../src/css/css-modules.js";
import { parseCSS } from "../../../src/css/css-parser.js";
import { printCSS } from "../../../src/css/css-printer.js";
import type { Rule, Declaration } from "../../../src/css/css-ast.js";

describe("generateHash", () => {
  it("produces consistent hashes for the same input", () => {
    const h1 = generateHash("test");
    const h2 = generateHash("test");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different inputs", () => {
    const h1 = generateHash("file1:button");
    const h2 = generateHash("file2:button");
    expect(h1).not.toBe(h2);
  });
});

describe("scopeClassName", () => {
  it("produces scoped name with hash suffix", () => {
    const scoped = scopeClassName("button", "/src/styles.module.css");
    expect(scoped).toMatch(/^button_[a-z0-9]+$/);
  });

  it("produces different scoped names for different files", () => {
    const s1 = scopeClassName("button", "/src/a.module.css");
    const s2 = scopeClassName("button", "/src/b.module.css");
    expect(s1).not.toBe(s2);
  });

  it("produces different scoped names for different classes", () => {
    const s1 = scopeClassName("button", "/src/a.module.css");
    const s2 = scopeClassName("header", "/src/a.module.css");
    expect(s1).not.toBe(s2);
  });
});

describe("processCSSModule - class scoping", () => {
  it("scopes simple class names", () => {
    const ast = parseCSS(".button { color: red; }");
    const result = processCSSModule(ast, "/src/styles.module.css");
    expect(result.mapping).toHaveProperty("button");
    expect(result.mapping.button).toMatch(/^button_[a-z0-9]+$/);
  });

  it("scopes multiple class names", () => {
    const ast = parseCSS(".button { color: red; } .header { color: blue; }");
    const result = processCSSModule(ast, "/src/styles.module.css");
    expect(Object.keys(result.mapping).length).toBe(2);
    expect(result.mapping).toHaveProperty("button");
    expect(result.mapping).toHaveProperty("header");
  });

  it("produces scoped selectors in the output AST", () => {
    const ast = parseCSS(".button { color: red; }");
    const result = processCSSModule(ast, "/src/styles.module.css");
    const rule = result.ast.rules[0] as Rule;
    const selectorPart = rule.selectors.selectors[0].parts[0];
    expect(selectorPart.type).toBe("ClassSelector");
    expect((selectorPart as { name: string }).name).toBe(result.mapping.button);
  });

  it("does not scope element selectors", () => {
    const ast = parseCSS("div { color: red; }");
    const result = processCSSModule(ast, "/src/styles.module.css");
    expect(Object.keys(result.mapping).length).toBe(0);
  });

  it("scopes class selectors within compound selectors", () => {
    const ast = parseCSS("div.active { color: red; }");
    const result = processCSSModule(ast, "/src/styles.module.css");
    expect(result.mapping).toHaveProperty("active");
    const rule = result.ast.rules[0] as Rule;
    const parts = rule.selectors.selectors[0].parts;
    // The element selector stays the same, class gets scoped
    expect(parts[0].type).toBe("ElementSelector");
    expect((parts[0] as { name: string }).name).toBe("div");
    expect(parts[1].type).toBe("ClassSelector");
    expect((parts[1] as { name: string }).name).toBe(result.mapping.active);
  });
});

describe("processCSSModule - :global()", () => {
  it("does not scope classes inside :global()", () => {
    const ast = parseCSS(":global(.external) { color: red; }");
    const result = processCSSModule(ast, "/src/styles.module.css");
    const rule = result.ast.rules[0] as Rule;
    const parts = rule.selectors.selectors[0].parts;
    // Should emit the class directly without scoping
    expect(
      parts.some(
        (p) =>
          p.type === "ClassSelector" &&
          (p as { name: string }).name === "external",
      ),
    ).toBe(true);
  });
});

describe("processCSSModule - :local()", () => {
  it("scopes classes inside :local()", () => {
    const ast = parseCSS(":local(.button) { color: red; }");
    const result = processCSSModule(ast, "/src/styles.module.css");
    expect(result.mapping).toHaveProperty("button");
    const rule = result.ast.rules[0] as Rule;
    const parts = rule.selectors.selectors[0].parts;
    expect(
      parts.some(
        (p) =>
          p.type === "ClassSelector" &&
          (p as { name: string }).name === result.mapping.button,
      ),
    ).toBe(true);
  });
});

describe("processCSSModule - composes", () => {
  it("extracts local composes references", () => {
    const ast = parseCSS(".primary { composes: button; color: blue; }");
    const result = processCSSModule(ast, "/src/styles.module.css");
    expect(result.composes.length).toBe(1);
    expect(result.composes[0].localClass).toBe("primary");
    expect(result.composes[0].composedClasses).toContain("button");
    expect(result.composes[0].from).toBeUndefined();
  });

  it("extracts composes from external modules", () => {
    const ast = parseCSS(
      ".primary { composes: button from './base.module.css'; color: blue; }",
    );
    const result = processCSSModule(ast, "/src/styles.module.css");
    expect(result.composes.length).toBe(1);
    expect(result.composes[0].from).toBe("./base.module.css");
    expect(result.composes[0].composedClasses).toContain("button");
  });

  it("removes composes declarations from output", () => {
    const ast = parseCSS(".primary { composes: button; color: blue; }");
    const result = processCSSModule(ast, "/src/styles.module.css");
    const rule = result.ast.rules[0] as Rule;
    const decls = rule.declarations.filter(
      (d) => d.type === "Declaration",
    ) as Declaration[];
    expect(decls.length).toBe(1);
    expect(decls[0].property).toBe("color");
  });
});

describe("generateJSMapping", () => {
  it("generates a valid JS module with mapping", () => {
    const mapping = { button: "button_abc123", header: "header_def456" };
    const js = generateJSMapping(mapping, []);
    expect(js).toContain("export default");
    expect(js).toContain('"button"');
    expect(js).toContain('"button_abc123"');
    expect(js).toContain('"header"');
    expect(js).toContain('"header_def456"');
  });

  it("generates imports for external composes", () => {
    const mapping = { primary: "primary_abc123" };
    const composes = [
      {
        localClass: "primary",
        composedClasses: ["button"],
        from: "./base.module.css",
      },
    ];
    const js = generateJSMapping(mapping, composes);
    expect(js).toContain("import");
    expect(js).toContain("./base.module.css");
  });
});
