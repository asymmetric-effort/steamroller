/**
 * @module formats/umd
 * @description UMD (Universal Module Definition) format output.
 * Combined AMD/CJS/global detection wrapper.
 * Addresses issue #77.
 */

import type { ExportBinding, FormatOptions, FormatWrapper, ImportBinding } from './shared.js';

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
  return source.replace(/[^a-zA-Z0-9$_]/g, '_');
};

/**
 * Generates the AMD dependency array string.
 */
const getAmdDeps = (
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
 * Generates the CJS require calls string.
 */
const getCjsRequires = (bindings: ReadonlyArray<ImportBinding>): string => {
  if (bindings.length === 0) {
    return '';
  }
  const requires: Array<string> = [];
  for (let i = 0; i < bindings.length; i++) {
    requires.push(`require('${bindings[i].source}')`);
  }
  return requires.join(', ');
};

/**
 * Generates the global variable references string.
 */
const getGlobalDeps = (
  bindings: ReadonlyArray<ImportBinding>,
  globals: Readonly<Record<string, string>> | undefined,
): string => {
  if (bindings.length === 0) {
    return '';
  }
  const refs: Array<string> = [];
  for (let i = 0; i < bindings.length; i++) {
    refs.push(`global.${resolveGlobal(bindings[i].source, globals)}`);
  }
  return refs.join(', ');
};

/**
 * Generates the function parameters string.
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
 * Generates the return/export block for UMD body.
 */
const getExportBlock = (
  bindings: ReadonlyArray<ExportBinding>,
  exportMode: string,
): string => {
  if (bindings.length === 0) {
    return '';
  }
  if (exportMode === 'default' && bindings.length === 1) {
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
  return `return {\n${props.join(',\n')}\n};`;
};

/**
 * UMD format wrapper.
 */
export const umdFormat: FormatWrapper = {
  wrapChunk(code: string, options: FormatOptions): string {
    const name = options.name ?? 'module';
    const globals = options.globals;
    const amdId = options.amd?.id;
    const amdDefine = options.amd?.define ?? 'define';
    const forceJsExt = options.amd?.forceJsExtensionForImports ?? false;
    const imports = options.externalImports ?? [];
    const exportBindings = options.exportBindings ?? [];
    const strict = options.strict !== false;
    const indent = options.indent ?? '  ';

    const params = getParams(imports);
    const amdDeps = getAmdDeps(imports, forceJsExt);
    const cjsRequires = getCjsRequires(imports);
    const globalDeps = getGlobalDeps(imports, globals);
    const amdIdStr = amdId ? `'${amdId}', ` : '';

    /* Indent body */
    const lines = code.split('\n');
    const indentedLines: Array<string> = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      indentedLines.push(line.length > 0 ? `${indent}${indent}${line}` : '');
    }

    const bodyParts: Array<string> = [];
    if (strict) {
      bodyParts.push(`${indent}${indent}'use strict';`);
      bodyParts.push('');
    }
    bodyParts.push(...indentedLines);

    const exportBlock = getExportBlock(exportBindings, options.exports);
    if (exportBlock) {
      bodyParts.push('');
      const exportLines = exportBlock.split('\n');
      for (let i = 0; i < exportLines.length; i++) {
        bodyParts.push(`${indent}${indent}${exportLines[i]}`);
      }
    }

    const body = bodyParts.join('\n');

    const factoryParams = params ? `exports, ${params}` : 'exports';
    const amdDepsWithExports = imports.length > 0 ? `['exports', ${amdDeps.slice(1)}` : `['exports']`;
    const cjsArgs = cjsRequires ? `exports, ${cjsRequires}` : 'exports';
    const globalArgs = globalDeps ? `(global.${name} = {}), ${globalDeps}` : `(global.${name} = {})`;

    const wrapper = [
      `(function(global, factory) {`,
      `${indent}typeof ${amdDefine} === 'function' && ${amdDefine}.amd ? ${amdDefine}(${amdIdStr}${amdDepsWithExports}, factory) :`,
      `${indent}typeof exports === 'object' && typeof module !== 'undefined' ? factory(${cjsArgs}) :`,
      `${indent}(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(${globalArgs}));`,
      `})(this, (function(${factoryParams}) {`,
      body,
      `}));`,
    ];

    return wrapper.join('\n');
  },

  getExternalImportCode(bindings: ReadonlyArray<ImportBinding>): string {
    /* UMD imports are handled by the wrapper preamble */
    if (bindings.length === 0) {
      return '';
    }
    const deps: Array<string> = [];
    for (let i = 0; i < bindings.length; i++) {
      deps.push(`'${bindings[i].source}'`);
    }
    return `/* dependencies: ${deps.join(', ')} */`;
  },

  getExportCode(bindings: ReadonlyArray<ExportBinding>): string {
    if (bindings.length === 0) {
      return '';
    }
    const statements: Array<string> = [];
    for (let i = 0; i < bindings.length; i++) {
      statements.push(`exports.${bindings[i].exported} = ${bindings[i].local};`);
    }
    return statements.join('\n');
  },
};
