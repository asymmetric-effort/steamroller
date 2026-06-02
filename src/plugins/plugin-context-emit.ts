/**
 * @module plugins/plugin-context-emit
 * @description File emission and logging APIs for the plugin context.
 * Implements emitFile, getFileName, setAssetSource, error, warn, info,
 * debug, and the per-plugin cache (PluginCache).
 */

import type {
  EmittedFile,
  EmittedAsset,
  EmittedChunk,
  EmittedPrebuiltChunk,
  PluginCache,
  RollupLog,
  LogLevel,
} from "../types.js";
import {
  ANONYMOUS_PLUGIN_CACHE,
  ASSET_NOT_FOUND,
  INVALID_SETASSETSOURCE,
  PLUGIN_ERROR,
} from "../utils/error-codes.js";

/** Internal representation of an emitted file with its reference ID. */
export interface EmittedFileEntry {
  readonly referenceId: string;
  readonly type: "asset" | "chunk" | "prebuilt-chunk";
  readonly name?: string;
  readonly fileName?: string;
  source?: string | Uint8Array;
  readonly code?: string;
  readonly id?: string;
}

/** A log entry captured by the logging system. */
export interface LogEntry {
  readonly level: LogLevel | "error";
  readonly log: RollupLog;
  readonly plugin?: string;
}

/** Configuration for the FileEmitter. */
export interface FileEmitterConfig {
  readonly pluginName: string;
  readonly onLog?: (entry: LogEntry) => void;
}

/**
 * FileEmitter manages file emission during the build.
 * Generates unique reference IDs, stores emitted files, and
 * supports updating asset sources after initial emission.
 */
export class FileEmitter {
  private readonly _files: Map<string, EmittedFileEntry> = new Map();
  private readonly _pluginName: string;
  private readonly _onLog: (entry: LogEntry) => void;
  private _nextId: number = 1;

  constructor(config: FileEmitterConfig) {
    this._pluginName = config.pluginName;
    this._onLog = config.onLog ?? (() => undefined);
  }

  /**
   * Emit a file (asset, chunk, or prebuilt chunk).
   * Returns a unique reference ID for later retrieval.
   *
   * @param emittedFile - The file descriptor to emit
   * @returns A unique reference ID string
   */
  emitFile(emittedFile: EmittedFile): string {
    const referenceId = this._generateId();

    if (emittedFile.type === "asset") {
      const asset = emittedFile as EmittedAsset;
      const entry: EmittedFileEntry = {
        referenceId,
        type: "asset",
        name: asset.name,
        fileName: asset.fileName,
        source: asset.source,
      };
      this._files.set(referenceId, entry);
    } else if (emittedFile.type === "chunk") {
      const chunk = emittedFile as EmittedChunk;
      const entry: EmittedFileEntry = {
        referenceId,
        type: "chunk",
        name: chunk.name,
        fileName: chunk.fileName,
        id: chunk.id,
      };
      this._files.set(referenceId, entry);
    } else if (emittedFile.type === "prebuilt-chunk") {
      const prebuilt = emittedFile as EmittedPrebuiltChunk;
      const entry: EmittedFileEntry = {
        referenceId,
        type: "prebuilt-chunk",
        fileName: prebuilt.fileName,
        code: prebuilt.code,
      };
      this._files.set(referenceId, entry);
    }

    return referenceId;
  }

  /**
   * Get the final file name for an emitted file by reference ID.
   * Returns the explicit fileName if set, otherwise generates
   * a name from the name property or uses the reference ID.
   *
   * @param referenceId - The reference ID returned by emitFile
   * @returns The resolved file name
   * @throws Error if referenceId is not found
   */
  getFileName(referenceId: string): string {
    const entry = this._files.get(referenceId);
    if (!entry) {
      throw Object.assign(
        new Error(
          `File reference "${referenceId}" not found. ` +
            `Make sure the file was emitted first.`,
        ),
        { code: ASSET_NOT_FOUND },
      );
    }
    if (entry.fileName) {
      return entry.fileName;
    }
    if (entry.name) {
      return `assets/${entry.name}`;
    }
    return `assets/${referenceId}`;
  }

