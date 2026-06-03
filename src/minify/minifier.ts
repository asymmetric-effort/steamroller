/**
 * @module minify/minifier
 * @description Multi-pass AST-based JavaScript minifier.
 *
 * Pipeline: parse -> dead code elimination -> constant folding ->
 * expression simplification -> name mangling -> code compression -> emit.
 */

import { parseAst } from "../parse-ast.js";
import { eliminateDeadCode } from "./dce.js";
import { foldConstants } from "./constant-fold.js";
import { simplifyExpressions } from "./simplify.js";
import { mangleNames } from "./mangle.js";
import { compressCode } from "./compress.js";
import { emitMinified } from "./emit.js";
import type { MangleOptions } from "./mangle.js";
import { isNativeAvailable } from "../native/index.js";
import { minifyWithNative } from "../native/minifier-bridge.js";

/**
 * Options for controlling the minification pipeline.
 */
export interface MinifyOptions {
  /** Run dead code elimination pass. Default: true */
  readonly deadCode?: boolean;
  /** Run constant folding pass. Default: true */
  readonly constantFold?: boolean;
  /** Run expression simplification pass. Default: true */
  readonly simplify?: boolean;
  /** Run scope-aware name mangling pass. Default: true */
  readonly mangle?: boolean;
  /** Mangle properties matching pattern (opt-in). Default: false */
  readonly mangleProperties?: boolean;
  /** Run code compression pass. Default: true */
  readonly compress?: boolean;
  /** Names that must never be renamed by the mangler. */
  readonly reserved?: string[];
}

const DEFAULT_OPTIONS: Required<MinifyOptions> = {
  deadCode: true,
  constantFold: true,
  simplify: true,
  mangle: true,
  mangleProperties: false,
  compress: true,
  reserved: [],
};

/**
 * Minifies JavaScript source code using a multi-pass AST-based pipeline.
 *
 * @param code - The JavaScript source code to minify
 * @param options - Optional configuration to control which passes run
 * @returns The minified code string
 */
export const minify = (code: string, options?: MinifyOptions): string => {
  if (!code.trim()) return "";

  // When native bindings are available, delegate to the native minifier
  if (isNativeAvailable()) {
    const result = minifyWithNative(code, {
      mangle: options?.mangle,
      compress: options?.compress,
    });
    return result.code;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Parse source into AST
  let ast = parseAst(code, { sourceType: "module" });

  // Pass 1: Dead Code Elimination
  if (opts.deadCode) {
    ast = eliminateDeadCode(ast);
  }

  // Pass 2: Constant Folding
  if (opts.constantFold) {
    ast = foldConstants(ast);
  }

  // Pass 3: Expression Simplification
  if (opts.simplify) {
    ast = simplifyExpressions(ast);
  }

  // Pass 4: Scope-Aware Name Mangling
  if (opts.mangle) {
    ast = mangleNames(ast, {
      reserved: opts.reserved,
      mangleProperties: opts.mangleProperties,
    });
  }

  // Pass 5: Code Compression
  if (opts.compress) {
    ast = compressCode(ast);
  }

  // Pass 6: Emit minified code
  return emitMinified(ast);
};
