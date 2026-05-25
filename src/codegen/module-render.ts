/**
 * @module codegen/module-render
 * @description Renders a single Module's output by making targeted edits to the
 * original source via MagicString, preserving formatting and enabling accurate
 * source maps.
 */

import { MagicString } from "../sourcemap/magic-string.js";
import type * as AST from "../ast/types.js";

/**
 * Options controlling how a module is rendered.
 */
export interface ModuleRenderOptions {
  readonly compact?: boolean;
  readonly format: "es" | "cjs" | "iife" | "umd" | "amd" | "system";
  readonly exportMode: "named" | "default" | "none" | "auto";
  readonly interop: string;
}

/**
 * Result of rendering a module.
 */
export interface RenderResult {
  readonly code: string;
  readonly magicString: MagicString;
}

/**
 * Describes how to rewrite an import declaration.
 */
export interface ImportRewrite {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

/**
 * Describes how to rewrite an export declaration.
 */
export interface ExportRewrite {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

/**
 * Binding descriptor for CJS import conversion.
 */
export interface BindingDescriptor {
  readonly local: string;
  readonly imported: string;
}

/**
 * Render a module by editing its source with MagicString.
 *
 * Performs the following transformations in order:
 * 1. Remove excluded (tree-shaken) statements
 * 2. Rewrite imports based on format
 * 3. Rewrite exports based on format
 * 4. Apply variable deconflictions
 *
 * @param source - The original module source code
 * @param ast - The parsed AST Program node
 * @param includedStatements - Set of start positions of statements to include
 * @param importRewrites - Import declaration rewrites to apply
 * @param exportRewrites - Export declaration rewrites to apply
 * @param deconflictions - Map of original name to deconflicted name
 * @param options - Rendering options (format, compact, etc.)
 * @returns The rendered code and MagicString instance
 */
export const renderModule = (
  source: string,
  ast: AST.Program,
  includedStatements: ReadonlySet<number>,
  importRewrites: ReadonlyArray<ImportRewrite>,
  exportRewrites: ReadonlyArray<ExportRewrite>,
  deconflictions: ReadonlyMap<string, string>,
  options: ModuleRenderOptions,
): RenderResult => {
  const ms = new MagicString(source);

  // 1. Remove excluded (tree-shaken) statements
  const body = ast.body;
  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!includedStatements.has(stmt.start)) {
      ms.remove(stmt.start, stmt.end);
    }
  }

  // 2. Rewrite imports based on format
  for (let i = 0; i < importRewrites.length; i++) {
    const rewrite = importRewrites[i];
    ms.overwrite(rewrite.start, rewrite.end, rewrite.replacement);
  }

  // 3. Rewrite exports based on format
  for (let i = 0; i < exportRewrites.length; i++) {
    const rewrite = exportRewrites[i];
    ms.overwrite(rewrite.start, rewrite.end, rewrite.replacement);
  }

  // 4. Apply variable deconflictions
  applyDeconflictions(ms, source, deconflictions);

  // 5. Apply compact mode if requested
  const code =
    options.compact === true ? compactOutput(ms.toString()) : ms.toString();

  if (options.compact === true) {
    // Re-create MagicString with compacted code for consistency
    const compactMs = new MagicString(code);
    return { code, magicString: compactMs };
  }

  return { code, magicString: ms };
};

/**
 * Apply variable deconflictions by finding identifier occurrences in source.
 * Uses word-boundary matching to avoid partial replacements.
 *
 * @param ms - The MagicString instance to modify
 * @param source - The original source code
 * @param deconflictions - Map of original name to deconflicted name
 */
const applyDeconflictions = (
  ms: MagicString,
  source: string,
  deconflictions: ReadonlyMap<string, string>,
): void => {
  if (deconflictions.size === 0) {
    return;
  }

  // Build a list of all replacements to apply, sorted by position descending
  // so later replacements don't shift earlier positions
  const replacements: Array<{ start: number; end: number; text: string }> = [];

  for (const [original, deconflicted] of deconflictions) {
    const pattern = new RegExp(`\\b${escapeRegExp(original)}\\b`, "g");
    let match: RegExpExecArray | null = pattern.exec(source);
    while (match !== null) {
      replacements.push({
        start: match.index,
        end: match.index + original.length,
        text: deconflicted,
      });
      match = pattern.exec(source);
    }
  }

  // Sort descending by start position so we apply from end to beginning
  replacements.sort((a, b) => b.start - a.start);

  for (let i = 0; i < replacements.length; i++) {
    const r = replacements[i];
    ms.overwrite(r.start, r.end, r.text);
  }
};

/**
 * Escape special regex characters in a string.
 *
 * @param str - The string to escape
 * @returns The escaped string safe for use in RegExp
 */
const escapeRegExp = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Compact output by removing unnecessary whitespace.
 * Collapses multiple newlines to single newline, trims lines.
 *
 * @param code - The code to compact
 * @returns The compacted code
 */
