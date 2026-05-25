/**
 * Snapshot update utility.
 *
 * Reads fixture files, processes them through a transform function,
 * and writes the output to .snap files for later comparison.
 *
 * @module tests/snapshots/update
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename, extname } from "node:path";

/** Options for the snapshot update process. */
export interface UpdateSnapshotOptions {
  readonly fixtureDir: string;
  readonly snapshotDir: string;
  readonly transform: (input: string, filename: string) => string;
  readonly extension?: string;
}

/**
 * Update snapshot files from fixtures.
 *
 * Reads all files with the given extension from fixtureDir,
 * runs each through the transform function, and writes results
 * to snapshotDir as .snap files.
 *
 * @param options - Configuration for the update process.
 * @returns An array of updated snapshot file paths.
 */
export const updateSnapshots = (options: UpdateSnapshotOptions): string[] => {
  const ext = options.extension ?? ".js";
  mkdirSync(options.snapshotDir, { recursive: true });

  const fixtures = readdirSync(options.fixtureDir).filter((f) =>
    f.endsWith(ext),
  );
  const updated: string[] = [];

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const inputPath = join(options.fixtureDir, fixture);
    const content = readFileSync(inputPath, "utf-8");
    const output = options.transform(content, fixture);
    const snapName = basename(fixture, extname(fixture)) + ".snap";
    const snapPath = join(options.snapshotDir, snapName);
    writeFileSync(snapPath, output, "utf-8");
    updated.push(snapPath);
  }

  return updated;
};

/**
 * Update a single snapshot from inline content.
 *
 * @param snapshotPath - Path to write the snapshot file.
 * @param content - The snapshot content to write.
 */
export const updateSingleSnapshot = (
  snapshotPath: string,
  content: string,
): void => {
  writeFileSync(snapshotPath, content, "utf-8");
};
