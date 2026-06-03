/**
 * @module minify/minifier
 * @description Multi-pass AST-based JavaScript minifier.
 *
 * Pipeline: parse -> dead code elimination -> constant folding ->
 * expression simplification -> name mangling -> code compression -> emit.
 *
 * When `sourceMap` is enabled the minifier uses MagicString to track
 * safe transforms (constant folding and DCE) back to their original
 * source positions, producing a v3 source map alongside the minified code.
 */

import { parseAst } from "../parse-ast.js";
import { eliminateDeadCode } from "./dce.js";
import { foldConstants } from "./constant-fold.js";
import { simplifyExpressions } from "./simplify.js";
import { mangleNames } from "./mangle.js";
import { compressCode } from "./compress.js";
import { emitMinified } from "./emit.js";
import type { MangleOptions } from "./mangle.js";
import { shouldUseNative } from "../native/index.js";
import { minifyWithNative } from "../native/minifier-bridge.js";
import { MagicString } from "../sourcemap/magic-string.js";
import type { SourceMapData } from "../sourcemap/magic-string.js";
import type { Program, Expression, Statement } from "../ast/types.js";

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
  /** Generate a source map. Default: false */
  readonly sourceMap?: boolean;
  /** Source file name for the source map. */
  readonly sourceMapSource?: string;
}

/**
 * Result returned when `sourceMap` option is enabled.
 */
export interface MinifyResult {
  readonly code: string;
  readonly map: SourceMapData;
}

const DEFAULT_OPTIONS: Required<Omit<MinifyOptions, "sourceMapSource">> & {
  sourceMapSource?: string;
} = {
  deadCode: true,
  constantFold: true,
  simplify: true,
  mangle: true,
  mangleProperties: false,
  compress: true,
  reserved: [],
  sourceMap: false,
  sourceMapSource: undefined,
};

/**
 * Collect constant-folded nodes that were replaced with literals.
 * Walks both the original and folded ASTs and records positions where
 * an expression was replaced with a simpler form.
 */
const collectFoldedRanges = (
  original: Program,
  folded: Program,
): Array<{ start: number; end: number; replacement: string }> => {
  const ranges: Array<{ start: number; end: number; replacement: string }> = [];

  const walkExpr = (origExpr: Expression, foldedExpr: Expression): void => {
    if (origExpr === foldedExpr) return;
    // If the folded expression is a different node type or a literal replacement,
    // record the range using the original node's position.
    if (
      origExpr.start !== undefined &&
      origExpr.end !== undefined &&
      origExpr.start < origExpr.end &&
      foldedExpr.type === "Literal" &&
      origExpr.type !== "Literal"
    ) {
      const raw =
        typeof foldedExpr.value === "string"
          ? JSON.stringify(foldedExpr.value)
          : String(foldedExpr.value);
      ranges.push({
        start: origExpr.start,
        end: origExpr.end,
        replacement: raw,
      });
      return;
    }
  };

  const walkStmt = (origStmt: Statement, foldedStmt: Statement): void => {
    if (origStmt === foldedStmt) return;
    if (
      origStmt.type === "ExpressionStatement" &&
      foldedStmt.type === "ExpressionStatement"
    ) {
      walkExpr(origStmt.expression, foldedStmt.expression);
    }
    if (
      origStmt.type === "VariableDeclaration" &&
      foldedStmt.type === "VariableDeclaration"
    ) {
      for (let i = 0; i < origStmt.declarations.length; i++) {
        const origDecl = origStmt.declarations[i];
        const foldedDecl = foldedStmt.declarations[i];
        if (origDecl?.init && foldedDecl?.init) {
          walkExpr(origDecl.init, foldedDecl.init);
        }
      }
    }
    if (
      origStmt.type === "ReturnStatement" &&
      foldedStmt.type === "ReturnStatement"
    ) {
      if (origStmt.argument && foldedStmt.argument) {
        walkExpr(origStmt.argument, foldedStmt.argument);
      }
    }
  };

  for (let i = 0; i < original.body.length; i++) {
    const origNode = original.body[i];
    const foldedNode = folded.body[i];
    if (!origNode || !foldedNode) continue;
    if (origNode === foldedNode) continue;

    if (
      origNode.type !== "ImportDeclaration" &&
      origNode.type !== "ExportNamedDeclaration" &&
      origNode.type !== "ExportDefaultDeclaration" &&
      origNode.type !== "ExportAllDeclaration"
    ) {
      walkStmt(origNode as Statement, foldedNode as Statement);
    }
  }

  return ranges;
};

/**
 * Collect removed statement ranges from DCE.
 */
const collectRemovedRanges = (
  original: Program,
  dced: Program,
): Array<{ start: number; end: number }> => {
  const ranges: Array<{ start: number; end: number }> = [];
  const dcedSet = new Set(dced.body);

  for (const stmt of original.body) {
    if (
      !dcedSet.has(stmt) &&
      stmt.start !== undefined &&
      stmt.end !== undefined &&
      stmt.start < stmt.end
    ) {
      ranges.push({ start: stmt.start, end: stmt.end });
    }
  }

  return ranges;
};

/**
 * Minifies JavaScript source code using a multi-pass AST-based pipeline.
 *
 * @param code - The JavaScript source code to minify
 * @param options - Optional configuration to control which passes run
 * @returns The minified code string, or `{ code, map }` when `sourceMap` is true
 */
export function minify(
  code: string,
  options: MinifyOptions & { sourceMap: true },
): MinifyResult;
export function minify(code: string, options?: MinifyOptions): string;
export function minify(
  code: string,
  options?: MinifyOptions,
): string | MinifyResult {
  if (!code.trim()) {
    if (options?.sourceMap) {
      return {
        code: "",
        map: {
          version: 3,
          sources: [],
          sourcesContent: [],
          names: [],
          mappings: "",
        },
      };
    }
    return "";
  }

  // When native bindings are available, delegate to the native minifier
  if (shouldUseNative()) {
    const result = minifyWithNative(code, {
      mangle: options?.mangle,
      compress: options?.compress,
      sourceMap: options?.sourceMap,
    });
    if (options?.sourceMap && result.map) {
      return {
        code: result.code,
        map: JSON.parse(result.map) as SourceMapData,
      };
    }
    return result.code;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Parse source into AST
  let ast = parseAst(code, { sourceType: "module" });

  // When source maps are requested, use MagicString to track transformations
  let ms: MagicString | null = null;
  if (opts.sourceMap) {
    ms = new MagicString(code);
  }

  // Capture pre-transform ASTs for source map diffing
  const preDceAst = ast;

  // Pass 1: Dead Code Elimination
  if (opts.deadCode) {
    ast = eliminateDeadCode(ast);

    if (ms) {
      const removedRanges = collectRemovedRanges(preDceAst, ast);
      for (const range of removedRanges) {
        try {
          ms.remove(range.start, range.end);
        } catch {
          /* range may overlap an already-edited chunk */
        }
      }
    }
  }

  const preFoldAst = ast;

  // Pass 2: Constant Folding
  if (opts.constantFold) {
    ast = foldConstants(ast);

    if (ms) {
      const foldedRanges = collectFoldedRanges(preFoldAst, ast);
      for (const range of foldedRanges) {
        try {
          ms.overwrite(range.start, range.end, range.replacement);
        } catch {
          /* range may overlap an already-edited chunk */
        }
      }
    }
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
  const minified = emitMinified(ast);

  if (opts.sourceMap && ms) {
    const map = ms.generateMap({
      source: opts.sourceMapSource ?? "input.js",
      includeContent: true,
    });
    return { code: minified, map };
  }

  return minified;
}
