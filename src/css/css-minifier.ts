/**
 * @module css/css-minifier
 * @description CSS minifier that operates on the CSS AST.
 * Removes comments, collapses whitespace, shortens colors,
 * removes unnecessary semicolons/quotes, and merges duplicate selectors.
 */

import type {
  Stylesheet,
  Rule,
  Declaration,
  AtRule,
  CSSTopLevelNode,
  DeclarationOrNested,
  SelectorList,
} from "./css-ast.js";
import { printCSS } from "./css-printer.js";

/** Options for CSS minification. */
export interface CSSMinifyOptions {
  /** Remove comments. Default: true. */
  readonly removeComments?: boolean;
  /** Shorten color values. Default: true. */
  readonly shortenColors?: boolean;
  /** Merge duplicate selectors. Default: true. */
  readonly mergeDuplicateSelectors?: boolean;
  /** Remove unnecessary quotes in font-family. Default: true. */
  readonly removeQuotes?: boolean;
}

/**
 * Minify a CSS AST by removing comments, shortening values, and merging duplicates.
 *
 * @param ast - The CSS AST to minify.
 * @param options - Minification options.
 * @returns The minified CSS AST.
 */
export const minifyCSS = (
  ast: Stylesheet,
  options?: CSSMinifyOptions,
): Stylesheet => {
  const opts: Required<CSSMinifyOptions> = {
    removeComments: options?.removeComments ?? true,
    shortenColors: options?.shortenColors ?? true,
    mergeDuplicateSelectors: options?.mergeDuplicateSelectors ?? true,
    removeQuotes: options?.removeQuotes ?? true,
  };

  let rules = ast.rules;

  // Remove comments
  if (opts.removeComments) {
    rules = removeComments(rules);
  }

  // Shorten colors and values in declarations
  if (opts.shortenColors || opts.removeQuotes) {
    rules = shortenValues(rules, opts);
  }

  // Merge duplicate selectors
  if (opts.mergeDuplicateSelectors) {
    rules = mergeDuplicates(rules);
  }

  return {
    type: "Stylesheet",
    rules,
    loc: ast.loc,
  };
};

/**
 * Minify a CSS AST and print it as a minified string.
 *
 * @param ast - The CSS AST to minify.
 * @param options - Minification options.
 * @returns The minified CSS string.
 */
export const minifyCSSToString = (
  ast: Stylesheet,
  options?: CSSMinifyOptions,
): string => {
  const minified = minifyCSS(ast, options);
  return printCSS(minified, { minify: true });
};

/**
 * Remove comment nodes from the rule list.
 */
const removeComments = (
  rules: ReadonlyArray<CSSTopLevelNode>,
): ReadonlyArray<CSSTopLevelNode> => {
  const result: Array<CSSTopLevelNode> = [];

  for (const rule of rules) {
    if (rule.type === "Comment") {
      continue;
    }
    if (rule.type === "Rule") {
      const filteredDecls = rule.declarations.filter(
        (d) => d.type !== "Comment",
      );
      result.push({ ...rule, declarations: filteredDecls });
    } else if (rule.type === "AtRule" && rule.rules) {
      const filteredChildren = removeComments(
        rule.rules as ReadonlyArray<CSSTopLevelNode>,
      );
      result.push({ ...rule, rules: filteredChildren });
    } else {
      result.push(rule);
    }
  }

  return result;
};

/**
 * Shorten color values and remove unnecessary quotes.
 */
const shortenValues = (
  rules: ReadonlyArray<CSSTopLevelNode>,
  opts: Required<CSSMinifyOptions>,
): ReadonlyArray<CSSTopLevelNode> => {
  const result: Array<CSSTopLevelNode> = [];

  for (const rule of rules) {
    if (rule.type === "Rule") {
      const newDecls = rule.declarations.map((d) =>
        d.type === "Declaration" ? shortenDeclaration(d, opts) : d,
      );
      result.push({ ...rule, declarations: newDecls });
    } else if (rule.type === "AtRule" && rule.rules) {
      const children = shortenValues(
        rule.rules as ReadonlyArray<CSSTopLevelNode>,
        opts,
      );
      result.push({ ...rule, rules: children });
    } else {
      result.push(rule);
    }
  }

  return result;
};

/**
 * Shorten a single declaration's value.
 */
const shortenDeclaration = (
  decl: Declaration,
  opts: Required<CSSMinifyOptions>,
): Declaration => {
  let value = decl.value;

  if (opts.shortenColors) {
    value = shortenColorValue(value);
  }

  if (opts.removeQuotes) {
    // Remove unnecessary quotes in font-family
    if (decl.property === "font-family" || decl.property === "font") {
      value = removeUnnecessaryQuotes(value);
    }
  }

  // Collapse whitespace in values
  value = value.replace(/\s+/g, " ").trim();

  if (value === decl.value) {
    return decl;
  }

  return { ...decl, value };
};

/**
 * Shorten CSS color values.
 * - #ffffff -> #fff
 * - #aabbcc -> #abc
 * - rgb(255, 0, 0) -> red (for known color names shorter than hex)
 */
