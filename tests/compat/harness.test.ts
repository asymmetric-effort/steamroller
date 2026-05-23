import { describe, it, expect } from 'vitest';
import { diffOutputs } from './harness.js';

describe('compat harness', () => {
  describe('diffOutputs', () => {
    it('reports match when outputs are identical', () => {
      const result = diffOutputs('const x = 1;\n', 'const x = 1;\n');
      expect(result.match).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('reports mismatch with diagnostics', () => {
      const result = diffOutputs('const x = 1;\n', 'const x = 2;\n');
      expect(result.match).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });

    it('reports line count mismatch', () => {
      const result = diffOutputs('line1\nline2\n', 'line1\n');
      expect(result.match).toBe(false);
      expect(result.diagnostics.some(d => d.includes('Line count mismatch'))).toBe(true);
    });
  });
});