  /**
   * Set or update the source content of an emitted asset.
   *
   * @param referenceId - The reference ID of the asset
   * @param source - The new source content
   * @throws Error if referenceId is not found or not an asset
   */
  setAssetSource(referenceId: string, source: string | Uint8Array): void {
    const entry = this._files.get(referenceId);
    if (!entry) {
      throw Object.assign(
        new Error(
          `File reference "${referenceId}" not found. ` +
            `Make sure the file was emitted first.`,
        ),
        { code: ASSET_NOT_FOUND },
      );
    }
    if (entry.type !== "asset") {
      throw Object.assign(
        new Error(
          `Cannot set source for "${referenceId}": only assets support setAssetSource.`,
        ),
        { code: INVALID_SETASSETSOURCE },
      );
    }
    (entry as { source: string | Uint8Array }).source = source;
  }

  /**
   * Throw a plugin error that never returns.
   * Attaches plugin name to the error for diagnostics.
   *
   * @param error - Error message or structured log
   * @throws Always throws
   */
  error(error: RollupLog | string): never {
    const msg = typeof error === "string" ? error : error.message;
    const err = new Error(msg);
    (err as unknown as Record<string, unknown>)["plugin"] = this._pluginName;
    (err as unknown as Record<string, unknown>)["code"] =
      typeof error === "string"
        ? "PLUGIN_ERROR"
        : (error.code ?? "PLUGIN_ERROR");
    throw err;
  }

  /**
   * Emit a warning log entry.
   *
   * @param warning - The warning message or structured log
   */
  warn(warning: RollupLog | string | (() => RollupLog | string)): void {
    const resolved = typeof warning === "function" ? warning() : warning;
    const log: RollupLog =
      typeof resolved === "string" ? { message: resolved } : resolved;
    this._onLog({ level: "warn", log, plugin: this._pluginName });
  }

  /**
   * Emit an info log entry.
   *
   * @param message - The info message or structured log
   */
  info(message: RollupLog | string | (() => RollupLog | string)): void {
    const resolved = typeof message === "function" ? message() : message;
    const log: RollupLog =
      typeof resolved === "string" ? { message: resolved } : resolved;
    this._onLog({ level: "info", log, plugin: this._pluginName });
  }

  /**
   * Emit a debug log entry.
   *
   * @param message - The debug message or structured log
   */
  debug(message: RollupLog | string | (() => RollupLog | string)): void {
    const resolved = typeof message === "function" ? message() : message;
    const log: RollupLog =
      typeof resolved === "string" ? { message: resolved } : resolved;
    this._onLog({ level: "debug", log, plugin: this._pluginName });
  }

  /** Get all emitted file entries (for testing/inspection). */
  getEmittedFiles(): ReadonlyArray<EmittedFileEntry> {
    return [...this._files.values()];
  }

  /** Generate a unique reference ID. */
  private _generateId(): string {
    const id = `file_ref_${this._nextId}`;
    this._nextId += 1;
    return id;
  }
}

/**
 * Create a PluginCache instance backed by a Map.
 * Provides get, set, has, and delete operations.
 *
 * @returns A new PluginCache instance
 */
export const createPluginCache = (): PluginCache => {
  const store: Map<string, unknown> = new Map();
  return {
    get: <T = unknown>(id: string): T => {
      if (!store.has(id)) {
        throw Object.assign(
          new Error(
            `No cache entry found for "${id}". Use has() to check first.`,
          ),
          { code: ANONYMOUS_PLUGIN_CACHE },
        );
      }
      return store.get(id) as T;
    },
    set: <T = unknown>(id: string, value: T): void => {
      store.set(id, value);
    },
    has: (id: string): boolean => store.has(id),
    delete: (id: string): boolean => store.delete(id),
  };
};
