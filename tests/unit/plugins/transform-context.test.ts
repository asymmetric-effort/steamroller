/**
 * @module tests/unit/plugins/transform-context
 * @description Unit tests for TransformPluginContext implementation.
 */

import { describe, it, expect } from "bun:test";
import type {
  ExistingDecodedSourceMap,
  SourceMapSegment,
} from "../../../src/types.js";
import {
  TransformPluginContextImpl,
  createIdentitySourceMap,
  toDecodedSourceMap,
  toExistingDecodedSourceMap,
} from "../../../src/plugins/transform-context.js";
import type { TransformContextConfig } from "../../../src/plugins/transform-context.js";
import { InMemoryModuleGraph } from "../../../src/plugins/plugin-context.js";

const makeConfig = (
  overrides: Partial<TransformContextConfig> = {},
): TransformContextConfig => {
  return {
    pluginName: "test-transform-plugin",
    resolver: async () => null,
    loader: async () => ({
      id: "test",
      code: "",
      ast: null,
      isEntry: false,
      isExternal: false,
      importedIds: [],
      importedIdResolutions: [],
      dynamicallyImportedIds: [],
      dynamicallyImportedIdResolutions: [],
      exportedBindings: null,
      exports: null,
      hasDefaultExport: null,
      moduleSideEffects: true,
      syntheticNamedExports: false,
      meta: {},
      implicitlyLoadedAfterOneOf: [],
      implicitlyLoadedBefore: [],
      importers: [],
      dynamicImporters: [],
      attributes: {},
      isIncluded: null,
    }),
    parser: (code: string) => ({
      type: "Program",
      body: [],
      sourceType: "module",
      start: 0,
      end: code.length,
    }),
    moduleGraph: new InMemoryModuleGraph(),
    filename: "src/input.ts",
    originalCode: "const x = 1;\nconst y = 2;\n",
    ...overrides,
  };
};

