/**
 * @module tests/unit/fs/index
 * @description Tests for the fs module barrel export.
 */

import { describe, expect, it } from "bun:test";
import { createNodeFs } from "../../../src/fs/index.js";
import type {
  FsDirectoryEntry,
  FsModule,
  FsStats,
} from "../../../src/fs/index.js";

describe("fs/index", () => {
  it("should export createNodeFs function", () => {
    expect(createNodeFs).toBeTypeOf("function");
  });

  it("should return a valid FsModule from createNodeFs", () => {
    const fs: FsModule = createNodeFs();

    expect(fs.readFile).toBeTypeOf("function");
    expect(fs.readdir).toBeTypeOf("function");
    expect(fs.realpath).toBeTypeOf("function");
    expect(fs.stat).toBeTypeOf("function");
  });

  it("should export FsStats type that is assignable", () => {
    const stats: FsStats = {
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
    };

    expect(stats.isFile()).toBe(true);
  });

  it("should export FsDirectoryEntry type that is assignable", () => {
    const entry: FsDirectoryEntry = {
      isDirectory: () => false,
      isFile: () => true,
      name: "test.ts",
    };

    expect(entry.name).toBe("test.ts");
  });
});
