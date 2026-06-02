/**
 * @module tests/unit/plugins/driver
 * @description Unit tests for the plugin driver (hook execution engine).
 */

import { describe, it, expect, vi } from "vitest";
import type { Plugin } from "../../../src/types.js";
import {
  PluginDriver,
  getHookHandler,
  getHookOrder,
  getHookFilter,
  shouldRunHookForModule,
  sortPluginsByOrder,
  matchesFilter,
} from "../../../src/plugins/driver.js";
import { DUPLICATE_PLUGIN_NAME } from "../../../src/utils/error-codes.js";

// Helper to create a minimal plugin
const makePlugin = (
  name: string,
  hooks: Record<string, unknown> = {},
): Plugin => {
  return { name, ...hooks } as unknown as Plugin;
};

describe("getHookHandler", () => {
  it("returns the function directly when hook is a function", () => {
    const fn = () => "result";
    const result = getHookHandler(fn);
    expect(result).toBe(fn);
  });

  it("extracts handler from object form", () => {
    const fn = () => "result";
    const hook = { handler: fn, order: "pre" as const };
    const result = getHookHandler(hook);
    expect(result).toBe(fn);
  });

  it("extracts handler from object without order", () => {
    const fn = () => "result";
    const hook = { handler: fn };
    const result = getHookHandler(hook);
    expect(result).toBe(fn);
  });

  it("returns primitive values directly", () => {
    expect(getHookHandler("test")).toBe("test");
    expect(getHookHandler(42)).toBe(42);
    expect(getHookHandler(null)).toBe(null);
    expect(getHookHandler(undefined)).toBe(undefined);
  });

  it("returns objects without handler property directly", () => {
    const obj = { foo: "bar" };
    const result = getHookHandler(obj);
    expect(result).toBe(obj);
  });
});

describe("getHookOrder", () => {
  it("returns 'pre' for pre-ordered hooks", () => {
    const hook = { handler: () => {}, order: "pre" as const };
    expect(getHookOrder(hook)).toBe("pre");
  });

  it("returns 'post' for post-ordered hooks", () => {
    const hook = { handler: () => {}, order: "post" as const };
    expect(getHookOrder(hook)).toBe("post");
  });

  it("returns null for hooks with null order", () => {
    const hook = { handler: () => {}, order: null };
    expect(getHookOrder(hook)).toBe(null);
  });

  it("returns null for hooks with undefined order", () => {
    const hook = { handler: () => {}, order: undefined };
    expect(getHookOrder(hook)).toBe(null);
  });

  it("returns null for plain functions", () => {
    expect(getHookOrder(() => {})).toBe(null);
  });

  it("returns null for null", () => {
    expect(getHookOrder(null)).toBe(null);
  });

  it("returns null for undefined", () => {
    expect(getHookOrder(undefined)).toBe(null);
  });

  it("returns null for objects without order property", () => {
    expect(getHookOrder({ handler: () => {} })).toBe(null);
  });

  it("returns null for primitive values", () => {
    expect(getHookOrder("string")).toBe(null);
    expect(getHookOrder(123)).toBe(null);
  });
});

