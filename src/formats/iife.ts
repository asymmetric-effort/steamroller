/**
 * @module formats/iife
 * @description IIFE (Immediately Invoked Function Expression) format output.
 * Wraps code in a self-executing function with global variable assignment.
 * Addresses issue #81.
 */

import type {
  ExportBinding,
  FormatOptions,
  FormatWrapper,
  ImportBinding,
} from "./shared.js";

/**
 * Resolves the global variable name for an external dependency.
 */
const resolveGlobal = (
  source: string,
  globals: Readonly<Record<string, string>> | undefined,
): string => {
  if (globals && source in globals) {
    return globals[source];
  }
  /* Fallback: use the source name as-is, replacing invalid chars */
  return source.replace(/[^a-zA-Z0-9$_]/g, "_");
};

/**
 * Generates the IIFE function parameters from import bindings.
 */
const getParams = (bindings: ReadonlyArray<ImportBinding>): string => {
  const params: Array<string> = [];
  for (let i = 0; i < bindings.length; i++) {
    params.push(bindings[i].local);
  }
  return params.join(", ");
};

/**
 * Generates the IIFE argument list (global variable references).
 */
const getArgs = (
  bindings: ReadonlyArray<ImportBinding>,
  globals: Readonly<Record<string, string>> | undefined,
): string => {
  const args: Array<string> = [];
  for (let i = 0; i < bindings.length; i++) {
    args.push(resolveGlobal(bindings[i].source, globals));
  }
  return args.join(", ");
};

/**
 * Generates the return statement for IIFE exports.
 */
const getReturnStatement = (
  bindings: ReadonlyArray<ExportBinding>,
  exportMode: string,
): string => {
  if (bindings.length === 0) {
    return "";
  }
  if (exportMode === "default" && bindings.length === 1) {
    return `return ${bindings[0].local};`;
  }
  const props: Array<string> = [];
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    if (binding.exported === binding.local) {
      props.push(`  ${binding.exported}`);
    } else {
      props.push(`  ${binding.exported}: ${binding.local}`);
    }
  }
  return `return {\n${props.join(",\n")}\n};`;
};

/**
 * IIFE format wrapper.
 */
export const iifeFormat: FormatWrapper = {
  wrapChunk(code: string, options: FormatOptions): string {
    const name = options.name;
    const extend = options.extend ?? false;
    const globals = options.globals;
    const imports = options.externalImports ?? [];
    const exportBindings = options.exportBindings ?? [];
    const strict = options.strict !== false;
    const indent = options.indent ?? "  ";

    const params = getParams(imports);
    const args = getArgs(imports, globals);

    /* Indent the body */
    const lines = code.split("\n");
    const indentedLines: Array<string> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      indentedLines.push(line.length > 0 ? `${indent}${line}` : "");
    }

    const parts: Array<string> = [];
    if (strict) {
      parts.push(`${indent}'use strict';`);
      parts.push("");
    }
    parts.push(...indentedLines);

    /* Return statement for exports */
    const returnStmt = getReturnStatement(exportBindings, options.exports);
    if (returnStmt) {
      parts.push("");
      const returnLines = returnStmt.split("\n");
      for (let i = 0; i < returnLines.length; i++) {
        parts.push(`${indent}${returnLines[i]}`);
      }
    }

    const body = parts.join("\n");
    const funcExpr = `(function(${params}) {\n${body}\n})(${args})`;

    if (name) {
      if (extend) {
        return `var ${name} = (function(${params}) {\n${body}\n})(${args});`;
      }
      return `var ${name} = ${funcExpr};`;
    }

    return `${funcExpr};`;
  },

  getExternalImportCode(bindings: ReadonlyArray<ImportBinding>): string {
    /* IIFE imports are passed as function arguments, no separate import code */
    if (bindings.length === 0) {
      return "";
    }
    const comments: Array<string> = [];
    for (let i = 0; i < bindings.length; i++) {
      comments.push(`/* external: ${bindings[i].source} */`);
    }
    return comments.join("\n");
  },

  getExportCode(bindings: ReadonlyArray<ExportBinding>): string {
    /* IIFE exports are handled via the return statement in wrapChunk */
    if (bindings.length === 0) {
      return "";
    }
    const statements: Array<string> = [];
    for (let i = 0; i < bindings.length; i++) {
      const binding = bindings[i];
      if (binding.exported === binding.local) {
        statements.push(`${binding.exported}`);
      } else {
        statements.push(`${binding.exported}: ${binding.local}`);
      }
    }
    return `return { ${statements.join(", ")} };`;
  },
};
