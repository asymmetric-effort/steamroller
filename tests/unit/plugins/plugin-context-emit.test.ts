/**
 * @module tests/unit/plugins/plugin-context-emit.test
 * @description Unit tests for plugin context file emission and logging (Issue #70).
 */

import { describe, it, expect } from "bun:test";
import { vi } from "../../vi-compat.js";
import {
  FileEmitter,
  createPluginCache,
} from "../../../src/plugins/plugin-context-emit.js";
import type {
  FileEmitterConfig,
  LogEntry,
} from "../../../src/plugins/plugin-context-emit.js";

const createEmitter = (
  overrides: Partial<FileEmitterConfig> = {},
): FileEmitter => {
  return new FileEmitter({
    pluginName: "test-plugin",
    ...overrides,
  });
};

describe("FileEmitter", () => {
  describe("emitFile", () => {
    it("emits an asset and returns a reference ID", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({
        type: "asset",
        name: "styles.css",
        source: "body { color: red; }",
      });
      expect(refId).toBe("file_ref_1");
    });

    it("emits a chunk and returns a reference ID", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({
        type: "chunk",
        id: "./src/worker.js",
        name: "worker",
      });
      expect(refId).toBe("file_ref_1");
    });

    it("emits a prebuilt chunk and returns a reference ID", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({
        type: "prebuilt-chunk",
        fileName: "vendor.js",
        code: "var x = 1;",
      });
      expect(refId).toBe("file_ref_1");
    });

    it("generates unique IDs for multiple emissions", () => {
      const emitter = createEmitter();
      const id1 = emitter.emitFile({ type: "asset", name: "a.css" });
      const id2 = emitter.emitFile({ type: "asset", name: "b.css" });
      const id3 = emitter.emitFile({ type: "chunk", id: "c.js" });
      expect(id1).toBe("file_ref_1");
      expect(id2).toBe("file_ref_2");
      expect(id3).toBe("file_ref_3");
    });

    it("stores asset without source", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({ type: "asset", name: "later.txt" });
      const files = emitter.getEmittedFiles();
      expect(files).toHaveLength(1);
      expect(files[0].source).toBeUndefined();
      expect(files[0].referenceId).toBe(refId);
    });

    it("stores chunk with fileName", () => {
      const emitter = createEmitter();
      emitter.emitFile({
        type: "chunk",
        id: "entry.js",
        fileName: "entry-abc123.js",
      });
      const files = emitter.getEmittedFiles();
      expect(files[0].fileName).toBe("entry-abc123.js");
    });
  });

  describe("getFileName", () => {
    it("returns explicit fileName when set", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({
        type: "asset",
        fileName: "static/logo.png",
        source: "binary data",
      });
      expect(emitter.getFileName(refId)).toBe("static/logo.png");
    });

    it("generates name from asset name", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({
        type: "asset",
        name: "style.css",
      });
      expect(emitter.getFileName(refId)).toBe("assets/style.css");
    });

    it("uses reference ID as fallback", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({ type: "asset" });
      expect(emitter.getFileName(refId)).toBe(`assets/${refId}`);
    });

    it("throws for unknown reference ID", () => {
      const emitter = createEmitter();
      expect(() => emitter.getFileName("nonexistent")).toThrow(
        'File reference "nonexistent" not found',
      );
    });

    it("returns fileName for prebuilt chunk", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({
        type: "prebuilt-chunk",
        fileName: "vendor-abc.js",
        code: "/* vendor */",
      });
      expect(emitter.getFileName(refId)).toBe("vendor-abc.js");
    });
  });

  describe("setAssetSource", () => {
    it("sets the source of an asset", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({ type: "asset", name: "data.json" });
      emitter.setAssetSource(refId, '{"key": "value"}');
      const files = emitter.getEmittedFiles();
      expect(files[0].source).toBe('{"key": "value"}');
    });

    it("updates existing asset source", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({
        type: "asset",
        name: "data.txt",
        source: "old",
      });
      emitter.setAssetSource(refId, "new");
      const files = emitter.getEmittedFiles();
      expect(files[0].source).toBe("new");
    });

    it("accepts Uint8Array as source", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({ type: "asset", name: "binary.bin" });
      const data = new Uint8Array([1, 2, 3]);
      emitter.setAssetSource(refId, data);
      const files = emitter.getEmittedFiles();
      expect(files[0].source).toBe(data);
    });

    it("throws for unknown reference ID", () => {
      const emitter = createEmitter();
      expect(() => emitter.setAssetSource("bad", "x")).toThrow(
        'File reference "bad" not found',
      );
    });

    it("throws when trying to set source on a chunk", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({ type: "chunk", id: "entry.js" });
      expect(() => emitter.setAssetSource(refId, "code")).toThrow(
        "only assets support setAssetSource",
      );
    });

    it("throws when trying to set source on a prebuilt chunk", () => {
      const emitter = createEmitter();
      const refId = emitter.emitFile({
        type: "prebuilt-chunk",
        fileName: "v.js",
        code: "x",
      });
      expect(() => emitter.setAssetSource(refId, "new")).toThrow(
        "only assets support setAssetSource",
      );
    });
  });

  describe("error", () => {
    it("throws an Error with string message", () => {
      const emitter = createEmitter();
      expect(() => emitter.error("something failed")).toThrow(
        "something failed",
      );
    });

    it("throws an Error with RollupLog message", () => {
      const emitter = createEmitter();
      expect(() =>
        emitter.error({ message: "structured", code: "ERR_X" }),
      ).toThrow("structured");
    });

    it("attaches plugin name to the error", () => {
      const emitter = createEmitter({ pluginName: "my-plugin" });
      try {
        emitter.error("oops");
      } catch (e) {
        expect((e as Record<string, unknown>)["plugin"]).toBe("my-plugin");
      }
    });

    it("attaches code from RollupLog", () => {
      const emitter = createEmitter();
      try {
        emitter.error({ message: "x", code: "CUSTOM_CODE" });
      } catch (e) {
        expect((e as Record<string, unknown>)["code"]).toBe("CUSTOM_CODE");
      }
    });

    it("uses PLUGIN_ERROR when RollupLog has no code", () => {
      const emitter = createEmitter();
      try {
        emitter.error({ message: "no code field" });
      } catch (e) {
        expect((e as Record<string, unknown>)["code"]).toBe("PLUGIN_ERROR");
      }
    });

    it("uses PLUGIN_ERROR as default code for string errors", () => {
      const emitter = createEmitter();
      try {
        emitter.error("text error");
      } catch (e) {
        expect((e as Record<string, unknown>)["code"]).toBe("PLUGIN_ERROR");
      }
    });

    it("never returns (type check)", () => {
      const emitter = createEmitter();
      const fn = (): string => {
        emitter.error("always throws");
      };
      expect(fn).toThrow();
    });
  });

  describe("warn", () => {
    it("emits a warning with string message", () => {
      const onLog = vi.fn();
      const emitter = createEmitter({ onLog });
      emitter.warn("be careful");
      expect(onLog).toHaveBeenCalledWith({
        level: "warn",
        log: { message: "be careful" },
        plugin: "test-plugin",
      });
    });

    it("emits a warning with RollupLog", () => {
      const onLog = vi.fn();
      const emitter = createEmitter({ onLog });
      emitter.warn({ message: "warning", code: "W001" });
      expect(onLog).toHaveBeenCalledWith({
        level: "warn",
        log: { message: "warning", code: "W001" },
        plugin: "test-plugin",
      });
    });

    it("resolves lazy warning function", () => {
      const onLog = vi.fn();
      const emitter = createEmitter({ onLog });
      emitter.warn(() => "lazy");
      expect(onLog).toHaveBeenCalledWith({
        level: "warn",
        log: { message: "lazy" },
        plugin: "test-plugin",
      });
    });

    it("resolves lazy warning returning RollupLog", () => {
      const onLog = vi.fn();
      const emitter = createEmitter({ onLog });
      emitter.warn(() => ({ message: "obj warn", code: "W" }));
      expect(onLog).toHaveBeenCalledWith({
        level: "warn",
        log: { message: "obj warn", code: "W" },
        plugin: "test-plugin",
      });
    });
  });

  describe("info", () => {
    it("emits info log with string", () => {
      const onLog = vi.fn();
      const emitter = createEmitter({ onLog });
      emitter.info("informational");
      expect(onLog).toHaveBeenCalledWith({
        level: "info",
        log: { message: "informational" },
        plugin: "test-plugin",
      });
    });

    it("emits info log with RollupLog", () => {
      const onLog = vi.fn();
      const emitter = createEmitter({ onLog });
      emitter.info({ message: "info msg", code: "I001" });
      expect(onLog).toHaveBeenCalledWith({
        level: "info",
        log: { message: "info msg", code: "I001" },
        plugin: "test-plugin",
      });
    });

    it("resolves lazy info function", () => {
      const onLog = vi.fn();
      const emitter = createEmitter({ onLog });
      emitter.info(() => "lazy info");
      expect(onLog).toHaveBeenCalledWith({
        level: "info",
        log: { message: "lazy info" },
        plugin: "test-plugin",
      });
    });
  });

  describe("debug", () => {
    it("emits debug log with string", () => {
      const onLog = vi.fn();
      const emitter = createEmitter({ onLog });
      emitter.debug("debug message");
      expect(onLog).toHaveBeenCalledWith({
        level: "debug",
        log: { message: "debug message" },
        plugin: "test-plugin",
      });
    });

    it("emits debug log with RollupLog", () => {
      const onLog = vi.fn();
      const emitter = createEmitter({ onLog });
      emitter.debug({ message: "d", code: "D001" });
      expect(onLog).toHaveBeenCalledWith({
        level: "debug",
        log: { message: "d", code: "D001" },
        plugin: "test-plugin",
      });
    });

    it("resolves lazy debug function", () => {
      const onLog = vi.fn();
      const emitter = createEmitter({ onLog });
      emitter.debug(() => ({ message: "lazy d" }));
      expect(onLog).toHaveBeenCalledWith({
        level: "debug",
        log: { message: "lazy d" },
        plugin: "test-plugin",
      });
    });
  });

  describe("getEmittedFiles", () => {
    it("returns empty array initially", () => {
      const emitter = createEmitter();
      expect(emitter.getEmittedFiles()).toEqual([]);
    });

    it("returns all emitted files", () => {
      const emitter = createEmitter();
      emitter.emitFile({ type: "asset", name: "a.css" });
      emitter.emitFile({ type: "chunk", id: "b.js" });
      expect(emitter.getEmittedFiles()).toHaveLength(2);
    });
  });

  describe("default onLog (no-op)", () => {
    it("does not throw when no onLog provided", () => {
      const emitter = createEmitter();
      expect(() => emitter.warn("test")).not.toThrow();
      expect(() => emitter.info("test")).not.toThrow();
      expect(() => emitter.debug("test")).not.toThrow();
    });
  });
});

