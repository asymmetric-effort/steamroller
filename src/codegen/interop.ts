/**
 * @module codegen/interop
 * @description Interop mode helpers for external CJS module imports.
 * Determines how default/namespace imports from external CommonJS modules
 * are handled during code generation.
 *
 * Modes:
 * - 'auto': detect based on __esModule flag at runtime
 * - 'esModule': assume all externals are ES modules (access .default directly)
 * - 'default': wrap in default-getting helper, namespace is the module itself
 * - 'defaultOnly': external is the default export itself (no namespace access)
 */

/**
 * The supported interop types for external module handling.
 * Boolean values are normalized: true → 'auto', false → 'esModule'.
 */
export type InteropType =
  | "auto"
  | "esModule"
  | "default"
  | "defaultOnly"
  | boolean;

/**
 * A function that resolves the interop type for a given module ID.
 */
export type InteropResolver = (id: string | null) => InteropType;

/**
 * Generates the interop helper function code that provides runtime
 * __esModule detection for 'auto' mode imports.
 *
 * @param interop - The interop mode to generate helpers for
 * @param constBindings - Whether to use const (true) or var (false) bindings
 * @returns The helper function source code, or empty string if not needed
 */
export const generateInteropHelper = (
  interop: InteropType,
  constBindings: boolean,
): string => {
  const normalized = normalizeSingleInterop(interop);

  if (normalized === "esModule" || normalized === "defaultOnly") {
    return "";
  }

  const binding = constBindings ? "const" : "var";

  if (normalized === "auto") {
    return [
      `function _interopDefault(e) {`,
      `  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, 'default')`,
      `    ? e['default']`,
      `    : e;`,
      `}`,
      `function _interopNamespace(e) {`,
      `  if (e && e.__esModule) return e;`,
      `  ${binding} n = Object.create(null);`,
      `  if (e) {`,
      `    for (${binding} k in e) {`,
      `      if (k !== 'default') {`,
      `        ${binding} d = Object.getOwnPropertyDescriptor(e, k);`,
      `        Object.defineProperty(n, k, d.get ? d : {`,
      `          enumerable: true,`,
      `          get: function () { return e[k]; }`,
      `        });`,
      `      }`,
      `    }`,
      `  }`,
      `  n['default'] = e;`,
      `  return Object.freeze(n);`,
      `}`,
    ].join("\n");
  }

  // 'default' mode
  return [
    `function _interopDefault(e) {`,
    `  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, 'default')`,
    `    ? e['default']`,
    `    : e;`,
    `}`,
  ].join("\n");
};

/**
 * Generates namespace access code for an external module.
 * This determines how `import * as ns from 'ext'` is compiled.
 *
 * @param localName - The local variable name holding the required module
 * @param interop - The interop mode
 * @returns Expression code for namespace access
 */
export const generateNamespaceAccess = (
  localName: string,
  interop: InteropType,
): string => {
  const normalized = normalizeSingleInterop(interop);

  switch (normalized) {
    case "esModule":
      return localName;
    case "default":
      return localName;
    case "defaultOnly":
      return `{ 'default': ${localName} }`;
    case "auto":
      return `_interopNamespace(${localName})`;
  }
};

/**
 * Generates default import access code for an external module.
 * This determines how `import def from 'ext'` is compiled.
 *
 * @param localName - The local variable name holding the required module
 * @param interop - The interop mode
 * @returns Expression code for default access
 */
export const generateDefaultAccess = (
  localName: string,
  interop: InteropType,
): string => {
  const normalized = normalizeSingleInterop(interop);

  switch (normalized) {
    case "esModule":
      return `${localName}['default']`;
    case "default":
      return `_interopDefault(${localName})`;
    case "defaultOnly":
      return localName;
    case "auto":
      return `_interopDefault(${localName})`;
  }
};

/**
 * Normalizes an interop option into a resolver function.
 * Handles boolean values (true → 'auto', false → 'esModule'),
 * string literals, and function-form options.
 *
 * @param interop - The interop option (string, boolean, or resolver function)
 * @returns A resolver function that returns the interop type for a given module ID
 */
export const normalizeInterop = (
  interop: InteropType | ((id: string | null) => InteropType),
): InteropResolver => {
  if (typeof interop === "function") {
    return (id: string | null): InteropType => {
      const result = interop(id);
      return normalizeSingleInterop(result);
    };
  }

  const normalized = normalizeSingleInterop(interop);
  return (_id: string | null): InteropType => normalized;
};

/**
 * Normalizes a single interop value, converting booleans to their
 * string equivalents.
 *
 * @param interop - The raw interop value
 * @returns The normalized string interop type
 */
const normalizeSingleInterop = (
  interop: InteropType,
): "auto" | "esModule" | "default" | "defaultOnly" => {
  if (interop === true) {
    return "auto";
  }
  if (interop === false) {
    return "esModule";
  }
  return interop;
};
