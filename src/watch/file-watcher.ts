/**
 * @module watch/file-watcher
 * @description File system watcher using Node.js built-in fs.watch.
 * Provides debounced change detection with include/exclude glob filtering
 * and graceful ENOENT handling for deleted files.
 */

import { watch, type FSWatcher } from "node:fs";
import type { ChangeEvent } from "../types.js";

/**
 * Listener callback for file change events.
 */
export type FileWatcherListener = (
  filePath: string,
  event: ChangeEvent,
) => void;

/**
 * Options for configuring the FileWatcher.
 */
export interface FileWatcherOptions {
  /** Debounce delay in milliseconds (default: 50). */
  readonly debounceDelay?: number;
  /** Glob patterns to include (if provided, only matching files emit events). */
  readonly include?: ReadonlyArray<string>;
  /** Glob patterns to exclude (matching files will not emit events). */
  readonly exclude?: ReadonlyArray<string>;
}

/**
 * Converts a simple glob pattern to a RegExp.
 * Supports * (any chars except /) and ** (any chars including /).
 *
 * @param pattern - Glob pattern string
 * @returns Compiled RegExp
 */
const globToRegExp = (pattern: string): RegExp => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`);
};

/**
 * Checks if a file path matches any of the given glob patterns.
 *
 * @param filePath - The file path to test
 * @param patterns - Array of glob patterns
 * @returns True if at least one pattern matches
 */
const matchesPatterns = (
  filePath: string,
  patterns: ReadonlyArray<string>,
): boolean => {
  for (let i = 0; i < patterns.length; i++) {
    if (globToRegExp(patterns[i]).test(filePath)) {
      return true;
    }
  }
  return false;
};

/**
 * File watcher that monitors file system changes using Node.js fs.watch.
 * Supports debouncing, include/exclude filtering, and graceful error handling.
 */
export class FileWatcher {
  private readonly watchers: Map<string, FSWatcher> = new Map();
  private readonly listeners: Array<FileWatcherListener> = [];
  private readonly debounceTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  private readonly debounceDelay: number;
  private readonly includePatterns: ReadonlyArray<string>;
  private readonly excludePatterns: ReadonlyArray<string>;
  private closed = false;

  /**
   * Creates a new FileWatcher instance.
   *
   * @param options - Configuration options for debouncing and filtering
   */
  constructor(options: FileWatcherOptions = {}) {
    this.debounceDelay = options.debounceDelay ?? 50;
    this.includePatterns = options.include ?? [];
    this.excludePatterns = options.exclude ?? [];
  }

  /**
   * Registers a listener for file change events.
   *
   * @param listener - Callback invoked on file changes
   */
  on(listener: FileWatcherListener): void {
    this.listeners.push(listener);
  }

  /**
   * Starts watching a file path for changes.
   *
   * @param filePath - Absolute path to the file to watch
   */
  add(filePath: string): void {
    if (this.closed || this.watchers.has(filePath)) {
      return;
    }

    try {
      const watcher = watch(filePath, (eventType) => {
        this.handleEvent(filePath, eventType);
      });

      watcher.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          this.remove(filePath);
          this.emit(filePath, "delete");
        }
      });

      this.watchers.set(filePath, watcher);
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        this.emit(filePath, "delete");
      }
    }
  }

  /**
   * Stops watching a file path.
   *
   * @param filePath - Path to stop watching
   */
  remove(filePath: string): void {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
    }
    const timer = this.debounceTimers.get(filePath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(filePath);
    }
  }

  /**
   * Closes all watchers and cleans up resources.
   */
  close(): void {
    this.closed = true;
    for (const [path, watcher] of this.watchers) {
      watcher.close();
      this.watchers.delete(path);
    }
    for (const [path, timer] of this.debounceTimers) {
      clearTimeout(timer);
      this.debounceTimers.delete(path);
    }
    this.listeners.length = 0;
  }

  /**
   * Returns the number of actively watched paths.
   */
  get watchCount(): number {
    return this.watchers.size;
  }

  /**
   * Handles raw fs.watch events and maps them to ChangeEvent types.
   */
  private handleEvent(filePath: string, eventType: string): void {
    const changeEvent: ChangeEvent =
      eventType === "rename" ? "delete" : "update";
    this.emitDebounced(filePath, changeEvent);
  }

  /**
   * Debounces rapid events for the same file path.
   */
  private emitDebounced(filePath: string, event: ChangeEvent): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.emit(filePath, event);
    }, this.debounceDelay);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Emits a change event to all registered listeners after filtering.
   */
  private emit(filePath: string, event: ChangeEvent): void {
    if (!this.passesFilter(filePath)) {
      return;
    }
    for (let i = 0; i < this.listeners.length; i++) {
      this.listeners[i](filePath, event);
    }
  }

  /**
   * Checks if a file path passes the include/exclude filters.
   */
  private passesFilter(filePath: string): boolean {
    if (
      this.excludePatterns.length > 0 &&
      matchesPatterns(filePath, this.excludePatterns)
    ) {
      return false;
    }
    if (this.includePatterns.length > 0) {
      return matchesPatterns(filePath, this.includePatterns);
    }
    return true;
  }
}
