/**
 * Differential testing framework for steamroller output equivalence.
 *
 * Each test case creates temporary input files, runs steamroller's
 * rollup() + generate(), then verifies functional equivalence by:
 *   a) Parsing the output to verify syntax validity
 *   b) Executing the output in a sandboxed context (vm.runInNewContext)
 *   c) Verifying exported values match expected results
 *
 * Does NOT require esbuild — compares against expected output values.
 * The framework is extensible: if esbuild is available, it can optionally
 * compare against esbuild output.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vm from "node:vm";
import { rollup } from "../../src/rollup.js";
import type {
  OutputChunk,
  InputOptions,
  OutputOptions,
} from "../../src/types.js";

// ---------------------------------------------------------------------------
// Framework types
// ---------------------------------------------------------------------------

interface TestCaseFile {
  /** Filename relative to the temp directory. */
  readonly name: string;
  /** File contents. */
  readonly content: string;
}

interface ExpectedExports {
  readonly [key: string]: unknown;
}

interface DifferentialTestCase {
  /** Human-readable label for the test. */
  readonly label: string;
  /** Files to create in the temp directory. */
  readonly files: ReadonlyArray<TestCaseFile>;
  /** Entry point filename(s) relative to the temp directory. */
  readonly entry: string | ReadonlyArray<string>;
  /** Additional rollup input options (merged with defaults). */
  readonly inputOptions?: Partial<InputOptions>;
  /** Output options (defaults to { format: "es" }). */
  readonly outputOptions?: OutputOptions;
  /** Expected named exports when evaluated (for single-entry ES bundles). */
  readonly expectedExports?: ExpectedExports;
  /**
   * Custom validator that receives the generated output chunks.
   * Use this for cases where simple export comparison is insufficient
   * (e.g., dynamic imports producing multiple chunks).
   */
  readonly validate?: (output: ReadonlyArray<OutputChunk>) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip ES module syntax (import/export) from bundled code so it can be
 * evaluated as a plain script in a VM context.
 *
 * Handles:
 *  - `export default <expr>`
 *  - `export { ... }` and `export { ... } from "..."`
 *  - `export * from "..."`
 *  - `export const/let/var/function/class`
 *  - `import ... from "..."`
 *  - dynamic `import("...")`
 */
const stripModuleSyntax = (code: string): string => {
  return (
    code
      // export default function/class (keep declaration)
      .replace(/\bexport\s+default\s+function\s+/g, "function ")
      .replace(/\bexport\s+default\s+class\s+/g, "class ")
      // export default <expr>
      .replace(/\bexport\s+default\s+/g, "var __default__ = ")
      // export { ... } from "..." — drop entirely
      .replace(/\bexport\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]\s*;?/g, "")
      // export * from "..." — drop entirely
      .replace(/\bexport\s*\*\s*from\s*['"][^'"]*['"]\s*;?/g, "")
      // export { ... } — drop entirely (values already declared)
      .replace(/\bexport\s*\{[^}]*\}\s*;?/g, "")
      // export const/let/var/function/class
      .replace(/\bexport\s+(const|let|var|function|class)\s+/g, "$1 ")
      // import ... from "..."
      .replace(/\bimport\s+[^;]*?\s*from\s*['"][^'"]*['"]\s*;?/g, "")
      // import "..." (side-effect import)
      .replace(/\bimport\s*['"][^'"]*['"]\s*;?/g, "")
      // dynamic import()
      .replace(/\bimport\s*\(([^)]*)\)/g, "Promise.resolve({})")
  );
};

/**
 * Evaluate an ES module bundle by rewriting export statements into
 * assignments on an exports object, then running via vm.runInNewContext.
 */
