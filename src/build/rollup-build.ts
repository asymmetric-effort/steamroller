/**
 * @module build/rollup-build
 * @description Creates RollupBuild objects that represent a completed build.
 * Provides generate(), write(), and close() methods along with
 * cache, watchFiles, and getTimings accessors.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  RollupBuild,
  RollupOutput,
  OutputOptions,
  RollupCache as RollupCacheType,
  OutputChunk,
  SerializedTimings,
  ModuleFormat,
  RenderedModule as OutputRenderedModule,
} from "../types.js";
import { Module } from "../module/Module.js";
import { ExternalModule } from "../module/ExternalModule.js";
import { MagicString } from "../sourcemap/magic-string.js";
import { concatenateModules } from "../codegen/concatenate.js";
import type { RenderedModule as ConcatModule } from "../codegen/concatenate.js";
import { resolveAllAddons, applyAddons } from "../codegen/addons.js";
import type { AddonValue } from "../codegen/addons.js";
import { getFormatWrapper } from "../formats/index.js";
import type {
  FormatOptions,
  ImportBinding,
  ExportBinding,
} from "../formats/shared.js";
import { getExportMode } from "../formats/shared.js";
import { OutputHookExecutor } from "../plugins/output-hooks.js";
import type { TreeShakeResult } from "../tree-shaking/engine.js";
import { detectSplitPoints } from "../splitting/split-points.js";
import type { SplittableModule } from "../splitting/split-points.js";
import { assignChunks } from "../splitting/chunk-assignment.js";
import { resolveChunkFileName } from "../splitting/chunk-naming.js";

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
  /** Optional executor for firing output-phase plugin hooks (e.g. closeBundle). */
  readonly outputHookExecutor?: OutputHookExecutor;
  /** Tree-shaking result summary, undefined if tree-shaking was disabled. */
  readonly treeShakeResult?: TreeShakeResult;
  /** Map from module ID to the set of included statement indices. */
  readonly includedStatementsByModule?: ReadonlyMap<
    string,
    ReadonlySet<number>
  >;
}

/**
 * Determines whether a given import source is internal (bundled) given the module set.
 *
 * @param source - The import source string
 * @param moduleIds - Set of all internal module IDs
 * @param importerModule - The module containing the import
 * @returns true if the import is internal
 */
