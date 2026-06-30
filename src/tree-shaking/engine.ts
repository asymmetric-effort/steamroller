/**
 * @module tree-shaking/engine
 * @description Multi-pass tree-shaking engine. Iteratively marks reachable bindings
 * starting from entry exports, following references and side effects until convergence.
 * Uses an iterative loop (no recursion) with explicit worklists.
 */

import type { Module } from "../module/Module.js";
import type { Scope, Binding, Reference } from "./scope.js";
import type { SideEffectResult } from "./side-effects.js";

// ============================================================
// Public types
// ============================================================

/** Result of a tree-shaking pass over the module graph. */
export interface TreeShakeResult {
  readonly passes: number;
  readonly includedStatements: number;
  readonly totalStatements: number;
  readonly removedBindings: ReadonlyArray<string>;
}

/** Configuration options for tree-shaking behavior. */
export interface TreeShakeOptions {
  readonly enabled: boolean;
  readonly moduleSideEffects:
    boolean | "no-external" | ((id: string, external: boolean) => boolean);
  readonly propertyReadSideEffects: boolean | "always";
  readonly tryCatchDeoptimization: boolean;
  readonly unknownGlobalSideEffects: boolean;
  readonly manualPureFunctions: ReadonlyArray<string>;
}

/**
 * Internal representation of a module's bindings and statements for the engine.
 * This decouples the engine from the AST so the engine operates on a simplified model.
 */
export interface ModuleBindingInfo {
  readonly module: Module;
  readonly scope: Scope;
  readonly bindings: ReadonlyArray<Binding>;
  readonly sideEffectStatements: ReadonlyArray<StatementInfo>;
  readonly statements: ReadonlyArray<StatementInfo>;
}

/** Simplified statement representation for tree-shaking decisions. */
export interface StatementInfo {
  readonly index: number;
  readonly sideEffectResult: SideEffectResult;
  readonly declaredBindings: ReadonlyArray<Binding>;
  isIncluded: boolean;
}

// ============================================================
// Helper functions
// ============================================================

/**
 * Determine whether a module's side effects should be preserved.
 * @param moduleId - The module ID.
 * @param isExternal - Whether the module is external.
 * @param config - The moduleSideEffects option.
 * @returns true if side effects should be preserved.
 */
const shouldPreserveSideEffects = (
  moduleId: string,
  isExternal: boolean,
  config: TreeShakeOptions["moduleSideEffects"],
): boolean => {
  if (config === true) {
    return true;
  }
  if (config === false) {
    return false;
  }
  if (config === "no-external") {
    return !isExternal;
  }
  return config(moduleId, isExternal);
};

/**
 * Mark a binding as included and add its references to the worklist.
 * @param binding - The binding to include.
 * @param worklist - The worklist of bindings to process.
 */
const includeBinding = (
  binding: Binding,
  worklist: Array<Binding>,
): boolean => {
  if (binding.isIncluded) {
    return false;
  }
  binding.isIncluded = true;
  worklist.push(binding);
  return true;
};

/**
 * Mark a statement as included.
 * @param stmt - The statement to include.
 * @returns true if the statement was newly included.
 */
const includeStatement = (stmt: StatementInfo): boolean => {
  if (stmt.isIncluded) {
    return false;
  }
  stmt.isIncluded = true;
  return true;
};

// ============================================================
// Entry export marking
// ============================================================

/**
 * Mark entry module exports as initially included.
 * For each entry module, find the bindings corresponding to exported names
 * and add them to the worklist.
 *
 * @param moduleInfos - Map from Module to its binding info.
 * @param entryExports - Map from Module to its exported names.
 * @param worklist - The initial worklist to populate.
 */
const markEntryExports = (
  moduleInfos: ReadonlyMap<Module, ModuleBindingInfo>,
  entryExports: ReadonlyMap<Module, ReadonlyArray<string>>,
  worklist: Array<Binding>,
): void => {
  for (const [mod, exportNames] of entryExports) {
    const info = moduleInfos.get(mod);
    if (info === undefined) {
      continue;
    }

    const isWildcard = exportNames.includes("*");

    for (let i = 0; i < info.bindings.length; i++) {
      const binding = info.bindings[i];
      if (isWildcard || exportNames.includes(binding.name)) {
        includeBinding(binding, worklist);
      }
    }
  }
};

// ============================================================
// Reference tracing
// ============================================================

/**
 * Trace references from an included binding.
 * For each reference made by the binding's scope, if the reference
 * resolves to a binding not yet included, include it.
 *
 * @param binding - The binding whose references to trace.
 * @param moduleInfos - Map from Module to its binding info.
 * @param worklist - The worklist to add newly discovered bindings.
 * @returns true if any new bindings were included.
 */
const traceReferences = (
  binding: Binding,
  moduleInfos: ReadonlyMap<Module, ModuleBindingInfo>,
  worklist: Array<Binding>,
): boolean => {
  let changed = false;

  // Follow all references from this binding's references array
  for (let i = 0; i < binding.references.length; i++) {
    const ref: Reference = binding.references[i];
    if (ref.binding !== null && !ref.binding.isIncluded) {
      const included = includeBinding(ref.binding, worklist);
      if (included) {
        changed = true;
      }
    }
  }

  return changed;
};

// ============================================================
// Side effect inclusion
// ============================================================

