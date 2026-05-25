/**
 * @module tests/unit/formats/shared
 * @description Tests for cross-format shared utilities (#84).
 */

import { describe, expect, it } from 'vitest';
import {
  generateSourceMapComment,
  getExportMode,
  getFileExtension,
  insertStrictMode,
} from '../../../src/formats/shared.js';

describe('formats/shared', () => {
  describe('insertStrictMode', () => {
    it('should insert use strict at the top of code', () => {
      const result = insertStrictMode('const x = 1;');
      expect(result).toBe("'use strict';\n\nconst x = 1;");
    });

    it('should not duplicate if already present with single quotes', () => {
      const code = "'use strict';\nconst x = 1;";
      const result = insertStrictMode(code);
      expect(result).toBe(code);
    });

    it('should not duplicate if already present with double quotes', () => {
      const code = '"use strict";\nconst x = 1;';
      const result = insertStrictMode(code);
      expect(result).toBe(code);
    });

    it('should handle code with leading whitespace', () => {
      const code = "  'use strict';\nconst x = 1;";
      const result = insertStrictMode(code);
      expect(result).toBe(code);
    });

    it('should handle empty string', () => {
      const result = insertStrictMode('');
      expect(result).toBe("'use strict';\n\n");
    });
  });

  describe('generateSourceMapComment', () => {
    it('should generate a file-based source map comment', () => {
      const result = generateSourceMapComment('bundle.js.map');
      expect(result).toBe('//# sourceMappingURL=bundle.js.map');
    });

    it('should generate an inline source map comment', () => {
      const result = generateSourceMapComment('base64data', true);
      expect(result).toBe(
        '//# sourceMappingURL=data:application/json;charset=utf-8;base64,base64data',
      );
    });

    it('should default to non-inline', () => {
      const result = generateSourceMapComment('file.map', false);
      expect(result).toBe('//# sourceMappingURL=file.map');
    });
  });

  describe('getFileExtension', () => {
    it('should return .mjs for es format', () => {
      expect(getFileExtension('es')).toBe('.mjs');
    });

    it('should return .cjs for cjs format', () => {
      expect(getFileExtension('cjs')).toBe('.cjs');
    });

    it('should return .js for amd format', () => {
      expect(getFileExtension('amd')).toBe('.js');
    });

    it('should return .js for iife format', () => {
      expect(getFileExtension('iife')).toBe('.js');
    });

    it('should return .js for umd format', () => {
      expect(getFileExtension('umd')).toBe('.js');
    });

    it('should return .js for system format', () => {
      expect(getFileExtension('system')).toBe('.js');
    });
  });

  describe('getExportMode', () => {
    it('should return none when no exports', () => {
      expect(getExportMode([], 'es')).toBe('none');
    });

    it('should return default when only default export', () => {
      expect(getExportMode(['default'], 'es')).toBe('default');
    });

    it('should return named when only named exports', () => {
      expect(getExportMode(['foo', 'bar'], 'es')).toBe('named');
    });

    it('should return named when both default and named exports', () => {
      expect(getExportMode(['default', 'foo'], 'es')).toBe('named');
    });

    it('should return default for iife with name and only default export', () => {
      expect(getExportMode(['default'], 'iife', 'MyLib')).toBe('default');
    });

    it('should return default for umd with name and only default export', () => {
      expect(getExportMode(['default'], 'umd', 'MyLib')).toBe('default');
    });

    it('should return named for cjs with mixed exports', () => {
      expect(getExportMode(['default', 'helper'], 'cjs')).toBe('named');
    });

    it('should return named for single named export', () => {
      expect(getExportMode(['myFunc'], 'amd')).toBe('named');
    });
  });
});
