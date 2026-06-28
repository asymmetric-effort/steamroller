/**
 * Tests for src/utils/errors.ts
 *
 * Tests createRollupError, createRollupWarning, generateCodeFrame,
 * and formatError with various inputs covering happy and sad paths.
 */
import { describe, it, expect } from "bun:test";
import {
  createRollupError,
  createRollupWarning,
  generateCodeFrame,
  formatError,
} from "../../../src/utils/errors.js";
import type { RollupLog } from "../../../src/utils/errors.js";

describe("createRollupError", () => {
  it("creates an error with code and message only", () => {
    const error = createRollupError("PARSE_ERROR", "Unexpected token");
    expect(error.code).toBe("PARSE_ERROR");
    expect(error.message).toBe("Unexpected token");
  });

  it("creates an error with all optional properties", () => {
    const error = createRollupError("PARSE_ERROR", "Unexpected token", {
      id: "src/index.ts",
      pos: 42,
      loc: { file: "src/index.ts", line: 3, column: 5 },
      frame: "> 3 | const x = ;",
      stack: "Error: ...",
      plugin: "typescript",
      pluginCode: "TS1005",
      url: "https://example.com/docs",
      exporter: "module-a",
      reexporter: "module-b",
    });
    expect(error.code).toBe("PARSE_ERROR");
    expect(error.message).toBe("Unexpected token");
    expect(error.id).toBe("src/index.ts");
    expect(error.pos).toBe(42);
    expect(error.loc).toEqual({ file: "src/index.ts", line: 3, column: 5 });
    expect(error.frame).toBe("> 3 | const x = ;");
    expect(error.stack).toBe("Error: ...");
    expect(error.plugin).toBe("typescript");
    expect(error.pluginCode).toBe("TS1005");
    expect(error.url).toBe("https://example.com/docs");
    expect(error.exporter).toBe("module-a");
    expect(error.reexporter).toBe("module-b");
  });

  it("creates an error with partial optional properties", () => {
    const error = createRollupError("FILE_NOT_FOUND", "File missing", {
      id: "missing.js",
    });
    expect(error.code).toBe("FILE_NOT_FOUND");
    expect(error.id).toBe("missing.js");
    expect(error.plugin).toBeUndefined();
    expect(error.loc).toBeUndefined();
  });

  it("creates an error with loc missing file", () => {
    const error = createRollupError("PARSE_ERROR", "Bad syntax", {
      loc: { line: 1, column: 0 },
    });
    expect(error.loc?.file).toBeUndefined();
    expect(error.loc?.line).toBe(1);
    expect(error.loc?.column).toBe(0);
  });

  it("creates an error with empty string code and message", () => {
    const error = createRollupError("", "");
    expect(error.code).toBe("");
    expect(error.message).toBe("");
  });

  it("properties parameter overrides nothing when empty", () => {
    const error = createRollupError("TEST", "test message", {});
    expect(error.code).toBe("TEST");
    expect(error.message).toBe("test message");
  });
});

describe("createRollupWarning", () => {
  it("creates a warning with code and message only", () => {
    const warning = createRollupWarning(
      "CIRCULAR_DEPENDENCY",
      "Circular dependency detected",
    );
    expect(warning.code).toBe("CIRCULAR_DEPENDENCY");
    expect(warning.message).toBe("Circular dependency detected");
  });

  it("creates a warning with optional properties", () => {
    const warning = createRollupWarning(
      "UNUSED_EXTERNAL_IMPORT",
      "Unused import",
      {
        id: "src/utils.ts",
        plugin: "my-plugin",
      },
    );
    expect(warning.code).toBe("UNUSED_EXTERNAL_IMPORT");
    expect(warning.message).toBe("Unused import");
    expect(warning.id).toBe("src/utils.ts");
    expect(warning.plugin).toBe("my-plugin");
  });

  it("creates a warning with no extra properties", () => {
    const warning = createRollupWarning("EVAL", "Use of eval");
    expect(warning.code).toBe("EVAL");
    expect(warning.message).toBe("Use of eval");
    expect(warning.id).toBeUndefined();
    expect(warning.frame).toBeUndefined();
  });

  it("creates a warning with empty properties object", () => {
    const warning = createRollupWarning("EMPTY_BUNDLE", "Empty bundle", {});
    expect(warning.code).toBe("EMPTY_BUNDLE");
    expect(warning.message).toBe("Empty bundle");
  });

  it("has identical shape to createRollupError output", () => {
    const error = createRollupError("TEST", "msg", { id: "a.js" });
    const warning = createRollupWarning("TEST", "msg", { id: "a.js" });
    expect(Object.keys(error).sort()).toEqual(Object.keys(warning).sort());
    expect(error).toEqual(warning);
  });
});

