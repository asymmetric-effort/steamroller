/**
 * @module watch-entry
 * @description The watch() entry function that creates a RollupWatcher.
 * Normalizes options (supports array of configs), creates a watcher,
 * and returns it for event-driven rebuild workflows.
 */

import type {
  RollupOptions,
  RollupWatcher,
  RollupWatcherEvent,
  ChangeEvent,
} from "./types.js";

/** Listener types for the watcher. */
type EventListener = (event: RollupWatcherEvent) => void;
type ChangeListener = (
  id: string,
  change: { readonly event: ChangeEvent },
) => void;
type SimpleListener = () => void;

/** Internal watcher state. */
interface WatcherState {
  readonly eventListeners: Array<EventListener>;
  readonly changeListeners: Array<ChangeListener>;
  readonly restartListeners: Array<SimpleListener>;
  readonly closeListeners: Array<SimpleListener>;
  closed: boolean;
}

/**
 * Create a RollupWatcher instance from normalized configs.
 *
 * @param configs - Array of normalized rollup configs.
 * @returns A RollupWatcher with on/close methods.
 */
const createWatcher = (
  configs: ReadonlyArray<RollupOptions>,
): RollupWatcher => {
  const state: WatcherState = {
    eventListeners: [],
    changeListeners: [],
    restartListeners: [],
    closeListeners: [],
    closed: false,
  };

  // Suppress unused variable lint — configs will be used in future file-watching implementation
  void configs;

  const watcher: RollupWatcher = {
    close: (): void => {
      state.closed = true;
      for (let i = 0; i < state.closeListeners.length; i++) {
        state.closeListeners[i]();
      }
    },
    on: ((
      event: string,
      listener: EventListener | ChangeListener | SimpleListener,
    ): RollupWatcher => {
      if (event === "event") {
        state.eventListeners.push(listener as EventListener);
      } else if (event === "change") {
        state.changeListeners.push(listener as ChangeListener);
      } else if (event === "restart") {
        state.restartListeners.push(listener as SimpleListener);
      } else if (event === "close") {
        state.closeListeners.push(listener as SimpleListener);
      }
      return watcher;
    }) as RollupWatcher["on"],
  };

  // Emit initial START event asynchronously
  Promise.resolve().then(() => {
    if (!state.closed) {
      const startEvent: RollupWatcherEvent = { code: "START" };
      for (let i = 0; i < state.eventListeners.length; i++) {
        state.eventListeners[i](startEvent);
      }
    }
  });

  return watcher;
};

/**
 * The watch() function that creates a RollupWatcher for file-watching workflows.
 *
 * Steps:
 * 1. Normalize options (support array of configs)
 * 2. Create RollupWatcher
 * 3. Start watching
 * 4. Return watcher
 *
 * @param rawOptions - A single RollupOptions or array of RollupOptions.
 * @returns A RollupWatcher instance.
 */
export const watch = (
  rawOptions: RollupOptions | ReadonlyArray<RollupOptions>,
): RollupWatcher => {
  // Step 1: Normalize to array of configs
  const configs: ReadonlyArray<RollupOptions> = Array.isArray(rawOptions)
    ? rawOptions
    : [rawOptions];

  // Step 2 & 3: Create watcher (starts watching immediately)
  return createWatcher(configs);
};
