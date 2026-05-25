/**
 * @module watch/cli-hooks
 * @description CLI hook execution for watch mode.
 * Provides non-blocking shell command execution at various build lifecycle
 * points: start, bundle end, end, and error.
 */

import { exec, type ChildProcess } from "node:child_process";

/**
 * Configuration for watch mode CLI hooks.
 */
export interface WatchHooksConfig {
  /** Command to run when a build starts. */
  readonly onStart?: string;
  /** Command to run when a bundle completes. */
  readonly onBundleEnd?: string;
  /** Command to run when all bundles complete. */
  readonly onEnd?: string;
  /** Command to run on build error. */
  readonly onError?: string;
}

/**
 * Result of a hook execution.
 */
export interface HookExecutionResult {
  /** The spawned child process. */
  readonly process: ChildProcess;
  /** The command that was executed. */
  readonly command: string;
}

/**
 * Listener for hook execution events.
 */
export type HookErrorListener = (error: Error, command: string) => void;

/**
 * Executes a shell command non-blocking.
 * The command runs in a child process and does not block the event loop.
 * Errors are reported via the optional error listener.
 *
 * @param command - Shell command to execute
 * @param onError - Optional error handler
 * @returns The execution result with child process reference
 */
export const executeWatchHook = (
  command: string,
  onError?: HookErrorListener,
): HookExecutionResult => {
  const childProcess = exec(command, (error) => {
    if (error && onError) {
      onError(error, command);
    }
  });

  return {
    process: childProcess,
    command,
  };
};

/**
 * Manages watch mode CLI hooks.
 * Executes configured shell commands at build lifecycle points.
 */
export class WatchHooks {
  private readonly config: WatchHooksConfig;
  private readonly errorListener: HookErrorListener | undefined;

  /**
   * Creates a new WatchHooks instance.
   *
   * @param config - Hook configuration with commands for each lifecycle event
   * @param onError - Optional listener for hook execution errors
   */
  constructor(config: WatchHooksConfig, onError?: HookErrorListener) {
    this.config = config;
    this.errorListener = onError;
  }

  /**
   * Executes the onStart hook if configured.
   *
   * @returns The execution result, or undefined if no hook is configured
   */
  start(): HookExecutionResult | undefined {
    if (!this.config.onStart) {
      return undefined;
    }
    return executeWatchHook(this.config.onStart, this.errorListener);
  }

  /**
   * Executes the onBundleEnd hook if configured.
   *
   * @returns The execution result, or undefined if no hook is configured
   */
  bundleEnd(): HookExecutionResult | undefined {
    if (!this.config.onBundleEnd) {
      return undefined;
    }
    return executeWatchHook(this.config.onBundleEnd, this.errorListener);
  }

  /**
   * Executes the onEnd hook if configured.
   *
   * @returns The execution result, or undefined if no hook is configured
   */
  end(): HookExecutionResult | undefined {
    if (!this.config.onEnd) {
      return undefined;
    }
    return executeWatchHook(this.config.onEnd, this.errorListener);
  }

  /**
   * Executes the onError hook if configured.
   *
   * @returns The execution result, or undefined if no hook is configured
   */
  error(): HookExecutionResult | undefined {
    if (!this.config.onError) {
      return undefined;
    }
    return executeWatchHook(this.config.onError, this.errorListener);
  }
}