/**
 * Include all statements with side effects for modules whose side effects
 * should be preserved. Also includes bindings declared in those statements.
 *
 * @param moduleInfos - Map from Module to its binding info.
 * @param options - Tree-shake options.
 * @param worklist - The worklist to add newly discovered bindings.
 * @returns true if any new statements or bindings were included.
 */
const includeSideEffects = (
  moduleInfos: ReadonlyMap<Module, ModuleBindingInfo>,
  options: TreeShakeOptions,
  worklist: Array<Binding>,
): boolean => {
  let changed = false;

  for (const [, info] of moduleInfos) {
    const preserve = shouldPreserveSideEffects(
      info.module.id,
      false,
      options.moduleSideEffects,
    );

    if (!preserve) {
      continue;
    }

    for (let i = 0; i < info.sideEffectStatements.length; i++) {
      const stmt = info.sideEffectStatements[i];
      if (includeStatement(stmt)) {
        changed = true;
        // Include bindings declared in this statement
        for (let j = 0; j < stmt.declaredBindings.length; j++) {
          const b = stmt.declaredBindings[j];
          if (includeBinding(b, worklist)) {
            changed = true;
          }
        }
      }
    }
  }

  return changed;
};

// ============================================================
// Main tree-shaking entry point
// ============================================================

/**
 * Perform multi-pass tree-shaking over a set of modules.
 *
 * Algorithm:
 * 1. Mark entry exports as included.
 * 2. Include side-effectful statements in modules with side effects.
 * 3. Iteratively trace references from included bindings until no new
 *    bindings are discovered (convergence).
 *
 * @param modules - All modules in the graph.
 * @param entryExports - Map from entry modules to their exported binding names.
 * @param options - Tree-shaking configuration.
 * @param moduleInfos - Pre-computed binding info for each module.
 * @returns The tree-shake result summary.
 */
export const treeShake = (
  modules: ReadonlyArray<Module>,
  entryExports: ReadonlyMap<Module, ReadonlyArray<string>>,
  options: TreeShakeOptions,
  moduleInfos: ReadonlyMap<Module, ModuleBindingInfo>,
): TreeShakeResult => {
  if (!options.enabled) {
    // Mark everything as included
    for (const mod of modules) {
      mod.isIncluded = true;
    }
    let total = 0;
    for (const [, info] of moduleInfos) {
      for (let i = 0; i < info.statements.length; i++) {
        info.statements[i].isIncluded = true;
        total++;
      }
      for (let i = 0; i < info.bindings.length; i++) {
        info.bindings[i].isIncluded = true;
      }
    }
    return {
      passes: 0,
      includedStatements: total,
      totalStatements: total,
      removedBindings: [],
    };
  }

  const worklist: Array<Binding> = [];
  let passes = 0;
  const MAX_PASSES = 1000;

  // Pass 1: Seed with entry exports
  markEntryExports(moduleInfos, entryExports, worklist);

  // Pass 2: Include side-effectful statements
  includeSideEffects(moduleInfos, options, worklist);

  // Multi-pass convergence loop
  let changed = true;
  while (changed && passes < MAX_PASSES) {
    changed = false;
    passes++;

    // Process the worklist: trace references from each binding
    // We snapshot the current worklist length so newly added items
    // are picked up in the same pass.
    let processedCount = 0;
    while (processedCount < worklist.length) {
      const binding = worklist[processedCount];
      processedCount++;
      if (traceReferences(binding, moduleInfos, worklist)) {
        changed = true;
      }
    }

    // After tracing, check if any newly included binding's statements
    // need to be included (for statements that declare included bindings)
    for (const [, info] of moduleInfos) {
      for (let i = 0; i < info.statements.length; i++) {
        const stmt = info.statements[i];
        if (stmt.isIncluded) {
          continue;
        }
        // Include statement if any of its declared bindings are included
        for (let j = 0; j < stmt.declaredBindings.length; j++) {
          if (stmt.declaredBindings[j].isIncluded) {
            if (includeStatement(stmt)) {
              changed = true;
            }
            break;
          }
        }
      }
    }
  }

  // Mark modules as included if they have any included binding or statement
  for (const mod of modules) {
    const info = moduleInfos.get(mod);
    if (info === undefined) {
      continue;
    }
    let hasIncluded = false;
    for (let i = 0; i < info.bindings.length; i++) {
      if (info.bindings[i].isIncluded) {
        hasIncluded = true;
        break;
      }
    }
    if (!hasIncluded) {
      for (let i = 0; i < info.statements.length; i++) {
        if (info.statements[i].isIncluded) {
          hasIncluded = true;
          break;
        }
      }
    }
    mod.isIncluded = hasIncluded;
  }

  // Collect results
  let includedStatements = 0;
  let totalStatements = 0;
  const removedBindings: Array<string> = [];

  for (const [, info] of moduleInfos) {
    for (let i = 0; i < info.statements.length; i++) {
      totalStatements++;
      if (info.statements[i].isIncluded) {
        includedStatements++;
      }
    }
    for (let i = 0; i < info.bindings.length; i++) {
      if (!info.bindings[i].isIncluded) {
        removedBindings.push(info.bindings[i].name);
      }
    }
  }

  return { passes, includedStatements, totalStatements, removedBindings };
};
