/**
 * VLQ (Variable-Length Quantity) encoding/decoding for source maps.
 *
 * Implements the Base64 VLQ encoding used in source map mappings strings,
 * as specified in the Source Map Revision 3 proposal.
 */

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

import { SOURCEMAP_ERROR } from "../utils/error-codes.js";

const charToInt = new Map<string, number>();
for (let i = 0; i < BASE64_CHARS.length; i++) {
  charToInt.set(BASE64_CHARS[i], i);
}

const VLQ_BASE_SHIFT = 5;
const VLQ_BASE = 1 << VLQ_BASE_SHIFT; // 32
const VLQ_BASE_MASK = VLQ_BASE - 1; // 0b11111
const VLQ_CONTINUATION_BIT = VLQ_BASE; // 0b100000

/**
 * Convert an integer to sign-magnitude representation for VLQ encoding.
 * The least significant bit stores the sign (1 = negative).
 */
const toVlqSigned = (value: number): number => {
  return value < 0 ? (-value << 1) + 1 : (value << 1) + 0;
};

/**
 * Convert from sign-magnitude VLQ representation back to a signed integer.
 */
const fromVlqSigned = (value: number): number => {
  const isNegative = (value & 1) === 1;
  const shifted = value >> 1;
  return isNegative ? -shifted : shifted;
};

/**
 * Encode a single integer to a Base64 VLQ string.
 */
export const encodeVlq = (value: number): string => {
  let vlq = toVlqSigned(value);
  let encoded = "";

  // Iteratively extract 5-bit digits with continuation bits
  for (;;) {
    let digit = vlq & VLQ_BASE_MASK;
    vlq >>>= VLQ_BASE_SHIFT;
    if (vlq > 0) {
      digit |= VLQ_CONTINUATION_BIT;
    }
    encoded += BASE64_CHARS[digit];
    if (vlq <= 0) {
      break;
    }
  }

  return encoded;
};

/**
 * Decode a single VLQ value from an encoded string starting at a given position.
 * Returns the decoded value and the number of characters consumed.
 */
export const decodeVlq = (
  encoded: string,
  pos: number,
): { readonly value: number; readonly length: number } => {
  let result = 0;
  let shift = 0;
  let continuation = true;
  let charsConsumed = 0;

  // Iteratively read 6-bit characters, extract 5-bit payload + continuation bit
  for (let i = pos; continuation && i < encoded.length; i++) {
    const char = encoded[i];
    const digit = charToInt.get(char);
    if (digit === undefined) {
      throw Object.assign(new Error(`Invalid Base64 VLQ character: ${char}`), {
        code: SOURCEMAP_ERROR,
      });
    }
    charsConsumed++;
    continuation = (digit & VLQ_CONTINUATION_BIT) !== 0;
    result += (digit & VLQ_BASE_MASK) << shift;
    shift += VLQ_BASE_SHIFT;
  }

  if (continuation) {
    throw Object.assign(new Error("Unexpected end of VLQ encoded string"), {
      code: SOURCEMAP_ERROR,
    });
  }

  return { value: fromVlqSigned(result), length: charsConsumed };
};

/**
 * Encode a segment (array of field values) to a VLQ string.
 */
export const encodeSegment = (segment: ReadonlyArray<number>): string => {
  let result = "";
  for (let i = 0; i < segment.length; i++) {
    result += encodeVlq(segment[i]);
  }
  return result;
};

/**
 * Decode a full source map mappings string into a structured representation.
 * Returns an array of lines, each containing an array of segments,
 * each segment being an array of relative field values.
 */
export const decodeMappings = (
  mappings: string,
): ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>> => {
  const lines: Array<ReadonlyArray<ReadonlyArray<number>>> = [];
  const lineStrings = mappings.split(";");

  for (let lineIdx = 0; lineIdx < lineStrings.length; lineIdx++) {
    const lineStr = lineStrings[lineIdx];
    const segments: Array<ReadonlyArray<number>> = [];

    if (lineStr.length === 0) {
      lines.push(segments);
      continue;
    }

    const segmentStrings = lineStr.split(",");
    for (let segIdx = 0; segIdx < segmentStrings.length; segIdx++) {
      const segStr = segmentStrings[segIdx];
      const fields: Array<number> = [];
      let pos = 0;

      for (; pos < segStr.length;) {
        const decoded = decodeVlq(segStr, pos);
        fields.push(decoded.value);
        pos += decoded.length;
      }

      segments.push(fields);
    }

    lines.push(segments);
  }

  return lines;
};

/**
 * Encode a structured mappings representation back to a mappings string.
 * This is the inverse of decodeMappings.
 */
export const encodeMappings = (
  decoded: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>,
): string => {
  const lineStrings: Array<string> = [];

  for (let lineIdx = 0; lineIdx < decoded.length; lineIdx++) {
    const line = decoded[lineIdx];
    const segmentStrings: Array<string> = [];

    for (let segIdx = 0; segIdx < line.length; segIdx++) {
      segmentStrings.push(encodeSegment(line[segIdx]));
    }

    lineStrings.push(segmentStrings.join(","));
  }

  return lineStrings.join(";");
};
