/**
 * @module build/rollup-build
 * @description Creates RollupBuild objects that represent a completed build.
 * Provides generate(), write(), and close() methods along with
 * cache, watchFiles, and getTimings accessors.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, extname, posix } from "node:path";
import type {
  RollupBuild,
  RollupOutput,
  OutputOptions,
  RollupCache as RollupCacheType,
  OutputChunk,
  OutputAsset,
  SerializedTimings,
  ModuleFormat,
  RenderedModule as OutputRenderedModule,
  NormalizedInputOptions,
  NormalizedOutputOptions,
  RenderedChunk,
  OutputBundle,
} from "../types.js";
import { normalizeOutputOptions } from "../config/normalize-output.js";
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
import {
  detectSplitPoints,
  assignChunks,
  resolveChunkFileName,
} from "../splitting/index.js";
import type { SplittableModule } from "../splitting/index.js";
import type { FileEmitter } from "../plugins/plugin-context-emit.js";
import { ALREADY_CLOSED } from "../utils/error-codes.js";
import { downlevelCode } from "../transforms/downlevel.js";
import { validateBundle } from "../validation/bundle-validator.js";
import { verifyBuild } from "../validation/verify-imports.js";
import { minify } from "../minify/minifier.js";
import { analyzeBuild } from "../analyze/analyzer.js";
import { formatText, formatJson, formatHtml } from "../analyze/reporter.js";
import {
  generateImportMap,
  serializeImportMap,
} from "../importmap/generate-importmap.js";
import type { ImportMapOptions } from "../importmap/types.js";

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
  /** Normalized input options, needed for output hooks like renderStart. */
  readonly inputOptions?: NormalizedInputOptions;
  /** Tree-shaking result summary, undefined if tree-shaking was disabled. */
  readonly treeShakeResult?: TreeShakeResult;
  /** Map from module ID to the set of included statement indices. */
  readonly includedStatementsByModule?: ReadonlyMap<
    string,
    ReadonlySet<number>
  >;
  /** File emitter for collecting assets/chunks emitted by plugins. */
  readonly fileEmitter?: FileEmitter;
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
 * Collect emitted files from a FileEmitter and convert them to OutputAsset entries.
 *
 * @param fileEmitter - The file emitter containing emitted files
 * @returns Array of OutputAsset entries
 */
const collectEmittedAssets = (
  fileEmitter: FileEmitter | undefined,
): ReadonlyArray<OutputAsset> => {
  if (fileEmitter === undefined) {
    return [];
  }
  const emittedFiles = fileEmitter.getEmittedFiles();
  const assets: Array<OutputAsset> = [];
  for (let i = 0; i < emittedFiles.length; i++) {
    const entry = emittedFiles[i];
    if (entry.type === "asset" && entry.source !== undefined) {
      const fileName =
        entry.fileName ?? `assets/${entry.name ?? entry.referenceId}`;
      assets.push({
        type: "asset",
        fileName,
        name: entry.name,
        names: entry.name ? [entry.name] : [],
        needsCodeReference: false,
        originalFileName: null,
        originalFileNames: [],
        source: entry.source,
      });
    } else if (entry.type === "prebuilt-chunk" && entry.code !== undefined) {
      const fileName = entry.fileName ?? `assets/${entry.referenceId}`;
      assets.push({
        type: "asset",
        fileName,
        name: entry.name,
        names: entry.name ? [entry.name] : [],
        needsCodeReference: false,
        originalFileName: null,
        originalFileNames: [],
        source: entry.code,
      });
    }
  }
  return assets;
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
 * Converts Module instances to SplittableModule for split-point detection.
 * Resolves dynamic import sources (relative paths) to absolute module IDs.
 */
const toSplittableModules = (
  modules: ReadonlyArray<Module>,
): ReadonlyArray<SplittableModule> => {
  // Build a lookup for resolving relative sources to absolute IDs
  const moduleById = new Map<string, Module>();
  for (let i = 0; i < modules.length; i++) {
    moduleById.set(modules[i].id, modules[i]);
  }

  const result: Array<SplittableModule> = [];
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    const importedIds: Array<string> = [];
    const importerIds: Array<string> = [];
    for (const dep of mod.dependencies) {
      if (dep instanceof Module) {
        importedIds.push(dep.id);
      }
    }
    for (const imp of mod.importers) {
      importerIds.push(imp.id);
    }

    // Resolve dynamic import sources to absolute module IDs
    const dynamicallyImportedIds: Array<string> = [];
    for (let j = 0; j < mod.dynamicImports.length; j++) {
      const source = mod.dynamicImports[j];
      const resolved = resolveDynamicSource(source, mod, modules);
      if (resolved !== undefined) {
        dynamicallyImportedIds.push(resolved);
      }
    }

    result.push({
      id: mod.id,
      isEntry: mod.isEntry,
      importedIds,
      dynamicallyImportedIds,
      importers: importerIds,
      dynamicImporters: [],
    });
  }
  return result;
};

