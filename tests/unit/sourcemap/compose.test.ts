/**
 * Tests for source map composition.
 *
 * @module tests/unit/sourcemap/compose
 */

import { describe, it, expect } from "bun:test";
import {
  decodeSourceMap,
  encodeSourceMap,
  composeSourceMaps,
  composeMultipleMaps,
  type DecodedSourceMap,
  type RawSourceMap,
} from "../../../src/sourcemap/compose.js";

describe("sourcemap/compose", () => {
  describe("decodeSourceMap", () => {
    it("should decode a simple raw source map to absolute positions", () => {
      const raw: RawSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: "AAAA,EAAC;ACDE",
      };

      const decoded = decodeSourceMap(raw);

      expect(decoded.version).toBe(3);
      expect(decoded.sources).toEqual(["input.js"]);
      expect(decoded.names).toEqual([]);
      expect(decoded.mappings.length).toBe(2);
      // First line, first segment: [0, 0, 0, 0]
      expect(decoded.mappings[0][0]).toEqual([0, 0, 0, 0]);
    });

    it("should handle empty mappings", () => {
      const raw: RawSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: "",
      };

      const decoded = decodeSourceMap(raw);

      expect(decoded.mappings).toEqual([[]]);
    });

    it("should decode mappings with multiple segments per line", () => {
      const raw: RawSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: "AAAA,EAAC,GAAE",
      };

      const decoded = decodeSourceMap(raw);

      expect(decoded.mappings[0].length).toBe(3);
      // First segment: col=0, source=0, origLine=0, origCol=0
      expect(decoded.mappings[0][0]).toEqual([0, 0, 0, 0]);
      // Second segment: col=0+2=2, source=0, origLine=0+0=0, origCol=0+1=1
      expect(decoded.mappings[0][1]).toEqual([2, 0, 0, 1]);
      // Third segment: col=2+3=5, source=0, origLine=0+0=0, origCol=1+2=3
      expect(decoded.mappings[0][2]).toEqual([5, 0, 0, 3]);
    });

    it("should decode mappings with name index", () => {
      const raw: RawSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: ["foo"],
        mappings: "AAAAA",
      };

      const decoded = decodeSourceMap(raw);

      expect(decoded.mappings[0][0]).toEqual([0, 0, 0, 0, 0]);
    });

    it("should preserve sourcesContent", () => {
      const raw: RawSourceMap = {
        version: 3,
        sources: ["input.js"],
        sourcesContent: ["const x = 1;"],
        names: [],
        mappings: "AAAA",
      };

      const decoded = decodeSourceMap(raw);

      expect(decoded.sourcesContent).toEqual(["const x = 1;"]);
    });

    it("should handle multiple lines with empty lines", () => {
      const raw: RawSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: "AAAA;;AACA",
      };

      const decoded = decodeSourceMap(raw);

      expect(decoded.mappings.length).toBe(3);
      expect(decoded.mappings[1]).toEqual([]);
    });

    it("should handle segments with only generated column", () => {
      const raw: RawSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: "A",
      };

      const decoded = decodeSourceMap(raw);

      expect(decoded.mappings[0][0]).toEqual([0]);
    });
  });

  describe("encodeSourceMap", () => {
    it("should encode a decoded source map back to raw form", () => {
      const decoded: DecodedSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const raw = encodeSourceMap(decoded);

      expect(raw.version).toBe(3);
      expect(raw.sources).toEqual(["input.js"]);
      expect(raw.mappings).toBe("AAAA");
    });

    it("should encode multiple segments per line", () => {
      const decoded: DecodedSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: [
          [
            [0, 0, 0, 0],
            [5, 0, 0, 5],
          ],
        ],
      };

      const raw = encodeSourceMap(decoded);

      // Second segment: col delta=5, source delta=0, line delta=0, col delta=5
      expect(raw.mappings).toBe("AAAA,KAAK");
    });

    it("should encode multiple lines", () => {
      const decoded: DecodedSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]], [[0, 0, 1, 0]]],
      };

      const raw = encodeSourceMap(decoded);

      expect(raw.mappings).toContain(";");
    });

    it("should encode empty lines", () => {
      const decoded: DecodedSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]], [], [[0, 0, 2, 0]]],
      };

      const raw = encodeSourceMap(decoded);

      expect(raw.mappings).toContain(";;");
    });

    it("should round-trip decode then encode", () => {
      const original: RawSourceMap = {
        version: 3,
        sources: ["input.js"],
        sourcesContent: ["const x = 1;\nconst y = 2;"],
        names: ["x"],
        mappings: "AAAAA,EAAC;ACDE",
      };

      const decoded = decodeSourceMap(original);
      const reEncoded = encodeSourceMap(decoded);

      expect(reEncoded.mappings).toBe(original.mappings);
      expect(reEncoded.sources).toEqual(original.sources);
      expect(reEncoded.names).toEqual(original.names);
    });

    it("should encode segments with name index", () => {
      const decoded: DecodedSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: ["foo"],
        mappings: [[[0, 0, 0, 0, 0]]],
      };

      const raw = encodeSourceMap(decoded);
      const reDecoded = decodeSourceMap(raw);

      expect(reDecoded.mappings[0][0]).toEqual([0, 0, 0, 0, 0]);
    });

    it("should preserve sourcesContent in encoded map", () => {
      const decoded: DecodedSourceMap = {
        version: 3,
        sources: ["input.js"],
        sourcesContent: ["hello"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const raw = encodeSourceMap(decoded);

      expect(raw.sourcesContent).toEqual(["hello"]);
    });
  });

  describe("composeSourceMaps", () => {
    it("should compose two simple identity-like maps", () => {
      // mapA: line 0, col 0 -> source 0, line 0, col 0
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        sourcesContent: ["const x = 1;"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      // mapB: line 0, col 0 -> source 0, line 0, col 0 (in mapA's output)
      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const composed = composeSourceMaps(mapA, mapB);

      expect(composed.version).toBe(3);
      expect(composed.sources).toEqual(["original.js"]);
      expect(composed.mappings[0][0][0]).toBe(0); // generated col
      expect(composed.mappings[0][0][1]).toBe(0); // source index
      expect(composed.mappings[0][0][2]).toBe(0); // original line
      expect(composed.mappings[0][0][3]).toBe(0); // original col
    });

    it("should compose maps with column offsets", () => {
      // mapA: col 0 -> orig col 0, col 5 -> orig col 10
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        names: [],
        mappings: [
          [
            [0, 0, 0, 0],
            [5, 0, 0, 10],
          ],
        ],
      };

      // mapB: col 0 -> intermediate col 5 (which maps to orig col 10 in mapA)
      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: [],
        mappings: [[[0, 0, 0, 5]]],
      };

      const composed = composeSourceMaps(mapA, mapB);

      expect(composed.mappings[0][0]).toEqual([0, 0, 0, 10]);
    });

    it("should compose maps with line offsets", () => {
      // mapA: line 0 -> orig line 0, line 1 -> orig line 5
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]], [[0, 0, 5, 0]]],
      };

      // mapB: maps to line 1 in mapA's output
      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: [],
        mappings: [[[0, 0, 1, 0]]],
      };

      const composed = composeSourceMaps(mapA, mapB);

      expect(composed.mappings[0][0][2]).toBe(5); // original line from mapA
    });

    it("should handle segments without source info in mapB", () => {
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: [],
        mappings: [[[0], [5, 0, 0, 0]]],
      };

      const composed = composeSourceMaps(mapA, mapB);

      expect(composed.mappings[0][0]).toEqual([0]);
      expect(composed.mappings[0][1].length).toBeGreaterThanOrEqual(4);
    });

    it("should handle target line beyond mapA range", () => {
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      // mapB references line 99 which doesn't exist in mapA
      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: [],
        mappings: [[[0, 0, 99, 0]]],
      };

      const composed = composeSourceMaps(mapA, mapB);

      // Should fall back to segment without source info
      expect(composed.mappings[0][0]).toEqual([0]);
    });

    it("should handle empty line in mapA during lookup", () => {
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]], [], [[0, 0, 2, 0]]],
      };

      // mapB references line 1 which is empty in mapA
      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: [],
        mappings: [[[0, 0, 1, 0]]],
      };

      const composed = composeSourceMaps(mapA, mapB);

      // Empty line means no segment found
      expect(composed.mappings[0][0]).toEqual([0]);
    });

    it("should preserve names from mapA", () => {
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        names: ["myVar"],
        mappings: [[[0, 0, 0, 0, 0]]],
      };

      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const composed = composeSourceMaps(mapA, mapB);

      expect(composed.names).toContain("myVar");
      expect(composed.mappings[0][0][4]).toBe(0);
    });

    it("should merge names from mapB when mapA has none", () => {
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: ["renamedVar"],
        mappings: [[[0, 0, 0, 0, 0]]],
      };

      const composed = composeSourceMaps(mapA, mapB);

      expect(composed.names).toContain("renamedVar");
    });

    it("should compose A -> B -> C (three transforms)", () => {
      // A maps col 0 -> orig col 0
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        names: [],
        mappings: [
          [
            [0, 0, 0, 0],
            [10, 0, 0, 20],
          ],
        ],
      };

      // B maps col 0 -> A output col 10
      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["a-output.js"],
        names: [],
        mappings: [[[0, 0, 0, 10]]],
      };

      // C maps col 0 -> B output col 0
      const mapC: DecodedSourceMap = {
        version: 3,
        sources: ["b-output.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const ab = composeSourceMaps(mapA, mapB);
      const abc = composeSourceMaps(ab, mapC);

      // Should trace back to original col 20
      expect(abc.mappings[0][0][3]).toBe(20);
      expect(abc.sources).toEqual(["original.js"]);
    });

    it("should handle multiple sources in mapA", () => {
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["file1.js", "file2.js"],
        names: [],
        mappings: [
          [
            [0, 0, 0, 0],
            [10, 1, 5, 3],
          ],
        ],
      };

      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: [],
        mappings: [[[0, 0, 0, 10]]],
      };

      const composed = composeSourceMaps(mapA, mapB);

      expect(composed.sources).toEqual(["file1.js", "file2.js"]);
      expect(composed.mappings[0][0][1]).toBe(1); // source index 1
      expect(composed.mappings[0][0][2]).toBe(5); // line from file2
      expect(composed.mappings[0][0][3]).toBe(3); // col from file2
    });

    it("should preserve sourcesContent from mapA", () => {
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        sourcesContent: ["const x = 1;"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const composed = composeSourceMaps(mapA, mapB);

      expect(composed.sourcesContent).toEqual(["const x = 1;"]);
    });

    it("should handle mapA without sourcesContent", () => {
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const composed = composeSourceMaps(mapA, mapB);

      expect(composed.sourcesContent).toBeUndefined();
    });
  });

  describe("composeMultipleMaps", () => {
    it("should return null for empty array", () => {
      const result = composeMultipleMaps([]);

      expect(result).toBeNull();
    });

    it("should return null for array of all nulls", () => {
      const result = composeMultipleMaps([null, null, null]);

      expect(result).toBeNull();
    });

    it("should return the single map if only one non-null", () => {
      const map: DecodedSourceMap = {
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const result = composeMultipleMaps([null, map, null]);

      expect(result).toEqual(map);
    });

    it("should compose multiple maps in order", () => {
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        names: [],
        mappings: [
          [
            [0, 0, 0, 0],
            [10, 0, 0, 20],
          ],
        ],
      };

      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["a-output.js"],
        names: [],
        mappings: [[[0, 0, 0, 10]]],
      };

      const mapC: DecodedSourceMap = {
        version: 3,
        sources: ["b-output.js"],
        names: [],
        mappings: [[[0, 0, 0, 0]]],
      };

      const result = composeMultipleMaps([mapA, mapB, mapC]);

      expect(result).not.toBeNull();
      expect(result!.mappings[0][0][3]).toBe(20);
    });

    it("should filter out nulls between valid maps", () => {
      const mapA: DecodedSourceMap = {
        version: 3,
        sources: ["original.js"],
        names: [],
        mappings: [
          [
            [0, 0, 0, 0],
            [5, 0, 0, 10],
          ],
        ],
      };

      const mapB: DecodedSourceMap = {
        version: 3,
        sources: ["intermediate.js"],
        names: [],
        mappings: [[[0, 0, 0, 5]]],
      };

      const result = composeMultipleMaps([mapA, null, mapB]);

      expect(result).not.toBeNull();
      expect(result!.mappings[0][0][3]).toBe(10);
    });

    it("should compose identity maps correctly", () => {
      // Identity map: each position maps to itself
      const identity: DecodedSourceMap = {
        version: 3,
        sources: ["file.js"],
        names: [],
        mappings: [
          [
            [0, 0, 0, 0],
            [5, 0, 0, 5],
            [10, 0, 0, 10],
          ],
        ],
      };

      const result = composeMultipleMaps([identity, identity]);

      expect(result).not.toBeNull();
      // Composing identity with identity should still map to same positions
      expect(result!.mappings[0][0][3]).toBe(0);
      expect(result!.mappings[0][1][3]).toBe(5);
      expect(result!.mappings[0][2][3]).toBe(10);
    });
  });
});
