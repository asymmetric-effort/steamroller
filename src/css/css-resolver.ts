/**
 * @module css/css-resolver
 * @description Resolves @import statements in CSS files.
 * Handles relative and absolute URLs, detects circular imports,
 * and returns a flat list of resolved CSS file paths in dependency order.
 */

import type { Stylesheet, AtRule } from "./css-ast.js";

/** A resolved CSS import with its file path and the imported stylesheet. */
export interface ResolvedCSSImport {
  /** The resolved absolute path to the imported CSS file. */
  readonly filePath: string;
  /** The original @import specifier. */
  readonly specifier: string;
  /** The media query attached to the @import, if any. */
  readonly media?: string;
}

/** Result of resolving all @imports in a stylesheet. */
export interface CSSResolveResult {
  /** All resolved imports in dependency order (deepest first). */
  readonly imports: ReadonlyArray<ResolvedCSSImport>;
  /** Circular dependency warnings, if any. */
  readonly warnings: ReadonlyArray<string>;
}

/**
 * Extract @import specifiers from a parsed CSS stylesheet.
 *
 * @param ast - The parsed stylesheet.
 * @returns An array of import specifiers with optional media queries.
 */
export const extractImports = (
  ast: Stylesheet,
): ReadonlyArray<{ specifier: string; media?: string }> => {
  const imports: Array<{ specifier: string; media?: string }> = [];

  for (const rule of ast.rules) {
    if (rule.type === "AtRule" && rule.name === "import") {
      const atRule = rule as AtRule;
      const params = atRule.params.trim();

      let specifier: string;
      let media: string | undefined;

      // Parse url("...") or "..." or '...'
      if (params.startsWith("url(")) {
        const urlMatch = params.match(/^url\(\s*['"]?([^'")\s]+)['"]?\s*\)/);
        if (urlMatch) {
          specifier = urlMatch[1];
          const rest = params.slice(urlMatch[0].length).trim();
          if (rest.length > 0) {
            media = rest;
          }
        } else {
          continue;
        }
      } else if (params.startsWith('"') || params.startsWith("'")) {
        const quote = params[0];
        const endQuote = params.indexOf(quote, 1);
        if (endQuote === -1) {
          continue;
        }
        specifier = params.slice(1, endQuote);
        const rest = params.slice(endQuote + 1).trim();
        if (rest.length > 0) {
          media = rest;
        }
      } else {
        continue;
      }

      imports.push({ specifier, media });
    }
  }

  return imports;
};

/**
 * Resolve a CSS import path relative to the importing file.
 *
 * @param specifier - The import specifier from the @import rule.
 * @param importer - The absolute path of the importing CSS file.
 * @returns The resolved absolute path.
 */
export const resolveImportPath = (
  specifier: string,
  importer: string,
): string => {
  // Skip URLs (http://, https://, //, data:)
  if (
    specifier.startsWith("http://") ||
    specifier.startsWith("https://") ||
    specifier.startsWith("//") ||
    specifier.startsWith("data:")
  ) {
    return specifier;
  }

  // Resolve relative paths
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const importerDir = importer.slice(0, importer.lastIndexOf("/"));
    return normalizePath(importerDir + "/" + specifier);
  }

  // Absolute paths
  if (specifier.startsWith("/")) {
    return specifier;
  }

  // Bare specifiers - resolve relative to importer directory
  const importerDir = importer.slice(0, importer.lastIndexOf("/"));
  return normalizePath(importerDir + "/" + specifier);
};

/**
 * Normalize a file path by resolving `.` and `..` segments.
 *
 * @param path - The path to normalize.
 * @returns The normalized path.
 */
const normalizePath = (path: string): string => {
  const parts = path.split("/");
  const normalized: Array<string> = [];

  for (const part of parts) {
    if (part === "." || part === "") {
      continue;
    }
    if (part === "..") {
      normalized.pop();
    } else {
      normalized.push(part);
    }
  }

  const prefix = path.startsWith("/") ? "/" : "";
  return prefix + normalized.join("/");
};

/**
 * Resolve all @import chains starting from a root file.
 * Detects circular imports and returns files in dependency order.
 *
 * @param rootPath - The absolute path of the root CSS file.
 * @param readFile - Function to read a file and return its parsed AST.
 * @returns The resolved imports in dependency order and any warnings.
 */
export const resolveImportGraph = async (
  rootPath: string,
  readFile: (filePath: string) => Promise<{ ast: Stylesheet; source: string }>,
): Promise<CSSResolveResult> => {
  const imports: Array<ResolvedCSSImport> = [];
  const warnings: Array<string> = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = async (filePath: string): Promise<void> => {
    if (visited.has(filePath)) {
      return;
    }

    if (visiting.has(filePath)) {
      warnings.push(`Circular @import detected: ${filePath}`);
      return;
    }

    visiting.add(filePath);

    let fileData: { ast: Stylesheet; source: string };
    try {
      fileData = await readFile(filePath);
    } catch {
      warnings.push(`Could not resolve @import: ${filePath}`);
      visiting.delete(filePath);
      return;
    }

    const fileImports = extractImports(fileData.ast);

    for (const imp of fileImports) {
      const resolved = resolveImportPath(imp.specifier, filePath);

      // Skip external URLs
      if (
        resolved.startsWith("http://") ||
        resolved.startsWith("https://") ||
        resolved.startsWith("//")
      ) {
        continue;
      }

      await visit(resolved);

      imports.push({
        filePath: resolved,
        specifier: imp.specifier,
        media: imp.media,
      });
    }

    visiting.delete(filePath);
    visited.add(filePath);
  };

  await visit(rootPath);

  return { imports, warnings };
};