describe("generateCodeFrame", () => {
  const sampleSource = [
    "import { foo } from 'bar';",
    "",
    "const x = 1;",
    "const y = foo(x);",
    "const z = x + y;",
    "",
    "export { z };",
  ].join("\n");

  it("generates a frame for a line in the middle of the source", () => {
    const frame = generateCodeFrame(sampleSource, 4, 10);
    expect(frame).toContain(">");
    expect(frame).toContain("^");
    expect(frame).toContain("const y = foo(x);");
  });

  it("highlights the correct column with ^", () => {
    const frame = generateCodeFrame(sampleSource, 3, 6);
    const frameLines = frame.split("\n");
    const pointerLine = frameLines.find((l) => l.includes("^"));
    expect(pointerLine).toBeDefined();
    // The ^ should be at column 6 (after the pipe and spaces)
    const pipeIndex = pointerLine!.indexOf("|");
    const afterPipe = pointerLine!.slice(pipeIndex + 1);
    const caretIndex = afterPipe.indexOf("^");
    // caret should be at position column + 1 (for the leading space after pipe)
    expect(caretIndex).toBe(7); // 1 space + 6 columns
  });

  it("handles the first line of source", () => {
    const frame = generateCodeFrame(sampleSource, 1, 0);
    expect(frame).toContain(">");
    expect(frame).toContain("import { foo } from 'bar';");
    // Should not try to show lines before line 1
    const frameLines = frame.split("\n");
    const markerLines = frameLines.filter((l) => l.startsWith(">"));
    expect(markerLines.length).toBe(1);
  });

  it("handles the last line of source", () => {
    const frame = generateCodeFrame(sampleSource, 7, 0);
    expect(frame).toContain(">");
    expect(frame).toContain("export { z };");
  });

  it("uses default context of 2 lines", () => {
    const frame = generateCodeFrame(sampleSource, 4, 0);
    const frameLines = frame.split("\n");
    // Line 4 is the target. Context 2 means lines 2-6 shown, plus pointer line
    // start = max(0, 4-1-2) = 1, end = min(7, 4+2) = 6
    // That's lines 2,3,4,5,6 (indices 1..5) = 5 lines + 1 pointer = 6
    expect(frameLines.length).toBe(6);
  });

  it("respects custom contextLines parameter", () => {
    const frame = generateCodeFrame(sampleSource, 4, 0, 1);
    const frameLines = frame.split("\n");
    // Context 1: lines 3,4,5 + pointer = 4 lines
    expect(frameLines.length).toBe(4);
  });

  it("handles contextLines of 0", () => {
    const frame = generateCodeFrame(sampleSource, 4, 0, 0);
    const frameLines = frame.split("\n");
    // Only the error line + pointer = 2 lines
    expect(frameLines.length).toBe(2);
  });

  it("handles a single-line source", () => {
    const frame = generateCodeFrame("const x = 1;", 1, 6);
    expect(frame).toContain(">");
    expect(frame).toContain("const x = 1;");
    expect(frame).toContain("^");
  });

  it("handles empty source", () => {
    const frame = generateCodeFrame("", 1, 0);
    expect(frame).toContain(">");
    expect(frame).toContain("^");
  });

  it("pads line numbers consistently", () => {
    const longSource = Array.from(
      { length: 100 },
      (_, i) => `line ${i + 1}`,
    ).join("\n");
    const frame = generateCodeFrame(longSource, 50, 0);
    // Line numbers should be padded to same width
    const frameLines = frame.split("\n");
    for (const fl of frameLines) {
      const match = fl.match(/[> ] +(\d+) \|/);
      if (match) {
        // All line numbers should have consistent padding
        expect(match[1].length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("marks only the error line with >", () => {
    const frame = generateCodeFrame(sampleSource, 3, 0);
    const frameLines = frame.split("\n");
    const markerLines = frameLines.filter((l) => l.startsWith(">"));
    expect(markerLines.length).toBe(1);
    expect(markerLines[0]).toContain("const x = 1;");
  });

  it("non-error lines start with a space", () => {
    const frame = generateCodeFrame(sampleSource, 4, 0);
    const frameLines = frame.split("\n");
    const nonPointerCodeLines = frameLines.filter(
      (l) => l.match(/\d+ \|/) && !l.startsWith(">"),
    );
    for (const cl of nonPointerCodeLines) {
      expect(cl.startsWith(" ")).toBe(true);
    }
  });
});

describe("formatError", () => {
  it("formats a minimal error with code and message", () => {
    const log: RollupLog = {
      code: "PARSE_ERROR",
      message: "Unexpected token",
    };
    const result = formatError(log);
    expect(result).toBe("(PARSE_ERROR) Unexpected token");
  });

  it("includes plugin name when present", () => {
    const log: RollupLog = {
      code: "PLUGIN_ERROR",
      message: "Plugin failed",
      plugin: "my-plugin",
    };
    const result = formatError(log);
    expect(result).toBe("[plugin my-plugin] (PLUGIN_ERROR) Plugin failed");
  });

  it("includes file id when present", () => {
    const log: RollupLog = {
      code: "FILE_NOT_FOUND",
      message: "Not found",
      id: "src/missing.ts",
    };
    const result = formatError(log);
    expect(result).toBe("(FILE_NOT_FOUND) Not found in src/missing.ts");
  });

  it("includes location when present", () => {
    const log: RollupLog = {
      code: "PARSE_ERROR",
      message: "Bad syntax",
      loc: { file: "index.ts", line: 10, column: 5 },
    };
    const result = formatError(log);
    expect(result).toBe("(PARSE_ERROR) Bad syntax at index.ts:10:5");
  });

  it("handles location without file", () => {
    const log: RollupLog = {
      code: "PARSE_ERROR",
      message: "Bad syntax",
      loc: { line: 10, column: 5 },
    };
    const result = formatError(log);
    expect(result).toBe("(PARSE_ERROR) Bad syntax at :10:5");
  });

  it("appends frame on a new line when present", () => {
    const log: RollupLog = {
      code: "PARSE_ERROR",
      message: "Unexpected token",
      frame: "> 3 | const x = ;\n      |           ^",
    };
    const result = formatError(log);
    expect(result).toContain("(PARSE_ERROR) Unexpected token");
    expect(result).toContain("\n");
    expect(result).toContain("> 3 | const x = ;");
  });

  it("combines all fields together", () => {
    const log: RollupLog = {
      code: "PLUGIN_ERROR",
      message: "Transform failed",
      plugin: "babel",
      id: "app.js",
      loc: { file: "app.js", line: 5, column: 12 },
      frame: "> 5 | badcode",
    };
    const result = formatError(log);
    expect(result).toContain("[plugin babel]");
    expect(result).toContain("(PLUGIN_ERROR)");
    expect(result).toContain("Transform failed");
    expect(result).toContain("in app.js");
    expect(result).toContain("at app.js:5:12");
    expect(result).toContain("\n> 5 | badcode");
  });

  it("handles empty code and message", () => {
    const log: RollupLog = { code: "", message: "" };
    const result = formatError(log);
    expect(result).toBe("() ");
  });

  it("does not include undefined optional fields in output", () => {
    const log: RollupLog = {
      code: "TEST",
      message: "test",
    };
    const result = formatError(log);
    expect(result).not.toContain("undefined");
    expect(result).not.toContain("null");
    expect(result).not.toContain("in ");
    expect(result).not.toContain("at ");
  });

  it("only appends newline and frame when frame is present", () => {
    const withoutFrame: RollupLog = {
      code: "TEST",
      message: "test",
    };
    const withFrame: RollupLog = {
      code: "TEST",
      message: "test",
      frame: "frame content",
    };
    expect(formatError(withoutFrame)).not.toContain("\n");
    expect(formatError(withFrame)).toContain("\n");
  });
});
