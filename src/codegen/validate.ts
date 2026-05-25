/**
 * @module codegen/validate
 * @description Output validation for generated code. When validate option is enabled,
 * parses the generated output back through our parser to verify correctness.
 */

import { parse } from "../parser/parser.js";

/**
 * Result of output validation.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

/**
 * Error code for validation failures.
 */
export const VALIDATION_ERROR = "VALIDATION_ERROR" as const;

/**
 * Structured validation error with code and details.
 */
export interface ValidationError {
  readonly code: typeof VALIDATION_ERROR;
  readonly message: string;
  readonly fileName: string;
}

/**
 * Validate generated output by parsing it back through our parser.
 * If parsing fails, returns an error with the parse failure details.
 *
 * @param code - The generated code to validate
 * @param fileName - The output file name (for error reporting)
 * @returns A validation result indicating success or failure with details
 */
export const validateOutput = (
  code: string,
  fileName: string,
): ValidationResult => {
  try {
    parse(code, { sourceType: "module" });
    return { valid: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? `${VALIDATION_ERROR} in ${fileName}: ${err.message}`
        : `${VALIDATION_ERROR} in ${fileName}: Unknown parse error`;
    return { valid: false, error: message };
  }
};

/**
 * Create a structured validation error object.
 *
 * @param message - The error message from the parser
 * @param fileName - The file name that failed validation
 * @returns A structured ValidationError object
 */
export const createValidationError = (
  message: string,
  fileName: string,
): ValidationError => {
  return {
    code: VALIDATION_ERROR,
    message: `${VALIDATION_ERROR} in ${fileName}: ${message}`,
    fileName,
  };
};
