/**
 * @module minify/minifier
 * @description A basic JavaScript minifier that removes comments, collapses
 * whitespace, removes unnecessary semicolons, performs simple variable
 * mangling, and removes unnecessary parentheses.
 */

/**
 * Options for controlling the minification pass.
 */
export interface MinifyOptions {
  /** Remove single-line and multi-line comments (preserves legal comments). Default: true */
  readonly removeComments?: boolean;
  /** Collapse multiple whitespace characters into a single space. Default: true */
  readonly collapseWhitespace?: boolean;
  /** Remove semicolons before closing braces. Default: true */
  readonly removeUnnecessarySemicolons?: boolean;
  /** Rename local variables to short names (a, b, c, ...). Default: false */
  readonly mangle?: boolean;
  /** Remove unnecessary parentheses where safe. Default: true */
  readonly removeUnnecessaryParentheses?: boolean;
}

const DEFAULT_OPTIONS: Required<MinifyOptions> = {
  removeComments: true,
  collapseWhitespace: true,
  removeUnnecessarySemicolons: true,
  mangle: false,
  removeUnnecessaryParentheses: true,
};

/**
 * Removes JavaScript comments from code while preserving legal comments
 * (those starting with /*!).
 *
 * Handles strings and template literals to avoid false positives inside
 * quoted text. Regular expression literals are handled heuristically.
 *
 * @param code - The source code to process
 * @returns The code with non-legal comments removed
 */
const removeComments = (code: string): string => {
  let result = "";
  let i = 0;
  const len = code.length;

  while (i < len) {
    const ch = code[i];

    // Handle string literals
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      result += ch;
      i++;
      while (i < len) {
        const sc = code[i];
        if (sc === "\\") {
          result += sc;
          i++;
          if (i < len) {
            result += code[i];
            i++;
          }
          continue;
        }
        if (sc === quote) {
          // For template literals, check if this is an interpolation
          result += sc;
          i++;
          break;
        }
        result += sc;
        i++;
      }
      continue;
    }

    // Handle comments
    if (ch === "/" && i + 1 < len) {
      const next = code[i + 1];

      // Single-line comment
      if (next === "/") {
        // Skip until end of line
        i += 2;
        while (i < len && code[i] !== "\n") {
          i++;
        }
        continue;
      }

      // Multi-line comment
      if (next === "*") {
        // Check if this is a legal comment /*! ... */
        const isLegal = i + 2 < len && code[i + 2] === "!";
        if (isLegal) {
          // Preserve legal comment
          const endIdx = code.indexOf("*/", i + 2);
          if (endIdx === -1) {
            // Unterminated comment, preserve rest
            result += code.slice(i);
            i = len;
          } else {
            result += code.slice(i, endIdx + 2);
            i = endIdx + 2;
          }
        } else {
          // Skip non-legal multi-line comment
          const endIdx = code.indexOf("*/", i + 2);
          if (endIdx === -1) {
            // Unterminated, skip rest
            i = len;
          } else {
            i = endIdx + 2;
          }
        }
        continue;
      }
    }

    result += ch;
    i++;
  }

  return result;
};

/**
 * Collapses runs of whitespace (spaces, tabs, newlines) into single spaces.
 * Preserves whitespace inside string literals.
 *
 * @param code - The source code to process
 * @returns The code with collapsed whitespace
 */
const collapseWhitespace = (code: string): string => {
  let result = "";
  let i = 0;
  const len = code.length;

  while (i < len) {
    const ch = code[i];

    // Handle string literals — preserve their whitespace
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      result += ch;
      i++;
      while (i < len) {
        const sc = code[i];
        if (sc === "\\") {
          result += sc;
          i++;
          if (i < len) {
            result += code[i];
            i++;
          }
          continue;
        }
        if (sc === quote) {
          result += sc;
          i++;
          break;
        }
        result += sc;
        i++;
      }
      continue;
    }

    // Collapse whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      // Consume all consecutive whitespace
      while (
        i < len &&
        (code[i] === " " ||
          code[i] === "\t" ||
          code[i] === "\n" ||
          code[i] === "\r")
      ) {
        i++;
      }
      result += " ";
      continue;
    }

    result += ch;
    i++;
  }

  return result.trim();
};

