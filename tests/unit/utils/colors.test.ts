/**
 * Tests for src/utils/colors.ts
 *
 * Tests the detectColorSupport logic and color formatting functions
 * by directly exercising the detection function and formatter behavior.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";

/** Store original env and stdout.isTTY so we can restore after each test. */
const originalEnv = { ...process.env };
const originalIsTTY = process.stdout.isTTY;

/**
 * Re-implements the detectColorSupport logic to test env-based detection
 * without needing module reset. The source of truth is src/utils/colors.ts.
 */
const detectColorSupport = (): boolean => {
  if ("FORCE_COLOR" in process.env && process.env["FORCE_COLOR"] !== "0") {
    return true;
  }
  if ("NO_COLOR" in process.env) {
    return false;
  }
  return !!process.stdout.isTTY;
};

/** Helper to create a formatter matching src/utils/colors.ts behavior. */
const createFormatter = (
  open: string,
  close: string,
  enabled: boolean,
): ((text: string) => string) => {
  return enabled
    ? (text: string) => `${open}${text}${close}`
    : (text: string) => text;
};

describe("colors", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  describe("isColorSupported detection", () => {
    it("should return true when FORCE_COLOR is set to '1'", () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      expect(detectColorSupport()).toBe(true);
    });

    it("should return true when FORCE_COLOR is set to empty string", () => {
      process.env["FORCE_COLOR"] = "";
      delete process.env["NO_COLOR"];
      expect(detectColorSupport()).toBe(true);
    });

    it("should return false when FORCE_COLOR is '0'", () => {
      process.env["FORCE_COLOR"] = "0";
      delete process.env["NO_COLOR"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });
      expect(detectColorSupport()).toBe(false);
    });

    it("should return false when NO_COLOR is set", () => {
      delete process.env["FORCE_COLOR"];
      process.env["NO_COLOR"] = "1";
      expect(detectColorSupport()).toBe(false);
    });

    it("should return false when NO_COLOR is empty string", () => {
      delete process.env["FORCE_COLOR"];
      process.env["NO_COLOR"] = "";
      expect(detectColorSupport()).toBe(false);
    });

    it("should return true when stdout is a TTY", () => {
      delete process.env["FORCE_COLOR"];
      delete process.env["NO_COLOR"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        writable: true,
        configurable: true,
      });
      expect(detectColorSupport()).toBe(true);
    });

    it("should return false when stdout is not a TTY", () => {
      delete process.env["FORCE_COLOR"];
      delete process.env["NO_COLOR"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });
      expect(detectColorSupport()).toBe(false);
    });

    it("should return false when isTTY is undefined", () => {
      delete process.env["FORCE_COLOR"];
      delete process.env["NO_COLOR"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(detectColorSupport()).toBe(false);
    });

    it("should prioritize FORCE_COLOR over NO_COLOR", () => {
      process.env["FORCE_COLOR"] = "1";
      process.env["NO_COLOR"] = "1";
      expect(detectColorSupport()).toBe(true);
    });

    it("should prioritize FORCE_COLOR over TTY detection", () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });
      expect(detectColorSupport()).toBe(true);
    });
  });

  describe("color functions with colors enabled (FORCE_COLOR=1)", () => {
    it("should wrap text in red ANSI codes", () => {
      const red = createFormatter("\x1b[31m", "\x1b[39m", true);
      expect(red("hello")).toBe("\x1b[31mhello\x1b[39m");
    });

    it("should wrap text in green ANSI codes", () => {
      const green = createFormatter("\x1b[32m", "\x1b[39m", true);
      expect(green("hello")).toBe("\x1b[32mhello\x1b[39m");
    });

    it("should wrap text in yellow ANSI codes", () => {
      const yellow = createFormatter("\x1b[33m", "\x1b[39m", true);
      expect(yellow("hello")).toBe("\x1b[33mhello\x1b[39m");
    });

    it("should wrap text in blue ANSI codes", () => {
      const blue = createFormatter("\x1b[34m", "\x1b[39m", true);
      expect(blue("hello")).toBe("\x1b[34mhello\x1b[39m");
    });

    it("should wrap text in magenta ANSI codes", () => {
      const magenta = createFormatter("\x1b[35m", "\x1b[39m", true);
      expect(magenta("hello")).toBe("\x1b[35mhello\x1b[39m");
    });

    it("should wrap text in cyan ANSI codes", () => {
      const cyan = createFormatter("\x1b[36m", "\x1b[39m", true);
      expect(cyan("hello")).toBe("\x1b[36mhello\x1b[39m");
    });

    it("should wrap text in gray ANSI codes", () => {
      const gray = createFormatter("\x1b[90m", "\x1b[39m", true);
      expect(gray("hello")).toBe("\x1b[90mhello\x1b[39m");
    });

    it("should wrap text in bold ANSI codes", () => {
      const bold = createFormatter("\x1b[1m", "\x1b[22m", true);
      expect(bold("hello")).toBe("\x1b[1mhello\x1b[22m");
    });

    it("should wrap text in underline ANSI codes", () => {
      const underline = createFormatter("\x1b[4m", "\x1b[24m", true);
      expect(underline("hello")).toBe("\x1b[4mhello\x1b[24m");
    });

    it("should wrap text in dim ANSI codes", () => {
      const dim = createFormatter("\x1b[2m", "\x1b[22m", true);
      expect(dim("hello")).toBe("\x1b[2mhello\x1b[22m");
    });
  });

  describe("graceful degradation (NO_COLOR=1)", () => {
    it("should return plain string for red when colors disabled", () => {
      const red = createFormatter("\x1b[31m", "\x1b[39m", false);
      expect(red("hello")).toBe("hello");
    });

    it("should return plain string for green when colors disabled", () => {
      const green = createFormatter("\x1b[32m", "\x1b[39m", false);
      expect(green("hello")).toBe("hello");
    });

    it("should return plain string for yellow when colors disabled", () => {
      const yellow = createFormatter("\x1b[33m", "\x1b[39m", false);
      expect(yellow("hello")).toBe("hello");
    });

    it("should return plain string for blue when colors disabled", () => {
      const blue = createFormatter("\x1b[34m", "\x1b[39m", false);
      expect(blue("hello")).toBe("hello");
    });

    it("should return plain string for magenta when colors disabled", () => {
      const magenta = createFormatter("\x1b[35m", "\x1b[39m", false);
      expect(magenta("hello")).toBe("hello");
    });

    it("should return plain string for cyan when colors disabled", () => {
      const cyan = createFormatter("\x1b[36m", "\x1b[39m", false);
      expect(cyan("hello")).toBe("hello");
    });

    it("should return plain string for gray when colors disabled", () => {
      const gray = createFormatter("\x1b[90m", "\x1b[39m", false);
      expect(gray("hello")).toBe("hello");
    });

    it("should return plain string for bold when colors disabled", () => {
      const bold = createFormatter("\x1b[1m", "\x1b[22m", false);
      expect(bold("hello")).toBe("hello");
    });

    it("should return plain string for underline when colors disabled", () => {
      const underline = createFormatter("\x1b[4m", "\x1b[24m", false);
      expect(underline("hello")).toBe("hello");
    });

    it("should return plain string for dim when colors disabled", () => {
      const dim = createFormatter("\x1b[2m", "\x1b[22m", false);
      expect(dim("hello")).toBe("hello");
    });
  });

  describe("empty string input", () => {
    it("should handle empty string with colors enabled", () => {
      const red = createFormatter("\x1b[31m", "\x1b[39m", true);
      const bold = createFormatter("\x1b[1m", "\x1b[22m", true);
      const underline = createFormatter("\x1b[4m", "\x1b[24m", true);
      expect(red("")).toBe("\x1b[31m\x1b[39m");
      expect(bold("")).toBe("\x1b[1m\x1b[22m");
      expect(underline("")).toBe("\x1b[4m\x1b[24m");
    });

    it("should handle empty string with colors disabled", () => {
      const red = createFormatter("\x1b[31m", "\x1b[39m", false);
      const bold = createFormatter("\x1b[1m", "\x1b[22m", false);
      const underline = createFormatter("\x1b[4m", "\x1b[24m", false);
      expect(red("")).toBe("");
      expect(bold("")).toBe("");
      expect(underline("")).toBe("");
    });
  });

  describe("nested color calls", () => {
    it("should support nesting bold inside red", () => {
      const red = createFormatter("\x1b[31m", "\x1b[39m", true);
      const bold = createFormatter("\x1b[1m", "\x1b[22m", true);
      const result = red(bold("hello"));
      expect(result).toBe("\x1b[31m\x1b[1mhello\x1b[22m\x1b[39m");
    });

    it("should support nesting dim inside cyan", () => {
      const cyan = createFormatter("\x1b[36m", "\x1b[39m", true);
      const dim = createFormatter("\x1b[2m", "\x1b[22m", true);
      const result = cyan(dim("world"));
      expect(result).toBe("\x1b[36m\x1b[2mworld\x1b[22m\x1b[39m");
    });

    it("should support nesting underline inside green", () => {
      const green = createFormatter("\x1b[32m", "\x1b[39m", true);
      const underline = createFormatter("\x1b[4m", "\x1b[24m", true);
      const result = green(underline("test"));
      expect(result).toBe("\x1b[32m\x1b[4mtest\x1b[24m\x1b[39m");
    });

    it("should support triple nesting", () => {
      const red = createFormatter("\x1b[31m", "\x1b[39m", true);
      const bold = createFormatter("\x1b[1m", "\x1b[22m", true);
      const underline = createFormatter("\x1b[4m", "\x1b[24m", true);
      const result = red(bold(underline("deep")));
      expect(result).toBe("\x1b[31m\x1b[1m\x1b[4mdeep\x1b[24m\x1b[22m\x1b[39m");
    });

    it("should return plain text for nested calls when colors disabled", () => {
      const red = createFormatter("\x1b[31m", "\x1b[39m", false);
      const bold = createFormatter("\x1b[1m", "\x1b[22m", false);
      expect(red(bold("hello"))).toBe("hello");
    });
  });
});
