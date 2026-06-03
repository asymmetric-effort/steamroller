/**
 * @module loaders/asset-loader
 * @description Built-in asset loader for steamroller.
 * Handles binary/static asset imports (.png, .jpg, .svg, etc.).
 * Supports ?inline for base64 data URLs and ?raw for raw string content.
 */

import type { Plugin, LoadResult } from "../types.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

/** Default file extensions handled by the asset loader. */
export const DEFAULT_ASSET_EXTENSIONS: ReadonlyArray<string> = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".wasm",
];

/** Options for the asset loader plugin. */
export interface AssetLoaderOptions {
  /** File extensions to handle. Default: DEFAULT_ASSET_EXTENSIONS */
  readonly extensions?: ReadonlyArray<string>;
  /** Output directory prefix for asset URLs. Default: "assets" */
  readonly outputDir?: string;
}

/** MIME type mapping for common asset extensions. */
const MIME_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".wasm": "application/wasm",
};

/**
 * Parse query parameters from a module ID.
 *
 * @param id - The module ID potentially containing query params.
 * @returns An object with the clean path and query flags.
 */
export const parseAssetId = (
  id: string,
): {
  readonly path: string;
  readonly inline: boolean;
  readonly raw: boolean;
} => {
  const queryIndex = id.indexOf("?");
  if (queryIndex === -1) {
    return { path: id, inline: false, raw: false };
  }
  const cleanPath = id.slice(0, queryIndex);
  const query = id.slice(queryIndex + 1);
  return {
    path: cleanPath,
    inline: query === "inline" || query.includes("inline"),
    raw: query === "raw" || query.includes("raw"),
  };
};

/**
 * Check whether a module ID is an asset file.
 *
 * @param id - The module ID / file path.
 * @param extensions - Extensions to match.
 * @returns True if the file matches an asset extension.
 */
export const isAssetFile = (
  id: string,
  extensions: ReadonlyArray<string> = DEFAULT_ASSET_EXTENSIONS,
): boolean => {
  const cleanId = id.split("?")[0];
  return extensions.some((ext) => cleanId.endsWith(ext));
};

/**
 * Compute a short content hash for a file.
 *
 * @param content - The file content as a Buffer.
 * @returns An 8-character hex hash.
 */
export const computeAssetHash = (content: Buffer): string => {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 8);
};

/**
 * Build an asset file name with a content hash.
 *
 * @param filePath - The original file path.
 * @param hash - The content hash.
 * @returns The hashed asset file name.
 */
export const buildAssetFileName = (filePath: string, hash: string): string => {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  return `${base}-${hash}${ext}`;
};

/**
 * Get the MIME type for a file extension.
 *
 * @param ext - The file extension (including dot).
 * @returns The MIME type string, or "application/octet-stream" for unknown types.
 */
export const getMimeType = (ext: string): string => {
  return MIME_TYPES[ext] ?? "application/octet-stream";
};

/**
 * Create the built-in asset loader plugin.
 *
 * @param options - Plugin options.
 * @returns A Plugin that handles asset imports.
 */
export const assetLoader = (options?: AssetLoaderOptions): Plugin => {
  const extensions = options?.extensions ?? DEFAULT_ASSET_EXTENSIONS;
  const outputDir = options?.outputDir ?? "assets";

  return {
    name: "steamroller:asset",

    resolveId(source: string) {
      if (!isAssetFile(source, extensions)) {
        return null;
      }
      return null;
    },

    load(id: string): LoadResult {
      if (!isAssetFile(id, extensions)) {
        return null;
      }

      const parsed = parseAssetId(id);
      const filePath = parsed.path;

      let content: Buffer;
      try {
        content = fs.readFileSync(filePath);
      } catch {
        return null;
      }

      // ?raw: return raw string content
      if (parsed.raw) {
        const text = content.toString("utf-8");
        const escaped = text
          .replace(/\\/g, "\\\\")
          .replace(/`/g, "\\`")
          .replace(/\$/g, "\\$");
        return {
          code: `export default \`${escaped}\`;\n`,
          map: { mappings: "" },
        };
      }

      // ?inline: return base64 data URL
      if (parsed.inline) {
        const ext = path.extname(filePath);
        const mimeType = getMimeType(ext);
        const base64 = content.toString("base64");
        const dataUrl = `data:${mimeType};base64,${base64}`;
        return {
          code: `export default "${dataUrl}";\n`,
          map: { mappings: "" },
        };
      }

      // Default: emit as asset with hashed filename
      const hash = computeAssetHash(content);
      const assetFileName = buildAssetFileName(filePath, hash);
      const assetPath = `${outputDir}/${assetFileName}`;

      return {
        code: `export default "${assetPath}";\n`,
        map: { mappings: "" },
        meta: {
          asset: {
            fileName: assetFileName,
            source: content,
            outputPath: assetPath,
          },
        },
      };
    },
  };
};