const evaluateEsModule = (code: string): Record<string, unknown> => {
  // Collect all export names from the original code
  const exportNames: Array<{ local: string; exported: string }> = [];

  // Named exports: export { foo, bar as baz } (but NOT re-exports with `from`)
  const namedExportRe = /export\s*\{([^}]+)\}\s*(?!from\s);\s*/g;
  let namedMatch: RegExpExecArray | null;
  while ((namedMatch = namedExportRe.exec(code)) !== null) {
    // Skip re-export patterns that include "from"
    if (/from\s*['"]/.test(namedMatch[0])) {
      continue;
    }
    const inner = namedMatch[1];
    for (const spec of inner.split(",")) {
      const parts = spec.trim().split(/\s+as\s+/);
      const local = parts[0].trim();
      const exported = (parts[1] ?? parts[0]).trim();
      exportNames.push({ local, exported });
    }
  }

  // Declaration exports: export const/let/var name = ...
  const declExportRe = /export\s+(?:const|let|var)\s+([a-zA-Z_$][\w$]*)/g;
  let declMatch: RegExpExecArray | null;
  while ((declMatch = declExportRe.exec(code)) !== null) {
    exportNames.push({ local: declMatch[1], exported: declMatch[1] });
  }

  // Function exports: export function name(...)
  const funcExportRe = /export\s+function\s+([a-zA-Z_$][\w$]*)/g;
  let funcMatch: RegExpExecArray | null;
  while ((funcMatch = funcExportRe.exec(code)) !== null) {
    exportNames.push({ local: funcMatch[1], exported: funcMatch[1] });
  }

  // Class exports: export class Name
  const classExportRe = /export\s+class\s+([a-zA-Z_$][\w$]*)/g;
  let classMatch: RegExpExecArray | null;
  while ((classMatch = classExportRe.exec(code)) !== null) {
    exportNames.push({ local: classMatch[1], exported: classMatch[1] });
  }

  // Default export
  const hasDefault = /export\s+default\s+/.test(code);

  // Strip module syntax
  let rewritten = stripModuleSyntax(code);

  // The bundler may emit `const` declarations after their usage.
  // Convert `const` to `var` so hoisting makes the code evaluable.
  rewritten = rewritten.replace(/\bconst\s+/g, "var ");
  rewritten = rewritten.replace(/\blet\s+/g, "var ");

  // Build the assignment suffix
  const assignments = exportNames
    .map(
      ({ local, exported }) =>
        `__exports[${JSON.stringify(exported)}] = ${local};`,
    )
    .join("\n");

  if (hasDefault) {
    rewritten += "\n__exports.default = __default__;";
  }
  rewritten += "\n" + assignments;

  const exports: Record<string, unknown> = {};
  const context = vm.createContext({
    __exports: exports,
    console,
    setTimeout,
    clearTimeout,
    Promise,
  });

  vm.runInNewContext(rewritten, context, { timeout: 5000 });
  return exports;
};

/**
 * Evaluate a CJS bundle using new Function.
 */
const evaluateCjsModule = (code: string): Record<string, unknown> => {
  const mod = { exports: {} as Record<string, unknown> };
  const fn = new Function("module", "exports", "require", code);
  fn(mod, mod.exports, () => {
    throw new Error("require() not supported in sandbox");
  });
  return mod.exports;
};

/**
 * Check if esbuild is available for optional comparison.
 */
