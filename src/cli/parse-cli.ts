/**
 * CLI argument parser that maps command-line flags to rollup-compatible
 * input and output options.
 *
 * @module cli/parse-cli
 */

import { parseArgs } from "../utils/arg-parser.js";
import type { InputOptions, OutputOptions } from "../types.js";

/** Result of CLI parsing containing input options, output options, and the command. */
export interface ParseCliResult {
  readonly inputOptions: Partial<InputOptions>;
  readonly outputOptions: Partial<OutputOptions>;
  readonly command: ParsedCommand;
}

/** Parsed command flags not directly mapped to rollup options. */
export interface ParsedCommand {
  readonly configFile: string | boolean;
  readonly watch: boolean;
  readonly silent: boolean;
  readonly perf: boolean;
  readonly failAfterWarnings: boolean;
  readonly filterLogs: ReadonlyArray<string>;
  readonly forceExit: boolean;
  readonly waitForBundleInput: boolean;
  readonly stdin: boolean;
  readonly environment: string;
  readonly validate: boolean;
  readonly analyze: boolean | "json" | "html" | "text";
}

/** Short flag aliases mapping to their full names. */
const ALIASES: Readonly<Record<string, string>> = {
  input: "i",
  "output.file": "o",
  "output.dir": "d",
  "output.format": "f",
  config: "c",
  watch: "w",
  sourcemap: "m",
  external: "e",
  globals: "g",
  name: "n",
};

/** Flags treated as booleans (no value consumed). */
const BOOLEAN_FLAGS: ReadonlyArray<string> = [
  "watch",
  "sourcemap",
  "perf",
  "failAfterWarnings",
  "forceExit",
  "waitForBundleInput",
  "stdin",
  "no-stdin",
  "silent",
  "validate",
];

/** Flags treated as strings. */
const STRING_FLAGS: ReadonlyArray<string> = [
  "input",
  "output.file",
  "output.dir",
  "output.format",
  "config",
  "name",
  "exports",
  "interop",
  "banner",
  "footer",
  "intro",
  "outro",
  "environment",
  "analyze",
];

/** Flags that accumulate into arrays. */
const ARRAY_FLAGS: ReadonlyArray<string> = [
  "plugin",
  "external",
  "globals",
  "filterLogs",
];

/**
 * Parse CLI arguments into structured rollup-compatible options.
 *
 * @param args - Raw command-line argument tokens
 * @returns Parsed input options, output options, and command flags
 */
export const parseCli = (args: ReadonlyArray<string>): ParseCliResult => {
  const parsed = parseArgs(args, {
    boolean: BOOLEAN_FLAGS,
    string: STRING_FLAGS,
    array: ARRAY_FLAGS,
    alias: ALIASES,
    default: {
      watch: false,
      silent: false,
      perf: false,
      failAfterWarnings: false,
      forceExit: false,
      waitForBundleInput: false,
      stdin: true,
      validate: false,
    },
  });

  const stdinEnabled =
    parsed["no-stdin"] === true ? false : (parsed["stdin"] as boolean);

  const configValue = parsed["config"];
  const configFile: string | boolean =
    configValue === "" || configValue === true
      ? true
      : typeof configValue === "string"
        ? configValue
        : false;

  const analyzeValue = parsed["analyze"];
  const analyze: boolean | "json" | "html" | "text" =
    analyzeValue === "json" ||
    analyzeValue === "html" ||
    analyzeValue === "text"
      ? analyzeValue
      : analyzeValue === true || analyzeValue === ""
        ? true
        : false;

  const command: ParsedCommand = {
    configFile,
    watch: parsed["watch"] as boolean,
    silent: parsed["silent"] as boolean,
    perf: parsed["perf"] as boolean,
    failAfterWarnings: parsed["failAfterWarnings"] as boolean,
    filterLogs: (parsed["filterLogs"] as ReadonlyArray<string>) ?? [],
    forceExit: parsed["forceExit"] as boolean,
    waitForBundleInput: parsed["waitForBundleInput"] as boolean,
    stdin: stdinEnabled,
    environment: (parsed["environment"] as string) ?? "",
    validate: parsed["validate"] as boolean,
    analyze,
  };

  const inputOptions: Partial<InputOptions> = {};
  const outputOptions: Partial<OutputOptions> = {};

  const inputValue = parsed["input"] ?? parsed["_"];
  if (typeof inputValue === "string" && inputValue !== "") {
    (inputOptions as Record<string, unknown>)["input"] = inputValue;
  } else if (
    Array.isArray(inputValue) &&
    inputValue.length > 0 &&
    inputValue[0] !== ""
  ) {
    (inputOptions as Record<string, unknown>)["input"] = inputValue as string[];
  }

  if (parsed["external"]) {
    (inputOptions as Record<string, unknown>)["external"] = parsed[
      "external"
    ] as string[];
  }

  if (parsed["perf"] === true) {
    (inputOptions as Record<string, unknown>)["perf"] = true;
  }

  const output = parsed["output"] as Record<string, unknown> | undefined;
  if (output && typeof output === "object") {
    if (output["file"]) {
      (outputOptions as Record<string, unknown>)["file"] = output[
        "file"
      ] as string;
    }
    if (output["dir"]) {
      (outputOptions as Record<string, unknown>)["dir"] = output[
        "dir"
      ] as string;
    }
    if (output["format"]) {
      (outputOptions as Record<string, unknown>)["format"] = output[
        "format"
      ] as string;
    }
  }

  if (parsed["sourcemap"] === true) {
    (outputOptions as Record<string, unknown>)["sourcemap"] = true;
  }

  if (parsed["name"]) {
    (outputOptions as Record<string, unknown>)["name"] = parsed[
      "name"
    ] as string;
  }

  if (parsed["exports"]) {
    (outputOptions as Record<string, unknown>)["exports"] = parsed[
      "exports"
    ] as string;
  }

  if (parsed["globals"]) {
    const globalsArray = parsed["globals"] as string[];
    const globalsObj: Record<string, string> = {};
    for (const g of globalsArray) {
      const eqIdx = g.indexOf(":");
      if (eqIdx !== -1) {
        globalsObj[g.slice(0, eqIdx)] = g.slice(eqIdx + 1);
      }
    }
    if (Object.keys(globalsObj).length > 0) {
      (outputOptions as Record<string, unknown>)["globals"] = globalsObj;
    }
  }

  if (parsed["banner"]) {
    (outputOptions as Record<string, unknown>)["banner"] = parsed[
      "banner"
    ] as string;
  }
  if (parsed["footer"]) {
    (outputOptions as Record<string, unknown>)["footer"] = parsed[
      "footer"
    ] as string;
  }
  if (parsed["intro"]) {
    (outputOptions as Record<string, unknown>)["intro"] = parsed[
      "intro"
    ] as string;
  }
  if (parsed["outro"]) {
    (outputOptions as Record<string, unknown>)["outro"] = parsed[
      "outro"
    ] as string;
  }
  if (parsed["interop"]) {
    (outputOptions as Record<string, unknown>)["interop"] = parsed[
      "interop"
    ] as string;
  }

  return { inputOptions, outputOptions, command };
};
