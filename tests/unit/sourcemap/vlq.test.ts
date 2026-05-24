import { describe, it, expect } from "vitest";
import {
  encodeVlq,
  decodeVlq,
  encodeSegment,
  decodeMappings,
  encodeMappings,
} from "../../../src/sourcemap/vlq.js";

describe("encodeVlq", () => {
  it('should encode 0 to "A"', () => {
    expect(encodeVlq(0)).toBe("A");
  });

  it('should encode 1 to "C"', () => {
    expect(encodeVlq(1)).toBe("C");
  });

  it('should encode -1 to "D"', () => {
    expect(encodeVlq(-1)).toBe("D");
  });

  it("should encode small positive numbers", () => {
    expect(encodeVlq(2)).toBe("E");
    expect(encodeVlq(3)).toBe("G");
    expect(encodeVlq(15)).toBe("e");
  });

  it("should encode small negative numbers", () => {
    expect(encodeVlq(-2)).toBe("F");
    expect(encodeVlq(-3)).toBe("H");
    expect(encodeVlq(-15)).toBe("f");
  });

  it("should encode large positive numbers requiring continuation", () => {
    // 16 = 0b10000 -> signed: 0b100000 -> needs two chars
    expect(encodeVlq(16)).toBe("gB");
    expect(encodeVlq(100)).toBe("oG");
    expect(encodeVlq(1000)).toBe("w+B");
  });

  it("should encode large negative numbers requiring continuation", () => {
    expect(encodeVlq(-16)).toBe("hB");
    expect(encodeVlq(-100)).toBe("pG");
    expect(encodeVlq(-1000)).toBe("x+B");
  });
});

describe("decodeVlq", () => {
  it('should decode "A" to 0', () => {
    const result = decodeVlq("A", 0);
    expect(result.value).toBe(0);
    expect(result.length).toBe(1);
  });

  it('should decode "C" to 1', () => {
    const result = decodeVlq("C", 0);
    expect(result.value).toBe(1);
    expect(result.length).toBe(1);
  });

  it('should decode "D" to -1', () => {
    const result = decodeVlq("D", 0);
    expect(result.value).toBe(-1);
    expect(result.length).toBe(1);
  });

  it("should decode multi-character VLQ values", () => {
    const result = decodeVlq("gB", 0);
    expect(result.value).toBe(16);
    expect(result.length).toBe(2);
  });

  it("should decode from a given position", () => {
    const result = decodeVlq("ACE", 1);
    expect(result.value).toBe(1);
    expect(result.length).toBe(1);
  });

  it("should throw on invalid characters", () => {
    expect(() => decodeVlq("!", 0)).toThrow("Invalid Base64 VLQ character");
  });

  it("should throw on unexpected end of string", () => {
    // 'g' has continuation bit set but string ends
    expect(() => decodeVlq("g", 0)).toThrow(
      "Unexpected end of VLQ encoded string",
    );
  });

  it("should round-trip with encodeVlq for various values", () => {
    const testValues = [
      0, 1, -1, 15, -15, 16, -16, 100, -100, 1000, -1000, 32767, -32768,
    ];
    for (const val of testValues) {
      const encoded = encodeVlq(val);
      const decoded = decodeVlq(encoded, 0);
      expect(decoded.value).toBe(val);
      expect(decoded.length).toBe(encoded.length);
    }
  });
});

describe("encodeSegment", () => {
  it("should encode an empty segment", () => {
    expect(encodeSegment([])).toBe("");
  });

  it("should encode a single-field segment", () => {
    expect(encodeSegment([0])).toBe("A");
    expect(encodeSegment([1])).toBe("C");
  });

  it("should encode a 4-field segment", () => {
    // [0, 0, 0, 0] -> "AAAA"
    expect(encodeSegment([0, 0, 0, 0])).toBe("AAAA");
  });

  it("should encode a 5-field segment", () => {
    // [0, 0, 0, 0, 0] -> "AAAAA"
    expect(encodeSegment([0, 0, 0, 0, 0])).toBe("AAAAA");
  });

  it("should encode a segment with mixed values", () => {
    const segment = [1, 0, 0, 0];
    const encoded = encodeSegment(segment);
    expect(encoded).toBe("CAAA");
  });

  it("should round-trip with decodeVlq for complex segments", () => {
    const segment = [5, -3, 10, -7, 2];
    const encoded = encodeSegment(segment);

    // Manually decode the segment
    const decoded: Array<number> = [];
    let pos = 0;
    for (let i = 0; i < segment.length; i++) {
      const result = decodeVlq(encoded, pos);
      decoded.push(result.value);
      pos += result.length;
    }
    expect(decoded).toEqual(segment);
  });
});

