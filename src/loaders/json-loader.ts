/**
 * @module loaders/json-loader
 * @description Built-in JSON loader for steamroller.
 * Handles .json file imports by parsing JSON and emitting tree-shakeable
 * ES modules with named exports for top-level keys and a default export
 * for the full object.
 */

import type { Plugin, LoadResult } from "../types.js";
import * as fs from "node:fs";
import * as path from "node:path";

/** Options for the JSON loader plugin. */
export interface JSONLoaderOptions {
  /** File extensions to handle. Default: [".json"] */
  readonly extensions?: ReadonlyArray<string>;
  /** Whether to generate named exports for top-level keys. Default: true */
  readonly namedExports?: boolean;
}

/**
 * Check whether a module ID is a JSON file.
 *
 * @param id - The module ID / file path.
 * @param extensions - Extensions to match.
 * @returns True if the file matches a JSON extension.
 */
export const isJSONFile = (
  id: string,
  extensions: ReadonlyArray<string> = [".json"],
): boolean => {
  const cleanId = id.split("?")[0];
  return extensions.some((ext) => cleanId.endsWith(ext));
};

/**
 * Escape a string for safe inclusion in a JS string literal.
 *
 * @param value - The string to escape.
 * @returns The escaped string.
 */
const escapeString = (value: string): string => {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
};

/**
 * Check whether a string is a valid JS identifier.
 *
 * @param name - The string to check.
 * @returns True if it can be used as a named export directly.
 */
const isValidIdentifier = (name: string): boolean => {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
};

/**
 * Serialize a JSON value to a JS expression string.
 *
 * @param value - The value to serialize.
 * @returns A JS expression string.
 */
const serializeValue = (value: unknown): string => {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  if (typeof value === "string") {
    return `"${escapeString(value)}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => serializeValue(item));
    return `[${items.join(", ")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const props = entries.map(([key, val]) => {
      const safeKey = isValidIdentifier(key) ? key : `"${escapeString(key)}"`;
      return `${safeKey}: ${serializeValue(val)}`;
    });
    return `{${props.join(", ")}}`;
  }
  return String(value);
};

/**
 * Generate ES module code from a parsed JSON object.
 *
 * @param data - The parsed JSON data.
 * @param namedExports - Whether to emit named exports for top-level keys.
 * @returns ES module source code.
 */
export const generateJSONModule = (
  data: unknown,
  namedExports: boolean,
): string => {
  const lines: Array<string> = [];

  if (
    namedExports &&
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data)
  ) {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (isValidIdentifier(key)) {
        lines.push(`export const ${key} = ${serializeValue(obj[key])};`);
      }
    }
  }

  lines.push(`export default ${serializeValue(data)};`);

  return lines.join("\n");
};

/**
 * Create the built-in JSON loader plugin.
 *
 * @param options - Plugin options.
 * @returns A Plugin that handles .json imports.
 */
export const jsonLoader = (options?: JSONLoaderOptions): Plugin => {
  const extensions = options?.extensions ?? [".json"];
  const namedExports = options?.namedExports ?? true;

  return {
    name: "steamroller:json",

    resolveId(source: string) {
      if (!isJSONFile(source, extensions)) {
        return null;
      }
      return null;
    },

    load(id: string): LoadResult {
      if (!isJSONFile(id, extensions)) {
        return null;
      }

      const cleanId = id.split("?")[0];
      let content: string;
      try {
        content = fs.readFileSync(cleanId, "utf-8");
      } catch {
        return null;
      }

      const data = JSON.parse(content);
      const code = generateJSONModule(data, namedExports);

      return {
        code,
        map: { mappings: "" },
      };
    },
  };
};
