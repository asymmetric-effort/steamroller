/**
 * Unit tests for the native parser bridge.
 *
 * @module tests/unit/native/parser-bridge
 */

import { describe, it, expect } from "vitest";
import { parseWithNative } from "../../../src/native/parser-bridge.js";

describe("parser bridge", () => {
  it("falls back to the TS parser and returns a valid Program", () => {
    const result = parseWithNative("const x = 1;");
    expect(result.type).toBe("Program");
    expect(result.sourceType).toBe("module");
    expect(Array.isArray(result.body)).toBe(true);
  });

  it("parses empty input into an empty Program body", () => {
    const result = parseWithNative("");
    expect(result.type).toBe("Program");
    expect(result.body).toEqual([]);
  });

  it("respects the sourceType option", () => {
    const mod = parseWithNative("const x = 1;", { sourceType: "module" });
    expect(mod.sourceType).toBe("module");

    const script = parseWithNative("const x = 1;", { sourceType: "script" });
    expect(script.sourceType).toBe("script");
  });

  it("parses variable declarations correctly", () => {
    const result = parseWithNative("let a = 42; const b = true;");
    expect(result.body.length).toBe(2);
    expect(result.body[0].type).toBe("VariableDeclaration");
    expect(result.body[1].type).toBe("VariableDeclaration");
  });

  it("throws on syntax errors (same as TS parser)", () => {
    expect(() => parseWithNative("const = ;")).toThrow();
  });
});
