/**
 * @module tests/unit/module/graph
 * @description Unit tests for module graph construction, circular dependency
 * detection, topological sorting, and input normalization.
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildModuleGraph,
  normalizeInput,
  detectCircularDependencies,
  topologicalSort,
} from "../../../src/module/graph.js";
import { Module } from "../../../src/module/Module.js";
import { ExternalModule } from "../../../src/module/ExternalModule.js";
import type { ResolvedId } from "../../../src/types.js";
import type { ProgramNode } from "../../../src/ast/types.js";
import {
  CIRCULAR_DEPENDENCY,
  UNRESOLVED_ENTRY,
  UNRESOLVED_IMPORT,
  SHIMMED_EXPORT,
} from "../../../src/utils/error-codes.js";

/** Helper to create a minimal AST with import/export declarations. */
const createAst = (
  imports: Array<{
    source: string;
    specifiers?: Array<{ type: string; imported: string; local: string }>;
  }> = [],
  exports: Array<{ type: string; name?: string }> = [],
  dynamicImports: Array<string> = [],
): ProgramNode => {
  const body: Array<Record<string, unknown>> = [];

  for (let i = 0; i < imports.length; i++) {
    const imp = imports[i];
    const specifiers = (imp.specifiers ?? []).map((s) => {
      if (s.type === "default") {
        return {
          type: "ImportDefaultSpecifier",
          local: { type: "Identifier", name: s.local },
        };
      }
      if (s.type === "namespace") {
        return {
          type: "ImportNamespaceSpecifier",
          local: { type: "Identifier", name: s.local },
        };
      }
      return {
        type: "ImportSpecifier",
        imported: { type: "Identifier", name: s.imported },
        local: { type: "Identifier", name: s.local },
      };
    });
    body.push({
      type: "ImportDeclaration",
      source: { type: "Literal", value: imp.source },
      specifiers,
    });
  }

  for (let i = 0; i < exports.length; i++) {
    const exp = exports[i];
    if (exp.type === "default") {
      body.push({
        type: "ExportDefaultDeclaration",
        declaration: { type: "Identifier", name: exp.name ?? "x" },
      });
    } else if (exp.type === "named") {
      body.push({
        type: "ExportNamedDeclaration",
        declaration: {
          type: "VariableDeclaration",
          declarations: [
            { id: { type: "Identifier", name: exp.name ?? "x" }, init: null },
          ],
        },
        specifiers: [],
        source: null,
      });
    }
  }

  // Add dynamic imports as expression statements
  for (let i = 0; i < dynamicImports.length; i++) {
    body.push({
      type: "ExpressionStatement",
      expression: {
        type: "ImportExpression",
        source: { type: "Literal", value: dynamicImports[i] },
      },
    });
  }

  return {
    type: "Program",
    body: body as unknown as ProgramNode["body"],
    sourceType: "module",
  } as ProgramNode;
};

/** Helper to create a simple resolveId function. */
const createResolver = (
  moduleMap: Map<string, { external?: boolean }>,
): ((
  source: string,
  importer: string | undefined,
  isEntry: boolean,
) => Promise<ResolvedId | null>) => {
  return async (source: string): Promise<ResolvedId | null> => {
    const entry = moduleMap.get(source);
    if (!entry) {
      return null;
    }
    return {
      id: source,
      external: entry.external ?? false,
      moduleSideEffects: true,
      syntheticNamedExports: false,
      meta: {},
      resolvedBy: "test",
    };
  };
};

/** Helper to create a loadModule function. */
const createLoader = (
  astMap: Map<string, ProgramNode>,
): ((id: string) => Promise<{
  code: string;
  ast: unknown;
  meta: Record<string, unknown>;
  moduleSideEffects: boolean | "no-treeshake";
  syntheticNamedExports: boolean | string;
}>) => {
  return async (id: string) => {
    const ast = astMap.get(id) ?? createAst();
    return {
      code: `// ${id}`,
      ast,
      meta: {},
      moduleSideEffects: true as boolean | "no-treeshake",
      syntheticNamedExports: false as boolean | string,
    };
  };
};

// ============================================================
// normalizeInput
// ============================================================

