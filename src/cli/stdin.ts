/**
 * Stdin reading, environment variable parsing, force exit, and
 * bundle input waiting utilities for CLI support.
 *
 * @module cli/stdin
 */

import { stat } from "node:fs/promises";

/** Maximum time (ms) to wait for stdin before timing out. */
const STDIN_TIMEOUT_MS = 30_000;

/**
 * Read source code from stdin (piped input).
 * Used when --stdin flag is set or input is "-".
 *
 * @returns The complete stdin content as a string
 */
export const readStdin = (): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    const chunks: string[] = [];
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for stdin input"));
    }, STDIN_TIMEOUT_MS);

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      chunks.push(chunk);
    });
    process.stdin.on("end", () => {
      clearTimeout(timeout);
      resolve(chunks.join(""));
    });
    process.stdin.on("error", (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });
    process.stdin.resume();
  });
};

/**
 * Force process exit after a delay. Used with --forceExit flag
 * to ensure the process terminates even if handles remain open.
 *
 * @param delayMs - Milliseconds to wait before forcing exit
 */
export const handleForceExit = (delayMs: number): void => {
  const timer = setTimeout(() => {
    process.exit(0);
  }, delayMs);
  /* Unref so the timer doesn't keep the event loop alive by itself */
  if (timer && typeof timer === "object" && "unref" in timer) {
    (timer as { unref: () => void }).unref();
  }
};

/**
 * Wait for all input files to exist on disk.
 * Polls every 500ms until all files are found or max attempts reached.
 * Used with --waitForBundleInput flag.
 *
 * @param inputs - Array of file paths to wait for
 * @param maxAttempts - Maximum poll attempts (default 100 = ~50s)
 * @returns True when all files exist, false if timed out
 */
export const handleWaitForBundleInput = async (
  inputs: ReadonlyArray<string>,
  maxAttempts: number = 100,
): Promise<boolean> => {
  const POLL_INTERVAL_MS = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let allExist = true;
    for (const input of inputs) {
      try {
        const stats = await stat(input);
        if (!stats.isFile()) {
          allExist = false;
          break;
        }
      } catch {
        allExist = false;
        break;
      }
    }
    if (allExist) {
      return true;
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
};

/**
 * Parse KEY=value pairs from an environment string and set them
 * on process.env. Multiple pairs are separated by commas.
 *
 * @param envString - Comma-separated KEY=value pairs
 */
export const handleEnvironment = (envString: string): void => {
  if (envString === "") {
    return;
  }
  const pairs = envString.split(",");
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) {
      /* KEY with no value sets it to "true" */
      process.env[pair.trim()] = "true";
    } else {
      const key = pair.slice(0, eqIndex).trim();
      const value = pair.slice(eqIndex + 1).trim();
      process.env[key] = value;
    }
  }
};
