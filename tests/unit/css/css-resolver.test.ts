/**
 * @module tests/unit/css/css-resolver
 * @description Unit tests for the CSS @import resolver:
 * extractImports, resolveImportPath, resolveImportGraph (including
 * circular-dependency detection, URL skipping, and error handling).
 */

import { describe, it, expect } from "vitest";
import {
  extractImports,
  resolveImportPath,
  resolveImportGraph,
} from "../../../src/css/css-resolver.js";
import type { Stylesheet, AtRule } from "../../../src/css/css-ast.js";

/**
 * Helper: create a minimal Stylesheet AST with @import rules.
 */
const makeStylesheet = (imports: Array<{ params: string }>): Stylesheet => {
  const rules: AtRule[] = imports.map((imp) => ({
    type: "AtRule" as const,
    name: "import",
    params: imp.params,
  }));
  return { type: "Stylesheet", rules };
};

// ============================================================
// extractImports
// ============================================================

describe("extractImports", () => {
  it("extracts double-quoted string import", () => {
    const ast = makeStylesheet([{ params: '"base.css"' }]);
    const result = extractImports(ast);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe("base.css");
    expect(result[0].media).toBeUndefined();
  });

  it("extracts single-quoted string import", () => {
    const ast = makeStylesheet([{ params: "'reset.css'" }]);
    const result = extractImports(ast);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe("reset.css");
  });

  it("extracts url() import without quotes", () => {
    const ast = makeStylesheet([{ params: "url(theme.css)" }]);
    const result = extractImports(ast);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe("theme.css");
  });

  it("extracts url() import with double quotes", () => {
    const ast = makeStylesheet([{ params: 'url("theme.css")' }]);
    const result = extractImports(ast);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe("theme.css");
  });

  it("extracts url() import with single quotes", () => {
    const ast = makeStylesheet([{ params: "url('theme.css')" }]);
    const result = extractImports(ast);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe("theme.css");
  });

  it("extracts media query from string import", () => {
    const ast = makeStylesheet([{ params: '"print.css" print' }]);
    const result = extractImports(ast);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe("print.css");
    expect(result[0].media).toBe("print");
  });

  it("extracts media query from url() import", () => {
    const ast = makeStylesheet([
      { params: "url(mobile.css) screen and (max-width: 768px)" },
    ]);
    const result = extractImports(ast);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe("mobile.css");
    expect(result[0].media).toBe("screen and (max-width: 768px)");
  });

  it("extracts multiple imports", () => {
    const ast = makeStylesheet([
      { params: '"a.css"' },
      { params: '"b.css"' },
      { params: '"c.css"' },
    ]);
    const result = extractImports(ast);
    expect(result).toHaveLength(3);
  });

  it("skips non-import at-rules", () => {
    const ast: Stylesheet = {
      type: "Stylesheet",
      rules: [
        { type: "AtRule", name: "media", params: "(max-width: 768px)" },
        { type: "AtRule", name: "import", params: '"base.css"' },
      ],
    };
    const result = extractImports(ast);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe("base.css");
  });

  it("skips non-AtRule nodes", () => {
    const ast: Stylesheet = {
      type: "Stylesheet",
      rules: [
        {
          type: "Rule" as any,
          selectors: { type: "SelectorList", selectors: [] },
          declarations: [],
        },
      ],
    };
    const result = extractImports(ast);
    expect(result).toHaveLength(0);
  });

  it("skips malformed url() (no match)", () => {
    const ast = makeStylesheet([{ params: "url(" }]);
    const result = extractImports(ast);
    expect(result).toHaveLength(0);
  });

  it("skips malformed quoted import (unclosed quote)", () => {
    const ast = makeStylesheet([{ params: '"unclosed' }]);
    const result = extractImports(ast);
    expect(result).toHaveLength(0);
  });

  it("skips bare specifiers (no quotes, no url())", () => {
    const ast = makeStylesheet([{ params: "bare-specifier" }]);
    const result = extractImports(ast);
    expect(result).toHaveLength(0);
  });

  it("handles whitespace around params", () => {
    const ast = makeStylesheet([{ params: '  "base.css"  ' }]);
    const result = extractImports(ast);
    expect(result).toHaveLength(1);
    expect(result[0].specifier).toBe("base.css");
  });
});

