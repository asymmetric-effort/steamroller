/**
 * @module config/validate
 * @description Validates input and output options, detecting unknown options,
 * deprecated options, and invalid combinations. Supports strictDeprecations
 * mode that throws instead of warning.
 */

import type { InputOptions, OutputOptions, RollupLog } from "../types.js";
import {
  UNKNOWN_OPTION,
  INVALID_OPTION,
  DEPRECATED_FEATURE,
} from "../utils/error-codes.js";

/** Known valid input option keys. */
const KNOWN_INPUT_OPTIONS: ReadonlyArray<string> = [
  "cache",
  "context",
  "experimentalCacheExpiry",
  "experimentalLogSideEffects",
  "external",
  "input",
  "logLevel",
  "makeAbsoluteExternalsRelative",
  "maxParallelFileOps",
  "moduleContext",
  "onLog",
  "onwarn",
  "perf",
  "plugins",
  "preserveEntrySignatures",
  "preserveSymlinks",
  "shimMissingExports",
  "strictDeprecations",
  "treeshake",
];

/** Known valid output option keys. */
const KNOWN_OUTPUT_OPTIONS: ReadonlyArray<string> = [
  "amd",
  "assetFileNames",
  "banner",
  "chunkFileNames",
  "compact",
  "dir",
  "dts",
  "dynamicImportInCjs",
  "entryFileNames",
  "esModule",
  "experimentalMinChunkSize",
  "exports",
  "extend",
  "externalImportAttributes",
  "externalLiveBindings",
  "file",
  "footer",
  "format",
  "freeze",
  "generatedCode",
  "globals",
  "hashCharacters",
  "hoistTransitiveImports",
  "indent",
  "inlineDynamicImports",
  "interop",
  "intro",
  "manualChunks",
  "minifyInternalExports",
  "name",
  "noConflict",
  "outro",
  "paths",
  "plugins",
  "preserveModules",
  "preserveModulesRoot",
  "reexportProtoFromExternal",
  "sanitizeFileName",
  "sourcemap",
  "sourcemapBaseUrl",
  "sourcemapDebugIds",
  "sourcemapExcludeSources",
  "sourcemapFile",
  "sourcemapFileNames",
  "sourcemapIgnoreList",
  "sourcemapPathTransform",
  "strict",
  "systemNullSetters",
  "validate",
  "virtualDirname",
];

/** Deprecated input option mappings: key -> migration message. */
const DEPRECATED_INPUT_OPTIONS: Readonly<Record<string, string>> = {
  acorn: "Acorn is no longer used. The built-in parser handles all parsing.",
  acornInjectPlugins:
    "Acorn is no longer used. The built-in parser handles all parsing.",
  inlineDynamicImports: 'Move "inlineDynamicImports" to the output options.',
  manualChunks: 'Move "manualChunks" to the output options.',
  preserveModules: 'Move "preserveModules" to the output options.',
};

/** Deprecated output option mappings: key -> migration message. */
const DEPRECATED_OUTPUT_OPTIONS: Readonly<Record<string, string>> = {
  namespaceToStringTag:
    'Use "generatedCode.symbols" instead of "namespaceToStringTag".',
  preferConst: 'Use "generatedCode.constBindings" instead of "preferConst".',
  externalImportAssertions:
    'Use "externalImportAttributes" instead of "externalImportAssertions".',
};

/**
 * Create a warning log entry.
 *
 * @param code - Warning code.
 * @param message - Warning message.
 * @returns A RollupLog entry.
 */
const createWarning = (code: string, message: string): RollupLog => ({
  code,
  message,
});

/**
 * Validate input options for unknown and deprecated keys.
 *
 * @param options - The raw input options to validate.
 * @returns Array of warning logs.
 * @throws Error if strictDeprecations is enabled and deprecated options are found.
 */
export const validateInputOptions = (
  options: InputOptions,
): ReadonlyArray<RollupLog> => {
  const warnings: Array<RollupLog> = [];
  const strict = options.strictDeprecations === true;
  const keys = Object.keys(options);
  const knownSet = new Set(KNOWN_INPUT_OPTIONS);
  const deprecatedKeys = Object.keys(DEPRECATED_INPUT_OPTIONS);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    // Check deprecated first
    if (deprecatedKeys.includes(key)) {
      const message = `The "${key}" option is deprecated. ${DEPRECATED_INPUT_OPTIONS[key]}`;
      if (strict) {
        throw Object.assign(new Error(message), {
          code: DEPRECATED_FEATURE,
        });
      }
      warnings.push(createWarning(DEPRECATED_FEATURE, message));
      continue;
    }
    // Check unknown
    if (!knownSet.has(key)) {
      warnings.push(
        createWarning(
          UNKNOWN_OPTION,
          `Unknown input option: "${key}". Allowed options: ${KNOWN_INPUT_OPTIONS.join(", ")}`,
        ),
      );
    }
  }

  return warnings;
};

/**
 * Validate output options for unknown and deprecated keys.
 *
 * @param options - The raw output options to validate.
 * @param strictDeprecations - Whether to throw on deprecated options.
 * @returns Array of warning logs.
 * @throws Error if strictDeprecations is enabled and deprecated options are found.
 */
export const validateOutputOptions = (
  options: OutputOptions,
  strictDeprecations = false,
): ReadonlyArray<RollupLog> => {
  const warnings: Array<RollupLog> = [];
  const keys = Object.keys(options);
  const knownSet = new Set(KNOWN_OUTPUT_OPTIONS);
  const deprecatedKeys = Object.keys(DEPRECATED_OUTPUT_OPTIONS);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    // Check deprecated first
    if (deprecatedKeys.includes(key)) {
      const message = `The "${key}" option is deprecated. ${DEPRECATED_OUTPUT_OPTIONS[key]}`;
      if (strictDeprecations) {
        throw Object.assign(new Error(message), {
          code: DEPRECATED_FEATURE,
        });
      }
      warnings.push(createWarning(DEPRECATED_FEATURE, message));
      continue;
    }
    // Check unknown
    if (!knownSet.has(key)) {
      warnings.push(
        createWarning(
          UNKNOWN_OPTION,
          `Unknown output option: "${key}". Allowed options: ${KNOWN_OUTPUT_OPTIONS.join(", ")}`,
        ),
      );
    }
  }

  return warnings;
};
