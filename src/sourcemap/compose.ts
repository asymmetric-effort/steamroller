/**
 * Source map composition for multi-transform pipelines.
 *
 * When multiple transforms are applied (e.g., plugin transforms), their
 * source maps must be composed/remapped to trace back to the original source.
 *
 * @module sourcemap/compose
 */

import { decodeMappings, encodeMappings } from "./vlq.js";

/**
 * A decoded source map with structured numeric mappings.
 */
export interface DecodedSourceMap {
  readonly version: 3;
  readonly sources: ReadonlyArray<string>;
  readonly sourcesContent?: ReadonlyArray<string | null>;
  readonly names: ReadonlyArray<string>;
  readonly mappings: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>;
}

/**
 * A raw source map with VLQ-encoded mappings string.
 */
export interface RawSourceMap {
  readonly version: 3;
  readonly sources: ReadonlyArray<string>;
  readonly sourcesContent?: ReadonlyArray<string | null>;
  readonly names: ReadonlyArray<string>;
  readonly mappings: string;
}

/**
 * Decode a raw source map's VLQ mappings into numeric arrays.
 * Converts relative segment values to absolute positions.
 */
export const decodeSourceMap = (map: RawSourceMap): DecodedSourceMap => {
  const relativeMappings = decodeMappings(map.mappings);
  const absoluteMappings: Array<Array<Array<number>>> = [];

  let prevSourceIndex = 0;
  let prevOriginalLine = 0;
  let prevOriginalColumn = 0;
  let prevNameIndex = 0;

  for (let lineIdx = 0; lineIdx < relativeMappings.length; lineIdx++) {
    const line = relativeMappings[lineIdx];
    const absoluteLine: Array<Array<number>> = [];
    let prevGeneratedColumn = 0;

    for (let segIdx = 0; segIdx < line.length; segIdx++) {
      const segment = line[segIdx];
      const absoluteSegment: Array<number> = [];

      // Generated column (relative within line)
      prevGeneratedColumn += segment[0];
      absoluteSegment.push(prevGeneratedColumn);

      if (segment.length >= 4) {
        // Source index
        prevSourceIndex += segment[1];
        absoluteSegment.push(prevSourceIndex);

        // Original line
        prevOriginalLine += segment[2];
        absoluteSegment.push(prevOriginalLine);

        // Original column
        prevOriginalColumn += segment[3];
        absoluteSegment.push(prevOriginalColumn);

        // Name index (optional 5th field)
        if (segment.length >= 5) {
          prevNameIndex += segment[4];
          absoluteSegment.push(prevNameIndex);
        }
      }

      absoluteLine.push(absoluteSegment);
    }

    absoluteMappings.push(absoluteLine);
  }

  return {
    version: 3,
    sources: map.sources,
    sourcesContent: map.sourcesContent,
    names: map.names,
    mappings: absoluteMappings,
  };
};

/**
 * Encode a decoded source map back to a raw source map with VLQ mappings.
 * Converts absolute positions back to relative segment values.
 */
export const encodeSourceMap = (map: DecodedSourceMap): RawSourceMap => {
  const relativeMappings: Array<Array<Array<number>>> = [];

  let prevSourceIndex = 0;
  let prevOriginalLine = 0;
  let prevOriginalColumn = 0;
  let prevNameIndex = 0;

  for (let lineIdx = 0; lineIdx < map.mappings.length; lineIdx++) {
    const line = map.mappings[lineIdx];
    const relativeLine: Array<Array<number>> = [];
    let prevGeneratedColumn = 0;

    for (let segIdx = 0; segIdx < line.length; segIdx++) {
      const segment = line[segIdx];
      const relativeSegment: Array<number> = [];

      // Generated column (relative within line)
      relativeSegment.push(segment[0] - prevGeneratedColumn);
      prevGeneratedColumn = segment[0];

      if (segment.length >= 4) {
        // Source index
        relativeSegment.push(segment[1] - prevSourceIndex);
        prevSourceIndex = segment[1];

        // Original line
        relativeSegment.push(segment[2] - prevOriginalLine);
        prevOriginalLine = segment[2];

        // Original column
        relativeSegment.push(segment[3] - prevOriginalColumn);
        prevOriginalColumn = segment[3];

        // Name index (optional 5th field)
        if (segment.length >= 5) {
          relativeSegment.push(segment[4] - prevNameIndex);
          prevNameIndex = segment[4];
        }
      }

      relativeLine.push(relativeSegment);
    }

    relativeMappings.push(relativeLine);
  }

  return {
    version: 3,
    sources: map.sources,
    sourcesContent: map.sourcesContent,
    names: map.names,
    mappings: encodeMappings(relativeMappings),
  };
};

