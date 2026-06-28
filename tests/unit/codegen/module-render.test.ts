/**
 * @module tests/unit/codegen/module-render
 * @description Unit tests for MagicString-based module rendering.
 */

import { describe, it, expect } from "bun:test";
import {
  renderModule,
  generateEsImportRewrite,
  generateCjsImportRewrite,
  generateEsExportRewrite,
  generateCjsExportRewrite,
  generateCjsDefaultExportRewrite,
  generateCjsNamespaceImportRewrite,
  generateCjsDefaultImportRewrite,
} from "../../../src/codegen/module-render.js";
import type {
  ModuleRenderOptions,
  ImportRewrite,
  ExportRewrite,
} from "../../../src/codegen/module-render.js";
import type * as AST from "../../../src/ast/types.js";

const makeOptions = (
  overrides?: Partial<ModuleRenderOptions>,
): ModuleRenderOptions => ({
  format: "es",
  exportMode: "named",
  interop: "default",
  ...overrides,
});

const makeProgram = (
  source: string,
  body: ReadonlyArray<{ start: number; end: number; type: string }>,
): AST.Program => ({
  type: "Program",
  sourceType: "module",
  start: 0,
  end: source.length,
  body: body as unknown as ReadonlyArray<AST.Statement | AST.ModuleDeclaration>,
});

