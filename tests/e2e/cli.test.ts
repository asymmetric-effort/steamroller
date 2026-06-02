import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const CLI_PATH = join(__dirname, "../../dist/cli/main.js");

/**
 * Helper to invoke the steamroller CLI with given arguments.
 * Returns { stdout, stderr, exitCode }.
 */
async function runCli(
  args: string[],
  options: { cwd?: string } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync("node", [CLI_PATH, ...args], {
      cwd: options.cwd ?? tmpdir(),
      timeout: 30_000,
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: typeof err.code === "number" ? err.code : 1,
    };
  }
}

describe("CLI end-to-end", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-e2e-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("--help", () => {
    it("prints help text and exits with code 0", async () => {
      const result = await runCli(["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("steamroller v");
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("--input");
      expect(result.stdout).toContain("--format");
    });

    it("supports short -h flag", async () => {
      const result = await runCli(["-h"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage:");
    });
  });

  describe("--version", () => {
    it("prints version and exits with code 0", async () => {
      const result = await runCli(["--version"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^steamroller v\d+\.\d+\.\d+\n$/);
    });

    it("supports short -v flag", async () => {
      const result = await runCli(["-v"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^steamroller v/);
    });
  });

  describe("basic bundling", () => {
    it("bundles a simple ES module file", async () => {
      const inputFile = join(tempDir, "basic-input.js");
      const outputFile = join(tempDir, "basic-output.js");

      await writeFile(
        inputFile,
        'export const greeting = "hello";\nexport const num = 42;\n',
      );

      const result = await runCli([
        "-i",
        inputFile,
        "-o",
        outputFile,
        "-f",
        "es",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("created");
      expect(result.stdout).toMatch(/in \d+ms/);

      const output = await readFile(outputFile, "utf-8");
      expect(output).toContain("greeting");
      expect(output).toContain("hello");
      expect(output).toContain("42");
    });

    it("bundles a file with imports", async () => {
      const libFile = join(tempDir, "lib.js");
      const entryFile = join(tempDir, "entry-with-import.js");
      const outputFile = join(tempDir, "bundle-with-import.js");

      await writeFile(libFile, "export const add = (a, b) => a + b;\n");
      await writeFile(
        entryFile,
        'import { add } from "./lib.js";\nexport const sum = add(1, 2);\n',
      );

      const result = await runCli([
        "-i",
        entryFile,
        "-o",
        outputFile,
        "-f",
        "es",
      ]);

      expect(result.exitCode).toBe(0);

      const output = await readFile(outputFile, "utf-8");
      expect(output).toContain("add");
      expect(output).toContain("sum");
    });

    it("uses long flag --input and --output.file", async () => {
      const inputFile = join(tempDir, "long-flags-input.js");
      const outputFile = join(tempDir, "long-flags-output.js");

      await writeFile(inputFile, "export const x = 1;\n");

      const result = await runCli([
        "--input",
        inputFile,
        "--output.file",
        outputFile,
        "--format",
        "es",
      ]);

      expect(result.exitCode).toBe(0);
      const output = await readFile(outputFile, "utf-8");
      expect(output).toContain("x");
    });
  });

  describe("--format flag", () => {
    let inputFile: string;

    beforeAll(async () => {
      inputFile = join(tempDir, "format-test-input.js");
      await writeFile(inputFile, 'export const value = "formatted";\n');
    });

    it("outputs ES module format", async () => {
      const outputFile = join(tempDir, "format-es.js");
      const result = await runCli([
        "-i",
        inputFile,
        "-o",
        outputFile,
        "-f",
        "es",
      ]);

      expect(result.exitCode).toBe(0);
      const output = await readFile(outputFile, "utf-8");
      expect(output).toContain("export");
      expect(output).not.toContain("require");
    });

    it("outputs CommonJS format", async () => {
      const outputFile = join(tempDir, "format-cjs.js");
      const result = await runCli([
        "-i",
        inputFile,
        "-o",
        outputFile,
        "-f",
        "cjs",
      ]);

      expect(result.exitCode).toBe(0);
      const output = await readFile(outputFile, "utf-8");
      expect(output).toContain("exports");
    });

    it("outputs IIFE format", async () => {
      const outputFile = join(tempDir, "format-iife.js");
      const result = await runCli([
        "-i",
        inputFile,
        "-o",
        outputFile,
        "-f",
        "iife",
        "--name",
        "MyBundle",
      ]);

      expect(result.exitCode).toBe(0);
      const output = await readFile(outputFile, "utf-8");
      // IIFE wraps in a self-executing function
      expect(output).toContain("(function");
      expect(output).toContain("'use strict'");
    });

    it("outputs UMD format", async () => {
      const outputFile = join(tempDir, "format-umd.js");
      const result = await runCli([
        "-i",
        inputFile,
        "-o",
        outputFile,
        "-f",
        "umd",
        "--name",
        "MyUmd",
      ]);

      expect(result.exitCode).toBe(0);
      const output = await readFile(outputFile, "utf-8");
      // UMD includes AMD/CommonJS detection
      expect(output).toContain("define");
      expect(output).toContain("exports");
    });
  });

  describe("--sourcemap flag", () => {
    it("accepts the -m flag and bundles successfully", async () => {
      const inputFile = join(tempDir, "sourcemap-input.js");
      const outputFile = join(tempDir, "sourcemap-output.js");

      await writeFile(inputFile, 'export const s = "map";\n');

      const result = await runCli([
        "-i",
        inputFile,
        "-o",
        outputFile,
        "-f",
        "es",
        "-m",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("created");

      const output = await readFile(outputFile, "utf-8");
      expect(output).toContain("map");
    });
  });

  describe("--external flag", () => {
    it("excludes external modules from the bundle", async () => {
      const inputFile = join(tempDir, "external-input.js");
      const outputFile = join(tempDir, "external-output.js");

      await writeFile(
        inputFile,
        'import lodash from "lodash";\nexport const result = lodash;\n',
      );

      const result = await runCli([
        "-i",
        inputFile,
        "-o",
        outputFile,
        "-f",
        "es",
        "--external",
        "lodash",
      ]);

      expect(result.exitCode).toBe(0);
      const output = await readFile(outputFile, "utf-8");
      expect(output).toContain("lodash");
      // The import should be preserved since lodash is external
      expect(output).toMatch(/from ['"]lodash['"]/);
    });
  });

  describe("error cases", () => {
    it("exits with code 1 when input file does not exist", async () => {
      const result = await runCli([
        "-i",
        join(tempDir, "does-not-exist.js"),
        "-o",
        join(tempDir, "error-output.js"),
        "-f",
        "es",
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });

    it("exits with code 1 for invalid config file path", async () => {
      const result = await runCli(["-c", "/nonexistent/rollup.config.js"]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });

    it("writes error messages to stderr", async () => {
      const result = await runCli([
        "-i",
        "/absolutely/no/such/file.js",
        "-o",
        join(tempDir, "stderr-test.js"),
        "-f",
        "es",
      ]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);
    });
  });

  describe("output directory", () => {
    it("writes output to a directory with --output.dir", async () => {
      const inputFile = join(tempDir, "dir-input.js");
      const outputDir = join(tempDir, "output-dir");

      await mkdir(outputDir, { recursive: true });
      await writeFile(inputFile, 'export const d = "dir";\n');

      const result = await runCli([
        "-i",
        inputFile,
        "-d",
        outputDir,
        "-f",
        "es",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("created");
    });
  });
});