describe("normalizeInput", () => {
  it("normalizes a string input to a record with 'main' key", () => {
    const result = normalizeInput("./src/index.ts");
    expect(result).toEqual({ main: "./src/index.ts" });
  });

  it("normalizes an array of strings using filenames as keys", () => {
    const result = normalizeInput(["./src/index.ts", "./src/other.js"]);
    expect(result).toEqual({
      index: "./src/index.ts",
      other: "./src/other.js",
    });
  });

  it("normalizes an array with path-like entries", () => {
    const result = normalizeInput(["./deep/nested/entry.ts"]);
    expect(result).toEqual({ entry: "./deep/nested/entry.ts" });
  });

  it("returns a copy of a record input", () => {
    const input = { app: "./app.ts", vendor: "./vendor.ts" };
    const result = normalizeInput(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });

  it("handles an empty array", () => {
    const result = normalizeInput([]);
    expect(result).toEqual({});
  });

  it("handles an empty record", () => {
    const result = normalizeInput({});
    expect(result).toEqual({});
  });
});

// ============================================================
// detectCircularDependencies
// ============================================================

describe("detectCircularDependencies", () => {
  it("returns empty array when there are no cycles", () => {
    const modA = new Module("a", "", true);
    const modB = new Module("b", "", false);
    modA.dependencies.add(modB);

    const modules = new Map<string, Module>([
      ["a", modA],
      ["b", modB],
    ]);

    const cycles = detectCircularDependencies(modules);
    expect(cycles).toEqual([]);
  });

  it("detects a simple A -> B -> A cycle", () => {
    const modA = new Module("a", "", true);
    const modB = new Module("b", "", false);
    modA.dependencies.add(modB);
    modB.dependencies.add(modA);

    const modules = new Map<string, Module>([
      ["a", modA],
      ["b", modB],
    ]);

    const cycles = detectCircularDependencies(modules);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    // At least one cycle contains both 'a' and 'b'
    const hasCycle = cycles.some((c) => c.includes("a") && c.includes("b"));
    expect(hasCycle).toBe(true);
  });

  it("detects a three-node cycle A -> B -> C -> A", () => {
    const modA = new Module("a", "", true);
    const modB = new Module("b", "", false);
    const modC = new Module("c", "", false);
    modA.dependencies.add(modB);
    modB.dependencies.add(modC);
    modC.dependencies.add(modA);

    const modules = new Map<string, Module>([
      ["a", modA],
      ["b", modB],
      ["c", modC],
    ]);

    const cycles = detectCircularDependencies(modules);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    const hasCycle = cycles.some(
      (c) => c.includes("a") && c.includes("b") && c.includes("c"),
    );
    expect(hasCycle).toBe(true);
  });

  it("ignores external modules in cycle detection", () => {
    const modA = new Module("a", "", true);
    const ext = new ExternalModule("ext");
    modA.dependencies.add(ext);

    const modules = new Map<string, Module>([["a", modA]]);

    const cycles = detectCircularDependencies(modules);
    expect(cycles).toEqual([]);
  });

  it("handles disconnected graph components", () => {
    const modA = new Module("a", "", true);
    const modB = new Module("b", "", true);

    const modules = new Map<string, Module>([
      ["a", modA],
      ["b", modB],
    ]);

    const cycles = detectCircularDependencies(modules);
    expect(cycles).toEqual([]);
  });
});

// ============================================================
// topologicalSort
// ============================================================

describe("topologicalSort", () => {
  it("returns single module for a graph with one node", () => {
    const modA = new Module("a", "", true);
    const modules = new Map<string, Module>([["a", modA]]);

    const result = topologicalSort(modules, [modA]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("places dependencies before dependents", () => {
    const modA = new Module("a", "", true);
    const modB = new Module("b", "", false);
    modA.dependencies.add(modB);

    const modules = new Map<string, Module>([
      ["a", modA],
      ["b", modB],
    ]);

    const result = topologicalSort(modules, [modA]);
    const indexA = result.findIndex((m) => m.id === "a");
    const indexB = result.findIndex((m) => m.id === "b");
    expect(indexB).toBeLessThan(indexA);
  });

  it("handles a chain A -> B -> C correctly", () => {
    const modA = new Module("a", "", true);
    const modB = new Module("b", "", false);
    const modC = new Module("c", "", false);
    modA.dependencies.add(modB);
    modB.dependencies.add(modC);

    const modules = new Map<string, Module>([
      ["a", modA],
      ["b", modB],
      ["c", modC],
    ]);

    const result = topologicalSort(modules, [modA]);
    const indexA = result.findIndex((m) => m.id === "a");
    const indexB = result.findIndex((m) => m.id === "b");
    const indexC = result.findIndex((m) => m.id === "c");
    expect(indexC).toBeLessThan(indexB);
    expect(indexB).toBeLessThan(indexA);
  });

  it("handles cyclic graphs by including all modules", () => {
    const modA = new Module("a", "", true);
    const modB = new Module("b", "", false);
    modA.dependencies.add(modB);
    modB.dependencies.add(modA);

    const modules = new Map<string, Module>([
      ["a", modA],
      ["b", modB],
    ]);

    const result = topologicalSort(modules, [modA]);
    expect(result).toHaveLength(2);
    const ids = result.map((m) => m.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });

  it("handles multiple independent entries", () => {
    const modA = new Module("a", "", true);
    const modB = new Module("b", "", true);

    const modules = new Map<string, Module>([
      ["a", modA],
      ["b", modB],
    ]);

    const result = topologicalSort(modules, [modA, modB]);
    expect(result).toHaveLength(2);
  });

  it("sorts entry and non-entry modules at zero in-degree correctly", () => {
    const modA = new Module("a", "", false);
    const modB = new Module("b", "", true);
    // Both have zero in-degree, but B is entry
    const modules = new Map<string, Module>([
      ["a", modA],
      ["b", modB],
    ]);

    const result = topologicalSort(modules, [modB]);
    expect(result).toHaveLength(2);
    // Both are included
    const ids = result.map((m) => m.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });

  it("handles duplicate in-degree decrements without double processing", () => {
    // A depends on C, B depends on C, both A and B have zero deps on each other
    const modA = new Module("a", "", true);
    const modB = new Module("b", "", true);
    const modC = new Module("c", "", false);
    modC.dependencies.add(modA);
    modC.dependencies.add(modB);

    const modules = new Map<string, Module>([
      ["a", modA],
      ["b", modB],
      ["c", modC],
    ]);

    const result = topologicalSort(modules, [modA, modB]);
    expect(result).toHaveLength(3);
    // C depends on A and B, so C comes after both
    const indexA = result.findIndex((m) => m.id === "a");
    const indexB = result.findIndex((m) => m.id === "b");
    const indexC = result.findIndex((m) => m.id === "c");
    expect(indexA).toBeLessThan(indexC);
    expect(indexB).toBeLessThan(indexC);
  });

  it("does not process a module twice when added to queue multiple times", () => {
    // A -> C, B -> C. Both A and B have zero in-degree.
    // When A is processed, C gets in-degree 1->0 and is queued.
    // When B is processed, C gets in-degree 0->-1 and is queued again.
    // The processed.has check prevents double processing.
    const modA = new Module("a", "", true);
    const modB = new Module("b", "", true);
    const modC = new Module("c", "", false);
    modA.dependencies.add(modC);
    modB.dependencies.add(modC);

    const modules = new Map<string, Module>([
      ["a", modA],
      ["b", modB],
      ["c", modC],
    ]);

    const result = topologicalSort(modules, [modA, modB]);
    // C should appear exactly once
    const cCount = result.filter((m) => m.id === "c").length;
    expect(cCount).toBe(1);
    expect(result).toHaveLength(3);
  });

  it("ignores external dependencies in topological sort", () => {
    const modA = new Module("a", "", true);
    const ext = new ExternalModule("ext");
    modA.dependencies.add(ext);

    const modules = new Map<string, Module>([["a", modA]]);

    const result = topologicalSort(modules, [modA]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });
});

// ============================================================
// buildModuleGraph
// ============================================================

describe("buildModuleGraph", () => {
  it("builds a graph with a single entry and no dependencies", async () => {
    const moduleMap = new Map([["./entry.ts", {}]]);
    const astMap = new Map([["./entry.ts", createAst()]]);

    const result = await buildModuleGraph({
      input: "./entry.ts",
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning: vi.fn(),
    });

    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].id).toBe("./entry.ts");
    expect(result.entryModules).toHaveLength(1);
    expect(result.externalModules).toHaveLength(0);
    expect(result.orderedModules).toHaveLength(1);
  });

  it("builds a graph with one dependency", async () => {
    const moduleMap = new Map([
      ["./entry.ts", {}],
      ["./dep.ts", {}],
    ]);
    const astMap = new Map([
      ["./entry.ts", createAst([{ source: "./dep.ts" }])],
      ["./dep.ts", createAst()],
    ]);

    const result = await buildModuleGraph({
      input: "./entry.ts",
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning: vi.fn(),
    });

    expect(result.modules).toHaveLength(2);
    expect(result.entryModules).toHaveLength(1);
    expect(result.entryModules[0].id).toBe("./entry.ts");
  });

  it("builds a chain A -> B -> C", async () => {
    const moduleMap = new Map([
      ["./a.ts", {}],
      ["./b.ts", {}],
      ["./c.ts", {}],
    ]);
    const astMap = new Map([
      ["./a.ts", createAst([{ source: "./b.ts" }])],
      ["./b.ts", createAst([{ source: "./c.ts" }])],
      ["./c.ts", createAst()],
    ]);

    const result = await buildModuleGraph({
      input: "./a.ts",
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning: vi.fn(),
    });

    expect(result.modules).toHaveLength(3);
    // Check ordering: C before B, B before A
    const ordered = result.orderedModules;
    const indexA = ordered.findIndex((m) => m.id === "./a.ts");
    const indexB = ordered.findIndex((m) => m.id === "./b.ts");
    const indexC = ordered.findIndex((m) => m.id === "./c.ts");
    expect(indexC).toBeLessThan(indexB);
    expect(indexB).toBeLessThan(indexA);
  });

  it("detects circular dependencies and emits warning", async () => {
    const moduleMap = new Map([
      ["./a.ts", {}],
      ["./b.ts", {}],
    ]);
    const astMap = new Map([
      ["./a.ts", createAst([{ source: "./b.ts" }])],
      ["./b.ts", createAst([{ source: "./a.ts" }])],
    ]);

    const onWarning = vi.fn();
    const result = await buildModuleGraph({
      input: "./a.ts",
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning,
    });

    expect(result.modules).toHaveLength(2);
    const circularWarnings = onWarning.mock.calls.filter(
      (c) => (c[0] as { code: string }).code === CIRCULAR_DEPENDENCY,
    );
    expect(circularWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("handles external modules", async () => {
    const moduleMap = new Map([
      ["./entry.ts", {}],
      ["lodash", { external: true }],
    ]);
    const astMap = new Map([["./entry.ts", createAst([{ source: "lodash" }])]]);

    const result = await buildModuleGraph({
      input: "./entry.ts",
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning: vi.fn(),
    });

    expect(result.modules).toHaveLength(1);
    expect(result.externalModules).toHaveLength(1);
    expect(result.externalModules[0].id).toBe("lodash");
  });

  it("queues dynamic imports", async () => {
    const moduleMap = new Map([
      ["./entry.ts", {}],
      ["./lazy.ts", {}],
    ]);
    const astMap = new Map([
      ["./entry.ts", createAst([], [], ["./lazy.ts"])],
      ["./lazy.ts", createAst()],
    ]);

    const result = await buildModuleGraph({
      input: "./entry.ts",
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning: vi.fn(),
    });

    expect(result.modules).toHaveLength(2);
    const ids = result.modules.map((m) => m.id);
    expect(ids).toContain("./lazy.ts");
  });

  it("handles multiple entries", async () => {
    const moduleMap = new Map([
      ["./a.ts", {}],
      ["./b.ts", {}],
    ]);
    const astMap = new Map([
      ["./a.ts", createAst()],
      ["./b.ts", createAst()],
    ]);

    const result = await buildModuleGraph({
      input: { app: "./a.ts", vendor: "./b.ts" },
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning: vi.fn(),
    });

    expect(result.modules).toHaveLength(2);
    expect(result.entryModules).toHaveLength(2);
  });

  it("throws on unresolved entry", async () => {
    const moduleMap = new Map<string, { external?: boolean }>();

    await expect(
      buildModuleGraph({
        input: "./missing.ts",
        resolveId: createResolver(moduleMap),
        loadModule: createLoader(new Map()),
        onWarning: vi.fn(),
      }),
    ).rejects.toThrow(UNRESOLVED_ENTRY);
  });

  it("warns on unresolved import (non-entry)", async () => {
    const moduleMap = new Map([["./entry.ts", {}]]);
    const astMap = new Map([
      ["./entry.ts", createAst([{ source: "./missing.ts" }])],
    ]);

    const onWarning = vi.fn();
    const result = await buildModuleGraph({
      input: "./entry.ts",
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning,
    });

    expect(result.modules).toHaveLength(1);
    const unresolvedWarnings = onWarning.mock.calls.filter(
      (c) => (c[0] as { code: string }).code === UNRESOLVED_IMPORT,
    );
    expect(unresolvedWarnings.length).toBe(1);
  });

  it("does not duplicate modules visited from multiple paths", async () => {
    // A -> B, A -> C, B -> C
    const moduleMap = new Map([
      ["./a.ts", {}],
      ["./b.ts", {}],
      ["./c.ts", {}],
    ]);
    const astMap = new Map([
      ["./a.ts", createAst([{ source: "./b.ts" }, { source: "./c.ts" }])],
      ["./b.ts", createAst([{ source: "./c.ts" }])],
      ["./c.ts", createAst()],
    ]);

    const result = await buildModuleGraph({
      input: "./a.ts",
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning: vi.fn(),
    });

    expect(result.modules).toHaveLength(3);
    // C should be in dependencies of both A and B
    const modA = result.modules.find((m) => m.id === "./a.ts")!;
    const modB = result.modules.find((m) => m.id === "./b.ts")!;
    const modC = result.modules.find((m) => m.id === "./c.ts")!;
    expect(modA.dependencies.has(modC)).toBe(true);
    expect(modB.dependencies.has(modC)).toBe(true);
  });

  it("links importers correctly", async () => {
    const moduleMap = new Map([
      ["./entry.ts", {}],
      ["./dep.ts", {}],
    ]);
    const astMap = new Map([
      ["./entry.ts", createAst([{ source: "./dep.ts" }])],
      ["./dep.ts", createAst()],
    ]);

    const result = await buildModuleGraph({
      input: "./entry.ts",
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning: vi.fn(),
    });

    const dep = result.modules.find((m) => m.id === "./dep.ts")!;
    const entry = result.modules.find((m) => m.id === "./entry.ts")!;
    expect(dep.importers.has(entry)).toBe(true);
  });

  it("emits shimmed export warning when enabled", async () => {
    const moduleMap = new Map([["./entry.ts", {}]]);
    const onWarning = vi.fn();

    const result = await buildModuleGraph({
      input: "./entry.ts",
      resolveId: createResolver(moduleMap),
      loadModule: async () => ({
        code: "// entry",
        ast: createAst(),
        meta: {},
        moduleSideEffects: true as boolean | "no-treeshake",
        syntheticNamedExports: true as boolean | string,
      }),
      onWarning,
      shimMissingExports: true,
    });

    expect(result.modules).toHaveLength(1);
    const shimWarnings = onWarning.mock.calls.filter(
      (c) => (c[0] as { code: string }).code === SHIMMED_EXPORT,
    );
    expect(shimWarnings.length).toBe(1);
  });

  it("handles array input normalization in buildModuleGraph", async () => {
    const moduleMap = new Map([
      ["./app.ts", {}],
      ["./vendor.ts", {}],
    ]);
    const astMap = new Map([
      ["./app.ts", createAst()],
      ["./vendor.ts", createAst()],
    ]);

    const result = await buildModuleGraph({
      input: ["./app.ts", "./vendor.ts"],
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning: vi.fn(),
    });

    expect(result.entryModules).toHaveLength(2);
  });

  it("links external module importers correctly", async () => {
    const moduleMap = new Map([
      ["./entry.ts", {}],
      ["react", { external: true }],
    ]);
    const astMap = new Map([["./entry.ts", createAst([{ source: "react" }])]]);

    const result = await buildModuleGraph({
      input: "./entry.ts",
      resolveId: createResolver(moduleMap),
      loadModule: createLoader(astMap),
      onWarning: vi.fn(),
    });

    const ext = result.externalModules[0];
    const entry = result.modules[0];
    expect(ext.importers.has(entry)).toBe(true);
    expect(entry.dependencies.has(ext)).toBe(true);
  });
});
