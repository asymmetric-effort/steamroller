/**
 * Snapshot comparison utility.
 *
 * Compares current transform output against saved snapshot files,
 * reporting mismatches with detailed diff information.
 *
 * @module tests/snapshots/runner
 */

import { readFileSync, existsSync } from "node:fs";

/** Result of a single snapshot comparison. */
export interface SnapshotResult {
  readonly name: string;
  readonly passed: boolean;
  readonly expected: string;
  readonly actual: string;
  readonly diff?: string;
}

/** Summary of a snapshot test run. */
export interface SnapshotRunSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly missing: number;
  readonly results: readonly SnapshotResult[];
}

/**
 * Compare actual output against a saved snapshot.
 *
 * @param snapshotPath - Path to the expected snapshot file.
 * @param actual - The current output to compare.
 * @param name - A descriptive name for reporting.
 * @returns A SnapshotResult indicating pass or fail.
 */
export const compareSnapshot = (
  snapshotPath: string,
  actual: string,
  name: string,
): SnapshotResult => {
  if (!existsSync(snapshotPath)) {
    return {
      name,
      passed: false,
      expected: "",
      actual,
      diff: "Snapshot file does not exist. Run update to create it.",
    };
  }

  const expected = readFileSync(snapshotPath, "utf-8");
  const passed = expected === actual;

  if (passed) {
    return { name, passed: true, expected, actual };
  }

  const diff = generateSimpleDiff(expected, actual);
  return { name, passed: false, expected, actual, diff };
};

/**
 * Generate a simple line-by-line diff between two strings.
 *
 * @param expected - The expected content.
 * @param actual - The actual content.
 * @returns A formatted diff string showing mismatched lines.
 */
export const generateSimpleDiff = (
  expected: string,
  actual: string,
): string => {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const maxLen = Math.max(expectedLines.length, actualLines.length);
  const diffLines: string[] = [];

  for (let i = 0; i < maxLen; i++) {
    const exp = expectedLines[i] ?? "";
    const act = actualLines[i] ?? "";
    if (exp !== act) {
      diffLines.push(`Line ${i + 1}:`);
      diffLines.push(`  - ${exp}`);
      diffLines.push(`  + ${act}`);
    }
  }

  return diffLines.join("\n");
};

/**
 * Run multiple snapshot comparisons and produce a summary.
 *
 * @param comparisons - Array of [snapshotPath, actual, name] tuples.
 * @returns A summary of all comparison results.
 */
export const runSnapshotSuite = (
  comparisons: ReadonlyArray<readonly [string, string, string]>,
): SnapshotRunSummary => {
  const results: SnapshotResult[] = [];
  let passed = 0;
  let failed = 0;
  let missing = 0;

  for (let i = 0; i < comparisons.length; i++) {
    const [snapPath, actual, name] = comparisons[i];
    const result = compareSnapshot(snapPath, actual, name);
    results.push(result);
    if (result.passed) {
      passed++;
    } else if (result.diff?.includes("Snapshot file does not exist") === true) {
      missing++;
    } else {
      failed++;
    }
  }

  return { total: comparisons.length, passed, failed, missing, results };
};
