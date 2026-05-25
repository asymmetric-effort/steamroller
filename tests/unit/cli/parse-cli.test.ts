/**
 * Unit tests for CLI argument parser.
 *
 * @module tests/unit/cli/parse-cli
 */

import { describe, it, expect } from "vitest";
import { parseCli } from "../../../src/cli/parse-cli.js";

describe("parseCli", () => {
  it("should return default values with no arguments", () => {
    const result = parseCli([]);
    expect(result.command.watch).toBe(false);
    expect(result.command.silent).toBe(false);
    expect(result.command.perf).toBe(false);
    expect(result.command.failAfterWarnings).toBe(false);
    expect(result.command.forceExit).toBe(false);
    expect(result.command.waitForBundleInput).toBe(false);
    expect(result.command.stdin).toBe(true);
    expect(result.command.validate).toBe(false);
    expect(result.command.configFile).toBe(false);
  });

  it("should parse --input flag", () => {
    const result = parseCli(["--input", "src/index.ts"]);
    expect(result.inputOptions.input).toBe("src/index.ts");
  });

  it("should parse -i short alias for input", () => {
    const result = parseCli(["-i", "src/main.ts"]);
    expect(result.inputOptions.input).toBe("src/main.ts");
  });

  it("should parse positional arguments as input", () => {
    const result = parseCli(["src/entry.ts"]);
    expect(result.inputOptions.input).toEqual(["src/entry.ts"]);
  });

  it("should parse --output.file flag", () => {
    const result = parseCli(["--output.file", "dist/bundle.js"]);
    expect(result.outputOptions.file).toBe("dist/bundle.js");
  });

  it("should parse -o short alias for output.file", () => {
    const result = parseCli(["-o", "dist/out.js"]);
    expect(result.outputOptions.file).toBe("dist/out.js");
  });

  it("should parse --output.dir flag", () => {
    const result = parseCli(["--output.dir", "dist"]);
    expect(result.outputOptions.dir).toBe("dist");
  });

  it("should parse -d short alias for output.dir", () => {
    const result = parseCli(["-d", "build"]);
    expect(result.outputOptions.dir).toBe("build");
  });

  it("should parse --output.format flag", () => {
    const result = parseCli(["--output.format", "esm"]);
    expect(result.outputOptions.format).toBe("esm");
  });

  it("should parse -f short alias for format", () => {
    const result = parseCli(["-f", "cjs"]);
    expect(result.outputOptions.format).toBe("cjs");
  });

  it("should parse --config flag as true when bare", () => {
    const result = parseCli(["--config"]);
    expect(result.command.configFile).toBe(true);
  });

  it("should parse --config with path", () => {
    const result = parseCli(["--config", "my.config.js"]);
    expect(result.command.configFile).toBe("my.config.js");
  });

  it("should parse -c short alias for config", () => {
    const result = parseCli(["-c"]);
    expect(result.command.configFile).toBe(true);
  });

  it("should parse --watch flag", () => {
    const result = parseCli(["--watch"]);
    expect(result.command.watch).toBe(true);
  });

  it("should parse -w short alias for watch", () => {
    const result = parseCli(["-w"]);
    expect(result.command.watch).toBe(true);
  });

  it("should parse --sourcemap flag", () => {
    const result = parseCli(["--sourcemap"]);
    expect(result.outputOptions.sourcemap).toBe(true);
  });

  it("should parse -m short alias for sourcemap", () => {
    const result = parseCli(["-m"]);
    expect(result.outputOptions.sourcemap).toBe(true);
  });

  it("should parse --perf flag", () => {
    const result = parseCli(["--perf"]);
    expect(result.command.perf).toBe(true);
    expect(result.inputOptions.perf).toBe(true);
  });

  it("should parse --external flag with comma-separated values", () => {
    const result = parseCli(["--external", "lodash,react"]);
    expect(result.inputOptions.external).toEqual(["lodash", "react"]);
  });

  it("should parse -e short alias for external", () => {
    const result = parseCli(["-e", "fs"]);
    expect(result.inputOptions.external).toEqual(["fs"]);
  });

  it("should parse --globals flag", () => {
    const result = parseCli(["--globals", "jquery:$"]);
    expect(result.outputOptions.globals).toEqual({ jquery: "$" });
  });

  it("should parse -g short alias for globals", () => {
    const result = parseCli(["-g", "react:React"]);
    expect(result.outputOptions.globals).toEqual({ react: "React" });
  });

  it("should parse --name flag", () => {
    const result = parseCli(["--name", "MyBundle"]);
    expect(result.outputOptions.name).toBe("MyBundle");
  });

  it("should parse -n short alias for name", () => {
    const result = parseCli(["-n", "Lib"]);
    expect(result.outputOptions.name).toBe("Lib");
  });

  it("should parse --exports flag", () => {
    const result = parseCli(["--exports", "named"]);
    expect(result.outputOptions.exports).toBe("named");
  });

  it("should parse --interop flag", () => {
    const result = parseCli(["--interop", "auto"]);
    expect(result.outputOptions.interop).toBe("auto");
  });

  it("should parse --banner flag", () => {
    const result = parseCli(["--banner", "/* banner */"]);
    expect(result.outputOptions.banner).toBe("/* banner */");
  });

  it("should parse --footer flag", () => {
    const result = parseCli(["--footer", "/* footer */"]);
    expect(result.outputOptions.footer).toBe("/* footer */");
  });

  it("should parse --intro flag", () => {
    const result = parseCli(["--intro", "var x = 1;"]);
    expect(result.outputOptions.intro).toBe("var x = 1;");
  });

  it("should parse --outro flag", () => {
    const result = parseCli(["--outro", "console.log('done');"]);
    expect(result.outputOptions.outro).toBe("console.log('done');");
  });

  it("should parse --environment flag", () => {
    const result = parseCli(["--environment", "NODE_ENV:production"]);
    expect(result.command.environment).toBe("NODE_ENV:production");
  });

  it("should parse --silent flag", () => {
    const result = parseCli(["--silent"]);
    expect(result.command.silent).toBe(true);
  });

  it("should parse --failAfterWarnings flag", () => {
    const result = parseCli(["--failAfterWarnings"]);
    expect(result.command.failAfterWarnings).toBe(true);
  });

  it("should parse --filterLogs flag", () => {
    const result = parseCli(["--filterLogs", "code:CIRCULAR_DEPENDENCY"]);
    expect(result.command.filterLogs).toEqual(["code:CIRCULAR_DEPENDENCY"]);
  });

  it("should parse --forceExit flag", () => {
    const result = parseCli(["--forceExit"]);
    expect(result.command.forceExit).toBe(true);
  });

  it("should parse --waitForBundleInput flag", () => {
    const result = parseCli(["--waitForBundleInput"]);
    expect(result.command.waitForBundleInput).toBe(true);
  });

  it("should parse --no-stdin flag", () => {
    const result = parseCli(["--no-stdin"]);
    expect(result.command.stdin).toBe(false);
  });

  it("should parse --validate flag", () => {
    const result = parseCli(["--validate"]);
    expect(result.command.validate).toBe(true);
  });

  it("should handle combined flags", () => {
    const result = parseCli([
      "-i",
      "src/index.ts",
      "-o",
      "dist/bundle.js",
      "-f",
      "esm",
      "-m",
      "-w",
    ]);
    expect(result.inputOptions.input).toBe("src/index.ts");
    expect(result.outputOptions.file).toBe("dist/bundle.js");
    expect(result.outputOptions.format).toBe("esm");
    expect(result.outputOptions.sourcemap).toBe(true);
    expect(result.command.watch).toBe(true);
  });

  it("should handle multiple --plugin flags", () => {
    const result = parseCli(["--plugin", "json", "--plugin", "commonjs"]);
    expect(result.command.filterLogs).toBeDefined();
  });

  it("should handle multiple globals entries", () => {
    const result = parseCli([
      "--globals",
      "jquery:$",
      "--globals",
      "react:React",
    ]);
    expect(result.outputOptions.globals).toEqual({
      jquery: "$",
      react: "React",
    });
  });

  it("should not set input when positional args are empty", () => {
    const result = parseCli(["--silent"]);
    expect(result.inputOptions.input).toBeUndefined();
  });
});
