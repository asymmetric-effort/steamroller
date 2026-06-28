/**
 * Tests for src/validation/verify-imports.ts
 *
 * Covers verifyBuild() — post-build import specifier verification:
 * - Clean bundles pass verification
 * - Bundles with broken/dangling import specifiers are caught
 * - External imports are correctly identified and allowed
 */
import { describe, it, expect } from "bun:test";
import {
  verifyBuild,
  extractImportSpecifiers,
} from "../../../src/validation/verify-imports.js";
import type { OutputChunk, OutputAsset } from "../../../src/types.js";

/**
 * Helper to create a minimal OutputChunk for testing.
 */
const makeChunk = (
  fileName: string,
  code: string,
  overrides: Partial<OutputChunk> = {},
): OutputChunk => ({
  type: "chunk",
  fileName,
  code,
  map: null,
  sourcemapFileName: null,
  preliminaryFileName: fileName,
  exports: [],
  facadeModuleId: null,
  isDynamicEntry: false,
  isEntry: true,
  isImplicitEntry: false,
  moduleIds: [],
  name: fileName.replace(/\.js$/, ""),
  dynamicImports: [],
  implicitlyLoadedBefore: [],
  importedBindings: {},
  imports: [],
  modules: {},
  referencedFiles: [],
  ...overrides,
});

/**
 * Helper to create a minimal OutputAsset for testing.
 */
const makeAsset = (fileName: string, source: string): OutputAsset => ({
  type: "asset",
  fileName,
  name: fileName,
  names: [fileName],
  needsCodeReference: false,
  originalFileName: null,
  originalFileNames: [],
  source,
});

describe("extractImportSpecifiers", () => {
  it("extracts ES static imports", () => {
    const code = `import { foo } from "lodash";\nimport bar from "./utils.js";`;
    const specifiers = extractImportSpecifiers(code);
    expect(specifiers).toContain("lodash");
    expect(specifiers).toContain("./utils.js");
  });

  it("extracts ES dynamic imports", () => {
    const code = `const m = import("./chunk-abc.js");`;
    const specifiers = extractImportSpecifiers(code);
    expect(specifiers).toContain("./chunk-abc.js");
  });

  it("extracts CJS require calls", () => {
    const code = `const fs = require("node:fs");\nconst _ = require("lodash");`;
    const specifiers = extractImportSpecifiers(code);
    expect(specifiers).toContain("node:fs");
    expect(specifiers).toContain("lodash");
  });

  it("extracts export-from specifiers", () => {
    const code = `export { default } from "react";`;
    const specifiers = extractImportSpecifiers(code);
    expect(specifiers).toContain("react");
  });

  it("returns empty array for code with no imports", () => {
    const code = `const x = 42;\nconsole.log(x);`;
    const specifiers = extractImportSpecifiers(code);
    expect(specifiers).toHaveLength(0);
  });

  it("deduplicates repeated specifiers", () => {
    const code = `import { a } from "lodash";\nimport { b } from "lodash";`;
    const specifiers = extractImportSpecifiers(code);
    const lodashOccurrences = specifiers.filter((s) => s === "lodash");
    expect(lodashOccurrences).toHaveLength(1);
  });
});