describe("renderModule", () => {
  describe("tree-shaking (removing excluded statements)", () => {
    it("should remove statements not in includedStatements set", () => {
      // "const a = 1;\nconst b = 2;\nconst c = 3;\n" = 40 chars
      const source = "const a = 1;\nconst b = 2;\nconst c = 3;\n";
      // positions: 0-13, 13-26, 26-39 (each "const x = N;\n" is 13 chars)
      const stmts = [
        { start: 0, end: 13, type: "VariableDeclaration" },
        { start: 13, end: 26, type: "VariableDeclaration" },
        { start: 26, end: 39, type: "VariableDeclaration" },
      ];
      const ast = makeProgram(source, stmts);
      // Only include first and third statements
      const included = new Set([0, 26]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        new Map(),
        makeOptions(),
      );

      expect(result.code).toBe("const a = 1;\nconst c = 3;\n");
    });

    it("should keep all statements when all are included", () => {
      const source = "const x = 1;\nconst y = 2;\n";
      const stmts = [
        { start: 0, end: 13, type: "VariableDeclaration" },
        { start: 13, end: 27, type: "VariableDeclaration" },
      ];
      const ast = makeProgram(source, stmts);
      const included = new Set([0, 13]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        new Map(),
        makeOptions(),
      );

      expect(result.code).toBe(source);
    });

    it("should remove all statements when none are included", () => {
      // "const a = 1;\nconst b = 2;\n" = 26 chars
      const source = "const a = 1;\nconst b = 2;\n";
      const stmts = [
        { start: 0, end: 13, type: "VariableDeclaration" },
        { start: 13, end: 26, type: "VariableDeclaration" },
      ];
      const ast = makeProgram(source, stmts);
      const included = new Set<number>();

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        new Map(),
        makeOptions(),
      );

      expect(result.code).toBe("");
    });
  });

  describe("preserving non-modified source regions", () => {
    it("should preserve whitespace and formatting in untouched regions", () => {
      const source = "const   a   =   1;\nconst b = 2;\n";
      const stmts = [
        { start: 0, end: 19, type: "VariableDeclaration" },
        { start: 19, end: 32, type: "VariableDeclaration" },
      ];
      const ast = makeProgram(source, stmts);
      const included = new Set([0, 19]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        new Map(),
        makeOptions(),
      );

      expect(result.code).toBe(source);
    });

    it("should preserve comments in included regions", () => {
      const source = "/* comment */\nconst a = 1;\n";
      const stmts = [
        { start: 0, end: 14, type: "ExpressionStatement" },
        { start: 14, end: 27, type: "VariableDeclaration" },
      ];
      const ast = makeProgram(source, stmts);
      const included = new Set([0, 14]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        new Map(),
        makeOptions(),
      );

      expect(result.code).toBe(source);
    });
  });

  describe("import path rewriting (ES format)", () => {
    it("should rewrite import source path", () => {
      const source = "import { foo } from './foo';\n";
      const stmts = [{ start: 0, end: 28, type: "ImportDeclaration" }];
      const ast = makeProgram(source, stmts);
      const included = new Set([0]);

      const importRewrites: ReadonlyArray<ImportRewrite> = [
        { start: 20, end: 27, replacement: "'./foo.js'" },
      ];

      const result = renderModule(
        source,
        ast,
        included,
        importRewrites,
        [],
        new Map(),
        makeOptions(),
      );

      expect(result.code).toBe("import { foo } from './foo.js';\n");
    });

    it("should handle multiple import rewrites", () => {
      // "import { a } from './a';\n" = 25 chars, source literal './a' at 18-23
      // "import { b } from './b';\n" = 25 chars, source literal './b' at 43-48
      const source = "import { a } from './a';\nimport { b } from './b';\n";
      const stmts = [
        { start: 0, end: 25, type: "ImportDeclaration" },
        { start: 25, end: 50, type: "ImportDeclaration" },
      ];
      const ast = makeProgram(source, stmts);
      const included = new Set([0, 25]);

      const importRewrites: ReadonlyArray<ImportRewrite> = [
        { start: 18, end: 23, replacement: "'./a.js'" },
        { start: 43, end: 48, replacement: "'./b.js'" },
      ];

      const result = renderModule(
        source,
        ast,
        included,
        importRewrites,
        [],
        new Map(),
        makeOptions(),
      );

      expect(result.code).toBe(
        "import { a } from './a.js';\nimport { b } from './b.js';\n",
      );
    });
  });

  describe("import to require conversion (CJS format)", () => {
    it("should convert import statement to require()", () => {
      const source = "import { foo, bar } from './utils';\n";
      const stmts = [{ start: 0, end: 35, type: "ImportDeclaration" }];
      const ast = makeProgram(source, stmts);
      const included = new Set([0]);

      const importRewrites: ReadonlyArray<ImportRewrite> = [
        {
          start: 0,
          end: 35,
          replacement: "const { foo, bar } = require('./utils');",
        },
      ];

      const result = renderModule(
        source,
        ast,
        included,
        importRewrites,
        [],
        new Map(),
        makeOptions({ format: "cjs" }),
      );

      expect(result.code).toBe("const { foo, bar } = require('./utils');\n");
    });

    it("should handle renamed bindings in CJS conversion", () => {
      const source = "import { foo as f } from './mod';\n";
      const stmts = [{ start: 0, end: 33, type: "ImportDeclaration" }];
      const ast = makeProgram(source, stmts);
      const included = new Set([0]);

      const importRewrites: ReadonlyArray<ImportRewrite> = [
        {
          start: 0,
          end: 33,
          replacement: "const { foo: f } = require('./mod');",
        },
      ];

      const result = renderModule(
        source,
        ast,
        included,
        importRewrites,
        [],
        new Map(),
        makeOptions({ format: "cjs" }),
      );

      expect(result.code).toBe("const { foo: f } = require('./mod');\n");
    });
  });

  describe("export rewriting", () => {
    it("should rewrite named export declaration", () => {
      const source = "export { foo, bar };\n";
      const stmts = [{ start: 0, end: 20, type: "ExportNamedDeclaration" }];
      const ast = makeProgram(source, stmts);
      const included = new Set([0]);

      const exportRewrites: ReadonlyArray<ExportRewrite> = [
        {
          start: 0,
          end: 20,
          replacement: "exports.foo = foo;\nexports.bar = bar;",
        },
      ];

      const result = renderModule(
        source,
        ast,
        included,
        [],
        exportRewrites,
        new Map(),
        makeOptions({ format: "cjs" }),
      );

      expect(result.code).toBe("exports.foo = foo;\nexports.bar = bar;\n");
    });

    it("should rewrite default export to module.exports", () => {
      const source = "export default myFunc;\n";
      const stmts = [{ start: 0, end: 22, type: "ExportDefaultDeclaration" }];
      const ast = makeProgram(source, stmts);
      const included = new Set([0]);

      const exportRewrites: ReadonlyArray<ExportRewrite> = [
        { start: 0, end: 22, replacement: "module.exports = myFunc;" },
      ];

      const result = renderModule(
        source,
        ast,
        included,
        [],
        exportRewrites,
        new Map(),
        makeOptions({ format: "cjs" }),
      );

      expect(result.code).toBe("module.exports = myFunc;\n");
    });
  });

  describe("variable deconfliction", () => {
    it("should rename deconflicted variables", () => {
      // "const foo = 1;\nconsole.log(foo);\n"
      const source = "const foo = 1;\nconsole.log(foo);\n";
      const ast: AST.Program = {
        type: "Program",
        sourceType: "module",
        start: 0,
        end: source.length,
        body: [
          {
            type: "VariableDeclaration",
            kind: "const",
            start: 0,
            end: 15,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 6,
                end: 14,
                id: { type: "Identifier", name: "foo", start: 6, end: 9 },
                init: { type: "Literal", value: 1, start: 12, end: 13 },
              },
            ],
          },
          {
            type: "ExpressionStatement",
            start: 15,
            end: 32,
            expression: {
              type: "CallExpression",
              start: 15,
              end: 31,
              optional: false,
              callee: {
                type: "MemberExpression",
                start: 15,
                end: 26,
                computed: false,
                optional: false,
                object: {
                  type: "Identifier",
                  name: "console",
                  start: 15,
                  end: 22,
                },
                property: {
                  type: "Identifier",
                  name: "log",
                  start: 23,
                  end: 26,
                },
              },
              arguments: [
                { type: "Identifier", name: "foo", start: 27, end: 30 },
              ],
            },
          },
        ],
      };
      const included = new Set([0, 15]);
      const deconflictions = new Map([["foo", "foo_1"]]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        deconflictions,
        makeOptions(),
      );

      expect(result.code).toContain("foo_1");
      expect(result.code).toBe("const foo_1 = 1;\nconsole.log(foo_1);\n");
    });

    it("should not rename partial matches", () => {
      // "const foobar = 1;\nconst foo = 2;\n"
      const source = "const foobar = 1;\nconst foo = 2;\n";
      const ast: AST.Program = {
        type: "Program",
        sourceType: "module",
        start: 0,
        end: source.length,
        body: [
          {
            type: "VariableDeclaration",
            kind: "const",
            start: 0,
            end: 18,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 6,
                end: 17,
                id: {
                  type: "Identifier",
                  name: "foobar",
                  start: 6,
                  end: 12,
                },
                init: { type: "Literal", value: 1, start: 15, end: 16 },
              },
            ],
          },
          {
            type: "VariableDeclaration",
            kind: "const",
            start: 18,
            end: 33,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 24,
                end: 32,
                id: {
                  type: "Identifier",
                  name: "foo",
                  start: 24,
                  end: 27,
                },
                init: { type: "Literal", value: 2, start: 30, end: 31 },
              },
            ],
          },
        ],
      };
      const included = new Set([0, 18]);
      const deconflictions = new Map([["foo", "foo$1"]]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        deconflictions,
        makeOptions(),
      );

      expect(result.code).toContain("foobar");
      expect(result.code).toContain("foo$1");
      // foobar should NOT be renamed
      expect(result.code).toBe("const foobar = 1;\nconst foo$1 = 2;\n");
    });

    it("should handle empty deconflictions map", () => {
      const source = "const a = 1;\n";
      const stmts = [{ start: 0, end: 13, type: "VariableDeclaration" }];
      const ast = makeProgram(source, stmts);
      const included = new Set([0]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        new Map(),
        makeOptions(),
      );

      expect(result.code).toBe(source);
    });

    it("should NOT modify string contents during deconfliction", () => {
      // const foo = "foo is great";
      const source = 'const foo = "foo is great";\n';
      const ast: AST.Program = {
        type: "Program",
        sourceType: "module",
        start: 0,
        end: source.length,
        body: [
          {
            type: "VariableDeclaration",
            kind: "const",
            start: 0,
            end: 28,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 6,
                end: 27,
                id: {
                  type: "Identifier",
                  name: "foo",
                  start: 6,
                  end: 9,
                },
                init: {
                  type: "Literal",
                  value: "foo is great",
                  start: 12,
                  end: 26,
                },
              },
            ],
          },
        ],
      };
      const included = new Set([0]);
      const deconflictions = new Map([["foo", "foo$1"]]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        deconflictions,
        makeOptions(),
      );

      // The variable should be renamed but the string content should NOT
      expect(result.code).toBe('const foo$1 = "foo is great";\n');
    });

    it("should NOT modify template literal quasis during deconfliction", () => {
      // const foo = `foo ${foo}`;
      const source = "const foo = `foo ${foo}`;\n";
      const ast: AST.Program = {
        type: "Program",
        sourceType: "module",
        start: 0,
        end: source.length,
        body: [
          {
            type: "VariableDeclaration",
            kind: "const",
            start: 0,
            end: 25,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 6,
                end: 24,
                id: {
                  type: "Identifier",
                  name: "foo",
                  start: 6,
                  end: 9,
                },
                init: {
                  type: "TemplateLiteral",
                  start: 12,
                  end: 24,
                  quasis: [
                    {
                      type: "TemplateElement",
                      start: 13,
                      end: 18,
                      tail: false,
                      value: { raw: "foo ", cooked: "foo " },
                    },
                    {
                      type: "TemplateElement",
                      start: 23,
                      end: 23,
                      tail: true,
                      value: { raw: "", cooked: "" },
                    },
                  ],
                  expressions: [
                    {
                      type: "Identifier",
                      name: "foo",
                      start: 19,
                      end: 22,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const included = new Set([0]);
      const deconflictions = new Map([["foo", "foo$1"]]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        deconflictions,
        makeOptions(),
      );

      // Variable declaration and expression reference renamed,
      // but "foo " inside template quasis stays intact
      expect(result.code).toBe("const foo$1 = `foo ${foo$1}`;\n");
    });

    it("should handle property shorthand correctly during deconfliction", () => {
      // const obj = { foo };
      const source = "const obj = { foo };\n";
      const ast: AST.Program = {
        type: "Program",
        sourceType: "module",
        start: 0,
        end: source.length,
        body: [
          {
            type: "VariableDeclaration",
            kind: "const",
            start: 0,
            end: 21,
            declarations: [
              {
                type: "VariableDeclarator",
                start: 6,
                end: 20,
                id: {
                  type: "Identifier",
                  name: "obj",
                  start: 6,
                  end: 9,
                },
                init: {
                  type: "ObjectExpression",
                  start: 12,
                  end: 19,
                  properties: [
                    {
                      type: "Property",
                      start: 14,
                      end: 17,
                      key: {
                        type: "Identifier",
                        name: "foo",
                        start: 14,
                        end: 17,
                      },
                      value: {
                        type: "Identifier",
                        name: "foo",
                        start: 14,
                        end: 17,
                      },
                      kind: "init",
                      method: false,
                      shorthand: true,
                      computed: false,
                    },
                  ],
                },
              },
            ],
          },
        ],
      };
      const included = new Set([0]);
      const deconflictions = new Map([["foo", "foo$1"]]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        deconflictions,
        makeOptions(),
      );

      // Shorthand { foo } should expand to { foo: foo$1 }
      expect(result.code).toBe("const obj = { foo: foo$1 };\n");
    });

    it("should not rename non-computed member expression property", () => {
      // foo.bar where bar is deconflicted - should NOT rename bar in obj.bar
      const source = "foo.bar;\n";
      const ast: AST.Program = {
        type: "Program",
        sourceType: "module",
        start: 0,
        end: source.length,
        body: [
          {
            type: "ExpressionStatement",
            start: 0,
            end: 8,
            expression: {
              type: "MemberExpression",
              start: 0,
              end: 7,
              computed: false,
              optional: false,
              object: {
                type: "Identifier",
                name: "foo",
                start: 0,
                end: 3,
              },
              property: {
                type: "Identifier",
                name: "bar",
                start: 4,
                end: 7,
              },
            },
          },
        ],
      };
      const included = new Set([0]);
      const deconflictions = new Map([
        ["foo", "foo$1"],
        ["bar", "bar$1"],
      ]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        deconflictions,
        makeOptions(),
      );

      // foo should be renamed but bar (property of non-computed member) should NOT
      expect(result.code).toBe("foo$1.bar;\n");
    });
  });

  describe("source map generation", () => {
    it("should produce a MagicString that can generate source maps", () => {
      const source = "const a = 1;\nconst b = 2;\n";
      const stmts = [
        { start: 0, end: 13, type: "VariableDeclaration" },
        { start: 13, end: 27, type: "VariableDeclaration" },
      ];
      const ast = makeProgram(source, stmts);
      const included = new Set([0, 13]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        new Map(),
        makeOptions(),
      );

      const map = result.magicString.generateMap({ source: "test.js" });
      expect(map.version).toBe(3);
      expect(map.sources).toEqual(["test.js"]);
      expect(typeof map.mappings).toBe("string");
    });

    it("should produce valid mappings after edits", () => {
      const source = "import { x } from './x';\nconst a = x;\n";
      const stmts = [
        { start: 0, end: 25, type: "ImportDeclaration" },
        { start: 25, end: 39, type: "VariableDeclaration" },
      ];
      const ast = makeProgram(source, stmts);
      const included = new Set([0, 25]);
      const importRewrites: ReadonlyArray<ImportRewrite> = [
        { start: 17, end: 22, replacement: "'./x.js'" },
      ];

      const result = renderModule(
        source,
        ast,
        included,
        importRewrites,
        [],
        new Map(),
        makeOptions(),
      );

      const map = result.magicString.generateDecodedMap({
        source: "test.js",
        includeContent: true,
      });
      expect(map.version).toBe(3);
      expect(map.sourcesContent).toEqual([source]);
      expect(map.mappings.length).toBeGreaterThan(0);
    });
  });

  describe("empty module", () => {
    it("should render empty string for empty source", () => {
      const source = "";
      const ast = makeProgram(source, []);
      const included = new Set<number>();

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        new Map(),
        makeOptions(),
      );

      expect(result.code).toBe("");
    });

    it("should render empty when all statements are excluded", () => {
      const source = "const unused = true;\n";
      const stmts = [{ start: 0, end: 21, type: "VariableDeclaration" }];
      const ast = makeProgram(source, stmts);
      const included = new Set<number>();

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        new Map(),
        makeOptions(),
      );

      expect(result.code).toBe("");
    });
  });

  describe("compact mode", () => {
    it("should remove empty lines in compact mode", () => {
      const source = "const a = 1;\n\n\nconst b = 2;\n";
      const stmts = [
        { start: 0, end: 13, type: "VariableDeclaration" },
        { start: 13, end: 28, type: "VariableDeclaration" },
      ];
      const ast = makeProgram(source, stmts);
      // Only include first statement; second gets removed, leaving empty lines
      const included = new Set([0]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        new Map(),
        makeOptions({ compact: true }),
      );

      // Compact mode should have no empty lines
      const lines = result.code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 0) {
          expect(lines[i].trim().length).toBeGreaterThan(0);
        }
      }
    });

    it("should trim leading whitespace from lines in compact mode", () => {
      const source = "  const a = 1;\n  const b = 2;\n";
      const stmts = [
        { start: 0, end: 15, type: "VariableDeclaration" },
        { start: 15, end: 30, type: "VariableDeclaration" },
      ];
      const ast = makeProgram(source, stmts);
      const included = new Set([0, 15]);

      const result = renderModule(
        source,
        ast,
        included,
        [],
        [],
        new Map(),
        makeOptions({ compact: true }),
      );

      expect(result.code).toBe("const a = 1;\nconst b = 2;");
    });
  });
});

