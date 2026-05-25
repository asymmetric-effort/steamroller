/**
 * Unit tests for stdin and misc CLI utilities.
 *
 * @module tests/unit/cli/stdin
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  readStdin,
  handleForceExit,
  handleEnvironment,
} from "../../../src/cli/stdin.js";
import * as cliIndex from "../../../src/cli/index.js";
import { EventEmitter } from "node:events";

describe("cli/index re-exports", () => {
  it("should export all public API functions", () => {
    expect(typeof cliIndex.parseCli).toBe("function");
    expect(typeof cliIndex.loadConfigFile).toBe("function");
    expect(typeof cliIndex.findConfigFile).toBe("function");
    expect(typeof cliIndex.resolveConfigPath).toBe("function");
    expect(typeof cliIndex.normalizeConfig).toBe("function");
    expect(typeof cliIndex.configureTerminal).toBe("function");
    expect(typeof cliIndex.getTerminalConfig).toBe("function");
    expect(typeof cliIndex.logInfo).toBe("function");
    expect(typeof cliIndex.logWarn).toBe("function");
    expect(typeof cliIndex.logError).toBe("function");
    expect(typeof cliIndex.formatWarning).toBe("function");
    expect(typeof cliIndex.displayWarning).toBe("function");
    expect(typeof cliIndex.displayBundleStart).toBe("function");
    expect(typeof cliIndex.displayBundleEnd).toBe("function");
    expect(typeof cliIndex.displayTimings).toBe("function");
    expect(typeof cliIndex.getLogFilter).toBe("function");
    expect(typeof cliIndex.parseFilterPattern).toBe("function");
    expect(typeof cliIndex.readStdin).toBe("function");
    expect(typeof cliIndex.handleForceExit).toBe("function");
    expect(typeof cliIndex.handleWaitForBundleInput).toBe("function");
    expect(typeof cliIndex.handleEnvironment).toBe("function");
  });
});

describe("readStdin", () => {
  let originalStdin: typeof process.stdin;

  beforeEach(() => {
    originalStdin = process.stdin;
  });

  afterEach(() => {
    Object.defineProperty(process, "stdin", {
      value: originalStdin,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it("should read data from stdin", async () => {
    const mockStdin = new EventEmitter() as unknown as typeof process.stdin;
    (mockStdin as Record<string, unknown>)["setEncoding"] = vi.fn();
    (mockStdin as Record<string, unknown>)["resume"] = vi.fn();
    Object.defineProperty(process, "stdin", {
      value: mockStdin,
      writable: true,
    });

    const promise = readStdin();

    mockStdin.emit("data", "hello ");
    mockStdin.emit("data", "world");
    mockStdin.emit("end");

    const result = await promise;
    expect(result).toBe("hello world");
  });

  it("should reject on error", async () => {
    const mockStdin = new EventEmitter() as unknown as typeof process.stdin;
    (mockStdin as Record<string, unknown>)["setEncoding"] = vi.fn();
    (mockStdin as Record<string, unknown>)["resume"] = vi.fn();
    Object.defineProperty(process, "stdin", {
      value: mockStdin,
      writable: true,
    });

    const promise = readStdin();

    mockStdin.emit("error", new Error("read error"));

    await expect(promise).rejects.toThrow("read error");
  });

  it("should handle empty stdin", async () => {
    const mockStdin = new EventEmitter() as unknown as typeof process.stdin;
    (mockStdin as Record<string, unknown>)["setEncoding"] = vi.fn();
    (mockStdin as Record<string, unknown>)["resume"] = vi.fn();
    Object.defineProperty(process, "stdin", {
      value: mockStdin,
      writable: true,
    });

    const promise = readStdin();
    mockStdin.emit("end");

    const result = await promise;
    expect(result).toBe("");
  });
});

describe("handleForceExit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should call process.exit after delay", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    handleForceExit(1000);

    expect(exitSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("should not exit before delay", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    handleForceExit(5000);

    vi.advanceTimersByTime(3000);

    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe("handleWaitForBundleInput", () => {
  it("should return true when files exist", async () => {
    /* Use a real file that we know exists */
    const { handleWaitForBundleInput } =
      await import("../../../src/cli/stdin.js");
    const result = await handleWaitForBundleInput(
      [
        new URL("../../../package.json", import.meta.url).pathname.replace(
          /^\/([A-Z]:)/i,
          "$1",
        ),
      ],
      2,
    );
    expect(result).toBe(true);
  });

  it("should return false when files do not exist", async () => {
    const { handleWaitForBundleInput } =
      await import("../../../src/cli/stdin.js");
    const result = await handleWaitForBundleInput(
      ["/nonexistent/path/file.ts"],
      1,
    );
    expect(result).toBe(false);
  });

  it("should return false when path is a directory not a file", async () => {
    const { handleWaitForBundleInput } =
      await import("../../../src/cli/stdin.js");
    const result = await handleWaitForBundleInput(
      ["/home/claude/git/worktree-cli/src"],
      1,
    );
    expect(result).toBe(false);
  });
});

describe("handleEnvironment", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    /* Clean up added env vars */
    const keys = Object.keys(process.env);
    for (const key of keys) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
  });

  it("should parse KEY=value pairs", () => {
    handleEnvironment("FOO=bar,BAZ=qux");
    expect(process.env["FOO"]).toBe("bar");
    expect(process.env["BAZ"]).toBe("qux");
  });

  it("should set key to 'true' when no value provided", () => {
    handleEnvironment("MY_FLAG");
    expect(process.env["MY_FLAG"]).toBe("true");
  });

  it("should handle empty string", () => {
    handleEnvironment("");
    /* Should not throw */
  });

  it("should handle single KEY=value", () => {
    handleEnvironment("SINGLE=value");
    expect(process.env["SINGLE"]).toBe("value");
  });

  it("should handle values with equals sign", () => {
    handleEnvironment("URL=http://host:8080/path?a=1");
    expect(process.env["URL"]).toBe("http://host:8080/path?a=1");
  });

  it("should trim whitespace from keys and values", () => {
    handleEnvironment(" KEY = value ");
    expect(process.env["KEY"]).toBe("value");
  });

  it("should handle mixed: some with values, some without", () => {
    handleEnvironment("A=1,B,C=3");
    expect(process.env["A"]).toBe("1");
    expect(process.env["B"]).toBe("true");
    expect(process.env["C"]).toBe("3");
  });
});
