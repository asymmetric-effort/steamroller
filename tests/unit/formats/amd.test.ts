/**
 * @module tests/unit/formats/amd
 * @description Tests for AMD format output (#79).
 */

import { describe, expect, it } from 'vitest';
import { amdFormat } from '../../../src/formats/amd.js';
import type { ExportBinding, FormatOptions, ImportBinding } from '../../../src/formats/shared.js';

describe('formats/amd', () => {
  describe('wrapChunk', () => {
    it('should wrap code in define() call', () => {
      const options: FormatOptions = { exports: 'none' };
      const result = amdFormat.wrapChunk('const x = 1;', options);
      expect(result).toContain('define(');
      expect(result).toContain('(function(');
      expect(result.endsWith('));')).toBe(true);
    });

    it('should include dependency array', () => {
      const options: FormatOptions = {
        exports: 'none',
        externalImports: [
          { source: 'lodash', imported: 'default', local: '_' },
          { source: 'jquery', imported: 'default', local: '$' },
        ],
      };
      const result = amdFormat.wrapChunk('', options);
      expect(result).toContain("['lodash', 'jquery']");
    });

    it('should pass dependencies as function parameters', () => {
      const options: FormatOptions = {
        exports: 'none',
        externalImports: [
          { source: 'lodash', imported: 'default', local: '_' },
        ],
      };
      const result = amdFormat.wrapChunk('', options);
      expect(result).toContain('(function(_)');
    });

    it('should include AMD id when specified', () => {
      const options: FormatOptions = {
        exports: 'none',
        amd: { id: 'my-module' },
      };
      const result = amdFormat.wrapChunk('', options);
      expect(result).toContain("define('my-module',");
    });

    it('should use custom define function name', () => {
      const options: FormatOptions = {
        exports: 'none',
        amd: { define: 'customDefine' },
      };
      const result = amdFormat.wrapChunk('', options);
      expect(result).toContain('customDefine(');
    });

    it('should force .js extension for imports', () => {
      const options: FormatOptions = {
        exports: 'none',
        amd: { forceJsExtensionForImports: true },
        externalImports: [
          { source: 'lodash', imported: 'default', local: '_' },
        ],
      };
      const result = amdFormat.wrapChunk('', options);
      expect(result).toContain("'lodash.js'");
    });

    it('should not add .js if already present', () => {
      const options: FormatOptions = {
        exports: 'none',
        amd: { forceJsExtensionForImports: true },
        externalImports: [
          { source: 'module.js', imported: 'default', local: 'm' },
        ],
      };
      const result = amdFormat.wrapChunk('', options);
      expect(result).toContain("'module.js'");
      expect(result).not.toContain("'module.js.js'");
    });

    it('should include use strict by default', () => {
      const options: FormatOptions = { exports: 'none' };
      const result = amdFormat.wrapChunk('', options);
      expect(result).toContain("'use strict';");
    });

    it('should omit strict when strict is false', () => {
      const options: FormatOptions = { exports: 'none', strict: false };
      const result = amdFormat.wrapChunk('', options);
      expect(result).not.toContain("'use strict'");
    });

    it('should include return statement for named exports', () => {
      const options: FormatOptions = {
        exports: 'named',
        exportBindings: [
          { exported: 'foo', local: 'foo' },
          { exported: 'bar', local: 'bar' },
        ],
      };
      const result = amdFormat.wrapChunk('const foo = 1;\nconst bar = 2;', options);
      expect(result).toContain('return {');
      expect(result).toContain('foo');
      expect(result).toContain('bar');
    });

    it('should return single value for default export', () => {
      const options: FormatOptions = {
        exports: 'default',
        exportBindings: [
          { exported: 'default', local: 'main' },
        ],
      };
      const result = amdFormat.wrapChunk('const main = 42;', options);
      expect(result).toContain('return main;');
    });

    it('should handle renamed export bindings in return block', () => {
      const options: FormatOptions = {
        exports: 'named',
        exportBindings: [
          { exported: 'bar', local: 'foo' },
        ],
      };
      const result = amdFormat.wrapChunk('const foo = 1;', options);
      expect(result).toContain('bar: foo');
    });

    it('should handle empty dependency array', () => {
      const options: FormatOptions = { exports: 'none' };
      const result = amdFormat.wrapChunk('const x = 1;', options);
      expect(result).toContain('[]');
    });

    it('should indent code body', () => {
      const options: FormatOptions = { exports: 'none', indent: '    ' };
      const result = amdFormat.wrapChunk('const x = 1;', options);
      expect(result).toContain('    const x = 1;');
    });
  });

  describe('getExternalImportCode', () => {
    it('should return empty string for no bindings', () => {
      const result = amdFormat.getExternalImportCode([]);
      expect(result).toBe('');
    });

    it('should generate comment with dependency names', () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: 'lodash', imported: 'default', local: '_' },
      ];
      const result = amdFormat.getExternalImportCode(bindings);
      expect(result).toContain("'lodash'");
    });
  });

  describe('getExportCode', () => {
    it('should return empty string for no bindings', () => {
      const result = amdFormat.getExportCode([]);
      expect(result).toBe('');
    });

    it('should generate return object', () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: 'foo', local: 'foo' },
      ];
      const result = amdFormat.getExportCode(bindings);
      expect(result).toContain('return');
      expect(result).toContain('foo');
    });

    it('should handle renamed exports', () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: 'bar', local: 'foo' },
      ];
      const result = amdFormat.getExportCode(bindings);
      expect(result).toContain('bar: foo');
    });
  });
});