describe("generateEsImportRewrite", () => {
  it("should create a rewrite for the source literal", () => {
    const importDecl: AST.ImportDeclaration = {
      type: "ImportDeclaration",
      start: 0,
      end: 28,
      specifiers: [],
      source: { type: "Literal", value: "./foo", start: 20, end: 27 },
    };

    const rewrite = generateEsImportRewrite(importDecl, "./foo.js");
    expect(rewrite.start).toBe(20);
    expect(rewrite.end).toBe(27);
    expect(rewrite.replacement).toBe("'./foo.js'");
  });
});

describe("generateCjsImportRewrite", () => {
  it("should convert to require() with same-name bindings", () => {
    const importDecl: AST.ImportDeclaration = {
      type: "ImportDeclaration",
      start: 0,
      end: 30,
      specifiers: [],
      source: { type: "Literal", value: "./mod", start: 22, end: 29 },
    };

    const rewrite = generateCjsImportRewrite(importDecl, "./mod.js", [
      { local: "foo", imported: "foo" },
      { local: "bar", imported: "bar" },
    ]);

    expect(rewrite.start).toBe(0);
    expect(rewrite.end).toBe(30);
    expect(rewrite.replacement).toBe(
      "const { foo, bar } = require('./mod.js');",
    );
  });

  it("should handle renamed bindings", () => {
    const importDecl: AST.ImportDeclaration = {
      type: "ImportDeclaration",
      start: 0,
      end: 35,
      specifiers: [],
      source: { type: "Literal", value: "./mod", start: 25, end: 32 },
    };

    const rewrite = generateCjsImportRewrite(importDecl, "./mod.js", [
      { local: "myFoo", imported: "foo" },
    ]);

    expect(rewrite.replacement).toBe(
      "const { foo: myFoo } = require('./mod.js');",
    );
  });
});

