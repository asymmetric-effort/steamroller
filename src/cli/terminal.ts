/**
 * Terminal output and logging utilities with color support,
 * silent mode, and structured warning formatting.
 *
 * @module cli/terminal
 */

import { bold, cyan, yellow, red, gray, green } from "../utils/colors.js";
import type { RollupLog } from "../types.js";

/** Terminal configuration controlling output behavior. */
export interface TerminalConfig {
  readonly silent: boolean;
  readonly perf: boolean;
}

/** Default terminal configuration. */
const DEFAULT_CONFIG: TerminalConfig = {
  silent: false,
  perf: false,
};

/** Active terminal configuration (mutable for runtime updates). */
const state: { config: TerminalConfig } = { config: DEFAULT_CONFIG };

/**
 * Configure terminal output behavior.
 *
 * @param config - Terminal configuration options
 */
export const configureTerminal = (config: Partial<TerminalConfig>): void => {
  state.config = { ...state.config, ...config };
};

/**
 * Get the current terminal configuration.
 */
export const getTerminalConfig = (): TerminalConfig => state.config;

/**
 * Log an informational message to stdout.
 *
 * @param message - Message to display
 */
export const logInfo = (message: string): void => {
  if (state.config.silent) {
    return;
  }
  process.stdout.write(`${cyan("INFO")} ${message}\n`);
};

/**
 * Log a warning message to stderr.
 *
 * @param message - Warning message to display
 */
export const logWarn = (message: string): void => {
  if (state.config.silent) {
    return;
  }
  process.stderr.write(`${yellow("WARN")} ${message}\n`);
};

/**
 * Log an error message to stderr.
 *
 * @param message - Error message to display
 */
export const logError = (message: string): void => {
  process.stderr.write(`${red("ERROR")} ${message}\n`);
};

/**
 * Format a RollupLog warning into a human-readable string.
 * Includes code, plugin, location, frame, and message.
 *
 * @param warning - The structured log/warning to format
 * @returns Formatted warning string
 */
export const formatWarning = (warning: RollupLog): string => {
  const parts: string[] = [];

  if (warning.plugin) {
    parts.push(`${gray(`(${warning.plugin})`)}`);
  }

  if (warning.code) {
    parts.push(bold(warning.code));
  }

  parts.push(warning.message);

  if (warning.id) {
    const locStr = warning.loc
      ? `:${warning.loc.line}:${warning.loc.column}`
      : "";
    parts.push(gray(`${warning.id}${locStr}`));
  }

  if (warning.frame) {
    parts.push(`\n${warning.frame}`);
  }

  return parts.join(" ");
};

/**
 * Display a structured warning to stderr.
 *
 * @param warning - The RollupLog warning entry
 */
export const displayWarning = (warning: RollupLog): void => {
  if (state.config.silent) {
    return;
  }
  process.stderr.write(`${yellow("WARN")} ${formatWarning(warning)}\n`);
};

/**
 * Display a bundling progress message.
 *
 * @param inputFiles - Input file names being bundled
 */
export const displayBundleStart = (inputFiles: string): void => {
  if (state.config.silent) {
    return;
  }
  process.stdout.write(`${cyan("bundling")} ${inputFiles}...\n`);
};

/**
 * Display a bundle completion message with timing.
 *
 * @param outputFile - Output file that was created
 * @param durationMs - Time taken in milliseconds
 */
export const displayBundleEnd = (
  outputFile: string,
  durationMs: number,
): void => {
  if (state.config.silent) {
    return;
  }
  process.stdout.write(
    `${green("created")} ${bold(outputFile)} in ${bold(String(durationMs))}ms\n`,
  );
};

/**
 * Display performance timing breakdown.
 *
 * @param timings - Map of timer names to durations in milliseconds
 */
export const displayTimings = (
  timings: Readonly<Record<string, number>>,
): void => {
  if (state.config.silent || !state.config.perf) {
    return;
  }
  process.stdout.write(`\n${bold("Timings:")}\n`);
  const keys = Object.keys(timings);
  for (const key of keys) {
    const duration = timings[key];
    process.stdout.write(`  ${key}: ${gray(`${duration}ms`)}\n`);
  }
};
