/**
 * @module plugins/emitted-files
 * @description Full lifecycle management for emitted files in steamroller.
 * Handles assets, chunks, and prebuilt chunks with reference IDs,
 * source management, and name finalization via configurable patterns.
 */

import {
  ASSET_NOT_FOUND,
  ASSET_SOURCE_ALREADY_SET,
  ASSET_SOURCE_MISSING,
  ASSET_NOT_FINALISED,
} from "../utils/error-codes.js";

/** Options for emitting an asset. */
export interface EmitAssetOptions {
  readonly name: string;
  readonly source?: string | Uint8Array;
  readonly fileName?: string;
  readonly needsCodeReference?: boolean;
}

/** Options for emitting a chunk. */
export interface EmitChunkOptions {
  readonly id: string;
  readonly name?: string;
  readonly fileName?: string;
  readonly implicitlyLoadedAfterOneOf?: ReadonlyArray<string>;
}

/** Options for emitting a prebuilt chunk. */
export interface EmitPrebuiltChunkOptions {
  readonly fileName: string;
  readonly code: string;
  readonly map?: string | null;
  readonly exports?: ReadonlyArray<string>;
}

/** The type discriminator for emitted files. */
export type EmittedFileType = "asset" | "chunk" | "prebuilt-chunk";

/** Internal record for a managed emitted file. */
export interface ManagedEmittedFile {
  readonly referenceId: string;
  readonly type: EmittedFileType;
  readonly name?: string;
  readonly fileName?: string;
  readonly id?: string;
  readonly code?: string;
  readonly map?: string | null;
  readonly exports?: ReadonlyArray<string>;
  readonly needsCodeReference?: boolean;
  readonly implicitlyLoadedAfterOneOf?: ReadonlyArray<string>;
  source?: string | Uint8Array;
  finalizedFileName?: string;
  sourceFinalized: boolean;
}

/** Error with a structured code for programmatic handling. */
export class EmittedFileError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "EmittedFileError";
  }
}

/**
 * Compute a simple hash from a string or Uint8Array source.
 * Returns an 8-character hex string.
 */
export const computeHash = (source: string | Uint8Array): string => {
  let hash = 0x811c9dc5; // FNV-1a offset basis
  const data =
    typeof source === "string" ? new TextEncoder().encode(source) : source;

  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193); // FNV-1a prime
    hash = hash >>> 0; // Keep as unsigned 32-bit
  }

  return hash.toString(16).padStart(8, "0");
};

/**
 * Apply a file name pattern, substituting placeholders.
 * Supported placeholders: [name], [hash], [ext], [extname].
 */
export const applyPattern = (
  pattern: string,
  name: string,
  hash: string,
): string => {
  const dotIdx = name.lastIndexOf(".");
  const baseName = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx >= 0 ? name.slice(dotIdx + 1) : "";
  const extname = dotIdx >= 0 ? name.slice(dotIdx) : "";

  let result = pattern;
  result = result.replace(/\[name\]/g, baseName);
  result = result.replace(/\[hash\]/g, hash);
  result = result.replace(/\[ext\]/g, ext);
  result = result.replace(/\[extname\]/g, extname);
  return result;
};

/**
 * EmittedFileManager manages the full lifecycle of emitted files.
 * Provides emission, source setting, finalization, and retrieval.
 */
export class EmittedFileManager {
  private readonly _files: Map<string, ManagedEmittedFile> = new Map();
  private _nextId: number = 1;
  private _finalized: boolean = false;

  /** Whether file names have been finalized. */
  isFinalized(): boolean {
    return this._finalized;
  }

  /** Get the count of emitted files. */
  size(): number {
    return this._files.size;
  }

  /**
   * Emit an asset file. Returns a unique reference ID.
   *
   * @param options - Asset emission options
   * @returns A unique reference ID
   */
  emitAsset(options: EmitAssetOptions): string {
    const referenceId = this._generateId();
    const entry: ManagedEmittedFile = {
      referenceId,
      type: "asset",
      name: options.name,
      fileName: options.fileName,
      source: options.source,
      needsCodeReference: options.needsCodeReference,
      sourceFinalized: options.source !== undefined,
    };
    this._files.set(referenceId, entry);
    return referenceId;
  }

  /**
   * Emit a chunk file. Returns a unique reference ID.
   *
   * @param options - Chunk emission options
   * @returns A unique reference ID
   */
  emitChunk(options: EmitChunkOptions): string {
    const referenceId = this._generateId();
    const entry: ManagedEmittedFile = {
      referenceId,
      type: "chunk",
      id: options.id,
      name: options.name,
      fileName: options.fileName,
      implicitlyLoadedAfterOneOf: options.implicitlyLoadedAfterOneOf,
      sourceFinalized: false,
    };
    this._files.set(referenceId, entry);
    return referenceId;
  }