describe("decodeMappings", () => {
  it("should decode empty mappings string", () => {
    const result = decodeMappings("");
    expect(result).toEqual([[]]);
  });

  it("should decode a single segment", () => {
    const result = decodeMappings("AAAA");
    expect(result).toEqual([[[0, 0, 0, 0]]]);
  });

  it("should decode multiple segments on one line", () => {
    const result = decodeMappings("AAAA,CAAA");
    expect(result).toEqual([
      [
        [0, 0, 0, 0],
        [1, 0, 0, 0],
      ],
    ]);
  });

  it("should decode multiple lines", () => {
    const result = decodeMappings("AAAA;CAAA");
    expect(result).toEqual([[[0, 0, 0, 0]], [[1, 0, 0, 0]]]);
  });

  it("should handle empty lines", () => {
    const result = decodeMappings("AAAA;;CAAA");
    expect(result).toEqual([[[0, 0, 0, 0]], [], [[1, 0, 0, 0]]]);
  });

  it("should decode a realistic mappings string", () => {
    // A simple but realistic mapping
    const mappings = "AACA,SAAS";
    const result = decodeMappings(mappings);
    expect(result.length).toBe(1);
    expect(result[0].length).toBe(2);
    expect(result[0][0]).toEqual([0, 0, 1, 0]);
    expect(result[0][1]).toEqual([9, 0, 0, 9]);
  });

  it("should decode segments with 5 fields (names)", () => {
    const mappings = "AAAAA";
    const result = decodeMappings(mappings);
    expect(result).toEqual([[[0, 0, 0, 0, 0]]]);
  });

  it("should decode segments with 1 field (column only)", () => {
    const mappings = "A";
    const result = decodeMappings(mappings);
    expect(result).toEqual([[[0]]]);
  });
});

describe("encodeMappings", () => {
  it("should encode empty structure", () => {
    expect(encodeMappings([[]])).toBe("");
  });

  it("should encode a single segment", () => {
    expect(encodeMappings([[[0, 0, 0, 0]]])).toBe("AAAA");
  });

  it("should encode multiple segments", () => {
    expect(
      encodeMappings([
        [
          [0, 0, 0, 0],
          [1, 0, 0, 0],
        ],
      ]),
    ).toBe("AAAA,CAAA");
  });

  it("should encode multiple lines", () => {
    expect(encodeMappings([[[0, 0, 0, 0]], [[1, 0, 0, 0]]])).toBe("AAAA;CAAA");
  });

  it("should encode empty lines", () => {
    expect(encodeMappings([[[0, 0, 0, 0]], [], [[1, 0, 0, 0]]])).toBe(
      "AAAA;;CAAA",
    );
  });

  it("should round-trip with decodeMappings", () => {
    const testCases = [
      "AAAA",
      "AAAA,CAAA",
      "AAAA;CAAA",
      "AAAA;;CAAA",
      "AACA,SAAS",
      "AAAAA",
      "A",
      "",
    ];

    for (const original of testCases) {
      const decoded = decodeMappings(original);
      const reencoded = encodeMappings(decoded);
      expect(reencoded).toBe(original);
    }
  });

  it("should round-trip a complex realistic mapping", () => {
    // Multi-line mapping with various segment sizes
    const original = "AAAA,IAAM,KAAK;AACA,MAAI;AACA";
    const decoded = decodeMappings(original);
    const reencoded = encodeMappings(decoded);
    expect(reencoded).toBe(original);
  });
});
