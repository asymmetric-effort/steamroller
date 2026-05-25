/**
 * Unit tests for CLI entry point.
 *
 * @module tests/unit/cli/main
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VERSION } from "../../../src/version.js";

describe("cli/main", () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.argv = ["node", "steamroller"];
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
  });

  describe("printHelp", () => {
    it("should write help text to stdout", async () => {
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      const { printHelp } = await import("../../../src/cli/main.js");
      printHelp();

      expect(writeSpy).toHaveBeenCalledTimes(1);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain("steamroller");
      expect(output).toContain("Usage:");
      expect(output).toContain("--help");
      expect(output).toContain("--version");
      expect(output).toContain("--input");
      expect(output).toContain("--output.file");
      expect(output).toContain("--config");
      expect(output).toContain("--watch");
      expect(output).toContain("--sourcemap");
      expect(output).toContain("--format");
      expect(output).toContain("--name");
      expect(output).toContain("--globals");
      expect(output).toContain("--external");
      expect(output).toContain("--silent");
    });

    it("should include current version in help text", async () => {
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      const { printHelp } = await import("../../../src/cli/main.js");
      printHelp();

      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain(`v${VERSION}`);
    });
  });

  describe("printVersion", () => {
    it("should write version string to stdout", async () => {
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      const { printVersion } = await import("../../../src/cli/main.js");
      printVersion();

      expect(writeSpy).toHaveBeenCalledWith(`steamroller v${VERSION}\n`);
    });
  });

  describe("run", () => {
    it("should call process.exit(0) when --help is passed", async () => {
      process.argv = ["node", "steamroller", "--help"];
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(exitSpy).toHaveBeenCalledWith(0);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain("Usage:");
    });

    it("should call process.exit(0) when -h is passed", async () => {
      process.argv = ["node", "steamroller", "-h"];
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("should call process.exit(0) when --version is passed", async () => {
      process.argv = ["node", "steamroller", "--version"];
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(writeSpy).toHaveBeenCalledWith(`steamroller v${VERSION}\n`);
    });

    it("should call process.exit(0) when -v is passed", async () => {
      process.argv = ["node", "steamroller", "-v"];
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("should invoke watch mode when --watch flag is set with --config", async () => {
      process.argv = [
        "node",
        "steamroller",
        "-w",
        "-c",
        "nonexistent.config.js",
      ];
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      vi.spyOn(process.stderr, "write").mockImplementation(() => true);

      const watchModule = await import("../../../src/watch-entry.js");
      const mockWatcher = {
        close: vi.fn(),
        on: vi.fn().mockReturnThis(),
      };
      vi.spyOn(watchModule, "watch").mockReturnValue(
        mockWatcher as unknown as ReturnType<typeof watchModule.watch>,
      );

      const configModule = await import("../../../src/cli/config-loader.js");
      vi.spyOn(configModule, "resolveConfigPath").mockResolvedValue(null);

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(watchModule.watch).toHaveBeenCalled();
      expect(mockWatcher.on).toHaveBeenCalledWith("event", expect.anything());
    });

    it("should invoke rollup build for each config when not in watch mode", async () => {
      process.argv = ["node", "steamroller", "-i", "src/index.ts"];
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const rollupModule = await import("../../../src/rollup.js");
      const mockBuild = {
        cache: undefined,
        closed: false,
        watchFiles: [],
        generate: vi.fn(),
        write: vi.fn().mockResolvedValue({
          output: [{ fileName: "bundle.js", type: "chunk" as const }],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(rollupModule, "rollup").mockResolvedValue(mockBuild);

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(rollupModule.rollup).toHaveBeenCalled();
      expect(mockBuild.write).toHaveBeenCalled();
      expect(mockBuild.close).toHaveBeenCalled();

      const output = vi.mocked(process.stdout.write).mock.calls[0][0] as string;
      expect(output).toContain("created bundle.js in");
    });

    it("should load config file when --config is specified", async () => {
      process.argv = ["node", "steamroller", "-c", "rollup.config.js"];
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const configModule = await import("../../../src/cli/config-loader.js");
      vi.spyOn(configModule, "resolveConfigPath").mockResolvedValue(
        "/fake/rollup.config.js",
      );
      vi.spyOn(configModule, "loadConfigFile").mockResolvedValue([
        { input: "src/index.ts", output: { file: "dist/bundle.js" } },
      ]);

      const rollupModule = await import("../../../src/rollup.js");
      const mockBuild = {
        cache: undefined,
        closed: false,
        watchFiles: [],
        generate: vi.fn(),
        write: vi.fn().mockResolvedValue({
          output: [{ fileName: "bundle.js", type: "chunk" as const }],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(rollupModule, "rollup").mockResolvedValue(mockBuild);

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(configModule.resolveConfigPath).toHaveBeenCalled();
      expect(configModule.loadConfigFile).toHaveBeenCalledWith(
        "/fake/rollup.config.js",
        expect.objectContaining({ watch: false, silent: false }),
      );
    });

    it("should handle build errors via top-level catch", async () => {
      process.argv = ["node", "steamroller", "-i", "nonexistent.ts"];
      const stderrSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const rollupModule = await import("../../../src/rollup.js");
      vi.spyOn(rollupModule, "rollup").mockRejectedValue(
        new Error("File not found"),
      );

      const { run } = await import("../../../src/cli/main.js");

      await expect(run()).rejects.toThrow("File not found");

      void stderrSpy;
    });

    it("should use default output when config.output is undefined", async () => {
      process.argv = ["node", "steamroller", "-i", "src/index.ts"];
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const rollupModule = await import("../../../src/rollup.js");
      const mockBuild = {
        cache: undefined,
        closed: false,
        watchFiles: [],
        generate: vi.fn(),
        write: vi.fn().mockResolvedValue({
          output: [{ fileName: "index.js", type: "chunk" as const }],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(rollupModule, "rollup").mockResolvedValue(mockBuild);

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(mockBuild.write).toHaveBeenCalledWith({});
    });

    it("should handle array output options and use the first entry", async () => {
      process.argv = ["node", "steamroller", "-c", "rollup.config.js"];
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const configModule = await import("../../../src/cli/config-loader.js");
      vi.spyOn(configModule, "resolveConfigPath").mockResolvedValue(
        "/fake/rollup.config.js",
      );
      vi.spyOn(configModule, "loadConfigFile").mockResolvedValue([
        {
          input: "src/index.ts",
          output: [
            { file: "dist/bundle.cjs", format: "cjs" },
            { file: "dist/bundle.mjs", format: "es" },
          ],
        },
      ]);

      const rollupModule = await import("../../../src/rollup.js");
      const mockBuild = {
        cache: undefined,
        closed: false,
        watchFiles: [],
        generate: vi.fn(),
        write: vi.fn().mockResolvedValue({
          output: [{ fileName: "bundle.cjs", type: "chunk" as const }],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(rollupModule, "rollup").mockResolvedValue(mockBuild);

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(mockBuild.write).toHaveBeenCalledWith({
        file: "dist/bundle.cjs",
        format: "cjs",
      });
    });

    it("should fall back to empty output options when config.output is undefined", async () => {
      process.argv = ["node", "steamroller", "-c", "rollup.config.js"];
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const configModule = await import("../../../src/cli/config-loader.js");
      vi.spyOn(configModule, "resolveConfigPath").mockResolvedValue(
        "/fake/rollup.config.js",
      );
      vi.spyOn(configModule, "loadConfigFile").mockResolvedValue([
        { input: "src/index.ts" },
      ]);

      const rollupModule = await import("../../../src/rollup.js");
      const mockBuild = {
        cache: undefined,
        closed: false,
        watchFiles: [],
        generate: vi.fn(),
        write: vi.fn().mockResolvedValue({
          output: [{ fileName: "index.js", type: "chunk" as const }],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(rollupModule, "rollup").mockResolvedValue(mockBuild);

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(mockBuild.write).toHaveBeenCalledWith({});
    });

    it("should use 'bundle' as fallback fileName when output is empty", async () => {
      process.argv = ["node", "steamroller", "-i", "src/index.ts"];
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      const rollupModule = await import("../../../src/rollup.js");
      const mockBuild = {
        cache: undefined,
        closed: false,
        watchFiles: [],
        generate: vi.fn(),
        write: vi.fn().mockResolvedValue({
          output: [{ type: "chunk" as const }],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(rollupModule, "rollup").mockResolvedValue(mockBuild);

      const { run } = await import("../../../src/cli/main.js");
      await run();

      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain("created bundle in");
    });
  });

  describe("watch event handler", () => {
    it("should handle BUNDLE_END events with output and duration", async () => {
      process.argv = ["node", "steamroller", "-w", "-i", "src/index.ts"];
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      const watchModule = await import("../../../src/watch-entry.js");
      let capturedListener:
        | ((event: Record<string, unknown>) => void)
        | undefined;
      const mockWatcher = {
        close: vi.fn(),
        on: vi.fn(
          (
            event: string,
            listener: (event: Record<string, unknown>) => void,
          ) => {
            if (event === "event") {
              capturedListener = listener;
            }
            return mockWatcher;
          },
        ),
      };
      vi.spyOn(watchModule, "watch").mockReturnValue(
        mockWatcher as unknown as ReturnType<typeof watchModule.watch>,
      );

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(capturedListener).toBeDefined();
      capturedListener!({
        code: "BUNDLE_END",
        output: ["dist/bundle.js"],
        duration: 42,
      });

      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain("created dist/bundle.js in 42ms");
    });

    it("should handle ERROR events with error message", async () => {
      process.argv = ["node", "steamroller", "-w", "-i", "src/index.ts"];
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const stderrSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      const watchModule = await import("../../../src/watch-entry.js");
      let capturedListener:
        | ((event: Record<string, unknown>) => void)
        | undefined;
      const mockWatcher = {
        close: vi.fn(),
        on: vi.fn(
          (
            event: string,
            listener: (event: Record<string, unknown>) => void,
          ) => {
            if (event === "event") {
              capturedListener = listener;
            }
            return mockWatcher;
          },
        ),
      };
      vi.spyOn(watchModule, "watch").mockReturnValue(
        mockWatcher as unknown as ReturnType<typeof watchModule.watch>,
      );

      const { run } = await import("../../../src/cli/main.js");
      await run();

      expect(capturedListener).toBeDefined();
      capturedListener!({ code: "ERROR", error: { message: "Parse error" } });

      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain("Parse error");
    });

    it("should handle ERROR events with missing error details", async () => {
      process.argv = ["node", "steamroller", "-w", "-i", "src/index.ts"];
      vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const stderrSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);

      const watchModule = await import("../../../src/watch-entry.js");
      let capturedListener:
        | ((event: Record<string, unknown>) => void)
        | undefined;
      const mockWatcher = {
        close: vi.fn(),
        on: vi.fn(
          (
            event: string,
            listener: (event: Record<string, unknown>) => void,
          ) => {
            if (event === "event") {
              capturedListener = listener;
            }
            return mockWatcher;
          },
        ),
      };
      vi.spyOn(watchModule, "watch").mockReturnValue(
        mockWatcher as unknown as ReturnType<typeof watchModule.watch>,
      );

      const { run } = await import("../../../src/cli/main.js");
      await run();

      capturedListener!({ code: "ERROR" });

      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain("Unknown error");
    });

    it("should handle BUNDLE_END events without output", async () => {
      process.argv = ["node", "steamroller", "-w", "-i", "src/index.ts"];
      const writeSpy = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      const watchModule = await import("../../../src/watch-entry.js");
      let capturedListener:
        | ((event: Record<string, unknown>) => void)
        | undefined;
      const mockWatcher = {
        close: vi.fn(),
        on: vi.fn(
          (
            event: string,
            listener: (event: Record<string, unknown>) => void,
          ) => {
            if (event === "event") {
              capturedListener = listener;
            }
            return mockWatcher;
          },
        ),
      };
      vi.spyOn(watchModule, "watch").mockReturnValue(
        mockWatcher as unknown as ReturnType<typeof watchModule.watch>,
      );

      const { run } = await import("../../../src/cli/main.js");
      await run();

      capturedListener!({ code: "BUNDLE_END" });

      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain("created bundle in 0ms");
    });
  });

  describe("handleError", () => {
    it("should write Error message to stderr and exit with code 1", async () => {
      const stderrSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      const { handleError } = await import("../../../src/cli/main.js");
      handleError(new Error("fatal failure"));

      expect(stderrSpy).toHaveBeenCalledWith("fatal failure\n");
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("should convert non-Error values to string", async () => {
      const stderrSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      const { handleError } = await import("../../../src/cli/main.js");
      handleError("string error");

      expect(stderrSpy).toHaveBeenCalledWith("string error\n");
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("should handle null error values", async () => {
      const stderrSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation(() => true);
      vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

      const { handleError } = await import("../../../src/cli/main.js");
      handleError(null);

      expect(stderrSpy).toHaveBeenCalledWith("null\n");
    });
  });
});