  /**
   * Emit a prebuilt chunk. Returns a unique reference ID.
   *
   * @param options - Prebuilt chunk emission options
   * @returns A unique reference ID
   */
  emitPrebuiltChunk(options: EmitPrebuiltChunkOptions): string {
    const referenceId = this._generateId();
    const entry: ManagedEmittedFile = {
      referenceId,
      type: "prebuilt-chunk",
      fileName: options.fileName,
      code: options.code,
      map: options.map,
      exports: options.exports,
      sourceFinalized: true,
    };
    this._files.set(referenceId, entry);
    return referenceId;
  }

  /**
   * Set or update the source of an emitted asset.
   *
   * @param refId - The reference ID of the asset
   * @param source - The source content
   * @throws EmittedFileError with ASSET_NOT_FOUND if refId is invalid
   * @throws EmittedFileError with ASSET_SOURCE_ALREADY_SET if source is finalized
   */
  setAssetSource(refId: string, source: string | Uint8Array): void {
    const entry = this._files.get(refId);
    if (!entry) {
      throw new EmittedFileError(
        ASSET_NOT_FOUND,
        `File reference "${refId}" not found`,
      );
    }
    if (entry.type !== "asset") {
      throw new EmittedFileError(
        ASSET_NOT_FOUND,
        `File reference "${refId}" is not an asset`,
      );
    }
    if (entry.sourceFinalized) {
      throw new EmittedFileError(
        ASSET_SOURCE_ALREADY_SET,
        `Source for "${refId}" has already been set and finalized`,
      );
    }
    entry.source = source;
    entry.sourceFinalized = true;
  }

  /**
   * Get the final file name for an emitted file by reference ID.
   *
   * @param refId - The reference ID
   * @returns The finalized file name
   * @throws EmittedFileError with ASSET_NOT_FOUND if refId is invalid
   * @throws EmittedFileError with ASSET_NOT_FINALISED if names not yet finalized
   */
  getFileName(refId: string): string {
    const entry = this._files.get(refId);
    if (!entry) {
      throw new EmittedFileError(
        ASSET_NOT_FOUND,
        `File reference "${refId}" not found`,
      );
    }
    // Explicit fileName always takes priority
    if (entry.fileName) {
      return entry.fileName;
    }
    if (!this._finalized) {
      throw new EmittedFileError(
        ASSET_NOT_FINALISED,
        `File names have not been finalized for "${refId}"`,
      );
    }
    if (entry.finalizedFileName) {
      return entry.finalizedFileName;
    }
    return `assets/${refId}`;
  }

  /**
   * Finalize all file names using the given pattern.
   * Pattern supports [name], [hash], [ext], [extname] placeholders.
   *
   * @param pattern - The naming pattern (e.g., "[name]-[hash].js")
   * @throws EmittedFileError with ASSET_SOURCE_MISSING if an asset has no source
   */
  finalizeFileNames(pattern: string): void {
    const entries = [...this._files.values()];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      // Skip entries with explicit fileName
      if (entry.fileName) {
        continue;
      }

      if (entry.type === "asset") {
        if (entry.source === undefined) {
          throw new EmittedFileError(
            ASSET_SOURCE_MISSING,
            `Asset "${entry.referenceId}" has no source set`,
          );
        }
        const hash = computeHash(entry.source);
        const name = entry.name ?? entry.referenceId;
        entry.finalizedFileName = applyPattern(pattern, name, hash);
      } else if (entry.type === "chunk") {
        const name = entry.name ?? entry.id ?? entry.referenceId;
        const hash = computeHash(name);
        entry.finalizedFileName = applyPattern(pattern, name, hash);
      } else if (entry.type === "prebuilt-chunk") {
        // Prebuilt chunks must have explicit fileName; skip pattern
        entry.finalizedFileName = entry.fileName;
      }
    }
    this._finalized = true;
  }

  /**
   * Get all emitted files for the bundle output.
   *
   * @returns All managed emitted files
   */
  getEmittedFiles(): ReadonlyArray<ManagedEmittedFile> {
    return [...this._files.values()];
  }

  /** Generate a unique reference ID. */
  private _generateId(): string {
    const id = `emitted_${this._nextId}`;
    this._nextId += 1;
    return id;
  }
}