/**
 * Removes semicolons that immediately precede a closing brace `}`.
 * This is always safe in JavaScript since ASI handles the case.
 *
 * @param code - The source code to process
 * @returns The code with unnecessary semicolons removed
 */
const removeUnnecessarySemicolons = (code: string): string => {
  let result = "";
  let i = 0;
  const len = code.length;

  while (i < len) {
    const ch = code[i];

    // Handle string literals
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      result += ch;
      i++;
      while (i < len) {
        const sc = code[i];
        if (sc === "\\") {
          result += sc;
          i++;
          if (i < len) {
            result += code[i];
            i++;
          }
          continue;
        }
        if (sc === quote) {
          result += sc;
          i++;
          break;
        }
        result += sc;
        i++;
      }
      continue;
    }

    if (ch === ";") {
      // Look ahead past whitespace to see if next non-whitespace is }
      let j = i + 1;
      while (
        j < len &&
        (code[j] === " " || code[j] === "\t" || code[j] === "\n")
      ) {
        j++;
      }
      if (j < len && code[j] === "}") {
        // Skip the semicolon
        i++;
        continue;
      }
    }

    result += ch;
    i++;
  }

  return result;
};

/**
 * Set of JavaScript keywords and built-in identifiers that must never be
 * renamed by the mangler.
 */
const RESERVED_WORDS = new Set([
  // Language keywords
  "break",
  "case",
  "catch",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "finally",
  "for",
  "function",
  "if",
  "in",
  "instanceof",
  "new",
  "return",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  // ES6+
  "class",
  "const",
  "export",
  "extends",
  "import",
  "super",
  "yield",
  "let",
  "static",
  "async",
  "await",
  "of",
  "from",
  "as",
  // Literals
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity",
  // Common globals
  "console",
  "window",
  "document",
  "global",
  "globalThis",
  "process",
  "require",
  "module",
  "exports",
  "arguments",
  "Math",
  "JSON",
  "Array",
  "Object",
  "String",
  "Number",
  "Boolean",
  "Symbol",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Promise",
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "RegExp",
  "Date",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "eval",
  "Function",
]);

/**
 * Generates the next short variable name in a sequence:
 * a, b, c, ..., z, aa, ab, ..., az, ba, ...
 *
 * @param index - The zero-based index of the name to generate
 * @returns A short variable name
 */
const generateShortName = (index: number): string => {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(97 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
};

/**
 * Extracts local variable declarations from function/block scopes that
 * are not exported, then renames them to short identifiers (a, b, c, ...).
 *
 * This is a simple heuristic mangler that finds `var`, `let`, and `const`
 * declarations inside function bodies and renames the declared identifiers.
 * It does NOT handle destructuring, default parameters, or other complex
 * patterns. It only operates on non-exported scopes.
 *
 * @param code - The source code to process
 * @returns The code with local variables renamed
 */
const mangleVariables = (code: string): string => {
  // Find local variable declarations: var/let/const name
  // We look for declarations inside braces (function/block scope)
  // and exclude any that are at the top level (potentially exported).

  // Strategy: find all { ... } blocks that represent function bodies
  // and rename var/let/const declarations inside them.

  // Step 1: Find all declared local variable names inside function bodies
  // A function body starts after "function ...(...) {" or "=> {"
  // We use a simple regex to find var/let/const declarations inside braces

  // First, figure out which brace depth ranges are "local" (inside a function)
  const localVarNames = new Set<string>();

  // Find var/let/const declarations at non-zero brace depth
  let braceDepth = 0;
  let idx = 0;
  const codeLen = code.length;
  while (idx < codeLen) {
    const ch = code[idx];
    // Skip strings
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      idx++;
      while (idx < codeLen) {
        if (code[idx] === "\\") {
          idx += 2;
          continue;
        }
        if (code[idx] === q) {
          idx++;
          break;
        }
        idx++;
      }
      continue;
    }

    if (ch === "{") {
      braceDepth++;
      idx++;
      continue;
    }
    if (ch === "}") {
      braceDepth--;
      idx++;
      continue;
    }

    // Look for var/let/const at depth > 0
    if (braceDepth > 0) {
      const declMatch = matchDeclaration(code, idx);
      if (declMatch !== null) {
        const varName = declMatch.name;
        if (!RESERVED_WORDS.has(varName)) {
          localVarNames.add(varName);
        }
        idx = declMatch.end;
        continue;
      }
    }

    idx++;
  }

  if (localVarNames.size === 0) {
    return code;
  }

  // Step 2: Build a rename map, skipping names that collide with reserved words
  // or with other identifiers used in the code
  const existingNames = new Set<string>();
  // Gather all identifiers already in the code to avoid collision
  const identRegex = /\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g;
  let m: RegExpExecArray | null;
  while ((m = identRegex.exec(code)) !== null) {
    if (!localVarNames.has(m[0])) {
      existingNames.add(m[0]);
    }
  }

  const renameMap = new Map<string, string>();
  let nameIndex = 0;
  for (const varName of localVarNames) {
    let shortName: string;
    do {
      shortName = generateShortName(nameIndex);
      nameIndex++;
    } while (
      RESERVED_WORDS.has(shortName) ||
      existingNames.has(shortName) ||
      localVarNames.has(shortName)
    );
    renameMap.set(varName, shortName);
    existingNames.add(shortName);
  }

  // Step 3: Replace all occurrences of renamed variables with their short names
  // Use word-boundary matching to avoid partial replacements
  let result = code;
  for (const [original, short] of renameMap) {
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "g");
    result = result.replace(pattern, short);
  }

  return result;
};