describe("verifyBuild", () => {
  describe("clean bundles pass verification", () => {
    it("passes for a single chunk with no imports", () => {
      const chunk = makeChunk("bundle.js", "const x = 42;");
      const result = verifyBuild([chunk], []);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("passes when imports reference other chunks in the output", () => {
      const entry = makeChunk(
        "entry.js",
        `import { helper } from "./utils.js";\nhelper();`,
      );
      const utils = makeChunk("utils.js", `export const helper = () => {};`, {
        isEntry: false,
      });
      const result = verifyBuild([entry, utils], []);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("passes when imports match declared externals", () => {
      const chunk = makeChunk(
        "bundle.js",
        `import { useState } from "react";\nuseState();`,
      );
      const result = verifyBuild([chunk], ["react"]);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("passes when imports are bare specifiers (assumed external)", () => {
      const chunk = makeChunk("bundle.js", `import _ from "lodash";\n_(42);`);
      const result = verifyBuild([chunk], []);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("ignores asset items in the output array", () => {
      const chunk = makeChunk("bundle.js", "const x = 1;");
      const asset = makeAsset("style.css", "body { color: red; }");
      const result = verifyBuild([chunk, asset], []);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("passes with externals provided as a Set", () => {
      const chunk = makeChunk(
        "bundle.js",
        `import { readFile } from "node:fs";`,
      );
      const result = verifyBuild([chunk], new Set(["node:fs"]));
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe("broken import specifiers are caught", () => {
    it("reports a relative import that references no chunk", () => {
      const chunk = makeChunk(
        "bundle.js",
        `import { foo } from "./missing.js";\nfoo();`,
      );
      const result = verifyBuild([chunk], []);
      expect(result.valid).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("VERIFY_IMPORT_DANGLING");
      expect(result.warnings[0].message).toContain("./missing.js");
      expect(result.warnings[0].message).toContain("bundle.js");
    });

    it("reports an absolute import that is not a chunk or external", () => {
      const chunk = makeChunk(
        "bundle.js",
        `import { foo } from "/absolute/path.js";\nfoo();`,
      );
      const result = verifyBuild([chunk], []);
      expect(result.valid).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("VERIFY_IMPORT_DANGLING");
      expect(result.warnings[0].message).toContain("/absolute/path.js");
    });

    it("reports multiple dangling imports across chunks", () => {
      const chunk1 = makeChunk("entry.js", `import { a } from "./gone-a.js";`);
      const chunk2 = makeChunk("other.js", `import { b } from "./gone-b.js";`, {
        isEntry: false,
      });
      const result = verifyBuild([chunk1, chunk2], []);
      expect(result.valid).toBe(false);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0].message).toContain("./gone-a.js");
      expect(result.warnings[1].message).toContain("./gone-b.js");
    });

    it("reports dangling dynamic imports", () => {
      const chunk = makeChunk(
        "bundle.js",
        `const m = import("./lazy-missing.js");`,
      );
      const result = verifyBuild([chunk], []);
      expect(result.valid).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain("./lazy-missing.js");
    });

    it("reports dangling require calls", () => {
      const chunk = makeChunk(
        "bundle.cjs",
        `const m = require("./not-here.js");`,
      );
      const result = verifyBuild([chunk], []);
      expect(result.valid).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain("./not-here.js");
    });
  });

  describe("external imports are correctly identified", () => {
    it("allows deep imports from a declared external package", () => {
      const chunk = makeChunk("bundle.js", `import merge from "lodash/merge";`);
      const result = verifyBuild([chunk], ["lodash"]);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("allows deep imports from a scoped external package", () => {
      const chunk = makeChunk(
        "bundle.js",
        `import { something } from "@scope/pkg/deep";`,
      );
      const result = verifyBuild([chunk], ["@scope/pkg"]);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("allows node: protocol specifiers as externals", () => {
      const chunk = makeChunk(
        "bundle.js",
        `import { readFileSync } from "node:fs";`,
      );
      // node: protocol specifiers are not bare, so they must be declared external
      const result = verifyBuild([chunk], ["node:fs"]);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("flags node: protocol specifiers when not declared external", () => {
      const chunk = makeChunk(
        "bundle.js",
        `import { readFileSync } from "node:fs";`,
      );
      const result = verifyBuild([chunk], []);
      expect(result.valid).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain("node:fs");
    });

    it("allows bare specifiers even without explicit externals list", () => {
      const chunk = makeChunk(
        "bundle.js",
        `import express from "express";\nimport React from "react";`,
      );
      const result = verifyBuild([chunk], []);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });
});
