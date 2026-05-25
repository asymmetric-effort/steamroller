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
 * stripping export keywords from declarations.
 *
 * @param mod - The module to render
 * @param isEntry - Whether this module is the entry point
 * @param format - The output format
 * @returns The rendered code string
 */
const renderSingleModule = (
  mod: Module,
  isEntry: boolean,
  format: ModuleFormat,
): string => {
  const ms = new MagicString(mod.code);

  if (mod.ast === null) {
    return mod.code;
  }

  const body = mod.ast.body;
  for (let i = 0; i < body.length; i++) {
    const node = body[i];

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

  // Render each module
  const renderedModules: Array<ConcatModule> = [];
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    const isEntry = mod === entryModule;
    const rendered = renderSingleModule(mod, isEntry, format);
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
  const finalCode = applyAddons(wrappedCode, resolvedAddons);

  // Build module info record
  const modulesRecord: Record<string, OutputRenderedModule> = {};
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i];
    const renderedExports: Array<string> = [];
    for (let j = 0; j < mod.exports.length; j++) {
      renderedExports.push(
        mod.exports[j].exported ?? mod.exports[j].local ?? "",
      );
    }
    modulesRecord[mod.id] = {
      code: mod.code,
      originalLength: mod.code.length,
      removedExports: [],
      renderedExports,
      renderedLength: mod.code.length,
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
      internal.closed = true;
    },
  };

  return build;
};
