/**
 * @module tests/unit/config/validate
 * @description Tests for option validation and deprecation handling.
 */

import { describe, it, expect } from "bun:test";
import {
  validateInputOptions,
  validateOutputOptions,
} from "../../../src/config/validate.js";
import {
  UNKNOWN_OPTION,
  DEPRECATED_FEATURE,
} from "../../../src/utils/error-codes.js";
import type { InputOptions, OutputOptions } from "../../../src/types.js";

describe("validateInputOptions", () => {
  it("returns no warnings for valid options", () => {
    const warnings = validateInputOptions({
      input: "src/index.ts",
      external: ["lodash"],
      plugins: [],
    });
    expect(warnings).toHaveLength(0);
  });

  it("warns on unknown options", () => {
    const warnings = validateInputOptions({
      unknownOption: true,
    } as unknown as InputOptions);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(UNKNOWN_OPTION);
    expect(warnings[0].message).toContain("unknownOption");
  });

  it("warns on multiple unknown options", () => {
    const warnings = validateInputOptions({
      foo: 1,
      bar: 2,
    } as unknown as InputOptions);
    expect(warnings).toHaveLength(2);
  });

  it("warns on deprecated options", () => {
    const warnings = validateInputOptions({
      acorn: {},
    } as unknown as InputOptions);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(DEPRECATED_FEATURE);
    expect(warnings[0].message).toContain("acorn");
    expect(warnings[0].message).toContain("no longer used");
  });

  it("warns on inlineDynamicImports in input (deprecated)", () => {
    const warnings = validateInputOptions({
      inlineDynamicImports: true,
    } as unknown as InputOptions);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(DEPRECATED_FEATURE);
    expect(warnings[0].message).toContain("output options");
  });

  it("warns on manualChunks in input (deprecated)", () => {
    const warnings = validateInputOptions({
      manualChunks: {},
    } as unknown as InputOptions);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(DEPRECATED_FEATURE);
  });

  it("warns on preserveModules in input (deprecated)", () => {
    const warnings = validateInputOptions({
      preserveModules: true,
    } as unknown as InputOptions);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(DEPRECATED_FEATURE);
  });

  it("throws on deprecated options when strictDeprecations is true", () => {
    expect(() =>
      validateInputOptions({
        strictDeprecations: true,
        acorn: {},
      } as unknown as InputOptions),
    ).toThrow(/acorn/);
  });

  it("thrown error has DEPRECATED_FEATURE code", () => {
    try {
      validateInputOptions({
        strictDeprecations: true,
        acornInjectPlugins: [],
      } as unknown as InputOptions);
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe(DEPRECATED_FEATURE);
    }
  });

  it("does not throw for unknown options even with strictDeprecations", () => {
    const warnings = validateInputOptions({
      strictDeprecations: true,
      somethingNew: 42,
    } as unknown as InputOptions);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(UNKNOWN_OPTION);
  });

  it("returns empty for all-valid known options", () => {
    const warnings = validateInputOptions({
      cache: true,
      context: "window",
      experimentalCacheExpiry: 5,
      experimentalLogSideEffects: true,
      external: [],
      input: "src/index.ts",
      logLevel: "debug",
      makeAbsoluteExternalsRelative: true,
      maxParallelFileOps: 10,
      moduleContext: {},
      perf: true,
      plugins: [],
      preserveEntrySignatures: "strict",
      preserveSymlinks: false,
      shimMissingExports: false,
      strictDeprecations: false,
      treeshake: true,
    });
    expect(warnings).toHaveLength(0);
  });
});

describe("validateOutputOptions", () => {
  it("returns no warnings for valid options", () => {
    const warnings = validateOutputOptions({
      format: "es",
      dir: "dist",
    });
    expect(warnings).toHaveLength(0);
  });

  it("warns on unknown output options", () => {
    const warnings = validateOutputOptions({
      unknownOutput: true,
    } as unknown as OutputOptions);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(UNKNOWN_OPTION);
    expect(warnings[0].message).toContain("unknownOutput");
  });

  it("warns on deprecated namespaceToStringTag", () => {
    const warnings = validateOutputOptions({
      namespaceToStringTag: true,
    } as unknown as OutputOptions);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(DEPRECATED_FEATURE);
    expect(warnings[0].message).toContain("generatedCode.symbols");
  });

  it("warns on deprecated preferConst", () => {
    const warnings = validateOutputOptions({
      preferConst: true,
    } as unknown as OutputOptions);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(DEPRECATED_FEATURE);
    expect(warnings[0].message).toContain("generatedCode.constBindings");
  });

  it("warns on deprecated externalImportAssertions", () => {
    const warnings = validateOutputOptions({
      externalImportAssertions: true,
    } as unknown as OutputOptions);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(DEPRECATED_FEATURE);
    expect(warnings[0].message).toContain("externalImportAttributes");
  });

  it("throws on deprecated options when strictDeprecations is true", () => {
    expect(() =>
      validateOutputOptions(
        { preferConst: true } as unknown as OutputOptions,
        true,
      ),
    ).toThrow(/preferConst/);
  });

  it("thrown error has DEPRECATED_FEATURE code", () => {
    try {
      validateOutputOptions(
        { namespaceToStringTag: true } as unknown as OutputOptions,
        true,
      );
    } catch (err: unknown) {
      expect((err as { code: string }).code).toBe(DEPRECATED_FEATURE);
    }
  });

  it("does not throw for unknown options with strictDeprecations", () => {
    const warnings = validateOutputOptions(
      { weirdOption: 1 } as unknown as OutputOptions,
      true,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe(UNKNOWN_OPTION);
  });

  it("returns empty for comprehensive valid output options", () => {
    const warnings = validateOutputOptions({
      format: "cjs",
      dir: "dist",
      banner: "/* banner */",
      footer: "/* footer */",
      intro: "",
      outro: "",
      sourcemap: true,
      compact: false,
      exports: "named",
      globals: {},
      plugins: [],
    });
    expect(warnings).toHaveLength(0);
  });
});
