/**
 * @module tests/unit/splitting/chunk-naming
 * @description Unit tests for chunk naming and file pattern resolution.
 */

import { describe, it, expect } from "vitest";
import {
  resolveChunkFileName,
  resolveAssetFileName,
  DEFAULT_ENTRY_PATTERN,
  DEFAULT_CHUNK_PATTERN,
  DEFAULT_ASSET_PATTERN,
  DEFAULT_HASH_LENGTH,
  DEFAULT_HASH_CHARS,
  type ChunkNamingInfo,
} from "../../../src/splitting/chunk-naming.js";

describe("resolveChunkFileName", () => {
  const entryChunk: ChunkNamingInfo = {
    name: "main",
    content: "const x = 1;",
    format: "es",
    isEntry: true,
  };

  const nonEntryChunk: ChunkNamingInfo = {
    name: "shared",
    content: "export const y = 2;",
    format: "es",
    isEntry: false,
  };

  describe("default patterns", () => {
    it("uses entry pattern for entry chunks", () => {
      const result = resolveChunkFileName(entryChunk);
      expect(result).toBe("main.js");
    });

    it("uses chunk pattern with hash for non-entry chunks", () => {
      const result = resolveChunkFileName(nonEntryChunk);
      expect(result).toMatch(/^shared-[A-Za-z0-9\-_]+\.js$/);
    });
  });

  describe("pattern substitution", () => {
    it("substitutes [name] placeholder", () => {
      const result = resolveChunkFileName(entryChunk, "[name].bundle.js");
      expect(result).toBe("main.bundle.js");
    });

    it("substitutes [hash] placeholder", () => {
      const result = resolveChunkFileName(entryChunk, "[hash].js", 8, "hex");
      expect(result).toMatch(/^[0-9a-f]{8}\.js$/);
    });

    it("substitutes [format] placeholder", () => {
      const result = resolveChunkFileName(entryChunk, "[name].[format].js");
      expect(result).toBe("main.es.js");
    });

    it("substitutes [extname] placeholder for es format", () => {
      const result = resolveChunkFileName(entryChunk, "[name][extname]");
      expect(result).toBe("main.mjs");
    });

    it("substitutes [extname] for cjs format", () => {
      const cjsChunk: ChunkNamingInfo = {
        name: "lib",
        content: "module.exports = {}",
        format: "cjs",
        isEntry: true,
      };
      const result = resolveChunkFileName(cjsChunk, "[name][extname]");
      expect(result).toBe("lib.cjs");
    });

    it("substitutes [extname] for iife format", () => {
      const iifeChunk: ChunkNamingInfo = {
        name: "app",
        content: "(function(){})()",
        format: "iife",
        isEntry: true,
      };
      const result = resolveChunkFileName(iifeChunk, "[name][extname]");
      expect(result).toBe("app.js");
    });

    it("substitutes [extname] for amd format", () => {
      const amdChunk: ChunkNamingInfo = {
        name: "mod",
        content: "define([])",
        format: "amd",
        isEntry: true,
      };
      const result = resolveChunkFileName(amdChunk, "[name][extname]");
      expect(result).toBe("mod.js");
    });

    it("substitutes [extname] for umd format", () => {
      const umdChunk: ChunkNamingInfo = {
        name: "lib",
        content: "(function(){})()",
        format: "umd",
        isEntry: true,
      };
      const result = resolveChunkFileName(umdChunk, "[name][extname]");
      expect(result).toBe("lib.js");
    });

    it("substitutes [extname] for system format", () => {
      const sysChunk: ChunkNamingInfo = {
        name: "sys",
        content: "System.register()",
        format: "system",
        isEntry: true,
      };
      const result = resolveChunkFileName(sysChunk, "[name][extname]");
      expect(result).toBe("sys.js");
    });

    it("handles multiple placeholders in one pattern", () => {
      const result = resolveChunkFileName(
        entryChunk,
        "[name]-[hash].[format][extname]",
        4,
        "hex",
      );
      expect(result).toMatch(/^main-[0-9a-f]{4}\.es\.mjs$/);
    });

    it("handles repeated placeholders", () => {
      const result = resolveChunkFileName(entryChunk, "[name]/[name].js");
      expect(result).toBe("main/main.js");
    });
  });

  describe("hash generation", () => {
    it("produces deterministic hash", () => {
      const result1 = resolveChunkFileName(entryChunk, "[hash].js", 8, "hex");
      const result2 = resolveChunkFileName(entryChunk, "[hash].js", 8, "hex");
      expect(result1).toBe(result2);
    });

    it("produces different hash for different content", () => {
      const chunk1: ChunkNamingInfo = {
        name: "a",
        content: "content 1",
        format: "es",
        isEntry: false,
      };
      const chunk2: ChunkNamingInfo = {
        name: "a",
        content: "content 2",
        format: "es",
        isEntry: false,
      };
      const result1 = resolveChunkFileName(chunk1, "[hash].js", 8, "hex");
      const result2 = resolveChunkFileName(chunk2, "[hash].js", 8, "hex");
      expect(result1).not.toBe(result2);
    });

    it("respects hashLength parameter", () => {
      const result = resolveChunkFileName(entryChunk, "[hash].js", 12, "hex");
      expect(result).toMatch(/^[0-9a-f]{12}\.js$/);
    });

    it("respects hashChars parameter", () => {
      const hexResult = resolveChunkFileName(entryChunk, "[hash].js", 8, "hex");
      expect(hexResult).toMatch(/^[0-9a-f]{8}\.js$/);

      const b36Result = resolveChunkFileName(
        entryChunk,
        "[hash].js",
        8,
        "base36",
      );
      expect(b36Result).toMatch(/^[0-9a-z]{8}\.js$/);
    });
  });

  describe("name sanitization", () => {
    it("replaces spaces with underscores", () => {
      const chunk: ChunkNamingInfo = {
        name: "my chunk",
        content: "code",
        format: "es",
        isEntry: true,
      };
      const result = resolveChunkFileName(chunk, "[name].js");
      expect(result).toBe("my_chunk.js");
    });

    it("replaces special characters", () => {
      const chunk: ChunkNamingInfo = {
        name: "chunk@v2!",
        content: "code",
        format: "es",
        isEntry: true,
      };
      const result = resolveChunkFileName(chunk, "[name].js");
      expect(result).toBe("chunk_v2_.js");
    });

    it("preserves valid characters", () => {
      const chunk: ChunkNamingInfo = {
        name: "my-chunk_v2.0",
        content: "code",
        format: "es",
        isEntry: true,
      };
      const result = resolveChunkFileName(chunk, "[name].js");
      expect(result).toBe("my-chunk_v2.0.js");
    });
  });

  describe("constants", () => {
    it("exports correct default patterns", () => {
      expect(DEFAULT_ENTRY_PATTERN).toBe("[name].js");
      expect(DEFAULT_CHUNK_PATTERN).toBe("[name]-[hash].js");
      expect(DEFAULT_ASSET_PATTERN).toBe("assets/[name]-[hash][extname]");
    });

    it("exports correct default hash config", () => {
      expect(DEFAULT_HASH_LENGTH).toBe(8);
      expect(DEFAULT_HASH_CHARS).toBe("base64");
    });
  });
});

describe("resolveAssetFileName", () => {
  it("uses default asset pattern", () => {
    const result = resolveAssetFileName("style.css", "body {}");
    expect(result).toMatch(/^assets\/style-[A-Za-z0-9\-_]+\.css$/);
  });

  it("substitutes [name] without extension", () => {
    const result = resolveAssetFileName("icon.png", "data", {
      assetFileNames: "[name].out[extname]",
    });
    expect(result).toBe("icon.out.png");
  });

  it("substitutes [hash]", () => {
    const result = resolveAssetFileName("file.txt", "content", {
      assetFileNames: "[hash][extname]",
      hashLength: 6,
      hashChars: "hex",
    });
    expect(result).toMatch(/^[0-9a-f]{6}\.txt$/);
  });

  it("handles file with no extension", () => {
    const result = resolveAssetFileName("LICENSE", "MIT License", {
      assetFileNames: "[name][extname]",
    });
    expect(result).toBe("LICENSE");
  });

  it("produces deterministic names", () => {
    const result1 = resolveAssetFileName("a.css", "same content");
    const result2 = resolveAssetFileName("a.css", "same content");
    expect(result1).toBe(result2);
  });
});
