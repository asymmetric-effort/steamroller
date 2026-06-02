/**
 * Configuration file loader supporting .js, .mjs, and .cjs config files.
 * Loads rollup config and normalizes it to an array of RollupOptions.
 *
 * @module cli/config-loader
 */

import { stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import type { RollupOptions } from "../types.js";
import type { ParsedCommand } from "./parse-cli.js";
import { INVALID_OPTION, MISSING_CONFIG } from "../utils/error-codes.js";

/** Supported config file extensions in search priority order. */
const CONFIG_EXTENSIONS: ReadonlyArray<string> = [".mjs", ".js", ".cjs", ".ts"];

/** Default config file base name. */
const CONFIG_BASE_NAME = "rollup.config";

/**
 * Check if a file exists at the given path.
 *
 * @param filePath - Absolute path to check
 * @returns Whether the file exists
 */
const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
};

/**
 * Search for a config file in the current working directory.
 * Checks rollup.config.{mjs,js,cjs,ts} in order.
 *
 * @param cwd - Directory to search in
 * @returns Resolved path or null if not found
 */
export const findConfigFile = async (cwd: string): Promise<string | null> => {
  for (const ext of CONFIG_EXTENSIONS) {
    const candidate = resolve(cwd, `${CONFIG_BASE_NAME}${ext}`);
    const exists = await fileExists(candidate);
    if (exists) {
      return candidate;
    }
  }
  return null;
};

/**
 * Resolve the config file path based on command-line arguments.
 *
 * @param command - Parsed command containing configFile setting
 * @param cwd - Working directory for relative resolution
 * @returns Resolved absolute path or null
 */
export const resolveConfigPath = async (
  command: Pick<ParsedCommand, "configFile">,
  cwd: string,
): Promise<string | null> => {
  if (command.configFile === false) {
    return null;
  }
  if (typeof command.configFile === "string") {
    return resolve(cwd, command.configFile);
  }
  /* configFile === true means search default locations */
  return findConfigFile(cwd);
};

/**
 * Normalize a config export value to an array of RollupOptions.
 * Config can export: an object, an array, or a function returning either.
 *
 * @param configExport - The raw export from the config file
 * @param commandLineArgs - Command-line arguments passed to function configs
 * @returns Array of RollupOptions
 */
export const normalizeConfig = async (
  configExport: unknown,
  commandLineArgs: Record<string, unknown>,
): Promise<ReadonlyArray<RollupOptions>> => {
  const resolved =
    typeof configExport === "function"
      ? await (configExport as (args: Record<string, unknown>) => unknown)(
          commandLineArgs,
        )
      : configExport;

  if (Array.isArray(resolved)) {
    return resolved as RollupOptions[];
  }
  if (resolved && typeof resolved === "object") {
    return [resolved as RollupOptions];
  }
  return [];
};

/**
 * Load and parse a rollup configuration file.
 * Supports .js and .mjs via dynamic import.
 * TypeScript (.ts) configs require tsx or ts-node in the environment.
 *
 * @param configPath - Absolute path to the config file
 * @param commandLineArgs - CLI arguments to pass to function-style configs
 * @returns Array of normalized RollupOptions
 * @throws If the config file cannot be loaded or has an unsupported extension
 */
export const loadConfigFile = async (
  configPath: string,
  commandLineArgs: Record<string, unknown> = {},
): Promise<ReadonlyArray<RollupOptions>> => {
  const ext = extname(configPath);
  const supportedExts = new Set([".js", ".mjs", ".cjs", ".ts"]);

  if (!supportedExts.has(ext)) {
    throw Object.assign(
      new Error(
        `Unsupported config file extension "${ext}". ` +
          `Supported: ${CONFIG_EXTENSIONS.join(", ")}`,
      ),
      { code: INVALID_OPTION },
    );
  }

  const exists = await fileExists(configPath);
  if (!exists) {
    throw Object.assign(new Error(`Config file not found: ${configPath}`), {
      code: MISSING_CONFIG,
    });
  }

  /* Use file:// URL for cross-platform dynamic import compatibility */
  const fileUrl = new URL(`file://${configPath}`);
  const module = (await import(fileUrl.href)) as Record<string, unknown>;

  /* Support both default and named "default" export */
  const configExport = module["default"] ?? module;

  return normalizeConfig(configExport, commandLineArgs);
};
