/**
 * @module tests/unit/watch-entry
 * @description Tests for the watch() entry function.
 */

import { describe, it, expect } from "vitest";
import { watch } from "../../src/watch-entry.js";
import type { RollupWatcherEvent } from "../../src/types.js";

describe("watch", () => {
  it("returns a watcher with on and close methods", () => {
    const watcher = watch({ input: "src/index.ts" });
    expect(typeof watcher.on).toBe("function");
    expect(typeof watcher.close).toBe("function");
  });

  it("on() returns the watcher for chaining", () => {
    const watcher = watch({ input: "src/index.ts" });
    const result = watcher.on("event", () => {});
    expect(result).toBe(watcher);
    watcher.close();
  });

  it("emits START event asynchronously", async () => {
    const events: Array<RollupWatcherEvent> = [];
    const watcher = watch({ input: "src/index.ts" });
    watcher.on("event", (event) => {
      events.push(event);
    });

    // Wait for microtask
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toHaveLength(1);
    expect(events[0].code).toBe("START");
    watcher.close();
  });

  it("does not emit START after close", async () => {
    const events: Array<RollupWatcherEvent> = [];
    const watcher = watch({ input: "src/index.ts" });
    watcher.on("event", (event) => {
      events.push(event);
    });
    watcher.close();

    // Wait for microtask
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toHaveLength(0);
  });

  it("calls close listeners on close", () => {
    let closed = false;
    const watcher = watch({ input: "src/index.ts" });
    watcher.on("close", () => {
      closed = true;
    });
    watcher.close();
    expect(closed).toBe(true);
  });

  it("supports change event listeners", () => {
    const watcher = watch({ input: "src/index.ts" });
    let called = false;
    watcher.on("change", () => {
      called = true;
    });
    // Change events are emitted by file watcher (not yet implemented)
    expect(called).toBe(false);
    watcher.close();
  });

  it("supports restart event listeners", () => {
    const watcher = watch({ input: "src/index.ts" });
    let called = false;
    watcher.on("restart", () => {
      called = true;
    });
    expect(called).toBe(false);
    watcher.close();
  });

  it("accepts array of configs", () => {
    const watcher = watch([{ input: "src/a.ts" }, { input: "src/b.ts" }]);
    expect(typeof watcher.on).toBe("function");
    expect(typeof watcher.close).toBe("function");
    watcher.close();
  });

  it("supports multiple event listeners", async () => {
    const events1: Array<RollupWatcherEvent> = [];
    const events2: Array<RollupWatcherEvent> = [];
    const watcher = watch({ input: "src/index.ts" });
    watcher.on("event", (event) => events1.push(event));
    watcher.on("event", (event) => events2.push(event));

    await Promise.resolve();
    await Promise.resolve();

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
    watcher.close();
  });

  it("supports multiple close listeners", () => {
    let count = 0;
    const watcher = watch({ input: "src/index.ts" });
    watcher.on("close", () => {
      count += 1;
    });
    watcher.on("close", () => {
      count += 1;
    });
    watcher.close();
    expect(count).toBe(2);
  });

  it("chaining multiple on calls", () => {
    const watcher = watch({ input: "src/index.ts" });
    const result = watcher
      .on("event", () => {})
      .on("close", () => {})
      .on("restart", () => {});
    expect(result).toBe(watcher);
    watcher.close();
  });
});