// ============================================================
// resolveImportPath
// ============================================================

describe("resolveImportPath", () => {
  it("resolves relative path with ./", () => {
    const result = resolveImportPath("./utils.css", "/project/src/main.css");
    expect(result).toBe("/project/src/utils.css");
  });

  it("resolves relative path with ../", () => {
    const result = resolveImportPath(
      "../shared/reset.css",
      "/project/src/main.css",
    );
    expect(result).toBe("/project/shared/reset.css");
  });

  it("resolves deeply nested ../", () => {
    const result = resolveImportPath(
      "../../base.css",
      "/project/src/styles/main.css",
    );
    expect(result).toBe("/project/base.css");
  });

  it("returns absolute paths unchanged", () => {
    const result = resolveImportPath("/absolute/path.css", "/project/main.css");
    expect(result).toBe("/absolute/path.css");
  });

  it("returns http:// URLs unchanged", () => {
    const result = resolveImportPath(
      "http://cdn.example.com/style.css",
      "/project/main.css",
    );
    expect(result).toBe("http://cdn.example.com/style.css");
  });

  it("returns https:// URLs unchanged", () => {
    const result = resolveImportPath(
      "https://cdn.example.com/style.css",
      "/project/main.css",
    );
    expect(result).toBe("https://cdn.example.com/style.css");
  });

  it("returns protocol-relative // URLs unchanged", () => {
    const result = resolveImportPath(
      "//cdn.example.com/style.css",
      "/project/main.css",
    );
    expect(result).toBe("//cdn.example.com/style.css");
  });

  it("returns data: URIs unchanged", () => {
    const result = resolveImportPath(
      "data:text/css,body{color:red}",
      "/project/main.css",
    );
    expect(result).toBe("data:text/css,body{color:red}");
  });

  it("resolves bare specifiers relative to importer directory", () => {
    const result = resolveImportPath(
      "node_modules/lib/style.css",
      "/project/src/main.css",
    );
    expect(result).toBe("/project/src/node_modules/lib/style.css");
  });

  it("normalizes . segments in paths", () => {
    const result = resolveImportPath(
      "./foo/./bar.css",
      "/project/src/main.css",
    );
    expect(result).toBe("/project/src/foo/bar.css");
  });

  it("normalizes .. segments in paths", () => {
    const result = resolveImportPath(
      "./foo/../bar.css",
      "/project/src/main.css",
    );
    expect(result).toBe("/project/src/bar.css");
  });
});

// ============================================================
// resolveImportGraph
// ============================================================

