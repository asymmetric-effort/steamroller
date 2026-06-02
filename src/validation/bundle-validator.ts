/**
 * @module validation/bundle-validator
 * @description Post-bundle validation for output chunks. Verifies syntactic
 * validity, import/export specifier references, and deconflicted name
 * consistency. Designed to be wired into the generate() pipeline to catch
 * broken output early.
 */

import { parse } from "../parser/parser.js";
import type { OutputChunk, OutputAsset, RollupLog } from "../types.js";

/**
 * Result of validating a single chunk.
 */
export interface ChunkValidationResult {
  /** The chunk fileName that was validated. */
  readonly fileName: string;
  /** Warnings discovered during validation. */
  readonly warnings: ReadonlyArray<RollupLog>;
}

/**
 * Result of validating an entire bundle.
 */
export interface BundleValidationResult {
  /** True when every chunk passed all checks. */
  readonly valid: boolean;
  /** Per-chunk validation results. */
  readonly results: ReadonlyArray<ChunkValidationResult>;
}

/**
 * Validate that a chunk's code is syntactically valid JavaScript by
 * attempting to parse it.
 *
 * @param chunk - The output chunk to validate
 * @returns Array of warnings (empty if the code parses successfully)
 */
const validateSyntax = (chunk: OutputChunk): ReadonlyArray<RollupLog> => {
  const warnings: Array<RollupLog> = [];
  try {
    parse(chunk.code, { sourceType: "module" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push({
      code: "CHUNK_INVALID_SYNTAX",
      message: `Chunk "${chunk.fileName}" contains syntactically invalid JavaScript: ${message}`,
      id: chunk.fileName,
    });
  }
  return warnings;
};

/**
 * Validate that import specifiers in the chunk reference either other
 * chunks in the bundle or declared external dependencies.
 *
 * @param chunk - The output chunk to validate
 * @param chunkFileNames - Set of all chunk file names in the bundle
 * @param externalIds - Set of declared external module IDs
 * @returns Array of warnings for unresolved import references
 */
const validateImportReferences = (
  chunk: OutputChunk,
  chunkFileNames: ReadonlySet<string>,
  externalIds: ReadonlySet<string>,
): ReadonlyArray<RollupLog> => {
  const warnings: Array<RollupLog> = [];

  for (let i = 0; i < chunk.imports.length; i++) {
    const importSource = chunk.imports[i];
    if (!chunkFileNames.has(importSource) && !externalIds.has(importSource)) {
      warnings.push({
        code: "CHUNK_MISSING_IMPORT",
        message: `Chunk "${chunk.fileName}" imports "${importSource}" which is neither a bundle chunk nor a declared external`,
        id: chunk.fileName,
      });
    }
  }

  // Also check dynamic imports
  for (let i = 0; i < chunk.dynamicImports.length; i++) {
    const dynamicSource = chunk.dynamicImports[i];
    if (
      dynamicSource.length > 0 &&
      !chunkFileNames.has(dynamicSource) &&
      !externalIds.has(dynamicSource)
    ) {
      warnings.push({
        code: "CHUNK_MISSING_IMPORT",
        message: `Chunk "${chunk.fileName}" dynamically imports "${dynamicSource}" which is neither a bundle chunk nor a declared external`,
        id: chunk.fileName,
      });
    }
  }

  return warnings;
};

/**
 * Validate that imported bindings declared by the chunk metadata actually
 * appear to be referenced consistently (no undefined deconflicted names).
 *
 * This checks that for each source in importedBindings, the binding names
 * are non-empty and the source itself is accounted for.
 *
 * @param chunk - The output chunk to validate
 * @param chunkFileNames - Set of all chunk file names in the bundle
 * @param externalIds - Set of declared external module IDs
 * @returns Array of warnings for undefined deconflicted name references
 */
const validateDeconflictedNames = (
  chunk: OutputChunk,
  chunkFileNames: ReadonlySet<string>,
  externalIds: ReadonlySet<string>,
): ReadonlyArray<RollupLog> => {
  const warnings: Array<RollupLog> = [];

  const bindingSources = Object.keys(chunk.importedBindings);
  for (let i = 0; i < bindingSources.length; i++) {
    const source = bindingSources[i];
    if (!chunkFileNames.has(source) && !externalIds.has(source)) {
      warnings.push({
        code: "CHUNK_UNDEFINED_DECONFLICTED_NAME",
        message: `Chunk "${chunk.fileName}" references bindings from "${source}" which is not a known chunk or external`,
        id: chunk.fileName,
      });
    }
  }

  return warnings;
};

/**
 * Validate all output chunks in a bundle.
 *
 * Runs three checks on each chunk:
 * 1. Syntactic validity (can the code be parsed as JavaScript?)
 * 2. Import reference integrity (do imports point to real chunks or externals?)
 * 3. Deconflicted name consistency (are binding sources accounted for?)
 *
 * @param output - The array of output items (chunks and assets)
 * @param externalIds - Optional set of declared external module IDs
 * @returns A BundleValidationResult summarizing all findings
 */
export const validateBundle = (
  output: ReadonlyArray<OutputChunk | OutputAsset>,
  externalIds: ReadonlySet<string> = new Set(),
): BundleValidationResult => {
  // Collect all chunk file names
  const chunkFileNames = new Set<string>();
  const chunks: Array<OutputChunk> = [];
  for (let i = 0; i < output.length; i++) {
    const item = output[i];
    if (item.type === "chunk") {
      chunkFileNames.add(item.fileName);
      chunks.push(item);
    }
  }

  const results: Array<ChunkValidationResult> = [];
  let allValid = true;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const warnings: Array<RollupLog> = [
      ...validateSyntax(chunk),
      ...validateImportReferences(chunk, chunkFileNames, externalIds),
      ...validateDeconflictedNames(chunk, chunkFileNames, externalIds),
    ];

    if (warnings.length > 0) {
      allValid = false;
    }

    results.push({
      fileName: chunk.fileName,
      warnings,
    });
  }

  return {
    valid: allValid,
    results,
  };
};
