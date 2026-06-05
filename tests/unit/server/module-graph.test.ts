/**
 * @module tests/unit/server/module-graph
 * @description Unit tests for the HMR module dependency graph.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ModuleGraph } from "../../../src/server/module-graph.js";

describe("ModuleGraph", () => {
  let graph: ModuleGraph;

  beforeEach(() => {
    graph = new ModuleGraph();
  });

  it("should create a new module node via ensureModule", () => {
    const node = graph.ensureModule("/src/app.ts");
    expect(node.id).toBe("/src/app.ts");
    expect(node.importedModules.size).toBe(0);
    expect(node.importers.size).toBe(0);
  });

  it("should return the same node for the same id", () => {
    const node1 = graph.ensureModule("/src/app.ts");
    const node2 = graph.ensureModule("/src/app.ts");
    expect(node1).toBe(node2);
  });

  it("should get a module by id", () => {
    graph.ensureModule("/src/app.ts");
    expect(graph.getModule("/src/app.ts")).toBeDefined();
    expect(graph.getModule("/src/missing.ts")).toBeUndefined();
  });

  it("should track the total number of modules", () => {
    expect(graph.size).toBe(0);
    graph.ensureModule("/src/a.ts");
    graph.ensureModule("/src/b.ts");
    expect(graph.size).toBe(2);
  });

  it("should update import relationships", () => {
    graph.updateModule("/src/app.ts", ["/src/utils.ts", "/src/config.ts"]);

    const app = graph.getModule("/src/app.ts")!;
    const utils = graph.getModule("/src/utils.ts")!;
    const config = graph.getModule("/src/config.ts")!;

    expect(app.importedModules.size).toBe(2);
    expect(utils.importers.has(app)).toBe(true);
    expect(config.importers.has(app)).toBe(true);
  });

  it("should remove stale imports when updating", () => {
    graph.updateModule("/src/app.ts", ["/src/old.ts"]);
    graph.updateModule("/src/app.ts", ["/src/new.ts"]);

    const app = graph.getModule("/src/app.ts")!;
    const old = graph.getModule("/src/old.ts")!;
    const newMod = graph.getModule("/src/new.ts")!;

    expect(app.importedModules.has(old)).toBe(false);
    expect(old.importers.has(app)).toBe(false);
    expect(app.importedModules.has(newMod)).toBe(true);
    expect(newMod.importers.has(app)).toBe(true);
  });

  it("should return all module ids", () => {
    graph.ensureModule("/src/a.ts");
    graph.ensureModule("/src/b.ts");
    const ids = graph.getModuleIds();
    expect(ids).toContain("/src/a.ts");
    expect(ids).toContain("/src/b.ts");
  });

  it("should mark a module as self-accepting", () => {
    graph.markSelfAccepting("/src/app.ts");
    const node = graph.getModule("/src/app.ts")!;
    expect(node.acceptsSelfUpdate).toBe(true);
  });

  it("should mark accepted dependencies", () => {
    graph.markAcceptedDeps("/src/app.ts", ["/src/utils.ts"]);
    const node = graph.getModule("/src/app.ts")!;
    expect(node.acceptedDeps.has("/src/utils.ts")).toBe(true);
  });

  // --- HMR propagation tests ---

  it("should return empty result for unknown module", () => {
    const result = graph.propagateUpdate("/src/unknown.ts");
    expect(result.modulesToUpdate).toEqual([]);
    expect(result.needsFullReload).toBe(false);
  });

  it("should stop at self-accepting module", () => {
    graph.ensureModule("/src/app.ts");
    graph.markSelfAccepting("/src/app.ts");

    const result = graph.propagateUpdate("/src/app.ts");
    expect(result.needsFullReload).toBe(false);
    expect(result.modulesToUpdate.length).toBe(1);
    expect(result.modulesToUpdate[0].id).toBe("/src/app.ts");
  });

  it("should propagate to importer that accepts the dep", () => {
    graph.updateModule("/src/app.ts", ["/src/child.ts"]);
    graph.markAcceptedDeps("/src/app.ts", ["/src/child.ts"]);

    const result = graph.propagateUpdate("/src/child.ts");
    expect(result.needsFullReload).toBe(false);
    expect(result.modulesToUpdate.length).toBe(1);
    expect(result.modulesToUpdate[0].id).toBe("/src/app.ts");
  });

  it("should propagate to self-accepting importer", () => {
    graph.updateModule("/src/app.ts", ["/src/child.ts"]);
    graph.markSelfAccepting("/src/app.ts");

    const result = graph.propagateUpdate("/src/child.ts");
    expect(result.needsFullReload).toBe(false);
    expect(result.modulesToUpdate.length).toBe(1);
    expect(result.modulesToUpdate[0].id).toBe("/src/app.ts");
  });

  it("should require full reload when no boundary found", () => {
    // root -> mid -> leaf, no boundaries
    graph.updateModule("/src/root.ts", ["/src/mid.ts"]);
    graph.updateModule("/src/mid.ts", ["/src/leaf.ts"]);

    const result = graph.propagateUpdate("/src/leaf.ts");
    expect(result.needsFullReload).toBe(true);
  });

  it("should handle deep boundary detection", () => {
    // root(accepts mid) -> mid -> leaf
    graph.updateModule("/src/root.ts", ["/src/mid.ts"]);
    graph.updateModule("/src/mid.ts", ["/src/leaf.ts"]);
    graph.markSelfAccepting("/src/root.ts");

    const result = graph.propagateUpdate("/src/leaf.ts");
    expect(result.needsFullReload).toBe(false);
    expect(result.modulesToUpdate.length).toBe(1);
    expect(result.modulesToUpdate[0].id).toBe("/src/root.ts");
  });

  it("should remove a module and its edges", () => {
    graph.updateModule("/src/app.ts", ["/src/child.ts"]);
    graph.removeModule("/src/child.ts");

    expect(graph.getModule("/src/child.ts")).toBeUndefined();
    const app = graph.getModule("/src/app.ts")!;
    expect(app.importedModules.size).toBe(0);
  });

  it("should handle removing a non-existent module gracefully", () => {
    graph.removeModule("/src/nonexistent.ts");
    expect(graph.size).toBe(0);
  });
});
