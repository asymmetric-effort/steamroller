/**
 * Tests for src/validation/bundle-validator.ts
 *
 * Covers:
 * - Valid bundles passing validation
 * - Syntactically invalid code detection
 * - Missing import reference detection
 */
import { describe, it, expect } from "vitest";
import { validateBundle } from "../../../src/validation/bundle-validator.js";
import type { OutputChunk, OutputAsset } from "../../../src/types.js";

/**
 * Helper to create a minimal OutputChunk for testing.
 */
const createChunk = (overrides: Partial<OutputChunk> = {}): OutputChunk => ({
  type: "chunk",
  code: "const x = 1;\nexport { x };\n",
  fileName: "bundle.js",
  preliminaryFileName: "bundle.js",
  sourcemapFileName: null,
  map: null,
  exports: [],
  facadeModuleId: null,
  isDynamicEntry: false,
  isEntry: true,
  isImplicitEntry: false,
  moduleIds: [],
  name: "bundle",
  dynamicImports: [],
  implicitlyLoadedBefore: [],
  importedBindings: {},
  imports: [],
  modules: {},
  referencedFiles: [],
  ...overrides,
});

describe("validateBundle", () => {
  describe("valid bundles", () => {
    it("passes validation for a simple valid chunk", () => {
      const chunk = createChunk({
        code: "const x = 1;\nexport { x };\n",
      });
      const result = validateBundle([chunk]);
      expect(result.valid).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].warnings).toHaveLength(0);
    });

    it("passes validation for multiple valid chunks", () => {
      const entry = createChunk({
        fileName: "entry.js",
        code: 'import { y } from "external";\nconst x = y + 1;\n',
        imports: ["external"],
      });
      const dynamic = createChunk({
        fileName: "chunk-abc.js",
        code: "export const z = 42;\n",
        isEntry: false,
        isDynamicEntry: true,
      });
      const result = validateBundle([entry, dynamic], new Set(["external"]));
      expect(result.valid).toBe(true);
    });

    it("passes validation for chunks that import other chunks", () => {
      const entry = createChunk({
        fileName: "entry.js",
        code: 'import { z } from "./chunk-abc.js";\nconst x = z;\n',
        imports: ["chunk-abc.js"],
        dynamicImports: [],
      });
      const dynamic = createChunk({
        fileName: "chunk-abc.js",
        code: "export const z = 42;\n",
      });
      const result = validateBundle([entry, dynamic]);
      expect(result.valid).toBe(true);
    });

    it("ignores asset items in the output array", () => {
      const chunk = createChunk({
        code: "const x = 1;\n",
      });
      const asset: OutputAsset = {
        type: "asset",
        fileName: "style.css",
        name: "style.css",
        names: ["style.css"],
        needsCodeReference: false,
        originalFileName: null,
        originalFileNames: [],
        source: "body { color: red; }",
      };
      const result = validateBundle([chunk, asset]);
      expect(result.valid).toBe(true);
      expect(result.results).toHaveLength(1);
    });

    it("passes validation for an empty output array", () => {
      const result = validateBundle([]);
      expect(result.valid).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe("syntactically invalid code", () => {
    it("catches syntax errors in chunk code", () => {
      const chunk = createChunk({
        code: "const x = {;\n",
      });
      const result = validateBundle([chunk]);
      expect(result.valid).toBe(false);
      expect(result.results[0].warnings.length).toBeGreaterThan(0);
      expect(result.results[0].warnings[0].code).toBe("CHUNK_INVALID_SYNTAX");
    });

    it("includes chunk fileName in the syntax error warning", () => {
      const chunk = createChunk({
        fileName: "broken.js",
        code: "function( {}\n",
      });
      const result = validateBundle([chunk]);
      expect(result.valid).toBe(false);
      const warning = result.results[0].warnings[0];
      expect(warning.message).toContain("broken.js");
      expect(warning.id).toBe("broken.js");
    });

    it("catches unterminated string literals", () => {
      const chunk = createChunk({
        code: 'const x = "hello\n',
      });
      const result = validateBundle([chunk]);
      expect(result.valid).toBe(false);
      expect(result.results[0].warnings[0].code).toBe("CHUNK_INVALID_SYNTAX");
    });

    it("still validates other chunks even when one has a syntax error", () => {
      const goodChunk = createChunk({
        fileName: "good.js",
        code: "const a = 1;\n",
      });
      const badChunk = createChunk({
        fileName: "bad.js",
        code: "const = ;\n",
      });
      const result = validateBundle([goodChunk, badChunk]);
      expect(result.valid).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].warnings).toHaveLength(0);
      expect(result.results[1].warnings.length).toBeGreaterThan(0);
    });
  });

  describe("missing import references", () => {
    it("catches imports that reference neither a chunk nor an external", () => {
      const chunk = createChunk({
        code: 'import { foo } from "missing-module";\n',
        imports: ["missing-module"],
      });
      const result = validateBundle([chunk]);
      expect(result.valid).toBe(false);
      expect(result.results[0].warnings.length).toBeGreaterThan(0);
      expect(result.results[0].warnings[0].code).toBe("CHUNK_MISSING_IMPORT");
      expect(result.results[0].warnings[0].message).toContain("missing-module");
    });

    it("does not flag imports that reference declared externals", () => {
      const chunk = createChunk({
        code: 'import { foo } from "lodash";\n',
        imports: ["lodash"],
      });
      const result = validateBundle([chunk], new Set(["lodash"]));
      expect(result.valid).toBe(true);
    });

    it("does not flag imports that reference other chunks by fileName", () => {
      const entry = createChunk({
        fileName: "entry.js",
        code: 'import { z } from "./utils.js";\n',
        imports: ["utils.js"],
      });
      const utils = createChunk({
        fileName: "utils.js",
        code: "export const z = 1;\n",
      });
      const result = validateBundle([entry, utils]);
      expect(result.valid).toBe(true);
    });

    it("catches missing dynamic import references", () => {
      const chunk = createChunk({
        code: 'const mod = await import("./ghost.js");\n',
        dynamicImports: ["ghost.js"],
      });
      const result = validateBundle([chunk]);
      expect(result.valid).toBe(false);
      const warning = result.results[0].warnings.find(
        (w) => w.code === "CHUNK_MISSING_IMPORT",
      );
      expect(warning).toBeDefined();
      expect(warning!.message).toContain("ghost.js");
    });

    it("catches importedBindings referencing unknown sources", () => {
      const chunk = createChunk({
        code: "const x = foo;\n",
        importedBindings: { "unknown-source": ["foo"] },
      });
      const result = validateBundle([chunk]);
      expect(result.valid).toBe(false);
      const warning = result.results[0].warnings.find(
        (w) => w.code === "CHUNK_UNDEFINED_DECONFLICTED_NAME",
      );
      expect(warning).toBeDefined();
      expect(warning!.message).toContain("unknown-source");
    });
  });
});
