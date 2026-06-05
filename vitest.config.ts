import { defineConfig } from "vitest/config";

// vitest requires a default export for config files
// eslint-disable-next-line import/no-default-export
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 97,
        lines: 95,
      },
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/ast/types.ts"],
    },
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/e2e/**/*.test.ts",
      "tests/compat/**/*.test.ts",
    ],
  },
});
