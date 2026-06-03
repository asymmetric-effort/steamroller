/**
 * @module css/css-concatenator
 * @description Concatenates resolved CSS files in dependency order.
 * Deduplicates @import'd files and produces a single combined stylesheet.
 */

import type { Stylesheet, CSSTopLevelNode, AtRule } from "./css-ast.js";

/** A CSS file entry with its path and parsed AST. */
export interface CSSFileEntry {
  /** The absolute path of the CSS file. */
  readonly filePath: string;
  /** The parsed AST of the CSS file. */
  readonly ast: Stylesheet;
}

/** Result of CSS concatenation. */
export interface CSSConcatResult {
  /** The concatenated stylesheet AST. */
  readonly ast: Stylesheet;
  /** File paths included in the output, in order. */
  readonly includedFiles: ReadonlyArray<string>;
}

/**
 * Concatenate multiple CSS files in dependency order.
 * Deduplicates files that appear multiple times and strips @import rules
 * from the concatenated output.
 *
 * @param files - CSS files in dependency order (deepest dependencies first).
 * @param rootFile - The root CSS file entry (included last).
 * @returns The concatenated result.
 */
export const concatenateCSS = (
  files: ReadonlyArray<CSSFileEntry>,
  rootFile: CSSFileEntry,
): CSSConcatResult => {
  const seen = new Set<string>();
  const allRules: Array<CSSTopLevelNode> = [];
  const includedFiles: Array<string> = [];

  // Process dependency files first (in order)
  for (const file of files) {
    if (seen.has(file.filePath)) {
      continue;
    }
    seen.add(file.filePath);
    includedFiles.push(file.filePath);

    const rulesWithoutImports = stripImportRules(file.ast.rules);
    for (const rule of rulesWithoutImports) {
      allRules.push(rule);
    }
  }

  // Process root file last
  if (!seen.has(rootFile.filePath)) {
    seen.add(rootFile.filePath);
    includedFiles.push(rootFile.filePath);
  }

  const rootRulesWithoutImports = stripImportRules(rootFile.ast.rules);
  for (const rule of rootRulesWithoutImports) {
    allRules.push(rule);
  }

  return {
    ast: {
      type: "Stylesheet",
      rules: allRules,
    },
    includedFiles,
  };
};

/**
 * Strip @import rules from a list of top-level rules.
 * These have already been resolved and concatenated.
 *
 * @param rules - The rules to filter.
 * @returns Rules without @import at-rules.
 */
const stripImportRules = (
  rules: ReadonlyArray<CSSTopLevelNode>,
): ReadonlyArray<CSSTopLevelNode> => {
  return rules.filter((rule) => {
    if (rule.type === "AtRule") {
      const atRule = rule as AtRule;
      return atRule.name !== "import";
    }
    return true;
  });
};
