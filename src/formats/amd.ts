/**
 * @module formats/amd
 * @description AMD (Asynchronous Module Definition) format output.
 * Generates define() calls with dependency arrays.
 * Addresses issue #79.
 */

import type { ExportBinding, FormatOptions, FormatWrapper, ImportBinding } from './shared.js';

/**
 * Generates the dependency array for the define() call.
 */
const getDepsArray = (
  bindings: ReadonlyArray<ImportBinding>,
  forceJsExt: boolean,
): string => {
  if (bindings.length === 0) {
    return '[]';
  }
  const deps: Array<string> = [];
  for (let i = 0; i < bindings.length; i++) {
    const source = forceJsExt && !bindings[i].source.endsWith('.js')
      ? `${bindings[i].source}.js`
      : bindings[i].source;
    deps.push(`'${source}'`);
  }
  return `[${deps.join(', ')}]`;
};

/**
 * Generates the factory function parameters.
 */
const getParams = (bindings: ReadonlyArray<ImportBinding>): string => {
  if (bindings.length === 0) {
    return '';
  }
  const params: Array<string> = [];
  for (let i = 0; i < bindings.length; i++) {
    params.push(bindings[i].local);
  }
  return params.join(', ');
};

/**
 * Generates the return statement for AMD exports.
 */
const getReturnStatement = (
  bindings: ReadonlyArray<ExportBinding>,
  exportMode: string,
  indent: string,
): string => {
  if (bindings.length === 0) {
    return '';
  }
  if (exportMode === 'default' && bindings.length === 1) {
    return `\n${indent}return ${bindings[0].local};`;
  }
  const props: Array<string> = [];
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    if (binding.exported === binding.local) {
      props.push(`${indent}${indent}${binding.exported}`);
    } else {
      props.push(`${indent}${indent}${binding.exported}: ${binding.local}`);
    }
  }
  return `\n${indent}return {\n${props.join(',\n')}\n${indent}};`;
};

/**
 * AMD format wrapper.
 */
export const amdFormat: FormatWrapper = {
  wrapChunk(code: string, options: FormatOptions): string {
    const amdId = options.amd?.id;
    const defineFn = options.amd?.define ?? 'define';
    const forceJsExt = options.amd?.forceJsExtensionForImports ?? false;
    const imports = options.externalImports ?? [];
    const exportBindings = options.exportBindings ?? [];
    const strict = options.strict !== false;
    const indent = options.indent ?? '  ';

    const deps = getDepsArray(imports, forceJsExt);
    const params = getParams(imports);
    const idStr = amdId ? `'${amdId}', ` : '';

    /* Indent body */
    const lines = code.split('\n');
    const indentedLines: Array<string> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      indentedLines.push(line.length > 0 ? `${indent}${line}` : '');
    }

    const bodyParts: Array<string> = [];
    if (strict) {
      bodyParts.push(`${indent}'use strict';`);
      bodyParts.push('');
    }
    bodyParts.push(...indentedLines);

    const returnStmt = getReturnStatement(exportBindings, options.exports, indent);
    const body = bodyParts.join('\n') + returnStmt;

    return `${defineFn}(${idStr}${deps}, (function(${params}) {\n${body}\n}));`;
  },

  getExternalImportCode(bindings: ReadonlyArray<ImportBinding>): string {
    /* AMD imports are specified in the dependency array */
    if (bindings.length === 0) {
      return '';
    }
    const deps: Array<string> = [];
    for (let i = 0; i < bindings.length; i++) {
      deps.push(`'${bindings[i].source}'`);
    }
    return `/* AMD deps: ${deps.join(', ')} */`;
  },

  getExportCode(bindings: ReadonlyArray<ExportBinding>): string {
    if (bindings.length === 0) {
      return '';
    }
    const props: Array<string> = [];
    for (let i = 0; i < bindings.length; i++) {
      const binding = bindings[i];
      if (binding.exported === binding.local) {
        props.push(binding.exported);
      } else {
        props.push(`${binding.exported}: ${binding.local}`);
      }
    }
    return `return { ${props.join(', ')} };`;
  },
};