describe("resolveImportGraph", () => {
  it("resolves a single-level import", async () => {
    const files = new Map<string, Stylesheet>([
      ["/root.css", makeStylesheet([{ params: '"./child.css"' }])],
      ["/child.css", makeStylesheet([])],
    ]);

    const readFile = async (filePath: string) => ({
      ast: files.get(filePath)!,
      source: "",
    });

    const result = await resolveImportGraph("/root.css", readFile);
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].filePath).toBe("/child.css");
    expect(result.imports[0].specifier).toBe("./child.css");
    expect(result.warnings).toHaveLength(0);
  });

  it("resolves multi-level imports in dependency order (deepest first)", async () => {
    const files = new Map<string, Stylesheet>([
      ["/root.css", makeStylesheet([{ params: '"./a.css"' }])],
      ["/a.css", makeStylesheet([{ params: '"./b.css"' }])],
      ["/b.css", makeStylesheet([])],
    ]);

    const readFile = async (filePath: string) => ({
      ast: files.get(filePath)!,
      source: "",
    });

    const result = await resolveImportGraph("/root.css", readFile);
    expect(result.imports).toHaveLength(2);
    // b.css should come before a.css (deepest first)
    expect(result.imports[0].filePath).toBe("/b.css");
    expect(result.imports[1].filePath).toBe("/a.css");
  });

  it("detects circular imports and emits a warning", async () => {
    const files = new Map<string, Stylesheet>([
      ["/a.css", makeStylesheet([{ params: '"./b.css"' }])],
      ["/b.css", makeStylesheet([{ params: '"./a.css"' }])],
    ]);

    const readFile = async (filePath: string) => ({
      ast: files.get(filePath)!,
      source: "",
    });

    const result = await resolveImportGraph("/a.css", readFile);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Circular @import detected");
    expect(result.warnings[0]).toContain("/a.css");
  });

  it("handles self-circular import", async () => {
    const files = new Map<string, Stylesheet>([
      ["/self.css", makeStylesheet([{ params: '"./self.css"' }])],
    ]);

    const readFile = async (filePath: string) => ({
      ast: files.get(filePath)!,
      source: "",
    });

    const result = await resolveImportGraph("/self.css", readFile);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("Circular @import detected");
  });

  it("emits warning when file cannot be read", async () => {
    const files = new Map<string, Stylesheet>([
      ["/root.css", makeStylesheet([{ params: '"./missing.css"' }])],
    ]);

    const readFile = async (filePath: string) => {
      const ast = files.get(filePath);
      if (!ast) {
        throw new Error("File not found: " + filePath);
      }
      return { ast, source: "" };
    };

    const result = await resolveImportGraph("/root.css", readFile);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Could not resolve @import");
    expect(result.warnings[0]).toContain("/missing.css");
  });

  it("skips external http:// URLs in import graph", async () => {
    const files = new Map<string, Stylesheet>([
      [
        "/root.css",
        makeStylesheet([{ params: '"http://cdn.example.com/reset.css"' }]),
      ],
    ]);

    const readFile = async (filePath: string) => ({
      ast: files.get(filePath)!,
      source: "",
    });

    const result = await resolveImportGraph("/root.css", readFile);
    // External URL should not be visited; no imports collected
    expect(result.imports).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("skips external https:// URLs in import graph", async () => {
    const files = new Map<string, Stylesheet>([
      [
        "/root.css",
        makeStylesheet([{ params: '"https://cdn.example.com/reset.css"' }]),
      ],
    ]);

    const readFile = async (filePath: string) => ({
      ast: files.get(filePath)!,
      source: "",
    });

    const result = await resolveImportGraph("/root.css", readFile);
    expect(result.imports).toHaveLength(0);
  });

  it("skips protocol-relative // URLs in import graph", async () => {
    const files = new Map<string, Stylesheet>([
      [
        "/root.css",
        makeStylesheet([{ params: '"//cdn.example.com/reset.css"' }]),
      ],
    ]);

    const readFile = async (filePath: string) => ({
      ast: files.get(filePath)!,
      source: "",
    });

    const result = await resolveImportGraph("/root.css", readFile);
    expect(result.imports).toHaveLength(0);
  });

  it("does not re-visit already visited files", async () => {
    let readCount = 0;
    const files = new Map<string, Stylesheet>([
      [
        "/root.css",
        makeStylesheet([
          { params: '"./shared.css"' },
          { params: '"./page.css"' },
        ]),
      ],
      ["/shared.css", makeStylesheet([])],
      ["/page.css", makeStylesheet([{ params: '"./shared.css"' }])],
    ]);

    const readFile = async (filePath: string) => {
      readCount++;
      return { ast: files.get(filePath)!, source: "" };
    };

    const result = await resolveImportGraph("/root.css", readFile);
    // shared.css is imported by both root and page, but only read once
    // readCount: root + shared + page = 3 reads total
    expect(readCount).toBe(3);
    expect(result.warnings).toHaveLength(0);
  });

  it("preserves media query in resolved imports", async () => {
    const files = new Map<string, Stylesheet>([
      ["/root.css", makeStylesheet([{ params: '"./print.css" print' }])],
      ["/print.css", makeStylesheet([])],
    ]);

    const readFile = async (filePath: string) => ({
      ast: files.get(filePath)!,
      source: "",
    });

    const result = await resolveImportGraph("/root.css", readFile);
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0].media).toBe("print");
  });

  it("handles root file with no imports", async () => {
    const readFile = async (_filePath: string) => ({
      ast: makeStylesheet([]),
      source: "",
    });

    const result = await resolveImportGraph("/root.css", readFile);
    expect(result.imports).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});
