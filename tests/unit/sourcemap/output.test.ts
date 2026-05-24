/**
 * Tests for source map output modes.
 *
 * @module tests/unit/sourcemap/output
 */

import { describe, it, expect } from "vitest";
import {
  generateSourcemapOutput,
  type SourcemapMode,
  type SourcemapOutputOptions,
} from "../../../src/sourcemap/output.js";
import type { RawSourceMap } from "../../../src/sourcemap/compose.js";

const createTestMap = (): RawSourceMap => ({
  version: 3,
  sources: ["input.js"],
  sourcesContent: ["const x = 1;"],
  names: ["x"],
  mappings: "AAAA",
});

describe("sourcemap/output", () => {
  describe("generateSourcemapOutput - mode: false", () => {
    it("should return code unchanged with no map", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = { mode: false, file: "out.js" };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.code).toBe(code);
      expect(result.map).toBeNull();
      expect(result.mapFileName).toBeNull();
    });

    it("should not append any comment when disabled", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = { mode: false };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.code).not.toContain("sourceMappingURL");
    });
  });

  describe("generateSourcemapOutput - mode: true (normal)", () => {
    it("should append sourceMappingURL comment", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = { mode: true, file: "out.js" };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.code).toContain("//# sourceMappingURL=out.js.map");
      expect(result.map).not.toBeNull();
      expect(result.mapFileName).toBe("out.js.map");
    });

    it("should use sourcemapFile when specified", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapFile: "custom.map",
      };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.code).toContain("//# sourceMappingURL=custom.map");
      expect(result.mapFileName).toBe("custom.map");
    });

    it("should fallback to unknown.map when no file specified", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = { mode: true };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.mapFileName).toBe("unknown.map");
    });

    it("should include sources and names in output map", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = { mode: true, file: "out.js" };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.map!.sources).toEqual(["input.js"]);
      expect(result.map!.names).toEqual(["x"]);
      expect(result.map!.mappings).toBe("AAAA");
    });
  });

  describe("generateSourcemapOutput - mode: 'inline'", () => {
    it("should embed source map as base64 data URL", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: "inline",
        file: "out.js",
      };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.code).toContain(
        "//# sourceMappingURL=data:application/json;charset=utf-8;base64,",
      );
      expect(result.map).toBeNull();
      expect(result.mapFileName).toBeNull();
    });

    it("should produce a valid base64-encoded JSON map", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: "inline",
        file: "out.js",
      };

      const result = generateSourcemapOutput(map, code, options);

      const base64Part = result.code.split("base64,")[1];
      const decoded = JSON.parse(
        Buffer.from(base64Part, "base64").toString("utf-8"),
      );

      expect(decoded.version).toBe(3);
      expect(decoded.sources).toBeDefined();
      expect(decoded.mappings).toBeDefined();
    });

    it("should not produce a separate map file", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: "inline",
        file: "out.js",
      };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.map).toBeNull();
      expect(result.mapFileName).toBeNull();
    });
  });

  describe("generateSourcemapOutput - mode: 'hidden'", () => {
    it("should not append sourceMappingURL comment", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: "hidden",
        file: "out.js",
      };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.code).toBe(code);
      expect(result.code).not.toContain("sourceMappingURL");
    });

    it("should still produce the map and map file name", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: "hidden",
        file: "out.js",
      };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.map).not.toBeNull();
      expect(result.mapFileName).toBe("out.js.map");
    });

    it("should use sourcemapFile when specified in hidden mode", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: "hidden",
        file: "out.js",
        sourcemapFile: "hidden.map",
      };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.mapFileName).toBe("hidden.map");
    });
  });

  describe("processSourceMap - path transforms", () => {
    it("should apply sourcemapPathTransform to sources", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapPathTransform: (path: string) => `transformed/${path}`,
      };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.map!.sources).toEqual(["transformed/input.js"]);
    });

    it("should pass map path to path transform", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const receivedPaths: Array<[string, string]> = [];
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapPathTransform: (path: string, mapPath: string) => {
          receivedPaths.push([path, mapPath]);
          return path;
        },
      };

      generateSourcemapOutput(map, code, options);

      expect(receivedPaths[0][1]).toBe("out.js.map");
    });

    it("should apply sourcemapBaseUrl to sources", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapBaseUrl: "https://example.com/sources",
      };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.map!.sources).toEqual([
        "https://example.com/sources/input.js",
      ]);
    });

    it("should handle sourcemapBaseUrl with trailing slash", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapBaseUrl: "https://example.com/sources/",
      };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.map!.sources).toEqual([
        "https://example.com/sources/input.js",
      ]);
    });

    it("should apply base URL before path transform", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapBaseUrl: "https://cdn.example.com",
        sourcemapPathTransform: (path: string) => path.toUpperCase(),
      };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.map!.sources).toEqual(["HTTPS://CDN.EXAMPLE.COM/INPUT.JS"]);
    });
  });

  describe("processSourceMap - ignore list", () => {
    it("should build x_google_ignoreList from predicate", () => {
      const map: RawSourceMap = {
        version: 3,
        sources: ["src/app.js", "node_modules/lib.js", "src/util.js"],
        sourcesContent: ["a", "b", "c"],
        names: [],
        mappings: "AAAA",
      };
      const code = "bundled code";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapIgnoreList: (path: string) => path.includes("node_modules"),
      };

      const result = generateSourcemapOutput(map, code, options);

      const resultMap = result.map as unknown as Record<string, unknown>;
      expect(resultMap["x_google_ignoreList"]).toEqual([1]);
    });

    it("should not include x_google_ignoreList when no sources match", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapIgnoreList: () => false,
      };

      const result = generateSourcemapOutput(map, code, options);

      const resultMap = result.map as unknown as Record<string, unknown>;
      expect(resultMap["x_google_ignoreList"]).toBeUndefined();
    });

    it("should pass map path to ignore list predicate", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const receivedMapPaths: Array<string> = [];
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapFile: "custom.js.map",
        sourcemapIgnoreList: (_path: string, mapPath: string) => {
          receivedMapPaths.push(mapPath);
          return false;
        },
      };

      generateSourcemapOutput(map, code, options);

      expect(receivedMapPaths[0]).toBe("custom.js.map");
    });
  });

  describe("processSourceMap - exclude sources", () => {
    it("should remove sourcesContent when excludeSources is true", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapExcludeSources: true,
      };

      const result = generateSourcemapOutput(map, code, options);

      const resultMap = result.map as unknown as Record<string, unknown>;
      expect(resultMap["sourcesContent"]).toBeUndefined();
    });

    it("should keep sourcesContent when excludeSources is false", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapExcludeSources: false,
      };

      const result = generateSourcemapOutput(map, code, options);

      const resultMap = result.map as unknown as Record<string, unknown>;
      expect(resultMap["sourcesContent"]).toEqual(["const x = 1;"]);
    });

    it("should keep sourcesContent when excludeSources is undefined", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
      };

      const result = generateSourcemapOutput(map, code, options);

      const resultMap = result.map as unknown as Record<string, unknown>;
      expect(resultMap["sourcesContent"]).toEqual(["const x = 1;"]);
    });
  });

  describe("processSourceMap - debug IDs", () => {
    it("should add debugId when sourcemapDebugIds is true", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapDebugIds: true,
      };

      const result = generateSourcemapOutput(map, code, options);

      const resultMap = result.map as unknown as Record<string, unknown>;
      expect(resultMap["debugId"]).toBeDefined();
      expect(typeof resultMap["debugId"]).toBe("string");
    });

    it("should not add debugId when sourcemapDebugIds is false", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapDebugIds: false,
      };

      const result = generateSourcemapOutput(map, code, options);

      const resultMap = result.map as unknown as Record<string, unknown>;
      expect(resultMap["debugId"]).toBeUndefined();
    });

    it("should generate deterministic debug IDs for same input", () => {
      const map = createTestMap();
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "out.js",
        sourcemapDebugIds: true,
      };

      const result1 = generateSourcemapOutput(map, code, options);
      const result2 = generateSourcemapOutput(map, code, options);

      const map1 = result1.map as unknown as Record<string, unknown>;
      const map2 = result2.map as unknown as Record<string, unknown>;
      expect(map1["debugId"]).toBe(map2["debugId"]);
    });
  });

  describe("processSourceMap - map without sourcesContent", () => {
    it("should handle map without sourcesContent gracefully", () => {
      const map: RawSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: "AAAA",
      };
      const code = "const x = 1;";
      const options: SourcemapOutputOptions = { mode: true, file: "out.js" };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.map).not.toBeNull();
      const resultMap = result.map as unknown as Record<string, unknown>;
      expect(resultMap["sourcesContent"]).toBeUndefined();
    });
  });

  describe("edge cases", () => {
    it("should handle empty code string", () => {
      const map = createTestMap();
      const options: SourcemapOutputOptions = { mode: true, file: "out.js" };

      const result = generateSourcemapOutput(map, "", options);

      expect(result.code).toContain("//# sourceMappingURL=out.js.map");
    });

    it("should handle inline mode with empty code", () => {
      const map = createTestMap();
      const options: SourcemapOutputOptions = {
        mode: "inline",
        file: "out.js",
      };

      const result = generateSourcemapOutput(map, "", options);

      expect(result.code).toContain("//# sourceMappingURL=data:");
    });

    it("should work with all options combined", () => {
      const map: RawSourceMap = {
        version: 3,
        sources: ["src/app.js", "node_modules/dep.js"],
        sourcesContent: ["app code", "dep code"],
        names: ["fn"],
        mappings: "AAAA",
      };
      const code = "bundled();";
      const options: SourcemapOutputOptions = {
        mode: true,
        file: "dist/bundle.js",
        sourcemapBaseUrl: "https://cdn.example.com",
        sourcemapExcludeSources: true,
        sourcemapDebugIds: true,
        sourcemapPathTransform: (path: string) =>
          path.replace("https://cdn.example.com/", "../"),
        sourcemapIgnoreList: (path: string) => path.includes("node_modules"),
      };

      const result = generateSourcemapOutput(map, code, options);

      expect(result.map).not.toBeNull();
      expect(result.code).toContain("//# sourceMappingURL=");
      const resultMap = result.map as unknown as Record<string, unknown>;
      expect(resultMap["sourcesContent"]).toBeUndefined();
      expect(resultMap["debugId"]).toBeDefined();
    });

    it("should handle mode as SourcemapMode type correctly", () => {
      const map = createTestMap();
      const code = "const x = 1;";

      const modes: ReadonlyArray<SourcemapMode> = [
        true,
        false,
        "inline",
        "hidden",
      ];

      for (let i = 0; i < modes.length; i++) {
        const options: SourcemapOutputOptions = {
          mode: modes[i],
          file: "out.js",
        };
        const result = generateSourcemapOutput(map, code, options);
        expect(result.code).toBeDefined();
      }
    });
  });
});