/**
 * Binary search for the last segment in a line whose generated column
 * is less than or equal to the target column.
 */
const findSegmentForColumn = (
  segments: ReadonlyArray<ReadonlyArray<number>>,
  targetColumn: number,
): ReadonlyArray<number> | null => {
  let low = 0;
  let high = segments.length - 1;
  let result: ReadonlyArray<number> | null = null;

  for (; low <= high;) {
    const mid = (low + high) >>> 1;
    const midColumn = segments[mid][0];

    if (midColumn <= targetColumn) {
      result = segments[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result;
};

/**
 * Compose/remap two source maps: if transform A produces mapA and
 * transform B (applied to A's output) produces mapB, the composed map
 * traces from B's output back to A's original input.
 *
 * Both maps must be in decoded (absolute) form.
 */
export const composeSourceMaps = (
  mapA: DecodedSourceMap,
  mapB: DecodedSourceMap,
): DecodedSourceMap => {
  const composedMappings: Array<Array<Array<number>>> = [];
  const composedSources: Array<string> = [...mapA.sources];
  const composedSourcesContent: Array<string | null> = mapA.sourcesContent
    ? [...mapA.sourcesContent]
    : [];
  const composedNames: Array<string> = [...mapA.names];

  // Build name index lookup for mapA
  const nameIndexMap = new Map<string, number>();
  for (let i = 0; i < composedNames.length; i++) {
    nameIndexMap.set(composedNames[i], i);
  }

  for (let lineIdx = 0; lineIdx < mapB.mappings.length; lineIdx++) {
    const lineB = mapB.mappings[lineIdx];
    const composedLine: Array<Array<number>> = [];

    for (let segIdx = 0; segIdx < lineB.length; segIdx++) {
      const segB = lineB[segIdx];

      // Segment with only generated column (no source info)
      if (segB.length < 4) {
        composedLine.push([segB[0]]);
        continue;
      }

      // segB maps to a position in mapA's output
      // segB[1] = source index in mapB (should be 0 for single-source chains)
      // segB[2] = original line in mapA's output
      // segB[3] = original column in mapA's output
      const targetLine = segB[2];
      const targetColumn = segB[3];

      // Look up this position in mapA
      if (targetLine < mapA.mappings.length) {
        const lineA = mapA.mappings[targetLine];
        const segA = findSegmentForColumn(lineA, targetColumn);

        if (segA !== null && segA.length >= 4) {
          // Found the original position in mapA
          const composedSegment: Array<number> = [
            segB[0], // generated column in final output
            segA[1], // source index from mapA
            segA[2], // original line from mapA
            segA[3], // original column from mapA
          ];

          // Prefer name from mapA if available, otherwise from mapB
          if (segA.length >= 5) {
            composedSegment.push(segA[4]);
          } else if (segB.length >= 5) {
            const nameB = mapB.names[segB[4]];
            if (nameB !== undefined) {
              let nameIdx = nameIndexMap.get(nameB);
              if (nameIdx === undefined) {
                nameIdx = composedNames.length;
                composedNames.push(nameB);
                nameIndexMap.set(nameB, nameIdx);
              }
              composedSegment.push(nameIdx);
            }
          }

          composedLine.push(composedSegment);
        } else {
          // No mapping found in mapA; emit segment without source info
          composedLine.push([segB[0]]);
        }
      } else {
        // Target line beyond mapA's range
        composedLine.push([segB[0]]);
      }
    }

    composedMappings.push(composedLine);
  }

  return {
    version: 3,
    sources: composedSources,
    sourcesContent:
      composedSourcesContent.length > 0 ? composedSourcesContent : undefined,
    names: composedNames,
    mappings: composedMappings,
  };
};

/**
 * Compose multiple source maps in order (transforms applied left to right).
 * Filters out null entries. Returns null if no valid maps remain.
 */
export const composeMultipleMaps = (
  maps: ReadonlyArray<DecodedSourceMap | null>,
): DecodedSourceMap | null => {
  const validMaps: Array<DecodedSourceMap> = [];
  for (let i = 0; i < maps.length; i++) {
    const map = maps[i];
    if (map !== null) {
      validMaps.push(map);
    }
  }

  if (validMaps.length === 0) {
    return null;
  }

  let result = validMaps[0];
  for (let i = 1; i < validMaps.length; i++) {
    result = composeSourceMaps(result, validMaps[i]);
  }

  return result;
};
