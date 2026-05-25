/**
 * CLI module re-exports.
 *
 * @module cli
 */

export { parseCli } from "./parse-cli.js";
export type { ParseCliResult, ParsedCommand } from "./parse-cli.js";
export {
  loadConfigFile,
  findConfigFile,
  resolveConfigPath,
  normalizeConfig,
} from "./config-loader.js";
export {
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
} from "./terminal.js";
export type { TerminalConfig } from "./terminal.js";
export { getLogFilter, parseFilterPattern } from "./log-filter.js";
export {
  readStdin,
  handleForceExit,
  handleWaitForBundleInput,
  handleEnvironment,
} from "./stdin.js";
