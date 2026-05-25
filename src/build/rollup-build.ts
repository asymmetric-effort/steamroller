/**
 * @module build/rollup-build
 * @description Creates RollupBuild objects that represent a completed build.
 * Provides generate(), write(), and close() methods along with
 * cache, watchFiles, and getTimings accessors.
 */

import type {
  RollupBuild,
  RollupOutput,
  OutputOptions,
  RollupCache as RollupCacheType,
  OutputChunk,
  SerializedTimings,
} from "../types.js";

/**
 * Immutable state describing the result of a build phase.
 * Passed to createRollupBuild to construct the public RollupBuild interface.
 */
export interface BuildState {
  /** Modules resolved during the build. */
  readonly modules: ReadonlyArray<unknown>;
  /** Cache data for incremental rebuilds. */
  readonly cache: RollupCacheType | undefined;
  /** Files that triggered this build (watched inputs). */
  readonly watchFiles: ReadonlyArray<string>;
  /** Optional timing function when perf mode is enabled. */
  readonly getTimings?: () => SerializedTimings;
}

/**
 * Generates output from build state and output options.
 * Creates a minimal output with an entry chunk.
 * Future format implementations will fill in full code generation.
 *
 * @param state - The build state containing modules and cache
 * @param options - Output options controlling format, file names, etc.
 * @returns A RollupOutput containing at least one entry chunk
 */
const generateOutput = async (
  _state: BuildState,
  options: OutputOptions,
): Promise<RollupOutput> => {
  const fileName = options.file ?? "bundle.js";
  const format = options.format ?? "es";

  const chunk: OutputChunk = {
    type: "chunk",
    code: "",
    fileName,
    preliminaryFileName: fileName,
    sourcemapFileName: null,
    map: null,
    exports: [],
    facadeModuleId: null,
    isDynamicEntry: false,
    isEntry: true,
    isImplicitEntry: false,
    moduleIds: [],
    name: "bundle",
    dynamicImports: [],
    implicitlyLoadedBefore: [],
    importedBindings: {},
    imports: [],
    modules: {},
    referencedFiles: [],
  };

  // Suppress unused variable warning — format will be used by format implementations
  void format;

  return { output: [chunk] };
};

/**
 * Writes generated output to disk.
 * Placeholder implementation — will use fs module in future.
 *
 * @param _output - The generated output to write
 * @param _options - Output options specifying directory/file targets
 */
const writeOutput = async (
  _output: RollupOutput,
  _options: OutputOptions,
): Promise<void> => {
  // Will use fs module to write files when format implementations are complete.
};

/**
 * Creates a RollupBuild object from build state.
 * The returned object exposes the Rollup-compatible build API:
 * - generate() to produce output bundles in memory
 * - write() to produce and write output bundles to disk
 * - close() to release resources and mark the build as done
 * - cache, watchFiles, getTimings accessors for build metadata
 *
 * @param state - The build state to wrap in a RollupBuild
 * @returns A RollupBuild conforming to the Rollup API
 * @throws Error if generate() or write() is called after close()
 */
export const createRollupBuild = (state: BuildState): RollupBuild => {
  const internal: { closed: boolean } = { closed: false };

  const build: RollupBuild = {
    get cache(): RollupCacheType | undefined {
      return state.cache;
    },

    get closed(): boolean {
      return internal.closed;
    },

    get watchFiles(): ReadonlyArray<string> {
      return state.watchFiles;
    },

    get getTimings(): (() => SerializedTimings) | undefined {
      return state.getTimings;
    },

    async generate(outputOptions: OutputOptions): Promise<RollupOutput> {
      if (internal.closed) {
        throw new Error("Bundle is already closed");
      }
      return generateOutput(state, outputOptions);
    },

    async write(outputOptions: OutputOptions): Promise<RollupOutput> {
      if (internal.closed) {
        throw new Error("Bundle is already closed");
      }
      const output = await generateOutput(state, outputOptions);
      await writeOutput(output, outputOptions);
      return output;
    },

    async close(): Promise<void> {
      internal.closed = true;
    },
  };

  return build;
};
