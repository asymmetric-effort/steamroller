/**
 * @module watch/watcher
 * @description RollupWatcher event emitter that orchestrates file watching,
 * change detection, rebuild triggering, and event emission following the
 * standard Rollup watcher event protocol.
 */

import type {
  ChangeEvent,
  InputOptions,
  OutputOptions,
  RollupBuild,
  RollupCache,
  RollupWatcherEvent,
} from "../types.js";
import { FileWatcher, type FileWatcherOptions } from "./file-watcher.js";
import { createIncrementalBuild } from "./incremental.js";

/**
 * Listener for RollupWatcher 'event' events.
 */
export type WatcherEventListener = (event: RollupWatcherEvent) => void;

/**
 * Listener for RollupWatcher 'change' events.
 */
export type WatcherChangeListener = (
  id: string,
  change: { readonly event: ChangeEvent },
) => void;

/**
 * Listener for RollupWatcher 'restart' and 'close' events.
 */
export type WatcherLifecycleListener = () => void;

/**
 * Configuration options for the RollupWatcher.
 */
export interface RollupWatcherOptions {
  /** Input options for the build. */
  readonly input: InputOptions;
  /** Output options for the build. */
  readonly output?: OutputOptions | ReadonlyArray<OutputOptions>;
  /** Delay in ms before triggering rebuild after change detection (default: 50). */
  readonly buildDelay?: number;
  /** Whether to clear the screen before rebuilds. */
  readonly clearScreen?: boolean;
  /** File watcher configuration. */
  readonly watch?: FileWatcherOptions;
}

/**
 * Event types supported by the watcher.
 */
type WatcherEventType = "event" | "change" | "restart" | "close";

/**
 * Union type for all listener types.
 */
type WatcherListener =
  WatcherEventListener | WatcherChangeListener | WatcherLifecycleListener;

/**
 * RollupWatcher orchestrates file watching and incremental rebuilds.
 * Emits events following the Rollup watcher event protocol:
 * START -> BUNDLE_START -> BUNDLE_END -> END (or ERROR).
 */
export class RollupWatcherImpl {
  private readonly fileWatcher: FileWatcher;
  private readonly listeners: Map<WatcherEventType, Array<WatcherListener>> =
    new Map();
  private readonly buildDelay: number;
  private readonly clearScreen: boolean;
  private readonly inputOptions: InputOptions;
  private readonly outputOptions: ReadonlyArray<OutputOptions>;
  private cache: RollupCache | undefined = undefined;
  private buildTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private building = false;

  /**
   * Creates a new RollupWatcher instance.
   *
   * @param options - Configuration for the watcher
   */
  constructor(options: RollupWatcherOptions) {
    this.buildDelay = options.buildDelay ?? 50;
    this.clearScreen = options.clearScreen ?? true;
    this.inputOptions = options.input;
    this.outputOptions = Array.isArray(options.output)
      ? options.output
      : options.output
        ? [options.output]
        : [];

    this.fileWatcher = new FileWatcher(options.watch);
    this.fileWatcher.on((filePath, event) => {
      this.handleChange(filePath, event);
    });

    this.listeners.set("event", []);
    this.listeners.set("change", []);
    this.listeners.set("restart", []);
    this.listeners.set("close", []);
  }

  /**
   * Registers an event listener.
   *
   * @param event - The event type to listen for
   * @param listener - Callback function
   * @returns This watcher for chaining
   */
  on(event: "event", listener: WatcherEventListener): this;
  on(event: "change", listener: WatcherChangeListener): this;
  on(event: "restart" | "close", listener: WatcherLifecycleListener): this;
  on(event: WatcherEventType, listener: WatcherListener): this {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.push(listener);
    }
    return this;
  }

  /**
   * Closes the watcher and releases all resources.
   */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;

    if (this.buildTimer !== null) {
      clearTimeout(this.buildTimer);
      this.buildTimer = null;
    }

    this.fileWatcher.close();
    this.emitLifecycle("close");
  }

  /**
   * Adds a file to be watched.
   *
   * @param filePath - Path to watch
   */
  addWatchFile(filePath: string): void {
    this.fileWatcher.add(filePath);
  }

  /**
   * Triggers an initial build.
   */
  async start(): Promise<void> {
    await this.runBuild();
  }

  /**
   * Returns whether the watcher has been closed.
   */
  get isClosed(): boolean {
    return this.closed;
  }

  /**
   * Handles a detected file change.
   */
  private handleChange(filePath: string, event: ChangeEvent): void {
    if (this.closed) {
      return;
    }

    const changeListeners = this.listeners.get("change") as
      Array<WatcherChangeListener> | undefined;
    if (changeListeners) {
      for (let i = 0; i < changeListeners.length; i++) {
        changeListeners[i](filePath, { event });
      }
    }

    this.scheduleBuild();
  }

  /**
   * Schedules a debounced rebuild.
   */
  private scheduleBuild(): void {
    if (this.buildTimer !== null) {
      clearTimeout(this.buildTimer);
    }

    this.buildTimer = setTimeout(() => {
      this.buildTimer = null;
      void this.runBuild();
    }, this.buildDelay);
  }

  /**
   * Runs the full build cycle with event emission.
   */
  private async runBuild(): Promise<void> {
    if (this.closed || this.building) {
      return;
    }

    this.building = true;

    if (this.clearScreen && typeof process !== "undefined" && process.stdout) {
      process.stdout.write("\x1Bc");
    }

    this.emitLifecycle("restart");
    this.emitEvent({ code: "START" });

    const outputDirs = this.outputOptions
      .map((o) => o.dir ?? o.file ?? "")
      .filter((d) => d.length > 0);

    this.emitEvent({
      code: "BUNDLE_START",
      input: this.inputOptions.input,
      output: outputDirs,
    });

    const startTime = Date.now();

    try {
      const build = await createIncrementalBuild(this.inputOptions, this.cache);

      this.cache = build.cache;

      const duration = Date.now() - startTime;

      this.emitEvent({
        code: "BUNDLE_END",
        input: this.inputOptions.input,
        output: outputDirs,
        duration,
        result: build,
      });

      this.emitEvent({ code: "END" });

      this.addBuildWatchFiles(build);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.emitEvent({
        code: "ERROR",
        error: { message: errorMessage },
      });
    } finally {
      this.building = false;
    }
  }

  /**
   * Adds watch files from a completed build.
   */
  private addBuildWatchFiles(build: RollupBuild): void {
    for (let i = 0; i < build.watchFiles.length; i++) {
      this.fileWatcher.add(build.watchFiles[i]);
    }
  }

  /**
   * Emits a watcher event to all 'event' listeners.
   */
  private emitEvent(event: RollupWatcherEvent): void {
    const listeners = this.listeners.get("event") as
      Array<WatcherEventListener> | undefined;
    if (listeners) {
      for (let i = 0; i < listeners.length; i++) {
        listeners[i](event);
      }
    }
  }

  /**
   * Emits a lifecycle event (restart or close).
   */
  private emitLifecycle(event: "restart" | "close"): void {
    const listeners = this.listeners.get(event) as
      Array<WatcherLifecycleListener> | undefined;
    if (listeners) {
      for (let i = 0; i < listeners.length; i++) {
        listeners[i]();
      }
    }
  }
}