/**
 * Resolves a dynamic import source string to an absolute module ID.
 */
const resolveDynamicSource = (
  source: string,
  importerMod: Module,
  allModules: ReadonlyArray<Module>,
): string | undefined => {
  const cleanSource = source.replace(/^\.\//, "");
  // Check dependencies of the importer first
  for (const dep of importerMod.dependencies) {
    if (dep instanceof Module) {
      if (dep.id.endsWith(cleanSource)) {
        return dep.id;
      }
    }
  }
  // Fallback: search all modules
  for (let i = 0; i < allModules.length; i++) {
    if (allModules[i].id.endsWith(cleanSource)) {
      return allModules[i].id;
    }
  }
  return undefined;
};

/**
 * Generates split output with multiple chunks when dynamic imports are present.
 * Each dynamic import target becomes its own chunk with a distinct file name.
 * Cross-chunk import() calls are rewritten to reference the generated chunk filename.
 */
const generateSplitOutput = async (
  state: BuildState,
  modules: ReadonlyArray<Module>,
  entryModule: Module,
  format: ModuleFormat,
  defaultFileName: string,
  options: OutputOptions,
  normalizedOutput: NormalizedOutputOptions | undefined,
  hookExecutor: OutputHookExecutor | undefined,
  isWrite: boolean,
): Promise<RollupOutput> => {
  const splittableModules = toSplittableModules(modules);
  const splitPoints = detectSplitPoints(splittableModules, [entryModule.id]);
  const chunkAssignment = assignChunks(
    splittableModules,
    [entryModule.id],
    splitPoints,
  );

  // Build a module lookup
  const moduleById = new Map<string, Module>();
  for (let i = 0; i < modules.length; i++) {
    moduleById.set(modules[i].id, modules[i]);
  }

  // Determine which dynamic import sources map to which resolved module IDs
  const dynamicSourceToResolved = new Map<string, string>();
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    for (let j = 0; j < mod.dynamicImports.length; j++) {
      const source = mod.dynamicImports[j];
      if (!dynamicSourceToResolved.has(source)) {
        const resolved = resolveDynamicSource(source, mod, modules);
        if (resolved !== undefined) {
          dynamicSourceToResolved.set(source, resolved);
        }
      }
    }
  }

  // For each chunk, determine its root module (entry or dynamic entry)
  // and which split point it corresponds to
  const splitPointByModuleId = new Map<string, (typeof splitPoints)[number]>();
  for (let i = 0; i < splitPoints.length; i++) {
    splitPointByModuleId.set(splitPoints[i].moduleId, splitPoints[i]);
  }

  // Generate each chunk
  const outputChunks: Array<OutputChunk> = [];
  const chunkFileNameByModuleId = new Map<string, string>();

  // First pass: render all chunks and compute file names
  const chunkEntries = Array.from(chunkAssignment.entries());
  const renderedChunks: Array<{
    name: string;
    moduleIds: Array<string>;
    code: string;
    isEntry: boolean;
    isDynamicEntry: boolean;
    facadeModuleId: string;
    exports: ReadonlyArray<string>;
    externalImports: ReadonlyArray<ImportBinding>;
    externalImportSources: Array<string>;
    importedBindingsRecord: Record<string, Array<string>>;
  }> = [];

  for (let ci = 0; ci < chunkEntries.length; ci++) {
    const [chunkName, chunkModuleIds] = chunkEntries[ci];

    // Determine the facade module for this chunk
    let facadeModule: Module | undefined;
    const isEntryChunk = chunkModuleIds.includes(entryModule.id);

    if (isEntryChunk) {
      facadeModule = entryModule;
    } else {
      // Find the split point module that acts as the facade
      for (let m = 0; m < chunkModuleIds.length; m++) {
        if (splitPointByModuleId.has(chunkModuleIds[m])) {
          facadeModule = moduleById.get(chunkModuleIds[m]);
          break;
        }
      }
      if (facadeModule === undefined && chunkModuleIds.length > 0) {
        facadeModule = moduleById.get(chunkModuleIds[0]);
      }
    }

    if (facadeModule === undefined) {
      continue;
    }

    const isDynamicEntry =
      !isEntryChunk && splitPointByModuleId.has(facadeModule.id);

    // Render modules belonging to this chunk
    const chunkRenderedModules: Array<ConcatModule> = [];
    for (let m = 0; m < chunkModuleIds.length; m++) {
      const mod = moduleById.get(chunkModuleIds[m]);
      if (mod === undefined) {
        continue;
      }

      // Skip tree-shaken modules (unless entry/facade)
      if (
        state.includedStatementsByModule !== undefined &&
        !mod.isIncluded &&
        mod !== facadeModule
      ) {
        continue;
      }

      const isModEntry = mod === facadeModule;
      const modStatements = state.includedStatementsByModule?.get(mod.id);
      const rendered = renderSingleModule(
        mod,
        isModEntry,
        format,
        modStatements,
      );
      if (rendered.length > 0) {
        chunkRenderedModules.push({ id: mod.id, code: rendered });
      }
    }

    const concatenated = concatenateModules(chunkRenderedModules);

    // Collect external imports for this chunk's facade
    const externalImports = getExternalImportBindings(facadeModule);
    const exportBindings = getExportBindings(facadeModule);
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

    const wrappedCode =
      formatWrapper !== undefined
        ? formatWrapper.wrapChunk(concatenated.code, formatOptions)
        : concatenated.code;

    renderedChunks.push({
      name: chunkName,
      moduleIds: chunkModuleIds,
      code: wrappedCode,
      isEntry: isEntryChunk,
      isDynamicEntry,
      facadeModuleId: facadeModule.id,
      exports: exportNames,
      externalImports,
      externalImportSources,
      importedBindingsRecord,
    });
  }

  // Compute file names for all chunks
  for (let i = 0; i < renderedChunks.length; i++) {
    const rc = renderedChunks[i];
    let chunkFileName: string;

    if (rc.isEntry) {
      // Entry chunk uses entryFileNames pattern or the default fileName
      const entryPattern =
        typeof options.entryFileNames === "string"
          ? options.entryFileNames
          : undefined;
      if (entryPattern !== undefined) {
        chunkFileName = resolveChunkFileName(
          { name: rc.name, content: rc.code, format, isEntry: true },
          entryPattern,
        );
      } else {
        chunkFileName = defaultFileName;
      }
    } else {
      // Dynamic chunk uses chunkFileNames pattern
      const chunkPattern =
        typeof options.chunkFileNames === "string"
          ? options.chunkFileNames
          : undefined;
      chunkFileName = resolveChunkFileName(
        { name: rc.name, content: rc.code, format, isEntry: false },
        chunkPattern,
      );
    }

    chunkFileNameByModuleId.set(rc.facadeModuleId, chunkFileName);
  }

  // Resolve addons once
  const resolvedAddons = await resolveAllAddons({
    banner: options.banner as AddonValue,
    footer: options.footer as AddonValue,
    intro: options.intro as AddonValue,
    outro: options.outro as AddonValue,
  });

  // Second pass: rewrite import() calls in entry chunks and build final OutputChunks
  for (let i = 0; i < renderedChunks.length; i++) {
    const rc = renderedChunks[i];
    let code = rc.code;

    // Rewrite dynamic import() calls to reference chunk file names
    if (rc.isEntry || rc.isDynamicEntry) {
      for (const [source, resolvedId] of dynamicSourceToResolved) {
        const targetFileName = chunkFileNameByModuleId.get(resolvedId);
        if (targetFileName !== undefined) {
          // Replace import("./source") or import('./source') with import("./chunkFile")
          const escapedSource = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const importPattern = new RegExp(
            `import\\(\\s*(['"])${escapedSource}\\1\\s*\\)`,
            "g",
          );
          code = code.replace(importPattern, `import("./${targetFileName}")`);
        }
      }
    }

    // Apply addons
    code = applyAddons(code, resolvedAddons);

    // Apply minification when compact or minify option is enabled
    const shouldMinifySplit =
      options.compact === true || options.minify === true;
    if (shouldMinifySplit) {
      code = minify(code);
    }

    const chunkFileName = chunkFileNameByModuleId.get(rc.facadeModuleId)!;

    // Collect dynamicImports array for the entry chunk
    const dynamicImportFileNames: Array<string> = [];
    if (rc.isEntry) {
      for (const [, resolvedId] of dynamicSourceToResolved) {
        const fn = chunkFileNameByModuleId.get(resolvedId);
        if (fn !== undefined && !dynamicImportFileNames.includes(fn)) {
          dynamicImportFileNames.push(fn);
        }
      }
    }

    // Build modules record
    const modulesRecord: Record<string, OutputRenderedModule> = {};
    const removedBindingNames: ReadonlyArray<string> =
      state.treeShakeResult?.removedBindings ?? [];
    for (let m = 0; m < rc.moduleIds.length; m++) {
      const mod = moduleById.get(rc.moduleIds[m]);
      if (mod === undefined) {
        continue;
      }
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

    const renderedChunkInfo: RenderedChunk = {
      type: "chunk",
      dynamicImports: dynamicImportFileNames,
      exports: [...rc.exports],
      facadeModuleId: rc.facadeModuleId,
      fileName: chunkFileName,
      implicitlyLoadedBefore: [],
      importedBindings: rc.importedBindingsRecord,
      imports: rc.externalImportSources,
      isDynamicEntry: rc.isDynamicEntry,
      isEntry: rc.isEntry,
      isImplicitEntry: false,
      moduleIds: rc.moduleIds,
      modules: modulesRecord,
      name: rc.name,
      referencedFiles: [],
    };

    // Fire renderChunk hook
    let chunkCode = code;
    if (hookExecutor !== undefined && normalizedOutput !== undefined) {
      const renderChunkResult = await hookExecutor.renderChunk(
        chunkCode,
        renderedChunkInfo,
        normalizedOutput,
      );
      chunkCode = renderChunkResult.code;
    }

    // Apply downlevel transforms if a target is specified
    if (options.target !== undefined) {
      chunkCode = downlevelCode(chunkCode, options.target);
    }

    const chunk: OutputChunk = {
      ...renderedChunkInfo,
      code: chunkCode,
      preliminaryFileName: chunkFileName,
      sourcemapFileName: null,
      map: null,
    };

    outputChunks.push(chunk);
  }

  // Fire generateBundle hook
  if (hookExecutor !== undefined && normalizedOutput !== undefined) {
    const bundle: OutputBundle = {};
    for (let i = 0; i < outputChunks.length; i++) {
      (bundle as Record<string, OutputChunk>)[outputChunks[i].fileName] =
        outputChunks[i];
    }
    await hookExecutor.generateBundle(normalizedOutput, bundle, isWrite);
  }

  // Collect emitted assets from plugins
  const emittedAssets = collectEmittedAssets(state.fileEmitter);
  const outputItems: Array<OutputChunk | OutputAsset> = [
    ...outputChunks,
    ...emittedAssets,
  ];

  return {
    output: outputItems as unknown as readonly [
      OutputChunk,
      ...(OutputChunk | OutputAsset)[],
    ],
  };
};

/**
 * Compute the output file path for a module in preserveModules mode.
 * Strips the preserveModulesRoot prefix (if any) and replaces the extension with .js.
 *
 * @param moduleId - The absolute or relative module ID
 * @param preserveModulesRoot - Optional root directory to strip from paths
 * @returns The output file path relative to the output directory
 */
const getPreserveModulesOutputPath = (
  moduleId: string,
  preserveModulesRoot: string | undefined,
): string => {
  let relativePath = moduleId;

  if (preserveModulesRoot !== undefined) {
    // Strip the root prefix if the module path starts with it
    const root = preserveModulesRoot.endsWith("/")
      ? preserveModulesRoot
      : preserveModulesRoot + "/";
    if (relativePath.startsWith(root)) {
      relativePath = relativePath.slice(root.length);
    } else if (relativePath.startsWith(preserveModulesRoot)) {
      relativePath = relativePath.slice(preserveModulesRoot.length);
      if (relativePath.startsWith("/")) {
        relativePath = relativePath.slice(1);
      }
    }
  }

  // Strip leading ./ or /
  if (relativePath.startsWith("./")) {
    relativePath = relativePath.slice(2);
  } else if (relativePath.startsWith("/")) {
    relativePath = relativePath.slice(1);
  }

  // Replace extension with .js
  const ext = extname(relativePath);
  if (ext) {
    relativePath = relativePath.slice(0, -ext.length) + ".js";
  } else {
    relativePath = relativePath + ".js";
  }

  return relativePath;
};

/**
 * Render a module for preserveModules mode - keeps all import/export statements
 * intact (unlike renderSingleModule which strips internal imports).
 * Only rewrites import sources to point to the correct output file paths.
 *
 * @param mod - The module to render
 * @param format - The output format
 * @param moduleOutputPaths - Map from module ID to output file path
 * @param thisOutputPath - The output file path for this module
 * @param includedStatements - Optional set of statement indices from tree-shaking
 * @returns The rendered code string
 */
const renderPreserveModule = (
  mod: Module,
  format: ModuleFormat,
  moduleOutputPaths: ReadonlyMap<string, string>,
  thisOutputPath: string,
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
    if (
      includedStatements !== undefined &&
      !includedStatements.has(i) &&
      node.type !== "ImportDeclaration"
    ) {
      ms.remove(node.start, node.end);
      continue;
    }

    if (node.type === "ImportDeclaration") {
      const importNode = node as {
        start: number;
        end: number;
        source: { start: number; end: number; value: unknown; raw: string };
      };
      const source = importNode.source.value as string;

      // Find which dependency this import resolves to
      const resolvedId = resolveImportToModuleId(source, mod);
      if (resolvedId !== undefined && moduleOutputPaths.has(resolvedId)) {
        // Rewrite the source to point to the output path
        const targetPath = moduleOutputPaths.get(resolvedId)!;
        const newSource = computeRelativeImportPath(thisOutputPath, targetPath);
        ms.overwrite(
          importNode.source.start,
          importNode.source.end,
          JSON.stringify(newSource),
        );
      }
      // External imports are kept as-is
    } else if (node.type === "ExportNamedDeclaration") {
      const exportNode = node as {
        start: number;
        end: number;
        source: { start: number; end: number; value: unknown } | null;
      };
      if (exportNode.source !== null) {
        const source = exportNode.source.value as string;
        const resolvedId = resolveImportToModuleId(source, mod);
        if (resolvedId !== undefined && moduleOutputPaths.has(resolvedId)) {
          const targetPath = moduleOutputPaths.get(resolvedId)!;
          const newSource = computeRelativeImportPath(
            thisOutputPath,
            targetPath,
          );
          ms.overwrite(
            exportNode.source.start,
            exportNode.source.end,
            JSON.stringify(newSource),
          );
        }
      }
    } else if (node.type === "ExportAllDeclaration") {
      const exportAll = node as {
        start: number;
        end: number;
        source: { start: number; end: number; value: unknown };
      };
      const source = exportAll.source.value as string;
      const resolvedId = resolveImportToModuleId(source, mod);
      if (resolvedId !== undefined && moduleOutputPaths.has(resolvedId)) {
        const targetPath = moduleOutputPaths.get(resolvedId)!;
        const newSource = computeRelativeImportPath(thisOutputPath, targetPath);
        ms.overwrite(
          exportAll.source.start,
          exportAll.source.end,
          JSON.stringify(newSource),
        );
      }
    }
  }

  return ms.toString().trim();
};