describe("generateEsExportRewrite", () => {
  it("should generate export statement with same-name exports", () => {
    const exportDecl: AST.ExportNamedDeclaration = {
      type: "ExportNamedDeclaration",
      start: 0,
      end: 20,
      declaration: null,
      specifiers: [],
      source: null,
    };

    const rewrite = generateEsExportRewrite(exportDecl, [
      { local: "foo", exported: "foo" },
      { local: "bar", exported: "bar" },
    ]);

    expect(rewrite.replacement).toBe("export { foo, bar };");
  });

  it("should generate export statement with renamed exports", () => {
    const exportDecl: AST.ExportNamedDeclaration = {
      type: "ExportNamedDeclaration",
      start: 0,
      end: 25,
      declaration: null,
      specifiers: [],
      source: null,
    };

    const rewrite = generateEsExportRewrite(exportDecl, [
      { local: "foo", exported: "publicFoo" },
    ]);

    expect(rewrite.replacement).toBe("export { foo as publicFoo };");
  });
});

describe("generateCjsExportRewrite", () => {
  it("should generate exports assignments", () => {
    const exportDecl: AST.ExportNamedDeclaration = {
      type: "ExportNamedDeclaration",
      start: 0,
      end: 20,
      declaration: null,
      specifiers: [],
      source: null,
    };

    const rewrite = generateCjsExportRewrite(exportDecl, [
      { local: "foo", exported: "foo" },
      { local: "bar", exported: "baz" },
    ]);

    expect(rewrite.replacement).toBe("exports.foo = foo;\nexports.baz = bar;");
  });
});

