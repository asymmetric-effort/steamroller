/**
 * @module tests/unit/watch/file-watcher
 * @description Unit tests for the FileWatcher class.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { vi } from "../../vi-compat.js";
import { FileWatcher } from "../../../src/watch/file-watcher.js";
import * as fs from "node:fs";
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const actualFs = require("node:fs");
vi.mock("node:fs", () => ({
  ...actualFs,
  watch: vi.fn(),
}));

describe("FileWatcher", () => {
  let watcher: FileWatcher;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (watcher) {
      watcher.close();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("creates with default options", () => {
      watcher = new FileWatcher();
      expect(watcher.watchCount).toBe(0);
    });

    it("creates with custom debounce delay", () => {
      watcher = new FileWatcher({ debounceDelay: 100 });
      expect(watcher.watchCount).toBe(0);
    });

    it("creates with include patterns", () => {
      watcher = new FileWatcher({ include: ["*.ts"] });
      expect(watcher.watchCount).toBe(0);
    });

    it("creates with exclude patterns", () => {
      watcher = new FileWatcher({ exclude: ["node_modules/**"] });
      expect(watcher.watchCount).toBe(0);
    });
  });

  describe("add", () => {
    it("adds a file to watch", () => {
      const mockWatcher = {
        on: vi.fn(),
        close: vi.fn(),
      };
      vi.mocked(fs.watch).mockReturnValue(
        mockWatcher as unknown as fs.FSWatcher,
      );

      watcher = new FileWatcher();
      watcher.add("/test/file.ts");

      expect(fs.watch).toHaveBeenCalledWith(
        "/test/file.ts",
        expect.any(Function),
      );
      expect(watcher.watchCount).toBe(1);
    });

    it("does not add duplicate paths", () => {
      const mockWatcher = {
        on: vi.fn(),
        close: vi.fn(),
      };
      vi.mocked(fs.watch).mockReturnValue(
        mockWatcher as unknown as fs.FSWatcher,
      );

      watcher = new FileWatcher();
      watcher.add("/test/file.ts");
      watcher.add("/test/file.ts");

      expect(fs.watch).toHaveBeenCalledTimes(1);
      expect(watcher.watchCount).toBe(1);
    });

    it("does not add after close", () => {
      watcher = new FileWatcher();
      watcher.close();
      watcher.add("/test/file.ts");

      expect(fs.watch).not.toHaveBeenCalled();
    });

    it("handles ENOENT gracefully on add", () => {
      vi.mocked(fs.watch).mockImplementation(() => {
        const error: NodeJS.ErrnoException = new Error("ENOENT");
        error.code = "ENOENT";
        throw error;
      });

      const listener = vi.fn();
      watcher = new FileWatcher();
      watcher.on(listener);
      watcher.add("/nonexistent/file.ts");

      expect(listener).toHaveBeenCalledWith("/nonexistent/file.ts", "delete");
      expect(watcher.watchCount).toBe(0);
    });
  });

  describe("remove", () => {
    it("removes a watched file", () => {
      const mockWatcher = {
        on: vi.fn(),
        close: vi.fn(),
      };
      vi.mocked(fs.watch).mockReturnValue(
        mockWatcher as unknown as fs.FSWatcher,
      );

      watcher = new FileWatcher();
      watcher.add("/test/file.ts");
      expect(watcher.watchCount).toBe(1);

      watcher.remove("/test/file.ts");
      expect(watcher.watchCount).toBe(0);
      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it("does nothing for non-watched path", () => {
      watcher = new FileWatcher();
      watcher.remove("/nonexistent.ts");
      expect(watcher.watchCount).toBe(0);
    });

    it("clears pending debounce timer on remove", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = {
        on: vi.fn(),
        close: vi.fn(),
      };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher();
      watcher.on(listener);
      watcher.add("/test/file.ts");

      watchCallback!("change");
      watcher.remove("/test/file.ts");

      vi.advanceTimersByTime(100);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("close", () => {
    it("closes all watchers", () => {
      const mockWatcher1 = { on: vi.fn(), close: vi.fn() };
      const mockWatcher2 = { on: vi.fn(), close: vi.fn() };
      let callCount = 0;
      vi.mocked(fs.watch).mockImplementation(() => {
        callCount++;
        return (callCount === 1
          ? mockWatcher1
          : mockWatcher2) as unknown as fs.FSWatcher;
      });

      watcher = new FileWatcher();
      watcher.add("/test/a.ts");
      watcher.add("/test/b.ts");
      expect(watcher.watchCount).toBe(2);

      watcher.close();
      expect(watcher.watchCount).toBe(0);
      expect(mockWatcher1.close).toHaveBeenCalled();
      expect(mockWatcher2.close).toHaveBeenCalled();
    });

    it("prevents adding new watchers after close", () => {
      watcher = new FileWatcher();
      watcher.close();
      watcher.add("/test/file.ts");
      expect(watcher.watchCount).toBe(0);
    });

    it("clears pending debounce timers on close", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = { on: vi.fn(), close: vi.fn() };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher();
      watcher.on(listener);
      watcher.add("/test/file.ts");

      // Trigger a change to create a debounce timer
      watchCallback!("change");

      // Close before the timer fires
      watcher.close();

      vi.advanceTimersByTime(100);
      // Listener should not have been called since close cleared the timer
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("debounce", () => {
    it("debounces rapid changes", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = { on: vi.fn(), close: vi.fn() };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher({ debounceDelay: 50 });
      watcher.on(listener);
      watcher.add("/test/file.ts");

      watchCallback!("change");
      watchCallback!("change");
      watchCallback!("change");

      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith("/test/file.ts", "update");
    });

    it("uses custom debounce delay", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = { on: vi.fn(), close: vi.fn() };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher({ debounceDelay: 200 });
      watcher.on(listener);
      watcher.add("/test/file.ts");

      watchCallback!("change");

      vi.advanceTimersByTime(100);
      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("event mapping", () => {
    it("maps change event to update", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = { on: vi.fn(), close: vi.fn() };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher();
      watcher.on(listener);
      watcher.add("/test/file.ts");

      watchCallback!("change");
      vi.advanceTimersByTime(50);

      expect(listener).toHaveBeenCalledWith("/test/file.ts", "update");
    });

    it("maps rename event to delete", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = { on: vi.fn(), close: vi.fn() };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher();
      watcher.on(listener);
      watcher.add("/test/file.ts");

      watchCallback!("rename");
      vi.advanceTimersByTime(50);

      expect(listener).toHaveBeenCalledWith("/test/file.ts", "delete");
    });
  });

  describe("ENOENT error handling", () => {
    it("emits delete and removes watcher on ENOENT error", () => {
      let errorHandler: ((error: NodeJS.ErrnoException) => void) | undefined;
      const mockWatcher = {
        on: vi.fn(
          (event: string, handler: (error: NodeJS.ErrnoException) => void) => {
            if (event === "error") {
              errorHandler = handler;
            }
          },
        ),
        close: vi.fn(),
      };
      vi.mocked(fs.watch).mockImplementation((_path, _cb) => {
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher();
      watcher.on(listener);
      watcher.add("/test/deleted.ts");

      expect(errorHandler).toBeDefined();
      const enoentError: NodeJS.ErrnoException = new Error("ENOENT");
      enoentError.code = "ENOENT";
      errorHandler!(enoentError);

      vi.advanceTimersByTime(50);
      expect(listener).toHaveBeenCalledWith("/test/deleted.ts", "delete");
      expect(watcher.watchCount).toBe(0);
    });
  });

  describe("include/exclude filters", () => {
    it("only emits for files matching include patterns", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = { on: vi.fn(), close: vi.fn() };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher({ include: ["*.ts"] });
      watcher.on(listener);
      watcher.add("/test/file.js");

      watchCallback!("change");
      vi.advanceTimersByTime(50);

      expect(listener).not.toHaveBeenCalled();
    });

    it("emits for files matching include patterns", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = { on: vi.fn(), close: vi.fn() };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher({ include: ["*.ts"] });
      watcher.on(listener);
      watcher.add("file.ts");

      watchCallback!("change");
      vi.advanceTimersByTime(50);

      expect(listener).toHaveBeenCalledWith("file.ts", "update");
    });

    it("excludes files matching exclude patterns", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = { on: vi.fn(), close: vi.fn() };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher({ exclude: ["node_modules/**"] });
      watcher.on(listener);
      watcher.add("node_modules/pkg/index.js");

      watchCallback!("change");
      vi.advanceTimersByTime(50);

      expect(listener).not.toHaveBeenCalled();
    });

    it("does not exclude files not matching exclude patterns", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = { on: vi.fn(), close: vi.fn() };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher({ exclude: ["node_modules/**"] });
      watcher.on(listener);
      watcher.add("src/index.ts");

      watchCallback!("change");
      vi.advanceTimersByTime(50);

      expect(listener).toHaveBeenCalledWith("src/index.ts", "update");
    });

    it("exclude takes priority over include", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = { on: vi.fn(), close: vi.fn() };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener = vi.fn();
      watcher = new FileWatcher({
        include: ["*.ts"],
        exclude: ["*.test.ts"],
      });
      watcher.on(listener);
      watcher.add("file.test.ts");

      watchCallback!("change");
      vi.advanceTimersByTime(50);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("multiple listeners", () => {
    it("notifies all registered listeners", () => {
      let watchCallback: ((eventType: string) => void) | undefined;
      const mockWatcher = { on: vi.fn(), close: vi.fn() };
      vi.mocked(fs.watch).mockImplementation((_path, cb) => {
        watchCallback = cb as (eventType: string) => void;
        return mockWatcher as unknown as fs.FSWatcher;
      });

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      watcher = new FileWatcher();
      watcher.on(listener1);
      watcher.on(listener2);
      watcher.add("/test/file.ts");

      watchCallback!("change");
      vi.advanceTimersByTime(50);

      expect(listener1).toHaveBeenCalledWith("/test/file.ts", "update");
      expect(listener2).toHaveBeenCalledWith("/test/file.ts", "update");
    });
  });
});