describe("sortPluginsByOrder", () => {
  it("sorts pre before normal before post", () => {
    const plugins: ReadonlyArray<Plugin> = [
      makePlugin("post-plugin", {
        resolveId: { handler: () => null, order: "post" },
      }),
      makePlugin("normal-plugin", { resolveId: () => null }),
      makePlugin("pre-plugin", {
        resolveId: { handler: () => null, order: "pre" },
      }),
    ];

    const sorted = sortPluginsByOrder(plugins, "resolveId");
    expect(sorted[0].name).toBe("pre-plugin");
    expect(sorted[1].name).toBe("normal-plugin");
    expect(sorted[2].name).toBe("post-plugin");
  });

  it("preserves relative order within same group", () => {
    const plugins: ReadonlyArray<Plugin> = [
      makePlugin("normal-a", { load: () => null }),
      makePlugin("normal-b", { load: () => null }),
      makePlugin("normal-c", { load: () => null }),
    ];

    const sorted = sortPluginsByOrder(plugins, "load");
    expect(sorted[0].name).toBe("normal-a");
    expect(sorted[1].name).toBe("normal-b");
    expect(sorted[2].name).toBe("normal-c");
  });

  it("handles plugins without the hook", () => {
    const plugins: ReadonlyArray<Plugin> = [
      makePlugin("has-hook", { transform: () => null }),
      makePlugin("no-hook", {}),
    ];

    const sorted = sortPluginsByOrder(plugins, "transform");
    expect(sorted).toHaveLength(2);
    expect(sorted[0].name).toBe("has-hook");
    expect(sorted[1].name).toBe("no-hook");
  });

  it("handles empty plugin array", () => {
    const sorted = sortPluginsByOrder([], "resolveId");
    expect(sorted).toHaveLength(0);
  });

  it("handles multiple pre and post plugins", () => {
    const plugins: ReadonlyArray<Plugin> = [
      makePlugin("pre-b", {
        resolveId: { handler: () => null, order: "pre" },
      }),
      makePlugin("post-a", {
        resolveId: { handler: () => null, order: "post" },
      }),
      makePlugin("pre-a", {
        resolveId: { handler: () => null, order: "pre" },
      }),
      makePlugin("post-b", {
        resolveId: { handler: () => null, order: "post" },
      }),
    ];

    const sorted = sortPluginsByOrder(plugins, "resolveId");
    expect(sorted[0].name).toBe("pre-b");
    expect(sorted[1].name).toBe("pre-a");
    expect(sorted[2].name).toBe("post-a");
    expect(sorted[3].name).toBe("post-b");
  });
});

describe("matchesFilter", () => {
  it("returns true when filter is undefined", () => {
    expect(matchesFilter("anything", undefined)).toBe(true);
  });

  it("matches exact string", () => {
    expect(matchesFilter("src/index.ts", "src/index.ts")).toBe(true);
  });

  it("matches substring", () => {
    expect(matchesFilter("src/index.ts", "index")).toBe(true);
  });

  it("does not match non-matching string", () => {
    expect(matchesFilter("src/index.ts", "foo.ts")).toBe(false);
  });

  it("matches regex", () => {
    expect(matchesFilter("src/index.ts", /\.ts$/)).toBe(true);
    expect(matchesFilter("src/index.js", /\.ts$/)).toBe(false);
  });

  it("matches array with at least one match (string)", () => {
    expect(matchesFilter("src/index.ts", ["foo", "index"])).toBe(true);
  });

  it("matches array with at least one match (regex)", () => {
    expect(matchesFilter("src/index.ts", [/\.js$/, /\.ts$/])).toBe(true);
  });

  it("does not match array with no matches", () => {
    expect(matchesFilter("src/index.ts", ["foo", /\.css$/])).toBe(false);
  });

  it("matches mixed array (string and regex)", () => {
    expect(matchesFilter("bundle.js", ["nope", /\.js$/])).toBe(true);
  });

  it("handles empty array", () => {
    expect(matchesFilter("anything", [])).toBe(false);
  });
});

