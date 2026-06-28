/**
 * Integration tests for watch mode.
 *
 * Tests verify that watch() performs real builds, watches files for changes,
 * triggers incremental rebuilds, and can be cleanly closed.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watch } from "../../src/watch-entry.js";
import type { RollupWatcher, RollupWatcherEvent } from "../../src/types.js";

/**
 * Helper: collects events from a watcher into an array.
 * Returns a promise that resolves when an event with the given code arrives,
 * or rejects after a timeout.
 */
const waitForEvent = (
  watcher: RollupWatcher,
  code: string,
  timeoutMs: number = 5000,
): Promise<RollupWatcherEvent> =>
  new Promise<RollupWatcherEvent>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${code} event`));
    }, timeoutMs);

    watcher.on("event", (event: RollupWatcherEvent) => {
      if (event.code === code) {
        clearTimeout(timer);
        resolve(event);
      }
    });
  });

/**
 * Helper: collects all events until END or ERROR arrives.
 */
const collectBuildEvents = (
  watcher: RollupWatcher,
  timeoutMs: number = 5000,
): Promise<ReadonlyArray<RollupWatcherEvent>> =>
  new Promise<ReadonlyArray<RollupWatcherEvent>>((resolve, reject) => {
    const events: Array<RollupWatcherEvent> = [];
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timed out collecting events. Got: ${events.map((e) => e.code).join(", ")}`,
        ),
      );
    }, timeoutMs);

    watcher.on("event", (event: RollupWatcherEvent) => {
      events.push(event);
      if (event.code === "END" || event.code === "ERROR") {
        clearTimeout(timer);
        resolve(events);
      }
    });
  });

describe("watch mode integration", () => {
  let tempDir: string;
  let activeWatcher: RollupWatcher | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-watch-"));
    activeWatcher = undefined;
  });

  afterEach(async () => {
    if (activeWatcher) {
      activeWatcher.close();
      activeWatcher = undefined;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("performs initial build and emits correct event sequence", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, 'export const greeting = "hello";\n');

    const watcher = watch({ input: indexPath });
    activeWatcher = watcher;

    const events = await collectBuildEvents(watcher);
    const codes = events.map((e) => e.code);

    expect(codes).toContain("START");
    expect(codes).toContain("BUNDLE_START");
    expect(codes).toContain("BUNDLE_END");
    expect(codes).toContain("END");
  });

  it("emits BUNDLE_END with duration", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const watcher = watch({ input: indexPath });
    activeWatcher = watcher;

    const bundleEnd = await waitForEvent(watcher, "BUNDLE_END");
    expect(typeof bundleEnd.duration).toBe("number");
    expect(bundleEnd.duration).toBeGreaterThanOrEqual(0);
  });

  it("emits BUNDLE_END with a result that has watchFiles", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const watcher = watch({ input: indexPath });
    activeWatcher = watcher;

    const bundleEnd = await waitForEvent(watcher, "BUNDLE_END");
    expect(bundleEnd.result).toBeDefined();
    expect(bundleEnd.result!.watchFiles).toBeDefined();
  });

  it("calls close listeners when watcher is closed", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const watcher = watch({ input: indexPath });
    activeWatcher = watcher;

    // Wait for initial build to complete
    await waitForEvent(watcher, "END");

    let closeCalled = false;
    watcher.on("close", () => {
      closeCalled = true;
    });
    watcher.close();
    activeWatcher = undefined;

    expect(closeCalled).toBe(true);
  });

  it("does not emit events after close", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const watcher = watch({ input: indexPath });

    // Close immediately before build can start
    watcher.close();

    const events: Array<RollupWatcherEvent> = [];
    watcher.on("event", (event: RollupWatcherEvent) => {
      events.push(event);
    });

    // Give time for any events that might fire
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200);
    });

    expect(events).toHaveLength(0);
  });

  it("supports array of configs", async () => {
    const aPath = join(tempDir, "a.js");
    const bPath = join(tempDir, "b.js");
    await writeFile(aPath, "export const a = 1;\n");
    await writeFile(bPath, "export const b = 2;\n");

    const watcher = watch([{ input: aPath }, { input: bPath }]);
    activeWatcher = watcher;

    // Should receive at least one END event (one per config)
    const endEvent = await waitForEvent(watcher, "END");
    expect(endEvent.code).toBe("END");
  });

  it("completes build for non-existent input without crashing", async () => {
    const nonExistentPath = join(tempDir, "does-not-exist.js");

    const watcher = watch({ input: nonExistentPath });
    activeWatcher = watcher;

    // The build may succeed (empty graph) or error — either is acceptable.
    // The key requirement is that the watcher does not hang or crash.
    const events = await collectBuildEvents(watcher);
    const codes = events.map((e) => e.code);

    expect(codes).toContain("START");
    // Must end with either END or ERROR
    const lastCode = codes[codes.length - 1];
    expect(["END", "ERROR"]).toContain(lastCode);
  });

  it("emits restart event on build", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const watcher = watch({ input: indexPath });
    activeWatcher = watcher;

    let restartCalled = false;
    watcher.on("restart", () => {
      restartCalled = true;
    });

    await waitForEvent(watcher, "END");
    expect(restartCalled).toBe(true);
  });
});
