/**
 * @module plugins/transform-context
 * @description TransformPluginContext implementation for steamroller.
 * Extends PluginContext with getCombinedSourcemap() which returns the
 * composed source map of all previous transforms in the chain.
 */

import type { ExistingDecodedSourceMap, SourceMapSegment } from "../types.js";
import type { DecodedSourceMap } from "../sourcemap/compose.js";
import { composeSourceMaps } from "../sourcemap/compose.js";
import { PluginContextImpl } from "./plugin-context.js";
import type { PluginContextConfig } from "./plugin-context.js";

/** Configuration for creating a TransformPluginContextImpl. */
export interface TransformContextConfig extends PluginContextConfig {
  readonly filename: string;
  readonly originalCode: string;
  readonly originalSourcemap?: ExistingDecodedSourceMap | null;
}

/**
 * Convert an ExistingDecodedSourceMap (with SourceMapSegment tuples) to
 * a DecodedSourceMap (with plain number arrays) for composition.
 */
export const toDecodedSourceMap = (
  map: ExistingDecodedSourceMap,
): DecodedSourceMap => {
  const mappings: Array<Array<Array<number>>> = [];
  for (let lineIdx = 0; lineIdx < map.mappings.length; lineIdx++) {
    const line = map.mappings[lineIdx];
    const decodedLine: Array<Array<number>> = [];
    for (let segIdx = 0; segIdx < line.length; segIdx++) {
      const segment = line[segIdx];
      decodedLine.push([...(segment as ReadonlyArray<number>)]);
    }
    mappings.push(decodedLine);
  }
  return {
    version: 3,
    sources: [...map.sources],
    sourcesContent: map.sourcesContent ? [...map.sourcesContent] : undefined,
    names: [...map.names],
    mappings,
  };
};

/**
 * Convert a DecodedSourceMap back to ExistingDecodedSourceMap format.
 */
export const toExistingDecodedSourceMap = (
  map: DecodedSourceMap,
): ExistingDecodedSourceMap => {
  const mappings: Array<Array<SourceMapSegment>> = [];
  for (let lineIdx = 0; lineIdx < map.mappings.length; lineIdx++) {
    const line = map.mappings[lineIdx];
    const segmentLine: Array<SourceMapSegment> = [];
    for (let segIdx = 0; segIdx < line.length; segIdx++) {
      const seg = line[segIdx];
      segmentLine.push(seg as unknown as SourceMapSegment);
    }
    mappings.push(segmentLine);
  }
  return {
    version: 3,
    sources: [...map.sources],
    sourcesContent: map.sourcesContent ? [...map.sourcesContent] : undefined,
    names: [...map.names],
    mappings,
  };
};

/**
 * Create an identity source map for a given source file.
 * Maps each line/column 1:1 back to itself.
 */
export const createIdentitySourceMap = (
  filename: string,
  code: string,
): ExistingDecodedSourceMap => {
  const lines = code.split("\n");
  const mappings: Array<Array<SourceMapSegment>> = [];
  for (let i = 0; i < lines.length; i++) {
    const segment: SourceMapSegment = [0, 0, i, 0];
    mappings.push([segment]);
  }
  return {
    version: 3,
    sources: [filename],
    sourcesContent: [code],
    names: [],
    mappings,
  };
};

/**
 * TransformPluginContext extends PluginContext with source map composition.
 * Maintains a stack of source maps from sequential transform calls and
 * provides getCombinedSourcemap() to get the composed result.
 */
export class TransformPluginContextImpl extends PluginContextImpl {
  private readonly _sourceMaps: Array<ExistingDecodedSourceMap> = [];
  private readonly _filename: string;
  private readonly _originalCode: string;
  private readonly _originalSourcemap: ExistingDecodedSourceMap | null;

  constructor(config: TransformContextConfig) {
    super(config);
    this._filename = config.filename;
    this._originalCode = config.originalCode;
    this._originalSourcemap = config.originalSourcemap ?? null;
  }

  /**
   * Add a source map from a completed transform to the stack.
   *
   * @param map - The source map produced by a transform
   */
  addSourceMap(map: ExistingDecodedSourceMap): void {
    this._sourceMaps.push(map);
  }

  /** Get the number of source maps in the stack. */
  getSourceMapCount(): number {
    return this._sourceMaps.length;
  }

  /**
   * Get the combined source map of all previous transforms.
   * If no transforms have produced source maps, returns an identity map.
   * Composes all maps in order, optionally starting from the original sourcemap.
   */
  getCombinedSourcemap(): ExistingDecodedSourceMap {
    if (this._sourceMaps.length === 0) {
      if (this._originalSourcemap !== null) {
        return this._originalSourcemap;
      }
      return createIdentitySourceMap(this._filename, this._originalCode);
    }

    let composed: DecodedSourceMap;

    if (this._originalSourcemap !== null) {
      composed = toDecodedSourceMap(this._originalSourcemap);
    } else {
      composed = toDecodedSourceMap(
        createIdentitySourceMap(this._filename, this._originalCode),
      );
    }

    for (let i = 0; i < this._sourceMaps.length; i++) {
      const nextMap = toDecodedSourceMap(this._sourceMaps[i]);
      composed = composeSourceMaps(composed, nextMap);
    }

    return toExistingDecodedSourceMap(composed);
  }
}