/**
 * Resolve an import source string to a module ID by checking module dependencies.
 */
const resolveImportToModuleId = (
  source: string,
  mod: Module,
): string | undefined => {
  for (const dep of mod.dependencies) {
    if (dep instanceof Module) {
      if (
        dep.id === source ||
        dep.id.endsWith(source) ||
        dep.id.includes(source.replace(/^\.\//, ""))
      ) {
        return dep.id;
      }
    }
  }
  return undefined;
};

/**
 * Compute the relative import path from one output file to another.
 */
const computeRelativeImportPath = (from: string, to: string): string => {
  const fromDir = from.includes("/")
    ? from.slice(0, from.lastIndexOf("/"))
    : ".";
  const rel = posix.relative(fromDir, to);
  if (!rel.startsWith(".")) {
    return "./" + rel;
  }
  return rel;
};

/**
 * Generates output in preserveModules mode - each module becomes its own chunk.
 * No bundling/concatenation occurs. The output directory structure mirrors
 * the module graph structure relative to preserveModulesRoot.
 */
const generatePreserveModulesOutput = async (
  state: BuildState,
  modules: ReadonlyArray<Module>,
  entryModule: Module,
  format: ModuleFormat,
  options: OutputOptions,
  normalizedOutput: NormalizedOutputOptions | undefined,
  hookExecutor: OutputHookExecutor | undefined,
  isWrite: boolean,
): Promise<RollupOutput> => {
  const preserveModulesRoot = options.preserveModulesRoot;

  // Build output path map for all modules
  const moduleOutputPaths = new Map<string, string>();
  for (let i = 0; i < modules.length; i++) {
    const outputPath = getPreserveModulesOutputPath(
      modules[i].id,
      preserveModulesRoot,
    );
    moduleOutputPaths.set(modules[i].id, outputPath);
  }

  // Build a module lookup
  const moduleById = new Map<string, Module>();
  for (let i = 0; i < modules.length; i++) {
    moduleById.set(modules[i].id, modules[i]);
  }

  // Resolve addons once
  const resolvedAddons = await resolveAllAddons({
    banner: options.banner as AddonValue,
    footer: options.footer as AddonValue,
    intro: options.intro as AddonValue,
    outro: options.outro as AddonValue,
  });

  const outputChunks: Array<OutputChunk> = [];

  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    const outputPath = moduleOutputPaths.get(mod.id)!;
    const isEntry = mod === entryModule;

    // Skip tree-shaken modules (unless entry)
    if (
      state.includedStatementsByModule !== undefined &&
      !mod.isIncluded &&
      !isEntry
    ) {
      continue;
    }

    // Render the module preserving import/export statements
    const modStatements = state.includedStatementsByModule?.get(mod.id);
    const renderedCode = renderPreserveModule(
      mod,
      format,
      moduleOutputPaths,
      outputPath,
      modStatements,
    );

    // Collect external imports
    const externalImports = getExternalImportBindings(mod);
    const exportBindings = getExportBindings(mod);
    const exportNames: Array<string> = [];
    for (let j = 0; j < exportBindings.length; j++) {
      exportNames.push(exportBindings[j].exported);
    }

    const externalImportSources: Array<string> = [];
    const importedBindingsRecord: Record<string, Array<string>> = {};
    for (let j = 0; j < externalImports.length; j++) {
      const imp = externalImports[j];
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

    const wrappedCode =
      formatWrapper !== undefined
        ? formatWrapper.wrapChunk(renderedCode, formatOptions)
        : renderedCode;

    // Apply addons
    const addonCodePM = applyAddons(wrappedCode, resolvedAddons);

    // Apply minification when compact or minify option is enabled
    const shouldMinifyPM = options.compact === true || options.minify === true;
    const finalCode = shouldMinifyPM ? minify(addonCodePM) : addonCodePM;

    // Collect import sources (internal modules this module imports)
    const internalImportSources: Array<string> = [];
    for (const dep of mod.dependencies) {
      if (dep instanceof Module && moduleOutputPaths.has(dep.id)) {
        const depPath = moduleOutputPaths.get(dep.id)!;
        if (!internalImportSources.includes(depPath)) {
          internalImportSources.push(depPath);
        }
      }
    }

    // Build modules record for this chunk (just this one module)
    const modulesRecord: Record<string, OutputRenderedModule> = {};
    const removedBindingNames: ReadonlyArray<string> =
      state.treeShakeResult?.removedBindings ?? [];
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

    // Compute the chunk name from the output path (without extension)
    const chunkName = outputPath.replace(/\.js$/, "").replace(/\//g, "_");

    const renderedChunkInfo: RenderedChunk = {
      type: "chunk",
      dynamicImports: [...mod.dynamicImports],
      exports: exportNames,
      facadeModuleId: mod.id,
      fileName: outputPath,
      implicitlyLoadedBefore: [],
      importedBindings: importedBindingsRecord,
      imports: [...externalImportSources, ...internalImportSources],
      isDynamicEntry: false,
      isEntry,
      isImplicitEntry: false,
      moduleIds: [mod.id],
      modules: modulesRecord,
      name: chunkName,
      referencedFiles: [],
    };

    // Fire renderChunk hook
    let chunkCode = finalCode;
    if (hookExecutor !== undefined && normalizedOutput !== undefined) {
      const renderChunkResult = await hookExecutor.renderChunk(
        chunkCode,
        renderedChunkInfo,
        normalizedOutput,
      );
      chunkCode = renderChunkResult.code;
    }

    // Apply downlevel transforms if a target is specified
    if (options.target !== undefined) {
      chunkCode = downlevelCode(chunkCode, options.target);
    }

    const chunk: OutputChunk = {
      ...renderedChunkInfo,
      code: chunkCode,
      preliminaryFileName: outputPath,
      sourcemapFileName: null,
      map: null,
    };

    outputChunks.push(chunk);
  }

  // Fire generateBundle hook
  if (hookExecutor !== undefined && normalizedOutput !== undefined) {
    const bundle: OutputBundle = {};
    for (let i = 0; i < outputChunks.length; i++) {
      (bundle as Record<string, OutputChunk>)[outputChunks[i].fileName] =
        outputChunks[i];
    }
    await hookExecutor.generateBundle(normalizedOutput, bundle, isWrite);
  }

  // Collect emitted assets from plugins
  const emittedAssets = collectEmittedAssets(state.fileEmitter);
  const outputItems: Array<OutputChunk | OutputAsset> = [
    ...outputChunks,
    ...emittedAssets,
  ];

  return {
    output: outputItems as unknown as readonly [
      OutputChunk,
      ...(OutputChunk | OutputAsset)[],
    ],
  };
};

/**
 * Generates output from build state and output options.
 * Renders modules via MagicString, concatenates in topological order,
 * and applies format wrappers.
 *
 * @param state - The build state containing modules and cache
 * @param options - Output options controlling format, file names, etc.
 * @returns A RollupOutput containing at least one entry chunk
 */
const generateOutput = async (
  state: BuildState,
  options: OutputOptions,
  isWrite: boolean = false,
): Promise<RollupOutput> => {
  const fileName = options.file ?? "bundle.js";
  const format: ModuleFormat = (options.format ?? "es") as ModuleFormat;
  const hookExecutor = state.outputHookExecutor;

  // Normalize output options for hooks that need NormalizedOutputOptions
  const normalizedOutput: NormalizedOutputOptions | undefined =
    state.inputOptions !== undefined
      ? normalizeOutputOptions(options, state.inputOptions)
      : undefined;

  // Fire renderStart hook
  if (
    hookExecutor !== undefined &&
    normalizedOutput !== undefined &&
    state.inputOptions !== undefined
  ) {
    try {
      await hookExecutor.renderStart(normalizedOutput, state.inputOptions);
    } catch (renderStartError: unknown) {
      await hookExecutor.renderError(
        renderStartError instanceof Error
          ? renderStartError
          : new Error(String(renderStartError)),
      );
      throw renderStartError;
    }
  }

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

    // Fire generateBundle even for empty output
    if (hookExecutor !== undefined && normalizedOutput !== undefined) {
      const bundle: OutputBundle = { [fileName]: chunk };
      await hookExecutor.generateBundle(normalizedOutput, bundle, isWrite);
    }

    // Collect emitted assets from plugins
    const emittedAssets = collectEmittedAssets(state.fileEmitter);
    const outputItems: Array<OutputChunk | OutputAsset> = [
      chunk,
      ...emittedAssets,
    ];

    return {
      output: outputItems as unknown as readonly [
        OutputChunk,
        ...(OutputChunk | OutputAsset)[],
      ],
    };
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

  // Detect dynamic imports in the module graph
  const hasDynamicImports = modules.some(
    (mod) => mod.dynamicImports.length > 0,
  );
  const shouldSplit =
    hasDynamicImports && options.inlineDynamicImports !== true;

  try {
    // preserveModules mode: each module becomes its own chunk
    if (options.preserveModules === true) {
      return await generatePreserveModulesOutput(
        state,
        modules,
        entryModule,
        format,
        options,
        normalizedOutput,
        hookExecutor,
        isWrite,
      );
    }

    if (shouldSplit) {
      return await generateSplitOutput(
        state,
        modules,
        entryModule,
        format,
        fileName,
        options,
        normalizedOutput,
        hookExecutor,
        isWrite,
      );
    }

    // Single-chunk path (no dynamic imports or inlineDynamicImports=true)
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

    const wrappedCode =
      formatWrapper !== undefined
        ? formatWrapper.wrapChunk(concatenated.code, formatOptions)
        : concatenated.code;

    // Apply addons (banner/footer/intro/outro)
    const resolvedAddons = await resolveAllAddons({
      banner: options.banner as AddonValue,
      footer: options.footer as AddonValue,
      intro: options.intro as AddonValue,
      outro: options.outro as AddonValue,
    });
    const addonCode = applyAddons(wrappedCode, resolvedAddons);

    // Apply minification when compact or minify option is enabled
    const shouldMinify = options.compact === true || options.minify === true;
    const finalCode = shouldMinify ? minify(addonCode) : addonCode;

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

    // Build the rendered chunk info for hook arguments
    const renderedChunkInfo: RenderedChunk = {
      type: "chunk",
      dynamicImports: [...entryModule.dynamicImports],
      exports: exportNames,
      facadeModuleId: entryModule.id,
      fileName,
      implicitlyLoadedBefore: [],
      importedBindings: importedBindingsRecord,
      imports: externalImportSources,
      isDynamicEntry: false,
      isEntry: true,
      isImplicitEntry: false,
      moduleIds,
      modules: modulesRecord,
      name: "bundle",
      referencedFiles: [],
    };

    // Fire renderChunk hook for each chunk
    let chunkCode = finalCode;
    if (hookExecutor !== undefined && normalizedOutput !== undefined) {
      const renderChunkResult = await hookExecutor.renderChunk(
        chunkCode,
        renderedChunkInfo,
        normalizedOutput,
      );
      chunkCode = renderChunkResult.code;
    }

    // Apply downlevel transforms if a target is specified
    if (options.target !== undefined) {
      chunkCode = downlevelCode(chunkCode, options.target);
    }

    const chunk: OutputChunk = {
      ...renderedChunkInfo,
      code: chunkCode,
      preliminaryFileName: fileName,
      sourcemapFileName: null,
      map: null,
    };

    // Fire generateBundle hook
    if (hookExecutor !== undefined && normalizedOutput !== undefined) {
      const bundle: OutputBundle = { [fileName]: chunk };
      await hookExecutor.generateBundle(normalizedOutput, bundle, isWrite);
    }

    // Collect emitted assets from plugins
    const emittedAssets = collectEmittedAssets(state.fileEmitter);
    const outputItems: Array<OutputChunk | OutputAsset> = [
      chunk,
      ...emittedAssets,
    ];

    return {
      output: outputItems as unknown as readonly [
        OutputChunk,
        ...(OutputChunk | OutputAsset)[],
      ],
    };
  } catch (renderError: unknown) {
    // Fire renderError hook on failure
    if (hookExecutor !== undefined) {
      await hookExecutor.renderError(
        renderError instanceof Error
          ? renderError
          : new Error(String(renderError)),
      );
    }
    throw renderError;
  }
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
  state: BuildState,
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

  // Fire writeBundle hook after writing to disk
  if (
    state.outputHookExecutor !== undefined &&
    state.inputOptions !== undefined
  ) {
    const normalizedOutput = normalizeOutputOptions(
      options,
      state.inputOptions,
    );
    const bundleRecord: Record<string, OutputChunk> = {};
    for (let i = 0; i < output.output.length; i++) {
      const item = output.output[i];
      if (item.type === "chunk") {
        bundleRecord[item.fileName] = item;
      }
    }
    const bundle: OutputBundle = bundleRecord;
    await state.outputHookExecutor.writeBundle(normalizedOutput, bundle);
  }
};

/**
 * Runs post-bundle validation on the output and emits warnings via the
 * input options onLog handler. Collects external IDs from the build state
 * modules to pass to the validator.
 *
 * @param result - The generated RollupOutput
 * @param state - The build state containing modules and input options
 */
const runBundleValidation = (result: RollupOutput, state: BuildState): void => {
  const modules = state.modules as ReadonlyArray<Module>;
  const externalIds = new Set<string>();
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    for (const dep of mod.dependencies) {
      if (dep instanceof ExternalModule) {
        externalIds.add(dep.id);
      }
    }
  }

  const validationResult = validateBundle(
    result.output as ReadonlyArray<OutputChunk | OutputAsset>,
    externalIds,
  );

  if (!validationResult.valid) {
    const onLog = state.inputOptions?.onLog;
    for (let i = 0; i < validationResult.results.length; i++) {
      const chunkResult = validationResult.results[i];
      for (let j = 0; j < chunkResult.warnings.length; j++) {
        const warning = chunkResult.warnings[j];
        if (onLog !== undefined) {
          onLog("warn", warning);
        } else {
          console.warn(`[steamroller] ${warning.message}`);
        }
      }
    }
  }

  // Run import specifier verification
  const importVerification = verifyBuild(
    result.output as ReadonlyArray<OutputChunk | OutputAsset>,
    externalIds,
  );

  if (!importVerification.valid) {
    const onLog = state.inputOptions?.onLog;
    for (let i = 0; i < importVerification.warnings.length; i++) {
      const warning = importVerification.warnings[i];
      if (onLog !== undefined) {
        onLog("warn", warning);
      } else {
        console.warn(`[steamroller] ${warning.message}`);
      }
    }
  }
};

/**
 * Emits an importmap.json asset into the output when the importMap option is
 * enabled. Mutates the output array by appending an OutputAsset.
 *
 * @param result - The generated RollupOutput (mutated in place)
 * @param options - Output options that may contain importMap config
 */
const emitImportMapAsset = (
  result: RollupOutput,
  options: OutputOptions,
): void => {
  if (options.importMap === undefined || options.importMap === false) {
    return;
  }

  const importMapOptions: ImportMapOptions =
    options.importMap === true ? {} : (options.importMap as ImportMapOptions);

  const importMap = generateImportMap(result, importMapOptions);
  const source = serializeImportMap(importMap);

  const asset: OutputAsset = {
    type: "asset",
    fileName: "importmap.json",
    name: "importmap.json",
    names: ["importmap.json"],
    needsCodeReference: false,
    originalFileName: null,
    originalFileNames: [],
    source,
  };

  // Append the asset to the output
  (result.output as unknown as Array<OutputChunk | OutputAsset>).push(asset);
};

/**
 * Runs bundle analysis on the output and prints the report to stdout.
 *
 * @param result - The generated RollupOutput
 * @param mode - The analysis output mode
 */
const runAnalysis = (
  result: RollupOutput,
  mode: boolean | "json" | "html" | "text",
): void => {
  const analysis = analyzeBuild(
    result.output as ReadonlyArray<OutputChunk | OutputAsset>,
  );
  if (mode === "json") {
    process.stdout.write(formatJson(analysis) + "\n");
  } else if (mode === "html") {
    process.stdout.write(formatHtml(analysis) + "\n");
  } else {
    // true or "text"
    process.stdout.write(formatText(analysis) + "\n");
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
        throw Object.assign(
          new Error(
            "Bundle is already closed, no more calls to 'generate' are allowed.",
          ),
          { code: ALREADY_CLOSED },
        );
      }
      const result = await generateOutput(state, outputOptions, false);
      emitImportMapAsset(result, outputOptions);
      if (outputOptions.validate === true) {
        runBundleValidation(result, state);
      }
      if (
        outputOptions.analyze !== undefined &&
        outputOptions.analyze !== false
      ) {
        runAnalysis(result, outputOptions.analyze);
      }
      return result;
    },

    async write(outputOptions: OutputOptions): Promise<RollupOutput> {
      if (internal.closed) {
        throw Object.assign(
          new Error(
            "Bundle is already closed, no more calls to 'write' are allowed.",
          ),
          { code: ALREADY_CLOSED },
        );
      }
      const output = await generateOutput(state, outputOptions, true);
      emitImportMapAsset(output, outputOptions);
      if (outputOptions.validate === true) {
        runBundleValidation(output, state);
      }
      if (
        outputOptions.analyze !== undefined &&
        outputOptions.analyze !== false
      ) {
        runAnalysis(output, outputOptions.analyze);
      }
      await writeOutput(output, outputOptions, state);
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
