/**
 * @module tests/unit/watch-entry
 * @description Tests for the watch() entry function.
 * Mocks RollupWatcherImpl so these tests remain unit-level.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RollupWatcherEvent } from "../../src/types.js";

/** Mock RollupWatcherImpl that records calls and allows driving events. */
type EventCb = (event: RollupWatcherEvent) => void;
type ChangeCb = (id: string, change: { readonly event: string }) => void;
type LifecycleCb = () => void;

interface MockWatcherInstance {
  readonly onCalls: Array<{
    event: string;
    listener: EventCb | ChangeCb | LifecycleCb;
  }>;
  readonly startCalled: boolean;
  readonly closeCalled: boolean;
  readonly isClosed: boolean;
}

const mockInstances: Array<
  MockWatcherInstance & {
    startCalled: boolean;
    closeCalled: boolean;
    isClosed: boolean;
  }
> = [];

vi.mock("../../src/watch/watcher.js", () => {
  return {
    RollupWatcherImpl: class MockRollupWatcherImpl {
      private readonly eventListeners: Array<EventCb> = [];
      private readonly changeListeners: Array<ChangeCb> = [];
      private readonly restartListeners: Array<LifecycleCb> = [];
      private readonly closeListeners: Array<LifecycleCb> = [];
      readonly onCalls: Array<{
        event: string;
        listener: EventCb | ChangeCb | LifecycleCb;
      }> = [];
      startCalled = false;
      closeCalled = false;
      isClosed = false;

      constructor(_options: unknown) {
        mockInstances.push(
          this as unknown as MockWatcherInstance & {
            startCalled: boolean;
            closeCalled: boolean;
            isClosed: boolean;
          },
        );
      }

      on(event: string, listener: EventCb | ChangeCb | LifecycleCb): this {
        this.onCalls.push({ event, listener });
        if (event === "event") {
          this.eventListeners.push(listener as EventCb);
        } else if (event === "change") {
          this.changeListeners.push(listener as ChangeCb);
        } else if (event === "restart") {
          this.restartListeners.push(listener as LifecycleCb);
        } else if (event === "close") {
          this.closeListeners.push(listener as LifecycleCb);
        }
        return this;
      }

      async start(): Promise<void> {
        this.startCalled = true;
        // Emit events for START -> BUNDLE_START -> BUNDLE_END -> END
        for (let i = 0; i < this.eventListeners.length; i++) {
          this.eventListeners[i]({ code: "START" });
        }
        for (let i = 0; i < this.eventListeners.length; i++) {
          this.eventListeners[i]({
            code: "BUNDLE_START",
            input: "src/index.ts",
            output: [],
          });
        }
        for (let i = 0; i < this.eventListeners.length; i++) {
          this.eventListeners[i]({
            code: "BUNDLE_END",
            input: "src/index.ts",
            output: [],
            duration: 0,
          });
        }
        for (let i = 0; i < this.eventListeners.length; i++) {
          this.eventListeners[i]({ code: "END" });
        }
      }

      close(): void {
        this.closeCalled = true;
        this.isClosed = true;
        for (let i = 0; i < this.closeListeners.length; i++) {
          this.closeListeners[i]();
        }
      }
    },
  };
});

import { watch } from "../../src/watch-entry.js";

describe("watch", () => {
  beforeEach(() => {
    mockInstances.length = 0;
  });

  afterEach(() => {
    // Close any open watchers
    for (let i = 0; i < mockInstances.length; i++) {
      if (!mockInstances[i].closeCalled) {
        // Already cleaned up or not started
      }
    }
  });

  it("returns a watcher with on and close methods", () => {
    const watcher = watch({ input: "src/index.ts" });
    expect(typeof watcher.on).toBe("function");
    expect(typeof watcher.close).toBe("function");
    watcher.close();
  });

  it("on() returns the watcher for chaining", () => {
    const watcher = watch({ input: "src/index.ts" });
    const result = watcher.on("event", () => {});
    expect(result).toBe(watcher);
    watcher.close();
  });

  it("creates a RollupWatcherImpl for a single config", () => {
    const watcher = watch({ input: "src/index.ts" });
    expect(mockInstances).toHaveLength(1);
    watcher.close();
  });

  it("creates a RollupWatcherImpl per config for array input", () => {
    const watcher = watch([{ input: "src/a.ts" }, { input: "src/b.ts" }]);
    expect(mockInstances).toHaveLength(2);
    watcher.close();
  });

  it("emits build events from the underlying watcher", async () => {
    const events: Array<RollupWatcherEvent> = [];
    const watcher = watch({ input: "src/index.ts" });
    watcher.on("event", (event) => {
      events.push(event);
    });

    // Allow microtask to kick off start()
    await Promise.resolve();
    await Promise.resolve();

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].code).toBe("START");
    watcher.close();
  });

  it("does not start builds after close", async () => {
    const events: Array<RollupWatcherEvent> = [];
    const watcher = watch({ input: "src/index.ts" });
    watcher.on("event", (event) => {
      events.push(event);
    });
    watcher.close();

    // Allow microtask to resolve
    await Promise.resolve();
    await Promise.resolve();

    // close() should prevent start() from being called
    expect(events).toHaveLength(0);
  });

  it("calls close on all underlying watchers", () => {
    const watcher = watch([{ input: "src/a.ts" }, { input: "src/b.ts" }]);
    watcher.close();
    expect(mockInstances[0].closeCalled).toBe(true);
    expect(mockInstances[1].closeCalled).toBe(true);
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

  it("registers change event listeners on underlying watcher", () => {
    const watcher = watch({ input: "src/index.ts" });
    const cb = vi.fn();
    watcher.on("change", cb);
    const changeCall = mockInstances[0].onCalls.find(
      (c) => c.event === "change",
    );
    expect(changeCall).toBeDefined();
    watcher.close();
  });

  it("registers restart event listeners on underlying watcher", () => {
    const watcher = watch({ input: "src/index.ts" });
    const cb = vi.fn();
    watcher.on("restart", cb);
    const restartCall = mockInstances[0].onCalls.find(
      (c) => c.event === "restart",
    );
    expect(restartCall).toBeDefined();
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

    expect(events1.length).toBeGreaterThanOrEqual(1);
    expect(events2.length).toBeGreaterThanOrEqual(1);
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

  it("kicks off start() asynchronously", async () => {
    const watcher = watch({ input: "src/index.ts" });
    // start hasn't been called yet synchronously
    expect(mockInstances[0].startCalled).toBe(false);

    await Promise.resolve();
    await Promise.resolve();

    expect(mockInstances[0].startCalled).toBe(true);
    watcher.close();
  });
});
