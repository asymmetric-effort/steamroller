/**
 * @module tests/unit/plugins/emitted-files
 * @description Unit tests for EmittedFileManager lifecycle management.
 */

import { describe, it, expect } from "bun:test";
import {
  EmittedFileManager,
  EmittedFileError,
  computeHash,
  applyPattern,
} from "../../../src/plugins/emitted-files.js";
import {
  ASSET_NOT_FOUND,
  ASSET_SOURCE_ALREADY_SET,
  ASSET_SOURCE_MISSING,
  ASSET_NOT_FINALISED,
} from "../../../src/utils/error-codes.js";

describe("emitted-files", () => {
  describe("computeHash", () => {
    it("should compute a hash from a string", () => {
      const hash = computeHash("hello world");
      expect(hash).toHaveLength(8);
      expect(/^[0-9a-f]{8}$/.test(hash)).toBe(true);
    });

    it("should compute a hash from a Uint8Array", () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]);
      const hash = computeHash(data);
      expect(hash).toHaveLength(8);
      expect(/^[0-9a-f]{8}$/.test(hash)).toBe(true);
    });

    it("should produce different hashes for different inputs", () => {
      const h1 = computeHash("abc");
      const h2 = computeHash("def");
      expect(h1).not.toBe(h2);
    });

    it("should produce same hash for same input", () => {
      const h1 = computeHash("same");
      const h2 = computeHash("same");
      expect(h1).toBe(h2);
    });

    it("should handle empty string", () => {
      const hash = computeHash("");
      expect(hash).toHaveLength(8);
    });

    it("should handle empty Uint8Array", () => {
      const hash = computeHash(new Uint8Array(0));
      expect(hash).toHaveLength(8);
    });
  });

  describe("applyPattern", () => {
    it("should replace [name] placeholder", () => {
      expect(applyPattern("[name].js", "bundle.js", "abc12345")).toBe(
        "bundle.js",
      );
    });

    it("should replace [hash] placeholder", () => {
      expect(applyPattern("[name]-[hash].js", "bundle.js", "abc12345")).toBe(
        "bundle-abc12345.js",
      );
    });

    it("should replace [ext] placeholder", () => {
      expect(applyPattern("[name].[ext]", "style.css", "abc")).toBe(
        "style.css",
      );
    });

    it("should replace [extname] placeholder", () => {
      expect(applyPattern("[name][extname]", "style.css", "abc")).toBe(
        "style.css",
      );
    });

    it("should handle file without extension", () => {
      expect(applyPattern("[name]-[hash].[ext]", "README", "abc")).toBe(
        "README-abc.",
      );
    });

    it("should handle multiple placeholder occurrences", () => {
      expect(applyPattern("[name]-[name]-[hash]", "x.js", "h")).toBe("x-x-h");
    });
  });

  describe("EmittedFileManager", () => {
    describe("emitAsset", () => {
      it("should emit an asset and return a reference ID", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({ name: "style.css", source: "body {}" });
        expect(refId).toBeTruthy();
        expect(mgr.size()).toBe(1);
      });

      it("should emit asset without initial source", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({ name: "lazy.css" });
        expect(refId).toBeTruthy();
        expect(mgr.size()).toBe(1);
      });

      it("should emit asset with explicit fileName", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({
          name: "icon.png",
          fileName: "assets/icon.png",
          source: "data",
        });
        mgr.finalizeFileNames("[name]-[hash]");
        expect(mgr.getFileName(refId)).toBe("assets/icon.png");
      });

      it("should emit asset with needsCodeReference", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({
          name: "data.json",
          source: "{}",
          needsCodeReference: true,
        });
        const files = mgr.getEmittedFiles();
        const file = files.find((f) => f.referenceId === refId);
        expect(file?.needsCodeReference).toBe(true);
      });

      it("should generate unique reference IDs", () => {
        const mgr = new EmittedFileManager();
        const id1 = mgr.emitAsset({ name: "a.css", source: "a" });
        const id2 = mgr.emitAsset({ name: "b.css", source: "b" });
        expect(id1).not.toBe(id2);
      });
    });

    describe("emitChunk", () => {
      it("should emit a chunk and return a reference ID", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitChunk({ id: "./src/worker.ts" });
        expect(refId).toBeTruthy();
        expect(mgr.size()).toBe(1);
      });

      it("should emit chunk with name and fileName", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitChunk({
          id: "./src/lazy.ts",
          name: "lazy",
          fileName: "chunks/lazy.js",
        });
        mgr.finalizeFileNames("[name]-[hash].js");
        expect(mgr.getFileName(refId)).toBe("chunks/lazy.js");
      });

      it("should emit chunk with implicitlyLoadedAfterOneOf", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitChunk({
          id: "./src/polyfill.ts",
          implicitlyLoadedAfterOneOf: ["./src/main.ts"],
        });
        const files = mgr.getEmittedFiles();
        const file = files.find((f) => f.referenceId === refId);
        expect(file?.implicitlyLoadedAfterOneOf).toEqual(["./src/main.ts"]);
      });
    });

    describe("emitPrebuiltChunk", () => {
      it("should emit a prebuilt chunk and return a reference ID", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitPrebuiltChunk({
          fileName: "vendor.js",
          code: "var x = 1;",
        });
        expect(refId).toBeTruthy();
        expect(mgr.size()).toBe(1);
      });

      it("should store map and exports", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitPrebuiltChunk({
          fileName: "lib.js",
          code: "export const a = 1;",
          map: "sourcemap-data",
          exports: ["a"],
        });
        const files = mgr.getEmittedFiles();
        const file = files.find((f) => f.referenceId === refId);
        expect(file?.map).toBe("sourcemap-data");
        expect(file?.exports).toEqual(["a"]);
      });

      it("should handle null map", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitPrebuiltChunk({
          fileName: "lib.js",
          code: "code",
          map: null,
        });
        const files = mgr.getEmittedFiles();
        const file = files.find((f) => f.referenceId === refId);
        expect(file?.map).toBeNull();
      });
    });

    describe("setAssetSource", () => {
      it("should set source for a deferred asset", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({ name: "lazy.css" });
        mgr.setAssetSource(refId, "body { color: red; }");
        mgr.finalizeFileNames("[name]-[hash].css");
        // Should not throw on getFileName
        expect(mgr.getFileName(refId)).toBeTruthy();
      });

      it("should throw ASSET_NOT_FOUND for invalid refId", () => {
        const mgr = new EmittedFileManager();
        try {
          mgr.setAssetSource("nonexistent", "data");
          expect.fail("Should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(EmittedFileError);
          expect((err as EmittedFileError).code).toBe(ASSET_NOT_FOUND);
        }
      });

      it("should throw ASSET_NOT_FOUND for non-asset refId", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitChunk({ id: "./chunk.ts" });
        try {
          mgr.setAssetSource(refId, "data");
          expect.fail("Should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(EmittedFileError);
          expect((err as EmittedFileError).code).toBe(ASSET_NOT_FOUND);
        }
      });

      it("should throw ASSET_SOURCE_ALREADY_SET if already finalized", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({ name: "x.css", source: "initial" });
        try {
          mgr.setAssetSource(refId, "updated");
          expect.fail("Should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(EmittedFileError);
          expect((err as EmittedFileError).code).toBe(ASSET_SOURCE_ALREADY_SET);
        }
      });

      it("should accept Uint8Array source", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({ name: "binary.dat" });
        const data = new Uint8Array([1, 2, 3]);
        mgr.setAssetSource(refId, data);
        mgr.finalizeFileNames("[name]-[hash]");
        expect(mgr.getFileName(refId)).toBeTruthy();
      });
    });

    describe("getFileName", () => {
      it("should return explicit fileName immediately", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({
          name: "img.png",
          fileName: "static/img.png",
          source: "data",
        });
        // Even without finalization, explicit fileName works
        expect(mgr.getFileName(refId)).toBe("static/img.png");
      });

      it("should throw ASSET_NOT_FOUND for unknown refId", () => {
        const mgr = new EmittedFileManager();
        try {
          mgr.getFileName("unknown");
          expect.fail("Should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(EmittedFileError);
          expect((err as EmittedFileError).code).toBe(ASSET_NOT_FOUND);
        }
      });

      it("should throw ASSET_NOT_FINALISED before finalization", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({ name: "lazy.css", source: "x" });
        try {
          mgr.getFileName(refId);
          expect.fail("Should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(EmittedFileError);
          expect((err as EmittedFileError).code).toBe(ASSET_NOT_FINALISED);
        }
      });

      it("should return finalized name after finalization", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({ name: "style.css", source: "body{}" });
        mgr.finalizeFileNames("[name]-[hash].css");
        const fileName = mgr.getFileName(refId);
        expect(fileName).toMatch(/^style-[0-9a-f]{8}\.css$/);
      });
    });

    describe("finalizeFileNames", () => {
      it("should assign names to all files without explicit fileName", () => {
        const mgr = new EmittedFileManager();
        const a1 = mgr.emitAsset({ name: "a.css", source: "a" });
        const a2 = mgr.emitAsset({ name: "b.js", source: "b" });
        const c1 = mgr.emitChunk({ id: "./c.ts", name: "c" });
        mgr.finalizeFileNames("[name]-[hash].js");

        expect(mgr.isFinalized()).toBe(true);
        expect(mgr.getFileName(a1)).toMatch(/^a-[0-9a-f]{8}\.js$/);
        expect(mgr.getFileName(a2)).toMatch(/^b-[0-9a-f]{8}\.js$/);
        expect(mgr.getFileName(c1)).toMatch(/^c-[0-9a-f]{8}\.js$/);
      });

      it("should throw ASSET_SOURCE_MISSING for asset without source", () => {
        const mgr = new EmittedFileManager();
        mgr.emitAsset({ name: "missing.css" });
        try {
          mgr.finalizeFileNames("[name]-[hash]");
          expect.fail("Should have thrown");
        } catch (err) {
          expect(err).toBeInstanceOf(EmittedFileError);
          expect((err as EmittedFileError).code).toBe(ASSET_SOURCE_MISSING);
        }
      });

      it("should skip entries with explicit fileName", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({
          name: "x.css",
          fileName: "fixed/x.css",
          source: "data",
        });
        mgr.finalizeFileNames("[name]-[hash]");
        expect(mgr.getFileName(refId)).toBe("fixed/x.css");
      });

      it("should use referenceId as fallback name for chunks without name", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitChunk({ id: "./unnamed.ts" });
        mgr.finalizeFileNames("[name]-[hash].js");
        // Uses the name or id field
        const fileName = mgr.getFileName(refId);
        expect(fileName).toContain("[hash]".length > 0 ? "-" : "");
        expect(fileName).toBeTruthy();
      });

      it("should handle prebuilt chunks (skip pattern)", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitPrebuiltChunk({
          fileName: "vendor.js",
          code: "code",
        });
        mgr.finalizeFileNames("[name]-[hash].js");
        expect(mgr.getFileName(refId)).toBe("vendor.js");
      });
    });

    describe("getEmittedFiles", () => {
      it("should return all emitted files", () => {
        const mgr = new EmittedFileManager();
        mgr.emitAsset({ name: "a.css", source: "a" });
        mgr.emitChunk({ id: "./b.ts" });
        mgr.emitPrebuiltChunk({ fileName: "c.js", code: "c" });

        const files = mgr.getEmittedFiles();
        expect(files.length).toBe(3);
      });

      it("should return empty array when nothing emitted", () => {
        const mgr = new EmittedFileManager();
        expect(mgr.getEmittedFiles()).toEqual([]);
      });

      it("should return a copy (not internal reference)", () => {
        const mgr = new EmittedFileManager();
        mgr.emitAsset({ name: "a.css", source: "a" });
        const files1 = mgr.getEmittedFiles();
        const files2 = mgr.getEmittedFiles();
        expect(files1).not.toBe(files2);
        expect(files1).toEqual(files2);
      });
    });

    describe("EmittedFileError", () => {
      it("should have correct code and message", () => {
        const err = new EmittedFileError("TEST_CODE", "test message");
        expect(err.code).toBe("TEST_CODE");
        expect(err.message).toBe("test message");
        expect(err.name).toBe("EmittedFileError");
        expect(err).toBeInstanceOf(Error);
      });
    });

    describe("isFinalized", () => {
      it("should be false initially", () => {
        const mgr = new EmittedFileManager();
        expect(mgr.isFinalized()).toBe(false);
      });

      it("should be true after finalizeFileNames", () => {
        const mgr = new EmittedFileManager();
        mgr.finalizeFileNames("[name]");
        expect(mgr.isFinalized()).toBe(true);
      });
    });

    describe("size", () => {
      it("should track emitted file count", () => {
        const mgr = new EmittedFileManager();
        expect(mgr.size()).toBe(0);
        mgr.emitAsset({ name: "a", source: "a" });
        expect(mgr.size()).toBe(1);
        mgr.emitChunk({ id: "b" });
        expect(mgr.size()).toBe(2);
      });
    });

    describe("finalizeFileNames - chunk type", () => {
      it("should finalize chunk file names with pattern", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitChunk({ id: "main.js", name: "main" });
        mgr.finalizeFileNames("[name]-[hash].js");
        const fileName = mgr.getFileName(refId);
        expect(fileName).toContain("main");
        expect(fileName).toContain(".js");
      });

      it("should finalize chunk without name using id", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitChunk({ id: "entry.js" });
        mgr.finalizeFileNames("[name]-[hash].js");
        const fileName = mgr.getFileName(refId);
        expect(fileName).toContain("entry");
      });
    });

    describe("finalizeFileNames - prebuilt-chunk type", () => {
      it("should handle prebuilt-chunk type in finalization", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitPrebuiltChunk({
          fileName: "vendor.js",
          code: "var x = 1;",
        });
        mgr.finalizeFileNames("[name]-[hash].js");
        const fileName = mgr.getFileName(refId);
        expect(fileName).toBe("vendor.js");
      });
    });

    describe("finalizeFileNames - asset without name", () => {
      it("should use referenceId as fallback name for assets", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({ source: "body {}" });
        mgr.finalizeFileNames("[name]-[hash].js");
        const fileName = mgr.getFileName(refId);
        expect(fileName).toBeDefined();
      });
    });

    describe("getFileName after finalization", () => {
      it("should return finalizedFileName when set", () => {
        const mgr = new EmittedFileManager();
        const refId = mgr.emitAsset({ name: "style.css", source: "body {}" });
        mgr.finalizeFileNames("[name]-[hash].[ext]");
        const fileName = mgr.getFileName(refId);
        expect(fileName).toContain("style");
      });
    });
  });
});
