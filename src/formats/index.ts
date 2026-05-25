/**
 * @module formats
 * @description Barrel export and format dispatcher for all output format wrappers.
 * Provides a unified interface to select and use format-specific code generation.
 */

export type {
  ExportBinding,
  ExportMode,
  FormatOptions,
  FormatWrapper,
  ImportBinding,
} from "./shared.js";

export {
  generateSourceMapComment,
  getExportMode,
  getFileExtension,
  insertStrictMode,
} from "./shared.js";

export { esFormat } from "./es.js";
export {
  cjsFormat,
  getInteropHelper,
  getInteropNamespaceHelper,
} from "./cjs.js";
export { iifeFormat } from "./iife.js";
export { umdFormat } from "./umd.js";
export { amdFormat } from "./amd.js";
export { systemFormat } from "./system.js";

import { esFormat } from "./es.js";
import { cjsFormat } from "./cjs.js";
import { iifeFormat } from "./iife.js";
import { umdFormat } from "./umd.js";
import { amdFormat } from "./amd.js";
import { systemFormat } from "./system.js";
import type { FormatWrapper } from "./shared.js";

/**
 * Returns the appropriate format wrapper for the given format string.
 * @param format - The module format identifier
 * @returns The format wrapper or undefined if the format is unknown
 */
export const getFormatWrapper = (format: string): FormatWrapper | undefined => {
  switch (format) {
    case "es":
      return esFormat;
    case "cjs":
      return cjsFormat;
    case "iife":
      return iifeFormat;
    case "umd":
      return umdFormat;
    case "amd":
      return amdFormat;
    case "system":
      return systemFormat;
    default:
      return undefined;
  }
};
