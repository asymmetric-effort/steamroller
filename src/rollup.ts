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
import { OutputHookExecutor } from "./plugins/output-hooks.js";
import { ModuleLoader } from "./module/loader.js";
import type {
  LoadHook,
  TransformHook,
  ModuleParsedHook,
} from "./module/loader.js";
import { buildModuleGraph } from "./module/graph.js";
import { defaultResolve, isExternal } from "./module/resolve.js";
import { createNodeFs } from "./fs/node-fs.js";
import { analyzeScopes } from "./tree-shaking/scope.js";
import type { Scope } from "./tree-shaking/scope.js";
import type { Binding, Reference } from "./tree-shaking/scope.js";
import { collectPureAnnotations } from "./tree-shaking/pure.js";
import { analyzeModuleSideEffects } from "./tree-shaking/side-effects.js";
import { treeShake } from "./tree-shaking/engine.js";
import type {
  ModuleBindingInfo,
  StatementInfo,
  TreeShakeResult,
} from "./tree-shaking/engine.js";
import { Module } from "./module/Module.js";
import type * as AST from "./ast/types.js";
import { FileEmitter } from "./plugins/plugin-context-emit.js";
import { maybeCreateTypescriptPlugin } from "./plugins/typescript-plugin.js";
import { maybeCreateCSSPlugin } from "./plugins/css-plugin.js";
import { createBuiltinLoaders } from "./loaders/index.js";

/**
 * Collect all references from a scope tree using iterative traversal.
 * Walks the scope and all child scopes to gather every reference.
 *
 * @param rootScope - The root scope to traverse.
 * @returns All references found in the scope tree.
 */
