/**
 * @module tests/unit/build-api
 * @description Tests for the esbuild-compatible build() API.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { vi } from "../vi-compat.js";
import { build, mapFormat } from "../../src/build-api.js";
import * as rollupModule from "../../src/rollup.js";

describe("build", () => {
  describe("mapFormat", () => {
    it("maps esm to es", () => {
      expect(mapFormat("esm")).toBe("es");
    });

    it("maps cjs to cjs", () => {
      expect(mapFormat("cjs")).toBe("cjs");
    });

    it("maps iife to iife", () => {
      expect(mapFormat("iife")).toBe("iife");
    });

    it("defaults to es when undefined", () => {
      expect(mapFormat(undefined)).toBe("es");
    });
  });

  describe("error reporting", () => {
    it("returns an error when no entry points are provided", async () => {
      const result = await build({});
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].text).toBe("No entry points provided");
      expect(result.outputFiles).toHaveLength(0);
    });

    it("returns an error when entry points array is empty", async () => {
      const result = await build({ entryPoints: [] });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].text).toBe("No entry points provided");
    });

    it("returns an error when entry point cannot be resolved", async () => {
      const result = await build({
        entryPoints: ["nonexistent-file-that-does-not-exist.ts"],
      });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.outputFiles).toHaveLength(0);
    });
  });

  describe("with mocked rollup", () => {
    let rollupSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      rollupSpy = vi.spyOn(rollupModule, "rollup");
    });

    afterEach(() => {
      rollupSpy.mockRestore();
    });

    it("processes chunk output files with outdir", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({
          output: [
            {
              type: "chunk",
              fileName: "index.js",
              code: "const x = 1;\nexport { x };\n",
              map: null,
            },
          ],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.outputFiles.length).toBe(1);
      expect(result.outputFiles[0].path).toBe("out/index.js");
      expect(result.outputFiles[0].text).toBe("const x = 1;\nexport { x };\n");
      expect(result.outputFiles[0].contents).toBeInstanceOf(Uint8Array);
      expect(mockBundle.close).toHaveBeenCalled();
    });

    it("processes chunk output files with outfile", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({
          output: [
            {
              type: "chunk",
              fileName: "index.js",
              code: "const x = 1;",
              map: null,
            },
          ],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      const result = await build({
        entryPoints: ["entry.js"],
        outfile: "dist/bundle.js",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.outputFiles.length).toBe(1);
      expect(result.outputFiles[0].path).toBe("dist/bundle.js");
    });

    it("processes chunk with sourcemap", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({
          output: [
            {
              type: "chunk",
              fileName: "index.js",
              code: "const x = 1;",
              map: { version: 3, sources: [], mappings: "" },
            },
          ],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        sourcemap: true,
      });

      expect(result.errors).toHaveLength(0);
      expect(result.outputFiles.length).toBe(2);
      expect(result.outputFiles[0].path).toBe("out/index.js");
      expect(result.outputFiles[1].path).toBe("out/index.js.map");
      expect(result.outputFiles[1].text).toContain('"version"');
    });

    it("processes asset output files with outdir", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({
          output: [
            {
              type: "asset",
              fileName: "style.css",
              source: "body { color: red; }",
            },
          ],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.outputFiles.length).toBe(1);
      expect(result.outputFiles[0].path).toBe("out/style.css");
      expect(result.outputFiles[0].text).toBe("body { color: red; }");
    });

    it("processes asset with Uint8Array source", async () => {
      const binarySource = new Uint8Array([1, 2, 3, 4]);
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({
          output: [
            {
              type: "asset",
              fileName: "data.bin",
              source: binarySource,
            },
          ],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.outputFiles.length).toBe(1);
      expect(result.outputFiles[0].path).toBe("out/data.bin");
      expect(result.outputFiles[0].contents).toBeInstanceOf(Uint8Array);
    });

    it("processes asset without outdir", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({
          output: [
            {
              type: "asset",
              fileName: "style.css",
              source: "body {}",
            },
          ],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      const result = await build({
        entryPoints: ["entry.js"],
        outfile: "bundle.js",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.outputFiles.length).toBe(1);
      expect(result.outputFiles[0].path).toBe("style.css");
    });

    it("processes chunk without outfile or outdir (defaults to dist)", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({
          output: [
            {
              type: "chunk",
              fileName: "index.js",
              code: "const x = 1;",
              map: null,
            },
          ],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      const result = await build({
        entryPoints: ["entry.js"],
      });

      expect(result.errors).toHaveLength(0);
      expect(result.outputFiles.length).toBe(1);
      expect(result.outputFiles[0].path).toBe("dist/index.js");
    });

    it("handles generate error and closes bundle", async () => {
      const mockBundle = {
        generate: vi.fn().mockRejectedValue(new Error("generate failed")),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].text).toBe("generate failed");
      expect(mockBundle.close).toHaveBeenCalled();
    });

    it("handles rollup error", async () => {
      rollupSpy.mockRejectedValue(new Error("rollup failed"));

      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].text).toBe("rollup failed");
    });

    it("handles non-Error thrown from rollup", async () => {
      rollupSpy.mockRejectedValue("string error");

      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].text).toBe("string error");
    });

    it("translates onLog to warnings", async () => {
      let capturedOnLog: Function | undefined;

      rollupSpy.mockImplementation(async (opts: any) => {
        capturedOnLog = opts.onLog;
        return {
          generate: vi.fn().mockResolvedValue({ output: [] }),
          close: vi.fn().mockResolvedValue(undefined),
        };
      });

      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      // Trigger the onLog callback with a warning
      expect(capturedOnLog).toBeDefined();
      capturedOnLog!("warn", {
        message: "test warning",
        loc: { file: "a.js", line: 1, column: 0 },
      });

      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0].text).toBe("test warning");
      expect(result.warnings[0].location).toEqual({
        file: "a.js",
        line: 1,
        column: 0,
      });
    });

    it("translates onLog with string log", async () => {
      let capturedOnLog: Function | undefined;

      rollupSpy.mockImplementation(async (opts: any) => {
        capturedOnLog = opts.onLog;
        return {
          generate: vi.fn().mockResolvedValue({ output: [] }),
          close: vi.fn().mockResolvedValue(undefined),
        };
      });

      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      capturedOnLog!("warn", "simple string warning");

      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0].text).toBe("simple string warning");
      expect(result.warnings[0].location).toBeNull();
    });

    it("translates onLog without loc", async () => {
      let capturedOnLog: Function | undefined;

      rollupSpy.mockImplementation(async (opts: any) => {
        capturedOnLog = opts.onLog;
        return {
          generate: vi.fn().mockResolvedValue({ output: [] }),
          close: vi.fn().mockResolvedValue(undefined),
        };
      });

      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      capturedOnLog!("warn", { message: "no loc warning" });

      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0].text).toBe("no loc warning");
      expect(result.warnings[0].location).toBeNull();
    });

    it("passes format to generate options", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        format: "cjs",
      });

      expect(mockBundle.generate).toHaveBeenCalledWith(
        expect.objectContaining({ format: "cjs" }),
      );
    });

    it("passes minify as compact option", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        minify: true,
      });

      expect(mockBundle.generate).toHaveBeenCalledWith(
        expect.objectContaining({ compact: true }),
      );
    });

    it("passes sourcemap inline option", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        sourcemap: "inline",
      });

      expect(mockBundle.generate).toHaveBeenCalledWith(
        expect.objectContaining({ sourcemap: "inline" }),
      );
    });

    it("passes sourcemap external option as true", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        sourcemap: "external",
      });

      expect(mockBundle.generate).toHaveBeenCalledWith(
        expect.objectContaining({ sourcemap: true }),
      );
    });

    it("passes sourcemap false option", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        sourcemap: false,
      });

      expect(mockBundle.generate).toHaveBeenCalledWith(
        expect.objectContaining({ sourcemap: false }),
      );
    });

    it("handles multiple entry points as array", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["a.js", "b.js"],
        outdir: "out",
      });

      expect(rollupSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          input: ["a.js", "b.js"],
        }),
      );
    });

    it("handles single entry point as string", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      expect(rollupSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          input: "entry.js",
        }),
      );
    });

    it("passes external option to rollup", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        external: ["node:fs", "node:path"],
      });

      expect(rollupSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          external: ["node:fs", "node:path"],
        }),
      );
    });

    it("sets treeshake based on bundle option", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        bundle: false,
      });

      expect(rollupSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          treeshake: false,
        }),
      );
    });

    it("defaults treeshake to true", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      expect(rollupSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          treeshake: true,
        }),
      );
    });

    it("handles multiple output items", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({
          output: [
            { type: "chunk", fileName: "a.js", code: "a", map: null },
            { type: "chunk", fileName: "b.js", code: "b", map: null },
            { type: "asset", fileName: "c.css", source: "c" },
          ],
        }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
      });

      expect(result.errors).toHaveLength(0);
      expect(result.outputFiles.length).toBe(3);
    });

    it("passes banner.js to rollup output options", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        banner: { js: "/* copyright */" },
      });

      expect(mockBundle.generate).toHaveBeenCalledWith(
        expect.objectContaining({ banner: "/* copyright */" }),
      );
    });

    it("does not set banner when not provided", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({ entryPoints: ["entry.js"], outdir: "out" });

      expect(mockBundle.generate).toHaveBeenCalledWith(
        expect.objectContaining({ banner: undefined }),
      );
    });

    it("creates an alias plugin when alias is provided", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        alias: { foo: "./src/foo.ts" },
      });

      const callArgs = rollupSpy.mock.calls[0][0] as any;
      expect(callArgs.plugins).toBeDefined();
      expect(callArgs.plugins.length).toBe(1);
      expect(callArgs.plugins[0].name).toBe("steamroller-alias");
    });

    it("alias plugin resolves exact matches to cwd-relative paths", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        alias: { mylib: "./src/index.ts" },
      });

      const plugin = (rollupSpy.mock.calls[0][0] as any).plugins[0];
      const resolved = plugin.resolveId("mylib");
      expect(resolved).toContain("src/index.ts");
      expect(plugin.resolveId("other")).toBeNull();
    });

    it("alias plugin resolves subpath imports", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        alias: { mylib: "./src" },
      });

      const plugin = (rollupSpy.mock.calls[0][0] as any).plugins[0];
      const resolved = plugin.resolveId("mylib/hooks");
      expect(resolved).toContain("src/hooks");
    });

    it("does not add plugins when alias is not provided", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({ entryPoints: ["entry.js"], outdir: "out" });

      const callArgs = rollupSpy.mock.calls[0][0] as any;
      expect(callArgs.plugins).toBeUndefined();
    });

    it("passes chunkFileNames when splitting is enabled", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["a.js", "b.js"],
        outdir: "out",
        format: "esm",
        splitting: true,
        chunkNames: "chunks/[name]-[hash]",
      });

      expect(mockBundle.generate).toHaveBeenCalledWith(
        expect.objectContaining({ chunkFileNames: "chunks/[name]-[hash]" }),
      );
    });

    it("does not set chunkFileNames when splitting is disabled", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        chunkNames: "chunks/[name]-[hash]",
      });

      expect(mockBundle.generate).toHaveBeenCalledWith(
        expect.objectContaining({ chunkFileNames: undefined }),
      );
    });

    it("allows splitting with esm format", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      const result = await build({
        entryPoints: ["a.js", "b.js"],
        outdir: "out",
        format: "esm",
        splitting: true,
      });

      expect(result.errors).toHaveLength(0);
    });

    it("allows splitting with default format", async () => {
      const mockBundle = {
        generate: vi.fn().mockResolvedValue({ output: [] }),
        close: vi.fn().mockResolvedValue(undefined),
      };
      rollupSpy.mockResolvedValue(mockBundle as any);

      const result = await build({
        entryPoints: ["a.js", "b.js"],
        outdir: "out",
        splitting: true,
      });

      expect(result.errors).toHaveLength(0);
    });
  });

  describe("result shape", () => {
    it("always returns outputFiles, errors, and warnings arrays", async () => {
      const result = await build({
        entryPoints: ["nonexistent.ts"],
      });
      expect(Array.isArray(result.outputFiles)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe("splitting validation", () => {
    it("returns error when splitting is used with outfile", async () => {
      const result = await build({
        entryPoints: ["entry.js"],
        outfile: "out.js",
        splitting: true,
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].text).toContain(
        "splitting requires outdir, not outfile",
      );
    });

    it("returns error when splitting is used with cjs format", async () => {
      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        format: "cjs",
        splitting: true,
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].text).toContain(
        'splitting is only supported with format "esm"',
      );
    });

    it("returns error when splitting is used with iife format", async () => {
      const result = await build({
        entryPoints: ["entry.js"],
        outdir: "out",
        format: "iife",
        splitting: true,
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].text).toContain(
        'splitting is only supported with format "esm"',
      );
    });
  });
});
