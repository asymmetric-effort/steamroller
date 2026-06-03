/**
 * Unit tests for the native parser bridge.
 *
 * @module tests/unit/native/parser-bridge
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseWithNative } from "../../../src/native/parser-bridge.js";
import * as nativeIndex from "../../../src/native/index.js";

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

  describe("with mocked native parser", () => {
    let getNativeParserSpy: ReturnType<typeof vi.spyOn>;
    const originalEnv = process.env["NODE_DEBUG"];

    beforeEach(() => {
      getNativeParserSpy = vi.spyOn(nativeIndex, "getNativeParser");
    });

    afterEach(() => {
      getNativeParserSpy.mockRestore();
      if (originalEnv === undefined) {
        delete process.env["NODE_DEBUG"];
      } else {
        process.env["NODE_DEBUG"] = originalEnv;
      }
    });

    it("uses native parser when it returns a valid Program", () => {
      const mockProgram = {
        type: "Program" as const,
        body: [],
        sourceType: "module" as const,
        start: 0,
        end: 0,
      };

      const mockParse = vi.fn().mockReturnValue(mockProgram);
      getNativeParserSpy.mockReturnValue({ parse: mockParse });

      const result = parseWithNative("const x = 1;");
      expect(mockParse).toHaveBeenCalledWith("const x = 1;", undefined);
      expect(result.type).toBe("Program");
      expect(result.body).toEqual([]);
    });

    it("falls back to TS parser when native returns invalid result", () => {
      const mockParse = vi.fn().mockReturnValue({ type: "Invalid" });
      getNativeParserSpy.mockReturnValue({ parse: mockParse });

      const result = parseWithNative("const x = 1;");
      expect(result.type).toBe("Program");
      expect(result.body.length).toBe(1);
    });

    it("falls back to TS parser when native returns null", () => {
      const mockParse = vi.fn().mockReturnValue(null);
      getNativeParserSpy.mockReturnValue({ parse: mockParse });

      const result = parseWithNative("const x = 1;");
      expect(result.type).toBe("Program");
      expect(result.body.length).toBe(1);
    });

    it("falls back to TS parser when native returns non-object", () => {
      const mockParse = vi.fn().mockReturnValue("not an object");
      getNativeParserSpy.mockReturnValue({ parse: mockParse });

      const result = parseWithNative("const x = 1;");
      expect(result.type).toBe("Program");
      expect(result.body.length).toBe(1);
    });

    it("falls back to TS parser when native throws an error", () => {
      const mockParse = vi.fn().mockImplementation(() => {
        throw new Error("native parse failed");
      });
      getNativeParserSpy.mockReturnValue({ parse: mockParse });

      const result = parseWithNative("const x = 1;");
      expect(result.type).toBe("Program");
      expect(result.body.length).toBe(1);
    });

    it("passes options to native parser", () => {
      const mockProgram = {
        type: "Program" as const,
        body: [],
        sourceType: "script" as const,
        start: 0,
        end: 0,
      };

      const mockParse = vi.fn().mockReturnValue(mockProgram);
      getNativeParserSpy.mockReturnValue({ parse: mockParse });

      parseWithNative("const x = 1;", { sourceType: "script" });
      expect(mockParse).toHaveBeenCalledWith("const x = 1;", {
        sourceType: "script",
      });
    });

    it("logs timing in debug mode with valid native result", () => {
      process.env["NODE_DEBUG"] = "steamroller";

      const mockProgram = {
        type: "Program" as const,
        body: [],
        sourceType: "module" as const,
        start: 0,
        end: 0,
      };

      const mockParse = vi.fn().mockReturnValue(mockProgram);
      getNativeParserSpy.mockReturnValue({ parse: mockParse });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

      const result = parseWithNative("const x = 1;");
      expect(result.type).toBe("Program");
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("[steamroller:native] parser:"),
      );

      stderrSpy.mockRestore();
    });

    it("does not log timing when debug is off", () => {
      delete process.env["NODE_DEBUG"];

      const mockProgram = {
        type: "Program" as const,
        body: [],
        sourceType: "module" as const,
        start: 0,
        end: 0,
      };

      const mockParse = vi.fn().mockReturnValue(mockProgram);
      getNativeParserSpy.mockReturnValue({ parse: mockParse });

      const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

      parseWithNative("const x = 1;");
      expect(stderrSpy).not.toHaveBeenCalled();

      stderrSpy.mockRestore();
    });

    it("validates program with script sourceType", () => {
      const mockProgram = {
        type: "Program" as const,
        body: [],
        sourceType: "script" as const,
        start: 0,
        end: 0,
      };

      const mockParse = vi.fn().mockReturnValue(mockProgram);
      getNativeParserSpy.mockReturnValue({ parse: mockParse });

      const result = parseWithNative("var x = 1;", { sourceType: "script" });
      expect(result.sourceType).toBe("script");
    });

    it("rejects program with invalid sourceType", () => {
      const mockProgram = {
        type: "Program",
        body: [],
        sourceType: "invalid",
        start: 0,
        end: 0,
      };

      const mockParse = vi.fn().mockReturnValue(mockProgram);
      getNativeParserSpy.mockReturnValue({ parse: mockParse });

      const result = parseWithNative("const x = 1;");
      // Falls back to TS parser
      expect(result.type).toBe("Program");
      expect(result.body.length).toBe(1);
    });

    it("rejects program with non-array body", () => {
      const mockProgram = {
        type: "Program",
        body: "not an array",
        sourceType: "module",
        start: 0,
        end: 0,
      };

      const mockParse = vi.fn().mockReturnValue(mockProgram);
      getNativeParserSpy.mockReturnValue({ parse: mockParse });

      const result = parseWithNative("const x = 1;");
      // Falls back to TS parser
      expect(result.type).toBe("Program");
      expect(result.body.length).toBe(1);
    });
  });
});