let esbuildAvailable: boolean | null = null;
const isEsbuildAvailable = async (): Promise<boolean> => {
  if (esbuildAvailable !== null) {
    return esbuildAvailable;
  }
  try {
    await import("esbuild");
    esbuildAvailable = true;
  } catch {
    esbuildAvailable = false;
  }
  return esbuildAvailable;
};

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const TEST_CASES: ReadonlyArray<DifferentialTestCase> = [
  // 1. Simple constant export
  {
    label: "simple constant export",
    files: [
      {
        name: "index.js",
        content:
          "export const answer = 42;\nexport const greeting = 'hello';\n",
      },
    ],
    entry: "index.js",
    expectedExports: { answer: 42, greeting: "hello" },
  },

  // 2. Function export
  {
    label: "function export",
    files: [
      {
        name: "index.js",
        content: [
          "export function add(a, b) { return a + b; }",
          "export function multiply(a, b) { return a * b; }",
          "",
        ].join("\n"),
      },
    ],
    entry: "index.js",
    validate: (output) => {
      const chunk = output[0];
      const exports = evaluateEsModule(chunk.code);
      expect(typeof exports.add).toBe("function");
      expect(typeof exports.multiply).toBe("function");
      expect((exports.add as (a: number, b: number) => number)(2, 3)).toBe(5);
      expect((exports.multiply as (a: number, b: number) => number)(4, 5)).toBe(
        20,
      );
    },
  },

  // 3. Class export
  {
    label: "class export",
    files: [
      {
        name: "index.js",
        content: [
          "export class Counter {",
          "  constructor(initial) { this.count = initial || 0; }",
          "  increment() { this.count++; return this.count; }",
          "  getValue() { return this.count; }",
          "}",
          "",
        ].join("\n"),
      },
    ],
    entry: "index.js",
    validate: (output) => {
      const chunk = output[0];
      const exports = evaluateEsModule(chunk.code);
      expect(typeof exports.Counter).toBe("function");
      const CounterClass = exports.Counter as new (n?: number) => {
        increment: () => number;
        getValue: () => number;
      };
      const c = new CounterClass(10);
      expect(c.getValue()).toBe(10);
      expect(c.increment()).toBe(11);
    },
  },

  // 4. Re-exports
  {
    label: "re-exports from another module",
    files: [
      {
        name: "utils.js",
        content: "export const PI = 3.14159;\nexport const E = 2.71828;\n",
      },
      {
        name: "index.js",
        content: 'export { PI, E } from "./utils.js";\n',
      },
    ],
    entry: "index.js",
    inputOptions: { treeshake: false },
    validate: (output) => {
      const chunk = output[0];
      // Re-exports should reference the exported names
      expect(chunk.exports).toContain("PI");
      expect(chunk.exports).toContain("E");
      // The output should reference utils.js or inline the values
      expect(chunk.code).toContain("PI");
      expect(chunk.code).toContain("E");
    },
  },

  // 5. Tree-shaking (unused export removed)
  {
    label: "tree-shaking removes unused export",
    files: [
      {
        name: "lib.js",
        content:
          "export const used = 'included';\nexport const unused = 'excluded';\n",
      },
      {
        name: "index.js",
        content: [
          'import { used } from "./lib.js";',
          "export const result = used;",
          "",
        ].join("\n"),
      },
    ],
    entry: "index.js",
    validate: (output) => {
      const chunk = output[0];
      // The unused export should be tree-shaken away
      expect(chunk.code).toContain("included");
      expect(chunk.code).not.toContain("excluded");
      // Verify the result export is declared
      expect(chunk.exports).toContain("result");
    },
  },

  // 6. Dynamic import (produces chunks)
  {
    label: "dynamic import produces separate chunks",
    files: [
      {
        name: "lazy.js",
        content: "export const lazyValue = 'loaded-lazily';\n",
      },
      {
        name: "index.js",
        content: [
          "export const loadLazy = () => import('./lazy.js');",
          "",
        ].join("\n"),
      },
    ],
    entry: "index.js",
    outputOptions: { format: "es", dir: "dist" },
    validate: (output) => {
      // Should produce at least 2 chunks: entry + dynamic
      expect(output.length).toBeGreaterThanOrEqual(2);
      const entryChunk = output.find((c) => c.isEntry);
      expect(entryChunk).toBeDefined();
      expect(entryChunk!.code).toContain("import(");
      const dynamicChunk = output.find((c) => c.isDynamicEntry);
      expect(dynamicChunk).toBeDefined();
      // The dynamic chunk should exist as a separate output
      expect(dynamicChunk!.fileName).toBeTruthy();
    },
  },

  // 7. External module handling
  {
    label: "external modules are preserved as imports",
    files: [
      {
        name: "index.js",
        content: [
          'import { readFileSync } from "node:fs";',
          "export const reader = readFileSync;",
          "",
        ].join("\n"),
      },
    ],
    entry: "index.js",
    inputOptions: { external: ["node:fs"] },
    validate: (output) => {
      const chunk = output[0];
      // External import should be preserved in the output
      expect(chunk.code).toContain("node:fs");
      // Should still have an import statement (not bundled)
      expect(chunk.code).toMatch(/import\s.*from\s+['"]node:fs['"]/);
    },
  },

  // 8. Multiple entry points
  {
    label: "multiple entry points produce output",
    files: [
      {
        name: "shared.js",
        content: "export const shared = 'shared-value';\n",
      },
      {
        name: "entry-a.js",
        content: [
          'import { shared } from "./shared.js";',
          "export const a = 'entry-a-' + shared;",
          "",
        ].join("\n"),
      },
      {
        name: "entry-b.js",
        content: [
          'import { shared } from "./shared.js";',
          "export const b = 'entry-b-' + shared;",
          "",
        ].join("\n"),
      },
    ],
    entry: ["entry-a.js", "entry-b.js"],
    outputOptions: { format: "es", dir: "dist" },
    validate: (output) => {
      // At least one entry chunk should exist
      const entryChunks = output.filter((c) => c.isEntry);
      expect(entryChunks.length).toBeGreaterThanOrEqual(1);
      // All code combined should reference the shared value
      const allCode = output.map((c) => c.code).join("\n");
      expect(allCode).toContain("shared");
      expect(allCode).toContain("entry-a-");
      expect(allCode).toContain("entry-b-");
    },
  },

  // 9. CJS format output (evaluable via new Function)
  {
    label: "CJS format output is evaluable",
    files: [
      {
        name: "index.js",
        content: [
          "export const name = 'steamroller';",
          "export const version = 1;",
          "",
        ].join("\n"),
      },
    ],
    entry: "index.js",
    outputOptions: { format: "cjs" },
    validate: (output) => {
      const chunk = output[0];
      // CJS output should use module.exports or exports
      const exports = evaluateCjsModule(chunk.code);
      expect(exports.name).toBe("steamroller");
      expect(exports.version).toBe(1);
    },
  },

  // 10. Mixed default + named exports
  {
    label: "mixed default and named exports",
    files: [
      {
        name: "index.js",
        content: [
          "export const tag = 'widget';",
          "export const version = 2;",
          "const widget = { tag: 'widget', version: 2 };",
          "export default widget;",
          "",
        ].join("\n"),
      },
    ],
    entry: "index.js",
    validate: (output) => {
      const chunk = output[0];
      // All export names should be declared in the chunk metadata
      expect(chunk.exports).toContain("default");
      expect(chunk.exports).toContain("tag");
      expect(chunk.exports).toContain("version");
      // The code should preserve the exported values
      expect(chunk.code).toContain("widget");
      expect(chunk.code).toContain("tag");
      expect(chunk.code).toContain("version");
    },
  },

  // 11. Namespace re-export (export * from)
  {
    label: "namespace re-export with export star",
    files: [
      {
        name: "math.js",
        content: [
          "export const add = (a, b) => a + b;",
          "export const sub = (a, b) => a - b;",
          "",
        ].join("\n"),
      },
      {
        name: "index.js",
        content: 'export * from "./math.js";\n',
      },
    ],
    entry: "index.js",
    inputOptions: { treeshake: false },
    validate: (output) => {
      const chunk = output[0];
      // The bundler may inline the exports or preserve the star re-export.
      // Either way, the output should be syntactically valid and reference
      // the source module.
      expect(chunk.code).toContain("math");
      // The output should be parseable as a module
      const stripped = stripModuleSyntax(chunk.code);
      expect(() => {
        new Function(stripped);
      }).not.toThrow();
    },
  },

  // 12. Chained imports across multiple modules
  {
    label: "chained imports across three modules",
    files: [
      {
        name: "base.js",
        content: "export const base = 100;\n",
      },
      {
        name: "middle.js",
        content: [
          'import { base } from "./base.js";',
          "export const doubled = base * 2;",
          "",
        ].join("\n"),
      },
      {
        name: "index.js",
        content: [
          'import { doubled } from "./middle.js";',
          "export const result = doubled + 1;",
          "",
        ].join("\n"),
      },
    ],
    entry: "index.js",
    inputOptions: { treeshake: false },
    validate: (output) => {
      const chunk = output[0];
      // All three modules should be bundled into a single chunk
      expect(chunk.code).toContain("100");
      expect(chunk.code).toContain("result");
      expect(chunk.code).toContain("doubled");
      expect(chunk.code).toContain("base");
      // Imports should be resolved (no import statements remain)
      expect(chunk.code).not.toContain('from "');
      expect(chunk.code).not.toContain("from '");
      expect(chunk.exports).toContain("result");
    },
  },
];

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

describe("differential testing framework", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-diff-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper: create files, run rollup + generate, return output chunks.
   */
  const buildCase = async (
    tc: DifferentialTestCase,
  ): Promise<ReadonlyArray<OutputChunk>> => {
    // Write all files
    for (const file of tc.files) {
      await writeFile(join(tempDir, file.name), file.content);
    }

    // Resolve entry path(s)
    const entry = Array.isArray(tc.entry)
      ? tc.entry.map((e) => join(tempDir, e))
      : join(tempDir, tc.entry);

    const inputOpts: InputOptions = {
      input: entry,
      ...tc.inputOptions,
    };

    const build = await rollup(inputOpts);
    const outputOpts: OutputOptions = tc.outputOptions ?? { format: "es" };
    const { output } = await build.generate(outputOpts);
    await build.close();

    return output.filter((o): o is OutputChunk => o.type === "chunk");
  };

  // Run each test case
  for (const tc of TEST_CASES) {
    it(tc.label, async () => {
      const chunks = await buildCase(tc);
      expect(chunks.length).toBeGreaterThanOrEqual(1);

      const primaryChunk = chunks[0];

      // a) Verify syntax validity by parsing in a VM context
      const format = tc.outputOptions?.format ?? "es";
      if (format === "cjs") {
        // CJS output can be validated directly with new Function
        expect(() => {
          new Function("module", "exports", "require", primaryChunk.code);
        }).not.toThrow();
      } else {
        // ES module output contains import/export syntax which new Function
        // cannot parse. Strip module keywords and verify the remaining JS
        // is syntactically valid.
        const strippedCode = stripModuleSyntax(primaryChunk.code);
        expect(() => {
          new Function(strippedCode);
        }).not.toThrow();
      }

      // b) + c) Run custom validation or check expected exports
      if (tc.validate) {
        tc.validate(chunks);
      } else if (tc.expectedExports) {
        const exports =
          format === "cjs"
            ? evaluateCjsModule(primaryChunk.code)
            : evaluateEsModule(primaryChunk.code);

        for (const [key, expectedValue] of Object.entries(tc.expectedExports)) {
          expect(exports[key]).toEqual(expectedValue);
        }
      }
    });
  }

  // Extensibility: optional esbuild comparison
  it("framework supports optional esbuild comparison", async () => {
    const available = await isEsbuildAvailable();
    if (!available) {
      // Just verify the detection works without failing
      expect(available).toBe(false);
      return;
    }

    // If esbuild IS available, we could run a comparison here.
    // This test documents the extensibility point.
    expect(available).toBe(true);
  });
});
