/**
 * Tests for src/utils/colors.ts
 *
 * Uses dynamic imports with vi.resetModules() to test different
 * environment configurations (NO_COLOR, FORCE_COLOR, TTY).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Helper to dynamically import the colors module with a fresh module cache. */
const importColors = async (): Promise<typeof import("../../../src/utils/colors")> => {
  vi.resetModules();
  return import("../../../src/utils/colors");
};

/** Store original env and stdout.isTTY so we can restore after each test. */
const originalEnv = { ...process.env };
const originalIsTTY = process.stdout.isTTY;

describe("colors", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  });

  describe("isColorSupported detection", () => {
    it("should return true when FORCE_COLOR is set to '1'", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { isColorSupported } = await importColors();
      expect(isColorSupported).toBe(true);
    });

    it("should return true when FORCE_COLOR is set to empty string", async () => {
      process.env["FORCE_COLOR"] = "";
      delete process.env["NO_COLOR"];
      const { isColorSupported } = await importColors();
      expect(isColorSupported).toBe(true);
    });

    it("should return false when FORCE_COLOR is '0'", async () => {
      process.env["FORCE_COLOR"] = "0";
      delete process.env["NO_COLOR"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });
      const { isColorSupported } = await importColors();
      expect(isColorSupported).toBe(false);
    });

    it("should return false when NO_COLOR is set", async () => {
      delete process.env["FORCE_COLOR"];
      process.env["NO_COLOR"] = "1";
      const { isColorSupported } = await importColors();
      expect(isColorSupported).toBe(false);
    });

    it("should return false when NO_COLOR is empty string", async () => {
      delete process.env["FORCE_COLOR"];
      process.env["NO_COLOR"] = "";
      const { isColorSupported } = await importColors();
      expect(isColorSupported).toBe(false);
    });

    it("should return true when stdout is a TTY", async () => {
      delete process.env["FORCE_COLOR"];
      delete process.env["NO_COLOR"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        writable: true,
        configurable: true,
      });
      const { isColorSupported } = await importColors();
      expect(isColorSupported).toBe(true);
    });

    it("should return false when stdout is not a TTY", async () => {
      delete process.env["FORCE_COLOR"];
      delete process.env["NO_COLOR"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });
      const { isColorSupported } = await importColors();
      expect(isColorSupported).toBe(false);
    });

    it("should return false when isTTY is undefined", async () => {
      delete process.env["FORCE_COLOR"];
      delete process.env["NO_COLOR"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const { isColorSupported } = await importColors();
      expect(isColorSupported).toBe(false);
    });

    it("should prioritize FORCE_COLOR over NO_COLOR", async () => {
      process.env["FORCE_COLOR"] = "1";
      process.env["NO_COLOR"] = "1";
      const { isColorSupported } = await importColors();
      expect(isColorSupported).toBe(true);
    });

    it("should prioritize FORCE_COLOR over TTY detection", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });
      const { isColorSupported } = await importColors();
      expect(isColorSupported).toBe(true);
    });
  });

  describe("color functions with colors enabled (FORCE_COLOR=1)", () => {
    it("should wrap text in red ANSI codes", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { red } = await importColors();
      expect(red("hello")).toBe("\x1b[31mhello\x1b[39m");
    });

    it("should wrap text in green ANSI codes", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { green } = await importColors();
      expect(green("hello")).toBe("\x1b[32mhello\x1b[39m");
    });

    it("should wrap text in yellow ANSI codes", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { yellow } = await importColors();
      expect(yellow("hello")).toBe("\x1b[33mhello\x1b[39m");
    });

    it("should wrap text in blue ANSI codes", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { blue } = await importColors();
      expect(blue("hello")).toBe("\x1b[34mhello\x1b[39m");
    });

    it("should wrap text in magenta ANSI codes", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { magenta } = await importColors();
      expect(magenta("hello")).toBe("\x1b[35mhello\x1b[39m");
    });

    it("should wrap text in cyan ANSI codes", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { cyan } = await importColors();
      expect(cyan("hello")).toBe("\x1b[36mhello\x1b[39m");
    });

    it("should wrap text in gray ANSI codes", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { gray } = await importColors();
      expect(gray("hello")).toBe("\x1b[90mhello\x1b[39m");
    });

    it("should wrap text in bold ANSI codes", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { bold } = await importColors();
      expect(bold("hello")).toBe("\x1b[1mhello\x1b[22m");
    });

    it("should wrap text in underline ANSI codes", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { underline } = await importColors();
      expect(underline("hello")).toBe("\x1b[4mhello\x1b[24m");
    });

    it("should wrap text in dim ANSI codes", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { dim } = await importColors();
      expect(dim("hello")).toBe("\x1b[2mhello\x1b[22m");
    });
  });

  describe("graceful degradation (NO_COLOR=1)", () => {
    it("should return plain string for red when colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { red } = await importColors();
      expect(red("hello")).toBe("hello");
    });

    it("should return plain string for green when colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { green } = await importColors();
      expect(green("hello")).toBe("hello");
    });

    it("should return plain string for yellow when colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { yellow } = await importColors();
      expect(yellow("hello")).toBe("hello");
    });

    it("should return plain string for blue when colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { blue } = await importColors();
      expect(blue("hello")).toBe("hello");
    });

    it("should return plain string for magenta when colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { magenta } = await importColors();
      expect(magenta("hello")).toBe("hello");
    });

    it("should return plain string for cyan when colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { cyan } = await importColors();
      expect(cyan("hello")).toBe("hello");
    });

    it("should return plain string for gray when colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { gray } = await importColors();
      expect(gray("hello")).toBe("hello");
    });

    it("should return plain string for bold when colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { bold } = await importColors();
      expect(bold("hello")).toBe("hello");
    });

    it("should return plain string for underline when colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { underline } = await importColors();
      expect(underline("hello")).toBe("hello");
    });

    it("should return plain string for dim when colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { dim } = await importColors();
      expect(dim("hello")).toBe("hello");
    });
  });

  describe("empty string input", () => {
    it("should handle empty string with colors enabled", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { red, bold, underline } = await importColors();
      expect(red("")).toBe("\x1b[31m\x1b[39m");
      expect(bold("")).toBe("\x1b[1m\x1b[22m");
      expect(underline("")).toBe("\x1b[4m\x1b[24m");
    });

    it("should handle empty string with colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { red, bold, underline } = await importColors();
      expect(red("")).toBe("");
      expect(bold("")).toBe("");
      expect(underline("")).toBe("");
    });
  });

  describe("nested color calls", () => {
    it("should support nesting bold inside red", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { red, bold } = await importColors();
      const result = red(bold("hello"));
      expect(result).toBe("\x1b[31m\x1b[1mhello\x1b[22m\x1b[39m");
    });

    it("should support nesting dim inside cyan", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { cyan, dim } = await importColors();
      const result = cyan(dim("world"));
      expect(result).toBe("\x1b[36m\x1b[2mworld\x1b[22m\x1b[39m");
    });

    it("should support nesting underline inside green", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { green, underline } = await importColors();
      const result = green(underline("test"));
      expect(result).toBe("\x1b[32m\x1b[4mtest\x1b[24m\x1b[39m");
    });

    it("should support triple nesting", async () => {
      process.env["FORCE_COLOR"] = "1";
      delete process.env["NO_COLOR"];
      const { red, bold, underline } = await importColors();
      const result = red(bold(underline("deep")));
      expect(result).toBe(
        "\x1b[31m\x1b[1m\x1b[4mdeep\x1b[24m\x1b[22m\x1b[39m",
      );
    });

    it("should return plain text for nested calls when colors disabled", async () => {
      process.env["NO_COLOR"] = "1";
      delete process.env["FORCE_COLOR"];
      const { red, bold } = await importColors();
      expect(red(bold("hello"))).toBe("hello");
    });
  });
});
