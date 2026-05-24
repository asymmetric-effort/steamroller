/**
 * @module tests/unit/tree-shaking/engine
 * @description Unit tests for the multi-pass tree-shaking engine.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  treeShake,
  type TreeShakeOptions,
  type ModuleBindingInfo,
  type StatementInfo,
} from "../../../src/tree-shaking/engine.js";
import { Module } from "../../../src/module/Module.js";
import {
  Scope,
  type Binding,
  type Reference,
} from "../../../src/tree-shaking/scope.js";
import type { SideEffectResult } from "../../../src/tree-shaking/side-effects.js";

// ============================================================
// Test helpers
// ============================================================

/**
 * Create a minimal Module instance for testing.
 */
const createModule = (id: string, isEntry: boolean = false): Module =>
  new Module(id, "", isEntry);

/**
 * Create a Scope with bindings.
 */
const createScope = (): Scope => new Scope(null, false);

/**
 * Create a binding in a scope.
 */
const createBinding = (
  scope: Scope,
  name: string,
  kind: Binding["kind"] = "const",
): Binding => {
  const node = { type: "Identifier", name, start: 0, end: name.length };
  return scope.addBinding(name, kind, node);
};

/**
 * Create a reference from one binding to another (simulates usage).
 * The reference is added to the source binding's scope and resolved to the target.
 */
const createReference = (
  sourceBinding: Binding,
  targetBinding: Binding,
): Reference => {
  const node = {
    type: "Identifier",
    name: targetBinding.name,
    start: 0,
    end: targetBinding.name.length,
  };
  const ref: Reference = {
    name: targetBinding.name,
    node,
    scope: sourceBinding.scope,
    binding: targetBinding,
  };
  sourceBinding.references.push(ref);
  targetBinding.references.push(ref);
  return ref;
};

/**
 * Create a StatementInfo.
 */
const createStatement = (
  index: number,
  sideEffectResult: SideEffectResult = "none",
  declaredBindings: ReadonlyArray<Binding> = [],
): StatementInfo => ({
  index,
  sideEffectResult,
  declaredBindings,
  isIncluded: false,
});

/**
 * Create default tree-shake options.
 */
const createOptions = (
  overrides: Partial<TreeShakeOptions> = {},
): TreeShakeOptions => ({
  enabled: true,
  moduleSideEffects: true,
  propertyReadSideEffects: true,
  tryCatchDeoptimization: true,
  unknownGlobalSideEffects: true,
  manualPureFunctions: [],
  ...overrides,
});

/**
 * Build a ModuleBindingInfo for a module.
 */
const buildModuleInfo = (
  mod: Module,
  scope: Scope,
  bindings: ReadonlyArray<Binding>,
  statements: ReadonlyArray<StatementInfo>,
  sideEffectStatements?: ReadonlyArray<StatementInfo>,
): ModuleBindingInfo => ({
  module: mod,
  scope,
  bindings,
  statements,
  sideEffectStatements:
    sideEffectStatements ??
    statements.filter((s) => s.sideEffectResult !== "none"),
});

// ============================================================
// Tests
// ============================================================

