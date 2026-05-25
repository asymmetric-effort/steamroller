/**
 * @module config/normalize-output
 * @description Normalizes raw OutputOptions into fully resolved
 * NormalizedOutputOptions with defaults, function forms, and validation.
 */

import type {
  OutputOptions,
  NormalizedInputOptions,
  NormalizedOutputOptions,
  NormalizedAmdOptions,
  NormalizedGeneratedCodeOptions,
  ModuleFormat,
  InteropType,
  GlobalsOption,
  HashCharacters,
  ManualChunksOption,
  MaybePromise,
  OptionsPaths,
  OutputPlugin,
  OutputPluginOption,
  PreRenderedAsset,
  PreRenderedChunk,
  SourcemapIgnoreListOption,
  SourcemapPathTransformOption,
  NullValue,
} from "../types.js";
import { INVALID_OPTION } from "../utils/error-codes.js";

/** Valid module format values for validation. */
const VALID_FORMATS: ReadonlyArray<ModuleFormat> = [
  "amd",
  "cjs",
  "es",
  "iife",
  "system",
  "umd",
];

/**
 * Normalize interop option into function form.
 *
 * @param interop - Raw interop option.
 * @returns A function (id) => InteropType.
 */
export const normalizeInterop = (
  interop: InteropType | ((id: string | null) => InteropType) | undefined,
): ((id: string | null) => InteropType) => {
  if (interop === undefined) {
    return () => "default";
  }
  if (typeof interop === "function") {
    return interop;
  }
  const value = interop;
  return () => value;
};

/**
 * Normalize globals option into function form.
 *
 * @param globals - Raw globals option.
 * @returns The globals option (record or function).
 */
export const normalizeGlobals = (
  globals: GlobalsOption | undefined,
): GlobalsOption => {
  if (globals === undefined) {
    return () => "";
  }
  if (typeof globals === "function") {
    return globals;
  }
  const map = globals;
  return (name: string): string => {
    return (map as Record<string, string>)[name] ?? "";
  };
};

/**
 * Normalize an addon option (banner/footer/intro/outro) to an async function.
 *
 * @param addon - Raw addon option (string or function returning string/promise).
 * @returns An async function returning a string.
 */
export const normalizeAddon = (
  addon: string | (() => MaybePromise<string>) | undefined,
): (() => MaybePromise<string>) => {
  if (addon === undefined || addon === null) {
    return () => "";
  }
  if (typeof addon === "function") {
    return addon;
  }
  const value = addon;
  return () => value;
};

/**
 * Normalize AMD options.
 *
 * @param amd - Raw AMD options.
 * @returns Normalized AMD options with defaults.
 */
const normalizeAmd = (amd: OutputOptions["amd"]): NormalizedAmdOptions => {
  if (!amd) {
    return {
      autoId: false,
      basePath: "",
      define: "define",
      forceJsExtensionForImports: false,
      id: undefined,
    };
  }
  return {
    autoId: amd.autoId ?? false,
    basePath: amd.basePath ?? "",
    define: amd.define ?? "define",
    forceJsExtensionForImports: amd.forceJsExtensionForImports ?? false,
    id: amd.id ?? undefined,
  };
};

/**
 * Normalize generated code options.
 *
 * @param generatedCode - Raw generated code options (preset or object).
 * @returns Normalized generated code options.
 */
const normalizeGeneratedCode = (
  generatedCode: OutputOptions["generatedCode"],
): NormalizedGeneratedCodeOptions => {
  if (!generatedCode || generatedCode === "es5") {
    return {
      arrowFunctions: false,
      constBindings: false,
      objectShorthand: false,
      reservedNamesAsProps: true,
      symbols: false,
    };
  }
  if (generatedCode === "es2015") {
    return {
      arrowFunctions: true,
      constBindings: true,
      objectShorthand: true,
      reservedNamesAsProps: true,
      symbols: true,
    };
  }
  return {
    arrowFunctions: generatedCode.arrowFunctions ?? false,
    constBindings: generatedCode.constBindings ?? false,
    objectShorthand: generatedCode.objectShorthand ?? false,
    reservedNamesAsProps: generatedCode.reservedNamesAsProps ?? true,
    symbols: generatedCode.symbols ?? false,
  };
};

/**
 * Normalize sanitizeFileName option.
 *
 * @param sanitize - Raw sanitizeFileName option.
 * @returns A function that sanitizes file names.
 */
const normalizeSanitizeFileName = (
  sanitize: boolean | ((fileName: string) => string) | undefined,
): ((fileName: string) => string) => {
  if (sanitize === false) {
    return (fileName: string) => fileName;
  }
  if (typeof sanitize === "function") {
    return sanitize;
  }
  // Default: replace null bytes and problematic characters
  return (fileName: string) => fileName.replace(/[\0?*]/g, "_");
};

/**
 * Flatten and filter output plugins from potentially nested arrays.
 *
 * @param plugins - Raw output plugin option array.
 * @returns Flat array of valid output plugins.
 */
