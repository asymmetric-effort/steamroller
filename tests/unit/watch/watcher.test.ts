/**
 * @module tests/unit/watch/watcher
 * @description Unit tests for the RollupWatcherImpl class.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { vi } from "../../vi-compat.js";
import type { RollupWatcherEvent } from "../../../src/types.js";

type ChangeHandler = (filePath: string, event: string) => void;

const fileWatcherHandlers: Array<ChangeHandler> = [];
const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockClose = vi.fn();

vi.mock("../../../src/watch/file-watcher.js", () => ({
  FileWatcher: class MockFileWatcher {
    on(handler: ChangeHandler): void {
      fileWatcherHandlers.push(handler);
    }
    add = mockAdd;
    remove = mockRemove;
    close = mockClose;
  },
}));

vi.mock("../../../src/watch/incremental.js", () => ({
  createIncrementalBuild: vi.fn().mockResolvedValue({
    cache: { modules: [], plugins: {} },
    close: vi.fn().mockResolvedValue(undefined),
    closed: false,
    generate: vi.fn().mockResolvedValue({ output: [] }),
    watchFiles: ["/src/index.ts"],
    write: vi.fn().mockResolvedValue({ output: [] }),
  }),
}));

import { RollupWatcherImpl } from "../../../src/watch/watcher.js";
import { createIncrementalBuild } from "../../../src/watch/incremental.js";

describe("RollupWatcherImpl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fileWatcherHandlers.length = 0;
    mockAdd.mockClear();
    mockRemove.mockClear();
    mockClose.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("creates with minimal options", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
      });
      expect(watcher.isClosed).toBe(false);
      watcher.close();
    });

    it("creates with full options", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        output: { format: "es", dir: "dist" },
        buildDelay: 100,
        clearScreen: false,
      });
      expect(watcher.isClosed).toBe(false);
      watcher.close();
    });

    it("accepts array of output options", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        output: [
          { format: "es", dir: "dist/esm" },
          { format: "cjs", dir: "dist/cjs" },
        ],
      });
      expect(watcher.isClosed).toBe(false);
      watcher.close();
    });
  });

  describe("on", () => {
    it("registers event listener and returns this for chaining", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
      });
      const result = watcher.on("event", () => {});
      expect(result).toBe(watcher);
      watcher.close();
    });

    it("registers change listener", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
      });
      const result = watcher.on("change", () => {});
      expect(result).toBe(watcher);
      watcher.close();
    });

    it("registers restart listener", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
      });
      const result = watcher.on("restart", () => {});
      expect(result).toBe(watcher);
      watcher.close();
    });

    it("registers close listener", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
      });
      const result = watcher.on("close", () => {});
      expect(result).toBe(watcher);
      watcher.close();
    });
  });

  describe("close", () => {
    it("closes the watcher", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
      });
      watcher.close();
      expect(watcher.isClosed).toBe(true);
    });

    it("emits close event", () => {
      const closeListener = vi.fn();
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
      });
      watcher.on("close", closeListener);
      watcher.close();
      expect(closeListener).toHaveBeenCalledTimes(1);
    });

    it("is idempotent", () => {
      const closeListener = vi.fn();
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
      });
      watcher.on("close", closeListener);
      watcher.close();
      watcher.close();
      expect(closeListener).toHaveBeenCalledTimes(1);
    });

    it("clears pending build timer", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        buildDelay: 100,
      });
      watcher.addWatchFile("/test/file.ts");
      watcher.close();
      vi.advanceTimersByTime(200);
      expect(watcher.isClosed).toBe(true);
    });
  });

  describe("event emission sequence", () => {
    it("emits START -> BUNDLE_START -> BUNDLE_END -> END on build", async () => {
      const events: Array<string> = [];
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        output: { format: "es", dir: "dist" },
        clearScreen: false,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        events.push(event.code);
      });
      await watcher.start();
      expect(events).toEqual(["START", "BUNDLE_START", "BUNDLE_END", "END"]);
      watcher.close();
    });

    it("emits restart event on build", async () => {
      const restartListener = vi.fn();
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: false,
      });
      watcher.on("restart", restartListener);
      await watcher.start();
      expect(restartListener).toHaveBeenCalledTimes(1);
      watcher.close();
    });

    it("emits ERROR event on build failure", async () => {
      vi.mocked(createIncrementalBuild).mockRejectedValueOnce(
        new Error("Build failed"),
      );

      const events: Array<string> = [];
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: false,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        events.push(event.code);
      });
      await watcher.start();
      expect(events).toEqual(["START", "BUNDLE_START", "ERROR"]);
      watcher.close();
    });

    it("includes error info in ERROR event", async () => {
      vi.mocked(createIncrementalBuild).mockRejectedValueOnce(
        new Error("Syntax error in module"),
      );

      let errorEvent: RollupWatcherEvent | undefined;
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: false,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        if (event.code === "ERROR") {
          errorEvent = event;
        }
      });
      await watcher.start();
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.error?.message).toBe("Syntax error in module");
      watcher.close();
    });

    it("includes duration in BUNDLE_END event", async () => {
      let bundleEndEvent: RollupWatcherEvent | undefined;
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        output: { format: "es", dir: "dist" },
        clearScreen: false,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        if (event.code === "BUNDLE_END") {
          bundleEndEvent = event;
        }
      });
      await watcher.start();
      expect(bundleEndEvent).toBeDefined();
      expect(typeof bundleEndEvent!.duration).toBe("number");
      expect(bundleEndEvent!.duration).toBeGreaterThanOrEqual(0);
      watcher.close();
    });

    it("includes output dirs in BUNDLE_START and BUNDLE_END events", async () => {
      const bundleEvents: Array<RollupWatcherEvent> = [];
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        output: { format: "es", dir: "dist" },
        clearScreen: false,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        if (event.code === "BUNDLE_START" || event.code === "BUNDLE_END") {
          bundleEvents.push(event);
        }
      });
      await watcher.start();
      expect(bundleEvents[0].output).toEqual(["dist"]);
      expect(bundleEvents[1].output).toEqual(["dist"]);
      watcher.close();
    });

    it("handles non-Error throw in build", async () => {
      vi.mocked(createIncrementalBuild).mockRejectedValueOnce("string error");

      let errorEvent: RollupWatcherEvent | undefined;
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: false,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        if (event.code === "ERROR") {
          errorEvent = event;
        }
      });
      await watcher.start();
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.error?.message).toBe("string error");
      watcher.close();
    });
  });

  describe("change detection", () => {
    it("emits change event when file watcher detects change", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: false,
      });
      const changeListener = vi.fn();
      watcher.on("change", changeListener);

      const handler = fileWatcherHandlers[fileWatcherHandlers.length - 1];
      handler("/src/index.ts", "update");

      expect(changeListener).toHaveBeenCalledWith("/src/index.ts", {
        event: "update",
      });
      watcher.close();
    });

    it("does not emit change after close", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: false,
      });
      const changeListener = vi.fn();
      watcher.on("change", changeListener);
      watcher.close();

      const handler = fileWatcherHandlers[fileWatcherHandlers.length - 1];
      handler("/src/index.ts", "update");

      expect(changeListener).not.toHaveBeenCalled();
    });
  });

  describe("addWatchFile", () => {
    it("adds a file to be watched", () => {
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
      });
      watcher.addWatchFile("/test/dep.ts");
      expect(mockAdd).toHaveBeenCalledWith("/test/dep.ts");
      watcher.close();
    });
  });

  describe("clearScreen", () => {
    it("writes clear screen sequence when clearScreen is true", async () => {
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: true,
      });
      await watcher.start();
      expect(writeSpy).toHaveBeenCalledWith("\x1Bc");
      writeSpy.mockRestore();
      watcher.close();
    });
  });

  describe("concurrent build protection", () => {
    it("does not start a second build while one is running", async () => {
      let resolveDelayedBuild: (() => void) | undefined;
      vi.mocked(createIncrementalBuild).mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveDelayedBuild = () =>
            resolve({
              cache: { modules: [], plugins: {} },
              close: vi.fn().mockResolvedValue(undefined),
              closed: false,
              generate: vi.fn().mockResolvedValue({ output: [] }),
              watchFiles: [],
              write: vi.fn().mockResolvedValue({ output: [] }),
            });
        });
      });

      const events: Array<string> = [];
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: false,
        buildDelay: 10,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        events.push(event.code);
      });

      // Start a build (will be delayed)
      const buildPromise = watcher.start();

      // Trigger a scheduled rebuild while the first is still running
      const handler = fileWatcherHandlers[fileWatcherHandlers.length - 1];
      handler("/src/other.ts", "update");

      // Let the scheduled timer fire while we're still building
      await vi.advanceTimersByTimeAsync(20);

      // Now resolve the first build
      resolveDelayedBuild!();
      await buildPromise;

      // Only one full build sequence should have completed
      expect(events).toEqual(["START", "BUNDLE_START", "BUNDLE_END", "END"]);
      watcher.close();
    });

    it("does not build after close even if timer fires", async () => {
      const events: Array<string> = [];
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: false,
        buildDelay: 100,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        events.push(event.code);
      });

      // Trigger change then close before timer fires
      const handler = fileWatcherHandlers[fileWatcherHandlers.length - 1];
      handler("/src/index.ts", "update");
      watcher.close();

      vi.advanceTimersByTime(200);
      // No events should have been emitted since we closed before build
      expect(events).toEqual([]);
    });
  });

  describe("scheduled rebuild via timer", () => {
    it("triggers rebuild after buildDelay when change is detected", async () => {
      const events: Array<string> = [];
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: false,
        buildDelay: 50,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        events.push(event.code);
      });

      // Do an initial build first
      await watcher.start();
      events.length = 0;

      // Now trigger a change
      const handler = fileWatcherHandlers[fileWatcherHandlers.length - 1];
      handler("/src/index.ts", "update");

      // Advance past build delay
      await vi.advanceTimersByTimeAsync(60);

      expect(events).toEqual(["START", "BUNDLE_START", "BUNDLE_END", "END"]);
      watcher.close();
    });

    it("debounces multiple changes into single rebuild", async () => {
      const events: Array<string> = [];
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: false,
        buildDelay: 100,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        events.push(event.code);
      });

      await watcher.start();
      events.length = 0;

      const handler = fileWatcherHandlers[fileWatcherHandlers.length - 1];
      handler("/src/a.ts", "update");
      await vi.advanceTimersByTimeAsync(30);
      handler("/src/b.ts", "update");
      await vi.advanceTimersByTimeAsync(30);
      handler("/src/c.ts", "update");

      await vi.advanceTimersByTimeAsync(110);

      // Should only rebuild once
      expect(events).toEqual(["START", "BUNDLE_START", "BUNDLE_END", "END"]);
      watcher.close();
    });
  });

  describe("output file option", () => {
    it("uses file option when dir is not set", async () => {
      const bundleEvents: Array<RollupWatcherEvent> = [];
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        output: { format: "es", file: "dist/bundle.js" },
        clearScreen: false,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        if (event.code === "BUNDLE_START") {
          bundleEvents.push(event);
        }
      });
      await watcher.start();
      expect(bundleEvents[0].output).toEqual(["dist/bundle.js"]);
      watcher.close();
    });

    it("handles empty output options", async () => {
      const bundleEvents: Array<RollupWatcherEvent> = [];
      const watcher = new RollupWatcherImpl({
        input: { input: "src/index.ts" },
        clearScreen: false,
      });
      watcher.on("event", (event: RollupWatcherEvent) => {
        if (event.code === "BUNDLE_START") {
          bundleEvents.push(event);
        }
      });
      await watcher.start();
      expect(bundleEvents[0].output).toEqual([]);
      watcher.close();
    });
  });
});
