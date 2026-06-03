/**
 * @module plugins/typescript-plugin
 * @description Built-in TypeScript type-stripping plugin for steamroller.
 * Strips erasable TypeScript syntax from .ts/.tsx files using regex/string-based
 * transforms, similar to Node 22's --experimental-strip-types.
 *
 * Handles: type annotations, interfaces, type aliases, type-only imports/exports,
 * generics, `as` assertions, `satisfies` expressions, and non-null assertions.
 *
 * Does NOT handle: enums, namespaces, parameter properties, decorators with
 * emit metadata, const enums, or legacy module syntax.
 */

import type { Plugin, TransformResult } from "../types.js";
import { parse } from "../parser/parser.js";
import { transformTypeScript } from "../transforms/typescript-transform.js";

/** Unsupported TypeScript features that require a full compiler. */
const UNSUPPORTED_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly feature: string;
}> = [
  {
    pattern: /\benum\s+[A-Za-z_$]/m,
    feature: "enum declarations",
  },
  {
    pattern: /\bnamespace\s+[A-Za-z_$]/m,
    feature: "namespace declarations",
  },
  {
    pattern: /\bconst\s+enum\s+/m,
    feature: "const enum declarations",
  },
  {
    pattern:
      /\bconstructor\s*\([^)]*\b(?:private|protected|public|readonly)\s+/m,
    feature: "parameter properties",
  },
  {
    pattern: /\bmodule\s+[A-Za-z_$"']/m,
    feature: "module declarations (legacy TS syntax)",
  },
];

/**
 * Check whether a file path is a TypeScript source file.
 *
 * @param id - The module ID / file path.
 * @returns True if the file has a .ts or .tsx extension.
 */
export const isTypeScriptFile = (id: string): boolean => {
  return /\.tsx?$/.test(id) && !id.endsWith(".d.ts");
};

/**
 * Strip TypeScript type annotations from source code.
 * Replaces type-only syntax with whitespace to preserve source positions.
 *
 * @param code - The TypeScript source code.
 * @param id - The module ID (for warning messages).
 * @param warn - Callback for emitting warnings about unsupported features.
 * @returns The stripped JavaScript code.
 */
export const stripTypescript = (
  code: string,
  id: string,
  warn: (message: string) => void,
): string => {
  // Check for unsupported features and emit warnings
  for (const { pattern, feature } of UNSUPPORTED_PATTERNS) {
    if (pattern.test(code)) {
      warn(
        `[typescript-plugin] File "${id}" contains ${feature}, which cannot be handled by type stripping. ` +
          `Use a full TypeScript plugin (e.g., @rollup/plugin-typescript) instead.`,
      );
    }
  }

  let result = code;

  // 1. Remove type-only imports: import type { X } from 'y'
  //    and import type X from 'y'
  result = result.replace(
    /^[ \t]*import\s+type\s+(?:\{[^}]*\}|[A-Za-z_$][\w$]*)\s*(?:from\s*)?['"][^'"]*['"][ \t]*;?[ \t]*$/gm,
    (match) => " ".repeat(match.length),
  );

  // 2. Remove type-only exports: export type { X } and export type { X } from 'y'
  result = result.replace(
    /^[ \t]*export\s+type\s+\{[^}]*\}(?:\s*from\s*['"][^'"]*['"])?[ \t]*;?[ \t]*$/gm,
    (match) => " ".repeat(match.length),
  );

  // 3. Remove interface declarations (including multi-line)
  result = stripBlockDeclaration(result, /^[ \t]*(?:export\s+)?interface\s+/m);

  // 4. Remove type alias declarations (including multi-line)
  result = stripTypeAliasDeclarations(result);

  // 5. Remove `declare` statements (single-line and block)
  result = stripBlockDeclaration(result, /^[ \t]*declare\s+/m);

  // 6. Strip inline `type` specifier from import/export braces:
  //    import { type Foo, Bar } from 'x' -> import {      Bar } from 'x'
  result = result.replace(
    /\{\s*type\s+[A-Za-z_$][\w$]*(?:\s+as\s+[A-Za-z_$][\w$]*)?\s*,/g,
    (match) => "{" + " ".repeat(match.length - 2) + ",",
  );
  result = result.replace(
    /,\s*type\s+[A-Za-z_$][\w$]*(?:\s+as\s+[A-Za-z_$][\w$]*)?\s*([,}])/g,
    (match, closing: string) =>
      "," + " ".repeat(match.length - 1 - closing.length) + closing,
  );

  // 7. Remove generic type parameters from function/class declarations and calls
  //    Handles nested angle brackets
  result = stripGenericTypeParameters(result);

  // 8. Remove `as` type assertions: value as Type
  result = result.replace(
    /\s+as\s+(?:const|(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?:<[^>]*>)?(?:\[\])*)/g,
    (match) => " ".repeat(match.length),
  );

  // 9. Remove `satisfies` expressions: value satisfies Type
  result = result.replace(
    /\s+satisfies\s+(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)(?:<[^>]*>)?(?:\[\])*/g,
    (match) => " ".repeat(match.length),
  );

  // 10. Remove non-null assertions: value!. -> value.  and value!) -> value)
  //     But NOT !== or !=
  result = result.replace(/!(?=\s*[.)\],;}\n])/g, " ");

  // 11. Remove type annotations after colons in various contexts
  //     Handles: function params, variable declarations, return types, class properties
  result = stripTypeAnnotations(result);

  // 12. Remove `readonly` modifier in various contexts
  result = result.replace(/\breadonly\s+(?=[A-Za-z_$\[(])/g, (match) =>
    " ".repeat(match.length),
  );

  // 13. Remove `abstract` modifier
  result = result.replace(/\babstract\s+(?=class\b)/g, (match) =>
    " ".repeat(match.length),
  );

  // 14. Remove `override` modifier
  result = result.replace(/\boverride\s+(?=[A-Za-z_$])/g, (match) =>
    " ".repeat(match.length),
  );

  // 15. Remove `implements` clause from class declarations
  result = result.replace(
    /\s+implements\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?(?:\s*,\s*[A-Za-z_$][\w$]*(?:<[^>]*>)?)*/g,
    (match) => " ".repeat(match.length),
  );

  // 16. Remove optional parameter markers that precede type annotations
  //     The ? before : in params like (x?: string) - keep the ? for optional but remove if type is stripped
  //     Actually, `?:` in params is valid JS-ish after stripping, so we only need to handle the type part

  return result;
};

/**
 * Strip block declarations (interface, declare) that may span multiple lines.
 * Matches the keyword, then finds the balanced braces or semicolon terminator.
 *
 * @param code - Source code.
 * @param startPattern - Regex to find the start of the declaration.
 * @returns Code with the declarations replaced by whitespace.
 */
const stripBlockDeclaration = (code: string, startPattern: RegExp): string => {
  let result = code;
  let searchFrom = 0;

  while (searchFrom < result.length) {
    const remaining = result.slice(searchFrom);
    const match = startPattern.exec(remaining);
    if (!match || match.index === undefined) {
      break;
    }

    const startIdx = searchFrom + match.index;
    let endIdx: number;

    // Find where the declaration ends
    const braceIdx = result.indexOf("{", startIdx);
    const semiIdx = result.indexOf(";", startIdx);
    const newlineIdx = result.indexOf("\n", startIdx + match[0].length);

    if (braceIdx !== -1 && (semiIdx === -1 || braceIdx < semiIdx)) {
      // Has a block body - find the matching close brace
      endIdx = findMatchingBrace(result, braceIdx);
    } else if (semiIdx !== -1 && (newlineIdx === -1 || semiIdx < newlineIdx)) {
      // Single-line declaration ending with semicolon
      endIdx = semiIdx + 1;
    } else if (newlineIdx !== -1) {
      endIdx = newlineIdx;
    } else {
      endIdx = result.length;
    }

    // Replace the declaration with spaces, preserving newlines
    const original = result.slice(startIdx, endIdx);
    const replacement = preserveNewlines(original);
    result = result.slice(0, startIdx) + replacement + result.slice(endIdx);
    searchFrom = startIdx + replacement.length;
  }

  return result;
};

/**
 * Strip type alias declarations: type X = ... (handles multi-line).
 *
 * @param code - Source code.
 * @returns Code with type alias declarations replaced by whitespace.
 */
const stripTypeAliasDeclarations = (code: string): string => {
  let result = code;
  const typeAliasPattern =
    /^[ \t]*(?:export\s+)?type\s+[A-Za-z_$][\w$]*(?:<[^>]*>)?\s*=/m;
  let searchFrom = 0;

  while (searchFrom < result.length) {
    const remaining = result.slice(searchFrom);
    const match = typeAliasPattern.exec(remaining);
    if (!match || match.index === undefined) {
      break;
    }

    const startIdx = searchFrom + match.index;
    // Find where the type alias ends - could be a semicolon, or a block with braces
    let endIdx: number;
    const afterEquals = startIdx + match[0].length;

    // Look for the end: a semicolon at the right nesting depth, or a block
    endIdx = findTypeAliasEnd(result, afterEquals);

    const original = result.slice(startIdx, endIdx);
    const replacement = preserveNewlines(original);
    result = result.slice(0, startIdx) + replacement + result.slice(endIdx);
    searchFrom = startIdx + replacement.length;
  }

  return result;
};

/**
 * Find the end of a type alias declaration, handling nested braces and parens.
 *
 * @param code - Source code.
 * @param start - Position after the `=` in the type alias.
 * @returns The position after the end of the type alias.
 */
const findTypeAliasEnd = (code: string, start: number): number => {
  let depth = 0;
  let i = start;
  let inString: string | null = null;

  while (i < code.length) {
    const ch = code[i];

    // Handle string literals
    if (inString !== null) {
      if (ch === inString && code[i - 1] !== "\\") {
        inString = null;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      i++;
      continue;
    }

    if (ch === "{" || ch === "(") {
      depth++;
    } else if (ch === "<") {
      // Only count < as opening angle bracket if not preceded by another operator context
      depth++;
    } else if (ch === "}" || ch === ")") {
      if (depth > 0) {
        depth--;
      }
    } else if (ch === ">") {
      // Skip => (arrow) - do not count as closing angle bracket
      if (i > 0 && code[i - 1] === "=") {
        i++;
        continue;
      }
      if (depth > 0) {
        depth--;
      }
    } else if (ch === ";" && depth === 0) {
      return i + 1;
    } else if (ch === "\n" && depth === 0) {
      // Check if next non-whitespace line starts a new statement
      const rest = code.slice(i + 1);
      const nextNonWs = rest.match(/^[ \t]*([\S])/);
      if (
        nextNonWs &&
        nextNonWs[1] !== "|" &&
        nextNonWs[1] !== "&" &&
        nextNonWs[1] !== ">"
      ) {
        return i + 1;
      }
    }

    i++;
  }

  return code.length;
};

/**
 * Find the matching closing brace for an opening brace.
 *
 * @param code - Source code.
 * @param openIdx - Position of the opening brace.
 * @returns Position after the matching closing brace.
 */
const findMatchingBrace = (code: string, openIdx: number): number => {
  let depth = 1;
  let i = openIdx + 1;
  let inString: string | null = null;

  while (i < code.length && depth > 0) {
    const ch = code[i];

    if (inString !== null) {
      if (ch === inString && code[i - 1] !== "\\") {
        inString = null;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    }

    i++;
  }

  return i;
};

/**
 * Replace a string with spaces, preserving newline characters.
 *
 * @param str - The string to replace.
 * @returns A string of equal length with newlines preserved.
 */
const preserveNewlines = (str: string): string => {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    result += str[i] === "\n" ? "\n" : " ";
  }
  return result;
};

/**
 * Strip generic type parameters (angle brackets) from the source code.
 * Handles nested generics like `Foo<Bar<Baz>>`.
 *
 * @param code - Source code.
 * @returns Code with generic type parameters replaced by whitespace.
 */
const stripGenericTypeParameters = (code: string): string => {
  // Match generic parameters after identifiers: foo<T>, Foo<T extends U>
  // We need to be careful not to match comparison operators
  const genericPattern =
    /([A-Za-z_$][\w$]*)\s*<(?=[A-Za-z_$\s{(\[])(?![^>]*(?:>>>|<<))/g;

  let result = code;
  let safetyCounter = 0;
  const maxIterations = 1000;

  let match: RegExpExecArray | null;
  while (
    (match = genericPattern.exec(result)) !== null &&
    safetyCounter < maxIterations
  ) {
    safetyCounter++;
    const angleStart = match.index + match[1].length;
    // Find whitespace between identifier and <
    const wsMatch = result.slice(angleStart).match(/^\s*/);
    const wsLen = wsMatch ? wsMatch[0].length : 0;
    const openAngle = angleStart + wsLen;

    const closeAngle = findMatchingAngleBracket(result, openAngle);
    if (closeAngle === -1) {
      continue;
    }

    const original = result.slice(openAngle, closeAngle + 1);
    const replacement = " ".repeat(original.length);
    result =
      result.slice(0, openAngle) + replacement + result.slice(closeAngle + 1);

    // Reset regex since we modified the string
    genericPattern.lastIndex = openAngle + replacement.length;
  }

  return result;
};

/**
 * Find the matching closing angle bracket for a generic type parameter.
 *
 * @param code - Source code.
 * @param openIdx - Position of the opening `<`.
 * @returns Position of the matching `>`, or -1 if not found.
 */
const findMatchingAngleBracket = (code: string, openIdx: number): number => {
  let depth = 1;
  let i = openIdx + 1;
  let inString: string | null = null;

  while (i < code.length && depth > 0) {
    const ch = code[i];

    if (inString !== null) {
      if (ch === inString && code[i - 1] !== "\\") {
        inString = null;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
    } else if (ch === "<") {
      depth++;
    } else if (ch === ">") {
      depth--;
      if (depth === 0) {
        return i;
      }
    } else if (ch === "(" || ch === "{" || ch === "[") {
      // Skip nested brackets to avoid false `>` matches
      const close = ch === "(" ? ")" : ch === "{" ? "}" : "]";
      let nestedDepth = 1;
      i++;
      while (i < code.length && nestedDepth > 0) {
        if (code[i] === ch) {
          nestedDepth++;
        } else if (code[i] === close) {
          nestedDepth--;
        }
        if (nestedDepth > 0) {
          i++;
        }
      }
    }

    i++;
  }

  return -1;
};

/**
 * Strip type annotations after colons.
 * Handles function parameters, return types, variable declarations, and property types.
 *
 * @param code - Source code.
 * @returns Code with type annotations replaced by whitespace.
 */
const stripTypeAnnotations = (code: string): string => {
  let result = code;

  // Function return type annotations: ): Type { or ): Type =>
  result = result.replace(
    /\)\s*:\s*(?:[A-Za-z_$][\w$.|&]*(?:<[^>]*>)?(?:\[\])*)\s*(?=[{=>])/g,
    (match) => {
      const parenIdx = match.indexOf(")");
      return (
        ")" +
        " ".repeat(match.length - 1 - (match.length - parenIdx - 1)) +
        match.slice(parenIdx + 1).replace(/[^\s]/g, " ")
      );
    },
  );

  // Variable/parameter type annotations: x: Type (followed by = , ) ; } or newline)
  // This handles `const x: string = ...`, `function f(x: string, y: number)`, etc.
  // Exclude keywords that use colons for non-type purposes (switch cases, labels)
  const COLON_KEYWORDS = new Set([
    "case",
    "default",
    "break",
    "continue",
    "return",
    "throw",
    "switch",
    "if",
    "else",
    "for",
    "while",
    "do",
    "try",
    "catch",
    "finally",
    "new",
    "delete",
    "typeof",
    "void",
    "in",
    "of",
    "instanceof",
    "this",
    "super",
    "class",
    "extends",
    "import",
    "export",
    "from",
    "var",
    "let",
    "const",
    "function",
    "with",
    "debugger",
  ]);
  result = result.replace(
    /([A-Za-z_$][\w$]*\??)\s*:\s*(?:readonly\s+)?(?:[A-Za-z_$][\w$.|&]*(?:<[^>]*>)?(?:\[\])*)(?:\s*[=,);}\n])/g,
    (match, ident: string) => {
      // Do not strip colons that follow JS keywords (e.g., `default: break`)
      const bareIdent = ident.replace(/\?$/, "");
      if (COLON_KEYWORDS.has(bareIdent)) {
        return match;
      }
      // Keep the identifier and the trailing delimiter
      const trailingChar = match[match.length - 1];
      return ident + " ".repeat(match.length - ident.length - 1) + trailingChar;
    },
  );

  return result;
};

/**
 * Transform TypeScript source using AST-based parsing and transformation.
 * Handles enums, namespaces, parameter properties, and all type stripping.
 *
 * @param code - The TypeScript source code.
 * @param id - The module ID (for diagnostics).
 * @returns The transformed JavaScript code, or null on parse failure.
 */
export const transformTypescriptAST = (
  code: string,
  id: string,
): string | null => {
  try {
    const ast = parse(code, {
      sourceType: "module",
      allowHashBang: true,
      typescript: true,
    });
    let result = transformTypeScript(code, ast);
    // Apply regex-based stripping for inline type annotations
    // that the parser skips without producing AST nodes
    result = stripTypescript(result, id, () => {});
    return result;
  } catch {
    // If AST-based transform fails, return null to fall back to regex
    return null;
  }
};

/**
 * Create the built-in TypeScript type-stripping plugin.
 *
 * @returns A Plugin that strips TypeScript type annotations from .ts/.tsx files.
 */
export const typescriptPlugin = (): Plugin => {
  const warnings: Array<string> = [];

  return {
    name: "steamroller:typescript",

    transform(code: string, id: string): TransformResult {
      if (!isTypeScriptFile(id)) {
        return null;
      }

      // Try AST-based transform first (handles enums, namespaces, etc.)
      const astResult = transformTypescriptAST(code, id);
      if (astResult !== null) {
        return {
          code: astResult,
          map: { mappings: "" },
        };
      }

      // Fallback to regex-based stripping
      const warn = (message: string): void => {
        warnings.push(message);
        if (typeof this?.warn === "function") {
          this.warn(message);
        }
      };

      const stripped = stripTypescript(code, id, warn);

      return {
        code: stripped,
        map: { mappings: "" },
      };
    },
  };
};

/**
 * Check whether any input files have TypeScript extensions, and if so,
 * check whether a TypeScript transform plugin is already registered.
 * Returns the built-in plugin if needed, or null if not.
 *
 * @param inputFiles - Array of input file paths.
 * @param existingPlugins - Currently registered plugins.
 * @returns The typescript plugin if needed, or null.
 */
export const maybeCreateTypescriptPlugin = (
  inputFiles: ReadonlyArray<string>,
  existingPlugins: ReadonlyArray<Plugin>,
): Plugin | null => {
  const hasTypeScriptInputs = inputFiles.some((file) => isTypeScriptFile(file));

  if (!hasTypeScriptInputs) {
    return null;
  }

  // Check if a TS transform plugin is already registered
  const tsPluginNames = [
    "typescript",
    "@rollup/plugin-typescript",
    "esbuild",
    "rollup-plugin-esbuild",
    "swc",
    "rollup-plugin-swc3",
    "sucrase",
    "@rollup/plugin-sucrase",
    "steamroller:typescript",
  ];

  const hasExistingTsPlugin = existingPlugins.some((plugin) =>
    tsPluginNames.some(
      (name) =>
        plugin.name === name ||
        plugin.name.toLowerCase().includes("typescript"),
    ),
  );

  if (hasExistingTsPlugin) {
    return null;
  }

  return typescriptPlugin();
};
