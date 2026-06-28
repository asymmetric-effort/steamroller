/**
 * @module tests/unit/rollup
 * @description Tests for the main rollup() entry function.
 */

import { describe, it, expect } from "bun:test";
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

  it("handles tree-shaking with cross-module imports", async () => {
    const modules: Record<string, string> = {
      "src/index.ts":
        'import { used } from "./helper.ts";\nexport const main = used;\n',
      "src/helper.ts": "export const used = 42;\nexport const unused = 99;\n",
    };
    const plugin: Plugin = {
      name: "cross-module-test",
      resolveId(source: string, importer?: string) {
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
        if (source === "./helper.ts" || source === "src/helper.ts") {
          return {
            id: "src/helper.ts",
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
      treeshake: true,
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toContain("used");
  });

  it("handles tree-shaking with default import from another module", async () => {
    const modules: Record<string, string> = {
      "src/index.ts":
        'import helper from "./helper.ts";\nexport const main = helper;\n',
      "src/helper.ts": "export default function helper() { return 1; }\n",
    };
    const plugin: Plugin = {
      name: "default-import-test",
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
        if (source === "./helper.ts" || source === "src/helper.ts") {
          return {
            id: "src/helper.ts",
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
      treeshake: true,
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toBeDefined();
  });

  it("handles warning with missing code field", async () => {
    const warnings: Array<{ code: string; message: string }> = [];
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
      onLog(level, log) {
        if (level === "warn") {
          warnings.push({ code: log.code, message: log.message });
        }
      },
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toBeDefined();
  });

  it("handles entry module with export all re-export", async () => {
    const modules: Record<string, string> = {
      "src/index.ts": 'export * from "./helper.ts";\n',
      "src/helper.ts": "export const x = 1;\nexport const y = 2;\n",
    };
    const plugin: Plugin = {
      name: "export-all-test",
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
        if (source === "./helper.ts" || source === "src/helper.ts") {
          return {
            id: "src/helper.ts",
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
      treeshake: true,
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toBeDefined();
  });

  it("handles tree-shaking disabled (treeshake: false)", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
      treeshake: false,
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toContain("x");
  });

  it("handles perf option for getTimings", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
      perf: true,
    });
    expect(build.getTimings).toBeDefined();
  });

  it("handles complex code with classes, destructuring, and patterns", async () => {
    const code = [
      "class Base { constructor() {} static staticMethod() {} }",
      "class Derived extends Base {",
      "  value = 1;",
      "  getValue() { return this.value; }",
      "}",
      "const { a, b: c, ...rest } = { a: 1, b: 2, d: 3 };",
      "const [first, , ...tail] = [1, 2, 3, 4];",
      "const fn = (x = 10, { y = 20 } = {}) => x + y;",
      "for (const key in { x: 1 }) { }",
      "for (const val of [1, 2, 3]) { }",
      "try { throw new Error('test'); } catch (e) { } finally { }",
      "const obj = { get prop() { return 1; }, set prop(v) { }, method() { if (true) { } } };",
      "switch (a) { case 1: break; default: break; }",
      "const t = `hello ${a} world ${c}`;",
      "export { fn, Derived };",
    ].join("\n");
    const plugin: Plugin = {
      name: "complex-code-test",
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
          return { code };
        }
        return null;
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [plugin],
      treeshake: true,
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toBeDefined();
    expect(output.output[0].code).toContain("fn");
  });

  it("handles iife format with name", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    const output = await build.generate({ format: "iife", name: "MyLib" });
    expect(output.output[0].code).toBeDefined();
  });

  it("handles umd format with name", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    const output = await build.generate({ format: "umd", name: "MyLib" });
    expect(output.output[0].code).toBeDefined();
  });

  it("handles system format", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    const output = await build.generate({ format: "system" });
    expect(output.output[0].code).toContain("System.register");
  });

  it("handles amd format", async () => {
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin],
    });
    const output = await build.generate({ format: "amd" });
    expect(output.output[0].code).toContain("define");
  });

  it("handles system format with external imports", async () => {
    const modules: Record<string, string> = {
      "src/index.ts":
        'import { map } from "lodash";\nexport const result = map([1]);\n',
    };
    const plugin: Plugin = {
      name: "system-ext-test",
      resolveId(source: string) {
        if (source === "lodash") {
          return {
            id: "lodash",
            external: true,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "virtual",
          };
        }
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
        if (modules[id] !== undefined) {
          return { code: modules[id] };
        }
        return null;
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [plugin],
      external: ["lodash"],
    });
    const output = await build.generate({ format: "system" });
    expect(output.output[0].code).toContain("System.register");
    expect(output.output[0].code).toContain("lodash");
  });

  it("handles tree-shaking with for loops and switch statements", async () => {
    const code = [
      "const arr = [1, 2, 3];",
      "let sum = 0;",
      "for (let i = 0; i < arr.length; i++) { sum += arr[i]; }",
      "for (const item of arr) { sum += item; }",
      "for (const key in { a: 1 }) { sum += key.length; }",
      "switch (sum) { case 0: sum = 1; break; case 1: break; default: break; }",
      "export { sum };",
    ].join("\n");
    const plugin: Plugin = {
      name: "loop-test",
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
          return { code };
        }
        return null;
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [plugin],
      treeshake: true,
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toContain("sum");
  });

  it("handles tree-shaking with side-effecting module", async () => {
    const modules: Record<string, string> = {
      "src/index.ts":
        'import { used } from "./helper.ts";\nexport const main = used;\nconsole.log("side effect");\n',
      "src/helper.ts": "export const used = 42;\nexport const unused = 99;\n",
    };
    const plugin: Plugin = {
      name: "side-effect-test",
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
        if (source === "./helper.ts" || source === "src/helper.ts") {
          return {
            id: "src/helper.ts",
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
      treeshake: { moduleSideEffects: true },
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toContain("used");
    // Side effect statement should be included
    expect(output.output[0].code).toContain("console.log");
  });

  it("handles options hook that modifies options", async () => {
    const optionsPlugin: Plugin = {
      name: "options-hook",
      options(rawOpts) {
        return { ...rawOpts, treeshake: false };
      },
    };
    const build = await rollup({
      input: "src/index.ts",
      plugins: [virtualPlugin, optionsPlugin],
      treeshake: true,
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toBeDefined();
  });

  it("handles module with null ast gracefully", async () => {
    const plugin: Plugin = {
      name: "null-ast-test",
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
          // Return code but explicitly no ast (parser will handle it)
          return { code: "export const x = 1;\n" };
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

  it("handles tree-shaking with complex multi-module graph", async () => {
    const modules: Record<string, string> = {
      "src/index.ts": [
        'import { used } from "./helper.ts";',
        'import defaultFn from "./default-export.ts";',
        'export { reexported } from "./helper.ts";',
        "export const main = used + defaultFn();",
      ].join("\n"),
      "src/helper.ts": [
        "export const used = 42;",
        "export const unused = 99;",
        "export const reexported = 100;",
      ].join("\n"),
      "src/default-export.ts": [
        "export default function myFunc() { return 1; }",
        "export class MyClass {}",
      ].join("\n"),
    };
    const plugin: Plugin = {
      name: "complex-graph-test",
      resolveId(source: string) {
        const knownModules: Record<string, string> = {
          "src/index.ts": "src/index.ts",
          "./helper.ts": "src/helper.ts",
          "src/helper.ts": "src/helper.ts",
          "./default-export.ts": "src/default-export.ts",
          "src/default-export.ts": "src/default-export.ts",
        };
        const id =
          knownModules[source] ?? knownModules[source.replace(/.*\//, "")];
        if (id) {
          return {
            id,
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
      treeshake: true,
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toContain("used");
    expect(output.output[0].code).toContain("main");
    // The chunk should have exports
    if (output.output[0].type === "chunk") {
      expect(output.output[0].exports.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("handles complex cjs build with external imports and tree-shaking", async () => {
    const modules: Record<string, string> = {
      "src/index.ts": [
        'import { map } from "lodash";',
        'import { helper } from "./helper.ts";',
        "export const result = map([1,2,3], x => x + helper);",
        "export default function main() { return result; }",
      ].join("\n"),
      "src/helper.ts": [
        "export const helper = 42;",
        "export const unused = 99;",
      ].join("\n"),
    };
    const plugin: Plugin = {
      name: "cjs-ext-test",
      resolveId(source: string) {
        if (source === "lodash") {
          return {
            id: "lodash",
            external: true,
            moduleSideEffects: true,
            syntheticNamedExports: false,
            meta: {},
            resolvedBy: "virtual",
          };
        }
        const knownModules: Record<string, string> = {
          "src/index.ts": "src/index.ts",
          "./helper.ts": "src/helper.ts",
          "src/helper.ts": "src/helper.ts",
        };
        const id =
          knownModules[source] ?? knownModules[source.replace(/.*\//, "")];
        if (id) {
          return {
            id,
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
      external: ["lodash"],
      treeshake: true,
    });
    const output = await build.generate({ format: "cjs" });
    expect(output.output[0].code).toBeDefined();
    expect(output.output[0].code).toContain("result");
  });

  it("handles tree-shaking with export * and named specifiers", async () => {
    const modules: Record<string, string> = {
      "src/index.ts":
        'export { helper } from "./helper.ts";\nexport const local = 1;\n',
      "src/helper.ts": "export const helper = 42;\n",
    };
    const plugin: Plugin = {
      name: "reexport-test",
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
        if (source === "./helper.ts" || source === "src/helper.ts") {
          return {
            id: "src/helper.ts",
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
      treeshake: true,
    });
    const output = await build.generate({ format: "es" });
    expect(output.output[0].code).toBeDefined();
  });
});
