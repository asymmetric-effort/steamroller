/**
 * @module tests/unit/splitting/hash
 * @description Unit tests for FNV-1a content hashing.
 */

import { describe, it, expect } from "vitest";
import { contentHash } from "../../../src/codegen/hash.js";

describe("contentHash", () => {
  describe("determinism", () => {
    it("produces the same hash for the same input", () => {
      const hash1 = contentHash("hello world", 8, "hex");
      const hash2 = contentHash("hello world", 8, "hex");
      expect(hash1).toBe(hash2);
    });

    it("produces the same hash across multiple calls", () => {
      const results: Array<string> = [];
      for (let i = 0; i < 100; i++) {
        results.push(contentHash("deterministic", 12, "base64"));
      }
      const first = results[0];
      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toBe(first);
      }
    });

    it("produces different hashes for different inputs", () => {
      const hash1 = contentHash("hello", 8, "hex");
      const hash2 = contentHash("world", 8, "hex");
      expect(hash1).not.toBe(hash2);
    });

    it("produces different hashes for similar inputs", () => {
      const hash1 = contentHash("abc", 16, "hex");
      const hash2 = contentHash("abd", 16, "hex");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("hex encoding", () => {
    it("produces valid hex characters only", () => {
      const hash = contentHash("test content", 16, "hex");
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it("produces the requested length", () => {
      const hash4 = contentHash("test", 4, "hex");
      const hash8 = contentHash("test", 8, "hex");
      const hash16 = contentHash("test", 16, "hex");
      expect(hash4).toHaveLength(4);
      expect(hash8).toHaveLength(8);
      expect(hash16).toHaveLength(16);
    });

    it("handles length of 1", () => {
      const hash = contentHash("x", 1, "hex");
      expect(hash).toHaveLength(1);
      expect(hash).toMatch(/^[0-9a-f]$/);
    });

    it("handles length of 32 (full 128-bit)", () => {
      const hash = contentHash("full hash", 32, "hex");
      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("base64 encoding", () => {
    it("produces valid base64url characters only", () => {
      const hash = contentHash("test content", 16, "base64");
      expect(hash).toMatch(/^[A-Za-z0-9\-_]+$/);
    });

    it("produces the requested length", () => {
      const hash6 = contentHash("test", 6, "base64");
      const hash12 = contentHash("test", 12, "base64");
      expect(hash6).toHaveLength(6);
      expect(hash12).toHaveLength(12);
    });

    it("does not include padding characters", () => {
      const hash = contentHash("no padding", 10, "base64");
      expect(hash).not.toContain("=");
    });
  });

  describe("base36 encoding", () => {
    it("produces valid base36 characters only", () => {
      const hash = contentHash("test content", 16, "base36");
      expect(hash).toMatch(/^[0-9a-z]+$/);
    });

    it("produces the requested length", () => {
      const hash8 = contentHash("test", 8, "base36");
      const hash16 = contentHash("test", 16, "base36");
      expect(hash8).toHaveLength(8);
      expect(hash16).toHaveLength(16);
    });

    it("uses only lowercase letters", () => {
      const hash = contentHash("UPPERCASE input", 20, "base36");
      expect(hash).toMatch(/^[0-9a-z]+$/);
    });
  });

  describe("base64 remainder bits path", () => {
    it("handles length requiring remainder bits encoding", () => {
      // Request a length that forces the remainder-bits branch
      // 16 bytes = 128 bits. 128/6 = 21 full chars + 2 remainder bits
      // So requesting 22 chars will trigger the remainder path
      const hash = contentHash("trigger remainder", 22, "base64");
      expect(hash).toHaveLength(22);
      expect(hash).toMatch(/^[A-Za-z0-9\-_]+$/);
    });
  });

  describe("base36 padding path", () => {
    it("pads output when requested length exceeds natural digits", () => {
      // A 128-bit number in base36 is about 25 chars max
      // Request more than that to trigger padding
      const hash = contentHash("x", 30, "base36");
      expect(hash).toHaveLength(30);
      expect(hash).toMatch(/^[0-9a-z]+$/);
    });
  });

  describe("edge cases", () => {
    it("handles empty string input", () => {
      const hash = contentHash("", 8, "hex");
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it("handles very long input", () => {
      const longInput = "x".repeat(10000);
      const hash = contentHash(longInput, 8, "hex");
      expect(hash).toHaveLength(8);
    });

    it("handles unicode input", () => {
      const hash = contentHash("こんにちは", 8, "hex");
      expect(hash).toHaveLength(8);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it("handles newlines and special characters", () => {
      const hash = contentHash("line1\nline2\ttab\r\n", 8, "hex");
      expect(hash).toHaveLength(8);
    });

    it("different encodings produce different strings for same input", () => {
      const hex = contentHash("same input", 8, "hex");
      const b64 = contentHash("same input", 8, "base64");
      const b36 = contentHash("same input", 8, "base36");
      // At least two should differ (all three likely differ)
      const unique = new Set([hex, b64, b36]);
      expect(unique.size).toBeGreaterThanOrEqual(2);
    });
  });
});
