import { defineConfig } from 'vitest/config';

export const config = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: {
        statements: 98,
        branches: 98,
        functions: 98,
        lines: 98,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
    },
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/e2e/**/*.test.ts',
    ],
  },
});
