/**
 * @module build-api
 * @description esbuild-compatible build() API for steamroller.
 * Translates esbuild-style options into rollup() + generate()/write() calls
 * and returns an esbuild-like result object.
 */

import { resolve } from "node:path";
import { rollup } from "./rollup.js";
import type {
  InputOptions,
  OutputOptions,
  ModuleFormat,
  RollupLog,
  OutputChunk,
  OutputAsset,
  Plugin,
} from "./types.js";

// ============================================================
// Public types
// ============================================================

/** Supported esbuild-style output formats. */
export type BuildFormat = "esm" | "cjs" | "iife";

/** Supported esbuild-style platform targets. */
export type BuildPlatform = "browser" | "node" | "neutral";

/** A single output file produced by a build. */
export interface BuildOutputFile {
  /** Absolute or relative path where the file would be written. */
  readonly path: string;
  /** The file contents as a Uint8Array. */
  readonly contents: Uint8Array;
  /** The file contents as a UTF-8 string. */
  readonly text: string;
}

/** Structured error or warning from a build. */
export interface BuildMessage {
  readonly text: string;
  readonly location?: {
    readonly file?: string;
    readonly line?: number;
    readonly column?: number;
  } | null;
}

/** The result object returned by build(). */
export interface BuildResult {
  /** Output files produced by the build. */
  readonly outputFiles: ReadonlyArray<BuildOutputFile>;
  /** Errors encountered during the build (empty on success). */
  readonly errors: ReadonlyArray<BuildMessage>;
  /** Warnings encountered during the build. */
  readonly warnings: ReadonlyArray<BuildMessage>;
}

/** Options accepted by the build() function, following esbuild conventions. */
export interface BuildOptions {
  /** Entry point file paths. */
  readonly entryPoints?: ReadonlyArray<string>;
  /** Output directory (used when there are multiple entry points or when outfile is not set). */
  readonly outdir?: string;
  /** Output file path (used for a single entry point). */
  readonly outfile?: string;
  /** Output format: "esm", "cjs", or "iife". */
  readonly format?: BuildFormat;
  /** Whether to bundle dependencies into the output. Defaults to false. */
  readonly bundle?: boolean;
  /** Whether to minify the output. Defaults to false. */
  readonly minify?: boolean;
  /** Module specifiers to exclude from the bundle. */
  readonly external?: ReadonlyArray<string>;
  /** Whether to generate source maps. */
  readonly sourcemap?: boolean | "inline" | "external";
  /** ECMAScript target (e.g. "es2020"). Currently passed through as metadata. */
  readonly target?: string;
  /** Target platform. */
  readonly platform?: BuildPlatform;
  /** Text to prepend to output files, keyed by file type. */
  readonly banner?: Readonly<Record<string, string>>;
  /** Map of import specifiers to replacement paths (resolved relative to cwd). */
  readonly alias?: Readonly<Record<string, string>>;
  /** Enable code splitting for ESM output. Shared modules are extracted into separate chunks. */
  readonly splitting?: boolean;
  /** Naming pattern for generated chunks. Supports [name] and [hash] placeholders. */
  readonly chunkNames?: string;
}

// ============================================================
// Format mapping
// ============================================================

/**
 * Maps an esbuild-style format string to a rollup ModuleFormat.
 *
 * @param format - The esbuild format ("esm", "cjs", or "iife").
 * @returns The corresponding rollup ModuleFormat.
 */
export const mapFormat = (format: BuildFormat | undefined): ModuleFormat => {
  switch (format) {
    case "esm":
      return "es";
    case "cjs":
      return "cjs";
    case "iife":
      return "iife";
    default:
      return "es";
  }
};

// ============================================================
// Sourcemap mapping
// ============================================================

/**
 * Maps the esbuild-style sourcemap option to the rollup sourcemap option.
 *
 * @param sourcemap - The esbuild sourcemap option.
 * @returns The rollup-compatible sourcemap option.
 */
const mapSourcemap = (
  sourcemap: boolean | "inline" | "external" | undefined,
): boolean | "inline" | "hidden" => {
  if (sourcemap === true || sourcemap === "external") {
    return true;
  }
  if (sourcemap === "inline") {
    return "inline";
  }
  return false;
};

// ============================================================
// build()
// ============================================================

/**
 * Build JavaScript bundles using an esbuild-compatible interface.
 *
 * Internally delegates to steamroller's rollup() + generate() pipeline,
 * translating esbuild-style options to rollup options and converting
 * the output back into an esbuild-like result object.
 *
 * @param options - esbuild-style build options.
 * @returns A BuildResult containing output files, errors, and warnings.
 */
