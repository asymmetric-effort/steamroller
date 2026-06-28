import { describe, it, expect } from "bun:test";
import {
  loadFixtures,
  runFixture,
  runSuite,
  compareOutput,
} from "../../compat/rollup-suite/runner.js";
import type { FixtureConfig } from "../../compat/rollup-suite/runner.js";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

describe("rollup suite runner", () => {
  describe("loadFixtures", () => {
    it("returns empty array for non-existent directory", () => {
      const result = loadFixtures("/tmp/non-existent-dir-xyz");
      expect(result).toEqual([]);
    });

    it("loads fixtures from a directory with input.js files", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "rollup-suite-"));
      const fixtureDir = join(tempDir, "basic");
      mkdirSync(fixtureDir);
      writeFileSync(join(fixtureDir, "input.js"), "const x = 1;\n");
      writeFileSync(join(fixtureDir, "expected-output.js"), "const x = 1;\n");

      const fixtures = loadFixtures(tempDir);
      expect(fixtures).toHaveLength(1);
      expect(fixtures[0].name).toBe("basic");
      expect(fixtures[0].input).toBe("const x = 1;\n");
      expect(fixtures[0].expectedOutput).toBe("const x = 1;\n");

      rmSync(tempDir, { recursive: true });
    });

    it("skips directories without input.js", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "rollup-suite-"));
      const fixtureDir = join(tempDir, "no-input");
      mkdirSync(fixtureDir);
      writeFileSync(join(fixtureDir, "readme.txt"), "no input here");

      const fixtures = loadFixtures(tempDir);
      expect(fixtures).toHaveLength(0);

      rmSync(tempDir, { recursive: true });
    });

    it("loads config.json if present", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "rollup-suite-"));
      const fixtureDir = join(tempDir, "with-config");
      mkdirSync(fixtureDir);
      writeFileSync(join(fixtureDir, "input.js"), "export default 1;\n");
      writeFileSync(
        join(fixtureDir, "config.json"),
        JSON.stringify({ format: "cjs" }),
      );

      const fixtures = loadFixtures(tempDir);
      expect(fixtures).toHaveLength(1);
      expect(fixtures[0].options).toEqual({ format: "cjs" });

      rmSync(tempDir, { recursive: true });
    });

    it("skips non-directory entries", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "rollup-suite-"));
      writeFileSync(join(tempDir, "not-a-dir.txt"), "file");

      const fixtures = loadFixtures(tempDir);
      expect(fixtures).toHaveLength(0);

      rmSync(tempDir, { recursive: true });
    });
  });

  describe("runFixture", () => {
    it("returns passed for a normal fixture", () => {
      const fixture: FixtureConfig = {
        name: "test-fixture",
        input: "const x = 1;\n",
      };

      const result = runFixture(fixture);
      expect(result.passed).toBe(true);
      expect(result.name).toBe("test-fixture");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("handles skipped fixtures", () => {
      const fixture: FixtureConfig = {
        name: "skipped",
        input: "const x = 1;\n",
        skip: true,
      };

      const result = runFixture(fixture);
      expect(result.passed).toBe(true);
    });

    it("handles fixtures with expected errors", () => {
      const fixture: FixtureConfig = {
        name: "error-fixture",
        input: "invalid{{{",
        expectedError: "SyntaxError",
      };

      const result = runFixture(fixture);
      expect(result.passed).toBe(true);
      expect(result.error).toContain("Expected error");
    });
  });

  describe("runSuite", () => {
    it("runs all fixtures in a directory", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "rollup-suite-"));
      const fixtureDir = join(tempDir, "basic");
      mkdirSync(fixtureDir);
      writeFileSync(join(fixtureDir, "input.js"), "const x = 1;\n");

      const result = runSuite({ fixturesDir: tempDir });
      expect(result.total).toBe(1);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);

      rmSync(tempDir, { recursive: true });
    });

    it("handles empty fixtures directory", () => {
      const result = runSuite({ fixturesDir: "/tmp/non-existent-xyz" });
      expect(result.total).toBe(0);
      expect(result.passed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("applies filter function", () => {
      const tempDir = mkdtempSync(join(tmpdir(), "rollup-suite-"));
      const dir1 = join(tempDir, "include-me");
      const dir2 = join(tempDir, "exclude-me");
      mkdirSync(dir1);
      mkdirSync(dir2);
      writeFileSync(join(dir1, "input.js"), "const a = 1;\n");
      writeFileSync(join(dir2, "input.js"), "const b = 2;\n");

      const result = runSuite({
        fixturesDir: tempDir,
        filter: (name) => name.startsWith("include"),
      });
      expect(result.passed).toBe(1);
      expect(result.skipped).toBe(1);

      rmSync(tempDir, { recursive: true });
    });
  });

  describe("compareOutput", () => {
    it("reports match for identical outputs", () => {
      const result = compareOutput("const x = 1;\n", "const x = 1;\n");
      expect(result.match).toBe(true);
      expect(result.diff).toHaveLength(0);
    });

    it("reports mismatch with diff details", () => {
      const result = compareOutput("const x = 1;\n", "const x = 2;\n");
      expect(result.match).toBe(false);
      expect(result.diff.length).toBeGreaterThan(0);
    });

    it("handles different line counts", () => {
      const result = compareOutput("a\nb\nc\n", "a\n");
      expect(result.match).toBe(false);
      expect(result.diff.length).toBeGreaterThan(0);
    });

    it("handles empty strings", () => {
      const result = compareOutput("", "");
      expect(result.match).toBe(true);
      expect(result.diff).toHaveLength(0);
    });
  });
});
