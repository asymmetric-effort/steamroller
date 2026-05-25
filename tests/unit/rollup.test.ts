/**
 * @module tests/unit/rollup
 * @description Tests for the main rollup() entry function.
 */

import { describe, it, expect } from "vitest";
import { rollup } from "../../src/rollup.js";
import type { Plugin } from "../../src/types.js";

describe("rollup", () => {
  it("returns a RollupBuild object", async () => {
    const build = await rollup({ input: "src/index.ts" });
    expect(build).toBeDefined();
    expect(typeof build.generate).toBe("function");
    expect(typeof build.write).toBe("function");
    expect(typeof build.close).toBe("function");
    expect(build.closed).toBe(false);
  });

  it("generate() produces output with at least one chunk", async () => {
    const build = await rollup({ input: "src/index.ts" });
    const output = await build.generate({ format: "es" });
    expect(output.output).toBeDefined();
    expect(output.output.length).toBeGreaterThanOrEqual(1);
    expect(output.output[0].type).toBe("chunk");
  });

  it("close() marks build as closed", async () => {
    const build = await rollup({ input: "src/index.ts" });
    expect(build.closed).toBe(false);
    await build.close();
    expect(build.closed).toBe(true);
  });

  it("generate() throws after close()", async () => {
    const build = await rollup({ input: "src/index.ts" });
    await build.close();
    await expect(build.generate({ format: "es" })).rejects.toThrow(
      /already closed/,
    );
  });

  it("write() throws after close()", async () => {
    const build = await rollup({ input: "src/index.ts" });
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
    await rollup({ input: "src/index.ts", plugins: [plugin] });
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
    await rollup({ input: "src/index.ts", plugins: [plugin] });
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
      plugins: [plugin],
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
      plugins: [plugin],
    });
    expect(build).toBeDefined();
  });

  it("handles empty plugins array", async () => {
    const build = await rollup({ input: "src/index.ts", plugins: [] });
    expect(build).toBeDefined();
  });

  it("provides cache when option is set", async () => {
    const cache = { modules: [], plugins: {} };
    const build = await rollup({ input: "src/index.ts", cache });
    expect(build.cache).toBe(cache);
  });

  it("cache is undefined when not provided", async () => {
    const build = await rollup({ input: "src/index.ts" });
    expect(build.cache).toBeUndefined();
  });

  it("provides watchFiles as empty array", async () => {
    const build = await rollup({ input: "src/index.ts" });
    expect(build.watchFiles).toEqual([]);
  });

  it("provides getTimings when perf is enabled", async () => {
    const build = await rollup({ input: "src/index.ts", perf: true });
    expect(build.getTimings).toBeDefined();
    expect(typeof build.getTimings).toBe("function");
  });

  it("getTimings is undefined when perf is disabled", async () => {
    const build = await rollup({ input: "src/index.ts", perf: false });
    expect(build.getTimings).toBeUndefined();
  });
});
