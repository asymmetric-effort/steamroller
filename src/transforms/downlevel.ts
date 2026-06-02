/**
 * @module transforms/downlevel
 * @description Basic syntax downleveling for older JavaScript engines.
 * Operates on the output code string (post-bundle) using regex-based transforms.
 *
 * Supported targets:
 * - "es5": arrow functions, template literals, const/let, default parameters
 * - "es2015": nullish coalescing (??), optional chaining (?.)
 */

/** Valid downlevel target strings. */
export type DownlevelTarget = "es5" | "es2015" | "es2016" | "es2017" | "esnext";

/**
 * Convert arrow functions to regular function expressions.
 * Handles both expression-body and block-body arrow functions.
 *
 * @param code - Source code string
 * @returns Transformed code with arrow functions replaced
 */
const convertArrowFunctions = (code: string): string => {
  // Match block-body arrow functions: (params) => { ... }
  // Also handles no-paren single param: x => { ... }
  let result = code;

  // Block-body arrows with parenthesized params: (a, b) => { ... }
  result = result.replace(/\(([^)]*)\)\s*=>\s*\{/g, "function($1) {");

  // Expression-body arrows with parenthesized params: (a, b) => expr
  // We wrap the expression in { return expr; }
  // This needs to handle multi-line expressions carefully
  result = result.replace(
    /\(([^)]*)\)\s*=>\s*([^{;\n][^\n;]*)/g,
    "function($1) { return $2; }",
  );

  // Single param without parens, block body: x => { ... }
  result = result.replace(
    /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*\{/g,
    "function($1) {",
  );

  // Single param without parens, expression body: x => expr
  result = result.replace(
    /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*([^{;\n][^\n;]*)/g,
    "function($1) { return $2; }",
  );

  return result;
};

/**
 * Convert template literals to string concatenation.
 * Handles embedded expressions: `hello ${name}` -> "hello " + name
 *
 * @param code - Source code string
 * @returns Transformed code with template literals replaced
 */
const convertTemplateLiterals = (code: string): string => {
  return code.replace(/`([^`]*)`/g, (_match, content: string) => {
    // Split on ${...} expressions
    const parts: string[] = [];
    let remaining = content;
    let exprMatch: RegExpExecArray | null;
    const exprRegex = /\$\{([^}]+)\}/g;
    let lastIndex = 0;

    exprRegex.lastIndex = 0;
    exprMatch = exprRegex.exec(remaining);

    if (exprMatch === null) {
      // No expressions, just a plain template literal
      return JSON.stringify(
        content.replace(/\\n/g, "\n").replace(/\\t/g, "\t"),
      );
    }

    while (exprMatch !== null) {
      const textBefore = remaining.slice(lastIndex, exprMatch.index);
      if (textBefore.length > 0) {
        parts.push(JSON.stringify(textBefore));
      }
      parts.push(exprMatch[1]);
      lastIndex = exprMatch.index + exprMatch[0].length;
      exprMatch = exprRegex.exec(remaining);
    }

    // Remaining text after last expression
    const textAfter = remaining.slice(lastIndex);
    if (textAfter.length > 0) {
      parts.push(JSON.stringify(textAfter));
    }

    return parts.join(" + ");
  });
};

/**
 * Convert const and let declarations to var.
 *
 * @param code - Source code string
 * @returns Transformed code with const/let replaced by var
 */
const convertConstLetToVar = (code: string): string => {
  return code.replace(/\b(const|let)\s+/g, "var ");
};

/**
 * Convert default parameters to || fallback pattern.
 * e.g., function foo(x = 1) -> function foo(x) { x = x || 1; ...
 *
 * Note: This is a simplified transform that handles the most common cases.
 *
 * @param code - Source code string
 * @returns Transformed code with default parameters converted
 */
const convertDefaultParameters = (code: string): string => {
  // Match function declarations/expressions with default params
  return code.replace(
    /function\s*([a-zA-Z_$][a-zA-Z0-9_$]*)?\s*\(([^)]*)\)\s*\{/g,
    (match, name: string | undefined, params: string) => {
      const paramList = params.split(",").map((p) => p.trim());
      const defaults: Array<{ name: string; value: string }> = [];
      const cleanParams: string[] = [];

      for (const param of paramList) {
        if (param === "") continue;
        const eqIndex = param.indexOf("=");
        if (eqIndex !== -1) {
          const paramName = param.slice(0, eqIndex).trim();
          const defaultValue = param.slice(eqIndex + 1).trim();
          cleanParams.push(paramName);
          defaults.push({ name: paramName, value: defaultValue });
        } else {
          cleanParams.push(param);
        }
      }

      if (defaults.length === 0) {
        return match;
      }

      const fallbacks = defaults
        .map((d) => `${d.name} = ${d.name} || ${d.value};`)
        .join(" ");
      const funcName = name !== undefined ? ` ${name}` : "";
      return `function${funcName}(${cleanParams.join(", ")}) { ${fallbacks}`;
    },
  );
};

/**
 * Convert optional chaining (?.) to && chains.
 * e.g., a?.b?.c -> a && a.b && a.b.c
 *
 * @param code - Source code string
 * @returns Transformed code with optional chaining replaced
 */
const convertOptionalChaining = (code: string): string => {
  // Repeatedly process until no more ?. remain, since replacements may
  // need multiple passes for deeply nested chains
  let result = code;
  let prev = "";

  while (result !== prev) {
    prev = result;
    // Match identifier chains with ?. (e.g., a?.b, a?.b?.c, a.b?.c)
    result = result.replace(
      /([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)\?\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
      (_match, obj: string, prop: string) => {
        return `${obj} && ${obj}.${prop}`;
      },
    );
  }

  return result;
};

/**
 * Convert nullish coalescing (??) to ternary expressions.
 * e.g., a ?? b -> a !== null && a !== void 0 ? a : b
 *
 * @param code - Source code string
 * @returns Transformed code with nullish coalescing replaced
 */
const convertNullishCoalescing = (code: string): string => {
  // Match expr ?? expr
  return code.replace(
    /([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)\s*\?\?\s*([^\n;,)]+)/g,
    (_match, left: string, right: string) => {
      return `${left} !== null && ${left} !== void 0 ? ${left} : ${right.trim()}`;
    },
  );
};

/**
 * Downlevel the given code string to the specified target.
 * Applies regex-based syntax transforms appropriate for the target level.
 *
 * @param code - The bundled output code string
 * @param target - The target ECMAScript version ("es5", "es2015", etc.)
 * @returns The downleveled code string
 */
export const downlevelCode = (code: string, target: string): string => {
  const normalizedTarget = target.toLowerCase();

  // "esnext" or unknown targets: no transforms needed
  if (
    normalizedTarget === "esnext" ||
    (normalizedTarget !== "es5" &&
      normalizedTarget !== "es2015" &&
      normalizedTarget !== "es2016" &&
      normalizedTarget !== "es2017")
  ) {
    return code;
  }

  let result = code;

  // ES2015 and below: convert modern syntax (ES2020+)
  // These transforms apply to es2017, es2016, es2015, and es5
  result = convertNullishCoalescing(result);
  result = convertOptionalChaining(result);

  // ES5: additionally convert ES2015 syntax to ES5 equivalents
  if (normalizedTarget === "es5") {
    result = convertArrowFunctions(result);
    result = convertTemplateLiterals(result);
    result = convertDefaultParameters(result);
    result = convertConstLetToVar(result);
  }

  return result;
};
