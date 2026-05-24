/**
 * @module module/synthetic-exports
 * @description Implements syntheticNamedExports support for CommonJS interop.
 * Provides fallback namespace resolution, validation, and code generation
 * helpers for modules that expose named exports synthetically through a
 * namespace object (typically the default export).
 */

import {
  EXTERNAL_SYNTHETIC_EXPORTS,
  SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT,
} from "../utils/error-codes.js";

/** Describes a synthetic export resolution result. */
export interface SyntheticExportResolution {
  readonly type: "synthetic";
  readonly fallbackExport: string;
  readonly requestedName: string;
}

/** Validation error returned when syntheticNamedExports is misconfigured. */
export interface SyntheticExportValidationError {
  readonly code: string;
  readonly message: string;
}

/**
 * Determine the fallback export name from a syntheticNamedExports option.
 *
 * @param syntheticNamedExports - The module's syntheticNamedExports config.
 * @returns The fallback export name, or null if synthetic exports are disabled.
 */
export const getFallbackExportName = (
  syntheticNamedExports: boolean | string,
): string | null => {
  if (syntheticNamedExports === true) {
    return "default";
  }
  if (typeof syntheticNamedExports === "string") {
    return syntheticNamedExports;
  }
  return null;
};

/**
 * Check if a named import can be resolved synthetically.
 *
 * When a module has syntheticNamedExports enabled and does not explicitly
 * export the requested name, this function determines whether the import
 * can be fulfilled by accessing it as a property of the fallback export.
 *
 * @param requestedName - The binding name being imported.
 * @param moduleExports - The list of actual exports from the module.
 * @param syntheticNamedExports - The module's syntheticNamedExports config.
 * @returns A SyntheticExportResolution if synthetic resolution applies, or null.
 */
export const resolveSyntheticExport = (
  requestedName: string,
  moduleExports: ReadonlyArray<string>,
  syntheticNamedExports: boolean | string,
): SyntheticExportResolution | null => {
  // If the module actually exports this name, no synthetic resolution needed
  if (moduleExports.includes(requestedName)) {
    return null;
  }

  const fallback = getFallbackExportName(syntheticNamedExports);
  if (fallback === null) {
    return null;
  }

  // The fallback export must exist in the module
  if (!moduleExports.includes(fallback)) {
    return null;
  }

  return { type: "synthetic", fallbackExport: fallback, requestedName };
};

/**
 * Validate syntheticNamedExports configuration for a module.
 *
 * Returns a validation error if the configuration is invalid (e.g., an
 * external module with synthetic exports, or a missing fallback export).
 *
 * @param moduleId - The module identifier for error messages.
 * @param syntheticNamedExports - The module's syntheticNamedExports config.
 * @param moduleExports - The list of actual exports from the module.
 * @param isExternal - Whether the module is external.
 * @returns A validation error object, or null if configuration is valid.
 */
export const validateSyntheticExports = (
  moduleId: string,
  syntheticNamedExports: boolean | string,
  moduleExports: ReadonlyArray<string>,
  isExternal: boolean,
): SyntheticExportValidationError | null => {
  if (!syntheticNamedExports) {
    return null;
  }

  if (isExternal) {
    return {
      code: EXTERNAL_SYNTHETIC_EXPORTS,
      message: `External module '${moduleId}' cannot have syntheticNamedExports`,
    };
  }

  const fallback = getFallbackExportName(syntheticNamedExports);
  if (fallback !== null && !moduleExports.includes(fallback)) {
    return {
      code: SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT,
      message: `Module '${moduleId}' has syntheticNamedExports set to '${fallback}' but does not export '${fallback}'`,
    };
  }

  return null;
};

/**
 * Generate the code transformation for a synthetic import access.
 *
 * For a module with syntheticNamedExports, an import like:
 *   import { foo } from './mod'
 * becomes a property access on the fallback binding:
 *   const foo = mod_default.foo
 *
 * @param fallbackBinding - The local binding name for the fallback export.
 * @param requestedName - The originally requested import name.
 * @returns The property access expression string.
 */
export const generateSyntheticAccess = (
  fallbackBinding: string,
  requestedName: string,
): string => {
  return `${fallbackBinding}.${requestedName}`;
};
