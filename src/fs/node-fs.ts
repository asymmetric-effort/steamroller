/**
 * @module fs/node-fs
 * @description Default Node.js filesystem adapter implementing the FsModule
 * interface. Wraps `node:fs/promises` operations for use by the bundler.
 */

import { readFile, readdir, realpath, stat as fsStat } from "node:fs/promises";
import type { FsModule, FsStats } from "./types.js";

/**
 * Creates a filesystem module backed by Node.js `fs/promises`.
 * This is the default adapter used when no custom filesystem is provided.
 *
 * @returns A complete FsModule implementation using the real filesystem.
 */
export const createNodeFs = (): FsModule => ({
  readFile: (path: string, encoding: "utf-8"): Promise<string> =>
    readFile(path, { encoding }),

  readdir: (path: string): Promise<ReadonlyArray<string>> => readdir(path),

  realpath: (path: string): Promise<string> => realpath(path),

  stat: async (path: string): Promise<FsStats> => {
    const stats = await fsStat(path);
    return {
      isDirectory: (): boolean => stats.isDirectory(),
      isFile: (): boolean => stats.isFile(),
      isSymbolicLink: (): boolean => stats.isSymbolicLink(),
    };
  },
});
