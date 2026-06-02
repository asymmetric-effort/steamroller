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

  // 4. Apply variable deconflictions using AST-aware renaming
  applyDeconflictions(ms, source, ast, deconflictions);

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
 * Context used when collecting identifier references from the AST.
 * Tracks whether a node is a shorthand property value so the replacement
 * can expand `{ foo }` to `{ foo: newName }`.
 */
interface IdentifierRef {
  readonly start: number;
  readonly end: number;
  readonly name: string;
  /** When true, the identifier is the value of a shorthand property. */
  readonly shorthandValue: boolean;
  /** For shorthand properties, the key start position (same as value start). */
  readonly shorthandKeyStart: number;
  /** For shorthand properties, the key end position. */
  readonly shorthandKeyEnd: number;
}

/**
 * Apply variable deconflictions by walking the AST to find identifier
 * references that need renaming. Only renames actual identifier references,
 * not occurrences inside string literals, template literal quasis, comments,
 * or non-computed property keys.
 *
 * For shorthand properties like `{ foo }`, expands to `{ foo: newName }`.
 *
 * @param ms - The MagicString instance to modify
 * @param source - The original source code
 * @param ast - The parsed AST Program node
 * @param deconflictions - Map of original name to deconflicted name
 */
const applyDeconflictions = (
  ms: MagicString,
  source: string,
  ast: AST.Program,
  deconflictions: ReadonlyMap<string, string>,
): void => {
  if (deconflictions.size === 0) {
    return;
  }

  // Collect all identifier references from the AST that match names we need
  // to rename
  const refs = collectIdentifierRefs(ast, deconflictions);

  // Sort descending by start position so later replacements don't shift
  // earlier positions
  refs.sort((a, b) => b.start - a.start);

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    const newName = deconflictions.get(ref.name);
    if (newName === undefined) {
      continue;
    }
    if (ref.shorthandValue) {
      // Expand shorthand `{ foo }` to `{ foo: newName }`
      ms.overwrite(
        ref.shorthandKeyStart,
        ref.shorthandKeyEnd,
        `${ref.name}: ${newName}`,
      );
    } else {
      ms.overwrite(ref.start, ref.end, newName);
    }
  }
};

/**
 * Collect all Identifier nodes from the AST that are actual variable
 * references and whose names appear in the deconflictions map.
 *
 * Skips identifiers that are:
 * - Non-computed property keys in member expressions (obj.foo)
 * - Non-computed, non-shorthand property keys in object literals
 * - Label identifiers
 * - Import/export specifier nodes (these are rewritten separately)
 *
 * For shorthand properties `{ foo }`, marks the reference so it can be
 * expanded to `{ foo: newName }`.
 */
