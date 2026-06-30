/**
 * Zero-dependency reimplementation of @rollup/pluginutils.
 *
 * Provides createFilter, dataToEsm, addExtension, makeLegalIdentifier,
 * extractAssignedNames, and type definitions used by Rollup plugins.
 *
 * @module utils/pluginutils
 */

import { globToRegex } from "./glob.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for {@link dataToEsm}. */
export interface DataToEsmOptions {
  readonly indent?: string;
  readonly preferConst?: boolean;
  readonly namedExports?: boolean;
  readonly compact?: boolean;
}

/**
 * Minimal AST node shape used by {@link extractAssignedNames}.
 * Compatible with ESTree / acorn / rollup AST nodes.
 */
export interface AstNode {
  readonly type: string;
  readonly name?: string;
  readonly left?: AstNode;
  readonly argument?: AstNode;
  readonly elements?: ReadonlyArray<AstNode | null>;
  readonly properties?: ReadonlyArray<AstNode>;
  readonly value?: AstNode;
  readonly key?: AstNode;
}

/** A single include / exclude filter entry. */
export type FilterPattern =
  string | RegExp | ReadonlyArray<string | RegExp> | null | undefined;

// ---------------------------------------------------------------------------
// Reserved words
// ---------------------------------------------------------------------------

/** ECMAScript reserved words that cannot be used as bare identifiers. */
const RESERVED_WORDS: ReadonlySet<string> = new Set([
  "abstract",
  "arguments",
  "await",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "double",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "final",
  "finally",
  "float",
  "for",
  "function",
  "goto",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "int",
  "interface",
  "let",
  "long",
  "native",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "volatile",
  "while",
  "with",
  "yield",
]);

// ---------------------------------------------------------------------------
// addExtension
// ---------------------------------------------------------------------------

/**
 * Append an extension to a filename when it has none.
 *
 * @param filename - The filename to check.
 * @param ext - Extension to add (default `".js"`).
 * @returns The filename, with the extension added if it was missing.
 */
export const addExtension = (filename: string, ext: string = ".js"): string => {
  // A filename has an extension if the last segment after the final '/'
  // (or the whole string if no '/') contains a dot that is not the first char.
  const lastSlash = filename.lastIndexOf("/");
  const basename = lastSlash === -1 ? filename : filename.slice(lastSlash + 1);
  const dotIdx = basename.lastIndexOf(".");
  if (dotIdx > 0) {
    return filename;
  }
  return filename + ext;
};

// ---------------------------------------------------------------------------
// makeLegalIdentifier
// ---------------------------------------------------------------------------

/** Characters allowed after the first position of a JS identifier. */
const IDENTIFIER_BODY_RE = /[^$_a-zA-Z0-9]/g;

/**
 * Turn an arbitrary string into a legal JavaScript identifier.
 *
 * - Replaces illegal characters with `_`.
 * - Prefixes with `_` when the result starts with a digit.
 * - Prefixes reserved words with `_`.
 *
 * @param str - The input string.
 * @returns A legal JS identifier.
 */
export const makeLegalIdentifier = (str: string): string => {
  const replaced = str.replace(IDENTIFIER_BODY_RE, "_");
  const result = /^\d/.test(replaced) ? "_" + replaced : replaced;
  if (RESERVED_WORDS.has(result)) {
    return "_" + result;
  }
  return result;
};

// ---------------------------------------------------------------------------
// createFilter
// ---------------------------------------------------------------------------

/**
 * Normalise a {@link FilterPattern} into an array of matchers.
 *
 * @param pattern - The include / exclude value.
 * @returns Array of RegExp matchers derived from the pattern.
 */
const normalisePattern = (pattern: FilterPattern): ReadonlyArray<RegExp> => {
  if (pattern == null) {
    return [];
  }
  if (Array.isArray(pattern)) {
    const result: Array<RegExp> = [];
    const len = pattern.length;
    let i = 0;
    while (i < len) {
      const entry = pattern[i];
      if (typeof entry === "string") {
        result.push(globToRegex(entry));
      } else if (entry instanceof RegExp) {
        result.push(entry);
      }
      i += 1;
    }
    return result;
  }
  if (typeof pattern === "string") {
    return [globToRegex(pattern)];
  }
  if (pattern instanceof RegExp) {
    return [pattern];
  }
  return [];
};

