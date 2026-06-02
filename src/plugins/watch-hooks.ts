/**
 * @module plugins/watch-hooks
 * @description Watch and cross-cutting hooks for steamroller.
 * Provides watchChange and closeWatcher hook execution via PluginDriver.
 * Both hooks execute sequentially across all registered plugins.
 */

import type { Plugin, ChangeEvent } from "../types.js";
import { PluginDriver } from "./driver.js";
import { ALREADY_CLOSED } from "../utils/error-codes.js";

/** Event payload for the watchChange hook. */
export interface WatchChangeEvent {
  readonly event: ChangeEvent;
}

/** Hook definitions for watch-related hooks. */
export const WATCH_HOOKS = {
  watchChange: {
    name: "watchChange",
    strategy: "sequential" as const,
    async: true,
  },
  closeWatcher: {
    name: "closeWatcher",
    strategy: "sequential" as const,
    async: true,
  },
} as const;

/** Result of a watch hook execution containing per-plugin results. */
export interface WatchHookResult {
  readonly hookName: string;
  readonly pluginCount: number;
  readonly executedCount: number;
}

/**
 * WatchHookExecutor orchestrates execution of watch-related hooks.
 * Wraps PluginDriver to provide typed access to watchChange and closeWatcher.
 */
export class WatchHookExecutor {
  private readonly _driver: PluginDriver;
  private _closed: boolean = false;

  constructor(driver: PluginDriver) {
    this._driver = driver;
  }

  /** Whether the watcher has been closed. */
  isClosed(): boolean {
    return this._closed;
  }

  /** Get the underlying plugin driver (for testing). */
  getDriver(): PluginDriver {
    return this._driver;
  }

  /**
   * Fire the watchChange hook across all plugins.
   * Called when a watched file is created, updated, or deleted.
   *
   * @param id - The file path that changed
   * @param change - The change event descriptor
   * @returns Result with execution metadata
   * @throws Error if the watcher has been closed
   */
  async watchChange(
    id: string,
    change: WatchChangeEvent,
  ): Promise<WatchHookResult> {
    if (this._closed) {
      throw Object.assign(
        new Error("Cannot fire watchChange: watcher is already closed"),
        { code: ALREADY_CLOSED },
      );
    }

    const plugins = this._driver.getPlugins();
    let executedCount = 0;

    for (const plugin of plugins) {
      const hook = (plugin as unknown as Record<string, unknown>)[
        "watchChange"
      ];
      if (hook !== undefined && hook !== null) {
        const handler = extractHandler(hook);
        if (typeof handler === "function") {
          await (handler as WatchChangeHandler).call(undefined, id, change);
          executedCount += 1;
        }
      }
    }

    return {
      hookName: "watchChange",
      pluginCount: plugins.length,
      executedCount,
    };
  }

  /**
   * Fire the closeWatcher hook across all plugins.
   * Called when the watcher is shutting down. Marks this executor as closed.
   *
   * @returns Result with execution metadata
   * @throws Error if already closed
   */
  async closeWatcher(): Promise<WatchHookResult> {
    if (this._closed) {
      throw Object.assign(
        new Error("Cannot fire closeWatcher: watcher is already closed"),
        { code: ALREADY_CLOSED },
      );
    }

    const plugins = this._driver.getPlugins();
    let executedCount = 0;

    for (const plugin of plugins) {
      const hook = (plugin as unknown as Record<string, unknown>)[
        "closeWatcher"
      ];
      if (hook !== undefined && hook !== null) {
        const handler = extractHandler(hook);
        if (typeof handler === "function") {
          await (handler as CloseWatcherHandler).call(undefined);
          executedCount += 1;
        }
      }
    }

    this._closed = true;

    return {
      hookName: "closeWatcher",
      pluginCount: plugins.length,
      executedCount,
    };
  }
}

/** Handler type for watchChange hook. */
type WatchChangeHandler = (
  id: string,
  change: WatchChangeEvent,
) => unknown | Promise<unknown>;

/** Handler type for closeWatcher hook. */
type CloseWatcherHandler = () => unknown | Promise<unknown>;

/**
 * Extract the handler function from an ObjectHook value.
 * ObjectHook can be a plain function or { handler, order }.
 */
const extractHandler = (hook: unknown): unknown => {
  if (
    hook !== null &&
    hook !== undefined &&
    typeof hook === "object" &&
    "handler" in (hook as Record<string, unknown>)
  ) {
    return (hook as { readonly handler: unknown }).handler;
  }
  return hook;
};
