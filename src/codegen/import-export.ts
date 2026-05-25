/**
 * @module codegen/import-export
 * @description Format-specific import/export rewriting utilities.
 * Generates appropriate import/export code for ES, CJS, IIFE, UMD, AMD,
 * and SystemJS module formats with support for live bindings, namespace
 * objects, and interop markers.
 */

/**
 * Describes a single import binding with its source, imported/local names,
 * and binding type.
 */
export interface ImportBinding {
  readonly source: string;
  readonly imported: string;
  readonly local: string;
  readonly type: "default" | "named" | "namespace";
}

/**
 * Describes a single export binding with its local and exported names.
 */
export interface ExportBinding {
  readonly local: string;
  readonly exported: string;
  readonly type: "default" | "named";
}

/**
 * Options controlling how imports/exports are rewritten for a target format.
 */
export interface RewriteOptions {
  readonly format: "es" | "cjs" | "iife" | "umd" | "amd" | "system";
  readonly esModule?: boolean | "if-default-prop";
  readonly externalLiveBindings?: boolean;
  readonly freeze?: boolean;
  readonly interop: "auto" | "esModule" | "default" | "defaultOnly";
  readonly constBindings: boolean;
}

/**
 * Groups import bindings by source module.
 */
const groupBySource = (
  bindings: ReadonlyArray<ImportBinding>,
): Map<string, ReadonlyArray<ImportBinding>> => {
  const groups = new Map<string, Array<ImportBinding>>();
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    const existing = groups.get(binding.source);
    if (existing) {
      existing.push(binding);
    } else {
      groups.set(binding.source, [binding]);
    }
  }
  return groups;
};

/**
 * Generates ES module import statements.
 * Example: import { foo, bar as baz } from 'source';
 */
const generateEsImport = (bindings: ReadonlyArray<ImportBinding>): string => {
  if (bindings.length === 0) return "";
  const groups = groupBySource(bindings);
  const lines: Array<string> = [];

  for (const [source, group] of groups) {
    const defaultBindings: Array<ImportBinding> = [];
    const namedBindings: Array<ImportBinding> = [];
    const namespaceBindings: Array<ImportBinding> = [];

    for (let i = 0; i < group.length; i++) {
      const b = group[i];
      if (b.type === "default") {
        defaultBindings.push(b);
      } else if (b.type === "namespace") {
        namespaceBindings.push(b);
      } else {
        namedBindings.push(b);
      }
    }

    for (let i = 0; i < namespaceBindings.length; i++) {
      lines.push(`import * as ${namespaceBindings[i].local} from '${source}';`);
    }

    if (defaultBindings.length > 0 || namedBindings.length > 0) {
      const parts: Array<string> = [];
      if (defaultBindings.length > 0) {
        parts.push(defaultBindings[0].local);
      }
      if (namedBindings.length > 0) {
        const specifiers = namedBindings.map((b) =>
          b.imported === b.local ? b.imported : `${b.imported} as ${b.local}`,
        );
        parts.push(`{ ${specifiers.join(", ")} }`);
      }
      lines.push(`import ${parts.join(", ")} from '${source}';`);
    }
  }

  return lines.join("\n");
};

/**
 * Generates CJS require() statements.
 * Example: const { foo } = require('source');
 */
const generateCjsImport = (
  bindings: ReadonlyArray<ImportBinding>,
  options: RewriteOptions,
): string => {
  if (bindings.length === 0) return "";
  const groups = groupBySource(bindings);
  const lines: Array<string> = [];
  const varKw = options.constBindings ? "const" : "var";

  for (const [source, group] of groups) {
    const defaultBindings: Array<ImportBinding> = [];
    const namedBindings: Array<ImportBinding> = [];
    const namespaceBindings: Array<ImportBinding> = [];

    for (let i = 0; i < group.length; i++) {
      const b = group[i];
      if (b.type === "default") {
        defaultBindings.push(b);
      } else if (b.type === "namespace") {
        namespaceBindings.push(b);
      } else {
        namedBindings.push(b);
      }
    }

    for (let i = 0; i < namespaceBindings.length; i++) {
      lines.push(
        `${varKw} ${namespaceBindings[i].local} = require('${source}');`,
      );
    }

    if (defaultBindings.length > 0) {
      const requireExpr = `require('${source}')`;
      if (options.interop === "defaultOnly") {
        lines.push(`${varKw} ${defaultBindings[0].local} = ${requireExpr};`);
      } else {
        lines.push(
          `${varKw} ${defaultBindings[0].local} = ${requireExpr}.default;`,
        );
      }
    }

    if (namedBindings.length > 0) {
      const destructured = namedBindings.map((b) =>
        b.imported === b.local ? b.imported : `${b.imported}: ${b.local}`,
      );
      lines.push(
        `${varKw} { ${destructured.join(", ")} } = require('${source}');`,
      );
    }
  }

  return lines.join("\n");
};

/**
 * Converts a module source path to a valid global variable name.
 * Example: '@scope/my-lib' -> '_scope_myLib'
 */
const sourceToGlobalName = (source: string): string => {
  const cleaned = source
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return cleaned || "_module";
};

/**
 * Generates IIFE/UMD import code that reads from global variables.
 * Example: const foo = globalThis.source.default;
 */
const generateIifeImport = (
  bindings: ReadonlyArray<ImportBinding>,
  options: RewriteOptions,
): string => {
  if (bindings.length === 0) return "";
  const groups = groupBySource(bindings);
  const lines: Array<string> = [];
  const varKw = options.constBindings ? "const" : "var";

  for (const [source, group] of groups) {
    const globalName = sourceToGlobalName(source);

    for (let i = 0; i < group.length; i++) {
      const b = group[i];
      if (b.type === "namespace") {
        lines.push(`${varKw} ${b.local} = globalThis.${globalName};`);
      } else if (b.type === "default") {
        lines.push(`${varKw} ${b.local} = globalThis.${globalName}.default;`);
      } else {
        lines.push(
          `${varKw} ${b.local} = globalThis.${globalName}.${b.imported};`,
        );
      }
    }
  }

  return lines.join("\n");
};

