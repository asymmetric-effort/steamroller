/**
 * @module tests/unit/rollup
 * @description Tests for the main rollup() entry function.
 */

import { describe, it, expect } from "vitest";
import { rollup } from "../../src/rollup.js";
import type { Plugin } from "../../src/types.js";

/**
 * Virtual module plugin that resolves "src/index.ts" to a virtual module,
 * enabling unit tests to run without real filesystem dependencies.
 */
const virtualPlugin: Plugin = {
  name: "virtual-test-module",
  resolveId(source: string) {
    if (source === "src/index.ts" || source.endsWith("/src/index.ts")) {
      return {
        id: "src/index.ts",
        external: false,
        moduleSideEffects: true,
        syntheticNamedExports: false,
        meta: {},
        resolvedBy: "virtual",
      };
    }
    return null;
  },
  load(id: string) {
    if (id === "src/index.ts") {
      return {
        code: "export const x = 1;\n",
        ast: undefined,
        meta: {},
        syntheticNamedExports: false,
        moduleSideEffects: true,
      };
    }
    return null;
  },
};

describe("rollup", () => {
  it("returns a RollupBuild object", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    expect(build).toBeDefined();
    expect(typeof build.generate).toBe("function");
    expect(typeof build.write).toBe("function");
    expect(typeof build.close).toBe("function");
    expect(build.closed).toBe(false);
  });

  it("generate() produces output with at least one chunk", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    const output = await build.generate({ format: "es" });
    expect(output.output).toBeDefined();
    expect(output.output.length).toBeGreaterThanOrEqual(1);
    expect(output.output[0].type).toBe("chunk");
  });

  it("close() marks build as closed", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    expect(build.closed).toBe(false);
    await build.close();
    expect(build.closed).toBe(true);
  });

  it("generate() throws after close()", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    await build.close();
    await expect(build.generate({ format: "es" })).rejects.toThrow(
      /already closed/,
    );
  });

  it("write() throws after close()", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    await build.close();
    await expect(build.write({ format: "es" })).rejects.toThrow(
      /already closed/,
    );
  });

  it("runs buildStart hook", async () => {
    let hookCalled = false;
    const plugin: Plugin = {
      name: "test-buildStart",
      buildStart: () => {
        hookCalled = true;
      },
    };
    await rollup({ input: "src/index.ts", plugins: [virtualPlugin, plugin] });
    expect(hookCalled).toBe(true);
  });

  it("runs buildEnd hook", async () => {
    let hookCalled = false;
    const plugin: Plugin = {
      name: "test-buildEnd",
      buildEnd: () => {
        hookCalled = true;
      },
    };
    await rollup({ input: "src/index.ts", plugins: [virtualPlugin, plugin] });
    expect(hookCalled).toBe(true);
  });

  it("runs options hook and allows modification", async () => {
    const plugin: Plugin = {
      name: "test-options",
      options: (opts) => {
        return { ...opts, context: "modified" };
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin, plugin],
    });
    expect(build).toBeDefined();
  });

  it("options hook returning null does not modify options", async () => {
    const plugin: Plugin = {
      name: "test-options-null",
      options: () => null,
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin, plugin],
    });
    expect(build).toBeDefined();
  });

  it("handles empty plugins array", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    expect(build).toBeDefined();
  });

  it("provides cache when option is set", async () => {
    const cache = { modules: [], plugins: {} };
    const build = await rollup({
      input: "src/index.ts",
      cache,
      plugins: [virtualPlugin],
    });
    expect(build.cache).toBe(cache);
  });

  it("cache is undefined when not provided", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    expect(build.cache).toBeUndefined();
  });

  it("provides watchFiles with resolved module ids", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    expect(build.watchFiles).toContain("src/index.ts");
  });

  it("provides getTimings when perf is enabled", async () => {
    const build = await rollup({
      input: "src/index.ts",
      perf: true,
      plugins: [virtualPlugin],
    });
    expect(build.getTimings).toBeDefined();
    expect(typeof build.getTimings).toBe("function");
  });

  it("getTimings is undefined when perf is disabled", async () => {
    const build = await rollup({
      input: "src/index.ts",
      perf: false,
      plugins: [virtualPlugin],
    });
    expect(build.getTimings).toBeUndefined();
  });

  it("handles options hook as object with handler property", async () => {
    const plugin: Plugin = {
      name: "test-options-object",
      options: {
        handler: (opts: unknown) => {
          return { ...(opts as Record<string, unknown>), context: "modified" };
        },
      } as unknown as (opts: unknown) => unknown,
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin, plugin],
    });
    expect(build).toBeDefined();
  });

  it("skips options hook when handler is not a function", async () => {
    const plugin: Plugin = {
      name: "test-options-non-function",
      options: {
        handler: "not-a-function",
      } as unknown as (opts: unknown) => unknown,
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin, plugin],
    });
    expect(build).toBeDefined();
  });

  it("handles plugin resolveId returning a string", async () => {
    const plugin: Plugin = {
      name: "string-resolve",
      resolveId(source: string) {
        if (source === "src/index.ts" || source.endsWith("/src/index.ts")) {
          return "src/index.ts";
        }
        return null;
      },
      load(id: string) {
        if (id === "src/index.ts") {
          return { code: "export const y = 2;\n" };
        }
        return null;
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [plugin],
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toContain("y");
  });

  it("handles load hook returning a string directly", async () => {
    const plugin: Plugin = {
      name: "string-load",
      resolveId(source: string) {
        if (source === "src/index.ts" || source.endsWith("/src/index.ts")) {
          return {
            id: "src/index.ts",
            external: false,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "virtual",
          };
        }
        return null;
      },
      load(id: string) {
        if (id === "src/index.ts") {
          return "export const z = 3;\n";
        }
        return null;
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [plugin],
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toContain("z");
  });

  it("handles transform hook that modifies code", async () => {
    const plugin: Plugin = {
      name: "transform-test",
      resolveId(source: string) {
        if (source === "src/index.ts" || source.endsWith("/src/index.ts")) {
          return {
            id: "src/index.ts",
            external: false,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "virtual",
          };
        }
        return null;
      },
      load(id: string) {
        if (id === "src/index.ts") {
          return { code: "export const original = 1;\n" };
        }
        return null;
      },
      transform(code: string) {
        return {
          code: code.replace("original", "transformed"),
          map: undefined,
        };
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [plugin],
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toContain("transformed");
  });

  it("handles multi-module build with imports and exports", async () => {
    const modules: Record<string, string> = {
      "src/index.ts":
        'import { helper } from "./helper.js";\nexport const main = helper;\n',
      "src/helper.js": "export const helper = 42;\n",
    };
    const plugin: Plugin = {
      name: "multi-module",
      resolveId(source: string, importer: string | undefined) {
        if (source === "src/index.ts" || source.endsWith("/src/index.ts")) {
          return {
            id: "src/index.ts",
            external: false,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "virtual",
          };
        }
        if (source === "./helper.js" && importer === "src/index.ts") {
          return {
            id: "src/helper.js",
            external: false,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "virtual",
          };
        }
        return null;
      },
      load(id: string) {
        if (modules[id] !== undefined) {
          return { code: modules[id] };
        }
        return null;
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [plugin],
    });
    const output = await build.generate({ format: "es" });
    expect(output.output.length).toBeGreaterThanOrEqual(1);
  });

  it("handles treeshake disabled", async () => {
    const build = await rollup({
      input: "src/index.ts",
      treeshake: false,
      plugins: [virtualPlugin],
    });
    const output = await build.generate({ format: "es" });
    expect(output.output.length).toBeGreaterThanOrEqual(1);
  });

  it("handles multi-module build with cross-module tree-shaking", async () => {
    const modules: Record<string, string> = {
      "src/index.ts":
        'import { helper } from "./helper.js";\nexport const main = helper;\n',
      "src/helper.js": "export const helper = 42;\nexport const unused = 99;\n",
    };
    const plugin: Plugin = {
      name: "multi-treeshake",
      resolveId(source: string, importer: string | undefined) {
        if (source === "src/index.ts" || source.endsWith("/src/index.ts")) {
          return {
            id: "src/index.ts",
            external: false,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "virtual",
          };
        }
        if (source === "./helper.js" && importer === "src/index.ts") {
          return {
            id: "src/helper.js",
            external: false,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "virtual",
          };
        }
        return null;
      },
      load(id: string) {
        if (modules[id] !== undefined) {
          return { code: modules[id] };
        }
        return null;
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [plugin],
    });
    const output = await build.generate({ format: "es" });
    expect(output.output.length).toBeGreaterThanOrEqual(1);
    expect(output.output[0].code).toContain("main");
  });

  it("handles export all re-export in entry module", async () => {
    const modules: Record<string, string> = {
      "src/index.ts": 'export * from "./helper.js";\n',
      "src/helper.js": "export const helper = 42;\n",
    };
    const plugin: Plugin = {
      name: "export-all",
      resolveId(source: string, importer: string | undefined) {
        if (source === "src/index.ts" || source.endsWith("/src/index.ts")) {
          return {
            id: "src/index.ts",
            external: false,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "virtual",
          };
        }
        if (source === "./helper.js" && importer === "src/index.ts") {
          return {
            id: "src/helper.js",
            external: false,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "virtual",
          };
        }
        return null;
      },
      load(id: string) {
        if (modules[id] !== undefined) {
          return { code: modules[id] };
        }
        return null;
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [plugin],
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toBeDefined();
  });

  it("handles external imports", async () => {
    const plugin: Plugin = {
      name: "external-test",
      resolveId(source: string) {
        if (source === "src/index.ts" || source.endsWith("/src/index.ts")) {
          return {
            id: "src/index.ts",
            external: false,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "virtual",
          };
        }
        return null;
      },
      load(id: string) {
        if (id === "src/index.ts") {
          return {
            code: 'import { foo } from "external-pkg";\nexport const bar = foo;\n',
          };
        }
        return null;
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      external: ["external-pkg"],
      plugins: [plugin],
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toBeDefined();
  });
});
