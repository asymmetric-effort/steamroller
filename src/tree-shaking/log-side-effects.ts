/**
 * @module tree-shaking/log-side-effects
 * @description Experimental side effect logging for tree-shaking diagnostics.
 *
 * When `experimentalLogSideEffects: true` is set, logs the first side effect
 * found in each module with a code frame showing the exact location.
 */

import type * as AST from "../ast/types.js";

/** Error code used for side effect log entries. */
export const FIRST_SIDE_EFFECT = "FIRST_SIDE_EFFECT";

/** Structured log entry for a detected side effect. */
export interface SideEffectLogEntry {
  readonly code: typeof FIRST_SIDE_EFFECT;
  readonly message: string;
  readonly id: string;
  readonly pos: number;
  readonly loc: {
    readonly file: string;
    readonly line: number;
    readonly column: number;
  };
  readonly frame: string;
}

/**
 * Generate a code frame around a given position in the source.
 * Shows up to 2 lines of context before and after the target line,
 * with a caret indicating the exact column.
 *
 * @param source - The full module source text.
 * @param line - The 1-based line number.
 * @param column - The 0-based column number.
 * @returns A formatted code frame string.
 */
export const generateCodeFrame = (
  source: string,
  line: number,
  column: number,
): string => {
  const lines = source.split("\n");
  const startLine = Math.max(0, line - 3);
  const endLine = Math.min(lines.length - 1, line + 1);
  const frameLines: Array<string> = [];

  for (let i = startLine; i <= endLine; i++) {
    const lineNum = i + 1;
    const prefix = lineNum === line ? "> " : "  ";
    frameLines.push(`${prefix}${lineNum} | ${lines[i]}`);
    if (lineNum === line) {
      const padding = " ".repeat(
        column + prefix.length + String(lineNum).length + 3,
      );
      frameLines.push(`${padding}^`);
    }
  }

  return frameLines.join("\n");
};

/**
 * Compute line and column from an offset position in source text.
 *
 * @param source - The full source text.
 * @param pos - The 0-based character offset.
 * @returns Object with 1-based line and 0-based column.
 */
export const positionFromOffset = (
  source: string,
  pos: number,
): { readonly line: number; readonly column: number } => {
  let line = 1;
  let lastNewline = -1;

  for (let i = 0; i < pos && i < source.length; i++) {
    if (source[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }

  return { line, column: pos - lastNewline - 1 };
};

/**
 * Log the first side effect found in a module. Creates a structured log entry
 * with a code frame showing the location of the side effect.
 *
 * @param moduleId - The module identifier (file path or virtual ID).
 * @param sideEffectNodes - Array of AST nodes that have side effects.
 * @param source - The full module source text.
 * @returns The log entry, or null if no side effect nodes are provided.
 */
export const logFirstSideEffect = (
  moduleId: string,
  sideEffectNodes: ReadonlyArray<AST.BaseNode>,
  source: string,
): SideEffectLogEntry | null => {
  if (sideEffectNodes.length === 0) {
    return null;
  }

  const firstNode = sideEffectNodes[0];
  const pos = firstNode.start;
  const { line, column } = positionFromOffset(source, pos);
  const frame = generateCodeFrame(source, line, column);

  const entry: SideEffectLogEntry = {
    code: FIRST_SIDE_EFFECT,
    message: `First side effect in ${moduleId} at line ${line}, column ${column}`,
    id: moduleId,
    pos,
    loc: {
      file: moduleId,
      line,
      column,
    },
    frame,
  };

  return entry;
};