describe("createPluginCache", () => {
  it("sets and gets values", () => {
    const cache = createPluginCache();
    cache.set("key", { data: 42 });
    expect(cache.get("key")).toEqual({ data: 42 });
  });

  it("reports existence with has()", () => {
    const cache = createPluginCache();
    cache.set("exists", true);
    expect(cache.has("exists")).toBe(true);
    expect(cache.has("nope")).toBe(false);
  });

  it("deletes entries", () => {
    const cache = createPluginCache();
    cache.set("k", "v");
    expect(cache.delete("k")).toBe(true);
    expect(cache.has("k")).toBe(false);
  });

  it("returns false when deleting non-existent key", () => {
    const cache = createPluginCache();
    expect(cache.delete("x")).toBe(false);
  });

  it("throws when getting non-existent key", () => {
    const cache = createPluginCache();
    expect(() => cache.get("missing")).toThrow(
      'No cache entry found for "missing"',
    );
  });

  it("overwrites existing values", () => {
    const cache = createPluginCache();
    cache.set("k", 1);
    cache.set("k", 2);
    expect(cache.get("k")).toBe(2);
  });

  it("stores different types", () => {
    const cache = createPluginCache();
    cache.set("str", "hello");
    cache.set("num", 99);
    cache.set("arr", [1, 2, 3]);
    expect(cache.get("str")).toBe("hello");
    expect(cache.get("num")).toBe(99);
    expect(cache.get("arr")).toEqual([1, 2, 3]);
  });
});
