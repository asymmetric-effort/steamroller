/**
 * @module tests/unit/config/normalize-input
 * @description Tests for input options normalization.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeInputOptions,
  normalizeInput,
  normalizeExternal,
  normalizePlugins,
  normalizeModuleContext,
} from "../../../src/config/normalize-input.js";
import type { InputOptions, Plugin } from "../../../src/types.js";

describe("normalizeInput", () => {
  it("returns empty array for undefined input", () => {
    const result = normalizeInput(undefined);
    expect(result).toEqual([]);
  });

  it("converts string to { main: string } record", () => {
    const result = normalizeInput("src/index.ts");
    expect(result).toEqual({ main: "src/index.ts" });
  });

  it("converts string array to indexed record", () => {
    const result = normalizeInput(["src/a.ts", "src/b.ts"]);
    expect(result).toEqual({ "0": "src/a.ts", "1": "src/b.ts" });
  });

  it("returns empty array for empty array input", () => {
    const result = normalizeInput([]);
    expect(result).toEqual([]);
  });

  it("passes through record form unchanged", () => {
    const input = { main: "src/main.ts", worker: "src/worker.ts" };
    const result = normalizeInput(input);
    expect(result).toEqual(input);
  });
});

describe("normalizeExternal", () => {
  it("returns false-returning function for undefined", () => {
    const fn = normalizeExternal(undefined);
    expect(fn("lodash", undefined, false)).toBe(false);
  });

  it("wraps string into equality check", () => {
    const fn = normalizeExternal("lodash");
    expect(fn("lodash", undefined, false)).toBe(true);
    expect(fn("react", undefined, false)).toBe(false);
  });

  it("wraps RegExp into test function", () => {
    const fn = normalizeExternal(/^node:/);
    expect(fn("node:fs", undefined, false)).toBe(true);
    expect(fn("lodash", undefined, false)).toBe(false);
  });

  it("wraps array of strings and regexps", () => {
    const fn = normalizeExternal(["lodash", /^node:/]);
    expect(fn("lodash", undefined, false)).toBe(true);
    expect(fn("node:path", undefined, false)).toBe(true);
    expect(fn("react", undefined, false)).toBe(false);
  });

  it("passes through function form", () => {
    const fn = normalizeExternal((source) => source === "external");
    expect(fn("external", undefined, false)).toBe(true);
    expect(fn("internal", undefined, false)).toBe(false);
  });

  it("coerces non-true return values to false", () => {
    const fn = normalizeExternal(
      (() => undefined) as unknown as (
        source: string,
        importer: string | undefined,
        isResolved: boolean,
      ) => boolean,
    );
    expect(fn("anything", undefined, false)).toBe(false);
  });
});

describe("normalizePlugins", () => {
  it("returns empty array for undefined", () => {
    const result = normalizePlugins(undefined);
    expect(result).toEqual([]);
  });

  it("filters null and false values", () => {
    const plugin: Plugin = { name: "test" };
    const result = normalizePlugins([
      plugin,
      null,
      false,
      undefined,
    ] as unknown as ReadonlyArray<Plugin>);
    expect(result).toEqual([plugin]);
  });

  it("flattens nested arrays", () => {
    const p1: Plugin = { name: "p1" };
    const p2: Plugin = { name: "p2" };
    const p3: Plugin = { name: "p3" };
    const result = normalizePlugins([
      p1,
      [p2, [p3]],
    ] as unknown as ReadonlyArray<Plugin>);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(p1);
    expect(result[1]).toBe(p2);
    expect(result[2]).toBe(p3);
  });
});

describe("normalizeModuleContext", () => {
  it("returns default context for undefined", () => {
    const fn = normalizeModuleContext(undefined, "undefined");
    expect(fn("any-module")).toBe("undefined");
  });

  it("wraps function, falls back to default on null return", () => {
    const fn = normalizeModuleContext(
      (id) => (id === "special" ? "window" : null),
      "undefined",
    );
    expect(fn("special")).toBe("window");
    expect(fn("other")).toBe("undefined");
  });

  it("wraps record into lookup function", () => {
    const fn = normalizeModuleContext(
      { "src/legacy.js": "window" },
      "undefined",
    );
    expect(fn("src/legacy.js")).toBe("window");
    expect(fn("src/modern.js")).toBe("undefined");
  });
});

describe("normalizeInputOptions", () => {
  it("produces valid NormalizedInputOptions with minimal input", () => {
    const result = normalizeInputOptions({});
    expect(result.context).toBe("undefined");
    expect(result.logLevel).toBe("info");
    expect(result.maxParallelFileOps).toBe(20);
    expect(result.perf).toBe(false);
    expect(result.preserveSymlinks).toBe(false);
    expect(result.shimMissingExports).toBe(false);
    expect(result.strictDeprecations).toBe(false);
    expect(result.experimentalCacheExpiry).toBe(10);
    expect(result.experimentalLogSideEffects).toBe(false);
    expect(result.makeAbsoluteExternalsRelative).toBe("ifRelativeSource");
    expect(result.preserveEntrySignatures).toBe("exports-only");
  });

  it("normalizes input string to record", () => {
    const result = normalizeInputOptions({ input: "src/index.ts" });
    expect(result.input).toEqual({ main: "src/index.ts" });
  });

  it("normalizes external into function", () => {
    const result = normalizeInputOptions({ external: ["lodash"] });
    expect(result.external("lodash", undefined, false)).toBe(true);
    expect(result.external("react", undefined, false)).toBe(false);
  });

  it("normalizes treeshake true to recommended preset", () => {
    const result = normalizeInputOptions({ treeshake: true });
    expect(result.treeshake).not.toBe(false);
    expect((result.treeshake as { annotations: boolean }).annotations).toBe(
      true,
    );
  });

  it("normalizes treeshake false", () => {
    const result = normalizeInputOptions({ treeshake: false });
    expect(result.treeshake).toBe(false);
  });

  it("normalizes plugins array with nulls removed", () => {
    const p: Plugin = { name: "test-plugin" };
    const result = normalizeInputOptions({
      plugins: [p, null] as unknown as InputOptions["plugins"],
    });
    expect(result.plugins).toEqual([p]);
  });

  it("normalizes cache object", () => {
    const cache = { modules: [], plugins: {} };
    const result = normalizeInputOptions({ cache });
    expect(result.cache).toBe(cache);
  });

  it("normalizes cache false", () => {
    const result = normalizeInputOptions({ cache: false });
    expect(result.cache).toBe(false);
  });

  it("provides default onLog handler", () => {
    const result = normalizeInputOptions({});
    expect(typeof result.onLog).toBe("function");
    // Should not throw
    result.onLog("warn", { message: "test" });
  });

  it("uses custom onLog", () => {
    const logs: Array<unknown> = [];
    const result = normalizeInputOptions({
      onLog: (level, log) => {
        logs.push({ level, log });
      },
    });
    result.onLog("warn", { message: "hello" });
    expect(logs).toHaveLength(1);
  });

  it("normalizes moduleContext record", () => {
    const result = normalizeInputOptions({
      context: "globalThis",
      moduleContext: { "legacy.js": "window" },
    });
    expect(result.moduleContext("legacy.js")).toBe("window");
    expect(result.moduleContext("other.js")).toBe("globalThis");
  });

  it("normalizes custom context string", () => {
    const result = normalizeInputOptions({ context: "globalThis" });
    expect(result.context).toBe("globalThis");
  });

  it("uses custom logLevel", () => {
    const result = normalizeInputOptions({ logLevel: "debug" });
    expect(result.logLevel).toBe("debug");
  });

  it("uses custom maxParallelFileOps", () => {
    const result = normalizeInputOptions({ maxParallelFileOps: 5 });
    expect(result.maxParallelFileOps).toBe(5);
  });
});
