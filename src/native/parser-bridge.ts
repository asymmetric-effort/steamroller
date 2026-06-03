/**
 * @module native/parser-bridge
 * @description Bridge that routes parsing through native bindings when
 * available, falling back to the pure TypeScript parser otherwise.
 *
 * In debug mode the bridge logs comparative timing information so
 * developers can assess the native parser's performance advantage.
 */

import type { Program } from "../ast/types.js";
import type { ParseOptions } from "./types.js";
import { getNativeParser } from "./index.js";
import { parse } from "../parser/parser.js";

/**
 * Validates that a value looks like a valid ESTree Program node.
 */
const isValidProgram = (value: unknown): value is Program => {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj["type"] === "Program" &&
    Array.isArray(obj["body"]) &&
    (obj["sourceType"] === "module" || obj["sourceType"] === "script")
  );
};

/**
 * Parse JavaScript source into an ESTree-compatible AST.
 *
 * When native bindings are loaded the native parser is tried first.
 * If it fails or returns an invalid AST the TypeScript parser is used
 * as a fallback. In debug mode (`NODE_DEBUG=steamroller`) comparative
 * timing is logged to stderr.
 *
 * @param code - The source text to parse.
 * @param options - Optional parsing configuration.
 * @returns An ESTree-compatible Program AST node.
 */
export const parseWithNative = (
  code: string,
  options?: ParseOptions,
): Program => {
  const nativeParser = getNativeParser();
  const debug =
    typeof process !== "undefined" &&
    !!process.env["NODE_DEBUG"]?.includes("steamroller");

  if (nativeParser) {
    const nativeStart = debug ? performance.now() : 0;
    try {
      const result = nativeParser.parse(code, options);
      if (isValidProgram(result)) {
        if (debug) {
          const nativeElapsed = performance.now() - nativeStart;
          const tsStart = performance.now();
          parse(code, {
            sourceType: options?.sourceType,
            allowHashBang: true,
            ecmaVersion: 2024,
          });
          const tsElapsed = performance.now() - tsStart;
          process.stderr.write(
            `[steamroller:native] parser: native=${nativeElapsed.toFixed(2)}ms ts=${tsElapsed.toFixed(2)}ms\n`,
          );
        }
        return result;
      }
    } catch {
      /* native parser failed - fall through to TS parser */
    }
  }

  return parse(code, {
    sourceType: options?.sourceType,
    allowHashBang: true,
    ecmaVersion: 2024,
  });
};