describe("tree-shaking engine", () => {
  describe("treeShake", () => {
    it("removes unused binding from a module", () => {
      const mod = createModule("mod.js", true);
      const scope = createScope();
      const usedBinding = createBinding(scope, "used");
      const unusedBinding = createBinding(scope, "unused");

      const stmt1 = createStatement(0, "none", [usedBinding]);
      const stmt2 = createStatement(1, "none", [unusedBinding]);

      const info = buildModuleInfo(
        mod,
        scope,
        [usedBinding, unusedBinding],
        [stmt1, stmt2],
      );
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>([
        [mod, ["used"]],
      ]);

      const result = treeShake(
        [mod],
        entryExports,
        createOptions(),
        moduleInfos,
      );

      expect(result.removedBindings).toContain("unused");
      expect(result.removedBindings).not.toContain("used");
      expect(usedBinding.isIncluded).toBe(true);
      expect(unusedBinding.isIncluded).toBe(false);
    });

    it("preserves entry exports", () => {
      const mod = createModule("entry.js", true);
      const scope = createScope();
      const fooBinding = createBinding(scope, "foo");
      const barBinding = createBinding(scope, "bar");

      const stmt1 = createStatement(0, "none", [fooBinding]);
      const stmt2 = createStatement(1, "none", [barBinding]);

      const info = buildModuleInfo(
        mod,
        scope,
        [fooBinding, barBinding],
        [stmt1, stmt2],
      );
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>([
        [mod, ["foo", "bar"]],
      ]);

      const result = treeShake(
        [mod],
        entryExports,
        createOptions(),
        moduleInfos,
      );

      expect(fooBinding.isIncluded).toBe(true);
      expect(barBinding.isIncluded).toBe(true);
      expect(result.removedBindings).toHaveLength(0);
    });

    it("preserves transitive dependencies (A→foo→bar)", () => {
      const mod = createModule("mod.js", true);
      const scope = createScope();
      const fooBinding = createBinding(scope, "foo");
      const barBinding = createBinding(scope, "bar");
      const unusedBinding = createBinding(scope, "unused");

      // foo references bar
      createReference(fooBinding, barBinding);

      const stmt1 = createStatement(0, "none", [fooBinding]);
      const stmt2 = createStatement(1, "none", [barBinding]);
      const stmt3 = createStatement(2, "none", [unusedBinding]);

      const info = buildModuleInfo(
        mod,
        scope,
        [fooBinding, barBinding, unusedBinding],
        [stmt1, stmt2, stmt3],
      );
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>([
        [mod, ["foo"]],
      ]);

      const result = treeShake(
        [mod],
        entryExports,
        createOptions(),
        moduleInfos,
      );

      expect(fooBinding.isIncluded).toBe(true);
      expect(barBinding.isIncluded).toBe(true);
      expect(unusedBinding.isIncluded).toBe(false);
      expect(result.removedBindings).toContain("unused");
      expect(result.removedBindings).not.toContain("bar");
    });

    it("always keeps side-effectful statements when moduleSideEffects=true", () => {
      const mod = createModule("side-effect.js", false);
      const scope = createScope();
      const sideBinding = createBinding(scope, "sideEffect");

      const stmt = createStatement(0, "definite", [sideBinding]);

      const info = buildModuleInfo(mod, scope, [sideBinding], [stmt]);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>();

      const result = treeShake(
        [mod],
        entryExports,
        createOptions(),
        moduleInfos,
      );

      expect(stmt.isIncluded).toBe(true);
      expect(sideBinding.isIncluded).toBe(true);
      expect(mod.isIncluded).toBe(true);
      expect(result.removedBindings).toHaveLength(0);
    });

    it("removes side-effectful statements when moduleSideEffects=false", () => {
      const mod = createModule("no-side.js", false);
      const scope = createScope();
      const sideBinding = createBinding(scope, "sideEffect");

      const stmt = createStatement(0, "definite", [sideBinding]);

      const info = buildModuleInfo(mod, scope, [sideBinding], [stmt]);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>();

      const result = treeShake(
        [mod],
        entryExports,
        createOptions({ moduleSideEffects: false }),
        moduleInfos,
      );

      expect(stmt.isIncluded).toBe(false);
      expect(sideBinding.isIncluded).toBe(false);
      expect(mod.isIncluded).toBe(false);
      expect(result.removedBindings).toContain("sideEffect");
    });

    it("converges after multiple passes with chain dependencies", () => {
      const mod = createModule("chain.js", true);
      const scope = createScope();
      const a = createBinding(scope, "a");
      const b = createBinding(scope, "b");
      const c = createBinding(scope, "c");
      const d = createBinding(scope, "d");

      // Chain: a → b → c → d
      createReference(a, b);
      createReference(b, c);
      createReference(c, d);

      const stmts = [
        createStatement(0, "none", [a]),
        createStatement(1, "none", [b]),
        createStatement(2, "none", [c]),
        createStatement(3, "none", [d]),
      ];

      const info = buildModuleInfo(mod, scope, [a, b, c, d], stmts);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>([
        [mod, ["a"]],
      ]);

      const result = treeShake(
        [mod],
        entryExports,
        createOptions(),
        moduleInfos,
      );

      expect(a.isIncluded).toBe(true);
      expect(b.isIncluded).toBe(true);
      expect(c.isIncluded).toBe(true);
      expect(d.isIncluded).toBe(true);
      expect(result.removedBindings).toHaveLength(0);
      expect(result.passes).toBeGreaterThanOrEqual(1);
    });

    it("disabled tree-shaking includes everything", () => {
      const mod = createModule("all.js", true);
      const scope = createScope();
      const foo = createBinding(scope, "foo");
      const bar = createBinding(scope, "bar");

      const stmts = [
        createStatement(0, "none", [foo]),
        createStatement(1, "none", [bar]),
      ];

      const info = buildModuleInfo(mod, scope, [foo, bar], stmts);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>([
        [mod, ["foo"]],
      ]);

      const result = treeShake(
        [mod],
        entryExports,
        createOptions({ enabled: false }),
        moduleInfos,
      );

      expect(result.passes).toBe(0);
      expect(foo.isIncluded).toBe(true);
      expect(bar.isIncluded).toBe(true);
      expect(mod.isIncluded).toBe(true);
      expect(result.includedStatements).toBe(2);
      expect(result.totalStatements).toBe(2);
      expect(result.removedBindings).toHaveLength(0);
    });

    it("preserves module with only side effects when moduleSideEffects=true", () => {
      const mod = createModule("polyfill.js", false);
      const scope = createScope();

      // No bindings, just a side-effectful statement
      const stmt = createStatement(0, "definite", []);

      const info = buildModuleInfo(mod, scope, [], [stmt]);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>();

      const result = treeShake(
        [mod],
        entryExports,
        createOptions(),
        moduleInfos,
      );

      expect(stmt.isIncluded).toBe(true);
      expect(mod.isIncluded).toBe(true);
      expect(result.includedStatements).toBe(1);
    });

    it("removes empty module (no bindings, no side effects)", () => {
      const mod = createModule("empty.js", false);
      const scope = createScope();

      const info = buildModuleInfo(mod, scope, [], []);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>();

      const result = treeShake(
        [mod],
        entryExports,
        createOptions(),
        moduleInfos,
      );

      expect(mod.isIncluded).toBe(false);
      expect(result.includedStatements).toBe(0);
      expect(result.totalStatements).toBe(0);
      expect(result.removedBindings).toHaveLength(0);
    });

    it("handles circular dependencies without infinite loop", () => {
      const mod = createModule("circular.js", true);
      const scope = createScope();
      const a = createBinding(scope, "a");
      const b = createBinding(scope, "b");

      // Circular: a → b → a
      createReference(a, b);
      createReference(b, a);

      const stmts = [
        createStatement(0, "none", [a]),
        createStatement(1, "none", [b]),
      ];

      const info = buildModuleInfo(mod, scope, [a, b], stmts);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>([
        [mod, ["a"]],
      ]);

      const result = treeShake(
        [mod],
        entryExports,
        createOptions(),
        moduleInfos,
      );

      expect(a.isIncluded).toBe(true);
      expect(b.isIncluded).toBe(true);
      expect(result.removedBindings).toHaveLength(0);
      // Should converge quickly (circular deps already marked)
      expect(result.passes).toBeLessThanOrEqual(3);
    });

    it("supports wildcard entry exports (includes all bindings)", () => {
      const mod = createModule("wildcard.js", true);
      const scope = createScope();
      const a = createBinding(scope, "a");
      const b = createBinding(scope, "b");
      const c = createBinding(scope, "c");

      const stmts = [
        createStatement(0, "none", [a]),
        createStatement(1, "none", [b]),
        createStatement(2, "none", [c]),
      ];

      const info = buildModuleInfo(mod, scope, [a, b, c], stmts);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>([
        [mod, ["*"]],
      ]);

      const result = treeShake(
        [mod],
        entryExports,
        createOptions(),
        moduleInfos,
      );

      expect(a.isIncluded).toBe(true);
      expect(b.isIncluded).toBe(true);
      expect(c.isIncluded).toBe(true);
      expect(result.removedBindings).toHaveLength(0);
    });

    it("supports moduleSideEffects as a function", () => {
      const modA = createModule("a.js", false);
      const modB = createModule("b.js", false);
      const scopeA = createScope();
      const scopeB = createScope();

      const stmtA = createStatement(0, "definite", []);
      const stmtB = createStatement(0, "definite", []);

      const infoA = buildModuleInfo(modA, scopeA, [], [stmtA]);
      const infoB = buildModuleInfo(modB, scopeB, [], [stmtB]);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([
        [modA, infoA],
        [modB, infoB],
      ]);
      const entryExports = new Map<Module, ReadonlyArray<string>>();

      // Only preserve side effects for "a.js"
      const result = treeShake(
        [modA, modB],
        entryExports,
        createOptions({
          moduleSideEffects: (id: string, _external: boolean) => id === "a.js",
        }),
        moduleInfos,
      );

      expect(stmtA.isIncluded).toBe(true);
      expect(stmtB.isIncluded).toBe(false);
      expect(modA.isIncluded).toBe(true);
      expect(modB.isIncluded).toBe(false);
      expect(result.includedStatements).toBe(1);
    });

    it("includes possible side effect statements", () => {
      const mod = createModule("possible.js", false);
      const scope = createScope();

      const stmt = createStatement(0, "possible", []);

      const info = buildModuleInfo(mod, scope, [], [stmt]);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>();

      const result = treeShake(
        [mod],
        entryExports,
        createOptions(),
        moduleInfos,
      );

      expect(stmt.isIncluded).toBe(true);
      expect(mod.isIncluded).toBe(true);
      expect(result.includedStatements).toBe(1);
    });

    it("handles multi-module graph with cross-module references", () => {
      const entryMod = createModule("entry.js", true);
      const libMod = createModule("lib.js", false);
      const entryScope = createScope();
      const libScope = createScope();

      const entryExport = createBinding(entryScope, "main");
      const libHelper = createBinding(libScope, "helper");
      const libUnused = createBinding(libScope, "unused");

      // entry.main references lib.helper
      createReference(entryExport, libHelper);

      const entryStmts = [createStatement(0, "none", [entryExport])];
      const libStmts = [
        createStatement(0, "none", [libHelper]),
        createStatement(1, "none", [libUnused]),
      ];

      const entryInfo = buildModuleInfo(
        entryMod,
        entryScope,
        [entryExport],
        entryStmts,
      );
      const libInfo = buildModuleInfo(
        libMod,
        libScope,
        [libHelper, libUnused],
        libStmts,
      );
      const moduleInfos = new Map<Module, ModuleBindingInfo>([
        [entryMod, entryInfo],
        [libMod, libInfo],
      ]);
      const entryExports = new Map<Module, ReadonlyArray<string>>([
        [entryMod, ["main"]],
      ]);

      const result = treeShake(
        [entryMod, libMod],
        entryExports,
        createOptions({ moduleSideEffects: false }),
        moduleInfos,
      );

      expect(entryExport.isIncluded).toBe(true);
      expect(libHelper.isIncluded).toBe(true);
      expect(libUnused.isIncluded).toBe(false);
      expect(entryMod.isIncluded).toBe(true);
      expect(libMod.isIncluded).toBe(true);
      expect(result.removedBindings).toContain("unused");
    });

    it("reports correct total and included statement counts", () => {
      const mod = createModule("count.js", true);
      const scope = createScope();
      const a = createBinding(scope, "a");
      const b = createBinding(scope, "b");

      const stmts = [
        createStatement(0, "none", [a]),
        createStatement(1, "none", [b]),
        createStatement(2, "none", []),
      ];

      const info = buildModuleInfo(mod, scope, [a, b], stmts);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>([
        [mod, ["a"]],
      ]);

      const result = treeShake(
        [mod],
        entryExports,
        createOptions({ moduleSideEffects: false }),
        moduleInfos,
      );

      expect(result.totalStatements).toBe(3);
      expect(result.includedStatements).toBe(1);
      expect(result.removedBindings).toContain("b");
    });

    it("handles module with no entry in moduleInfos gracefully", () => {
      const mod = createModule("orphan.js", true);
      const entryExports = new Map<Module, ReadonlyArray<string>>([
        [mod, ["foo"]],
      ]);
      const moduleInfos = new Map<Module, ModuleBindingInfo>();

      const result = treeShake(
        [mod],
        entryExports,
        createOptions(),
        moduleInfos,
      );

      expect(result.passes).toBeGreaterThanOrEqual(1);
      expect(result.totalStatements).toBe(0);
      expect(result.includedStatements).toBe(0);
      expect(mod.isIncluded).toBe(false);
    });

    it("no-external preserves side effects only for non-external modules", () => {
      const mod = createModule("internal.js", false);
      const scope = createScope();
      const stmt = createStatement(0, "definite", []);

      const info = buildModuleInfo(mod, scope, [], [stmt]);
      const moduleInfos = new Map<Module, ModuleBindingInfo>([[mod, info]]);
      const entryExports = new Map<Module, ReadonlyArray<string>>();

      const result = treeShake(
        [mod],
        entryExports,
        createOptions({ moduleSideEffects: "no-external" }),
        moduleInfos,
      );

      // Internal module: side effects preserved
      expect(stmt.isIncluded).toBe(true);
      expect(mod.isIncluded).toBe(true);
      expect(result.includedStatements).toBe(1);
    });
  });
});