export const build = async (options: BuildOptions): Promise<BuildResult> => {
  const errors: Array<BuildMessage> = [];
  const warnings: Array<BuildMessage> = [];

  // Determine entry points
  const entryPoints = options.entryPoints ?? [];
  if (entryPoints.length === 0) {
    errors.push({ text: "No entry points provided" });
    return { outputFiles: [], errors, warnings };
  }

  // Validate splitting constraints
  if (options.splitting) {
    if (options.outfile) {
      errors.push({
        text: "splitting requires outdir, not outfile — multiple chunks cannot be written to a single file",
      });
      return { outputFiles: [], errors, warnings };
    }
    if (options.format && options.format !== "esm") {
      errors.push({
        text: `splitting is only supported with format "esm", got "${options.format}"`,
      });
      return { outputFiles: [], errors, warnings };
    }
  }

  // Build the input option — single string for one entry, array for multiple
  const input: string | ReadonlyArray<string> =
    entryPoints.length === 1 ? entryPoints[0] : entryPoints;

  // Map external option
  const external: ReadonlyArray<string> | undefined = options.external;

  // Build plugins array
  const plugins: Array<Plugin> = [];

  // Alias plugin: remap import specifiers to cwd-relative paths
  if (options.alias) {
    const aliasEntries = Object.entries(options.alias);
    plugins.push({
      name: "steamroller-alias",
      resolveId(source: string) {
        for (let i = 0; i < aliasEntries.length; i++) {
          const [key, value] = aliasEntries[i];
          if (source === key || source.startsWith(key + "/")) {
            const remainder = source === key ? "" : source.slice(key.length);
            return resolve(process.cwd(), value + remainder);
          }
        }
        return null;
      },
    });
  }

  // Translate to rollup InputOptions
  const inputOptions: InputOptions = {
    input,
    external: external as InputOptions["external"],
    plugins: plugins.length > 0 ? plugins : undefined,
    treeshake: options.bundle !== false,
    onLog: (_level, log) => {
      const rollupLog = log as RollupLog;
      warnings.push({
        text: typeof log === "string" ? log : rollupLog.message,
        location: rollupLog.loc
          ? {
              file: rollupLog.loc.file,
              line: rollupLog.loc.line,
              column: rollupLog.loc.column,
            }
          : null,
      });
    },
  };

  // Determine output file/dir
  const outfile = options.outfile;
  const outdir = options.outdir ?? (outfile ? undefined : "dist");

  // Translate to rollup OutputOptions
  const outputOptions: OutputOptions = {
    format: mapFormat(options.format),
    file: outfile,
    dir: outdir,
    sourcemap: mapSourcemap(options.sourcemap),
    compact: options.minify === true,
    banner: options.banner?.js,
    chunkFileNames: options.splitting ? options.chunkNames : undefined,
  };

  try {
    const bundle = await rollup(inputOptions);

    try {
      const result = await bundle.generate(outputOptions);

      // Convert rollup output to esbuild-style outputFiles
      const outputFiles: Array<BuildOutputFile> = [];
      const encoder = new TextEncoder();

      for (let i = 0; i < result.output.length; i++) {
        const item = result.output[i];
        if (item.type === "chunk") {
          const chunk = item as OutputChunk;
          const filePath =
            outfile ??
            (outdir ? `${outdir}/${chunk.fileName}` : chunk.fileName);
          const text = chunk.code;
          const contents = encoder.encode(text);
          outputFiles.push({ path: filePath, contents, text });

          // If sourcemap is generated and present, emit it as a separate file
          if (chunk.map) {
            const mapText = JSON.stringify(chunk.map);
            const mapContents = encoder.encode(mapText);
            outputFiles.push({
              path: `${filePath}.map`,
              contents: mapContents,
              text: mapText,
            });
          }
        } else if (item.type === "asset") {
          const asset = item as OutputAsset;
          const filePath = outdir
            ? `${outdir}/${asset.fileName}`
            : asset.fileName;
          const text =
            typeof asset.source === "string"
              ? asset.source
              : new TextDecoder().decode(asset.source);
          const contents =
            typeof asset.source === "string"
              ? encoder.encode(asset.source)
              : new Uint8Array(asset.source);
          outputFiles.push({ path: filePath, contents, text });
        }
      }

      await bundle.close();
      return { outputFiles, errors, warnings };
    } catch (generateError: unknown) {
      await bundle.close();
      throw generateError;
    }
  } catch (buildError: unknown) {
    const message =
      buildError instanceof Error ? buildError.message : String(buildError);
    errors.push({ text: message });
    return { outputFiles: [], errors, warnings };
  }
};
