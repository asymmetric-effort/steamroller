/**
 * @module rollup
 * @description Main rollup() entry function that orchestrates the full build.
 * Normalizes options, creates the plugin driver, runs hooks,
 * builds the module graph, applies tree-shaking, and returns a RollupBuild.
 */

import type {
  InputOptions,
  RollupBuild,
  NormalizedInputOptions,
  Plugin,
  ResolvedId,
  RollupLog,
} from "./types.js";
import { normalizeInputOptions } from "./config/normalize-input.js";
import { validateInputOptions } from "./config/validate.js";
import { PluginDriver } from "./plugins/driver.js";
import { BuildHookExecutor } from "./plugins/build-hooks.js";
import { createRollupBuild } from "./build/rollup-build.js";
import type { BuildState } from "./build/rollup-build.js";
import { ModuleLoader } from "./module/loader.js";
import type {
  LoadHook,
  TransformHook,
  ModuleParsedHook,
} from "./module/loader.js";
import { buildModuleGraph } from "./module/graph.js";
import { defaultResolve, isExternal } from "./module/resolve.js";
import { createNodeFs } from "./fs/node-fs.js";

/**
 * Run the options hook across all plugins, allowing them to mutate options.
 *
 * @param options - The raw input options.
 * @param plugins - The resolved plugins.
 * @returns Potentially modified input options.
 */
const runOptionsHook = async (
  options: InputOptions,
  plugins: ReadonlyArray<Plugin>,
): Promise<InputOptions> => {
  let currentOptions = options;
  for (let i = 0; i < plugins.length; i++) {
    const plugin = plugins[i];
    if (!plugin.options) {
      continue;
    }
    const hookValue = plugin.options;
    const hook =
      typeof hookValue === "function"
        ? hookValue
        : (hookValue as unknown as { readonly handler: unknown }).handler;
    if (typeof hook !== "function") {
      continue;
    }
    const result = await (
      hook as (
        options: InputOptions,
      ) => Promise<InputOptions | null | undefined>
    )(currentOptions);
    if (result) {
      currentOptions = result;
    }
  }
  return currentOptions;
};

/**
 * The main rollup() function that performs the full build pipeline.
 *
 * Steps:
 * 1. Validate and normalize input options
 * 2. Create plugin driver
 * 3. Run options hook
 * 4. Re-normalize after options hook modifications
 * 5. Run buildStart hook
 * 6. Build module graph (resolve + load + transform + parse)
 * 7. Run tree-shaking
 * 8. Run buildEnd hook
 * 9. Return RollupBuild object
 *
 * @param rawOptions - Raw input options provided by the user.
 * @returns A RollupBuild object with generate() and write() methods.
 */
