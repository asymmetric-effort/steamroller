/**
 * Secondary entry point: source map utilities.
 *
 * @module sourcemap
 */
export {
  composeSourceMaps,
  composeMultipleMaps,
  decodeSourceMap,
  encodeSourceMap,
} from "./sourcemap/compose.js";
export type { DecodedSourceMap, RawSourceMap } from "./sourcemap/compose.js";
export {
  encodeVlq,
  decodeVlq,
  encodeSegment,
  decodeMappings,
  encodeMappings,
} from "./sourcemap/vlq.js";
export { MagicString } from "./sourcemap/magic-string.js";
export type { Chunk, SourceMapData } from "./sourcemap/magic-string.js";