const collectAllReferences = (rootScope: Scope): ReadonlyArray<Reference> => {
  const refs: Array<Reference> = [];
  const scopeStack: Array<Scope> = [rootScope];

  while (scopeStack.length > 0) {
    const current = scopeStack.pop()!;
    for (let i = 0; i < current.references.length; i++) {
      refs.push(current.references[i]);
    }
    for (let i = current.children.length - 1; i >= 0; i--) {
      scopeStack.push(current.children[i]);
    }
  }

  return refs;
};

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

  // Step 1b: Auto-register TypeScript plugin if needed
  const inputFiles = Array.isArray(normalized.input)
    ? [...normalized.input]
    : Object.values(normalized.input);
  const tsPlugin = maybeCreateTypescriptPlugin(inputFiles, [
    ...normalized.plugins,
  ]);
  const pluginsWithTs: ReadonlyArray<Plugin> = tsPlugin
    ? [tsPlugin, ...normalized.plugins]
    : normalized.plugins;

  // Step 1c: Auto-register CSS plugin if needed
  const cssPlugin = maybeCreateCSSPlugin(inputFiles, [...pluginsWithTs]);
  const pluginsWithCss: ReadonlyArray<Plugin> = cssPlugin
    ? [cssPlugin, ...pluginsWithTs]
    : pluginsWithTs;

  // Step 1d: Auto-register built-in loaders (JSON, asset, text, WASM)
  // Built-in loaders are appended after user plugins so user plugins take priority
  const builtinLoaderNames = [
    "steamroller:json",
    "steamroller:asset",
    "steamroller:text",
    "steamroller:wasm",
  ];
  const hasUserOverride = (name: string): boolean =>
    pluginsWithCss.some(
      (p) =>
        p.name === name || p.name.toLowerCase().includes(name.split(":")[1]),
    );
  const builtinLoaders = createBuiltinLoaders();
  const filteredLoaders = builtinLoaders.filter(
    (loader) => !hasUserOverride(loader.name),
  );
  const allPlugins: ReadonlyArray<Plugin> = [
    ...pluginsWithCss,
    ...filteredLoaders,
  ];

  // Step 2: Create plugin driver
  const warnings: Array<{ code: string; message: string }> = [];
  for (let i = 0; i < inputWarnings.length; i++) {
    const w = inputWarnings[i];
    if (w.code) {
      warnings.push({ code: w.code, message: w.message });
    }
  }
  const pluginDriver = new PluginDriver(allPlugins, (warning) => {
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
  const moduleParsedHook: ModuleParsedHook = async (info: unknown) => {
    await buildHookExecutor.moduleParsed(
      info as Parameters<typeof buildHookExecutor.moduleParsed>[0],
    );
  };

  const moduleLoader = new ModuleLoader({
    fs,
    maxParallelFileOps: finalOptions.maxParallelFileOps,
    loadHooks: [loadHook],
    transformHooks: [transformHook],
    moduleParsedHooks: [moduleParsedHook],
  });

  // Create resolveDynamicImport function
  const resolveDynamicImportFn = async (
    specifier: string,
    importer: string,
  ): Promise<ResolvedId | string | null> => {
    return buildHookExecutor.resolveDynamicImport(specifier, importer, {
      attributes: {},
    });
  };

  const graph = await buildModuleGraph({
    input: finalOptions.input,
    resolveId: resolveIdFn,
    resolveDynamicImport: resolveDynamicImportFn,
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

  // Step 7: Tree-shaking
  let treeShakeResult: TreeShakeResult | undefined;
  const includedStatementsByModule = new Map<string, ReadonlySet<number>>();

  if (finalOptions.treeshake !== false) {
    const tsOpts = finalOptions.treeshake;
    const modules = graph.modules.filter(
      (m): m is Module => m instanceof Module,
    );
    const moduleInfos = new Map<Module, ModuleBindingInfo>();

    // Build binding info for each module
    for (let i = 0; i < modules.length; i++) {
      const mod = modules[i];
      if (mod.ast === null) {
        continue;
      }

      const scope = analyzeScopes(mod.ast);
      const pureAnnotations = collectPureAnnotations(mod.code, mod.ast);
      const sideEffectAnalysis = analyzeModuleSideEffects(
        mod.ast,
        scope,
        pureAnnotations,
        tsOpts.manualPureFunctions as ReadonlyArray<string>,
      );

      // Build a set of side-effect node positions for quick lookup
      const sideEffectNodeStarts = new Set<number>();
      for (let se = 0; se < sideEffectAnalysis.sideEffectNodes.length; se++) {
        sideEffectNodeStarts.add(sideEffectAnalysis.sideEffectNodes[se].start);
      }

      // Collect all resolved references from the scope (including child scopes)
      const allReferences = collectAllReferences(scope);

      // Build StatementInfo for each top-level statement
      const statements: Array<StatementInfo> = [];
      const sideEffectStatements: Array<StatementInfo> = [];
      const body = mod.ast.body;
      const allBindings = Array.from(scope.bindings.values());

      for (let j = 0; j < body.length; j++) {
        const node = body[j] as AST.BaseNode;

        // Find bindings declared in this statement
        const declaredBindings: Array<Binding> = [];
        for (let k = 0; k < allBindings.length; k++) {
          const binding = allBindings[k];
          if (
            binding.node.start >= node.start &&
            binding.node.end <= node.end
          ) {
            declaredBindings.push(binding);
          }
        }

        // Find all references within this statement and link them to declared
        // bindings so the engine can trace from a binding's inclusion to
        // all other bindings referenced in the same statement.
        const stmtRefs: Array<Binding> = [];
        for (let k = 0; k < allReferences.length; k++) {
          const ref = allReferences[k];
          if (
            ref.node.start >= node.start &&
            ref.node.end <= node.end &&
            ref.binding !== null
          ) {
            stmtRefs.push(ref.binding);
          }
        }

        // For each declared binding, add synthetic references to all other
        // bindings referenced in the same statement, so the engine can
        // discover them via reference tracing.
        for (let k = 0; k < declaredBindings.length; k++) {
          const decl = declaredBindings[k];
          for (let r = 0; r < stmtRefs.length; r++) {
            const target = stmtRefs[r];
            if (target !== decl) {
              decl.references.push({
                name: target.name,
                node: target.node,
                scope: target.scope,
                binding: target,
              });
            }
          }
        }

        // Use analyzeModuleSideEffects result to determine side effects
        const isSideEffectNode = sideEffectNodeStarts.has(node.start);

        const stmtInfo: StatementInfo = {
          index: j,
          sideEffectResult: isSideEffectNode ? "definite" : "none",
          declaredBindings,
          isIncluded: false,
        };

        statements.push(stmtInfo);

        if (isSideEffectNode) {
          sideEffectStatements.push(stmtInfo);
        }
      }

      moduleInfos.set(mod, {
        module: mod,
        scope,
        bindings: allBindings,
        sideEffectStatements,
        statements,
      });
    }

    // Build a map from module ID to Module for cross-module resolution
    const moduleById = new Map<string, Module>();
    for (let i = 0; i < modules.length; i++) {
      moduleById.set(modules[i].id, modules[i]);
    }

    // Link import bindings to their corresponding export bindings across modules.
    // When an import binding is included by the engine, it traces references;
    // we add a synthetic reference from the import binding to the target
    // module's export binding so the engine can cross module boundaries.
    for (let i = 0; i < modules.length; i++) {
      const mod = modules[i];
      const info = moduleInfos.get(mod);
      if (info === undefined) {
        continue;
      }

      for (let j = 0; j < mod.imports.length; j++) {
        const imp = mod.imports[j];

        // Find the dependency module
        let depModule: Module | undefined;
        for (const dep of mod.dependencies) {
          if (
            dep instanceof Module &&
            (dep.id.endsWith(imp.source) ||
              dep.id.includes(imp.source.replace(/^\.\//, "")))
          ) {
            depModule = dep;
            break;
          }
        }
        if (depModule === undefined) {
          continue;
        }

        const depInfo = moduleInfos.get(depModule);
        if (depInfo === undefined) {
          continue;
        }

        // For each specifier, link the local import binding to the
        // exported binding in the dependency
        for (let k = 0; k < imp.specifiers.length; k++) {
          const spec = imp.specifiers[k];
          const importBinding = info.scope.bindings.get(spec.local);
          if (importBinding === undefined) {
            continue;
          }

          // Find the exported binding name in the dep module
          const importedName =
            spec.imported === "default" ? "default" : spec.imported;
          let targetBindingName: string | undefined;

          for (let e = 0; e < depModule.exports.length; e++) {
            const exp = depModule.exports[e];
            const exportedName = exp.exported ?? exp.local ?? "";
            if (exportedName === importedName) {
              targetBindingName = exp.local ?? exp.exported ?? "";
              break;
            }
          }

          if (targetBindingName === undefined) {
            continue;
          }

          const targetBinding = depInfo.scope.bindings.get(targetBindingName);
          if (targetBinding === undefined) {
            continue;
          }

          // Add a synthetic reference from the import binding to the
          // target binding so the engine traces across modules
          importBinding.references.push({
            name: targetBinding.name,
            node: targetBinding.node,
            scope: targetBinding.scope,
            binding: targetBinding,
          });
        }
      }
    }

    // Determine entry exports
    const entryExports = new Map<Module, ReadonlyArray<string>>();
    for (let i = 0; i < modules.length; i++) {
      const mod = modules[i];
      if (mod.isEntry) {
        const exportNames: Array<string> = [];
        for (let j = 0; j < mod.exports.length; j++) {
          const exp = mod.exports[j];
          if (exp.type === "all") {
            exportNames.push("*");
          } else {
            const name = exp.exported ?? exp.local ?? "";
            if (name.length > 0) {
              exportNames.push(name);
            }
          }
        }
        entryExports.set(mod, exportNames);
      }
    }

    // Run tree-shaking engine
    treeShakeResult = treeShake(
      modules,
      entryExports,
      {
        enabled: true,
        moduleSideEffects: tsOpts.moduleSideEffects,
        propertyReadSideEffects: tsOpts.propertyReadSideEffects,
        tryCatchDeoptimization: tsOpts.tryCatchDeoptimization,
        unknownGlobalSideEffects: tsOpts.unknownGlobalSideEffects,
        manualPureFunctions: tsOpts.manualPureFunctions,
      },
      moduleInfos,
    );

    // Record which statement indices are included per module
    for (const [mod, info] of moduleInfos) {
      const included = new Set<number>();
      for (let i = 0; i < info.statements.length; i++) {
        if (info.statements[i].isIncluded) {
          included.add(info.statements[i].index);
        }
      }
      includedStatementsByModule.set(mod.id, included);
    }
  } else {
    // Tree-shaking disabled: mark all modules as included
    for (let i = 0; i < graph.modules.length; i++) {
      const mod = graph.modules[i];
      if (mod instanceof Module) {
        mod.isIncluded = true;
      }
    }
  }

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

  // Create file emitter for plugin asset emission
  const fileEmitter = new FileEmitter({ pluginName: "steamroller" });

  // Create output hook executor for output phase
  const outputHookExecutor = new OutputHookExecutor(pluginDriver, fileEmitter);

  const buildState: BuildState = {
    modules: graph.modules,
    cache: finalOptions.cache || undefined,
    watchFiles,
    getTimings: finalOptions.perf ? () => ({}) : undefined,
    treeShakeResult,
    includedStatementsByModule,
    outputHookExecutor,
    inputOptions: finalOptions,
    fileEmitter,
  };

  return createRollupBuild(buildState);
};
