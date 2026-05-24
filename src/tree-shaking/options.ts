/**
 * @module tree-shaking/options
 * @description Tree-shaking presets and options normalization.
 *
 * Provides preset configurations (smallest, safest, recommended) and a
 * normalizer that converts user input (boolean, preset string, or partial
 * options object) into a fully resolved NormalizedTreeshakingOptions.
 */

import type {
  TreeshakingPreset,
  TreeshakingOptions,
  NormalizedTreeshakingOptions,
  HasModuleSideEffects,
  ModuleSideEffectsOption,
} from "../types.js";

/** Internal representation of a preset before moduleSideEffects normalization. */
interface RawPresetOptions {
  readonly annotations: boolean;
  readonly correctVarValueBeforeDeclaration: boolean;
  readonly manualPureFunctions: ReadonlyArray<string>;
  readonly moduleSideEffects: boolean;
  readonly propertyReadSideEffects: boolean | "always";
  readonly tryCatchDeoptimization: boolean;
  readonly unknownGlobalSideEffects: boolean;
}

/** Preset definitions for tree-shaking configuration. */
const PRESETS: Readonly<Record<TreeshakingPreset, RawPresetOptions>> = {
  smallest: {
    annotations: true,
    correctVarValueBeforeDeclaration: true,
    manualPureFunctions: [],
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    tryCatchDeoptimization: false,
    unknownGlobalSideEffects: false,
  },
  safest: {
    annotations: true,
    correctVarValueBeforeDeclaration: true,
    manualPureFunctions: [],
    moduleSideEffects: true,
    propertyReadSideEffects: true,
    tryCatchDeoptimization: true,
    unknownGlobalSideEffects: true,
  },
  recommended: {
    annotations: true,
    correctVarValueBeforeDeclaration: false,
    manualPureFunctions: [],
    moduleSideEffects: true,
    propertyReadSideEffects: true,
    tryCatchDeoptimization: true,
    unknownGlobalSideEffects: false,
  },
};

/**
 * Normalize a moduleSideEffects option into a predicate function.
 *
 * @param option - The user-provided moduleSideEffects value.
 * @returns A predicate function (id, external) => boolean.
 */
export const normalizeModuleSideEffects = (
  option: ModuleSideEffectsOption | undefined,
): HasModuleSideEffects => {
  if (option === undefined || option === true) {
    return () => true;
  }
  if (option === false) {
    return () => false;
  }
  if (option === "no-external") {
    return (_id: string, external: boolean) => !external;
  }
  if (Array.isArray(option)) {
    const set = new Set<string>(option as ReadonlyArray<string>);
    return (id: string) => set.has(id);
  }
  // It's already a function
  return option as HasModuleSideEffects;
};

/**
 * Get a preset configuration by name.
 *
 * @param preset - The preset name.
 * @returns The raw preset options.
 */
export const getPreset = (preset: TreeshakingPreset): RawPresetOptions => {
  return PRESETS[preset];
};

/**
 * Normalize tree-shaking input into fully resolved options.
 *
 * Accepts:
 * - `true` or `undefined`: uses 'recommended' preset
 * - `false`: returns false (tree-shaking disabled)
 * - A preset string ('smallest' | 'safest' | 'recommended')
 * - A partial TreeshakingOptions object (merged over recommended or specified preset)
 *
 * @param input - The user-provided tree-shaking configuration.
 * @returns Normalized options or false if tree-shaking is disabled.
 */
export const normalizeTreeshakeOptions = (
  input: boolean | TreeshakingPreset | TreeshakingOptions | undefined,
): NormalizedTreeshakingOptions | false => {
  if (input === false) {
    return false;
  }

  if (input === true || input === undefined) {
    const preset = PRESETS.recommended;
    return {
      annotations: preset.annotations,
      correctVarValueBeforeDeclaration: preset.correctVarValueBeforeDeclaration,
      manualPureFunctions: preset.manualPureFunctions,
      moduleSideEffects: normalizeModuleSideEffects(preset.moduleSideEffects),
      propertyReadSideEffects: preset.propertyReadSideEffects,
      tryCatchDeoptimization: preset.tryCatchDeoptimization,
      unknownGlobalSideEffects: preset.unknownGlobalSideEffects,
    };
  }

  if (typeof input === "string") {
    const preset = PRESETS[input];
    return {
      annotations: preset.annotations,
      correctVarValueBeforeDeclaration: preset.correctVarValueBeforeDeclaration,
      manualPureFunctions: preset.manualPureFunctions,
      moduleSideEffects: normalizeModuleSideEffects(preset.moduleSideEffects),
      propertyReadSideEffects: preset.propertyReadSideEffects,
      tryCatchDeoptimization: preset.tryCatchDeoptimization,
      unknownGlobalSideEffects: preset.unknownGlobalSideEffects,
    };
  }

  // Partial options object — merge over base preset
  const basePresetName: TreeshakingPreset = input.preset ?? "recommended";
  const base = PRESETS[basePresetName];

  return {
    annotations: input.annotations ?? base.annotations,
    correctVarValueBeforeDeclaration:
      input.correctVarValueBeforeDeclaration ??
      base.correctVarValueBeforeDeclaration,
    manualPureFunctions: input.manualPureFunctions ?? base.manualPureFunctions,
    moduleSideEffects: normalizeModuleSideEffects(
      input.moduleSideEffects ?? base.moduleSideEffects,
    ),
    propertyReadSideEffects:
      input.propertyReadSideEffects ?? base.propertyReadSideEffects,
    tryCatchDeoptimization:
      input.tryCatchDeoptimization ?? base.tryCatchDeoptimization,
    unknownGlobalSideEffects:
      input.unknownGlobalSideEffects ?? base.unknownGlobalSideEffects,
  };
};