describe("transform-context", () => {
  describe("createIdentitySourceMap", () => {
    it("should create an identity map for single-line code", () => {
      const map = createIdentitySourceMap("file.ts", "const x = 1;");
      expect(map.version).toBe(3);
      expect(map.sources).toEqual(["file.ts"]);
      expect(map.sourcesContent).toEqual(["const x = 1;"]);
      expect(map.names).toEqual([]);
      expect(map.mappings.length).toBe(1);
      expect(map.mappings[0][0]).toEqual([0, 0, 0, 0]);
    });

    it("should create identity map for multi-line code", () => {
      const code = "line1\nline2\nline3";
      const map = createIdentitySourceMap("test.js", code);
      expect(map.mappings.length).toBe(3);
      expect(map.mappings[0][0]).toEqual([0, 0, 0, 0]);
      expect(map.mappings[1][0]).toEqual([0, 0, 1, 0]);
      expect(map.mappings[2][0]).toEqual([0, 0, 2, 0]);
    });

    it("should handle empty code", () => {
      const map = createIdentitySourceMap("empty.ts", "");
      expect(map.mappings.length).toBe(1);
    });
  });

  describe("toDecodedSourceMap", () => {
    it("should convert ExistingDecodedSourceMap to DecodedSourceMap", () => {
      const input: ExistingDecodedSourceMap = {
        version: 3,
        sources: ["a.ts"],
        names: ["x"],
        mappings: [[[0, 0, 0, 0, 0] as SourceMapSegment]],
      };
      const decoded = toDecodedSourceMap(input);
      expect(decoded.version).toBe(3);
      expect(decoded.sources).toEqual(["a.ts"]);
      expect(decoded.names).toEqual(["x"]);
      expect(decoded.mappings[0][0]).toEqual([0, 0, 0, 0, 0]);
    });

    it("should handle sourcesContent", () => {
      const input: ExistingDecodedSourceMap = {
        version: 3,
        sources: ["a.ts"],
        sourcesContent: ["code"],
        names: [],
        mappings: [],
      };
      const decoded = toDecodedSourceMap(input);
      expect(decoded.sourcesContent).toEqual(["code"]);
    });

    it("should handle undefined sourcesContent", () => {
      const input: ExistingDecodedSourceMap = {
        version: 3,
        sources: ["a.ts"],
        names: [],
        mappings: [],
      };
      const decoded = toDecodedSourceMap(input);
      expect(decoded.sourcesContent).toBeUndefined();
    });
  });

  describe("toExistingDecodedSourceMap", () => {
    it("should convert DecodedSourceMap back to ExistingDecodedSourceMap", () => {
      const input = {
        version: 3 as const,
        sources: ["b.ts"],
        names: ["y"],
        mappings: [[[0, 0, 0, 0]]],
      };
      const existing = toExistingDecodedSourceMap(input);
      expect(existing.version).toBe(3);
      expect(existing.sources).toEqual(["b.ts"]);
      expect(existing.mappings[0][0]).toEqual([0, 0, 0, 0]);
    });

    it("should handle sourcesContent", () => {
      const input = {
        version: 3 as const,
        sources: ["b.ts"],
        sourcesContent: ["content"],
        names: [],
        mappings: [] as Array<Array<Array<number>>>,
      };
      const existing = toExistingDecodedSourceMap(input);
      expect(existing.sourcesContent).toEqual(["content"]);
    });

    it("should handle undefined sourcesContent", () => {
      const input = {
        version: 3 as const,
        sources: ["b.ts"],
        names: [],
        mappings: [] as Array<Array<Array<number>>>,
      };
      const existing = toExistingDecodedSourceMap(input);
      expect(existing.sourcesContent).toBeUndefined();
    });
  });

  describe("TransformPluginContextImpl", () => {
    it("should construct with config", () => {
      const ctx = new TransformPluginContextImpl(makeConfig());
      expect(ctx.getPluginName()).toBe("test-transform-plugin");
      expect(ctx.getSourceMapCount()).toBe(0);
    });

    describe("getCombinedSourcemap", () => {
      it("should return identity map when no transforms applied", () => {
        const ctx = new TransformPluginContextImpl(makeConfig());
        const map = ctx.getCombinedSourcemap();
        expect(map.version).toBe(3);
        expect(map.sources).toEqual(["src/input.ts"]);
        expect(map.sourcesContent).toEqual(["const x = 1;\nconst y = 2;\n"]);
        expect(map.mappings.length).toBe(3); // 2 lines + trailing newline
      });

      it("should return original sourcemap when provided and no transforms", () => {
        const originalMap: ExistingDecodedSourceMap = {
          version: 3,
          sources: ["original.ts"],
          sourcesContent: ["original"],
          names: [],
          mappings: [[[0, 0, 0, 0] as SourceMapSegment]],
        };
        const ctx = new TransformPluginContextImpl(
          makeConfig({ originalSourcemap: originalMap }),
        );
        const map = ctx.getCombinedSourcemap();
        expect(map.sources).toEqual(["original.ts"]);
      });

      it("should compose a single transform map", () => {
        const ctx = new TransformPluginContextImpl(makeConfig());
        const transformMap: ExistingDecodedSourceMap = {
          version: 3,
          sources: ["src/input.ts"],
          names: [],
          mappings: [
            [[0, 0, 0, 0] as SourceMapSegment],
            [[0, 0, 1, 0] as SourceMapSegment],
          ],
        };
        ctx.addSourceMap(transformMap);
        expect(ctx.getSourceMapCount()).toBe(1);

        const combined = ctx.getCombinedSourcemap();
        expect(combined.version).toBe(3);
        expect(combined.mappings.length).toBe(2);
      });

      it("should compose multiple transform maps", () => {
        const ctx = new TransformPluginContextImpl(makeConfig());
        const map1: ExistingDecodedSourceMap = {
          version: 3,
          sources: ["src/input.ts"],
          names: [],
          mappings: [
            [[0, 0, 0, 0] as SourceMapSegment],
            [[0, 0, 1, 0] as SourceMapSegment],
            [[0, 0, 2, 0] as SourceMapSegment],
          ],
        };
        const map2: ExistingDecodedSourceMap = {
          version: 3,
          sources: ["intermediate"],
          names: [],
          mappings: [
            [[0, 0, 0, 0] as SourceMapSegment],
            [[0, 0, 1, 0] as SourceMapSegment],
            [[0, 0, 2, 0] as SourceMapSegment],
          ],
        };
        ctx.addSourceMap(map1);
        ctx.addSourceMap(map2);
        expect(ctx.getSourceMapCount()).toBe(2);

        const combined = ctx.getCombinedSourcemap();
        expect(combined.version).toBe(3);
        expect(combined.mappings.length).toBeGreaterThan(0);
      });

      it("should compose with originalSourcemap when transforms are added", () => {
        const originalMap: ExistingDecodedSourceMap = {
          version: 3,
          sources: ["real-original.ts"],
          sourcesContent: ["real code"],
          names: [],
          mappings: [[[0, 0, 0, 0] as SourceMapSegment]],
        };
        const ctx = new TransformPluginContextImpl(
          makeConfig({ originalSourcemap: originalMap }),
        );
        const transformMap: ExistingDecodedSourceMap = {
          version: 3,
          sources: ["intermediate"],
          names: [],
          mappings: [[[0, 0, 0, 0] as SourceMapSegment]],
        };
        ctx.addSourceMap(transformMap);

        const combined = ctx.getCombinedSourcemap();
        expect(combined.version).toBe(3);
        expect(combined.sources).toEqual(["real-original.ts"]);
      });

      it("should handle null originalSourcemap", () => {
        const ctx = new TransformPluginContextImpl(
          makeConfig({ originalSourcemap: null }),
        );
        const map = ctx.getCombinedSourcemap();
        expect(map.sources).toEqual(["src/input.ts"]);
      });
    });

    it("should inherit PluginContext methods", () => {
      const ctx = new TransformPluginContextImpl(makeConfig());
      ctx.addWatchFile("watched.ts");
      expect(ctx.getWatchFiles()).toEqual(["watched.ts"]);
    });

    it("should support parse method from parent", () => {
      const ctx = new TransformPluginContextImpl(makeConfig());
      const ast = ctx.parse("const a = 1;");
      expect(ast.type).toBe("Program");
    });
  });
});
