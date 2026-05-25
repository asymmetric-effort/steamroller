/**
 * @module splitting/chunk-naming
 * @description Resolves chunk file names from patterns with placeholder
 * substitution. Supports [name], [hash], [format], and [extname] placeholders.
 */

import type { HashCharacters, ModuleFormat } from "../types.js";
import { contentHash } from "../codegen/hash.js";

/** Information about a chunk needed for name resolution. */
export interface ChunkNamingInfo {
  readonly name: string;
  readonly content: string;
  readonly format: ModuleFormat;
  readonly isEntry: boolean;
}

/** Options controlling chunk file naming. */
export interface ChunkNamingOptions {
  readonly entryFileNames?: string;
  readonly chunkFileNames?: string;
  readonly assetFileNames?: string;
  readonly hashLength?: number;
  readonly hashChars?: HashCharacters;
}

/** Default file name patterns. */
const DEFAULT_ENTRY_PATTERN = "[name].js";
const DEFAULT_CHUNK_PATTERN = "[name]-[hash].js";
const DEFAULT_ASSET_PATTERN = "assets/[name]-[hash][extname]";
const DEFAULT_HASH_LENGTH = 8;
const DEFAULT_HASH_CHARS: HashCharacters = "base64";

/**
 * Get the file extension for a given output format.
 */
const getFormatExtension = (format: ModuleFormat): string => {
  switch (format) {
    case "es":
      return ".mjs";
    case "cjs":
      return ".cjs";
    case "amd":
    case "iife":
    case "umd":
    case "system":
      return ".js";
  }
};

/**
 * Sanitize a file name by removing unsafe characters.
 * Replaces non-alphanumeric characters (except hyphens, underscores, dots,
 * and forward slashes) with underscores.
 */
const sanitizeFileName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9\-_./]/g, "_");
};

/**
 * Substitute placeholders in a file name pattern.
 *
 * Supported placeholders:
 * - [name] - The chunk name (derived from entry or manual assignment)
 * - [hash] - Content hash of the chunk
 * - [format] - Output format (es, cjs, etc.)
 * - [extname] - File extension including dot (.js, .mjs, etc.)
 *
 * @param pattern - Pattern string with placeholders
 * @param name - Chunk name
 * @param hash - Computed content hash
 * @param format - Output module format
 * @returns Resolved file name with all placeholders replaced
 */
const substitutePlaceholders = (
  pattern: string,
  name: string,
  hash: string,
  format: ModuleFormat,
): string => {
  const ext = getFormatExtension(format);
  const sanitizedName = sanitizeFileName(name);

  let result = pattern;
  result = result.replace(/\[name\]/g, sanitizedName);
  result = result.replace(/\[hash\]/g, hash);
  result = result.replace(/\[format\]/g, format);
  result = result.replace(/\[extname\]/g, ext);

  return result;
};

/**
 * Resolve the file name for a chunk based on its type and naming options.
 *
 * Entry chunks use the `entryFileNames` pattern (default: "[name].js").
 * Non-entry chunks use the `chunkFileNames` pattern (default: "[name]-[hash].js").
 *
 * @param chunk - Information about the chunk
 * @param pattern - Optional override pattern (takes precedence over options)
 * @param hashLength - Length of hash in characters (default: 8)
 * @param hashChars - Hash encoding format (default: "base64")
 * @returns The resolved file name string
 *
 * @example
 * ```typescript
 * const name = resolveChunkFileName(
 *   { name: "main", content: "code", format: "es", isEntry: true },
 *   "[name]-[hash].mjs",
 *   8,
 *   "hex"
 * );
 * // "main-a1b2c3d4.mjs"
 * ```
 */
export const resolveChunkFileName = (
  chunk: ChunkNamingInfo,
  pattern?: string,
  hashLength?: number,
  hashChars?: HashCharacters,
): string => {
  const effectiveHashLength = hashLength ?? DEFAULT_HASH_LENGTH;
  const effectiveHashChars = hashChars ?? DEFAULT_HASH_CHARS;

  const hash = contentHash(
    chunk.content,
    effectiveHashLength,
    effectiveHashChars,
  );

  const effectivePattern =
    pattern ?? (chunk.isEntry ? DEFAULT_ENTRY_PATTERN : DEFAULT_CHUNK_PATTERN);

  return substitutePlaceholders(
    effectivePattern,
    chunk.name,
    hash,
    chunk.format,
  );
};

/**
 * Resolve the file name for an asset.
 *
 * @param name - Asset name (including extension)
 * @param content - Asset content for hashing
 * @param options - Naming options
 * @returns The resolved asset file name
 *
 * @example
 * ```typescript
 * const name = resolveAssetFileName("style.css", "body{}", {});
 * // "assets/style-AbCdEfGh.css"
 * ```
 */
export const resolveAssetFileName = (
  name: string,
  content: string,
  options?: ChunkNamingOptions,
): string => {
  const pattern = options?.assetFileNames ?? DEFAULT_ASSET_PATTERN;
  const hashLength = options?.hashLength ?? DEFAULT_HASH_LENGTH;
  const hashChars = options?.hashChars ?? DEFAULT_HASH_CHARS;

  const hash = contentHash(content, hashLength, hashChars);
  const dotIndex = name.lastIndexOf(".");
  const ext = dotIndex > 0 ? name.slice(dotIndex) : "";
  const baseName = dotIndex > 0 ? name.slice(0, dotIndex) : name;

  let result = pattern;
  result = result.replace(/\[name\]/g, sanitizeFileName(baseName));
  result = result.replace(/\[hash\]/g, hash);
  result = result.replace(/\[extname\]/g, ext);

  return result;
};

export {
  DEFAULT_ENTRY_PATTERN,
  DEFAULT_CHUNK_PATTERN,
  DEFAULT_ASSET_PATTERN,
  DEFAULT_HASH_LENGTH,
  DEFAULT_HASH_CHARS,
};
