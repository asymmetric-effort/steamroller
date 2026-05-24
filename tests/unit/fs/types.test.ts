/**
 * @module tests/unit/fs/types
 * @description Type-level and runtime verification of filesystem interfaces.
 */

import { describe, expect, it } from "vitest";
import type {
  FsDirectoryEntry,
  FsModule,
  FsStats,
} from "../../../src/fs/types.js";

describe("fs/types", () => {
  describe("FsStats", () => {
    it("should allow creation of a conforming FsStats object", () => {
      const stats: FsStats = {
        isDirectory: () => false,
        isFile: () => true,
        isSymbolicLink: () => false,
      };

      expect(stats.isDirectory()).toBe(false);
      expect(stats.isFile()).toBe(true);
      expect(stats.isSymbolicLink()).toBe(false);
    });

    it("should allow directory stats", () => {
      const stats: FsStats = {
        isDirectory: () => true,
        isFile: () => false,
        isSymbolicLink: () => false,
      };

      expect(stats.isDirectory()).toBe(true);
      expect(stats.isFile()).toBe(false);
    });

    it("should allow symlink stats", () => {
      const stats: FsStats = {
        isDirectory: () => false,
        isFile: () => false,
        isSymbolicLink: () => true,
      };

      expect(stats.isSymbolicLink()).toBe(true);
    });
  });

  describe("FsDirectoryEntry", () => {
    it("should allow creation of a file entry", () => {
      const entry: FsDirectoryEntry = {
        isDirectory: () => false,
        isFile: () => true,
        name: "test.ts",
      };

      expect(entry.name).toBe("test.ts");
      expect(entry.isFile()).toBe(true);
      expect(entry.isDirectory()).toBe(false);
    });

    it("should allow creation of a directory entry", () => {
      const entry: FsDirectoryEntry = {
        isDirectory: () => true,
        isFile: () => false,
        name: "subdir",
      };

      expect(entry.name).toBe("subdir");
      expect(entry.isDirectory()).toBe(true);
      expect(entry.isFile()).toBe(false);
    });
  });

  describe("FsModule", () => {
    it("should allow a minimal FsModule with only readFile", () => {
      const fs: FsModule = {
        readFile: async (_path: string, _encoding: "utf-8") => "content",
      };

      expect(fs.readFile).toBeDefined();
      expect(fs.readdir).toBeUndefined();
      expect(fs.realpath).toBeUndefined();
      expect(fs.stat).toBeUndefined();
    });

    it("should allow a complete FsModule with all methods", () => {
      const fs: FsModule = {
        readFile: async (_path: string, _encoding: "utf-8") => "content",
        readdir: async (_path: string) => ["a.ts", "b.ts"],
        realpath: async (_path: string) => "/resolved/path",
        stat: async (_path: string) => ({
          isDirectory: () => false,
          isFile: () => true,
          isSymbolicLink: () => false,
        }),
      };

      expect(fs.readFile).toBeDefined();
      expect(fs.readdir).toBeDefined();
      expect(fs.realpath).toBeDefined();
      expect(fs.stat).toBeDefined();
    });

    it("should resolve readFile with string content", async () => {
      const fs: FsModule = {
        readFile: async (_path: string, _encoding: "utf-8") =>
          "file contents here",
      };

      const result = await fs.readFile("/some/path.ts", "utf-8");
      expect(result).toBe("file contents here");
    });

    it("should resolve readdir with string array", async () => {
      const fs: FsModule = {
        readFile: async () => "",
        readdir: async (_path: string) => ["index.ts", "utils.ts"],
      };

      const result = await fs.readdir!("/some/dir");
      expect(result).toEqual(["index.ts", "utils.ts"]);
    });

    it("should resolve realpath with absolute path", async () => {
      const fs: FsModule = {
        readFile: async () => "",
        realpath: async (_path: string) => "/absolute/resolved/path",
      };

      const result = await fs.realpath!("./relative");
      expect(result).toBe("/absolute/resolved/path");
    });

    it("should resolve stat with FsStats", async () => {
      const fs: FsModule = {
        readFile: async () => "",
        stat: async (_path: string) => ({
          isDirectory: () => true,
          isFile: () => false,
          isSymbolicLink: () => false,
        }),
      };

      const result = await fs.stat!("/some/dir");
      expect(result.isDirectory()).toBe(true);
      expect(result.isFile()).toBe(false);
      expect(result.isSymbolicLink()).toBe(false);
    });
  });
});
