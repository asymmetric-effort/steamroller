/**
 * @module watch-entry
 * @description The watch() entry function that creates a RollupWatcher.
 * Normalizes options (supports array of configs), delegates to
 * RollupWatcherImpl for real builds, file watching, and incremental rebuilds.
 */

import type {
  RollupOptions,
  RollupWatcher,
  RollupWatcherEvent,
  ChangeEvent,
} from "./types.js";
import {
  RollupWatcherImpl,
  type RollupWatcherOptions,
} from "./watch/watcher.js";

/** Listener types for the watcher. */
type EventListener = (event: RollupWatcherEvent) => void;
type ChangeListener = (
  id: string,
  change: { readonly event: ChangeEvent },
) => void;
type SimpleListener = () => void;

/**
 * Converts a RollupOptions config into RollupWatcherOptions
 * suitable for constructing a RollupWatcherImpl.
 *
 * @param config - A single RollupOptions config
 * @returns RollupWatcherOptions for the watcher
 */
const toWatcherOptions = (config: RollupOptions): RollupWatcherOptions => ({
  input: config,
  output: config.output,
  buildDelay: 50,
  clearScreen: false,
});

/**
 * Creates an adapter around one or more RollupWatcherImpl instances
 * that conforms to the RollupWatcher interface. Each config gets its
 * own RollupWatcherImpl. The adapter fans out listener registration
 * and close() to all underlying watchers.
 *
 * @param configs - Normalized array of RollupOptions
 * @returns A RollupWatcher that delegates to real build watchers
 */
const createWatcherAdapter = (
  configs: ReadonlyArray<RollupOptions>,
): RollupWatcher => {
  const impls: Array<RollupWatcherImpl> = [];
  for (let i = 0; i < configs.length; i++) {
    impls.push(new RollupWatcherImpl(toWatcherOptions(configs[i])));
  }

  const watcher: RollupWatcher = {
    close: (): void => {
      for (let i = 0; i < impls.length; i++) {
        impls[i].close();
      }
    },
    on: ((
      event: string,
      listener: EventListener | ChangeListener | SimpleListener,
    ): RollupWatcher => {
      for (let i = 0; i < impls.length; i++) {
        if (event === "event") {
          impls[i].on("event", listener as EventListener);
        } else if (event === "change") {
          impls[i].on("change", listener as ChangeListener);
        } else if (event === "restart") {
          impls[i].on("restart", listener as SimpleListener);
        } else if (event === "close") {
          impls[i].on("close", listener as SimpleListener);
        }
      }
      return watcher;
    }) as RollupWatcher["on"],
  };

  // Kick off initial builds asynchronously so listeners registered
  // right after watch() can observe the first build events.
  Promise.resolve().then(() => {
    for (let i = 0; i < impls.length; i++) {
      if (!impls[i].isClosed) {
        void impls[i].start();
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
 * 2. Create RollupWatcherImpl instances for each config
 * 3. Start watching and building
 * 4. Return a unified watcher adapter
 *
 * @param rawOptions - A single RollupOptions or array of RollupOptions.
 * @returns A RollupWatcher instance.
 */
export const watch = (
  rawOptions: RollupOptions | ReadonlyArray<RollupOptions>,
): RollupWatcher => {
  const configs: ReadonlyArray<RollupOptions> = Array.isArray(rawOptions)
    ? rawOptions
    : [rawOptions];

  return createWatcherAdapter(configs);
};
