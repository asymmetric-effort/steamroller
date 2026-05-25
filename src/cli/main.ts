#!/usr/bin/env node
/**
 * CLI entry point for steamroller.
 * Handles argument parsing, config loading, watch mode, and build execution.
 *
 * @module cli/main
 */

import { parseCli } from "./parse-cli.js";
import { resolveConfigPath, loadConfigFile } from "./config-loader.js";
import { rollup } from "../rollup.js";
import { watch } from "../watch-entry.js";
import { VERSION } from "../version.js";
import type { RollupOptions } from "../types.js";

/**
 * Print usage help to stdout.
 */
export const printHelp = (): void => {
  const helpText = `steamroller v${VERSION}

Usage: steamroller [options]

Options:
  -i, --input <file>      Input file
  -o, --output.file <f>   Output file
  -d, --output.dir <dir>  Output directory
  -f, --format <fmt>      Output format (es, cjs, iife, umd, amd, system)
  -c, --config [file]     Config file (default: rollup.config.js)
  -w, --watch             Watch mode
  -m, --sourcemap         Generate source maps
  --name <name>           Name for IIFE/UMD
  --globals <pairs>       Global variable names (e.g., jquery:jQuery)
  --external <ids>        External module IDs
  --silent                Suppress output
  --version               Show version
  --help                  Show help
`;
  process.stdout.write(helpText);
};

/**
 * Print version string to stdout.
 */
export const printVersion = (): void => {
  process.stdout.write(`steamroller v${VERSION}\n`);
};

/**
 * Main CLI execution logic.
 * Parses arguments, loads config if specified, and runs build or watch mode.
 */
export const run = async (): Promise<void> => {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    printVersion();
    process.exit(0);
  }

  const parsed = parseCli(args);

  let configs: ReadonlyArray<RollupOptions> = [
    { ...parsed.inputOptions, output: parsed.outputOptions },
  ];

  if (parsed.command.configFile !== false) {
    const configPath = await resolveConfigPath(parsed.command, process.cwd());
    if (configPath) {
      const loaded = await loadConfigFile(configPath, {
        watch: parsed.command.watch,
        silent: parsed.command.silent,
        perf: parsed.command.perf,
        environment: parsed.command.environment,
      });
      configs = loaded;
    }
  }

  if (parsed.command.watch) {
    const watcher = watch(configs);
    watcher.on("event", (event) => {
      if (event.code === "BUNDLE_END") {
        const output = event.output ? event.output.join(", ") : "bundle";
        const duration = event.duration ?? 0;
        process.stdout.write(`created ${output} in ${duration}ms\n`);
      }
      if (event.code === "ERROR") {
        const errorMsg = event.error?.message ?? "Unknown error";
        process.stderr.write(`${errorMsg}\n`);
      }
    });
    return;
  }

  for (let i = 0; i < configs.length; i++) {
    const config = configs[i];
    const start = Date.now();
    const build = await rollup(config);
    const rawOutput = config.output;
    const outputOpts = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;
    const output = await build.write(outputOpts ?? {});
    const duration = Date.now() - start;
    const fileName = output.output[0]?.fileName ?? "bundle";
    process.stdout.write(`created ${fileName} in ${duration}ms\n`);
    await build.close();
  }
};

/**
 * Handle fatal errors from the CLI run, writing message to stderr and exiting.
 *
 * @param error - The caught error value
 */
export const handleError = (error: unknown): void => {
  const msg = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
};

run().catch(handleError);
