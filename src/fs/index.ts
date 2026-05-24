/**
 * @module fs
 * @description Filesystem abstraction layer for steamroller.
 * Re-exports types and the default Node.js adapter.
 */

export type { FsDirectoryEntry, FsModule, FsStats } from "./types.js";
export { createNodeFs } from "./node-fs.js";
