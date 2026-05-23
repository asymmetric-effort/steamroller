/**
 * Error and warning construction utilities for the bundler.
 *
 * Provides structured error/warning creation, code frame generation
 * for pointing at source locations, and error formatting for display.
 *
 * @module utils/errors
 */

/** Structured log entry for errors and warnings. */
export interface RollupLog {
  readonly code: string;
  readonly message: string;
  readonly id?: string;
  readonly pos?: number;
  readonly loc?: {
    readonly file?: string;
    readonly line: number;
    readonly column: number;
  };
  readonly frame?: string;
  readonly stack?: string;
  readonly plugin?: string;
  readonly pluginCode?: string;
  readonly url?: string;
  readonly exporter?: string;
  readonly reexporter?: string;
}

/**
 * Create a structured error log entry.
 *
 * @param code - The error code constant identifying this error type.
 * @param message - Human-readable description of the error.
 * @param properties - Optional additional metadata fields.
 * @returns A frozen RollupLog object.
 */
export const createRollupError = (
  code: string,
  message: string,
  properties?: Partial<Omit<RollupLog, "code" | "message">>,
): RollupLog => {
  return { code, message, ...properties };
};

/**
 * Create a structured warning log entry.
 *
 * @param code - The warning code constant identifying this warning type.
 * @param message - Human-readable description of the warning.
 * @param properties - Optional additional metadata fields.
 * @returns A frozen RollupLog object.
 */
export const createRollupWarning = (
  code: string,
  message: string,
  properties?: Partial<Omit<RollupLog, "code" | "message">>,
): RollupLog => {
  return { code, message, ...properties };
};

/**
 * Generate a code frame showing context around an error location.
 *
 * Displays lines of source code around the error with line numbers,
 * a `>` marker on the error line, and a `^` pointer at the column.
 *
 * @param source - The full source code string.
 * @param line - The 1-based line number of the error.
 * @param column - The 0-based column offset of the error.
 * @param contextLines - Number of context lines before/after (default 2).
 * @returns A formatted code frame string.
 */
export const generateCodeFrame = (
  source: string,
  line: number,
  column: number,
  contextLines?: number,
): string => {
  const context = contextLines ?? 2;
  const lines = source.split("\n");
  const start = Math.max(0, line - 1 - context);
  const end = Math.min(lines.length, line + context);
  const maxLineNum = end;
  const padding = String(maxLineNum).length;

  const result: Array<string> = [];
  for (let i = start; i < end; i++) {
    const lineNum = String(i + 1).padStart(padding);
    const prefix = i === line - 1 ? ">" : " ";
    result.push(`${prefix} ${lineNum} | ${lines[i]}`);
    if (i === line - 1) {
      result.push(`  ${" ".repeat(padding)} | ${" ".repeat(column)}^`);
    }
  }
  return result.join("\n");
};

/**
 * Convert a RollupLog entry to a human-readable string.
 *
 * Assembles plugin name, error code, message, file ID, and location
 * into a single-line header, optionally followed by a code frame.
 *
 * @param log - The RollupLog to format.
 * @returns A formatted error/warning string.
 */
export const formatError = (log: RollupLog): string => {
  const parts: Array<string> = [];
  if (log.plugin) {
    parts.push(`[plugin ${log.plugin}]`);
  }
  parts.push(`(${log.code})`);
  parts.push(log.message);
  if (log.id) {
    parts.push(`in ${log.id}`);
  }
  if (log.loc) {
    parts.push(`at ${log.loc.file ?? ""}:${log.loc.line}:${log.loc.column}`);
  }
  const header = parts.join(" ");
  if (log.frame) {
    return `${header}\n${log.frame}`;
  }
  return header;
};