const isInternalImport = (source: string, importerModule: Module): boolean => {
  for (const dep of importerModule.dependencies) {
    if (dep instanceof Module) {
      // Check if the source resolves to this dependency
      if (
        dep.id.endsWith(source) ||
        dep.id.includes(source.replace(/^\.\//, ""))
      ) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Get external imports for a module by checking its dependencies.
 *
 * @param mod - The module to inspect
 * @returns Array of import bindings for external dependencies
 */
const getExternalImportBindings = (
  mod: Module,
): ReadonlyArray<ImportBinding> => {
  const bindings: Array<ImportBinding> = [];
  for (let i = 0; i < mod.imports.length; i++) {
    const imp = mod.imports[i];
    let isExternal = false;
    for (const dep of mod.dependencies) {
      if (dep instanceof ExternalModule) {
        if (dep.id === imp.source) {
          isExternal = true;
          break;
        }
      }
    }
    if (isExternal) {
      for (let j = 0; j < imp.specifiers.length; j++) {
        const spec = imp.specifiers[j];
        bindings.push({
          source: imp.source,
          imported: spec.imported,
          local: spec.local,
        });
      }
    }
  }
  return bindings;
};

/**
 * Get export bindings from the entry module.
 *
 * @param mod - The entry module
 * @returns Array of export bindings
 */
const getExportBindings = (mod: Module): ReadonlyArray<ExportBinding> => {
  const bindings: Array<ExportBinding> = [];
  for (let i = 0; i < mod.exports.length; i++) {
    const exp = mod.exports[i];
    if (exp.type === "default") {
      bindings.push({ exported: "default", local: exp.local ?? "default" });
    } else if (exp.type === "named") {
      bindings.push({
        exported: exp.exported ?? exp.local ?? "",
        local: exp.local ?? exp.exported ?? "",
      });
    }
  }
  return bindings;
};

/**
 * Render a single module by removing internal import declarations and
 * stripping export keywords from declarations. When tree-shaking results
 * are available, excluded statements are removed from the output.
 *
 * @param mod - The module to render
 * @param isEntry - Whether this module is the entry point
 * @param format - The output format
 * @param includedStatements - Optional set of statement indices that tree-shaking included
 * @returns The rendered code string
 */
const renderSingleModule = (
  mod: Module,
  isEntry: boolean,
  format: ModuleFormat,
  includedStatements?: ReadonlySet<number>,
): string => {
  const ms = new MagicString(mod.code);

  if (mod.ast === null) {
    return mod.code;
  }

  const body = mod.ast.body;
  for (let i = 0; i < body.length; i++) {
    const node = body[i];

    // If tree-shaking is active and this statement is not included, remove it
    // (but always keep import declarations — they are handled separately below)
    if (
      includedStatements !== undefined &&
      !includedStatements.has(i) &&
      node.type !== "ImportDeclaration"
    ) {
      ms.remove(node.start, node.end);
      continue;
    }

    if (node.type === "ImportDeclaration") {
      // Check if this is an internal import (should be removed)
      const source = (node as { source: { value: unknown } }).source
        .value as string;
      if (isInternalImport(source, mod)) {
        ms.remove(node.start, node.end);
      } else if (format === "cjs") {
        // External imports are handled by the format wrapper, remove them
        ms.remove(node.start, node.end);
      }
      // For ES format, external imports are kept as-is
    } else if (node.type === "ExportNamedDeclaration") {
      const exportNode = node as {
        start: number;
        end: number;
        declaration: { start: number; end: number; type: string } | null;
        specifiers: ReadonlyArray<unknown>;
        source: { value: unknown } | null;
      };

      if (exportNode.source !== null) {
        // Re-export from another module - remove for internal, keep for external
        const reSource = exportNode.source.value as string;
        if (isInternalImport(reSource, mod)) {
          ms.remove(node.start, node.end);
        }
      } else if (exportNode.declaration !== null) {
        // export const x = ... -> const x = ...
        // Remove the 'export ' keyword prefix
        if (!isEntry || format === "cjs") {
          ms.overwrite(node.start, exportNode.declaration.start, "");
        }
      } else if (exportNode.specifiers.length > 0) {
        // export { x, y } — remove if not entry or if CJS
        if (!isEntry || format === "cjs") {
          ms.remove(node.start, node.end);
        }
      }
    } else if (node.type === "ExportDefaultDeclaration") {
      const exportDefault = node as {
        start: number;
        end: number;
        declaration: { start: number; end: number; type: string };
      };
      if (!isEntry || format === "cjs") {
        // Remove 'export default ' for non-entry or CJS
        if (
          exportDefault.declaration.type === "FunctionDeclaration" ||
          exportDefault.declaration.type === "ClassDeclaration"
        ) {
          ms.overwrite(node.start, exportDefault.declaration.start, "");
        }
      }
    } else if (node.type === "ExportAllDeclaration") {
      const exportAll = node as {
        source: { value: unknown };
        start: number;
        end: number;
      };
      const reSource = exportAll.source.value as string;
      if (isInternalImport(reSource, mod)) {
        ms.remove(node.start, node.end);
      }
    }
  }

  return ms.toString().trim();
};

/**
 * Check whether any module in the graph has dynamic imports.
 *
 * @param modules - The module list to inspect
 * @returns true if at least one module contains a dynamic import
 */
const hasDynamicImports = (modules: ReadonlyArray<Module>): boolean => {
  for (let i = 0; i < modules.length; i++) {
    if (modules[i].dynamicImports.length > 0) {
      return true;
    }
  }
  return false;
};

/**
 * Build a module ID to Module lookup map.
 *
 * @param modules - Modules to index
 * @returns Map from module ID to Module
 */
const buildModuleMap = (
  modules: ReadonlyArray<Module>,
): Map<string, Module> => {
  const map = new Map<string, Module>();
  for (let i = 0; i < modules.length; i++) {
    map.set(modules[i].id, modules[i]);
  }
  return map;
};

/**
 * Resolve a relative dynamic import source to its absolute module ID
 * by matching against known dependency IDs.
 *
 * @param source - Relative import source (e.g. "./c.js")
 * @param mod - The importing module
 * @param allModuleIds - Set of all known absolute module IDs
 * @returns The resolved absolute ID, or the original source if unresolvable
 */
const resolveDynamicImportId = (
  source: string,
  mod: Module,
  allModuleIds: ReadonlySet<string>,
): string => {
  // Check dependencies for a match
  for (const dep of mod.dependencies) {
    if (dep instanceof Module) {
      if (
        dep.id.endsWith(source.replace(/^\.\//, "")) ||
        dep.id.endsWith(source)
      ) {
        return dep.id;
      }
    }
  }
  // Fallback: check all module IDs
  for (const id of allModuleIds) {
    if (id.endsWith(source.replace(/^\.\//, "")) || id.endsWith(source)) {
      return id;
    }
  }
  return source;
};

/**
 * Convert Module instances to the SplittableModule interface needed by the
 * split-point detection and chunk assignment algorithms. Resolves dynamic
 * import sources from relative paths to absolute module IDs.
 *
 * @param modules - Modules to convert
 * @returns Array of SplittableModule representations
 */
const toSplittableModules = (
  modules: ReadonlyArray<Module>,
): Array<SplittableModule> => {
  const allModuleIds = new Set<string>();
  for (let i = 0; i < modules.length; i++) {
    allModuleIds.add(modules[i].id);
  }

  const result: Array<SplittableModule> = [];
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    const importedIds: Array<string> = [];
    const importerIds: Array<string> = [];
    const dynamicImporterIds: Array<string> = [];

    for (const dep of mod.dependencies) {
      if (dep instanceof Module) {
        importedIds.push(dep.id);
      }
    }
    for (const imp of mod.importers) {
      importerIds.push(imp.id);
    }

    // Resolve dynamic import sources to absolute IDs
    const resolvedDynamicIds: Array<string> = [];
    for (let j = 0; j < mod.dynamicImports.length; j++) {
      resolvedDynamicIds.push(
        resolveDynamicImportId(mod.dynamicImports[j], mod, allModuleIds),
      );
    }

    result.push({
      id: mod.id,
      isEntry: mod.isEntry,
      importedIds,
      dynamicallyImportedIds: resolvedDynamicIds,
      importers: importerIds,
      dynamicImporters: dynamicImporterIds,
    });
  }
  return result;
};

/**
 * Build a single OutputChunk for a given set of modules.
 *
 * @param chunkModules - Ordered modules belonging to this chunk
 * @param chunkName - Logical chunk name
 * @param isEntry - Whether this chunk is the entry chunk
 * @param facadeModule - The facade module for this chunk (entry or dynamic entry)
 * @param format - Output module format
 * @param state - Build state
 * @param options - Output options
 * @param dynamicChunkFileNames - Map from dynamic import source to the resolved chunk file name
 * @returns The rendered OutputChunk
 */
const buildSingleChunk = async (
  chunkModules: ReadonlyArray<Module>,
  chunkName: string,
  isEntry: boolean,
  facadeModule: Module,
  format: ModuleFormat,
  state: BuildState,
  options: OutputOptions,
  dynamicChunkFileNames: ReadonlyMap<string, string>,
): Promise<OutputChunk> => {
  // Render each module
  const renderedModules: Array<ConcatModule> = [];
  for (let i = 0; i < chunkModules.length; i++) {
    const mod = chunkModules[i];

    if (
      state.includedStatementsByModule !== undefined &&
      !mod.isIncluded &&
      mod !== facadeModule
    ) {
      continue;
    }

    const isFacade = mod === facadeModule;
    const modStatements = state.includedStatementsByModule?.get(mod.id);
    const rendered = renderSingleModule(mod, isFacade, format, modStatements);
    if (rendered.length > 0) {
      renderedModules.push({ id: mod.id, code: rendered });
    }
  }

  // For entry chunks, rewrite dynamic import() calls to point to chunk file names
  if (isEntry && dynamicChunkFileNames.size > 0) {
    for (let i = 0; i < renderedModules.length; i++) {
      const rm = renderedModules[i];
      let code = rm.code;
      for (const [source, chunkFile] of dynamicChunkFileNames) {
        // Replace import("./source") with import("./chunkFile")
        const patterns = [`import("${source}")`, `import('${source}')`];
        for (let p = 0; p < patterns.length; p++) {
          const target = `./${chunkFile}`;
          code = code.split(patterns[p]).join(`import("${target}")`);
        }
      }
      if (code !== rm.code) {
        renderedModules[i] = { id: rm.id, code };
      }
    }
  }

  const concatenated = concatenateModules(renderedModules);

  // Collect external imports and export bindings
  const externalImports = getExternalImportBindings(facadeModule);
  const exportBindings = isEntry ? getExportBindings(facadeModule) : [];
  const exportNames: Array<string> = [];
  for (let i = 0; i < exportBindings.length; i++) {
    exportNames.push(exportBindings[i].exported);
  }

  const externalImportSources: Array<string> = [];
  const importedBindingsRecord: Record<string, Array<string>> = {};
  for (let i = 0; i < externalImports.length; i++) {
    const imp = externalImports[i];
    if (!externalImportSources.includes(imp.source)) {
      externalImportSources.push(imp.source);
    }
    if (importedBindingsRecord[imp.source] === undefined) {
      importedBindingsRecord[imp.source] = [];
    }
    importedBindingsRecord[imp.source].push(imp.imported);
  }

  // Apply format wrapper
  const formatWrapper = getFormatWrapper(format);
  const exportsMode = getExportMode(exportNames, format);
  const formatOptions: FormatOptions = {
    exports: exportsMode,
    strict: true,
    externalImports,
    exportBindings,
  };

  // All valid ModuleFormat values produce a format wrapper; wrapChunk is
  // always available.  The non-null assertion is safe here.
  const wrappedCode = formatWrapper!.wrapChunk(
    concatenated.code,
    formatOptions,
  );

  // Apply addons
  const resolvedAddons = await resolveAllAddons({
    banner: options.banner as AddonValue,
    footer: options.footer as AddonValue,
    intro: options.intro as AddonValue,
    outro: options.outro as AddonValue,
  });
  const finalCode = applyAddons(wrappedCode, resolvedAddons);

  // Resolve chunk file name
  const chunkFileName = resolveChunkFileName(
    { name: chunkName, content: finalCode, format, isEntry },
    isEntry
      ? typeof options.entryFileNames === "string"
        ? options.entryFileNames
        : undefined
      : typeof options.chunkFileNames === "string"
        ? options.chunkFileNames
        : undefined,
  );

  // Build module info record
  const modulesRecord: Record<string, OutputRenderedModule> = {};
  const removedBindingNames: ReadonlyArray<string> =
    state.treeShakeResult?.removedBindings ?? [];
  for (let i = 0; i < chunkModules.length; i++) {
    const mod = chunkModules[i];
    const renderedExports: Array<string> = [];
    const removedExports: Array<string> = [];
    for (let j = 0; j < mod.exports.length; j++) {
      const name = mod.exports[j].exported ?? mod.exports[j].local ?? "";
      if (removedBindingNames.includes(name) && !mod.isEntry) {
        removedExports.push(name);
      } else {
        renderedExports.push(name);
      }
    }
    modulesRecord[mod.id] = {
      code: mod.isIncluded ? mod.code : "",
      originalLength: mod.code.length,
      removedExports,
      renderedExports,
      renderedLength: mod.isIncluded ? mod.code.length : 0,
    };
  }

  const moduleIds: Array<string> = [];
  for (let i = 0; i < chunkModules.length; i++) {
    moduleIds.push(chunkModules[i].id);
  }

  // Collect dynamic imports that originate from this chunk
  const chunkDynamicImports: Array<string> = [];
  for (let i = 0; i < chunkModules.length; i++) {
    for (let j = 0; j < chunkModules[i].dynamicImports.length; j++) {
      const dynSource = chunkModules[i].dynamicImports[j];
      const dynFileName = dynamicChunkFileNames.get(dynSource);
      if (
        dynFileName !== undefined &&
        !chunkDynamicImports.includes(dynFileName)
      ) {
        chunkDynamicImports.push(dynFileName);
      }
    }
  }

  return {
    type: "chunk",
    code: finalCode,
    fileName: chunkFileName,
    preliminaryFileName: chunkFileName,
    sourcemapFileName: null,
    map: null,
    exports: exportNames,
    facadeModuleId: facadeModule.id,
    isDynamicEntry: !isEntry,
    isEntry,
    isImplicitEntry: false,
    moduleIds,
    name: chunkName,
    dynamicImports: chunkDynamicImports,
    implicitlyLoadedBefore: [],
    importedBindings: importedBindingsRecord,
    imports: externalImportSources,
    modules: modulesRecord,
    referencedFiles: [],
  };
};

/**
 * Generates output from build state and output options.
 * Renders modules via MagicString, concatenates in topological order,
 * and applies format wrappers. When dynamic imports are present and
 * inlineDynamicImports is not true, produces multiple chunks.
 *
 * @param state - The build state containing modules and cache
 * @param options - Output options controlling format, file names, etc.
 * @returns A RollupOutput containing one or more chunks
 */
const generateOutput = async (
  state: BuildState,
  options: OutputOptions,
): Promise<RollupOutput> => {
  const fileName = options.file ?? "bundle.js";
  const format: ModuleFormat = (options.format ?? "es") as ModuleFormat;

  const modules = state.modules as ReadonlyArray<Module>;

  // If no modules, return empty chunk
  if (modules.length === 0) {
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
    return { output: [chunk] };
  }

  // Find the entry module (last module in topological order is typically the entry)
  let entryModule: Module | undefined;
  for (let i = 0; i < modules.length; i++) {
    if (modules[i].isEntry) {
      entryModule = modules[i];
      break;
    }
  }
  if (entryModule === undefined) {
    entryModule = modules[modules.length - 1];
  }

  // Determine whether to split: only when there are dynamic imports and
  // inlineDynamicImports is not explicitly true
  const shouldSplit =
    !options.inlineDynamicImports && hasDynamicImports(modules);

  if (shouldSplit) {
    return generateSplitOutput(modules, entryModule, format, state, options);
  }

  // --- Single-chunk path (original behavior) ---

  // Render each module, skipping those excluded by tree-shaking
  const renderedModules: Array<ConcatModule> = [];
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];

    // If tree-shaking ran and the module is not included, skip it entirely
    // (unless it is the entry module — always render entries)
    if (
      state.includedStatementsByModule !== undefined &&
      !mod.isIncluded &&
      mod !== entryModule
    ) {
      continue;
    }

    const isEntry = mod === entryModule;
    const modStatements = state.includedStatementsByModule?.get(mod.id);
    const rendered = renderSingleModule(mod, isEntry, format, modStatements);
    if (rendered.length > 0) {
      renderedModules.push({
        id: mod.id,
        code: rendered,
      });
    }
  }

  // Concatenate modules
  const concatenated = concatenateModules(renderedModules);

  // Collect external imports and export bindings from entry
  const externalImports = getExternalImportBindings(entryModule);
  const exportBindings = getExportBindings(entryModule);
  const exportNames: Array<string> = [];
  for (let i = 0; i < exportBindings.length; i++) {
    exportNames.push(exportBindings[i].exported);
  }

  // Get external module IDs for imports array
  const externalImportSources: Array<string> = [];
  const importedBindingsRecord: Record<string, Array<string>> = {};
  for (let i = 0; i < externalImports.length; i++) {
    const imp = externalImports[i];
    if (!externalImportSources.includes(imp.source)) {
      externalImportSources.push(imp.source);
    }
    if (importedBindingsRecord[imp.source] === undefined) {
      importedBindingsRecord[imp.source] = [];
    }
    importedBindingsRecord[imp.source].push(imp.imported);
  }

  // Apply format wrapper
  const formatWrapper = getFormatWrapper(format);
  const exports = getExportMode(exportNames, format);
  const formatOptions: FormatOptions = {
    exports,
    strict: true,
    externalImports,
    exportBindings,
  };

  // All valid ModuleFormat values produce a format wrapper
  const wrappedCode = formatWrapper!.wrapChunk(
    concatenated.code,
    formatOptions,
  );

  // Apply addons (banner/footer/intro/outro)
  const resolvedAddons = await resolveAllAddons({
    banner: options.banner as AddonValue,
    footer: options.footer as AddonValue,
    intro: options.intro as AddonValue,
    outro: options.outro as AddonValue,
  });
  const finalCode = applyAddons(wrappedCode, resolvedAddons);

  // Build module info record
  const modulesRecord: Record<string, OutputRenderedModule> = {};
  const removedBindingNames: ReadonlyArray<string> =
    state.treeShakeResult?.removedBindings ?? [];
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    const renderedExports: Array<string> = [];
    const removedExports: Array<string> = [];
    for (let j = 0; j < mod.exports.length; j++) {
      const name = mod.exports[j].exported ?? mod.exports[j].local ?? "";
      if (removedBindingNames.includes(name) && !mod.isEntry) {
        removedExports.push(name);
      } else {
        renderedExports.push(name);
      }
    }
    modulesRecord[mod.id] = {
      code: mod.isIncluded ? mod.code : "",
      originalLength: mod.code.length,
      removedExports,
      renderedExports,
      renderedLength: mod.isIncluded ? mod.code.length : 0,
    };
  }

  // Collect moduleIds
  const moduleIds: Array<string> = [];
  for (let i = 0; i < modules.length; i++) {
    moduleIds.push(modules[i].id);
  }

  const chunk: OutputChunk = {
    type: "chunk",
    code: finalCode,
    fileName,
    preliminaryFileName: fileName,
    sourcemapFileName: null,
    map: null,
    exports: exportNames,
    facadeModuleId: entryModule.id,
    isDynamicEntry: false,
    isEntry: true,
    isImplicitEntry: false,
    moduleIds,
    name: "bundle",
    dynamicImports: [...entryModule.dynamicImports],
    implicitlyLoadedBefore: [],
    importedBindings: importedBindingsRecord,
    imports: externalImportSources,
    modules: modulesRecord,
    referencedFiles: [],
  };

  return { output: [chunk] };
};

/**
 * Generate multi-chunk output when code splitting is active.
 * Detects split points from dynamic imports, assigns modules to chunks,
 * resolves chunk file names, and renders each chunk independently.
 *
 * @param modules - All modules in topological order
 * @param entryModule - The entry point module
 * @param format - Output module format
 * @param state - Build state
 * @param options - Output options
 * @returns RollupOutput with multiple chunks
 */
const generateSplitOutput = async (
  modules: ReadonlyArray<Module>,
  entryModule: Module,
  format: ModuleFormat,
  state: BuildState,
  options: OutputOptions,
): Promise<RollupOutput> => {
  const moduleMap = buildModuleMap(modules);
  const splittableModules = toSplittableModules(modules);
  const entryIds = [entryModule.id];

  // Detect split points and assign modules to chunks
  const splitPoints = detectSplitPoints(splittableModules, entryIds);
  const chunkAssignment = assignChunks(
    splittableModules,
    entryIds,
    splitPoints,
  );

  // Identify which chunk names are dynamic entry chunks (not the entry)
  const dynamicEntryModuleIds = new Set<string>();
  for (let i = 0; i < splitPoints.length; i++) {
    if (splitPoints[i].reason === "dynamic-import") {
      dynamicEntryModuleIds.add(splitPoints[i].moduleId);
    }
  }

  // Derive a chunk name for each entry in the assignment, and find its facade module
  interface ChunkInfo {
    readonly name: string;
    readonly moduleIds: ReadonlyArray<string>;
    readonly isEntry: boolean;
    readonly facadeModule: Module;
  }

  const chunks: Array<ChunkInfo> = [];
  for (const [chunkName, chunkModuleIds] of chunkAssignment) {
    // Find the facade module for this chunk
    let facade: Module | undefined;
    for (let i = 0; i < chunkModuleIds.length; i++) {
      const mid = chunkModuleIds[i];
      if (mid === entryModule.id) {
        facade = entryModule;
        break;
      }
      if (dynamicEntryModuleIds.has(mid)) {
        facade = moduleMap.get(mid);
        break;
      }
    }
    if (facade === undefined) {
      facade = moduleMap.get(chunkModuleIds[0]) ?? entryModule;
    }

    const isEntryChunk = chunkModuleIds.includes(entryModule.id);
    chunks.push({
      name: chunkName,
      moduleIds: chunkModuleIds,
      isEntry: isEntryChunk,
      facadeModule: facade,
    });
  }

  // Build a mapping from absolute dynamic entry module ID to the original
  // relative source strings that appear in import() calls in the code.
  const absoluteToRelativeSources = new Map<string, Array<string>>();
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    for (let j = 0; j < mod.dynamicImports.length; j++) {
      const relSource = mod.dynamicImports[j];
      const absId = resolveDynamicImportId(
        relSource,
        mod,
        new Set(Array.from(moduleMap.keys())),
      );
      const existing = absoluteToRelativeSources.get(absId);
      if (existing !== undefined) {
        existing.push(relSource);
      } else {
        absoluteToRelativeSources.set(absId, [relSource]);
      }
    }
  }

  // First pass: build dynamic chunk file names so the entry chunk can
  // rewrite import() calls to point to the correct file names.
  // Keys are the relative source strings that appear in code.
  const dynamicChunkFileNames = new Map<string, string>();

  for (let i = 0; i < chunks.length; i++) {
    const ci = chunks[i];
    if (!ci.isEntry) {
      // Render a quick concatenation to compute a content hash
      const chunkMods: Array<Module> = [];
      for (let j = 0; j < ci.moduleIds.length; j++) {
        const m = moduleMap.get(ci.moduleIds[j]);
        if (m !== undefined) {
          chunkMods.push(m);
        }
      }
      const tempRendered: Array<ConcatModule> = [];
      for (let j = 0; j < chunkMods.length; j++) {
        const mod = chunkMods[j];
        const modStatements = state.includedStatementsByModule?.get(mod.id);
        const rendered = renderSingleModule(
          mod,
          mod === ci.facadeModule,
          format,
          modStatements,
        );
        if (rendered.length > 0) {
          tempRendered.push({ id: mod.id, code: rendered });
        }
      }
      const tempConcat = concatenateModules(tempRendered);
      const chunkFileName = resolveChunkFileName(
        { name: ci.name, content: tempConcat.code, format, isEntry: false },
        typeof options.chunkFileNames === "string"
          ? options.chunkFileNames
          : undefined,
      );

      // Map each dynamic import's relative source string to this chunk's file name
      for (const dynModId of dynamicEntryModuleIds) {
        if (ci.moduleIds.includes(dynModId)) {
          const relSources = absoluteToRelativeSources.get(dynModId);
          if (relSources !== undefined) {
            for (let r = 0; r < relSources.length; r++) {
              dynamicChunkFileNames.set(relSources[r], chunkFileName);
            }
          }
        }
      }
    }
  }

  // Second pass: build all output chunks
  const outputChunks: Array<OutputChunk> = [];

  // Entry chunk first
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].isEntry) {
      const ci = chunks[i];
      const chunkMods: Array<Module> = [];
      for (let j = 0; j < ci.moduleIds.length; j++) {
        const m = moduleMap.get(ci.moduleIds[j]);
        if (m !== undefined) {
          chunkMods.push(m);
        }
      }
      const outputChunk = await buildSingleChunk(
        chunkMods,
        ci.name,
        true,
        ci.facadeModule,
        format,
        state,
        options,
        dynamicChunkFileNames,
      );
      outputChunks.push(outputChunk);
    }
  }

  // Dynamic/non-entry chunks
  for (let i = 0; i < chunks.length; i++) {
    if (!chunks[i].isEntry) {
      const ci = chunks[i];
      const chunkMods: Array<Module> = [];
      for (let j = 0; j < ci.moduleIds.length; j++) {
        const m = moduleMap.get(ci.moduleIds[j]);
        if (m !== undefined) {
          chunkMods.push(m);
        }
      }
      const outputChunk = await buildSingleChunk(
        chunkMods,
        ci.name,
        false,
        ci.facadeModule,
        format,
        state,
        options,
        dynamicChunkFileNames,
      );
      outputChunks.push(outputChunk);
    }
  }

  return {
    output: outputChunks as unknown as readonly [OutputChunk, ...OutputChunk[]],
  };
};

/**
 * Writes generated output to disk.
 * Creates output directories as needed and writes chunks and assets.
 *
 * @param output - The generated output to write
 * @param options - Output options specifying directory/file targets
 */
const writeOutput = async (
  output: RollupOutput,
  options: OutputOptions,
): Promise<void> => {
  const dir = options.dir ?? (options.file ? dirname(options.file) : "dist");

  // Ensure output directory exists
  await mkdir(dir, { recursive: true });

  for (let i = 0; i < output.output.length; i++) {
    const item = output.output[i];
    if (item.type === "chunk") {
      const filePath = options.file ?? join(dir, item.fileName);
      await writeFile(filePath, item.code, "utf-8");

      // Write source map if present
      if (item.map) {
        await writeFile(`${filePath}.map`, JSON.stringify(item.map), "utf-8");
      }
    } else if (item.type === "asset") {
      const filePath = join(dir, item.fileName);
      await mkdir(dirname(filePath), { recursive: true });
      if (typeof item.source === "string") {
        await writeFile(filePath, item.source, "utf-8");
      } else {
        await writeFile(filePath, item.source);
      }
    }
  }
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
      if (state.outputHookExecutor) {
        await state.outputHookExecutor.closeBundle();
      }
      internal.closed = true;
    },
  };

  return build;
};
