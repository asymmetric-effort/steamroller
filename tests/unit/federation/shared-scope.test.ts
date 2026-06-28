/**
 * @module tests/unit/federation/shared-scope
 * @description Unit tests for shared dependency management.
 */

import { describe, it, expect } from "bun:test";
import {
  parseSemver,
  compareSemver,
  satisfiesRange,
  findBestMatch,
  registerShared,
  generateSharedScopeCode,
  generateFallbackCode,
  type SharedScopeEntry,
} from "../../../src/federation/shared-scope.js";

const makeEntry = (version: string, eager = false): SharedScopeEntry => ({
  version,
  get: async () => ({}),
  loaded: false,
  eager,
});

describe("parseSemver", () => {
  it("parses a basic version string", () => {
    const result = parseSemver("1.2.3");
    expect(result).toEqual({ major: 1, minor: 2, patch: 3, prerelease: "" });
  });

  it("parses a version with prerelease", () => {
    const result = parseSemver("1.0.0-beta.1");
    expect(result).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: "beta.1",
    });
  });

  it("strips leading v prefix", () => {
    const result = parseSemver("v2.0.0");
    expect(result).toEqual({ major: 2, minor: 0, patch: 0, prerelease: "" });
  });

  it("returns null for invalid version", () => {
    expect(parseSemver("not-a-version")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
  });
});

describe("compareSemver", () => {
  it("returns 0 for equal versions", () => {
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });

  it("compares major versions", () => {
    expect(compareSemver("2.0.0", "1.0.0")).toBe(1);
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
  });

  it("compares minor versions", () => {
    expect(compareSemver("1.3.0", "1.2.0")).toBe(1);
    expect(compareSemver("1.1.0", "1.2.0")).toBe(-1);
  });

  it("compares patch versions", () => {
    expect(compareSemver("1.2.4", "1.2.3")).toBe(1);
  });

  it("release beats prerelease", () => {
    expect(compareSemver("1.0.0", "1.0.0-beta.1")).toBe(1);
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBe(-1);
  });
});

describe("satisfiesRange", () => {
  it("wildcard matches anything", () => {
    expect(satisfiesRange("1.0.0", "*")).toBe(true);
    expect(satisfiesRange("99.99.99", "*")).toBe(true);
  });

  it("empty range matches anything", () => {
    expect(satisfiesRange("1.0.0", "")).toBe(true);
  });

  it("exact match works", () => {
    expect(satisfiesRange("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesRange("1.2.4", "1.2.3")).toBe(false);
  });

  it("caret range matches compatible versions", () => {
    expect(satisfiesRange("1.2.3", "^1.0.0")).toBe(true);
    expect(satisfiesRange("1.9.9", "^1.0.0")).toBe(true);
    expect(satisfiesRange("2.0.0", "^1.0.0")).toBe(false);
    expect(satisfiesRange("0.9.0", "^1.0.0")).toBe(false);
  });

  it("tilde range matches patch-compatible versions", () => {
    expect(satisfiesRange("1.2.3", "~1.2.0")).toBe(true);
    expect(satisfiesRange("1.2.9", "~1.2.0")).toBe(true);
    expect(satisfiesRange("1.3.0", "~1.2.0")).toBe(false);
  });

  it("gte range matches higher versions", () => {
    expect(satisfiesRange("2.0.0", ">=1.0.0")).toBe(true);
    expect(satisfiesRange("1.0.0", ">=1.0.0")).toBe(true);
    expect(satisfiesRange("0.9.0", ">=1.0.0")).toBe(false);
  });

  it("returns false for invalid version", () => {
    expect(satisfiesRange("not-valid", "^1.0.0")).toBe(false);
  });
});

describe("findBestMatch", () => {
  it("returns null for empty entries", () => {
    expect(findBestMatch([], "^1.0.0", false)).toBeNull();
  });

  it("finds the highest matching version", () => {
    const entries = [
      makeEntry("1.0.0"),
      makeEntry("1.2.0"),
      makeEntry("1.1.0"),
    ];
    const result = findBestMatch(entries, "^1.0.0", false);
    expect(result?.version).toBe("1.2.0");
  });

  it("skips versions that do not satisfy range", () => {
    const entries = [makeEntry("1.0.0"), makeEntry("2.0.0")];
    const result = findBestMatch(entries, "^1.0.0", false);
    expect(result?.version).toBe("1.0.0");
  });

  it("returns highest version for singletons regardless of range", () => {
    const entries = [
      makeEntry("1.0.0"),
      makeEntry("2.0.0"),
      makeEntry("1.5.0"),
    ];
    const result = findBestMatch(entries, "^1.0.0", true);
    expect(result?.version).toBe("2.0.0");
  });

  it("returns null when no version satisfies range", () => {
    const entries = [makeEntry("2.0.0"), makeEntry("3.0.0")];
    const result = findBestMatch(entries, "^1.0.0", false);
    expect(result).toBeNull();
  });
});

describe("registerShared", () => {
  it("registers a new entry for a new package", () => {
    const scope: Record<string, SharedScopeEntry[]> = {};
    const entry = makeEntry("1.0.0");
    registerShared(scope, "react", entry);
    expect(scope["react"]).toHaveLength(1);
    expect(scope["react"][0].version).toBe("1.0.0");
  });

  it("appends to existing entries for the same package", () => {
    const scope: Record<string, SharedScopeEntry[]> = {};
    registerShared(scope, "react", makeEntry("1.0.0"));
    registerShared(scope, "react", makeEntry("1.1.0"));
    expect(scope["react"]).toHaveLength(2);
  });
});

describe("generateSharedScopeCode", () => {
  it("generates empty scope for no shared deps", () => {
    const code = generateSharedScopeCode({});
    expect(code).toContain("__federation_shared_scope__");
    expect(code).toContain("{}");
  });

  it("generates scope with configured deps", () => {
    const code = generateSharedScopeCode({
      react: {
        packageName: "react",
        requiredVersion: "^18.0.0",
        singleton: true,
        strictVersion: false,
        eager: false,
      },
    });
    expect(code).toContain("react");
    expect(code).toContain("^18.0.0");
    expect(code).toContain("singleton: true");
    expect(code).toContain("__federation_get_shared__");
  });
});

describe("generateFallbackCode", () => {
  it("generates fallback import function", () => {
    const code = generateFallbackCode("react", "react");
    expect(code).toContain("__federation_fallback_react__");
    expect(code).toContain("import(");
  });

  it("sanitizes package names with special characters", () => {
    const code = generateFallbackCode("@scope/pkg", "@scope/pkg");
    expect(code).toContain("__federation_fallback__scope_pkg__");
  });
});
