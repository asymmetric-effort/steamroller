/**
 * @module tests/unit/formats/index
 * @description Tests for format barrel exports and dispatcher.
 */

import { describe, expect, it } from "bun:test";
import {
  amdFormat,
  cjsFormat,
  esFormat,
  getFormatWrapper,
  iifeFormat,
  systemFormat,
  umdFormat,
} from "../../../src/formats/index.js";

describe("formats/index", () => {
  describe("getFormatWrapper", () => {
    it('should return esFormat for "es"', () => {
      expect(getFormatWrapper("es")).toBe(esFormat);
    });

    it('should return cjsFormat for "cjs"', () => {
      expect(getFormatWrapper("cjs")).toBe(cjsFormat);
    });

    it('should return iifeFormat for "iife"', () => {
      expect(getFormatWrapper("iife")).toBe(iifeFormat);
    });

    it('should return umdFormat for "umd"', () => {
      expect(getFormatWrapper("umd")).toBe(umdFormat);
    });

    it('should return amdFormat for "amd"', () => {
      expect(getFormatWrapper("amd")).toBe(amdFormat);
    });

    it('should return systemFormat for "system"', () => {
      expect(getFormatWrapper("system")).toBe(systemFormat);
    });

    it("should return undefined for unknown format", () => {
      expect(getFormatWrapper("unknown")).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
      expect(getFormatWrapper("")).toBeUndefined();
    });
  });

  describe("format exports", () => {
    it("should export esFormat with required interface", () => {
      expect(esFormat.wrapChunk).toBeTypeOf("function");
      expect(esFormat.getExternalImportCode).toBeTypeOf("function");
      expect(esFormat.getExportCode).toBeTypeOf("function");
    });

    it("should export cjsFormat with required interface", () => {
      expect(cjsFormat.wrapChunk).toBeTypeOf("function");
      expect(cjsFormat.getExternalImportCode).toBeTypeOf("function");
      expect(cjsFormat.getExportCode).toBeTypeOf("function");
    });

    it("should export iifeFormat with required interface", () => {
      expect(iifeFormat.wrapChunk).toBeTypeOf("function");
      expect(iifeFormat.getExternalImportCode).toBeTypeOf("function");
      expect(iifeFormat.getExportCode).toBeTypeOf("function");
    });

    it("should export umdFormat with required interface", () => {
      expect(umdFormat.wrapChunk).toBeTypeOf("function");
      expect(umdFormat.getExternalImportCode).toBeTypeOf("function");
      expect(umdFormat.getExportCode).toBeTypeOf("function");
    });

    it("should export amdFormat with required interface", () => {
      expect(amdFormat.wrapChunk).toBeTypeOf("function");
      expect(amdFormat.getExternalImportCode).toBeTypeOf("function");
      expect(amdFormat.getExportCode).toBeTypeOf("function");
    });

    it("should export systemFormat with required interface", () => {
      expect(systemFormat.wrapChunk).toBeTypeOf("function");
      expect(systemFormat.getExternalImportCode).toBeTypeOf("function");
      expect(systemFormat.getExportCode).toBeTypeOf("function");
    });
  });
});
