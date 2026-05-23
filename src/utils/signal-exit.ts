/**
 * Zero-dependency process exit handler with signal handling,
 * cleanup callbacks, and exactly-once execution guarantee.
 *
 * @module signal-exit
 */

/** Callback invoked on process exit or signal. */
export type ExitCallback = (
  code: number | null,
  signal: string | null,
) => void;

/** Maximum number of registered callbacks. */
const MAX_CALLBACKS = 100;

/** Signals we listen for. */
const SIGNALS: ReadonlyArray<NodeJS.Signals> = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/** Mutable internal state stored in a const object. */
const state = {
  /** Registered cleanup callbacks. */
  callbacks: [] as ExitCallback[],
  /** Whether cleanup has already executed. */
  cleanupDone: false,
  /** Whether listeners have been installed on the process. */
  listenersInstalled: false,
};

/**
 * Run all registered callbacks exactly once, then clear the list.
 */
const runCallbacks = (code: number | null, signal: string | null): void => {
  if (state.cleanupDone) {
    return;
  }
  state.cleanupDone = true;

  for (const cb of state.callbacks) {
    cb(code, signal);
  }
  state.callbacks.length = 0;
};

/** Handler for the process 'exit' event. */
const onProcessExit = (code: number): void => {
  runCallbacks(code, null);
};

/** Handler for caught signals. */
const onSignal = (signal: NodeJS.Signals): void => {
  runCallbacks(null, signal);
  process.removeListener(signal, onSignal);
  process.kill(process.pid, signal);
};

/** Install process listeners (idempotent). */
const installListeners = (): void => {
  if (state.listenersInstalled) {
    return;
  }
  state.listenersInstalled = true;

  process.on('exit', onProcessExit);
  for (const sig of SIGNALS) {
    process.on(sig, onSignal);
  }
};

/**
 * Register a callback that fires when the process exits or receives a signal.
 *
 * @param callback - Function called with (code, signal) on exit.
 * @returns A function that unregisters the callback.
 * @throws {Error} If maximum callback limit is reached.
 */
export const onExit = (
  callback: ExitCallback,
): (() => void) => {
  if (state.callbacks.length >= MAX_CALLBACKS) {
    throw new Error(
      `signal-exit: maximum of ${MAX_CALLBACKS} callbacks exceeded`,
    );
  }

  installListeners();
  state.callbacks.push(callback);

  const unregister = (): void => {
    const idx = state.callbacks.indexOf(callback);
    if (idx !== -1) {
      state.callbacks.splice(idx, 1);
    }
  };

  return unregister;
};

/**
 * Reset internal state. Exported only for testing.
 * @internal
 */
export const _resetForTesting = (): void => {
  state.cleanupDone = false;
  state.callbacks.length = 0;
  state.listenersInstalled = false;
  process.removeListener('exit', onProcessExit);
  for (const sig of SIGNALS) {
    process.removeListener(sig, onSignal);
  }
};
