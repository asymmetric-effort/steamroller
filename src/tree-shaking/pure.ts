/**
 * @module tree-shaking/pure
 * @description Pure annotation collection and manual pure function matching for tree-shaking.
 *
 * Supports three annotation styles:
 * - `/*@__PURE__*​/` — marks the immediately following call expression as side-effect-free
 * - `/*#__PURE__*​/` — alternate syntax (used by some transpilers)
 * - `/*@__NO_SIDE_EFFECTS__*​/` — marks a function declaration as always pure
 *
 * Also supports a manual list of known-pure functions (e.g. `Object.freeze`, `Math.max`)
 * that can be specified in bundler configuration.
 */

import type * as AST from "../ast/types.js";

// ============================================================
// Pure Annotation Collection
// ============================================================

/**
 * Collect all PURE annotation positions from source comments.
 * These are positions of call expressions that are annotated as side-effect-free.
 *
 * Scans source text for block comments matching PURE/NO_SIDE_EFFECTS patterns
 * and returns the start positions of the immediately following expressions.
 */
export const collectPureAnnotations = (
  source: string,
  _ast: AST.Program,
): ReadonlySet<number> => {
  const annotations = new Set<number>();
  const len = source.length;
  let pos = 0;

  while (pos < len) {
    const commentStart = source.indexOf("/*", pos);
    if (commentStart === -1) break;

    const commentEnd = source.indexOf("*/", commentStart + 2);
    if (commentEnd === -1) break;

    const commentContent = source.slice(commentStart + 2, commentEnd).trim();
    if (
      commentContent === "@__PURE__" ||
      commentContent === "#__PURE__" ||
      commentContent === "@__NO_SIDE_EFFECTS__"
    ) {
      // Find next non-whitespace position after the closing */
      let nextPos = commentEnd + 2;
      while (
        nextPos < len &&
        (source[nextPos] === " " ||
          source[nextPos] === "\t" ||
          source[nextPos] === "\n" ||
          source[nextPos] === "\r")
      ) {
        nextPos++;
      }
      if (nextPos < len) {
        annotations.add(nextPos);
      }
    }

    pos = commentEnd + 2;
  }

  return annotations;
};

// ============================================================
// Pure Call Detection
// ============================================================

/**
 * Check if a call expression at a given start position is annotated as pure.
 */
export const isPureCall = (
  callStart: number,
  pureAnnotations: ReadonlySet<number>,
): boolean => {
  return pureAnnotations.has(callStart);
};

// ============================================================
// Manual Pure Function Matching
// ============================================================

/**
 * Match a callee expression against a manual list of pure functions.
 * Supports Identifier (e.g. `myFunc`) and non-computed MemberExpression chains
 * (e.g. `Object.freeze`, `a.b.c`).
 */
export const matchesManualPureFunction = (
  callee: AST.Expression,
  manualPureFunctions: ReadonlyArray<string>,
): boolean => {
  if (manualPureFunctions.length === 0) return false;

  const calleeName = expressionToString(callee);
  if (!calleeName) return false;

  return manualPureFunctions.includes(calleeName);
};

/**
 * Convert a simple expression to a dotted string for matching.
 * Only handles Identifier and non-computed MemberExpression chains.
 * Returns null for anything else (computed access, complex expressions, etc.).
 *
 * Uses iterative approach to handle deep member expression chains.
 */
export const expressionToString = (expr: AST.Expression): string | null => {
  if (expr.type === "Identifier") {
    return (expr as AST.Identifier).name;
  }

  if (expr.type === "MemberExpression") {
    // Iteratively collect parts from right to left
    const parts: Array<string> = [];
    let current: AST.Expression = expr;

    while (current.type === "MemberExpression") {
      const member = current as AST.MemberExpression;
      if (member.computed) return null;

      const property = member.property as AST.Identifier;
      if (property.type !== "Identifier") return null;

      parts.push(property.name);
      current = member.object as AST.Expression;
    }

    if (current.type === "Identifier") {
      parts.push((current as AST.Identifier).name);
      parts.reverse();
      return parts.join(".");
    }

    return null;
  }

  return null;
};

// ============================================================
// NO_SIDE_EFFECTS Function Collection
// ============================================================

/** A function annotated with @__NO_SIDE_EFFECTS__ (all calls to it are pure). */
export interface NoSideEffectsFunction {
  readonly name: string;
  readonly start: number;
}

/**
 * Collect function declarations preceded by @__NO_SIDE_EFFECTS__ annotations.
 * These mark the function itself as side-effect-free, meaning any call to it is pure.
 *
 * Iterates over program body statements to find function declarations
 * whose start positions match collected annotation positions.
 */
export const collectNoSideEffectsFunctions = (
  source: string,
  ast: AST.Program,
): ReadonlyArray<NoSideEffectsFunction> => {
  const annotations = collectPureAnnotations(source, ast);
  const results: Array<NoSideEffectsFunction> = [];

  const stack: Array<AST.Statement | AST.ModuleDeclaration> = [];
  // Push body in reverse so we process in order
  for (let i = ast.body.length - 1; i >= 0; i--) {
    stack.push(ast.body[i]);
  }

  while (stack.length > 0) {
    const node = stack.pop()!;

    if (node.type === "FunctionDeclaration") {
      const funcDecl = node as AST.FunctionDeclaration;
      if (annotations.has(funcDecl.start) && funcDecl.id) {
        results.push({
          name: funcDecl.id.name,
          start: funcDecl.start,
        });
      }
    }

    if (node.type === "ExportNamedDeclaration") {
      const exportDecl = node as AST.ExportNamedDeclaration;
      if (
        exportDecl.declaration &&
        exportDecl.declaration.type === "FunctionDeclaration"
      ) {
        const funcDecl = exportDecl.declaration as AST.FunctionDeclaration;
        // Annotation may point to either "export" or "function" keyword
        if (
          funcDecl.id &&
          (annotations.has(funcDecl.start) || annotations.has(exportDecl.start))
        ) {
          results.push({
            name: funcDecl.id.name,
            start: funcDecl.start,
          });
        }
      }
    }
  }

  return results;
};
