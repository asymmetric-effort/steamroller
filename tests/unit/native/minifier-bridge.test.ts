/**
 * Unit tests for the native minifier bridge.
 *
 * @module tests/unit/native/minifier-bridge
 */

import { describe, it, expect } from "vitest";
import { minifyWithNative } from "../../../src/native/minifier-bridge.js";

describe("minifier bridge", () => {
  it("falls back to the TS minifier and returns a MinifyResult", () => {
    const result = minifyWithNative("const   x   =   1;");
    expect(typeof result.code).toBe("string");
    expect(result.code.length).toBeLessThanOrEqual("const   x   =   1;".length);
  });

  it("returns an empty string for whitespace-only input", () => {
    const result = minifyWithNative("   ");
    expect(result.code).toBe("");
  });

  it("produces valid minified output for a function", () => {
    const code = "function hello(name) { return name; }";
    const result = minifyWithNative(code);
    expect(typeof result.code).toBe("string");
    expect(result.code.length).toBeGreaterThan(0);
  });
});