const collectIdentifierRefs = (
  ast: AST.Program,
  deconflictions: ReadonlyMap<string, string>,
): IdentifierRef[] => {
  const refs: IdentifierRef[] = [];

  // Use an iterative stack-based walk to avoid deep recursion
  // Each entry: [node, parentContext]
  // parentContext helps us know when to skip an identifier
  type StackEntry = {
    node: Record<string, unknown>;
    /** If this identifier is the property of a non-computed MemberExpression */
    skipAsProperty?: boolean;
    /** If this identifier is the key of a non-shorthand, non-computed Property */
    skipAsKey?: boolean;
    /** If this identifier is inside an import/export declaration specifier */
    skipAsModuleSpecifier?: boolean;
    /** If this is a shorthand property value */
    shorthandProperty?: AST.Property;
  };

  const stack: StackEntry[] = [];

  // Seed the stack with top-level body nodes
  for (let i = ast.body.length - 1; i >= 0; i--) {
    stack.push({ node: ast.body[i] as unknown as Record<string, unknown> });
  }

  while (stack.length > 0) {
    const entry = stack.pop()!;
    const node = entry.node;
    const type = node["type"] as string;

    if (type === undefined) {
      continue;
    }

    // Handle Identifier nodes
    if (type === "Identifier") {
      if (
        entry.skipAsProperty ||
        entry.skipAsKey ||
        entry.skipAsModuleSpecifier
      ) {
        continue;
      }
      const name = node["name"] as string;
      if (!deconflictions.has(name)) {
        continue;
      }
      const start = node["start"] as number;
      const end = node["end"] as number;
      if (entry.shorthandProperty !== undefined) {
        const prop = entry.shorthandProperty;
        refs.push({
          start,
          end,
          name,
          shorthandValue: true,
          shorthandKeyStart: prop.key.start,
          shorthandKeyEnd: prop.value.end,
        });
      } else {
        refs.push({
          start,
          end,
          name,
          shorthandValue: false,
          shorthandKeyStart: 0,
          shorthandKeyEnd: 0,
        });
      }
      continue;
    }

    // Skip string literals and template element quasis entirely
    if (type === "Literal" || type === "TemplateElement") {
      continue;
    }

    // For MemberExpression: skip the property if non-computed
    if (type === "MemberExpression") {
      const computed = node["computed"] as boolean;
      const object = node["object"] as Record<string, unknown>;
      const property = node["property"] as Record<string, unknown>;
      if (object !== null && object !== undefined) {
        stack.push({ node: object });
      }
      if (property !== null && property !== undefined) {
        stack.push({ node: property, skipAsProperty: !computed });
      }
      continue;
    }

    // For Property nodes: handle shorthand and non-computed keys
    if (type === "Property") {
      const computed = node["computed"] as boolean;
      const shorthand = node["shorthand"] as boolean;
      const key = node["key"] as Record<string, unknown>;
      const value = node["value"] as Record<string, unknown>;

      if (shorthand) {
        // For shorthand `{ foo }`, key and value are the same Identifier.
        // We mark the value so replacement expands to `{ foo: newName }`.
        if (value !== null && value !== undefined) {
          stack.push({
            node: value,
            shorthandProperty: node as unknown as AST.Property,
          });
        }
      } else {
        // Non-shorthand: skip the key if non-computed (it's a literal property name)
        if (key !== null && key !== undefined) {
          stack.push({ node: key, skipAsKey: !computed });
        }
        if (value !== null && value !== undefined) {
          stack.push({ node: value });
        }
      }
      continue;
    }

    // For import/export declarations: skip specifier identifiers
    // (these are handled by import/export rewrites)
    if (
      type === "ImportDeclaration" ||
      type === "ExportNamedDeclaration" ||
      type === "ExportDefaultDeclaration" ||
      type === "ExportAllDeclaration"
    ) {
      // Skip entire import/export declarations - their specifiers are
      // rewritten by the import/export rewrite passes
      continue;
    }

    // For LabeledStatement: skip the label identifier
    if (type === "LabeledStatement") {
      const body = node["body"] as Record<string, unknown>;
      if (body !== null && body !== undefined) {
        stack.push({ node: body });
      }
      // Skip node["label"] - it's not a variable reference
      continue;
    }

    // For BreakStatement / ContinueStatement: skip the label
    if (type === "BreakStatement" || type === "ContinueStatement") {
      continue;
    }

    // For MethodDefinition / PropertyDefinition: handle computed keys
    if (type === "MethodDefinition" || type === "PropertyDefinition") {
      const computed = node["computed"] as boolean;
      const key = node["key"] as Record<string, unknown>;
      const value = node["value"] as Record<string, unknown>;
      if (key !== null && key !== undefined) {
        stack.push({ node: key, skipAsKey: !computed });
      }
      if (value !== null && value !== undefined) {
        stack.push({ node: value });
      }
      // Handle decorators
      const decorators = node["decorators"] as
        | ReadonlyArray<Record<string, unknown>>
        | undefined;
      if (decorators !== undefined) {
        for (let i = decorators.length - 1; i >= 0; i--) {
          stack.push({ node: decorators[i] });
        }
      }
      continue;
    }

    // For MetaProperty: skip both meta and property (e.g., import.meta)
    if (type === "MetaProperty") {
      continue;
    }

    // Generic traversal: push all child nodes that look like AST nodes
    // or arrays of AST nodes
    const keys = Object.keys(node);
    for (let k = keys.length - 1; k >= 0; k--) {
      const key = keys[k];
      // Skip non-child properties
      if (
        key === "type" ||
        key === "start" ||
        key === "end" ||
        key === "loc" ||
        key === "leadingComments" ||
        key === "trailingComments" ||
        key === "raw" ||
        key === "regex" ||
        key === "bigint" ||
        key === "sourceType" ||
        key === "directive" ||
        key === "operator" ||
        (key === "value" && type === "TemplateElement")
      ) {
        continue;
      }
      const child = node[key];
      if (child === null || child === undefined) {
        continue;
      }
      if (Array.isArray(child)) {
        for (let j = child.length - 1; j >= 0; j--) {
          const item = child[j];
          if (
            item !== null &&
            item !== undefined &&
            typeof item === "object" &&
            "type" in item
          ) {
            stack.push({ node: item as Record<string, unknown> });
          }
        }
      } else if (typeof child === "object" && "type" in (child as object)) {
        stack.push({ node: child as Record<string, unknown> });
      }
    }
  }

  return refs;
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