export const shortenColorValue = (value: string): string => {
  let result = value;

  // First, replace 6-digit hex with shorter named color if available
  result = result.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => {
    const lower = hex.toLowerCase();
    const name = HEX_TO_NAME[lower];
    if (name && name.length < hex.length) {
      return name;
    }
    return hex;
  });

  // Shorten 6-digit hex to 3-digit where possible: #aabbcc -> #abc
  result = result.replace(
    /#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3\b/g,
    "#$1$2$3",
  );

  // Replace known rgb() with shorter named colors
  result = result.replace(
    /\brgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g,
    (_match, r: string, g: string, b: string) => {
      const rn = parseInt(r, 10);
      const gn = parseInt(g, 10);
      const bn = parseInt(b, 10);
      const hex = `#${toHex(rn)}${toHex(gn)}${toHex(bn)}`;
      const shortName = HEX_TO_NAME[hex.toLowerCase()];
      if (shortName && shortName.length < hex.length) {
        return shortName;
      }
      // Try shortening the hex
      return shortenColorValue(hex);
    },
  );

  return result;
};

const toHex = (n: number): string => {
  const h = n.toString(16);
  return h.length === 1 ? "0" + h : h;
};

/** Map of hex colors to shorter named color equivalents. */
const HEX_TO_NAME: Readonly<Record<string, string>> = {
  "#ff0000": "red",
  "#008000": "green",
  "#0000ff": "blue",
  "#ffffff": "#fff",
  "#000000": "#000",
  "#ffff00": "yellow",
  "#ff00ff": "fuchsia",
  "#00ffff": "cyan",
  "#ffa500": "orange",
  "#800080": "purple",
  "#008080": "teal",
  "#000080": "navy",
  "#800000": "maroon",
  "#808080": "gray",
  "#c0c0c0": "silver",
  "#808000": "olive",
};

/**
 * Remove unnecessary quotes from font-family values.
 * Only removes quotes when the font name is a single unquoted identifier.
 */
const removeUnnecessaryQuotes = (value: string): string => {
  return value.replace(/['"]([A-Za-z][\w-]*)['"]/g, (_match, name: string) => {
    // Only unquote if it's a simple identifier (no spaces, not a CSS keyword)
    const keywords = new Set([
      "inherit",
      "initial",
      "unset",
      "revert",
      "serif",
      "sans-serif",
      "monospace",
      "cursive",
      "fantasy",
      "system-ui",
    ]);
    if (keywords.has(name.toLowerCase())) {
      return `"${name}"`;
    }
    return name;
  });
};

/**
 * Merge rules with duplicate selectors by combining their declarations.
 */
const mergeDuplicates = (
  rules: ReadonlyArray<CSSTopLevelNode>,
): ReadonlyArray<CSSTopLevelNode> => {
  const result: Array<CSSTopLevelNode> = [];
  const selectorMap = new Map<string, number>();

  for (const rule of rules) {
    if (rule.type !== "Rule") {
      result.push(rule);
      continue;
    }

    const key = selectorListToString(rule.selectors);
    const existingIdx = selectorMap.get(key);

    if (existingIdx !== undefined) {
      // Merge declarations into the existing rule
      const existing = result[existingIdx] as Rule;
      const mergedDecls = mergeDeclarations(
        existing.declarations,
        rule.declarations,
      );
      result[existingIdx] = { ...existing, declarations: mergedDecls };
    } else {
      selectorMap.set(key, result.length);
      result.push(rule);
    }
  }

  return result;
};

/**
 * Convert a SelectorList to a canonical string for comparison.
 */
const selectorListToString = (list: SelectorList): string => {
  return list.selectors
    .map((s) =>
      s.parts
        .map((p) => {
          switch (p.type) {
            case "ElementSelector":
              return p.name;
            case "ClassSelector":
              return "." + p.name;
            case "IdSelector":
              return "#" + p.name;
            case "UniversalSelector":
              return "*";
            case "NestingSelector":
              return "&";
            case "Combinator":
              return p.value;
            case "AttributeSelector":
              return `[${p.name}${p.operator ?? ""}${p.value ?? ""}]`;
            case "PseudoClassSelector":
              return `:${p.name}${p.args ? "(" + p.args + ")" : ""}`;
            case "PseudoElementSelector":
              return `::${p.name}${p.args ? "(" + p.args + ")" : ""}`;
            default:
              return "";
          }
        })
        .join(""),
    )
    .join(",");
};

/**
 * Merge two lists of declarations. Later declarations override earlier ones
 * for the same property.
 */
const mergeDeclarations = (
  existing: ReadonlyArray<DeclarationOrNested>,
  incoming: ReadonlyArray<DeclarationOrNested>,
): ReadonlyArray<DeclarationOrNested> => {
  const result: Array<DeclarationOrNested> = [...existing];

  for (const decl of incoming) {
    if (decl.type !== "Declaration") {
      result.push(decl);
      continue;
    }

    // Find existing declaration with same property
    let found = false;
    for (let i = 0; i < result.length; i++) {
      if (
        result[i].type === "Declaration" &&
        (result[i] as Declaration).property === decl.property
      ) {
        result[i] = decl;
        found = true;
        break;
      }
    }

    if (!found) {
      result.push(decl);
    }
  }

  return result;
};
