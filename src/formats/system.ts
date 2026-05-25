/**
 * @module formats/system
 * @description SystemJS format output. Generates System.register() calls
 * with live binding support via the exports function.
 * Addresses issue #82.
 */

import type {
  ExportBinding,
  FormatOptions,
  FormatWrapper,
  ImportBinding,
} from "./shared.js";

/**
 * Generates the dependency array for System.register().
 */
const getDepsArray = (bindings: ReadonlyArray<ImportBinding>): string => {
  if (bindings.length === 0) {
    return "[]";
  }
  const sources = new Set<string>();
  for (let i = 0; i < bindings.length; i++) {
    sources.add(bindings[i].source);
  }
  const deps: Array<string> = [];
  for (const source of sources) {
    deps.push(`'${source}'`);
  }
  return `[${deps.join(", ")}]`;
};

/**
 * Generates setter functions for each dependency.
 */
const getSetters = (
  bindings: ReadonlyArray<ImportBinding>,
  systemNullSetters: boolean,
  indent: string,
): string => {
  const sourceMap = new Map<string, Array<ImportBinding>>();

  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    const existing = sourceMap.get(binding.source);
    if (existing) {
      existing.push(binding);
    } else {
      sourceMap.set(binding.source, [binding]);
    }
  }

  if (sourceMap.size === 0) {
    return `${indent}${indent}${indent}setters: [],`;
  }

  const setters: Array<string> = [];
  for (const [, sourceBindings] of sourceMap) {
    if (sourceBindings.length === 0 && systemNullSetters) {
      setters.push(`${indent}${indent}${indent}${indent}null`);
      continue;
    }
    const assignments: Array<string> = [];
    for (let i = 0; i < sourceBindings.length; i++) {
      const binding = sourceBindings[i];
      if (binding.imported === "*") {
        assignments.push(
          `${indent}${indent}${indent}${indent}${indent}${binding.local} = module;`,
        );
      } else {
        assignments.push(
          `${indent}${indent}${indent}${indent}${indent}${binding.local} = module.${binding.imported};`,
        );
      }
    }
    setters.push(
      `${indent}${indent}${indent}${indent}function(module) {\n${assignments.join("\n")}\n${indent}${indent}${indent}${indent}}`,
    );
  }

  return `${indent}${indent}${indent}setters: [\n${setters.join(",\n")}\n${indent}${indent}${indent}],`;
};

/**
 * Generates the execute function body with live export bindings.
 */
const getExecuteBody = (
  code: string,
  exportBindings: ReadonlyArray<ExportBinding>,
  indent: string,
): string => {
  const lines = code.split("\n");
  const indentedLines: Array<string> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    indentedLines.push(
      line.length > 0 ? `${indent}${indent}${indent}${indent}${line}` : "",
    );
  }

  const parts: Array<string> = [];
  parts.push(...indentedLines);

  /* Live export calls */
  if (exportBindings.length > 0) {
    parts.push("");
    for (let i = 0; i < exportBindings.length; i++) {
      const binding = exportBindings[i];
      parts.push(
        `${indent}${indent}${indent}${indent}_export('${binding.exported}', ${binding.local});`,
      );
    }
  }

  return parts.join("\n");
};

/**
 * SystemJS format wrapper.
 */
export const systemFormat: FormatWrapper = {
  wrapChunk(code: string, options: FormatOptions): string {
    const imports = options.externalImports ?? [];
    const exportBindings = options.exportBindings ?? [];
    const systemNullSetters = options.systemNullSetters ?? true;
    const strict = options.strict !== false;
    const indent = options.indent ?? "  ";

    const deps = getDepsArray(imports);
    const setters = getSetters(imports, systemNullSetters, indent);
    const executeBody = getExecuteBody(code, exportBindings, indent);

    /* Variable declarations for imported bindings */
    const varDecls: Array<string> = [];
    for (let i = 0; i < imports.length; i++) {
      varDecls.push(`${indent}${indent}${indent}var ${imports[i].local};`);
    }
    const varBlock = varDecls.length > 0 ? `\n${varDecls.join("\n")}\n` : "";

    const strictDirective = strict
      ? `\n${indent}${indent}${indent}'use strict';`
      : "";

    const wrapper = [
      `System.register(${deps}, (function(_export, _context) {`,
      `${indent}${strictDirective ? `${indent}${indent}'use strict';` : ""}`,
      `${indent}return {${varBlock ? `\n${varBlock}` : ""}`,
      setters,
      `${indent}${indent}${indent}execute: (function() {`,
      executeBody,
      `${indent}${indent}${indent}})`,
      `${indent}${indent}};`,
      `}));`,
    ];

    return wrapper.join("\n");
  },

  getExternalImportCode(bindings: ReadonlyArray<ImportBinding>): string {
    /* SystemJS imports are handled via setters in System.register */
    if (bindings.length === 0) {
      return "";
    }
    const sources: Array<string> = [];
    const seen = new Set<string>();
    for (let i = 0; i < bindings.length; i++) {
      if (!seen.has(bindings[i].source)) {
        seen.add(bindings[i].source);
        sources.push(`'${bindings[i].source}'`);
      }
    }
    return `/* System deps: ${sources.join(", ")} */`;
  },

  getExportCode(bindings: ReadonlyArray<ExportBinding>): string {
    if (bindings.length === 0) {
      return "";
    }
    const statements: Array<string> = [];
    for (let i = 0; i < bindings.length; i++) {
      statements.push(
        `_export('${bindings[i].exported}', ${bindings[i].local});`,
      );
    }
    return statements.join("\n");
  },
};
