/**
 * Tests for parser performance optimization utilities.
 *
 * Verifies lookup table creation, identifier character detection,
 * whitespace detection, and digit detection.
 *
 * @module tests/unit/parser/perf-hints.test
 */

import { describe, it, expect } from "bun:test";
import {
  createCharLookupTable,
  isIdentifierStart,
  isIdentifierPart,
  isWhitespace,
  isDigit,
} from "../../../src/parser/perf-hints.js";

describe("parser perf-hints", () => {
  describe("createCharLookupTable", () => {
    it("should create a 128-entry Uint8Array", () => {
      const table = createCharLookupTable("abc");
      expect(table).toBeInstanceOf(Uint8Array);
      expect(table.length).toBe(128);
    });

    it("should mark specified characters as 1", () => {
      const table = createCharLookupTable("abc");
      expect(table["a".charCodeAt(0)]).toBe(1);
      expect(table["b".charCodeAt(0)]).toBe(1);
      expect(table["c".charCodeAt(0)]).toBe(1);
    });

    it("should leave unspecified characters as 0", () => {
      const table = createCharLookupTable("abc");
      expect(table["d".charCodeAt(0)]).toBe(0);
      expect(table["z".charCodeAt(0)]).toBe(0);
      expect(table[0]).toBe(0);
    });

    it("should handle empty string", () => {
      const table = createCharLookupTable("");
      for (let i = 0; i < 128; i++) {
        expect(table[i]).toBe(0);
      }
    });

    it("should handle duplicate characters", () => {
      const table = createCharLookupTable("aaa");
      expect(table["a".charCodeAt(0)]).toBe(1);
    });

    it("should ignore non-ASCII characters", () => {
      const table = createCharLookupTable("\u0080\u00FF");
      for (let i = 0; i < 128; i++) {
        expect(table[i]).toBe(0);
      }
    });

    it("should handle all printable ASCII", () => {
      const printable =
        " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
      const table = createCharLookupTable(printable);
      for (let i = 0; i < printable.length; i++) {
        expect(table[printable.charCodeAt(i)]).toBe(1);
      }
    });
  });

  describe("isIdentifierStart", () => {
    it("should accept lowercase letters", () => {
      for (let i = 0; i < 26; i++) {
        expect(isIdentifierStart(97 + i)).toBe(true);
      }
    });

    it("should accept uppercase letters", () => {
      for (let i = 0; i < 26; i++) {
        expect(isIdentifierStart(65 + i)).toBe(true);
      }
    });

    it("should accept underscore", () => {
      expect(isIdentifierStart("_".charCodeAt(0))).toBe(true);
    });

    it("should accept dollar sign", () => {
      expect(isIdentifierStart("$".charCodeAt(0))).toBe(true);
    });

    it("should reject digits", () => {
      for (let i = 0; i < 10; i++) {
        expect(isIdentifierStart(48 + i)).toBe(false);
      }
    });

    it("should reject special characters", () => {
      const specials = "!@#%^&*()-+={}[]|\\:;'\"<>,./? ";
      for (let i = 0; i < specials.length; i++) {
        expect(isIdentifierStart(specials.charCodeAt(i))).toBe(false);
      }
    });

    it("should reject negative codes", () => {
      expect(isIdentifierStart(-1)).toBe(false);
    });

    it("should reject codes >= 128", () => {
      expect(isIdentifierStart(128)).toBe(false);
      expect(isIdentifierStart(255)).toBe(false);
    });
  });

  describe("isIdentifierPart", () => {
    it("should accept lowercase letters", () => {
      for (let i = 0; i < 26; i++) {
        expect(isIdentifierPart(97 + i)).toBe(true);
      }
    });

    it("should accept uppercase letters", () => {
      for (let i = 0; i < 26; i++) {
        expect(isIdentifierPart(65 + i)).toBe(true);
      }
    });

    it("should accept digits", () => {
      for (let i = 0; i < 10; i++) {
        expect(isIdentifierPart(48 + i)).toBe(true);
      }
    });

    it("should accept underscore and dollar", () => {
      expect(isIdentifierPart("_".charCodeAt(0))).toBe(true);
      expect(isIdentifierPart("$".charCodeAt(0))).toBe(true);
    });

    it("should reject special characters", () => {
      const specials = "!@#%^&*()-+={}[]|\\:;'\"<>,./? ";
      for (let i = 0; i < specials.length; i++) {
        expect(isIdentifierPart(specials.charCodeAt(i))).toBe(false);
      }
    });

    it("should reject negative codes", () => {
      expect(isIdentifierPart(-1)).toBe(false);
    });

    it("should reject codes >= 128", () => {
      expect(isIdentifierPart(128)).toBe(false);
      expect(isIdentifierPart(1000)).toBe(false);
    });
  });

  describe("isWhitespace", () => {
    it("should accept space", () => {
      expect(isWhitespace(32)).toBe(true);
    });

    it("should accept tab", () => {
      expect(isWhitespace(9)).toBe(true);
    });

    it("should accept newline", () => {
      expect(isWhitespace(10)).toBe(true);
    });

    it("should accept carriage return", () => {
      expect(isWhitespace(13)).toBe(true);
    });

    it("should accept vertical tab", () => {
      expect(isWhitespace(11)).toBe(true);
    });

    it("should accept form feed", () => {
      expect(isWhitespace(12)).toBe(true);
    });

    it("should reject letters", () => {
      expect(isWhitespace("a".charCodeAt(0))).toBe(false);
      expect(isWhitespace("Z".charCodeAt(0))).toBe(false);
    });

    it("should reject negative codes", () => {
      expect(isWhitespace(-1)).toBe(false);
    });

    it("should reject codes >= 128", () => {
      expect(isWhitespace(128)).toBe(false);
    });
  });

  describe("isDigit", () => {
    it("should accept all digits 0-9", () => {
      for (let i = 0; i < 10; i++) {
        expect(isDigit(48 + i)).toBe(true);
      }
    });

    it("should reject letters", () => {
      expect(isDigit("a".charCodeAt(0))).toBe(false);
      expect(isDigit("Z".charCodeAt(0))).toBe(false);
    });

    it("should reject special characters", () => {
      expect(isDigit(".".charCodeAt(0))).toBe(false);
      expect(isDigit("-".charCodeAt(0))).toBe(false);
    });

    it("should reject negative codes", () => {
      expect(isDigit(-1)).toBe(false);
    });

    it("should reject codes >= 128", () => {
      expect(isDigit(128)).toBe(false);
    });
  });
});
