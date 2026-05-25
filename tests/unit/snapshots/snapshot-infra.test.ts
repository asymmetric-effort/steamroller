/**
 * Tests for the snapshot testing infrastructure.
 *
 * Verifies that snapshot comparison detects changes and that
 * snapshot update writes correct files using inline fixtures.
 *
 * @module tests/unit/snapshots/snapshot-infra.test
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  compareSnapshot,
  generateSimpleDiff,
  runSnapshotSuite,
} from "../../snapshots/runner.js";
import {
  updateSnapshots,
  updateSingleSnapshot,
} from "../../snapshots/update.js";

const TEST_DIR = join(tmpdir(), "steamroller-snapshot-test-" + process.pid);
const FIXTURE_DIR = join(TEST_DIR, "fixtures");
const SNAPSHOT_DIR = join(TEST_DIR, "snapshots");

describe("snapshot infrastructure", () => {
  beforeEach(() => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("compareSnapshot", () => {
    it("should pass when actual matches snapshot", () => {
      const snapPath = join(SNAPSHOT_DIR, "match.snap");
      writeFileSync(snapPath, "hello world", "utf-8");

      const result = compareSnapshot(snapPath, "hello world", "match-test");

      expect(result.passed).toBe(true);
      expect(result.name).toBe("match-test");
      expect(result.diff).toBeUndefined();
    });

    it("should fail when actual differs from snapshot", () => {
      const snapPath = join(SNAPSHOT_DIR, "mismatch.snap");
      writeFileSync(snapPath, "expected output", "utf-8");

      const result = compareSnapshot(
        snapPath,
        "actual output",
        "mismatch-test",
      );

      expect(result.passed).toBe(false);
      expect(result.name).toBe("mismatch-test");
      expect(result.diff).toBeDefined();
      expect(result.expected).toBe("expected output");
      expect(result.actual).toBe("actual output");
    });

    it("should report missing snapshot file", () => {
      const snapPath = join(SNAPSHOT_DIR, "nonexistent.snap");

      const result = compareSnapshot(snapPath, "some output", "missing-test");

      expect(result.passed).toBe(false);
      expect(result.diff).toContain("does not exist");
    });

    it("should detect multiline changes", () => {
      const snapPath = join(SNAPSHOT_DIR, "multi.snap");
      writeFileSync(snapPath, "line1\nline2\nline3", "utf-8");

      const result = compareSnapshot(
        snapPath,
        "line1\nchanged\nline3",
        "multiline-test",
      );

      expect(result.passed).toBe(false);
      expect(result.diff).toContain("line2");
      expect(result.diff).toContain("changed");
    });

    it("should handle empty strings", () => {
      const snapPath = join(SNAPSHOT_DIR, "empty.snap");
      writeFileSync(snapPath, "", "utf-8");

      const result = compareSnapshot(snapPath, "", "empty-test");

      expect(result.passed).toBe(true);
    });
  });

  describe("generateSimpleDiff", () => {
    it("should show no diff for identical strings", () => {
      const diff = generateSimpleDiff("same", "same");
      expect(diff).toBe("");
    });

    it("should show changed lines", () => {
      const diff = generateSimpleDiff("old line", "new line");
      expect(diff).toContain("- old line");
      expect(diff).toContain("+ new line");
    });

    it("should handle added lines", () => {
      const diff = generateSimpleDiff("line1", "line1\nline2");
      expect(diff).toContain("Line 2:");
      expect(diff).toContain("+ line2");
    });

    it("should handle removed lines", () => {
      const diff = generateSimpleDiff("line1\nline2", "line1");
      expect(diff).toContain("Line 2:");
      expect(diff).toContain("- line2");
    });
  });

  describe("runSnapshotSuite", () => {
    it("should summarize multiple comparisons", () => {
      const snap1 = join(SNAPSHOT_DIR, "pass.snap");
      const snap2 = join(SNAPSHOT_DIR, "fail.snap");
      writeFileSync(snap1, "correct", "utf-8");
      writeFileSync(snap2, "expected", "utf-8");

      const summary = runSnapshotSuite([
        [snap1, "correct", "passing"],
        [snap2, "wrong", "failing"],
      ]);

      expect(summary.total).toBe(2);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.missing).toBe(0);
      expect(summary.results).toHaveLength(2);
    });

    it("should count missing snapshots", () => {
      const summary = runSnapshotSuite([
        [join(SNAPSHOT_DIR, "no-file.snap"), "output", "missing-snap"],
      ]);

      expect(summary.missing).toBe(1);
      expect(summary.passed).toBe(0);
      expect(summary.failed).toBe(0);
    });

    it("should handle empty suite", () => {
      const summary = runSnapshotSuite([]);

      expect(summary.total).toBe(0);
      expect(summary.passed).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.missing).toBe(0);
    });
  });

  describe("updateSnapshots", () => {
    it("should create snapshot files from fixtures", () => {
      writeFileSync(join(FIXTURE_DIR, "hello.js"), "input code", "utf-8");
      writeFileSync(join(FIXTURE_DIR, "world.js"), "more code", "utf-8");

      const transform = (input: string): string => `transformed: ${input}`;
      const updated = updateSnapshots({
        fixtureDir: FIXTURE_DIR,
        snapshotDir: SNAPSHOT_DIR,
        transform,
      });

      expect(updated).toHaveLength(2);
      const snap1 = readFileSync(join(SNAPSHOT_DIR, "hello.snap"), "utf-8");
      expect(snap1).toBe("transformed: input code");
      const snap2 = readFileSync(join(SNAPSHOT_DIR, "world.snap"), "utf-8");
      expect(snap2).toBe("transformed: more code");
    });

    it("should filter by extension", () => {
      writeFileSync(join(FIXTURE_DIR, "test.ts"), "ts code", "utf-8");
      writeFileSync(join(FIXTURE_DIR, "test.js"), "js code", "utf-8");

      const transform = (input: string): string => input.toUpperCase();
      const updated = updateSnapshots({
        fixtureDir: FIXTURE_DIR,
        snapshotDir: SNAPSHOT_DIR,
        transform,
        extension: ".ts",
      });

      expect(updated).toHaveLength(1);
      const snap = readFileSync(join(SNAPSHOT_DIR, "test.snap"), "utf-8");
      expect(snap).toBe("TS CODE");
    });

    it("should overwrite existing snapshots", () => {
      writeFileSync(join(FIXTURE_DIR, "update.js"), "new input", "utf-8");
      writeFileSync(join(SNAPSHOT_DIR, "update.snap"), "old output", "utf-8");

      const transform = (input: string): string => `new: ${input}`;
      updateSnapshots({
        fixtureDir: FIXTURE_DIR,
        snapshotDir: SNAPSHOT_DIR,
        transform,
      });

      const snap = readFileSync(join(SNAPSHOT_DIR, "update.snap"), "utf-8");
      expect(snap).toBe("new: new input");
    });

    it("should pass filename to transform function", () => {
      writeFileSync(join(FIXTURE_DIR, "named.js"), "content", "utf-8");

      const filenames: string[] = [];
      const transform = (_input: string, filename: string): string => {
        filenames.push(filename);
        return "output";
      };

      updateSnapshots({
        fixtureDir: FIXTURE_DIR,
        snapshotDir: SNAPSHOT_DIR,
        transform,
      });

      expect(filenames).toContain("named.js");
    });

    it("should handle empty fixture directory", () => {
      const transform = (input: string): string => input;
      const updated = updateSnapshots({
        fixtureDir: FIXTURE_DIR,
        snapshotDir: SNAPSHOT_DIR,
        transform,
      });

      expect(updated).toHaveLength(0);
    });
  });

  describe("updateSingleSnapshot", () => {
    it("should write content to snapshot path", () => {
      const snapPath = join(SNAPSHOT_DIR, "single.snap");
      updateSingleSnapshot(snapPath, "snapshot content");

      const content = readFileSync(snapPath, "utf-8");
      expect(content).toBe("snapshot content");
    });

    it("should overwrite existing snapshot", () => {
      const snapPath = join(SNAPSHOT_DIR, "overwrite.snap");
      writeFileSync(snapPath, "old", "utf-8");

      updateSingleSnapshot(snapPath, "new");

      const content = readFileSync(snapPath, "utf-8");
      expect(content).toBe("new");
    });
  });
});
