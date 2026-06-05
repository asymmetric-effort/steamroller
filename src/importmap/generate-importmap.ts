/**
 * @module importmap/generate-importmap
 * @description Generates import map JSON from build output.
 * Maps bare specifiers to resolved CDN URLs or local paths,
 * and supports scoped imports for version conflict resolution.
 */

import type { RollupOutput, OutputChunk, OutputAsset } from "../types.js";
import type { ImportMapJson, ImportMapOptions, CdnProvider } from "./types.js";
import { resolveToCdn } from "./cdn-resolver.js";

/**
 * Extract external import sources from an output chunk's code.
 * Looks for import statements referencing bare specifiers (not relative or absolute paths).
 *
 * @param chunk - The output chunk to inspect
 * @returns Array of bare specifier strings found in the chunk
 */
const extractBareSpecifiers = (chunk: OutputChunk): ReadonlyArray<string> => {
  const specifiers: Array<string> = [];

  // Collect from the chunk's imports array (external imports)
  for (let i = 0; i < chunk.imports.length; i++) {
    const imp = chunk.imports[i];
    if (!isRelativeOrAbsolute(imp)) {
      specifiers.push(imp);
    }
  }

  return specifiers;
};

/**
 * Check if a specifier is a relative or absolute path (not a bare specifier).
 *
 * @param specifier - The import specifier to check
 * @returns true if the specifier is a relative or absolute path
 */
const isRelativeOrAbsolute = (specifier: string): boolean => {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/") ||
    specifier.startsWith("http://") ||
    specifier.startsWith("https://")
  );
};

/**
 * Generate an import map JSON object from build output.
 *
 * Scans output chunks for bare specifiers and maps them to CDN URLs
 * using the configured CDN provider. Also includes explicitly configured
 * externals in the import map.
 *
 * When multiple chunks require different versions of the same package
 * (detected via the externals config), scoped imports are generated
 * so each chunk resolves to the correct version.
 *
 * @param output - The build output containing chunks and assets
 * @param options - Import map generation options
 * @returns The generated import map JSON structure
 */
export const generateImportMap = (
  output: RollupOutput,
  options: ImportMapOptions = {},
): ImportMapJson => {
  const cdn: CdnProvider = options.cdn ?? "esm.sh";
  const externals = options.externals ?? {};
  const baseUrl = options.baseUrl ?? "./";

  const imports: Record<string, string> = {};
  const scopes: Record<string, Record<string, string>> = {};

  // Collect all bare specifiers from all chunks
  const allSpecifiers = new Set<string>();
  const chunkSpecifiers = new Map<string, ReadonlyArray<string>>();

  for (let i = 0; i < output.output.length; i++) {
    const item = output.output[i];
    if (item.type === "chunk") {
      const chunk = item as OutputChunk;
      const specifiers = extractBareSpecifiers(chunk);
      chunkSpecifiers.set(chunk.fileName, specifiers);
      for (let j = 0; j < specifiers.length; j++) {
        allSpecifiers.add(specifiers[j]);
      }
    }
  }

  // Map configured externals to CDN URLs
  const externalKeys = Object.keys(externals);
  for (let i = 0; i < externalKeys.length; i++) {
    const specifier = externalKeys[i];
    const version = externals[specifier];
    imports[specifier] = resolveToCdn(specifier, version, cdn);
    allSpecifiers.delete(specifier);
  }

  // Map remaining bare specifiers (discovered from chunks but not in externals)
  for (const specifier of allSpecifiers) {
    imports[specifier] = resolveToCdn(specifier, "", cdn);
  }

  // Add local chunk references with baseUrl prefix
  for (let i = 0; i < output.output.length; i++) {
    const item = output.output[i];
    if (item.type === "chunk") {
      const chunk = item as OutputChunk;
      if (!chunk.isEntry && chunk.fileName) {
        const localPath = normalizeBaseUrl(baseUrl) + chunk.fileName;
        imports["./" + chunk.fileName] = localPath;
      }
    }
  }

  // Build scoped imports when multiple chunks need different versions
  // of the same specifier. This is driven by explicit scope configuration
  // in externals using the format "specifier>scopePath" as a key.
  for (let i = 0; i < externalKeys.length; i++) {
    const key = externalKeys[i];
    const gtIdx = key.indexOf(">");
    if (gtIdx !== -1) {
      const specifier = key.slice(0, gtIdx);
      const scopePath = key.slice(gtIdx + 1);
      const version = externals[key];
      const resolvedUrl = resolveToCdn(specifier, version, cdn);

      const normalizedScope = normalizeBaseUrl(baseUrl) + scopePath;
      if (scopes[normalizedScope] === undefined) {
        scopes[normalizedScope] = {};
      }
      scopes[normalizedScope][specifier] = resolvedUrl;

      // Remove the raw "specifier>scope" key from top-level imports
      delete imports[key];
    }
  }

  const result: ImportMapJson = { imports };
  if (Object.keys(scopes).length > 0) {
    return { imports, scopes };
  }
  return result;
};

/**
 * Normalize a base URL to ensure it ends with a slash.
 *
 * @param baseUrl - The base URL to normalize
 * @returns The normalized base URL with trailing slash
 */
const normalizeBaseUrl = (baseUrl: string): string => {
  if (baseUrl.length === 0) {
    return "./";
  }
  if (!baseUrl.endsWith("/")) {
    return baseUrl + "/";
  }
  return baseUrl;
};

/**
 * Serialize an ImportMapJson to a formatted JSON string.
 *
 * @param importMap - The import map to serialize
 * @returns Formatted JSON string
 */
export const serializeImportMap = (importMap: ImportMapJson): string => {
  return JSON.stringify(importMap, null, 2);
};

/**
 * Check if an output item is a chunk (type guard).
 *
 * @param item - The output item to check
 * @returns true if the item is an OutputChunk
 */
export const isOutputChunk = (
  item: OutputChunk | OutputAsset,
): item is OutputChunk => {
  return item.type === "chunk";
};
