/**
 * Source map output mode handling.
 *
 * Supports multiple output modes: normal (external file with comment),
 * inline (data URL), hidden (no comment), and disabled (no map).
 *
 * @module sourcemap/output
 */

import type { RawSourceMap } from "./compose.js";

/**
 * Source map output mode:
 * - true: normal mode (external .map file, appends sourceMappingURL comment)
 * - 'inline': embeds the source map as a base64 data URL in the code
 * - 'hidden': generates the .map file but does not append a comment
 * - false: disables source map generation entirely
 */
export type SourcemapMode = boolean | "inline" | "hidden";

/**
 * Configuration options for source map output generation.
 */
export interface SourcemapOutputOptions {
  readonly mode: SourcemapMode;
  readonly file?: string;
  readonly sourcemapBaseUrl?: string;
  readonly sourcemapExcludeSources?: boolean;
  readonly sourcemapDebugIds?: boolean;
  readonly sourcemapFile?: string;
  readonly sourcemapPathTransform?: (path: string, mapPath: string) => string;
  readonly sourcemapIgnoreList?: (path: string, mapPath: string) => boolean;
}

/**
 * Result of source map output generation.
 */
export interface SourcemapOutputResult {
  readonly code: string;
  readonly map: RawSourceMap | null;
  readonly mapFileName: string | null;
}

/**
 * Process a source map by applying path transforms, ignore list,
 * source exclusion, debug IDs, and base URL configuration.
 */
const processSourceMap = (
  map: RawSourceMap,
  options: SourcemapOutputOptions,
): RawSourceMap => {
  const mapPath = options.sourcemapFile ?? `${options.file ?? "unknown"}.map`;
  let sources = [...map.sources];
  let sourcesContent = map.sourcesContent ? [...map.sourcesContent] : undefined;
  const ignoreList: Array<number> = [];

  // Apply base URL to sources
  if (options.sourcemapBaseUrl) {
    const baseUrl = options.sourcemapBaseUrl.endsWith("/")
      ? options.sourcemapBaseUrl
      : `${options.sourcemapBaseUrl}/`;
    sources = sources.map((source) => `${baseUrl}${source}`);
  }

  // Apply path transform
  if (options.sourcemapPathTransform) {
    const transform = options.sourcemapPathTransform;
    sources = sources.map((source) => transform(source, mapPath));
  }

  // Build ignore list
  if (options.sourcemapIgnoreList) {
    const ignoreCheck = options.sourcemapIgnoreList;
    for (let i = 0; i < sources.length; i++) {
      if (ignoreCheck(sources[i], mapPath)) {
        ignoreList.push(i);
      }
    }
  }

  // Exclude sources content if configured
  if (options.sourcemapExcludeSources) {
    sourcesContent = undefined;
  }

  const result: Record<string, unknown> = {
    version: 3 as const,
    sources,
    names: map.names,
    mappings: map.mappings,
  };

  if (sourcesContent !== undefined) {
    result["sourcesContent"] = sourcesContent;
  }

  if (ignoreList.length > 0) {
    result["x_google_ignoreList"] = ignoreList;
  }

  if (options.sourcemapDebugIds) {
    // Generate a deterministic debug ID based on mappings content
    result["debugId"] = generateDebugId(map.mappings);
  }

  return result as unknown as RawSourceMap;
};

/**
 * Generate a deterministic debug ID from mappings content.
 * Uses a simple hash to produce a UUID-like identifier.
 */
const generateDebugId = (mappings: string): string => {
  let hash = 0;
  for (let i = 0; i < mappings.length; i++) {
    const char = mappings.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(0, 3)}-${hex.slice(0, 12).padEnd(12, "0")}`;
};

/**
 * Generate the source map output based on the configured mode.
 *
 * @param map - The raw source map to output
 * @param code - The generated code string
 * @param options - Output configuration options
 * @returns The processed code, map, and map file name
 */
export const generateSourcemapOutput = (
  map: RawSourceMap,
  code: string,
  options: SourcemapOutputOptions,
): SourcemapOutputResult => {
  if (!options.mode) {
    return { code, map: null, mapFileName: null };
  }

  // Apply transforms: path transform, ignore list, exclude sources, debug IDs
  const processedMap = processSourceMap(map, options);

  if (options.mode === "inline") {
    // Append inline source map as data URL
    const encoded = Buffer.from(JSON.stringify(processedMap)).toString(
      "base64",
    );
    const inlineCode = `${code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${encoded}`;
    return { code: inlineCode, map: null, mapFileName: null };
  }

  if (options.mode === "hidden") {
    // Don't append sourceMappingURL comment
    const mapFileName =
      options.sourcemapFile ?? `${options.file ?? "unknown"}.map`;
    return { code, map: processedMap, mapFileName };
  }

  // Normal mode (true): append sourceMappingURL comment
  const mapFileName =
    options.sourcemapFile ?? `${options.file ?? "unknown"}.map`;
  const withComment = `${code}\n//# sourceMappingURL=${mapFileName}`;
  return { code: withComment, map: processedMap, mapFileName };
};
