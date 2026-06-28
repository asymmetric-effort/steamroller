/**
 * @module tests/integration/css-bundling
 * @description Integration tests for CSS bundling:
 * importing .css files, verifying asset emission, and CSS Modules.
 */

import { describe, it, expect } from "bun:test";
import { parseCSS } from "../../src/css/css-parser.js";
import { printCSS } from "../../src/css/css-printer.js";
import {
  processCSSModule,
  generateJSMapping,
} from "../../src/css/css-modules.js";
import { minifyCSSToString } from "../../src/css/css-minifier.js";
import { concatenateCSS } from "../../src/css/css-concatenator.js";
import {
  extractImports,
  resolveImportPath,
} from "../../src/css/css-resolver.js";
import {
  cssPlugin,
  isCSSFile,
  isCSSModuleFile,
} from "../../src/plugins/css-plugin.js";

describe("CSS file detection", () => {
  it("identifies .css files", () => {
    expect(isCSSFile("styles.css")).toBe(true);
    expect(isCSSFile("/path/to/file.css")).toBe(true);
    expect(isCSSFile("module.module.css")).toBe(true);
  });

  it("rejects non-CSS files", () => {
    expect(isCSSFile("script.js")).toBe(false);
    expect(isCSSFile("styles.scss")).toBe(false);
    expect(isCSSFile("styles.less")).toBe(false);
  });

  it("identifies CSS Module files", () => {
    expect(isCSSModuleFile("styles.module.css")).toBe(true);
    expect(isCSSModuleFile("/path/to/file.module.css")).toBe(true);
  });

  it("rejects non-module CSS files", () => {
    expect(isCSSModuleFile("styles.css")).toBe(false);
    expect(isCSSModuleFile("module.css")).toBe(false);
  });
});

describe("CSS bundling pipeline", () => {
  it("parses, transforms, and prints CSS", () => {
    const input = `.button {
  color: #ff0000;
  font-size: 16px;
}

.header {
  background: #ffffff;
}`;

    const ast = parseCSS(input);
    expect(ast.rules.length).toBe(2);

    const output = printCSS(ast);
    expect(output).toContain(".button");
    expect(output).toContain(".header");
    expect(output).toContain("#ff0000");
  });

  it("minifies CSS end-to-end", () => {
    const input = `/* styles */
.button {
  color: #ff0000;
  background: #ffffff;
}`;

    const ast = parseCSS(input);
    const minified = minifyCSSToString(ast);

    expect(minified).not.toContain("/* styles */");
    expect(minified).toContain("red");
    expect(minified).toContain("#fff");
  });

  it("processes CSS Modules end-to-end", () => {
    const input = `.button {
  color: red;
  padding: 8px;
}

.primary {
  composes: button;
  background: blue;
}`;

    const ast = parseCSS(input);
    const result = processCSSModule(ast, "/src/styles.module.css");

    // Mapping should contain both class names
    expect(result.mapping).toHaveProperty("button");
    expect(result.mapping).toHaveProperty("primary");

    // Composes should be extracted
    expect(result.composes.length).toBe(1);
    expect(result.composes[0].localClass).toBe("primary");

    // JS mapping should be valid
    const jsCode = generateJSMapping(result.mapping, result.composes);
    expect(jsCode).toContain("export default");
    expect(jsCode).toContain('"button"');
    expect(jsCode).toContain('"primary"');

    // Output CSS should have scoped class names
    const cssOutput = printCSS(result.ast);
    expect(cssOutput).toContain(result.mapping.button);
  });
});

describe("CSS @import resolution", () => {
  it("extracts @import specifiers", () => {
    const ast = parseCSS(`
@import "base.css";
@import url("./reset.css");
@import "print.css" print;
.a { color: red; }
    `);

    const imports = extractImports(ast);
    expect(imports.length).toBe(3);
    expect(imports[0].specifier).toBe("base.css");
    expect(imports[1].specifier).toBe("./reset.css");
    expect(imports[2].specifier).toBe("print.css");
    expect(imports[2].media).toBe("print");
  });

  it("resolves relative import paths", () => {
    const resolved = resolveImportPath("./base.css", "/src/styles/main.css");
    expect(resolved).toBe("/src/styles/base.css");
  });

  it("resolves parent directory imports", () => {
    const resolved = resolveImportPath("../reset.css", "/src/styles/main.css");
    expect(resolved).toBe("/src/reset.css");
  });

  it("passes through absolute URLs", () => {
    const resolved = resolveImportPath(
      "https://cdn.example.com/styles.css",
      "/src/main.css",
    );
    expect(resolved).toBe("https://cdn.example.com/styles.css");
  });
});

describe("CSS concatenation", () => {
  it("concatenates CSS files in dependency order", () => {
    const resetAST = parseCSS("* { margin: 0; }");
    const baseAST = parseCSS(".base { color: black; }");
    const mainAST = parseCSS(
      '@import "reset.css"; @import "base.css"; .main { color: red; }',
    );

    const result = concatenateCSS(
      [
        { filePath: "/reset.css", ast: resetAST },
        { filePath: "/base.css", ast: baseAST },
      ],
      { filePath: "/main.css", ast: mainAST },
    );

    const output = printCSS(result.ast);
    // Reset should come first, then base, then main (without @import rules)
    const resetIdx = output.indexOf("margin");
    const baseIdx = output.indexOf(".base");
    const mainIdx = output.indexOf(".main");
    expect(resetIdx).toBeLessThan(baseIdx);
    expect(baseIdx).toBeLessThan(mainIdx);
    // @import rules should be stripped
    expect(output).not.toContain("@import");
  });

  it("deduplicates imported files", () => {
    const sharedAST = parseCSS(".shared { color: red; }");

    const result = concatenateCSS(
      [
        { filePath: "/shared.css", ast: sharedAST },
        { filePath: "/shared.css", ast: sharedAST },
      ],
      { filePath: "/main.css", ast: parseCSS(".main { color: blue; }") },
    );

    const output = printCSS(result.ast);
    // .shared should appear only once
    const matches = output.match(/\.shared/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });
});

describe("CSS plugin", () => {
  it("creates a plugin with correct name", () => {
    const plugin = cssPlugin();
    expect(plugin.name).toBe("steamroller:css");
  });

  it("plugin transform returns null for non-CSS files", () => {
    const plugin = cssPlugin();
    const result = (plugin.transform as (code: string, id: string) => unknown)(
      "const x = 1;",
      "file.js",
    );
    expect(result).toBeNull();
  });

  it("plugin transform processes plain CSS files", () => {
    const plugin = cssPlugin();
    const result = (plugin.transform as (code: string, id: string) => unknown)(
      ".button { color: red; }",
      "/src/styles.css",
    ) as { code: string; meta: { css: string } };
    expect(result).not.toBeNull();
    expect(result.code).toContain("export default");
    expect(result.meta.css).toContain(".button");
  });

  it("plugin transform processes CSS Module files", () => {
    const plugin = cssPlugin();
    const result = (plugin.transform as (code: string, id: string) => unknown)(
      ".button { color: red; }",
      "/src/styles.module.css",
    ) as {
      code: string;
      meta: { css: string; cssModuleMapping: Record<string, string> };
    };
    expect(result).not.toBeNull();
    expect(result.meta.cssModuleMapping).toHaveProperty("button");
    expect(result.code).toContain("export default");
  });
});