/**
 * Build a filter function from include/exclude patterns.
 *
 * - When `include` is omitted every id is included by default.
 * - When `exclude` is omitted nothing is excluded.
 * - Exclude always wins over include.
 *
 * @param include - Pattern(s) an id must match.
 * @param exclude - Pattern(s) that cause an id to be rejected.
 * @returns A predicate `(id: string) => boolean`.
 */
export const createFilter = (
  include?: FilterPattern,
  exclude?: FilterPattern,
): ((id: string) => boolean) => {
  const includeMatchers = normalisePattern(include);
  const excludeMatchers = normalisePattern(exclude);
  const hasInclude = includeMatchers.length > 0;

  return (id: string): boolean => {
    // Normalise path separators.
    const normalised = id.replace(/\\/g, "/");

    // Check excludes first — exclude always wins.
    const exLen = excludeMatchers.length;
    let ei = 0;
    while (ei < exLen) {
      if ((excludeMatchers[ei] as RegExp).test(normalised)) {
        return false;
      }
      ei += 1;
    }

    // If no include patterns were given, everything is included.
    if (!hasInclude) {
      return true;
    }

    // Otherwise, at least one include pattern must match.
    const inLen = includeMatchers.length;
    let ii = 0;
    while (ii < inLen) {
      if ((includeMatchers[ii] as RegExp).test(normalised)) {
        return true;
      }
      ii += 1;
    }

    return false;
  };
};

// ---------------------------------------------------------------------------
// dataToEsm
// ---------------------------------------------------------------------------

/**
 * Serialise a JavaScript value to an ES-module source string.
 *
 * @param data - The value to serialise.
 * @param options - Formatting options.
 * @returns ESM source code.
 */
export const dataToEsm = (
  data: unknown,
  options?: DataToEsmOptions,
): string => {
  const indent = options?.indent ?? "\t";
  const preferConst = options?.preferConst ?? false;
  const namedExports = options?.namedExports ?? true;
  const compact = options?.compact ?? false;

  const declarationKind = preferConst ? "const" : "var";
  const effectiveIndent = compact ? "" : indent;
  const newline = compact ? "" : "\n";
  const space = compact ? "" : " ";
  const separator = compact ? "," : ",\n";

  /**
   * Serialise a single value at a given depth (iterative for primitives,
   * iterative-stack for compound values is not needed since we only call
   * this helper for each value — the depth only controls indentation).
   */
  const serialise = (value: unknown, depth: number): string => {
    if (value === null) {
      return "null";
    }
    if (value === undefined) {
      return "undefined";
    }

    const valueType = typeof value;

    if (valueType === "string") {
      return JSON.stringify(value);
    }
    if (valueType === "number" || valueType === "boolean") {
      return String(value);
    }
    if (value instanceof RegExp) {
      return String(value);
    }
    if (value instanceof Date) {
      return "new Date(" + JSON.stringify(value.toISOString()) + ")";
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return "[]";
      }
      const childIndent = effectiveIndent.repeat(depth + 1);
      const closingIndent = compact ? "" : effectiveIndent.repeat(depth);
      const items: Array<string> = [];
      const arrLen = value.length;
      let ai = 0;
      while (ai < arrLen) {
        items.push(childIndent + serialise(value[ai] as unknown, depth + 1));
        ai += 1;
      }
      return (
        "[" + newline + items.join(separator) + newline + closingIndent + "]"
      );
    }

    // Plain object
    if (isPlainObject(value)) {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        return "{}";
      }
      const childIndent = effectiveIndent.repeat(depth + 1);
      const closingIndent = compact ? "" : effectiveIndent.repeat(depth);
      const entries: Array<string> = [];
      const objLen = keys.length;
      let oi = 0;
      while (oi < objLen) {
        const k = keys[oi] as string;
        const keyStr = isLegalIdentifier(k) ? k : JSON.stringify(k);
        entries.push(
          childIndent +
            keyStr +
            ":" +
            space +
            serialise(obj[k] as unknown, depth + 1),
        );
        oi += 1;
      }
      return (
        "{" + newline + entries.join(separator) + newline + closingIndent + "}"
      );
    }

    // Fallback — attempt JSON
    return JSON.stringify(value);
  };

  // Top-level: named exports vs default export
  if (namedExports && isPlainObject(data)) {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return "";
    }
    const lines: Array<string> = [];
    const topLen = keys.length;
    let ti = 0;
    while (ti < topLen) {
      const k = keys[ti] as string;
      const identifier = makeLegalIdentifier(k);
      const value = serialise(obj[k] as unknown, 0);
      lines.push(
        "export " +
          declarationKind +
          " " +
          identifier +
          " =" +
          space +
          value +
          ";",
      );
      ti += 1;
    }
    return lines.join(newline) + newline;
  }

  // namedExports=false — emit a default export
  // NOTE: default export exception — required by dataToEsm contract
  const value = serialise(data, 0);
  return "export default" + space + value + ";" + newline;
};

