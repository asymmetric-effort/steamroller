/**
 * @module codegen/concatenate
 * @description Module concatenation for chunk generation. Takes an ordered array
 * of rendered module code strings and concatenates them into a single chunk,
 * handling separators, namespace wrappers, and source position tracking.
 */

/**
 * Represents a rendered module ready for concatenation.
 */
export interface RenderedModule {
  readonly id: string;
  readonly code: string;
  readonly magicString?: { toString(): string } | undefined;
}

/**
 * Options for module concatenation.
 */
export interface ConcatenateOptions {
  readonly separator?: string;
  readonly namespace?: ReadonlyMap<string, string>;
  readonly banner?: string;
  readonly footer?: string;
}

/**
 * Tracks the source position of a module within the concatenated output.
 */
export interface SourcePosition {
  readonly moduleId: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly startOffset: number;
  readonly endOffset: number;
}

/**
 * Result of module concatenation.
 */
export interface ConcatenateResult {
  readonly code: string;
  readonly map?: ReadonlyArray<SourcePosition>;
}

/**
 * Count the number of newline characters in a string.
 *
 * @param str - The string to count newlines in
 * @returns The number of newlines found
 */
const countNewlines = (str: string): number => {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\n") {
      count++;
    }
  }
  return count;
};

/**
 * Get the column offset after the last newline in a string.
 * If no newline exists, returns the full string length added to the given base column.
 *
 * @param str - The string to examine
 * @param baseColumn - The starting column if no newline is found
 * @returns The column position after the last newline
 */
const getLastLineColumn = (str: string, baseColumn: number): number => {
  const lastNewline = str.lastIndexOf("\n");
  if (lastNewline === -1) {
    return baseColumn + str.length;
  }
  return str.length - lastNewline - 1;
};

/**
 * Wrap module code in a namespace IIFE.
 *
 * @param code - The module code to wrap
 * @param namespaceName - The namespace variable name
 * @returns The wrapped code
 */
const wrapNamespace = (code: string, namespaceName: string): string => {
  return `var ${namespaceName} = (function() {\n${code}\n})();`;
};

/**
 * Concatenate an ordered array of rendered modules into a single chunk.
 * Handles separators between modules, applies namespace wrappers where needed,
 * and tracks source positions for source map offset calculation.
 *
 * @param modules - Ordered array of rendered modules
 * @param options - Concatenation options (separator, namespace map, banner, footer)
 * @returns The concatenated code and source position map
 */
export const concatenateModules = (
  modules: ReadonlyArray<RenderedModule>,
  options?: ConcatenateOptions,
): ConcatenateResult => {
  const separator = options?.separator ?? "\n\n";
  const namespaceMap = options?.namespace;
  const banner = options?.banner ?? "";
  const footer = options?.footer ?? "";

  if (modules.length === 0) {
    const code = banner + footer;
    return { code, map: [] };
  }

  const parts: Array<string> = [];
  const positions: Array<SourcePosition> = [];

  let currentLine = 0;
  let currentColumn = 0;
  let currentOffset = 0;

  // Add banner if present
  if (banner.length > 0) {
    parts.push(banner);
    currentLine += countNewlines(banner);
    currentColumn = getLastLineColumn(banner, currentColumn);
    currentOffset += banner.length;
  }

  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];

    // Add separator between modules (not before first if no banner)
    if (i > 0 || banner.length > 0) {
      parts.push(separator);
      currentLine += countNewlines(separator);
      currentColumn = getLastLineColumn(separator, currentColumn);
      currentOffset += separator.length;
    }

    // Resolve module code - prefer magicString.toString() if available
    const rawCode =
      mod.magicString !== undefined && mod.magicString !== null
        ? mod.magicString.toString()
        : mod.code;

    // Apply namespace wrapper if needed
    const moduleCode =
      namespaceMap !== undefined && namespaceMap.has(mod.id)
        ? wrapNamespace(rawCode, namespaceMap.get(mod.id)!)
        : rawCode;

    // Track start position
    const startLine = currentLine;
    const startColumn = currentColumn;
    const startOffset = currentOffset;

    // Add module code
    parts.push(moduleCode);

    // Calculate end position
    currentLine += countNewlines(moduleCode);
    currentColumn = getLastLineColumn(moduleCode, currentColumn);
    currentOffset += moduleCode.length;

    positions.push({
      moduleId: mod.id,
      startLine,
      startColumn,
      endLine: currentLine,
      endColumn: currentColumn,
      startOffset,
      endOffset: currentOffset,
    });
  }

  // Add footer if present
  if (footer.length > 0) {
    parts.push(separator);
    currentOffset += separator.length;
    currentLine += countNewlines(separator);
    currentColumn = getLastLineColumn(separator, currentColumn);
    parts.push(footer);
  }

  const code = parts.join("");
  return { code, map: positions };
};
