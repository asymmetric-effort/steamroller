/**
 * @module formats/cjs
 * @description CommonJS format output. Generates require() calls, module.exports,
 * and exports assignments with __esModule interop.
 * Addresses issue #75.
 */

import type { ExportBinding, FormatOptions, FormatWrapper, ImportBinding } from './shared.js';
import { insertStrictMode } from './shared.js';

/**
 * Generates the __esModule interop property definition.
 */
const getEsModuleDefinition = (): string =>
  "Object.defineProperty(exports, '__esModule', { value: true });";

/**
 * Generates a require() statement for a given import binding.
 */
const formatRequireStatement = (binding: ImportBinding): string => {
  if (binding.imported === '*') {
    return `const ${binding.local} = require('${binding.source}');`;
  }
  if (binding.imported === 'default') {
    return `const ${binding.local} = require('${binding.source}');`;
  }
  if (binding.imported === binding.local) {
    return `const { ${binding.imported} } = require('${binding.source}');`;
  }
  return `const { ${binding.imported}: ${binding.local} } = require('${binding.source}');`;
};

/**
 * Generates a CJS exports assignment for a given export binding.
 */
const formatExportsAssignment = (binding: ExportBinding): string => {
  if (binding.exported === 'default') {
    return `exports.default = ${binding.local};`;
  }
  return `exports.${binding.exported} = ${binding.local};`;
};

/**
 * Generates interop helper for handling ESM default imports in CJS.
 */
export const getInteropHelper = (): string =>
  `function _interopDefault(e) { return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, 'default') ? e.default : e; }`;

/**
 * Generates interop helper for namespace imports.
 */
export const getInteropNamespaceHelper = (): string =>
  `function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  const n = Object.create(null);
  if (e) {
    for (const k in e) {
      if (k !== 'default') {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : { enumerable: true, get: function() { return e[k]; } });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}`;

/**
 * CommonJS format wrapper.
 */
export const cjsFormat: FormatWrapper = {
  wrapChunk(code: string, options: FormatOptions): string {
    const parts: Array<string> = [];

    /* Strict mode */
    const useStrict = options.strict !== false;
    if (useStrict) {
      parts.push("'use strict';");
      parts.push('');
    }

    /* __esModule marker for named/default exports */
    if (options.exports === 'named' || options.exports === 'default') {
      parts.push(getEsModuleDefinition());
      parts.push('');
    }

    /* External imports */
    if (options.externalImports && options.externalImports.length > 0) {
      for (let i = 0; i < options.externalImports.length; i++) {
        parts.push(formatRequireStatement(options.externalImports[i]));
      }
      parts.push('');
    }

    /* Module body */
    parts.push(code);

    /* Export assignments */
    if (options.exportBindings && options.exportBindings.length > 0) {
      parts.push('');
      for (let i = 0; i < options.exportBindings.length; i++) {
        parts.push(formatExportsAssignment(options.exportBindings[i]));
      }
    }

    const result = parts.join('\n');
    return useStrict ? result : insertStrictMode(result);
  },

  getExternalImportCode(bindings: ReadonlyArray<ImportBinding>): string {
    if (bindings.length === 0) {
      return '';
    }
    const statements: Array<string> = [];
    for (let i = 0; i < bindings.length; i++) {
      statements.push(formatRequireStatement(bindings[i]));
    }
    return statements.join('\n');
  },

  getExportCode(bindings: ReadonlyArray<ExportBinding>): string {
    if (bindings.length === 0) {
      return '';
    }
    const statements: Array<string> = [];
    for (let i = 0; i < bindings.length; i++) {
      statements.push(formatExportsAssignment(bindings[i]));
    }
    return statements.join('\n');
  },
};
