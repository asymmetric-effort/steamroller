/**
 * @module formats/es
 * @description ES module format output. Preserves import/export statements
 * with path rewriting. No wrapper needed, top-level await supported.
 * Addresses issue #73.
 */

import type { ExportBinding, FormatOptions, FormatWrapper, ImportBinding } from './shared.js';

/**
 * Generates an ES import statement for a single binding.
 */
const formatImportStatement = (binding: ImportBinding): string => {
  if (binding.imported === '*') {
    return `import * as ${binding.local} from '${binding.source}';`;
  }
  if (binding.imported === 'default') {
    return `import ${binding.local} from '${binding.source}';`;
  }
  if (binding.imported === binding.local) {
    return `import { ${binding.imported} } from '${binding.source}';`;
  }
  return `import { ${binding.imported} as ${binding.local} } from '${binding.source}';`;
};

/**
 * Generates an ES export statement for a single binding.
 */
const formatExportStatement = (binding: ExportBinding): string => {
  if (binding.exported === 'default') {
    return `export default ${binding.local};`;
  }
  if (binding.exported === binding.local) {
    return `export { ${binding.exported} };`;
  }
  return `export { ${binding.local} as ${binding.exported} };`;
};

/**
 * Groups import bindings by source module for compact output.
 */
const groupImportsBySource = (
  bindings: ReadonlyArray<ImportBinding>,
): ReadonlyArray<string> => {
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

  const results: Array<string> = [];
  for (const [, sourceBindings] of sourceMap) {
    for (let i = 0; i < sourceBindings.length; i++) {
      results.push(formatImportStatement(sourceBindings[i]));
    }
  }
  return results;
};

/**
 * ES module format wrapper - preserves native ESM syntax.
 */
export const esFormat: FormatWrapper = {
  wrapChunk(code: string, _options: FormatOptions): string {
    /* ES format does not wrap code; it passes through as-is */
    return code;
  },

  getExternalImportCode(bindings: ReadonlyArray<ImportBinding>): string {
    if (bindings.length === 0) {
      return '';
    }
    const statements = groupImportsBySource(bindings);
    return statements.join('\n');
  },

  getExportCode(bindings: ReadonlyArray<ExportBinding>): string {
    if (bindings.length === 0) {
      return '';
    }
    const statements: Array<string> = [];
    for (let i = 0; i < bindings.length; i++) {
      statements.push(formatExportStatement(bindings[i]));
    }
    return statements.join('\n');
  },
};
