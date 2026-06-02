/**
 * @module tests/unit/plugins/dts-plugin
 * @description Unit tests for the built-in dts declaration file generation plugin.
 */

import { describe, it, expect } from "vitest";
import type {
  OutputBundle,
  OutputChunk,
  OutputAsset,
} from "../../../src/types.js";
import {
  dtsPlugin,
  buildDeclarationContent,
  getDtsFileName,
} from "../../../src/plugins/dts-plugin.js";

// Helper: create a minimal OutputChunk
const makeChunk = (
  fileName: string,
  exports: ReadonlyArray<string>,
  isEntry: boolean,
): OutputChunk => ({
  type: "chunk",
  code: "// generated code",
  fileName,
  preliminaryFileName: fileName,
  sourcemapFileName: null,
  map: null,
  exports,
  facadeModuleId: `/src/${fileName}`,
  isDynamicEntry: false,
  isEntry,
  isImplicitEntry: false,
  moduleIds: [`/src/${fileName}`],
  name: fileName.replace(/\.js$/, ""),
  dynamicImports: [],
  implicitlyLoadedBefore: [],
  importedBindings: {},
  imports: [],
  modules: {},
  referencedFiles: [],
});

describe("dts-plugin", () => {
  describe("buildDeclarationContent", () => {
    it("generates declarations for named exports", () => {
      const content = buildDeclarationContent(["foo", "bar"]);
      expect(content).toContain("export declare const foo: any;");
      expect(content).toContain("export declare const bar: any;");
    });

    it("generates default export declaration", () => {
      const content = buildDeclarationContent(["default"]);
      expect(content).toContain("export default any;");
      expect(content).not.toContain("export declare const default");
    });

    it("handles mixed named and default exports", () => {
      const content = buildDeclarationContent(["foo", "default", "bar"]);
      expect(content).toContain("export declare const foo: any;");
      expect(content).toContain("export default any;");
      expect(content).toContain("export declare const bar: any;");
    });

    it("produces empty content for no exports", () => {
      const content = buildDeclarationContent([]);
      expect(content).toBe("\n");
    });
  });

  describe("getDtsFileName", () => {
    it("converts .js to .d.ts", () => {
      expect(getDtsFileName("index.js")).toBe("index.d.ts");
    });

    it("converts .mjs to .d.mts", () => {
      expect(getDtsFileName("index.mjs")).toBe("index.d.mts");
    });

    it("converts .cjs to .d.cts", () => {
      expect(getDtsFileName("index.cjs")).toBe("index.d.cts");
    });

    it("appends .d.ts to other extensions", () => {
      expect(getDtsFileName("index.bundle")).toBe("index.bundle.d.ts");
    });
  });

  describe("dtsPlugin generateBundle", () => {
    it("generates .d.ts files for entry chunks", () => {
      const plugin = dtsPlugin();
      const bundle: OutputBundle = {
        "index.js": makeChunk("index.js", ["foo", "bar"], true),
      } as unknown as OutputBundle;

      // Call the generateBundle hook
      const hook = plugin.generateBundle as (
        options: unknown,
        bundle: OutputBundle,
        isWrite: boolean,
      ) => void;
      hook({}, bundle, false);

      const dtsFile = (bundle as Record<string, unknown>)[
        "index.d.ts"
      ] as OutputAsset;
      expect(dtsFile).toBeDefined();
      expect(dtsFile.type).toBe("asset");
      expect(dtsFile.fileName).toBe("index.d.ts");
      expect(typeof dtsFile.source).toBe("string");
      expect(dtsFile.source as string).toContain(
        "export declare const foo: any;",
      );
      expect(dtsFile.source as string).toContain(
        "export declare const bar: any;",
      );
    });

    it("includes default exports in declaration", () => {
      const plugin = dtsPlugin();
      const bundle: OutputBundle = {
        "main.js": makeChunk("main.js", ["default", "helper"], true),
      } as unknown as OutputBundle;

      const hook = plugin.generateBundle as (
        options: unknown,
        bundle: OutputBundle,
        isWrite: boolean,
      ) => void;
      hook({}, bundle, false);

      const dtsFile = (bundle as Record<string, unknown>)[
        "main.d.ts"
      ] as OutputAsset;
      expect(dtsFile).toBeDefined();
      expect(dtsFile.source as string).toContain("export default any;");
      expect(dtsFile.source as string).toContain(
        "export declare const helper: any;",
      );
    });

    it("does not generate declarations for non-entry chunks", () => {
      const plugin = dtsPlugin();
      const bundle: OutputBundle = {
        "chunk-abc123.js": makeChunk("chunk-abc123.js", ["internal"], false),
      } as unknown as OutputBundle;

      const hook = plugin.generateBundle as (
        options: unknown,
        bundle: OutputBundle,
        isWrite: boolean,
      ) => void;
      hook({}, bundle, false);

      const dtsFile = (bundle as Record<string, unknown>)["chunk-abc123.d.ts"];
      expect(dtsFile).toBeUndefined();
    });

    it("generates declarations only for entry chunks in a mixed bundle", () => {
      const plugin = dtsPlugin();
      const bundle: OutputBundle = {
        "entry.js": makeChunk("entry.js", ["main"], true),
        "shared.js": makeChunk("shared.js", ["util"], false),
      } as unknown as OutputBundle;

      const hook = plugin.generateBundle as (
        options: unknown,
        bundle: OutputBundle,
        isWrite: boolean,
      ) => void;
      hook({}, bundle, false);

      expect((bundle as Record<string, unknown>)["entry.d.ts"]).toBeDefined();
      expect(
        (bundle as Record<string, unknown>)["shared.d.ts"],
      ).toBeUndefined();
    });
  });
});