const compactOutput = (code: string): string => {
  // Remove empty lines and collapse whitespace
  const lines = code.split("\n");
  const result: Array<string> = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      result.push(trimmed);
    }
  }
  return result.join("\n");
};

/**
 * Generate an import rewrite for ES format.
 * Imports stay as-is structurally, only the source path is updated.
 *
 * @param importDecl - The import declaration AST node
 * @param resolvedPath - The resolved import path
 * @returns An ImportRewrite describing the source path replacement
 */
export const generateEsImportRewrite = (
  importDecl: AST.ImportDeclaration,
  resolvedPath: string,
): ImportRewrite => {
  const source = importDecl.source;
  return {
    start: source.start,
    end: source.end,
    replacement: `'${resolvedPath}'`,
  };
};

/**
 * Generate an import rewrite for CJS format.
 * Converts ES import statement to a require() call with destructuring.
 *
 * @param importDecl - The import declaration AST node
 * @param resolvedPath - The resolved import path
 * @param bindings - The binding descriptors (local/imported names)
 * @returns An ImportRewrite converting the import to require()
 */
export const generateCjsImportRewrite = (
  importDecl: AST.ImportDeclaration,
  resolvedPath: string,
  bindings: ReadonlyArray<BindingDescriptor>,
): ImportRewrite => {
  const destructured = bindings
    .map((b) =>
      b.imported === b.local ? b.local : `${b.imported}: ${b.local}`,
    )
    .join(", ");
  const requireCall = `const { ${destructured} } = require('${resolvedPath}');`;
  return {
    start: importDecl.start,
    end: importDecl.end,
    replacement: requireCall,
  };
};

/**
 * Generate an export rewrite for ES format (named exports).
 * Preserves the export statement but may adjust exported names.
 *
 * @param exportDecl - The export declaration AST node
 * @param exportedNames - Array of names to export
 * @returns An ExportRewrite for the declaration
 */
export const generateEsExportRewrite = (
  exportDecl: AST.ExportNamedDeclaration,
  exportedNames: ReadonlyArray<{
    readonly local: string;
    readonly exported: string;
  }>,
): ExportRewrite => {
  const specifiers = exportedNames
    .map((n) =>
      n.local === n.exported ? n.local : `${n.local} as ${n.exported}`,
    )
    .join(", ");
  return {
    start: exportDecl.start,
    end: exportDecl.end,
    replacement: `export { ${specifiers} };`,
  };
};

/**
 * Generate an export rewrite for CJS format.
 * Converts ES export to module.exports/exports assignment.
 *
 * @param exportDecl - The export declaration AST node
 * @param exportedNames - Array of names to export
 * @returns An ExportRewrite converting the export to CJS assignment
 */
export const generateCjsExportRewrite = (
  exportDecl: AST.ExportNamedDeclaration,
  exportedNames: ReadonlyArray<{
    readonly local: string;
    readonly exported: string;
  }>,
): ExportRewrite => {
  const assignments = exportedNames
    .map((n) => `exports.${n.exported} = ${n.local};`)
    .join("\n");
  return {
    start: exportDecl.start,
    end: exportDecl.end,
    replacement: assignments,
  };
};

/**
 * Generate a default export rewrite for CJS format.
 *
 * @param exportDecl - The export default declaration AST node
 * @param localName - The local variable name for the default export
 * @returns An ExportRewrite converting to module.exports assignment
 */
export const generateCjsDefaultExportRewrite = (
  exportDecl: AST.ExportDefaultDeclaration,
  localName: string,
): ExportRewrite => {
  return {
    start: exportDecl.start,
    end: exportDecl.end,
    replacement: `module.exports = ${localName};`,
  };
};

/**
 * Generate a namespace import rewrite for CJS format.
 * Converts `import * as ns from '...'` to `const ns = require('...')`.
 *
 * @param importDecl - The import declaration AST node
 * @param resolvedPath - The resolved import path
 * @param localName - The local namespace binding name
 * @returns An ImportRewrite for the namespace import
 */
export const generateCjsNamespaceImportRewrite = (
  importDecl: AST.ImportDeclaration,
  resolvedPath: string,
  localName: string,
): ImportRewrite => {
  return {
    start: importDecl.start,
    end: importDecl.end,
    replacement: `const ${localName} = require('${resolvedPath}');`,
  };
};

/**
 * Generate a default import rewrite for CJS format.
 * Converts `import foo from '...'` to
 * `const foo = require('...').default || require('...')`.
 *
 * @param importDecl - The import declaration AST node
 * @param resolvedPath - The resolved import path
 * @param localName - The local binding name
 * @param interop - The interop mode string
 * @returns An ImportRewrite for the default import
 */
export const generateCjsDefaultImportRewrite = (
  importDecl: AST.ImportDeclaration,
  resolvedPath: string,
  localName: string,
  interop: string,
): ImportRewrite => {
  const replacement =
    interop === "default"
      ? `const ${localName} = require('${resolvedPath}').default;`
      : `const ${localName} = require('${resolvedPath}');`;
  return {
    start: importDecl.start,
    end: importDecl.end,
    replacement,
  };
};
