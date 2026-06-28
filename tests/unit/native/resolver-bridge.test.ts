/**
 * Unit tests for the native resolver bridge.
 *
 * @module tests/unit/native/resolver-bridge
 */

import { describe, it, expect } from "bun:test";
import { resolveWithNative } from "../../../src/native/resolver-bridge.js";

describe("resolver bridge", () => {
  it("falls back to the TS resolver for relative paths", () => {
    const result = resolveWithNative("./utils", "/project/src/index.ts");
    expect(typeof result).toBe("string");
    expect(result).toContain("utils");
  });

  it("resolves absolute paths directly", () => {
    const result = resolveWithNative(
      "/absolute/path.js",
      "/project/src/index.ts",
    );
    expect(result).toBe("/absolute/path.js");
  });

  it("returns null for bare specifiers without a plugin", () => {
    const result = resolveWithNative("lodash", "/project/src/index.ts");
    expect(result).toBeNull();
  });
});
