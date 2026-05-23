/**
 * AST reference detection and source position mapping utilities.
 *
 * Provides isReference() to determine if an AST node represents a
 * variable reference (vs declaration, property key, or label), and
 * locateCharacter() to map a byte offset to a line/column position.
 *
 * @module utils/ast-utils
 */

/** Minimal AST node shape needed for reference detection. */
export interface AstNode {
  readonly type: string;
  readonly name?: string;
  readonly computed?: boolean;
  readonly key?: AstNode;
  readonly object?: AstNode;
  readonly property?: AstNode;
  readonly label?: AstNode;
  readonly left?: AstNode;
}

/** A source position expressed as line number and column offset. */
export interface SourceLocation {
  readonly line: number;
  readonly column: number;
}

/**
 * Detect whether an AST node is a reference (vs a declaration,
 * property key, or label) based on its relationship to its parent.
 *
 * @param node - The AST node to check.
 * @param parent - The parent AST node.
 * @returns true if the node is used as a reference.
 */
export const isReference = (node: AstNode, parent: AstNode): boolean => {
  if (parent.type === "MemberExpression") {
    return parent.object === node || (parent.computed === true && parent.property === node);
  }

  if (parent.type === "Property") {
    return parent.computed === true || parent.key !== node;
  }

  if (parent.type === "MethodDefinition") {
    return parent.computed === true || parent.key !== node;
  }

  if (
    parent.type === "LabeledStatement" ||
    parent.type === "BreakStatement" ||
    parent.type === "ContinueStatement"
  ) {
    return parent.label !== node;
  }

  if (parent.type === "VariableDeclarator") {
    return parent.left !== node;
  }

  return true;
};

/**
 * Map a byte offset to its line and column position in source text.
 * Lines are 1-indexed; columns are 0-indexed.
 *
 * @param source - The source text.
 * @param index - The byte offset to locate.
 * @returns The line/column position, or null if the index is out of bounds.
 */
export const locateCharacter = (source: string, index: number): SourceLocation | null => {
  if (index < 0 || index > source.length) {
    return null;
  }

  const lineOffsets: Array<number> = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      lineOffsets.push(i + 1);
    }
  }

  /* Iterative binary search to find the line containing the index. */
  let low = 0;
  let high = lineOffsets.length - 1;

  while (low < high) {
    const mid = (low + high + 1) >>> 1;
    if (lineOffsets[mid] <= index) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return { line: low + 1, column: index - lineOffsets[low] };
};
