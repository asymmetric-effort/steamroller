/**
 * @module validation/verify-imports
 * @description Post-build import specifier verification. Scans each output
 * chunk's generated code for import/require statements and verifies that
 * every specifier either references another chunk in the output, matches a
 * declared external module, or is a bare specifier that should be external.
 * Reports any dangling/broken import references.
 */

import type { OutputChunk, OutputAsset, RollupLog } from "../types.js";

/**
 * Regex patterns for detecting import/require specifiers in generated code.
 *
 * - ES static imports:  import ... from "specifier"
 * - ES dynamic imports: import("specifier")
 * - CJS require:        require("specifier")
 * - ES re-exports:      export ... from "specifier"
 */
const IMPORT_PATTERNS: ReadonlyArray<RegExp> = [
  // import ... from "specifier"  or  import "specifier"
  /(?:^|[\s;])import\s+(?:[\s\S]*?\s+from\s+)?(['"])(.+?)\1/gm,
  // export ... from "specifier"
  /(?:^|[\s;])export\s+(?:[\s\S]*?\s+from\s+)?(['"])(.+?)\1/gm,
  // import("specifier")
  /\bimport\(\s*(['"])(.+?)\1\s*\)/gm,
  // require("specifier")
  /\brequire\(\s*(['"])(.+?)\1\s*\)/gm,
];

/**
 * Determines whether a specifier is a bare specifier (a package name) rather
 * than a relative or absolute path. Bare specifiers do not start with ".",
 * "/", or a protocol scheme.
 *
 * @param specifier - The import specifier string
 * @returns true if the specifier is a bare module specifier
 */
const isBareSpecifier = (specifier: string): boolean => {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return false;
  }
  // Protocol-based specifiers like "node:fs" or "https://..." are not bare
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(specifier)) {
    return false;
  }
  return true;
};

/**
 * Result of verifying imports in a build output.
 */
export interface VerifyImportsResult {
  /** True when every import specifier in every chunk is accounted for. */
  readonly valid: boolean;
  /** Per-chunk list of warnings about dangling/broken import specifiers. */
  readonly warnings: ReadonlyArray<RollupLog>;
}

/**
 * Extract all import specifiers from a chunk's generated code by scanning
 * for import/require/export-from statements.
 *
 * @param code - The generated code string to scan
 * @returns Array of unique import specifier strings found in the code
 */
export const extractImportSpecifiers = (
  code: string,
): ReadonlyArray<string> => {
  const specifiers = new Set<string>();

  for (let i = 0; i < IMPORT_PATTERNS.length; i++) {
    // Create a new RegExp from the pattern to reset lastIndex
    const pattern = new RegExp(
      IMPORT_PATTERNS[i].source,
      IMPORT_PATTERNS[i].flags,
    );
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(code)) !== null) {
      const specifier = match[2];
      if (specifier.length > 0) {
        specifiers.add(specifier);
      }
    }
  }

  return Array.from(specifiers);
};

/**
 * Verify that all import specifiers in output chunks are valid references.
 *
 * For each chunk's generated code, this function:
 * 1. Extracts all import/require specifiers via regex scanning
 * 2. Checks each specifier against:
 *    a) Other chunk file names in the output (internal references)
 *    b) The declared externals set
 *    c) Whether it is a bare specifier (assumed external)
 * 3. Reports any specifier that does not match any of these categories
 *
 * @param output - Array of output chunks and assets from generate()
 * @param externals - Set or array of declared external module identifiers
 * @returns A VerifyImportsResult with validity flag and any warnings
 */
export const verifyBuild = (
  output: ReadonlyArray<OutputChunk | OutputAsset>,
  externals: ReadonlyArray<string> | ReadonlySet<string> = new Set(),
): VerifyImportsResult => {
  const externalSet = externals instanceof Set ? externals : new Set(externals);

  // Collect all chunk file names for internal reference resolution
  const chunkFileNames = new Set<string>();
  const chunks: Array<OutputChunk> = [];
  for (let i = 0; i < output.length; i++) {
    const item = output[i];
    if (item.type === "chunk") {
      chunkFileNames.add(item.fileName);
      chunks.push(item);
    }
  }

  const warnings: Array<RollupLog> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const specifiers = extractImportSpecifiers(chunk.code);

    for (let j = 0; j < specifiers.length; j++) {
      const specifier = specifiers[j];

      // Check 1: Does the specifier reference another chunk in the output?
      // Specifiers may be relative like "./chunk-abc.js" — normalize by
      // stripping a leading "./"
      const normalizedSpecifier = specifier.replace(/^\.\//, "");
      if (
        chunkFileNames.has(specifier) ||
        chunkFileNames.has(normalizedSpecifier)
      ) {
        continue;
      }

      // Check 2: Is the specifier a declared external?
      if (externalSet.has(specifier)) {
        continue;
      }
      // Also check the package name portion for scoped/deep imports
      // e.g. "lodash/merge" should match external "lodash"
      const packageName = getPackageName(specifier);
      if (packageName !== null && externalSet.has(packageName)) {
        continue;
      }

      // Check 3: Is it a bare specifier? Bare specifiers are assumed to be
      // external packages that the consumer will resolve at runtime.
      if (isBareSpecifier(specifier)) {
        continue;
      }

      // If none of the above matched, this is a dangling/broken import
      warnings.push({
        code: "VERIFY_IMPORT_DANGLING",
        message: `Chunk "${chunk.fileName}" contains import specifier "${specifier}" which is neither a bundle chunk, a declared external, nor a bare specifier`,
        id: chunk.fileName,
      });
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
};

/**
 * Extract the package name from a specifier. For scoped packages like
 * "@scope/pkg/deep", returns "@scope/pkg". For normal packages like
 * "lodash/merge", returns "lodash". Returns null for relative/absolute paths.
 *
 * @param specifier - The import specifier
 * @returns The package name or null
 */
const getPackageName = (specifier: string): string | null => {
  if (!isBareSpecifier(specifier)) {
    return null;
  }
  if (specifier.startsWith("@")) {
    // Scoped package: @scope/pkg or @scope/pkg/deep
    const parts = specifier.split("/");
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return specifier;
  }
  // Normal package: pkg or pkg/deep
  const slashIndex = specifier.indexOf("/");
  if (slashIndex > 0) {
    return specifier.substring(0, slashIndex);
  }
  return specifier;
};
