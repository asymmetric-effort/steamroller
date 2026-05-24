/**
 * @module tests/unit/module/loader
 * @description Unit tests for the module loading pipeline.
 */

import { describe, it, expect, vi } from "vitest";
import { ModuleLoader } from "../../../src/module/loader.js";
import type {
  LoadHook,
  TransformHook,
  ModuleParsedHook,
  LoaderOptions,
  LoadedModule,
} from "../../../src/module/loader.js";
import type { FsModule } from "../../../src/fs/types.js";

/** Create a mock FsModule that returns predefined content. */
const createMockFs = (files: Record<string, string> = {}): FsModule => ({
  readFile: vi.fn(async (path: string, _encoding: "utf-8"): Promise<string> => {
    const content = files[path];
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  }),
});

/** Create default loader options with overrides. */
const createOptions = (
  overrides: Partial<LoaderOptions> = {},
): LoaderOptions => ({
  fs: createMockFs({ "/src/index.js": "const x = 1;" }),
  maxParallelFileOps: 4,
  loadHooks: [],
  transformHooks: [],
  moduleParsedHooks: [],
  ...overrides,
});

describe("ModuleLoader", () => {
  describe("default loading from filesystem", () => {
    it("should read file content from filesystem when no load hook matches", async () => {
      const fs = createMockFs({ "/src/index.js": "const x = 1;" });
      const loader = new ModuleLoader(createOptions({ fs }));

      const result = await loader.loadModule("/src/index.js");

      expect(result.code).toBe("const x = 1;");
      expect(fs.readFile).toHaveBeenCalledWith("/src/index.js", "utf-8");
    });

    it("should normalize the path before reading", async () => {
      const fs = createMockFs({ "/src/index.js": "const y = 2;" });
      const loader = new ModuleLoader(createOptions({ fs }));

      const result = await loader.loadModule("/src\\index.js");

      expect(result.code).toBe("const y = 2;");
      expect(fs.readFile).toHaveBeenCalledWith("/src/index.js", "utf-8");
    });

    it("should parse the code into an AST", async () => {
      const fs = createMockFs({ "/src/mod.js": "const a = 1;" });
      const loader = new ModuleLoader(createOptions({ fs }));

      const result = await loader.loadModule("/src/mod.js");

      expect(result.ast).toBeDefined();
      expect((result.ast as { type: string }).type).toBe("Program");
    });

    it("should set default meta, moduleSideEffects, and syntheticNamedExports", async () => {
      const fs = createMockFs({ "/src/mod.js": "const a = 1;" });
      const loader = new ModuleLoader(createOptions({ fs }));

      const result = await loader.loadModule("/src/mod.js");

      expect(result.meta).toEqual({});
      expect(result.moduleSideEffects).toBe(true);
      expect(result.syntheticNamedExports).toBe(false);
    });
  });

  describe("load hook overrides filesystem", () => {
    it("should use load hook result instead of filesystem", async () => {
      const loadHook: LoadHook = vi.fn(async (id: string) => {
        if (id === "/src/virtual.js") {
          return { code: "const virtual = true;" };
        }
        return null;
      });
      const fs = createMockFs({});
      const loader = new ModuleLoader(
        createOptions({ fs, loadHooks: [loadHook] }),
      );

      const result = await loader.loadModule("/src/virtual.js");

      expect(result.code).toBe("const virtual = true;");
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it("should use the first non-null load hook result", async () => {
      const hook1: LoadHook = vi.fn(async () => null);
      const hook2: LoadHook = vi.fn(async () => ({ code: "const b = 2;" }));
      const hook3: LoadHook = vi.fn(async () => ({ code: "const c = 3;" }));
      const loader = new ModuleLoader(
        createOptions({ loadHooks: [hook1, hook2, hook3] }),
      );

      const result = await loader.loadModule("/src/index.js");

      expect(result.code).toBe("const b = 2;");
      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
      expect(hook3).not.toHaveBeenCalled();
    });

    it("should propagate meta from load hook", async () => {
      const loadHook: LoadHook = async () => ({
        code: "const x = 1;",
        meta: { framework: "test" },
      });
      const loader = new ModuleLoader(createOptions({ loadHooks: [loadHook] }));

      const result = await loader.loadModule("/src/index.js");

      expect(result.meta).toEqual({ framework: "test" });
    });

    it("should propagate moduleSideEffects from load hook", async () => {
      const loadHook: LoadHook = async () => ({
        code: "const x = 1;",
        moduleSideEffects: "no-treeshake",
      });
      const loader = new ModuleLoader(createOptions({ loadHooks: [loadHook] }));

      const result = await loader.loadModule("/src/index.js");

      expect(result.moduleSideEffects).toBe("no-treeshake");
    });

    it("should propagate syntheticNamedExports from load hook", async () => {
      const loadHook: LoadHook = async () => ({
        code: "const x = 1;",
        syntheticNamedExports: "__moduleExports",
      });
      const loader = new ModuleLoader(createOptions({ loadHooks: [loadHook] }));

      const result = await loader.loadModule("/src/index.js");

      expect(result.syntheticNamedExports).toBe("__moduleExports");
    });
  });

  describe("transform hooks", () => {
    it("should run a single transform hook and modify code", async () => {
      const transformHook: TransformHook = vi.fn(
        async (code: string, _id: string) => ({
          code: code.replace("const", "/* transformed */ const"),
        }),
      );
      const fs = createMockFs({ "/src/mod.js": "const x = 1;" });
      const loader = new ModuleLoader(
        createOptions({ fs, transformHooks: [transformHook] }),
      );

      const result = await loader.loadModule("/src/mod.js");

      expect(result.code).toBe("/* transformed */ const x = 1;");
      expect(transformHook).toHaveBeenCalledWith("const x = 1;", "/src/mod.js");
    });

    it("should run multiple transform hooks sequentially", async () => {
      const hook1: TransformHook = async (code: string) => ({
        code: `/* hook1 */ ${code}`,
      });
      const hook2: TransformHook = async (code: string) => ({
        code: `/* hook2 */ ${code}`,
      });
      const fs = createMockFs({ "/src/mod.js": "const x = 1;" });
      const loader = new ModuleLoader(
        createOptions({ fs, transformHooks: [hook1, hook2] }),
      );

      const result = await loader.loadModule("/src/mod.js");

      expect(result.code).toBe("/* hook2 */ /* hook1 */ const x = 1;");
    });

    it("should skip transform hooks that return null", async () => {
      const hook1: TransformHook = async () => null;
      const hook2: TransformHook = async (code: string) => ({
        code: `/* applied */ ${code}`,
      });
      const fs = createMockFs({ "/src/mod.js": "const x = 1;" });
      const loader = new ModuleLoader(
        createOptions({ fs, transformHooks: [hook1, hook2] }),
      );

      const result = await loader.loadModule("/src/mod.js");

      expect(result.code).toBe("/* applied */ const x = 1;");
    });

    it("should merge meta from transform hooks", async () => {
      const loadHook: LoadHook = async () => ({
        code: "const x = 1;",
        meta: { original: true },
      });
      const transformHook: TransformHook = async () => ({
        code: "const x = 1;",
        meta: { transformed: true },
      });
      const loader = new ModuleLoader(
        createOptions({
          loadHooks: [loadHook],
          transformHooks: [transformHook],
        }),
      );

      const result = await loader.loadModule("/src/index.js");

      expect(result.meta).toEqual({ original: true, transformed: true });
    });

    it("should allow transform hook to override moduleSideEffects", async () => {
      const transformHook: TransformHook = async () => ({
        code: "const x = 1;",
        moduleSideEffects: false,
      });
      const fs = createMockFs({ "/src/mod.js": "const x = 1;" });
      const loader = new ModuleLoader(
        createOptions({ fs, transformHooks: [transformHook] }),
      );

      const result = await loader.loadModule("/src/mod.js");

      expect(result.moduleSideEffects).toBe(false);
    });

    it("should allow transform hook to override syntheticNamedExports", async () => {
      const transformHook: TransformHook = async () => ({
        code: "const x = 1;",
        syntheticNamedExports: true,
      });
      const fs = createMockFs({ "/src/mod.js": "const x = 1;" });
      const loader = new ModuleLoader(
        createOptions({ fs, transformHooks: [transformHook] }),
      );

      const result = await loader.loadModule("/src/mod.js");

      expect(result.syntheticNamedExports).toBe(true);
    });
  });

  describe("moduleParsed hooks", () => {
    it("should fire moduleParsed hooks after parsing", async () => {
      const parsedHook: ModuleParsedHook = vi.fn(async () => {
        /* no-op */
      });
      const fs = createMockFs({ "/src/mod.js": "const x = 1;" });
      const loader = new ModuleLoader(
        createOptions({ fs, moduleParsedHooks: [parsedHook] }),
      );

      await loader.loadModule("/src/mod.js");

      expect(parsedHook).toHaveBeenCalledTimes(1);
      const arg = (parsedHook as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as LoadedModule;
      expect(arg.code).toBe("const x = 1;");
      expect((arg.ast as { type: string }).type).toBe("Program");
    });

    it("should fire multiple moduleParsed hooks in parallel", async () => {
      const order: Array<number> = [];
      const hook1: ModuleParsedHook = vi.fn(async () => {
        order.push(1);
      });
      const hook2: ModuleParsedHook = vi.fn(async () => {
        order.push(2);
      });
      const fs = createMockFs({ "/src/mod.js": "const x = 1;" });
      const loader = new ModuleLoader(
        createOptions({ fs, moduleParsedHooks: [hook1, hook2] }),
      );

      await loader.loadModule("/src/mod.js");

      expect(hook1).toHaveBeenCalledTimes(1);
      expect(hook2).toHaveBeenCalledTimes(1);
      expect(order).toContain(1);
      expect(order).toContain(2);
    });
  });

  describe("semaphore concurrency limiting", () => {
    it("should limit concurrent operations to maxParallelFileOps", async () => {
      let concurrent = 0;
      let maxConcurrent = 0;
      const fs: FsModule = {
        readFile: vi.fn(async (path: string): Promise<string> => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          // Simulate async I/O
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 10);
          });
          concurrent--;
          return `/* ${path} */ const x = 1;`;
        }),
      };
      const loader = new ModuleLoader(
        createOptions({ fs, maxParallelFileOps: 2 }),
      );

      const promises = [
        loader.loadModule("/src/a.js"),
        loader.loadModule("/src/b.js"),
        loader.loadModule("/src/c.js"),
        loader.loadModule("/src/d.js"),
      ];
      await Promise.all(promises);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it("should release semaphore even when an error occurs", async () => {
      const fs = createMockFs({});
      const loader = new ModuleLoader(
        createOptions({ fs, maxParallelFileOps: 1 }),
      );

      // First call should fail (file not found)
      await expect(loader.loadModule("/src/missing.js")).rejects.toThrow(
        "ENOENT",
      );

      // Second call should still work (semaphore released)
      const fs2 = createMockFs({ "/src/exists.js": "const x = 1;" });
      const loader2 = new ModuleLoader(
        createOptions({ fs: fs2, maxParallelFileOps: 1 }),
      );
      const result = await loader2.loadModule("/src/exists.js");
      expect(result.code).toBe("const x = 1;");
    });
  });

  describe("error handling", () => {
    it("should throw when file is not found and no load hook provides content", async () => {
      const fs = createMockFs({});
      const loader = new ModuleLoader(createOptions({ fs }));

      await expect(loader.loadModule("/src/missing.js")).rejects.toThrow(
        "ENOENT",
      );
    });

    it("should propagate errors from load hooks", async () => {
      const loadHook: LoadHook = async () => {
        throw new Error("Load hook error");
      };
      const loader = new ModuleLoader(createOptions({ loadHooks: [loadHook] }));

      await expect(loader.loadModule("/src/index.js")).rejects.toThrow(
        "Load hook error",
      );
    });

    it("should propagate errors from transform hooks", async () => {
      const transformHook: TransformHook = async () => {
        throw new Error("Transform error");
      };
      const fs = createMockFs({ "/src/mod.js": "const x = 1;" });
      const loader = new ModuleLoader(
        createOptions({ fs, transformHooks: [transformHook] }),
      );

      await expect(loader.loadModule("/src/mod.js")).rejects.toThrow(
        "Transform error",
      );
    });
  });

  describe("AST handling", () => {
    it("should skip parsing when load hook provides an AST", async () => {
      const fakeAst = { type: "Program", body: [], sourceType: "module" };
      const loadHook: LoadHook = async () => ({
        code: "invalid syntax {{{{",
        ast: fakeAst,
      });
      const loader = new ModuleLoader(createOptions({ loadHooks: [loadHook] }));

      const result = await loader.loadModule("/src/index.js");

      // Should use the provided AST, not attempt to parse the invalid code
      expect(result.ast).toBe(fakeAst);
    });

    it("should skip parsing when transform hook provides an AST", async () => {
      const fakeAst = {
        type: "Program",
        body: [],
        sourceType: "module",
        start: 0,
        end: 0,
      };
      const transformHook: TransformHook = async () => ({
        code: "invalid syntax {{{{",
        ast: fakeAst,
      });
      const fs = createMockFs({ "/src/mod.js": "const x = 1;" });
      const loader = new ModuleLoader(
        createOptions({ fs, transformHooks: [transformHook] }),
      );

      const result = await loader.loadModule("/src/mod.js");

      expect(result.ast).toBe(fakeAst);
    });

    it("should re-parse when transform hook clears the AST", async () => {
      const loadHook: LoadHook = async () => ({
        code: "const x = 1;",
        ast: { type: "Program", body: [] },
      });
      const transformHook: TransformHook = async () => ({
        code: "const y = 2;",
        // ast not provided => cleared to undefined
      });
      const loader = new ModuleLoader(
        createOptions({
          loadHooks: [loadHook],
          transformHooks: [transformHook],
        }),
      );

      const result = await loader.loadModule("/src/index.js");

      // Should have re-parsed "const y = 2;"
      expect((result.ast as { type: string }).type).toBe("Program");
      expect(result.code).toBe("const y = 2;");
    });
  });

  describe("synchronous hook support", () => {
    it("should support synchronous load hooks", async () => {
      const loadHook: LoadHook = (id: string) => {
        if (id === "/src/sync.js") {
          return { code: "const sync = true;" };
        }
        return null;
      };
      const loader = new ModuleLoader(createOptions({ loadHooks: [loadHook] }));

      const result = await loader.loadModule("/src/sync.js");

      expect(result.code).toBe("const sync = true;");
    });

    it("should support synchronous transform hooks", async () => {
      const transformHook: TransformHook = (code: string) => ({
        code: `/* sync */ ${code}`,
      });
      const fs = createMockFs({ "/src/mod.js": "const x = 1;" });
      const loader = new ModuleLoader(
        createOptions({ fs, transformHooks: [transformHook] }),
      );

      const result = await loader.loadModule("/src/mod.js");

      expect(result.code).toBe("/* sync */ const x = 1;");
    });

    it("should support synchronous moduleParsed hooks", async () => {
      const received: Array<unknown> = [];
      const hook: ModuleParsedHook = (info: unknown) => {
        received.push(info);
      };
      const fs = createMockFs({ "/src/mod.js": "const x = 1;" });
      const loader = new ModuleLoader(
        createOptions({ fs, moduleParsedHooks: [hook] }),
      );

      await loader.loadModule("/src/mod.js");

      expect(received).toHaveLength(1);
    });
  });
});
