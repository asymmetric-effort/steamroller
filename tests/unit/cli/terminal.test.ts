/**
 * Unit tests for terminal output module.
 *
 * @module tests/unit/cli/terminal
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  configureTerminal,
  getTerminalConfig,
  logInfo,
  logWarn,
  logError,
  formatWarning,
  displayWarning,
  displayBundleStart,
  displayBundleEnd,
  displayTimings,
} from "../../../src/cli/terminal.js";

describe("terminal", () => {
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let stderrWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    configureTerminal({ silent: false, perf: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("configureTerminal", () => {
    it("should update terminal config", () => {
      configureTerminal({ silent: true });
      expect(getTerminalConfig().silent).toBe(true);
    });

    it("should merge partial config", () => {
      configureTerminal({ perf: true });
      expect(getTerminalConfig().perf).toBe(true);
      expect(getTerminalConfig().silent).toBe(false);
    });
  });

  describe("logInfo", () => {
    it("should write to stdout", () => {
      logInfo("hello world");
      expect(stdoutWrite).toHaveBeenCalledTimes(1);
      expect(stdoutWrite.mock.calls[0][0]).toContain("hello world");
      expect(stdoutWrite.mock.calls[0][0]).toContain("INFO");
    });

    it("should suppress output in silent mode", () => {
      configureTerminal({ silent: true });
      logInfo("hidden");
      expect(stdoutWrite).not.toHaveBeenCalled();
    });
  });

  describe("logWarn", () => {
    it("should write to stderr", () => {
      logWarn("warning message");
      expect(stderrWrite).toHaveBeenCalledTimes(1);
      expect(stderrWrite.mock.calls[0][0]).toContain("warning message");
      expect(stderrWrite.mock.calls[0][0]).toContain("WARN");
    });

    it("should suppress output in silent mode", () => {
      configureTerminal({ silent: true });
      logWarn("hidden warning");
      expect(stderrWrite).not.toHaveBeenCalled();
    });
  });

  describe("logError", () => {
    it("should write to stderr", () => {
      logError("error message");
      expect(stderrWrite).toHaveBeenCalledTimes(1);
      expect(stderrWrite.mock.calls[0][0]).toContain("error message");
      expect(stderrWrite.mock.calls[0][0]).toContain("ERROR");
    });

    it("should not suppress errors in silent mode", () => {
      configureTerminal({ silent: true });
      logError("critical error");
      expect(stderrWrite).toHaveBeenCalledTimes(1);
    });
  });

  describe("formatWarning", () => {
    it("should format a simple warning", () => {
      const result = formatWarning({ message: "something is wrong" });
      expect(result).toContain("something is wrong");
    });

    it("should include code when present", () => {
      const result = formatWarning({
        message: "circular",
        code: "CIRCULAR_DEPENDENCY",
      });
      expect(result).toContain("CIRCULAR_DEPENDENCY");
    });

    it("should include plugin when present", () => {
      const result = formatWarning({
        message: "plugin issue",
        plugin: "my-plugin",
      });
      expect(result).toContain("my-plugin");
    });

    it("should include file id and location", () => {
      const result = formatWarning({
        message: "issue here",
        id: "src/foo.ts",
        loc: { line: 10, column: 5 },
      });
      expect(result).toContain("src/foo.ts");
      expect(result).toContain("10:5");
    });

    it("should include id without location", () => {
      const result = formatWarning({
        message: "issue",
        id: "src/bar.ts",
      });
      expect(result).toContain("src/bar.ts");
    });

    it("should include frame when present", () => {
      const result = formatWarning({
        message: "error",
        frame: "  1: const x = 1;\n     ^",
      });
      expect(result).toContain("const x = 1;");
    });
  });

  describe("displayWarning", () => {
    it("should write formatted warning to stderr", () => {
      displayWarning({ message: "test warning", code: "TEST_CODE" });
      expect(stderrWrite).toHaveBeenCalledTimes(1);
      expect(stderrWrite.mock.calls[0][0]).toContain("WARN");
      expect(stderrWrite.mock.calls[0][0]).toContain("test warning");
    });

    it("should suppress in silent mode", () => {
      configureTerminal({ silent: true });
      displayWarning({ message: "hidden" });
      expect(stderrWrite).not.toHaveBeenCalled();
    });
  });

  describe("displayBundleStart", () => {
    it("should show bundling message", () => {
      displayBundleStart("src/index.ts");
      expect(stdoutWrite).toHaveBeenCalledTimes(1);
      expect(stdoutWrite.mock.calls[0][0]).toContain("bundling");
      expect(stdoutWrite.mock.calls[0][0]).toContain("src/index.ts");
    });

    it("should suppress in silent mode", () => {
      configureTerminal({ silent: true });
      displayBundleStart("src/index.ts");
      expect(stdoutWrite).not.toHaveBeenCalled();
    });
  });

  describe("displayBundleEnd", () => {
    it("should show completion message with timing", () => {
      displayBundleEnd("dist/bundle.js", 150);
      expect(stdoutWrite).toHaveBeenCalledTimes(1);
      expect(stdoutWrite.mock.calls[0][0]).toContain("created");
      expect(stdoutWrite.mock.calls[0][0]).toContain("dist/bundle.js");
      expect(stdoutWrite.mock.calls[0][0]).toContain("150");
    });

    it("should suppress in silent mode", () => {
      configureTerminal({ silent: true });
      displayBundleEnd("dist/bundle.js", 100);
      expect(stdoutWrite).not.toHaveBeenCalled();
    });
  });

  describe("displayTimings", () => {
    it("should display timings when perf is enabled", () => {
      configureTerminal({ perf: true });
      displayTimings({ parse: 50, transform: 100, generate: 75 });
      expect(stdoutWrite).toHaveBeenCalled();
      const output = stdoutWrite.mock.calls.map((c) => c[0]).join("");
      expect(output).toContain("Timings:");
      expect(output).toContain("parse");
      expect(output).toContain("50ms");
      expect(output).toContain("transform");
      expect(output).toContain("100ms");
    });

    it("should not display when perf is disabled", () => {
      configureTerminal({ perf: false });
      displayTimings({ parse: 50 });
      expect(stdoutWrite).not.toHaveBeenCalled();
    });

    it("should not display in silent mode", () => {
      configureTerminal({ perf: true, silent: true });
      displayTimings({ parse: 50 });
      expect(stdoutWrite).not.toHaveBeenCalled();
    });
  });
});