export const normalizeOutputPlugins = (
  plugins: ReadonlyArray<OutputPluginOption> | undefined,
): ReadonlyArray<OutputPlugin> => {
  if (!plugins) {
    return [];
  }
  const result: Array<OutputPlugin> = [];
  const stack: Array<unknown> = [...plugins];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === null || item === undefined || item === false) {
      continue;
    }
    if (Array.isArray(item)) {
      for (let i = 0; i < item.length; i++) {
        stack.push(item[i]);
      }
      continue;
    }
    if (
      typeof item === "object" &&
      "name" in (item as Record<string, unknown>)
    ) {
      result.push(item as OutputPlugin);
    }
  }
  return result.reverse();
};

/**
 * Normalize raw OutputOptions into fully resolved NormalizedOutputOptions.
 *
 * Validates required fields, resolves mutual exclusivity of dir/file,
 * and sets defaults for all output options.
 *
 * @param options - Raw output options from the user.
 * @param inputOptions - Already-normalized input options for reference.
 * @returns Fully normalized output options.
 * @throws Error if format is not specified or invalid, or if dir and file are both set.
 */
export const normalizeOutputOptions = (
  options: OutputOptions,
  inputOptions: NormalizedInputOptions,
): NormalizedOutputOptions => {
  // Validate format
  const format = options.format ?? "es";
  if (!VALID_FORMATS.includes(format)) {
    throw Object.assign(
      new Error(
        `Invalid output format: "${format}". Expected one of: ${VALID_FORMATS.join(", ")}`,
      ),
      { code: INVALID_OPTION },
    );
  }

  // Validate dir/file mutual exclusion
  if (options.dir && options.file) {
    throw Object.assign(
      new Error(
        'Cannot specify both "dir" and "file" in output options. Use "dir" for multiple outputs or "file" for a single output.',
      ),
      { code: INVALID_OPTION },
    );
  }

  const generatedCode = normalizeGeneratedCode(options.generatedCode);

  return {
    amd: normalizeAmd(options.amd),
    assetFileNames: options.assetFileNames ?? "assets/[name]-[hash][extname]",
    banner: normalizeAddon(options.banner),
    chunkFileNames: options.chunkFileNames ?? "[name]-[hash].js",
    compact: options.compact ?? false,
    dir: options.dir ?? undefined,
    dynamicImportInCjs: options.dynamicImportInCjs ?? true,
    entryFileNames: options.entryFileNames ?? "[name].js",
    esModule: options.esModule ?? "if-default-prop",
    experimentalMinChunkSize: options.experimentalMinChunkSize ?? 1,
    exports: options.exports ?? "auto",
    extend: options.extend ?? false,
    externalImportAttributes: options.externalImportAttributes ?? true,
    externalLiveBindings: options.externalLiveBindings ?? true,
    file: options.file ?? undefined,
    footer: normalizeAddon(options.footer),
    format,
    freeze: options.freeze ?? true,
    generatedCode,
    globals: normalizeGlobals(options.globals),
    hashCharacters: (options.hashCharacters as HashCharacters) ?? "base64",
    hoistTransitiveImports: options.hoistTransitiveImports ?? true,
    indent:
      options.indent === undefined
        ? true
        : options.indent === false
          ? true
          : options.indent,
    inlineDynamicImports: options.inlineDynamicImports ?? false,
    interop: normalizeInterop(options.interop),
    intro: normalizeAddon(options.intro),
    manualChunks: (options.manualChunks as ManualChunksOption) ?? {},
    minifyInternalExports:
      options.minifyInternalExports ?? (format === "es" || format === "system"),
    name: options.name ?? undefined,
    noConflict: options.noConflict ?? false,
    outro: normalizeAddon(options.outro),
    paths: (options.paths as OptionsPaths) ?? {},
    plugins: normalizeOutputPlugins(
      options.plugins as ReadonlyArray<OutputPluginOption> | undefined,
    ),
    preserveModules: options.preserveModules ?? false,
    preserveModulesRoot: options.preserveModulesRoot ?? undefined,
    sanitizeFileName: normalizeSanitizeFileName(options.sanitizeFileName),
    sourcemap: options.sourcemap ?? false,
    sourcemapBaseUrl: options.sourcemapBaseUrl ?? undefined,
    sourcemapDebugIds: options.sourcemapDebugIds ?? false,
    sourcemapExcludeSources: options.sourcemapExcludeSources ?? false,
    sourcemapFile: options.sourcemapFile ?? undefined,
    sourcemapFileNames: options.sourcemapFileNames ?? undefined,
    sourcemapIgnoreList:
      (options.sourcemapIgnoreList as SourcemapIgnoreListOption) ??
      ((relPath: string) => relPath.includes("node_modules")),
    sourcemapPathTransform:
      (options.sourcemapPathTransform as
        | SourcemapPathTransformOption
        | undefined) ?? undefined,
    strict: options.strict ?? true,
    systemNullSetters: options.systemNullSetters ?? true,
    validate: options.validate ?? false,
    virtualDirname: options.virtualDirname ?? "__virtual__",
  };
};
