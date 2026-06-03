/**
 * @module loaders/text-loader
 * @description Built-in text loader for steamroller.
 * Handles text file imports (.txt, .sql, .html, .md, .graphql, .gql).
 * Reads the file as UTF-8 and exports the content as a default string export.
 */

import type { Plugin, LoadResult } from "../types.js";
import * as fs from "node:fs";

/** Default file extensions handled by the text loader. */
export const DEFAULT_TEXT_EXTENSIONS: ReadonlyArray<string> = [
  ".txt",
  ".sql",
  ".html",
  ".md",
  ".graphql",
  ".gql",
];

/** Options for the text loader plugin. */
export interface TextLoaderOptions {
  /** File extensions to handle. Default: DEFAULT_TEXT_EXTENSIONS */
  readonly extensions?: ReadonlyArray<string>;
}

/**
 * Check whether a module ID is a text file.
 *
 * @param id - The module ID / file path.
 * @param extensions - Extensions to match.
 * @returns True if the file matches a text extension.
 */
export const isTextFile = (
  id: string,
  extensions: ReadonlyArray<string> = DEFAULT_TEXT_EXTENSIONS,
): boolean => {
  const cleanId = id.split("?")[0];
  return extensions.some((ext) => cleanId.endsWith(ext));
};

/**
 * Escape a string for safe inclusion in a JS template literal.
 *
 * @param value - The string to escape.
 * @returns The escaped string.
 */
const escapeForTemplateLiteral = (value: string): string => {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
};

/**
 * Generate an ES module that exports a text string as default.
 *
 * @param content - The text content.
 * @returns ES module source code.
 */
export const generateTextModule = (content: string): string => {
  const escaped = escapeForTemplateLiteral(content);
  return `export default \`${escaped}\`;\n`;
};

/**
 * Create the built-in text loader plugin.
 *
 * @param options - Plugin options.
 * @returns A Plugin that handles text file imports.
 */
export const textLoader = (options?: TextLoaderOptions): Plugin => {
  const extensions = options?.extensions ?? DEFAULT_TEXT_EXTENSIONS;

  return {
    name: "steamroller:text",

    resolveId(source: string) {
      if (!isTextFile(source, extensions)) {
        return null;
      }
      return null;
    },

    load(id: string): LoadResult {
      if (!isTextFile(id, extensions)) {
        return null;
      }

      const cleanId = id.split("?")[0];
      let content: string;
      try {
        content = fs.readFileSync(cleanId, "utf-8");
      } catch {
        return null;
      }

      const code = generateTextModule(content);

      return {
        code,
        map: { mappings: "" },
      };
    },
  };
};