describe("generateCjsDefaultExportRewrite", () => {
  it("should generate module.exports assignment", () => {
    const exportDecl: AST.ExportDefaultDeclaration = {
      type: "ExportDefaultDeclaration",
      start: 0,
      end: 22,
      declaration: { type: "Identifier", name: "myFunc", start: 15, end: 21 },
    };

    const rewrite = generateCjsDefaultExportRewrite(exportDecl, "myFunc");
    expect(rewrite.replacement).toBe("module.exports = myFunc;");
  });
});

describe("generateCjsNamespaceImportRewrite", () => {
  it("should generate const = require() for namespace import", () => {
    const importDecl: AST.ImportDeclaration = {
      type: "ImportDeclaration",
      start: 0,
      end: 28,
      specifiers: [],
      source: { type: "Literal", value: "./mod", start: 20, end: 27 },
    };

    const rewrite = generateCjsNamespaceImportRewrite(
      importDecl,
      "./mod.js",
      "ns",
    );
    expect(rewrite.replacement).toBe("const ns = require('./mod.js');");
  });
});

describe("generateCjsDefaultImportRewrite", () => {
  it("should generate require().default with default interop", () => {
    const importDecl: AST.ImportDeclaration = {
      type: "ImportDeclaration",
      start: 0,
      end: 25,
      specifiers: [],
      source: { type: "Literal", value: "./mod", start: 17, end: 24 },
    };

    const rewrite = generateCjsDefaultImportRewrite(
      importDecl,
      "./mod.js",
      "foo",
      "default",
    );
    expect(rewrite.replacement).toBe(
      "const foo = require('./mod.js').default;",
    );
  });

  it("should generate plain require() with non-default interop", () => {
    const importDecl: AST.ImportDeclaration = {
      type: "ImportDeclaration",
      start: 0,
      end: 25,
      specifiers: [],
      source: { type: "Literal", value: "./mod", start: 17, end: 24 },
    };

    const rewrite = generateCjsDefaultImportRewrite(
      importDecl,
      "./mod.js",
      "foo",
      "compat",
    );
    expect(rewrite.replacement).toBe("const foo = require('./mod.js');");
  });
});