describe("getHookFilter", () => {
  it("returns undefined for plain functions", () => {
    expect(getHookFilter(() => {})).toBeUndefined();
  });

  it("returns undefined for objects without id property", () => {
    expect(getHookFilter({ handler: () => {} })).toBeUndefined();
  });

  it("returns the id StringFilter from an object hook", () => {
    const hook = { handler: () => {}, id: /\.ts$/ };
    expect(getHookFilter(hook)).toEqual(/\.ts$/);
  });

  it("returns string filter", () => {
    const hook = { handler: () => {}, id: "src/index.ts" };
    expect(getHookFilter(hook)).toBe("src/index.ts");
  });

  it("returns array filter", () => {
    const filter = [/\.ts$/, "foo.js"];
    const hook = { handler: () => {}, id: filter };
    expect(getHookFilter(hook)).toBe(filter);
  });

  it("returns undefined for null", () => {
    expect(getHookFilter(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(getHookFilter(undefined)).toBeUndefined();
  });

  it("returns undefined for primitives", () => {
    expect(getHookFilter("string")).toBeUndefined();
    expect(getHookFilter(42)).toBeUndefined();
  });
});

describe("shouldRunHookForModule", () => {
  it("returns true when moduleId is undefined", () => {
    const hook = { handler: () => {}, id: /\.ts$/ };
    expect(shouldRunHookForModule(hook, undefined)).toBe(true);
  });

  it("returns true when hook has no filter", () => {
    expect(shouldRunHookForModule(() => {}, "anything.ts")).toBe(true);
  });

  it("returns true when hook is an object without id filter", () => {
    const hook = { handler: () => {}, order: "pre" };
    expect(shouldRunHookForModule(hook, "anything.ts")).toBe(true);
  });

  it("returns true when module ID matches string filter", () => {
    const hook = { handler: () => {}, id: "index" };
    expect(shouldRunHookForModule(hook, "src/index.ts")).toBe(true);
  });

  it("returns false when module ID does not match string filter", () => {
    const hook = { handler: () => {}, id: "foo.js" };
    expect(shouldRunHookForModule(hook, "src/index.ts")).toBe(false);
  });

  it("returns true when module ID matches regex filter", () => {
    const hook = { handler: () => {}, id: /\.ts$/ };
    expect(shouldRunHookForModule(hook, "src/index.ts")).toBe(true);
  });

  it("returns false when module ID does not match regex filter", () => {
    const hook = { handler: () => {}, id: /\.css$/ };
    expect(shouldRunHookForModule(hook, "src/index.ts")).toBe(false);
  });

  it("returns true when module ID matches one item in array filter", () => {
    const hook = { handler: () => {}, id: [/\.css$/, /\.ts$/] };
    expect(shouldRunHookForModule(hook, "src/index.ts")).toBe(true);
  });

  it("returns false when module ID matches no item in array filter", () => {
    const hook = { handler: () => {}, id: [/\.css$/, "foo.js"] };
    expect(shouldRunHookForModule(hook, "src/index.ts")).toBe(false);
  });
});

describe("PluginDriver", () => {
  describe("constructor", () => {
    it("stores plugins", () => {
      const plugins = [makePlugin("a"), makePlugin("b")];
      const driver = new PluginDriver(plugins, () => {});
      expect(driver.getPlugins()).toEqual(plugins);
    });

    it("warns on duplicate plugin names", () => {
      const onWarning = vi.fn();
      const plugins = [makePlugin("dup"), makePlugin("dup")];
      new PluginDriver(plugins, onWarning);
      expect(onWarning).toHaveBeenCalledWith({
        code: DUPLICATE_PLUGIN_NAME,
        message: "Plugin name 'dup' is duplicated",
      });
    });

    it("does not warn when plugin names are unique", () => {
      const onWarning = vi.fn();
      const plugins = [makePlugin("a"), makePlugin("b")];
      new PluginDriver(plugins, onWarning);
      expect(onWarning).not.toHaveBeenCalled();
    });

    it("handles empty plugin array", () => {
      const onWarning = vi.fn();
      const driver = new PluginDriver([], onWarning);
      expect(driver.getPlugins()).toHaveLength(0);
      expect(onWarning).not.toHaveBeenCalled();
    });

    it("exposes warning handler via getWarningHandler", () => {
      const onWarning = vi.fn();
      const driver = new PluginDriver([], onWarning);
      expect(driver.getWarningHandler()).toBe(onWarning);
    });

    it("warns for each duplicate occurrence", () => {
      const onWarning = vi.fn();
      const plugins = [makePlugin("x"), makePlugin("x"), makePlugin("x")];
      new PluginDriver(plugins, onWarning);
      expect(onWarning).toHaveBeenCalledTimes(2);
    });
  });

  describe("hookFirst", () => {
    it("returns first non-null result", async () => {
      const plugins = [
        makePlugin("a", { resolveId: () => null }),
        makePlugin("b", { resolveId: () => "found-b" }),
        makePlugin("c", { resolveId: () => "found-c" }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const result = await driver.hookFirst<string>("resolveId", ["source"]);
      expect(result).toBe("found-b");
    });

    it("skips plugins without the hook", async () => {
      const plugins = [
        makePlugin("no-hook", {}),
        makePlugin("has-hook", { resolveId: () => "result" }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const result = await driver.hookFirst<string>("resolveId", ["source"]);
      expect(result).toBe("result");
    });

    it("returns null when no plugin returns a value", async () => {
      const plugins = [
        makePlugin("a", { resolveId: () => null }),
        makePlugin("b", { resolveId: () => undefined }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const result = await driver.hookFirst<string>("resolveId", ["source"]);
      expect(result).toBe(null);
    });

    it("respects hook ordering (pre/post)", async () => {
      const order: Array<string> = [];
      const plugins = [
        makePlugin("post", {
          resolveId: {
            handler: () => {
              order.push("post");
              return null;
            },
            order: "post",
          },
        }),
        makePlugin("normal", {
          resolveId: () => {
            order.push("normal");
            return null;
          },
        }),
        makePlugin("pre", {
          resolveId: {
            handler: () => {
              order.push("pre");
              return null;
            },
            order: "pre",
          },
        }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      await driver.hookFirst("resolveId", []);
      expect(order).toEqual(["pre", "normal", "post"]);
    });

    it("does not call subsequent plugins after first result", async () => {
      const fn = vi.fn(() => "never-called");
      const plugins = [
        makePlugin("first", { resolveId: () => "found" }),
        makePlugin("second", { resolveId: fn }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      await driver.hookFirst("resolveId", []);
      expect(fn).not.toHaveBeenCalled();
    });

    it("passes arguments to hook handlers", async () => {
      const fn = vi.fn(() => "result");
      const plugins = [makePlugin("p", { resolveId: fn })];
      const driver = new PluginDriver(plugins, () => {});
      await driver.hookFirst("resolveId", ["source", "importer"]);
      expect(fn).toHaveBeenCalledWith("source", "importer");
    });

    it("passes context as this", async () => {
      const fn = vi.fn(function (this: unknown) {
        return this;
      });
      const plugins = [makePlugin("p", { resolveId: fn })];
      const driver = new PluginDriver(plugins, () => {});
      const ctx = { meta: { rollupVersion: "4.0.0", watchMode: false } };
      const result = await driver.hookFirst("resolveId", [], ctx);
      expect(result).toBe(ctx);
    });

    it("handles async hook handlers", async () => {
      const plugins = [
        makePlugin("async-plugin", {
          resolveId: async () => {
            return "async-result";
          },
        }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const result = await driver.hookFirst<string>("resolveId", []);
      expect(result).toBe("async-result");
    });

    it("returns null for hook name that no plugin defines", async () => {
      const plugins = [makePlugin("a", { load: () => "data" })];
      const driver = new PluginDriver(plugins, () => {});
      const result = await driver.hookFirst("resolveId", []);
      expect(result).toBe(null);
    });
  });

  describe("hookSequential", () => {
    it("runs all plugins and collects results", async () => {
      const plugins = [
        makePlugin("a", { transform: () => "result-a" }),
        makePlugin("b", { transform: () => "result-b" }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const results = await driver.hookSequential<string>("transform", [
        "code",
        "id",
      ]);
      expect(results).toEqual(["result-a", "result-b"]);
    });

    it("skips null/undefined results", async () => {
      const plugins = [
        makePlugin("a", { transform: () => "result-a" }),
        makePlugin("b", { transform: () => null }),
        makePlugin("c", { transform: () => "result-c" }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const results = await driver.hookSequential<string>("transform", []);
      expect(results).toEqual(["result-a", "result-c"]);
    });

    it("runs in correct order (pre/normal/post)", async () => {
      const order: Array<string> = [];
      const plugins = [
        makePlugin("post", {
          buildStart: {
            handler: () => {
              order.push("post");
              return "post";
            },
            order: "post",
          },
        }),
        makePlugin("pre", {
          buildStart: {
            handler: () => {
              order.push("pre");
              return "pre";
            },
            order: "pre",
          },
        }),
        makePlugin("normal", {
          buildStart: () => {
            order.push("normal");
            return "normal";
          },
        }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      await driver.hookSequential("buildStart", []);
      expect(order).toEqual(["pre", "normal", "post"]);
    });

    it("returns empty array when no plugin has the hook", async () => {
      const plugins = [makePlugin("a", {})];
      const driver = new PluginDriver(plugins, () => {});
      const results = await driver.hookSequential("transform", []);
      expect(results).toEqual([]);
    });

    it("handles async hooks sequentially", async () => {
      const order: Array<string> = [];
      const plugins = [
        makePlugin("a", {
          transform: async () => {
            order.push("a-start");
            await new Promise((r) => setTimeout(r, 10));
            order.push("a-end");
            return "a";
          },
        }),
        makePlugin("b", {
          transform: async () => {
            order.push("b-start");
            return "b";
          },
        }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      await driver.hookSequential("transform", []);
      expect(order).toEqual(["a-start", "a-end", "b-start"]);
    });
  });

  describe("hookParallel", () => {
    it("runs all hooks concurrently", async () => {
      const order: Array<string> = [];
      const plugins = [
        makePlugin("a", {
          buildStart: async () => {
            order.push("a-start");
            await new Promise((r) => setTimeout(r, 20));
            order.push("a-end");
          },
        }),
        makePlugin("b", {
          buildStart: async () => {
            order.push("b-start");
            await new Promise((r) => setTimeout(r, 5));
            order.push("b-end");
          },
        }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      await driver.hookParallel("buildStart", []);
      expect(order[0]).toBe("a-start");
      expect(order[1]).toBe("b-start");
      // b-end should come before a-end because b has shorter delay
      expect(order.indexOf("b-end")).toBeLessThan(order.indexOf("a-end"));
    });

    it("completes even if hooks return void", async () => {
      const fn = vi.fn();
      const plugins = [
        makePlugin("a", { buildStart: fn }),
        makePlugin("b", { buildStart: fn }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      await driver.hookParallel("buildStart", []);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("skips plugins without the hook", async () => {
      const fn = vi.fn();
      const plugins = [
        makePlugin("no-hook", {}),
        makePlugin("has-hook", { buildStart: fn }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      await driver.hookParallel("buildStart", []);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("handles empty plugin array", async () => {
      const driver = new PluginDriver([], () => {});
      await expect(
        driver.hookParallel("buildStart", []),
      ).resolves.toBeUndefined();
    });

    it("skips non-function handlers", async () => {
      const plugins = [
        makePlugin("non-fn", { buildStart: { handler: "not-a-function" } }),
        makePlugin("fn", { buildStart: vi.fn() }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      await driver.hookParallel("buildStart", []);
      expect(
        (plugins[1] as unknown as Record<string, unknown>).buildStart,
      ).toHaveBeenCalledTimes(1);
    });

    it("rejects if any hook throws", async () => {
      const plugins = [
        makePlugin("ok", { buildStart: () => {} }),
        makePlugin("bad", {
          buildStart: () => {
            throw new Error("hook failed");
          },
        }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      await expect(driver.hookParallel("buildStart", [])).rejects.toThrow(
        "hook failed",
      );
    });
  });

  describe("hookReduce", () => {
    it("threads accumulator through each hook", async () => {
      const plugins = [
        makePlugin("a", {
          transform: (_code: unknown, _id: unknown, acc: unknown) =>
            (acc as number) + 1,
        }),
        makePlugin("b", {
          transform: (_code: unknown, _id: unknown, acc: unknown) =>
            (acc as number) + 10,
        }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const result = await driver.hookReduce<number>(
        "transform",
        0,
        (_acc, result) => result as number,
        ["code", "id"],
      );
      expect(result).toBe(11);
    });

    it("returns initial value when no hooks modify it", async () => {
      const plugins = [
        makePlugin("a", { transform: () => null }),
        makePlugin("b", { transform: () => undefined }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const result = await driver.hookReduce<string>(
        "transform",
        "initial",
        (_acc, r) => r as string,
        [],
      );
      expect(result).toBe("initial");
    });

    it("uses custom reducer function", async () => {
      const plugins = [
        makePlugin("a", { transform: () => "hello" }),
        makePlugin("b", { transform: () => "world" }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const result = await driver.hookReduce<string>(
        "transform",
        "",
        (acc, r) => (acc ? `${acc} ${r as string}` : (r as string)),
        [],
      );
      expect(result).toBe("hello world");
    });

    it("respects hook ordering", async () => {
      const plugins = [
        makePlugin("post", {
          transform: {
            handler: () => "post",
            order: "post",
          },
        }),
        makePlugin("pre", {
          transform: {
            handler: () => "pre",
            order: "pre",
          },
        }),
        makePlugin("normal", { transform: () => "normal" }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const order: Array<string> = [];
      await driver.hookReduce<string>(
        "transform",
        "",
        (_acc, r) => {
          order.push(r as string);
          return r as string;
        },
        [],
      );
      expect(order).toEqual(["pre", "normal", "post"]);
    });

    it("skips plugins without the hook", async () => {
      const plugins = [
        makePlugin("no-hook", {}),
        makePlugin("has-hook", { transform: () => 42 }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const result = await driver.hookReduce<number>(
        "transform",
        0,
        (_acc, r) => r as number,
        [],
      );
      expect(result).toBe(42);
    });

    it("handles async hooks", async () => {
      const plugins = [
        makePlugin("a", {
          transform: async () => "async-result",
        }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const result = await driver.hookReduce<string>(
        "transform",
        "start",
        (_acc, r) => r as string,
        [],
      );
      expect(result).toBe("async-result");
    });

    it("skips non-function handlers", async () => {
      const plugins = [
        makePlugin("non-fn", { transform: { handler: 42 } }),
        makePlugin("fn", { transform: () => "real" }),
      ];
      const driver = new PluginDriver(plugins, () => {});
      const result = await driver.hookReduce<string>(
        "transform",
        "initial",
        (_acc, r) => r as string,
        [],
      );
      expect(result).toBe("real");
    });
  });

  describe("hook filter matching", () => {
    describe("hookFirst with filterModuleId", () => {
      it("skips hooks whose id filter does not match the module ID", async () => {
        const tsOnly = vi.fn(() => "ts-result");
        const plugins = [
          makePlugin("ts-only", {
            resolveId: { handler: tsOnly, id: /\.ts$/ },
          }),
          makePlugin("fallback", { resolveId: () => "fallback-result" }),
        ];
        const driver = new PluginDriver(plugins, () => {});
        const result = await driver.hookFirst<string>(
          "resolveId",
          ["./foo.js"],
          undefined,
          "./foo.js",
        );
        expect(tsOnly).not.toHaveBeenCalled();
        expect(result).toBe("fallback-result");
      });

      it("runs hooks whose id filter matches the module ID", async () => {
        const tsOnly = vi.fn(() => "ts-result");
        const plugins = [
          makePlugin("ts-only", {
            resolveId: { handler: tsOnly, id: /\.ts$/ },
          }),
        ];
        const driver = new PluginDriver(plugins, () => {});
        const result = await driver.hookFirst<string>(
          "resolveId",
          ["./foo.ts"],
          undefined,
          "./foo.ts",
        );
        expect(tsOnly).toHaveBeenCalled();
        expect(result).toBe("ts-result");
      });

      it("runs all hooks when filterModuleId is not provided", async () => {
        const fn = vi.fn(() => "result");
        const plugins = [
          makePlugin("filtered", {
            resolveId: { handler: fn, id: /\.ts$/ },
          }),
        ];
        const driver = new PluginDriver(plugins, () => {});
        const result = await driver.hookFirst<string>("resolveId", [
          "./foo.js",
        ]);
        expect(fn).toHaveBeenCalled();
        expect(result).toBe("result");
      });

      it("runs plain function hooks regardless of filterModuleId", async () => {
        const fn = vi.fn(() => "result");
        const plugins = [makePlugin("plain", { resolveId: fn })];
        const driver = new PluginDriver(plugins, () => {});
        const result = await driver.hookFirst<string>(
          "resolveId",
          ["./foo.ts"],
          undefined,
          "./foo.ts",
        );
        expect(fn).toHaveBeenCalled();
        expect(result).toBe("result");
      });

      it("supports string id filter for resolveId", async () => {
        const fn = vi.fn(() => "matched");
        const plugins = [
          makePlugin("str-filter", {
            resolveId: { handler: fn, id: "node_modules" },
          }),
        ];
        const driver = new PluginDriver(plugins, () => {});

        const result1 = await driver.hookFirst<string>(
          "resolveId",
          ["lodash"],
          undefined,
          "/project/node_modules/lodash/index.js",
        );
        expect(fn).toHaveBeenCalled();
        expect(result1).toBe("matched");

        fn.mockClear();
        const result2 = await driver.hookFirst<string>(
          "resolveId",
          ["./local"],
          undefined,
          "/project/src/local.ts",
        );
        expect(fn).not.toHaveBeenCalled();
        expect(result2).toBe(null);
      });
    });

    describe("hookSequential with filterModuleId", () => {
      it("skips hooks whose filter does not match", async () => {
        const tsHandler = vi.fn(() => "ts-result");
        const jsHandler = vi.fn(() => "js-result");
        const plugins = [
          makePlugin("ts-only", {
            transform: { handler: tsHandler, id: /\.ts$/ },
          }),
          makePlugin("js-only", {
            transform: { handler: jsHandler, id: /\.js$/ },
          }),
        ];
        const driver = new PluginDriver(plugins, () => {});
        const results = await driver.hookSequential<string>(
          "transform",
          ["code", "file.js"],
          undefined,
          "file.js",
        );
        expect(tsHandler).not.toHaveBeenCalled();
        expect(jsHandler).toHaveBeenCalled();
        expect(results).toEqual(["js-result"]);
      });

      it("runs all hooks when filterModuleId is not provided", async () => {
        const tsHandler = vi.fn(() => "ts-result");
        const jsHandler = vi.fn(() => "js-result");
        const plugins = [
          makePlugin("ts-only", {
            transform: { handler: tsHandler, id: /\.ts$/ },
          }),
          makePlugin("js-only", {
            transform: { handler: jsHandler, id: /\.js$/ },
          }),
        ];
        const driver = new PluginDriver(plugins, () => {});
        const results = await driver.hookSequential<string>("transform", [
          "code",
          "file.js",
        ]);
        expect(tsHandler).toHaveBeenCalled();
        expect(jsHandler).toHaveBeenCalled();
        expect(results).toEqual(["ts-result", "js-result"]);
      });
    });

    describe("hookParallel with filterModuleId", () => {
      it("skips hooks whose filter does not match", async () => {
        const tsHandler = vi.fn();
        const anyHandler = vi.fn();
        const plugins = [
          makePlugin("ts-only", {
            load: { handler: tsHandler, id: /\.ts$/ },
          }),
          makePlugin("any", { load: anyHandler }),
        ];
        const driver = new PluginDriver(plugins, () => {});
        await driver.hookParallel("load", ["file.js"], undefined, "file.js");
        expect(tsHandler).not.toHaveBeenCalled();
        expect(anyHandler).toHaveBeenCalled();
      });
    });

    describe("hookReduce with filterModuleId", () => {
      it("skips hooks whose filter does not match", async () => {
        const tsHandler = vi.fn(
          (_code: unknown, _id: unknown, acc: unknown) => (acc as number) + 100,
        );
        const anyHandler = vi.fn(
          (_code: unknown, _id: unknown, acc: unknown) => (acc as number) + 1,
        );
        const plugins = [
          makePlugin("ts-only", {
            transform: { handler: tsHandler, id: /\.ts$/ },
          }),
          makePlugin("any", { transform: anyHandler }),
        ];
        const driver = new PluginDriver(plugins, () => {});
        const result = await driver.hookReduce<number>(
          "transform",
          0,
          (_acc, r) => r as number,
          ["code", "file.js"],
          undefined,
          "file.js",
        );
        expect(tsHandler).not.toHaveBeenCalled();
        expect(anyHandler).toHaveBeenCalled();
        expect(result).toBe(1);
      });

      it("runs matching hooks in reduce", async () => {
        const plugins = [
          makePlugin("ts-only", {
            transform: {
              handler: (_code: unknown, _id: unknown, acc: unknown) =>
                (acc as number) + 10,
              id: /\.ts$/,
            },
          }),
          makePlugin("any", {
            transform: (_code: unknown, _id: unknown, acc: unknown) =>
              (acc as number) + 1,
          }),
        ];
        const driver = new PluginDriver(plugins, () => {});
        const result = await driver.hookReduce<number>(
          "transform",
          0,
          (_acc, r) => r as number,
          ["code", "file.ts"],
          undefined,
          "file.ts",
        );
        expect(result).toBe(11);
      });
    });

    describe("filter with array of patterns", () => {
      it("matches when any pattern in the array matches", async () => {
        const fn = vi.fn(() => "matched");
        const plugins = [
          makePlugin("multi-filter", {
            resolveId: { handler: fn, id: [/\.ts$/, /\.tsx$/] },
          }),
        ];
        const driver = new PluginDriver(plugins, () => {});

        const r1 = await driver.hookFirst<string>(
          "resolveId",
          ["./comp"],
          undefined,
          "./comp.tsx",
        );
        expect(r1).toBe("matched");

        fn.mockClear();
        const r2 = await driver.hookFirst<string>(
          "resolveId",
          ["./style"],
          undefined,
          "./style.css",
        );
        expect(fn).not.toHaveBeenCalled();
        expect(r2).toBe(null);
      });
    });

    describe("filter with order and id combined", () => {
      it("respects both order and filter on the same hook", async () => {
        const order: Array<string> = [];
        const plugins = [
          makePlugin("post-ts", {
            resolveId: {
              handler: () => {
                order.push("post-ts");
                return null;
              },
              order: "post",
              id: /\.ts$/,
            },
          }),
          makePlugin("pre-any", {
            resolveId: {
              handler: () => {
                order.push("pre-any");
                return null;
              },
              order: "pre",
            },
          }),
          makePlugin("normal-js", {
            resolveId: {
              handler: () => {
                order.push("normal-js");
                return null;
              },
              id: /\.js$/,
            },
          }),
        ];
        const driver = new PluginDriver(plugins, () => {});
        await driver.hookFirst("resolveId", ["./mod"], undefined, "./mod.ts");
        // pre-any runs (no filter), normal-js skipped (doesn't match .ts),
        // post-ts runs (matches .ts)
        expect(order).toEqual(["pre-any", "post-ts"]);
      });
    });
  });
});
