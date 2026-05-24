/**
 * @module fs/types
 * @description Filesystem abstraction types for steamroller.
 * Provides interfaces for virtual filesystem operations that can be
 * overridden by plugins for custom file access patterns.
 */

/**
 * File stat information returned by the filesystem abstraction.
 * Mirrors the subset of node:fs Stats used by the bundler.
 */
export interface FsStats {
  readonly isDirectory: () => boolean;
  readonly isFile: () => boolean;
  readonly isSymbolicLink: () => boolean;
}

/**
 * Directory entry returned when listing directory contents.
 * Provides both the entry name and type-checking methods.
 */
export interface FsDirectoryEntry {
  readonly isDirectory: () => boolean;
  readonly isFile: () => boolean;
  readonly name: string;
}

/**
 * Virtual filesystem module interface for custom file access.
 * Provides the minimal set of filesystem operations needed by the bundler.
 * Only `readFile` is required; all other methods are optional and will
 * fall back to defaults if not provided.
 */
export interface FsModule {
  readonly readFile: (path: string, encoding: "utf-8") => Promise<string>;
  readonly readdir?: (path: string) => Promise<ReadonlyArray<string>>;
  readonly realpath?: (path: string) => Promise<string>;
  readonly stat?: (path: string) => Promise<FsStats>;
}
