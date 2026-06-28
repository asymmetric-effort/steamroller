/**
 * @module tests/unit/loaders/text-loader
 * @description Unit tests for the built-in text loader plugin.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { vi } from "../../vi-compat.js";
import * as fs from "node:fs";
import {
  isTextFile,
  generateTextModule,
  textLoader,
  DEFAULT_TEXT_EXTENSIONS,
} from "../../../src/loaders/text-loader.js";

// Mock fs.readFileSync
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

describe("DEFAULT_TEXT_EXTENSIONS", () => {
  it("includes expected text file extensions", () => {
    expect(DEFAULT_TEXT_EXTENSIONS).toContain(".txt");
    expect(DEFAULT_TEXT_EXTENSIONS).toContain(".sql");
    expect(DEFAULT_TEXT_EXTENSIONS).toContain(".html");
    expect(DEFAULT_TEXT_EXTENSIONS).toContain(".md");
    expect(DEFAULT_TEXT_EXTENSIONS).toContain(".graphql");
    expect(DEFAULT_TEXT_EXTENSIONS).toContain(".gql");
  });
});

describe("isTextFile", () => {
  it("returns true for known text extensions", () => {
    expect(isTextFile("readme.txt")).toBe(true);
    expect(isTextFile("/path/to/query.sql")).toBe(true);
    expect(isTextFile("page.html")).toBe(true);
    expect(isTextFile("docs.md")).toBe(true);
    expect(isTextFile("schema.graphql")).toBe(true);
    expect(isTextFile("query.gql")).toBe(true);
  });

  it("returns false for non-text files", () => {
    expect(isTextFile("script.js")).toBe(false);
    expect(isTextFile("styles.css")).toBe(false);
    expect(isTextFile("image.png")).toBe(false);
  });

  it("ignores query parameters", () => {
    expect(isTextFile("query.sql?foo")).toBe(true);
  });

  it("supports custom extensions", () => {
    expect(isTextFile("template.hbs", [".hbs"])).toBe(true);
    expect(isTextFile("query.sql", [".hbs"])).toBe(false);
  });
});

describe("generateTextModule", () => {
  it("generates a default export with the text content", () => {
    const code = generateTextModule("SELECT * FROM users;");
    expect(code).toContain("export default");
    expect(code).toContain("SELECT * FROM users;");
  });

  it("escapes backticks in content", () => {
    const code = generateTextModule("hello `world`");
    expect(code).toContain("\\`world\\`");
  });

  it("escapes backslashes in content", () => {
    const code = generateTextModule("path\\to\\file");
    expect(code).toContain("\\\\");
  });

  it("escapes dollar signs in content", () => {
    const code = generateTextModule("price is $5");
    expect(code).toContain("\\$5");
  });

  it("preserves newlines in content", () => {
    const code = generateTextModule("line1\nline2\nline3");
    expect(code).toContain("line1\nline2\nline3");
  });
});

describe("textLoader plugin", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("has the correct name", () => {
    const plugin = textLoader();
    expect(plugin.name).toBe("steamroller:text");
  });

  it("load returns null for non-text files", () => {
    const plugin = textLoader();
    const result = (plugin.load as (id: string) => unknown)("script.js");
    expect(result).toBeNull();
  });

  it("load reads text files and returns module code", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("SELECT * FROM users;");

    const plugin = textLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/query.sql",
    ) as { code: string };

    expect(result).not.toBeNull();
    expect(result.code).toContain("export default");
    expect(result.code).toContain("SELECT * FROM users;");
  });

  it("load returns null when file cannot be read", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const plugin = textLoader();
    const result = (plugin.load as (id: string) => unknown)(
      "/path/to/missing.txt",
    );
    expect(result).toBeNull();
  });

  it("resolveId returns null for all inputs", () => {
    const plugin = textLoader();
    const resolve = plugin.resolveId as (source: string) => unknown;
    expect(resolve("query.sql")).toBeNull();
    expect(resolve("script.js")).toBeNull();
  });
});