/**
 * Check whether a value is a plain object (not an array, date, regexp, etc.).
 *
 * @param value - The value to check.
 * @returns `true` for plain `{}` objects.
 */
const isPlainObject = (value: unknown): boolean => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  if (value instanceof RegExp || value instanceof Date) {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
};

/**
 * Check whether a string is already a legal JS identifier (no quoting needed).
 *
 * @param str - The string to test.
 * @returns `true` if it can be used as-is as a property key.
 */
const isLegalIdentifier = (str: string): boolean => {
  if (str.length === 0) {
    return false;
  }
  if (RESERVED_WORDS.has(str)) {
    return false;
  }
  return /^[a-zA-Z$_][a-zA-Z0-9$_]*$/.test(str);
};

// ---------------------------------------------------------------------------
// extractAssignedNames
// ---------------------------------------------------------------------------

/**
 * Extract assigned variable names from an ESTree destructuring pattern.
 *
 * Uses an iterative stack-based approach (no recursion).
 *
 * Supported node types:
 * - `Identifier`
 * - `ObjectPattern`
 * - `ArrayPattern`
 * - `RestElement`
 * - `AssignmentPattern`
 * - `Property` (object pattern properties)
 *
 * @param param - The AST node (pattern) to inspect.
 * @returns Array of extracted identifier names.
 */
export const extractAssignedNames = (param: AstNode): ReadonlyArray<string> => {
  const names: Array<string> = [];
  const stack: Array<AstNode> = [param];

  while (stack.length > 0) {
    const node = stack.pop() as AstNode;

    if (node.type === "Identifier") {
      if (node.name !== undefined) {
        names.push(node.name);
      }
      continue;
    }

    if (node.type === "ObjectPattern") {
      if (node.properties !== undefined) {
        const props = node.properties;
        const pLen = props.length;
        let pi = pLen - 1;
        // Push in reverse so we process in source order.
        while (pi >= 0) {
          const prop = props[pi] as AstNode;
          if (prop.type === "RestElement") {
            stack.push(prop);
          } else if (prop.value !== undefined) {
            stack.push(prop.value);
          }
          pi -= 1;
        }
      }
      continue;
    }

    if (node.type === "ArrayPattern") {
      if (node.elements !== undefined) {
        const elems = node.elements;
        const eLen = elems.length;
        let ei = eLen - 1;
        while (ei >= 0) {
          const elem = elems[ei];
          if (elem !== null && elem !== undefined) {
            stack.push(elem);
          }
          ei -= 1;
        }
      }
      continue;
    }

    if (node.type === "RestElement") {
      if (node.argument !== undefined) {
        stack.push(node.argument);
      }
      continue;
    }

    if (node.type === "AssignmentPattern") {
      if (node.left !== undefined) {
        stack.push(node.left);
      }
      continue;
    }
  }

  return names;
};

// ---------------------------------------------------------------------------
// attachScopes (stub)
// ---------------------------------------------------------------------------

/**
 * Attach scope information to an AST.
 *
 * @todo Implement scope attachment for full pluginutils compatibility.
 */
export const attachScopes = (): void => {
  // TODO: implement attachScopes
};
