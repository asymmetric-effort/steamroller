/**
 * Public API for parsing JavaScript source into an ESTree-compatible AST.
 *
 * Provides both synchronous ({@link parseAst}) and asynchronous
 * ({@link parseAstAsync}) entry points. The async variant supports
 * cooperative cancellation via {@link AbortSignal}.
 *
 * @module parse-ast
 */

import type { Program } from "./ast/types.js";
import { parse } from "./parser/parser.js";
import type { ParseOptions } from "./parser/parser.js";
import { yieldToEventLoop, checkAborted } from "./utils/async-utils.js";
import { shouldUseNative } from "./native/index.js";
import { parseWithNative } from "./native/parser-bridge.js";

/**
 * Options for the public parse API.
 *
 * Extends the core {@link ParseOptions} with additional flags for
 * JSX support, return-outside-function tolerance, and abort signaling.
 */
export interface ParseAstOptions extends ParseOptions {
  /** Whether to enable JSX parsing (reserved for future use). */
  readonly jsx?: boolean;
  /** Whether to allow return statements outside functions. */
  readonly allowReturnOutsideFunction?: boolean;
  /** Optional abort signal for cooperative cancellation. */
  readonly signal?: AbortSignal;
}

/**
 * Parse JavaScript source text into a frozen ESTree-compatible AST synchronously.
 *
 * @param input - The source text to parse.
 * @param options - Optional configuration for parsing behavior.
 * @returns The root {@link Program} AST node (frozen).
 * @throws {Error} If the source contains syntax errors.
 *
 * @example
 * ```typescript
 * const ast = parseAst('const x = 1;');
 * console.log(ast.type); // "Program"
 * ```
 */
export const parseAst = (input: string, options?: ParseAstOptions): Program => {
  if (shouldUseNative()) {
    return parseWithNative(input, { sourceType: options?.sourceType });
  }
  return parse(input, {
    sourceType: options?.sourceType,
    allowHashBang: true,
    ecmaVersion: 2024,
  });
};

/**
 * Parse JavaScript source text into a frozen ESTree-compatible AST asynchronously.
 *
 * Yields to the event loop before and after parsing to avoid blocking.
 * Supports cooperative cancellation via an {@link AbortSignal}.
 *
 * @param input - The source text to parse.
 * @param options - Optional configuration for parsing behavior.
 * @returns A promise resolving to the root {@link Program} AST node (frozen).
 * @throws {Error} If the signal is aborted or the source contains syntax errors.
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 * const ast = await parseAstAsync('const x = 1;', { signal: controller.signal });
 * console.log(ast.type); // "Program"
 * ```
 */
export const parseAstAsync = async (
  input: string,
  options?: ParseAstOptions,
): Promise<Program> => {
  checkAborted(options?.signal);
  await yieldToEventLoop();
  checkAborted(options?.signal);
  const result = parse(input, {
    sourceType: options?.sourceType,
    allowHashBang: true,
    ecmaVersion: 2024,
  });
  return result;
};