/**
 * Generates ES module export statements.
 * Example: export { foo, bar as baz };
 */
const generateEsExport = (bindings: ReadonlyArray<ExportBinding>): string => {
  if (bindings.length === 0) return "";

  const defaultBindings: Array<ExportBinding> = [];
  const namedBindings: Array<ExportBinding> = [];

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    if (b.type === "default") {
      defaultBindings.push(b);
    } else {
      namedBindings.push(b);
    }
  }

  const lines: Array<string> = [];

  for (let i = 0; i < defaultBindings.length; i++) {
    lines.push(`export default ${defaultBindings[i].local};`);
  }

  if (namedBindings.length > 0) {
    const specifiers = namedBindings.map((b) =>
      b.local === b.exported ? b.local : `${b.local} as ${b.exported}`,
    );
    lines.push(`export { ${specifiers.join(", ")} };`);
  }

  return lines.join("\n");
};

/**
 * Generates CJS export code.
 * With live bindings: Object.defineProperty(exports, 'x', { get: () => x })
 * Without live bindings: exports.x = x;
 */
const generateCjsExport = (
  bindings: ReadonlyArray<ExportBinding>,
  options: RewriteOptions,
): string => {
  if (bindings.length === 0) return "";
  const useLiveBindings = options.externalLiveBindings !== false;
  const lines: Array<string> = [];

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    const exportName = b.type === "default" ? "default" : b.exported;

    if (useLiveBindings) {
      lines.push(
        `Object.defineProperty(exports, '${exportName}', { enumerable: true, get: function() { return ${b.local}; } });`,
      );
    } else {
      lines.push(`exports.${exportName} = ${b.local};`);
    }
  }

  return lines.join("\n");
};

/**
 * Generates IIFE/UMD export code that assigns to a return object or globals.
 */
const generateIifeExport = (
  bindings: ReadonlyArray<ExportBinding>,
  options: RewriteOptions,
): string => {
  if (bindings.length === 0) return "";
  const useLiveBindings = options.externalLiveBindings !== false;
  const lines: Array<string> = [];

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    const exportName = b.type === "default" ? "default" : b.exported;

    if (useLiveBindings) {
      lines.push(
        `Object.defineProperty(exports, '${exportName}', { enumerable: true, get: function() { return ${b.local}; } });`,
      );
    } else {
      lines.push(`exports.${exportName} = ${b.local};`);
    }
  }

  return lines.join("\n");
};

/**
 * Generates SystemJS register export calls.
 * Example: exports('name', value)
 */
const generateSystemExport = (
  bindings: ReadonlyArray<ExportBinding>,
): string => {
  if (bindings.length === 0) return "";
  const lines: Array<string> = [];

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    const exportName = b.type === "default" ? "default" : b.exported;
    lines.push(`exports('${exportName}', ${b.local});`);
  }

  return lines.join("\n");
};

/**
 * Generate import code for a given format.
 * Dispatches to format-specific import generators.
 */
export const generateImportCode = (
  bindings: ReadonlyArray<ImportBinding>,
  options: RewriteOptions,
): string => {
  switch (options.format) {
    case "es":
      return generateEsImport(bindings);
    case "cjs":
      return generateCjsImport(bindings, options);
    case "iife":
    case "umd":
      return generateIifeImport(bindings, options);
    case "amd":
      return "";
    case "system":
      return "";
  }
};

/**
 * Generate export code for a given format.
 * Dispatches to format-specific export generators.
 */
export const generateExportCode = (
  bindings: ReadonlyArray<ExportBinding>,
  options: RewriteOptions,
): string => {
  switch (options.format) {
    case "es":
      return generateEsExport(bindings);
    case "cjs":
      return generateCjsExport(bindings, options);
    case "iife":
    case "umd":
      return generateIifeExport(bindings, options);
    case "amd":
      return generateCjsExport(bindings, options);
    case "system":
      return generateSystemExport(bindings);
  }
};

/**
 * Generate __esModule marker for CJS output.
 * Marks the module as having ES module semantics for interop.
 */
export const generateEsModuleMarker = (options: RewriteOptions): string => {
  if (!options.esModule) return "";
  return `Object.defineProperty(exports, '__esModule', { value: true });`;
};

/**
 * Generate a namespace object containing all export bindings.
 * Optionally frozen via Object.freeze for immutability.
 */
export const generateNamespaceObject = (
  bindings: ReadonlyArray<ExportBinding>,
  name: string,
  options: RewriteOptions,
): string => {
  if (bindings.length === 0) {
    const varKw = options.constBindings ? "const" : "var";
    const emptyObj = options.freeze !== false ? "Object.freeze({})" : "{}";
    return `${varKw} ${name} = ${emptyObj};`;
  }

  const varKw = options.constBindings ? "const" : "var";
  const props: Array<string> = [];

  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i];
    const exportName = b.type === "default" ? "default" : b.exported;
    if (exportName === b.local) {
      props.push(`  ${exportName}`);
    } else {
      props.push(`  ${exportName}: ${b.local}`);
    }
  }

  const objLiteral = `{\n${props.join(",\n")}\n}`;
  const wrapped =
    options.freeze !== false ? `Object.freeze(${objLiteral})` : objLiteral;

  return `${varKw} ${name} = ${wrapped};`;
};
