import { describe, it, expect } from "bun:test";
import {
  yieldToEventLoop,
  runParallel,
  checkAborted,
} from "../../../src/utils/async-utils.js";

describe("yieldToEventLoop", () => {
  it("resolves after yielding to the event loop", async () => {
    const result = await yieldToEventLoop();
    expect(result).toBeUndefined();
  });

  it("allows other callbacks to run", async () => {
    const order: number[] = [];

    const yieldPromise = yieldToEventLoop().then(() => {
      order.push(2);
    });

    order.push(1);
    await yieldPromise;

    expect(order).toEqual([1, 2]);
  });
});

describe("runParallel", () => {
  it("returns empty array for zero tasks", async () => {
    const results = await runParallel([], 1);
    expect(results).toEqual([]);
  });

  it("executes all tasks and returns results in order", async () => {
    const tasks = [
      () => Promise.resolve("a"),
      () => Promise.resolve("b"),
      () => Promise.resolve("c"),
    ];

    const results = await runParallel(tasks, 3);
    expect(results).toEqual(["a", "b", "c"]);
  });

  it("respects concurrency limit", async () => {
    const maxConcurrent = { value: 0 };
    const currentConcurrent = { value: 0 };

    const createTask = (id: number) => async (): Promise<number> => {
      currentConcurrent.value++;
      if (currentConcurrent.value > maxConcurrent.value) {
        maxConcurrent.value = currentConcurrent.value;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      currentConcurrent.value--;
      return id;
    };

    const tasks = [
      createTask(1),
      createTask(2),
      createTask(3),
      createTask(4),
      createTask(5),
    ];

    const results = await runParallel(tasks, 2);

    expect(maxConcurrent.value).toBeLessThanOrEqual(2);
    expect(results).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles single task with concurrency 1", async () => {
    const results = await runParallel([() => Promise.resolve(42)], 1);
    expect(results).toEqual([42]);
  });

  it("propagates task errors", async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error("task failed")),
      () => Promise.resolve(3),
    ];

    await expect(runParallel(tasks, 2)).rejects.toThrow("task failed");
  });

  it("rejects for invalid concurrency", async () => {
    await expect(runParallel([() => Promise.resolve(1)], 0)).rejects.toThrow(
      "maxConcurrency must be a positive integer",
    );
  });

  it("preserves result types", async () => {
    const tasks: ReadonlyArray<() => Promise<{ id: number }>> = [
      () => Promise.resolve({ id: 1 }),
      () => Promise.resolve({ id: 2 }),
    ];

    const results = await runParallel(tasks, 2);
    expect(results[0]).toEqual({ id: 1 });
    expect(results[1]).toEqual({ id: 2 });
  });

  it("releases semaphore on task failure", async () => {
    const completedTasks: number[] = [];

    const tasks = [
      async () => {
        completedTasks.push(1);
        return 1;
      },
      async (): Promise<number> => {
        throw new Error("fail");
      },
      async () => {
        completedTasks.push(3);
        return 3;
      },
    ];

    // Should reject but semaphore should not deadlock
    await expect(runParallel(tasks, 1)).rejects.toThrow("fail");
  });
});

describe("checkAborted", () => {
  it("does nothing when no signal is provided", () => {
    expect(() => checkAborted()).not.toThrow();
  });

  it("does nothing when signal is undefined", () => {
    expect(() => checkAborted(undefined)).not.toThrow();
  });

  it("does nothing when signal is not aborted", () => {
    const controller = new AbortController();
    expect(() => checkAborted(controller.signal)).not.toThrow();
  });

  it("throws when signal is aborted", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => checkAborted(controller.signal)).toThrow("Operation aborted");
  });

  it("throws with correct error message", () => {
    const controller = new AbortController();
    controller.abort();

    try {
      checkAborted(controller.signal);
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe("Operation aborted");
    }
  });
});
