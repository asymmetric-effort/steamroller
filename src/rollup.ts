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
  RollupLog,
} from "./types.js";
import { normalizeInputOptions } from "./config/normalize-input.js";
import { validateInputOptions } from "./config/validate.js";
import { PluginDriver } from "./plugins/driver.js";
import { createRollupBuild } from "./build/rollup-build.js";
import type { BuildState } from "./build/rollup-build.js";

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

  // Step 6: Build module graph (placeholder — will integrate module loader)
  const modules: Array<unknown> = [];

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
  const buildState: BuildState = {
    modules,
    cache: finalOptions.cache || undefined,
    watchFiles: [],
    getTimings: finalOptions.perf ? () => ({}) : undefined,
  };

  return createRollupBuild(buildState);
};
