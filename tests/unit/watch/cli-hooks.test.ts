/**
 * @module tests/unit/watch/cli-hooks
 * @description Unit tests for watch CLI hooks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeWatchHook, WatchHooks } from "../../../src/watch/cli-hooks.js";
import * as childProcess from "node:child_process";

vi.mock("node:child_process", () => ({
  exec: vi.fn((_command, callback) => {
    if (callback) {
      callback(null, "", "");
    }
    return {
      pid: 12345,
      kill: vi.fn(),
      on: vi.fn(),
    };
  }),
}));

describe("executeWatchHook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes a shell command", () => {
    const result = executeWatchHook("echo hello");

    expect(childProcess.exec).toHaveBeenCalledWith(
      "echo hello",
      expect.any(Function),
    );
    expect(result.command).toBe("echo hello");
    expect(result.process).toBeDefined();
  });

  it("returns the child process reference", () => {
    const result = executeWatchHook("npm run build");

    expect(result.process).toBeDefined();
    expect(result.process.pid).toBe(12345);
  });

  it("calls error listener on execution failure", () => {
    const execError = new Error("Command failed");
    vi.mocked(childProcess.exec).mockImplementationOnce(
      (_command: string, callback: unknown) => {
        const cb = callback as (error: Error | null) => void;
        cb(execError);
        return {
          pid: 12345,
          kill: vi.fn(),
          on: vi.fn(),
        } as unknown as childProcess.ChildProcess;
      },
    );

    const onError = vi.fn();
    executeWatchHook("invalid-command", onError);

    expect(onError).toHaveBeenCalledWith(execError, "invalid-command");
  });

  it("does not throw when no error listener provided and command fails", () => {
    vi.mocked(childProcess.exec).mockImplementationOnce(
      (_command: string, callback: unknown) => {
        const cb = callback as (error: Error | null) => void;
        cb(new Error("Command failed"));
        return {
          pid: 12345,
          kill: vi.fn(),
          on: vi.fn(),
        } as unknown as childProcess.ChildProcess;
      },
    );

    expect(() => executeWatchHook("invalid-command")).not.toThrow();
  });

  it("passes command string exactly as provided", () => {
    executeWatchHook("echo 'hello world' && npm test");

    expect(childProcess.exec).toHaveBeenCalledWith(
      "echo 'hello world' && npm test",
      expect.any(Function),
    );
  });
});

describe("WatchHooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates with empty config", () => {
      const hooks = new WatchHooks({});
      expect(hooks).toBeDefined();
    });

    it("creates with full config", () => {
      const hooks = new WatchHooks({
        onStart: "echo start",
        onBundleEnd: "echo bundle",
        onEnd: "echo end",
        onError: "echo error",
      });
      expect(hooks).toBeDefined();
    });

    it("creates with error listener", () => {
      const onError = vi.fn();
      const hooks = new WatchHooks({}, onError);
      expect(hooks).toBeDefined();
    });
  });

  describe("start", () => {
    it("executes onStart command when configured", () => {
      const hooks = new WatchHooks({ onStart: "echo starting" });
      const result = hooks.start();

      expect(result).toBeDefined();
      expect(result!.command).toBe("echo starting");
      expect(childProcess.exec).toHaveBeenCalledWith(
        "echo starting",
        expect.any(Function),
      );
    });

    it("returns undefined when no onStart configured", () => {
      const hooks = new WatchHooks({});
      const result = hooks.start();

      expect(result).toBeUndefined();
      expect(childProcess.exec).not.toHaveBeenCalled();
    });
  });

  describe("bundleEnd", () => {
    it("executes onBundleEnd command when configured", () => {
      const hooks = new WatchHooks({ onBundleEnd: "npm run lint" });
      const result = hooks.bundleEnd();

      expect(result).toBeDefined();
      expect(result!.command).toBe("npm run lint");
    });

    it("returns undefined when no onBundleEnd configured", () => {
      const hooks = new WatchHooks({});
      const result = hooks.bundleEnd();

      expect(result).toBeUndefined();
    });
  });

  describe("end", () => {
    it("executes onEnd command when configured", () => {
      const hooks = new WatchHooks({ onEnd: "echo done" });
      const result = hooks.end();

      expect(result).toBeDefined();
      expect(result!.command).toBe("echo done");
    });

    it("returns undefined when no onEnd configured", () => {
      const hooks = new WatchHooks({});
      const result = hooks.end();

      expect(result).toBeUndefined();
    });
  });

  describe("error", () => {
    it("executes onError command when configured", () => {
      const hooks = new WatchHooks({ onError: "notify-send 'Build failed'" });
      const result = hooks.error();

      expect(result).toBeDefined();
      expect(result!.command).toBe("notify-send 'Build failed'");
    });

    it("returns undefined when no onError configured", () => {
      const hooks = new WatchHooks({});
      const result = hooks.error();

      expect(result).toBeUndefined();
    });
  });

  describe("error listener integration", () => {
    it("passes error listener to hook execution", () => {
      const execError = new Error("Hook failed");
      vi.mocked(childProcess.exec).mockImplementation(
        (_command: string, callback: unknown) => {
          const cb = callback as (error: Error | null) => void;
          cb(execError);
          return {
            pid: 12345,
            kill: vi.fn(),
            on: vi.fn(),
          } as unknown as childProcess.ChildProcess;
        },
      );

      const onError = vi.fn();
      const hooks = new WatchHooks({ onStart: "failing-command" }, onError);
      hooks.start();

      expect(onError).toHaveBeenCalledWith(execError, "failing-command");
    });

    it("each hook passes the error listener", () => {
      const execError = new Error("Hook failed");
      vi.mocked(childProcess.exec).mockImplementation(
        (_command: string, callback: unknown) => {
          const cb = callback as (error: Error | null) => void;
          cb(execError);
          return {
            pid: 12345,
            kill: vi.fn(),
            on: vi.fn(),
          } as unknown as childProcess.ChildProcess;
        },
      );

      const onError = vi.fn();
      const hooks = new WatchHooks(
        {
          onStart: "cmd1",
          onBundleEnd: "cmd2",
          onEnd: "cmd3",
          onError: "cmd4",
        },
        onError,
      );

      hooks.start();
      hooks.bundleEnd();
      hooks.end();
      hooks.error();

      expect(onError).toHaveBeenCalledTimes(4);
      expect(onError).toHaveBeenCalledWith(execError, "cmd1");
      expect(onError).toHaveBeenCalledWith(execError, "cmd2");
      expect(onError).toHaveBeenCalledWith(execError, "cmd3");
      expect(onError).toHaveBeenCalledWith(execError, "cmd4");
    });
  });
});
