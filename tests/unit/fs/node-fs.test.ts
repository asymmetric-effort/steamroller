/**
 * @module tests/unit/fs/node-fs
 * @description Tests for the Node.js filesystem adapter.
 */

import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeFs } from "../../../src/fs/node-fs.js";

const WORKTREE_ROOT = resolve(import.meta.dirname, "../../..");

describe("fs/node-fs", () => {
  describe("createNodeFs", () => {
    it("should return an object with all FsModule methods", () => {
      const fs = createNodeFs();

      expect(fs.readFile).toBeTypeOf("function");
      expect(fs.readdir).toBeTypeOf("function");
      expect(fs.realpath).toBeTypeOf("function");
      expect(fs.stat).toBeTypeOf("function");
    });
  });

  describe("readFile", () => {
    it("should read a file and return its content as a string", async () => {
      const fs = createNodeFs();
      const content = await fs.readFile(
        resolve(WORKTREE_ROOT, "package.json"),
        "utf-8",
      );

      expect(content).toContain('"name": "steamroller"');
    });

    it("should reject for a non-existent file", async () => {
      const fs = createNodeFs();

      await expect(
        fs.readFile("/non/existent/file.txt", "utf-8"),
      ).rejects.toThrow();
    });

    it("should reject with ENOENT error code for missing files", async () => {
      const fs = createNodeFs();

      await expect(
        fs.readFile("/non/existent/path.ts", "utf-8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  describe("readdir", () => {
    it("should list directory contents as string array", async () => {
      const fs = createNodeFs();
      const entries = await fs.readdir!(resolve(WORKTREE_ROOT, "src"));

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries).toContain("types.ts");
      expect(entries).toContain("index.ts");
    });

    it("should reject for a non-existent directory", async () => {
      const fs = createNodeFs();

      await expect(fs.readdir!("/non/existent/directory")).rejects.toThrow();
    });

    it("should reject with ENOENT for missing directory", async () => {
      const fs = createNodeFs();

      await expect(
        fs.readdir!("/non/existent/directory"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  describe("realpath", () => {
    it("should resolve a path to its real absolute path", async () => {
      const fs = createNodeFs();
      const resolved = await fs.realpath!(WORKTREE_ROOT);

      expect(resolved).toBe(WORKTREE_ROOT);
    });

    it("should resolve relative-like paths in absolute form", async () => {
      const fs = createNodeFs();
      const resolved = await fs.realpath!(resolve(WORKTREE_ROOT, "src/../src"));

      expect(resolved).toBe(resolve(WORKTREE_ROOT, "src"));
    });

    it("should reject for a non-existent path", async () => {
      const fs = createNodeFs();

      await expect(fs.realpath!("/non/existent/path")).rejects.toThrow();
    });

    it("should reject with ENOENT for missing path", async () => {
      const fs = createNodeFs();

      await expect(fs.realpath!("/non/existent/path")).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  });

  describe("stat", () => {
    it("should return stats for a file", async () => {
      const fs = createNodeFs();
      const stats = await fs.stat!(resolve(WORKTREE_ROOT, "package.json"));

      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.isSymbolicLink()).toBe(false);
    });

    it("should return stats for a directory", async () => {
      const fs = createNodeFs();
      const stats = await fs.stat!(resolve(WORKTREE_ROOT, "src"));

      expect(stats.isFile()).toBe(false);
      expect(stats.isDirectory()).toBe(true);
      expect(stats.isSymbolicLink()).toBe(false);
    });

    it("should reject for a non-existent path", async () => {
      const fs = createNodeFs();

      await expect(fs.stat!("/non/existent/file.ts")).rejects.toThrow();
    });

    it("should reject with ENOENT for missing path", async () => {
      const fs = createNodeFs();

      await expect(fs.stat!("/non/existent/file.ts")).rejects.toMatchObject({
        code: "ENOENT",
      });
    });

    it("should return methods that are callable multiple times", async () => {
      const fs = createNodeFs();
      const stats = await fs.stat!(resolve(WORKTREE_ROOT, "package.json"));

      expect(stats.isFile()).toBe(true);
      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.isDirectory()).toBe(false);
    });
  });
});
