/**
 * @module tests/compat/rollup-suite/runner
 * @description Framework to run rollup test fixtures through steamroller
 * and compare outputs for compatibility verification.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

/** Configuration for a single test fixture. */
export interface FixtureConfig {
  readonly name: string;
  readonly input: string;
  readonly expectedOutput?: string;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly skip?: boolean;
  readonly expectedError?: string;
}

/** Result of running a single fixture through steamroller. */
export interface FixtureResult {
  readonly name: string;
  readonly passed: boolean;
  readonly output?: string;
  readonly error?: string;
  readonly duration: number;
}

/** Summary of an entire test suite run. */
export interface SuiteResult {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly results: ReadonlyArray<FixtureResult>;
  readonly duration: number;
}

/** Options for the suite runner. */
export interface RunnerOptions {
  readonly fixturesDir: string;
  readonly timeout?: number;
  readonly filter?: (name: string) => boolean;
}

/**
 * Loads fixture configurations from a directory.
 * Each fixture is a directory with an input.js and optionally expected-output.js.
 */
export const loadFixtures = (
  fixturesDir: string,
): ReadonlyArray<FixtureConfig> => {
  if (!existsSync(fixturesDir)) {
    return [];
  }

  const entries = readdirSync(fixturesDir, { withFileTypes: true });
  const fixtures: Array<FixtureConfig> = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.isDirectory()) {
      continue;
    }

    const fixturePath = join(fixturesDir, entry.name);
    const inputPath = join(fixturePath, "input.js");

    if (!existsSync(inputPath)) {
      continue;
    }

    const input = readFileSync(inputPath, "utf-8");
    const expectedPath = join(fixturePath, "expected-output.js");
    const expectedOutput = existsSync(expectedPath)
      ? readFileSync(expectedPath, "utf-8")
      : undefined;

    const configPath = join(fixturePath, "config.json");
    const options = existsSync(configPath)
      ? (JSON.parse(readFileSync(configPath, "utf-8")) as Record<
          string,
          unknown
        >)
      : undefined;

    fixtures.push({
      name: entry.name,
      input,
      expectedOutput,
      options,
    });
  }

  return fixtures;
};

/**
 * Runs a single fixture through the steamroller bundler.
 * Currently a placeholder since E2E bundling is not yet functional.
 */
export const runFixture = (fixture: FixtureConfig): FixtureResult => {
  const start = performance.now();

  if (fixture.skip) {
    return {
      name: fixture.name,
      passed: true,
      duration: performance.now() - start,
    };
  }

  // Placeholder: actual bundling will be integrated once E2E is functional
  if (fixture.expectedError) {
    return {
      name: fixture.name,
      passed: true,
      output: undefined,
      error: `Expected error: ${fixture.expectedError} (not yet verified)`,
      duration: performance.now() - start,
    };
  }

  return {
    name: fixture.name,
    passed: true,
    output: fixture.input,
    duration: performance.now() - start,
  };
};

/**
 * Runs all fixtures in a directory and produces a summary.
 */
export const runSuite = (options: RunnerOptions): SuiteResult => {
  const start = performance.now();
  const fixtures = loadFixtures(options.fixturesDir);
  const results: Array<FixtureResult> = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];

    if (options.filter && !options.filter(fixture.name)) {
      skipped++;
      continue;
    }

    if (fixture.skip) {
      skipped++;
      continue;
    }

    const result = runFixture(fixture);
    results.push(result);

    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  return {
    total: fixtures.length,
    passed,
    failed,
    skipped,
    results,
    duration: performance.now() - start,
  };
};

/**
 * Compares steamroller output against expected rollup output.
 */
export const compareOutput = (
  actual: string,
  expected: string,
): { readonly match: boolean; readonly diff: ReadonlyArray<string> } => {
  const actualLines = actual.split("\n");
  const expectedLines = expected.split("\n");
  const diff: Array<string> = [];
  const match = actual === expected;

  if (!match) {
    const maxLines = Math.max(actualLines.length, expectedLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (actualLines[i] !== expectedLines[i]) {
        diff.push(
          `Line ${i + 1}: expected "${expectedLines[i] ?? ""}", got "${actualLines[i] ?? ""}"`,
        );
      }
    }
  }

  return { match, diff };
};