/**
 * Try to match a var/let/const declaration at position `pos` in code.
 * Returns the variable name and end position, or null if no match.
 */
const matchDeclaration = (
  code: string,
  pos: number,
): { name: string; end: number } | null => {
  const keywords = ["var ", "let ", "const "];
  for (const kw of keywords) {
    if (code.startsWith(kw, pos)) {
      // Check that the character before is a word boundary
      if (pos > 0) {
        const before = code[pos - 1];
        if (/[a-zA-Z0-9_$]/.test(before)) {
          return null;
        }
      }
      let j = pos + kw.length;
      // Skip whitespace after keyword
      while (j < code.length && (code[j] === " " || code[j] === "\t")) {
        j++;
      }
      // Read identifier
      const identStart = j;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) {
        j++;
      }
      if (j > identStart) {
        return { name: code.slice(identStart, j), end: j };
      }
    }
  }
  return null;
};

/**
 * Removes unnecessary parentheses around simple expressions where safe.
 * Targets patterns like `return (expr)` and `(identifier)` used as
 * statements.
 *
 * @param code - The source code to process
 * @returns The code with unnecessary parentheses removed
 */
const removeUnnecessaryParentheses = (code: string): string => {
  // Remove parens in `return (expr)` where expr is a simple value
  // Pattern: return (simpleExpr); -> return simpleExpr;
  let result = code.replace(
    /\breturn\s+\(([a-zA-Z_$][a-zA-Z0-9_$]*)\)/g,
    "return $1",
  );

  // Remove parens around simple identifiers in typeof: typeof(x) -> typeof x
  result = result.replace(
    /\btypeof\s*\(([a-zA-Z_$][a-zA-Z0-9_$]*)\)/g,
    "typeof $1",
  );

  // Remove double parentheses: ((expr)) -> (expr)
  result = result.replace(/\(\(([^()]+)\)\)/g, "($1)");

  return result;
};

/**
 * Minifies JavaScript source code by applying the selected transformations.
 *
 * @param code - The JavaScript source code to minify
 * @param options - Optional configuration to control which passes run
 * @returns The minified code string
 */
export const minify = (code: string, options?: MinifyOptions): string => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  let result = code;

  if (opts.removeComments) {
    result = removeComments(result);
  }

  if (opts.collapseWhitespace) {
    result = collapseWhitespace(result);
  }

  if (opts.removeUnnecessarySemicolons) {
    result = removeUnnecessarySemicolons(result);
  }

  if (opts.mangle) {
    result = mangleVariables(result);
  }

  if (opts.removeUnnecessaryParentheses) {
    result = removeUnnecessaryParentheses(result);
  }

  return result;
};
