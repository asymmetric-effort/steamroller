/**
 * @module codegen/hash
 * @description Content hashing using FNV-1a algorithm for deterministic chunk
 * fingerprinting. Produces hex, base64, or base36 encoded output.
 */

import type { HashCharacters } from "../types.js";

/**
 * FNV-1a 32-bit parameters for generating multiple hash values.
 * We run FNV-1a with different seeds to produce 128 bits total.
 */
const FNV32_OFFSET = 0x811c9dc5;
const FNV32_PRIME = 0x01000193;

/** Base64 URL-safe character set (no padding). */
const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Hex character set. */
const HEX_CHARS = "0123456789abcdef";

/** Base36 character set. */
const BASE36_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Compute FNV-1a 32-bit hash with a given seed.
 * Processes each byte of the UTF-16 code units (both high and low bytes).
 */
const fnv1a32 = (input: string, seed: number): number => {
  let hash = (FNV32_OFFSET ^ seed) >>> 0;

  const length = input.length;
  for (let i = 0; i < length; i++) {
    const code = input.charCodeAt(i);
    // Process high byte
    hash = hash ^ ((code >>> 8) & 0xff);
    hash = Math.imul(hash, FNV32_PRIME) >>> 0;
    // Process low byte
    hash = hash ^ (code & 0xff);
    hash = Math.imul(hash, FNV32_PRIME) >>> 0;
  }

  return hash;
};

/**
 * Compute 128-bit hash by running FNV-1a with 4 different seeds.
 * Returns 16 bytes as a Uint8Array.
 */
const computeHash128 = (input: string): Uint8Array => {
  const h0 = fnv1a32(input, 0);
  const h1 = fnv1a32(input, 0x12345678);
  const h2 = fnv1a32(input, 0x9abcdef0);
  const h3 = fnv1a32(input, 0xfedcba98);

  const result = new Uint8Array(16);
  result[0] = (h0 >>> 24) & 0xff;
  result[1] = (h0 >>> 16) & 0xff;
  result[2] = (h0 >>> 8) & 0xff;
  result[3] = h0 & 0xff;
  result[4] = (h1 >>> 24) & 0xff;
  result[5] = (h1 >>> 16) & 0xff;
  result[6] = (h1 >>> 8) & 0xff;
  result[7] = h1 & 0xff;
  result[8] = (h2 >>> 24) & 0xff;
  result[9] = (h2 >>> 16) & 0xff;
  result[10] = (h2 >>> 8) & 0xff;
  result[11] = h2 & 0xff;
  result[12] = (h3 >>> 24) & 0xff;
  result[13] = (h3 >>> 16) & 0xff;
  result[14] = (h3 >>> 8) & 0xff;
  result[15] = h3 & 0xff;

  return result;
};

/**
 * Encode raw bytes to hex string.
 */
const encodeHex = (bytes: Uint8Array, length: number): string => {
  const chars: Array<string> = [];
  const byteCount = Math.ceil(length / 2);
  for (let i = 0; i < byteCount && i < bytes.length; i++) {
    chars.push(HEX_CHARS[(bytes[i] >>> 4) & 0x0f]);
    chars.push(HEX_CHARS[bytes[i] & 0x0f]);
  }
  return chars.slice(0, length).join("");
};

/**
 * Encode raw bytes to base64url string (no padding).
 */
const encodeBase64 = (bytes: Uint8Array, length: number): string => {
  const chars: Array<string> = [];
  let bits = 0;
  let buffer = 0;

  for (let i = 0; i < bytes.length && chars.length < length; i++) {
    buffer = (buffer << 8) | bytes[i];
    bits += 8;
    while (bits >= 6 && chars.length < length) {
      bits -= 6;
      chars.push(BASE64_CHARS[(buffer >>> bits) & 0x3f]);
    }
  }
  if (bits > 0 && chars.length < length) {
    chars.push(BASE64_CHARS[(buffer << (6 - bits)) & 0x3f]);
  }
  return chars.slice(0, length).join("");
};

/**
 * Encode raw bytes to base36 string.
 */
const encodeBase36 = (bytes: Uint8Array, length: number): string => {
  // Convert bytes to a big number represented as array of digits in base36
  const digits: Array<number> = [0];

  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      const value = digits[j] * 256 + carry;
      digits[j] = value % 36;
      carry = Math.floor(value / 36);
    }
    while (carry > 0) {
      digits.push(carry % 36);
      carry = Math.floor(carry / 36);
    }
  }

  // digits are in reverse order (least significant first)
  const chars: Array<string> = [];
  for (let i = digits.length - 1; i >= 0 && chars.length < length; i--) {
    chars.push(BASE36_CHARS[digits[i]]);
  }

  // Pad if needed
  while (chars.length < length) {
    chars.push("0");
  }

  return chars.slice(0, length).join("");
};

/**
 * Compute a deterministic content hash of the given string.
 *
 * @param content - The string content to hash
 * @param length - Desired output length in characters
 * @param chars - Encoding format: 'hex', 'base64', or 'base36'
 * @returns A deterministic hash string of the specified length and encoding
 *
 * @example
 * ```typescript
 * const hash = contentHash("hello world", 8, "hex");
 * // Returns a deterministic 8-char hex string
 * ```
 */
export const contentHash = (
  content: string,
  length: number,
  chars: HashCharacters,
): string => {
  const bytes = computeHash128(content);

  switch (chars) {
    case "hex":
      return encodeHex(bytes, length);
    case "base64":
      return encodeBase64(bytes, length);
    case "base36":
      return encodeBase36(bytes, length);
  }
};