export const rollup = async (
  rawOptions: InputOptions,
): Promise<RollupBuild> => {
  // Step 1: Validate options
  const inputWarnings = validateInputOptions(rawOptions);
  const normalized = normalizeInputOptions(rawOptions);

  // Step 2: Create plugin driver
  const warnings: Array<{ code: string; message: string }> = [];
  for (let i = 0; i < inputWarnings.length; i++) {
    const w = inputWarnings[i];
    if (w.code) {
      warnings.push({ code: w.code, message: w.message });
    }
  }
  const pluginDriver = new PluginDriver(normalized.plugins, (warning) => {
    warnings.push(warning);
  });

  // Step 3: Run options hook
  const modifiedOptions = await runOptionsHook(rawOptions, normalized.plugins);

  // Step 4: Re-normalize after potential modifications
  const finalOptions: NormalizedInputOptions =
    modifiedOptions === rawOptions
      ? normalized
      : normalizeInputOptions(modifiedOptions);

  // Step 5: Run buildStart hook
  await pluginDriver.hookParallel("buildStart", [finalOptions]);

  // Step 6: Build module graph
  const buildHookExecutor = new BuildHookExecutor(pluginDriver);
  const fs = createNodeFs();

  // Create resolve function that chains plugin resolveId with defaultResolve fallback
  const resolveIdFn = async (
    source: string,
    importer: string | undefined,
    isEntry: boolean,
  ): Promise<ResolvedId | null> => {
    const pluginResult = await buildHookExecutor.resolveId(source, importer, {
      isEntry,
      attributes: {},
    });

    if (pluginResult !== null) {
      if (typeof pluginResult === "string") {
        const ext = isExternal(
          pluginResult,
          source,
          importer,
          finalOptions.external,
        );
        return {
          id: pluginResult,
          external: ext,
          moduleSideEffects: true,
          syntheticNamedExports: false,
          meta: {},
          resolvedBy: "plugin",
        };
      }
      return pluginResult;
    }

    // Check if the source itself is external (handles bare specifiers)
    const sourceIsExternal = isExternal(
      source,
      source,
      importer,
      finalOptions.external,
    );
    if (sourceIsExternal) {
      return {
        id: source,
        external: true,
        moduleSideEffects: true,
        syntheticNamedExports: false,
        meta: {},
        resolvedBy: "default",
      };
    }

    // Fallback to default resolution
    const resolved = defaultResolve(source, importer);
    if (!resolved) {
      return null;
    }

    const ext = isExternal(resolved, source, importer, finalOptions.external);
    return {
      id: resolved,
      external: ext,
      moduleSideEffects: true,
      syntheticNamedExports: false,
      meta: {},
      resolvedBy: "default",
    };
  };

  // Create load hook from plugin driver
  const loadHook: LoadHook = async (id: string) => {
    const result = await buildHookExecutor.load(id);
    if (result === null || result === undefined) {
      return null;
    }
    // Normalize string result to LoadResult object
    if (typeof result === "string") {
      return { code: result };
    }
    return {
      code: result.code,
      map: result.map,
      ast: result.ast,
      meta: result.meta,
      syntheticNamedExports: result.syntheticNamedExports,
      moduleSideEffects: result.moduleSideEffects,
    };
  };

  // Create transform hook from plugin driver
  const transformHook: TransformHook = async (code: string, id: string) => {
    const result = await buildHookExecutor.transform(code, id);
    if (result.code === code && result.map === undefined) {
      return null;
    }
    return { code: result.code, map: result.map };
  };

  // Create moduleParsed hook
  const moduleParsedHook: ModuleParsedHook = async () => {
    // moduleParsed notification handled by graph construction
  };

  const moduleLoader = new ModuleLoader({
    fs,
    maxParallelFileOps: finalOptions.maxParallelFileOps,
    loadHooks: [loadHook],
    transformHooks: [transformHook],
    moduleParsedHooks: [moduleParsedHook],
  });

  const graph = await buildModuleGraph({
    input: finalOptions.input,
    resolveId: resolveIdFn,
    loadModule: async (id: string) => {
      const loaded = await moduleLoader.loadModule(id);
      return {
        code: loaded.code,
        ast: loaded.ast,
        meta: { ...(loaded.meta as Record<string, unknown>) },
        moduleSideEffects: loaded.moduleSideEffects,
        syntheticNamedExports: loaded.syntheticNamedExports,
      };
    },
    onWarning: (warning) => {
      warnings.push({ code: warning.code, message: warning.message });
    },
    shimMissingExports: finalOptions.shimMissingExports,
  });

  // Step 7: Tree-shaking is applied during module graph construction
  // (handled by the tree-shaking engine when modules are loaded)

  // Step 8: Run buildEnd hook
  await pluginDriver.hookParallel("buildEnd", []);

  // Step 9: Emit warnings via onLog
  for (let i = 0; i < warnings.length; i++) {
    finalOptions.onLog("warn", {
      code: warnings[i].code,
      message: warnings[i].message,
    });
  }

  // Step 10: Create and return RollupBuild
  const watchFiles: Array<string> = [];
  for (let i = 0; i < graph.modules.length; i++) {
    watchFiles.push(graph.modules[i].id);
  }
  for (let i = 0; i < graph.externalModules.length; i++) {
    watchFiles.push(graph.externalModules[i].id);
  }

  const buildState: BuildState = {
    modules: graph.modules,
    cache: finalOptions.cache || undefined,
    watchFiles,
    getTimings: finalOptions.perf ? () => ({}) : undefined,
  };

  return createRollupBuild(buildState);
};
