/**
 * @module native/types
 * @description Type definitions for native (Rust) bindings used by
 * performance-critical paths. These interfaces define the contract
 * between the TypeScript fallback implementations and optional native
 * accelerators.
 */

import type { Program } from "../ast/types.js";

/**
 * Options passed to the native parser.
 */
export interface ParseOptions {
  readonly sourceType?: "module" | "script";
  readonly jsx?: boolean;
  readonly typescript?: boolean;
}

/**
 * Options passed to the native minifier.
 */
export interface MinifyOptions {
  readonly mangle?: boolean;
  readonly compress?: boolean;
  readonly sourceMap?: boolean;
}

/**
 * Result returned by the native minifier.
 */
export interface MinifyResult {
  readonly code: string;
  readonly map?: string;
}

/**
 * Native parser interface.
 *
 * Parses JavaScript/TypeScript source into an ESTree-compatible AST
 * using a Rust-based parser for improved performance.
 */
export interface NativeParser {
  parse(code: string, options?: ParseOptions): Program;
}

/**
 * Native minifier interface.
 *
 * Minifies JavaScript source using a Rust-based minification pipeline.
 */
export interface NativeMinifier {
  minify(code: string, options?: MinifyOptions): MinifyResult;
}

/**
 * Native resolver interface.
 *
 * Resolves module specifiers using a Rust-based resolver for faster
 * file-system traversal and path resolution.
 */
export interface NativeResolver {
  resolve(specifier: string, importer: string): string | null;
}

/**
 * Top-level native bindings object.
 *
 * Platform-specific npm packages (e.g. `@steamroller/native-linux-x64`)
 * export an object conforming to this interface.
 */
export interface NativeBindings {
  readonly parser?: NativeParser;
  readonly minifier?: NativeMinifier;
  readonly resolver?: NativeResolver;
}
