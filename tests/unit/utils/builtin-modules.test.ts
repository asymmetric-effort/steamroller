/**
 * Tests for the builtin-modules utility.
 *
 * @module tests/unit/utils/builtin-modules
 */

import { describe, it, expect } from "bun:test";
import {
  BUILTIN_MODULES,
  BUILTIN_MODULES_WITH_PREFIX,
  isBuiltinModule,
} from "../../../src/utils/builtin-modules.js";

describe("BUILTIN_MODULES", () => {
  it("is a non-empty array", () => {
    expect(BUILTIN_MODULES.length).toBeGreaterThan(0);
  });

  it("contains well-known modules", () => {
    expect(BUILTIN_MODULES).toContain("fs");
    expect(BUILTIN_MODULES).toContain("path");
    expect(BUILTIN_MODULES).toContain("http");
    expect(BUILTIN_MODULES).toContain("https");
    expect(BUILTIN_MODULES).toContain("crypto");
    expect(BUILTIN_MODULES).toContain("os");
    expect(BUILTIN_MODULES).toContain("child_process");
    expect(BUILTIN_MODULES).toContain("events");
    expect(BUILTIN_MODULES).toContain("stream");
    expect(BUILTIN_MODULES).toContain("url");
    expect(BUILTIN_MODULES).toContain("util");
    expect(BUILTIN_MODULES).toContain("net");
    expect(BUILTIN_MODULES).toContain("buffer");
    expect(BUILTIN_MODULES).toContain("worker_threads");
    expect(BUILTIN_MODULES).toContain("zlib");
  });

  it("does not contain node: prefixed entries", () => {
    for (const m of BUILTIN_MODULES) {
      expect(m.startsWith("node:")).toBe(false);
    }
  });

  it("contains no duplicates", () => {
    const unique = new Set(BUILTIN_MODULES);
    expect(unique.size).toBe(BUILTIN_MODULES.length);
  });

  it("is sorted alphabetically", () => {
    const sorted = [...BUILTIN_MODULES].sort();
    expect(BUILTIN_MODULES).toEqual(sorted);
  });
});

describe("BUILTIN_MODULES_WITH_PREFIX", () => {
  it("is a non-empty array", () => {
    expect(BUILTIN_MODULES_WITH_PREFIX.length).toBeGreaterThan(0);
  });

  it("has the same length as BUILTIN_MODULES", () => {
    expect(BUILTIN_MODULES_WITH_PREFIX.length).toBe(BUILTIN_MODULES.length);
  });

  it("contains node:-prefixed versions of known modules", () => {
    expect(BUILTIN_MODULES_WITH_PREFIX).toContain("node:fs");
    expect(BUILTIN_MODULES_WITH_PREFIX).toContain("node:path");
    expect(BUILTIN_MODULES_WITH_PREFIX).toContain("node:http");
    expect(BUILTIN_MODULES_WITH_PREFIX).toContain("node:crypto");
  });

  it("every entry starts with node:", () => {
    for (const m of BUILTIN_MODULES_WITH_PREFIX) {
      expect(m.startsWith("node:")).toBe(true);
    }
  });

  it("maps 1:1 with BUILTIN_MODULES", () => {
    for (const [i, m] of BUILTIN_MODULES.entries()) {
      expect(BUILTIN_MODULES_WITH_PREFIX[i]).toBe(`node:${m}`);
    }
  });
});

describe("isBuiltinModule", () => {
  it("returns true for bare module names", () => {
    expect(isBuiltinModule("fs")).toBe(true);
    expect(isBuiltinModule("path")).toBe(true);
    expect(isBuiltinModule("http")).toBe(true);
    expect(isBuiltinModule("crypto")).toBe(true);
    expect(isBuiltinModule("os")).toBe(true);
    expect(isBuiltinModule("child_process")).toBe(true);
  });

  it("returns true for node:-prefixed module names", () => {
    expect(isBuiltinModule("node:fs")).toBe(true);
    expect(isBuiltinModule("node:path")).toBe(true);
    expect(isBuiltinModule("node:http")).toBe(true);
    expect(isBuiltinModule("node:crypto")).toBe(true);
    expect(isBuiltinModule("node:worker_threads")).toBe(true);
  });

  it("returns false for third-party packages", () => {
    expect(isBuiltinModule("lodash")).toBe(false);
    expect(isBuiltinModule("express")).toBe(false);
    expect(isBuiltinModule("react")).toBe(false);
    expect(isBuiltinModule("webpack")).toBe(false);
  });

  it("returns false for node:-prefixed non-builtins", () => {
    expect(isBuiltinModule("node:fake")).toBe(false);
    expect(isBuiltinModule("node:lodash")).toBe(false);
    expect(isBuiltinModule("node:react")).toBe(false);
  });

  it("returns false for relative paths", () => {
    expect(isBuiltinModule("./local")).toBe(false);
    expect(isBuiltinModule("../parent")).toBe(false);
    expect(isBuiltinModule("./fs")).toBe(false);
  });

  it("returns false for absolute paths", () => {
    expect(isBuiltinModule("/usr/lib/node")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isBuiltinModule("")).toBe(false);
  });

  it("returns false for subpath imports of builtins", () => {
    expect(isBuiltinModule("fs/promises")).toBe(false);
    expect(isBuiltinModule("node:fs/promises")).toBe(false);
    expect(isBuiltinModule("path/posix")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isBuiltinModule("FS")).toBe(false);
    expect(isBuiltinModule("Path")).toBe(false);
    expect(isBuiltinModule("NODE:fs")).toBe(false);
  });
});
