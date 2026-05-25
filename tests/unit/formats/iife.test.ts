/**
 * @module tests/unit/formats/iife
 * @description Tests for IIFE format output (#81).
 */

import { describe, expect, it } from 'vitest';
import { iifeFormat } from '../../../src/formats/iife.js';
import type { ExportBinding, FormatOptions, ImportBinding } from '../../../src/formats/shared.js';

describe('formats/iife', () => {
  describe('wrapChunk', () => {
    it('should wrap code in an IIFE', () => {
      const options: FormatOptions = { exports: 'none' };
      const result = iifeFormat.wrapChunk('const x = 1;', options);
      expect(result).toContain('(function(');
      expect(result).toContain('})(');
      expect(result.endsWith(';')).toBe(true);
    });

    it('should assign to global variable when name is provided', () => {
      const options: FormatOptions = { exports: 'named', name: 'MyLib' };
      const result = iifeFormat.wrapChunk('const x = 1;', options);
      expect(result).toContain('var MyLib =');
    });

    it('should include use strict by default', () => {
      const options: FormatOptions = { exports: 'none' };
      const result = iifeFormat.wrapChunk('const x = 1;', options);
      expect(result).toContain("'use strict';");
    });

    it('should omit use strict when strict is false', () => {
      const options: FormatOptions = { exports: 'none', strict: false };
      const result = iifeFormat.wrapChunk('const x = 1;', options);
      expect(result).not.toContain("'use strict'");
    });

    it('should pass dependencies as arguments', () => {
      const options: FormatOptions = {
        exports: 'none',
        externalImports: [
          { source: 'jquery', imported: 'default', local: '$' },
        ],
        globals: { jquery: 'jQuery' },
      };
      const result = iifeFormat.wrapChunk('$.ajax();', options);
      expect(result).toContain('(function($)');
      expect(result).toContain(')(jQuery)');
    });

    it('should pass multiple dependencies', () => {
      const options: FormatOptions = {
        exports: 'none',
        externalImports: [
          { source: 'jquery', imported: 'default', local: '$' },
          { source: 'lodash', imported: '*', local: '_' },
        ],
        globals: { jquery: 'jQuery', lodash: '_' },
      };
      const result = iifeFormat.wrapChunk('', options);
      expect(result).toContain('(function($, _)');
      expect(result).toContain(')(jQuery, _)');
    });

    it('should fallback global name when not in globals map', () => {
      const options: FormatOptions = {
        exports: 'none',
        externalImports: [
          { source: 'my-lib', imported: 'default', local: 'myLib' },
        ],
      };
      const result = iifeFormat.wrapChunk('', options);
      expect(result).toContain(')(my_lib)');
    });

    it('should include return statement for exports', () => {
      const options: FormatOptions = {
        exports: 'named',
        name: 'MyLib',
        exportBindings: [
          { exported: 'foo', local: 'foo' },
          { exported: 'bar', local: 'bar' },
        ],
      };
      const result = iifeFormat.wrapChunk('const foo = 1;\nconst bar = 2;', options);
      expect(result).toContain('return {');
      expect(result).toContain('foo');
      expect(result).toContain('bar');
    });

    it('should return single value for default export', () => {
      const options: FormatOptions = {
        exports: 'default',
        name: 'MyLib',
        exportBindings: [
          { exported: 'default', local: 'main' },
        ],
      };
      const result = iifeFormat.wrapChunk('const main = 42;', options);
      expect(result).toContain('return main;');
    });

    it('should handle renamed export bindings in return block', () => {
      const options: FormatOptions = {
        exports: 'named',
        name: 'MyLib',
        exportBindings: [
          { exported: 'bar', local: 'foo' },
          { exported: 'baz', local: 'qux' },
        ],
      };
      const result = iifeFormat.wrapChunk('const foo = 1;', options);
      expect(result).toContain('bar: foo');
      expect(result).toContain('baz: qux');
    });

    it('should handle extend option', () => {
      const options: FormatOptions = {
        exports: 'named',
        name: 'MyLib',
        extend: true,
      };
      const result = iifeFormat.wrapChunk('', options);
      expect(result).toContain('var MyLib =');
    });

    it('should handle empty code', () => {
      const options: FormatOptions = { exports: 'none' };
      const result = iifeFormat.wrapChunk('', options);
      expect(result).toContain('(function()');
    });

    it('should indent code body', () => {
      const options: FormatOptions = { exports: 'none', indent: '    ' };
      const result = iifeFormat.wrapChunk('const x = 1;', options);
      expect(result).toContain('    const x = 1;');
    });
  });

  describe('getExternalImportCode', () => {
    it('should return empty string for no bindings', () => {
      const result = iifeFormat.getExternalImportCode([]);
      expect(result).toBe('');
    });

    it('should generate comments for external deps', () => {
      const bindings: ReadonlyArray<ImportBinding> = [
        { source: 'jquery', imported: 'default', local: '$' },
      ];
      const result = iifeFormat.getExternalImportCode(bindings);
      expect(result).toContain('/* external: jquery */');
    });
  });

  describe('getExportCode', () => {
    it('should return empty string for no bindings', () => {
      const result = iifeFormat.getExportCode([]);
      expect(result).toBe('');
    });

    it('should generate return object', () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: 'foo', local: 'foo' },
      ];
      const result = iifeFormat.getExportCode(bindings);
      expect(result).toContain('return');
      expect(result).toContain('foo');
    });

    it('should handle renamed exports', () => {
      const bindings: ReadonlyArray<ExportBinding> = [
        { exported: 'bar', local: 'foo' },
      ];
      const result = iifeFormat.getExportCode(bindings);
      expect(result).toContain('bar: foo');
    });
  });
});
