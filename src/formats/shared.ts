/**
 * @module formats/shared
 * @description Cross-format concerns: strict mode handling, source map comments,
 * file extension mapping, and export mode detection.
 * Addresses issue #84.
 */

import type { ModuleFormat } from '../types.js';

/** Export mode determines how exports are rendered in the output. */
export type ExportMode = 'named' | 'default' | 'none' | 'auto';

/** Binding representing an imported identifier. */
export interface ImportBinding {
  readonly source: string;
  readonly imported: string;
  readonly local: string;
}

/** Binding representing an exported identifier. */
export interface ExportBinding {
  readonly exported: string;
  readonly local: string;
}

/** Options passed to format wrappers for code generation. */
export interface FormatOptions {
  readonly name?: string;
  readonly exports: ExportMode;
  readonly strict?: boolean;
  readonly extend?: boolean;
  readonly globals?: Readonly<Record<string, string>>;
  readonly amd?: {
    readonly id?: string;
    readonly define?: string;
    readonly forceJsExtensionForImports?: boolean;
  };
  readonly systemNullSetters?: boolean;
  readonly compact?: boolean;
  readonly indent?: string;
  readonly externalImports?: ReadonlyArray<ImportBinding>;
  readonly exportBindings?: ReadonlyArray<ExportBinding>;
}

/** Interface that each format wrapper must implement. */
export interface FormatWrapper {
  readonly wrapChunk: (code: string, options: FormatOptions) => string;
  readonly getExternalImportCode: (bindings: ReadonlyArray<ImportBinding>) => string;
  readonly getExportCode: (bindings: ReadonlyArray<ExportBinding>) => string;
}

/**
 * Inserts 'use strict' directive at the top of code if not already present.
 */
export const insertStrictMode = (code: string): string => {
  const trimmed = code.trimStart();
  if (trimmed.startsWith("'use strict'") || trimmed.startsWith('"use strict"')) {
    return code;
  }
  return `'use strict';\n\n${code}`;
};

/**
 * Generates the source map comment for appending to output.
 * @param fileName - The source map file name
 * @param inline - Whether to use inline data URI format
 */
export const generateSourceMapComment = (
  fileName: string,
  inline: boolean = false,
): string => {
  if (inline) {
    return `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${fileName}`;
  }
  return `//# sourceMappingURL=${fileName}`;
};

/** Maps output format to the conventional file extension. */
export const getFileExtension = (format: ModuleFormat): string => {
  const extensionMap: Readonly<Record<ModuleFormat, string>> = {
    es: '.mjs',
    cjs: '.cjs',
    amd: '.js',
    iife: '.js',
    umd: '.js',
    system: '.js',
  };
  return extensionMap[format];
};

/**
 * Determines the export mode based on the exports array, format, and module name.
 * @param exports - The list of export names
 * @param format - The output format
 * @param name - The module name (required for IIFE/UMD with default exports)
 */
export const getExportMode = (
  exports: ReadonlyArray<string>,
  format: ModuleFormat,
  name?: string,
): ExportMode => {
  if (exports.length === 0) {
    return 'none';
  }

  const hasDefault = exports.includes('default');
  const hasNamed = exports.some((e) => e !== 'default');

  if (hasDefault && !hasNamed) {
    if ((format === 'iife' || format === 'umd') && name) {
      return 'default';
    }
    return 'default';
  }

  if (hasNamed && !hasDefault) {
    return 'named';
  }

  /* Both default and named exports present */
  return 'named';
};
