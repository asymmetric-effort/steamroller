/**
 * @module tests/unit/plugins/watch-hooks
 * @description Unit tests for watch and cross-cutting hooks.
 */

import { describe, it, expect, vi } from "vitest";
import type { Plugin } from "../../../src/types.js";
import { PluginDriver } from "../../../src/plugins/driver.js";
import {
  WatchHookExecutor,
  WATCH_HOOKS,
} from "../../../src/plugins/watch-hooks.js";
import type { WatchChangeEvent } from "../../../src/plugins/watch-hooks.js";

const makePlugin = (
  name: string,
  hooks: Record<string, unknown> = {},
): Plugin => {
  return { name, ...hooks } as unknown as Plugin;
};

const noopWarning = (): void => undefined;

describe("watch-hooks", () => {
  describe("WATCH_HOOKS", () => {
    it("should define watchChange as sequential and async", () => {
      expect(WATCH_HOOKS.watchChange.name).toBe("watchChange");
      expect(WATCH_HOOKS.watchChange.strategy).toBe("sequential");
      expect(WATCH_HOOKS.watchChange.async).toBe(true);
    });

    it("should define closeWatcher as sequential and async", () => {
      expect(WATCH_HOOKS.closeWatcher.name).toBe("closeWatcher");
      expect(WATCH_HOOKS.closeWatcher.strategy).toBe("sequential");
      expect(WATCH_HOOKS.closeWatcher.async).toBe(true);
    });
  });

  describe("WatchHookExecutor", () => {
    it("should construct with a PluginDriver", () => {
      const driver = new PluginDriver([], noopWarning);
      const executor = new WatchHookExecutor(driver);
      expect(executor.getDriver()).toBe(driver);
      expect(executor.isClosed()).toBe(false);
    });

    describe("watchChange", () => {
      it("should fire watchChange with correct id and event", async () => {
        const handler = vi.fn();
        const plugin = makePlugin("test-plugin", { watchChange: handler });
        const driver = new PluginDriver([plugin], noopWarning);
        const executor = new WatchHookExecutor(driver);

        const change: WatchChangeEvent = { event: "update" };
        const result = await executor.watchChange("/path/to/file.ts", change);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith("/path/to/file.ts", change);
        expect(result.hookName).toBe("watchChange");
        expect(result.pluginCount).toBe(1);
        expect(result.executedCount).toBe(1);
      });

      it("should fire watchChange with create event", async () => {
        const handler = vi.fn();
        const plugin = makePlugin("p1", { watchChange: handler });
        const driver = new PluginDriver([plugin], noopWarning);
        const executor = new WatchHookExecutor(driver);

        await executor.watchChange("new-file.js", { event: "create" });
        expect(handler).toHaveBeenCalledWith("new-file.js", {
          event: "create",
        });
      });

      it("should fire watchChange with delete event", async () => {
        const handler = vi.fn();
        const plugin = makePlugin("p1", { watchChange: handler });
        const driver = new PluginDriver([plugin], noopWarning);
        const executor = new WatchHookExecutor(driver);

        await executor.watchChange("old-file.js", { event: "delete" });
        expect(handler).toHaveBeenCalledWith("old-file.js", {
          event: "delete",
        });
      });

      it("should fire across multiple plugins sequentially", async () => {
        const calls: Array<string> = [];
        const handler1 = vi.fn(() => {
          calls.push("p1");
        });
        const handler2 = vi.fn(() => {
          calls.push("p2");
        });
        const p1 = makePlugin("p1", { watchChange: handler1 });
        const p2 = makePlugin("p2", { watchChange: handler2 });
        const driver = new PluginDriver([p1, p2], noopWarning);
        const executor = new WatchHookExecutor(driver);

        const result = await executor.watchChange("file.ts", {
          event: "update",
        });
        expect(calls).toEqual(["p1", "p2"]);
        expect(result.executedCount).toBe(2);
      });

      it("should skip plugins without watchChange hook", async () => {
        const handler = vi.fn();
        const p1 = makePlugin("p1", {});
        const p2 = makePlugin("p2", { watchChange: handler });
        const driver = new PluginDriver([p1, p2], noopWarning);
        const executor = new WatchHookExecutor(driver);

        const result = await executor.watchChange("file.ts", {
          event: "create",
        });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(result.executedCount).toBe(1);
        expect(result.pluginCount).toBe(2);
      });

      it("should handle ObjectHook format with handler property", async () => {
        const handler = vi.fn();
        const plugin = makePlugin("p1", {
          watchChange: { handler, order: "pre" },
        });
        const driver = new PluginDriver([plugin], noopWarning);
        const executor = new WatchHookExecutor(driver);

        await executor.watchChange("file.ts", { event: "update" });
        expect(handler).toHaveBeenCalledTimes(1);
      });

      it("should throw if watcher is already closed", async () => {
        const driver = new PluginDriver([], noopWarning);
        const executor = new WatchHookExecutor(driver);
        await executor.closeWatcher();

        await expect(
          executor.watchChange("file.ts", { event: "update" }),
        ).rejects.toThrow("Cannot fire watchChange: watcher is already closed");
      });

      it("should handle async hook handlers", async () => {
        const handler = vi.fn(async () => {
          await Promise.resolve();
        });
        const plugin = makePlugin("p1", { watchChange: handler });
        const driver = new PluginDriver([plugin], noopWarning);
        const executor = new WatchHookExecutor(driver);

        const result = await executor.watchChange("file.ts", {
          event: "update",
        });
        expect(result.executedCount).toBe(1);
      });

      it("should return zero executedCount when no hooks defined", async () => {
        const driver = new PluginDriver(
          [makePlugin("p1"), makePlugin("p2")],
          noopWarning,
        );
        const executor = new WatchHookExecutor(driver);

        const result = await executor.watchChange("file.ts", {
          event: "create",
        });
        expect(result.executedCount).toBe(0);
        expect(result.pluginCount).toBe(2);
      });

      it("should skip non-function hook values", async () => {
        const plugin = makePlugin("p1", { watchChange: "not-a-function" });
        const driver = new PluginDriver([plugin], noopWarning);
        const executor = new WatchHookExecutor(driver);

        const result = await executor.watchChange("file.ts", {
          event: "update",
        });
        expect(result.executedCount).toBe(0);
      });
    });

    describe("closeWatcher", () => {
      it("should fire closeWatcher hook and mark as closed", async () => {
        const handler = vi.fn();
        const plugin = makePlugin("p1", { closeWatcher: handler });
        const driver = new PluginDriver([plugin], noopWarning);
        const executor = new WatchHookExecutor(driver);

        expect(executor.isClosed()).toBe(false);
        const result = await executor.closeWatcher();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(executor.isClosed()).toBe(true);
        expect(result.hookName).toBe("closeWatcher");
        expect(result.executedCount).toBe(1);
      });

      it("should fire across multiple plugins", async () => {
        const calls: Array<string> = [];
        const h1 = vi.fn(() => calls.push("p1"));
        const h2 = vi.fn(() => calls.push("p2"));
        const p1 = makePlugin("p1", { closeWatcher: h1 });
        const p2 = makePlugin("p2", { closeWatcher: h2 });
        const driver = new PluginDriver([p1, p2], noopWarning);
        const executor = new WatchHookExecutor(driver);

        await executor.closeWatcher();
        expect(calls).toEqual(["p1", "p2"]);
      });

      it("should throw if already closed", async () => {
        const driver = new PluginDriver([], noopWarning);
        const executor = new WatchHookExecutor(driver);
        await executor.closeWatcher();

        await expect(executor.closeWatcher()).rejects.toThrow(
          "Cannot fire closeWatcher: watcher is already closed",
        );
      });

      it("should handle ObjectHook format", async () => {
        const handler = vi.fn();
        const plugin = makePlugin("p1", {
          closeWatcher: { handler, order: "post" },
        });
        const driver = new PluginDriver([plugin], noopWarning);
        const executor = new WatchHookExecutor(driver);

        await executor.closeWatcher();
        expect(handler).toHaveBeenCalledTimes(1);
      });

      it("should skip plugins without closeWatcher", async () => {
        const p1 = makePlugin("p1", {});
        const handler = vi.fn();
        const p2 = makePlugin("p2", { closeWatcher: handler });
        const driver = new PluginDriver([p1, p2], noopWarning);
        const executor = new WatchHookExecutor(driver);

        const result = await executor.closeWatcher();
        expect(result.executedCount).toBe(1);
        expect(result.pluginCount).toBe(2);
      });

      it("should handle async handlers", async () => {
        const handler = vi.fn(async () => {
          await Promise.resolve();
        });
        const plugin = makePlugin("p1", { closeWatcher: handler });
        const driver = new PluginDriver([plugin], noopWarning);
        const executor = new WatchHookExecutor(driver);

        const result = await executor.closeWatcher();
        expect(result.executedCount).toBe(1);
      });

      it("should skip non-function hook values", async () => {
        const plugin = makePlugin("p1", { closeWatcher: 42 });
        const driver = new PluginDriver([plugin], noopWarning);
        const executor = new WatchHookExecutor(driver);

        const result = await executor.closeWatcher();
        expect(result.executedCount).toBe(0);
      });
    });
  });
});
