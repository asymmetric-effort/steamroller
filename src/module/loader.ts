/**
 * @module module/loader
 * @description Module loading pipeline for the bundler. Coordinates load hooks,
 * filesystem fallback, sequential transforms, AST parsing, and parallel
 * moduleParsed notifications with semaphore-based concurrency control.
 */

import { createSemaphore } from "../utils/semaphore.js";
import type { Semaphore } from "../utils/semaphore.js";
import type { FsModule } from "../fs/types.js";
import { parse } from "../parser/parser.js";
import { normalizePath } from "../utils/path.js";

/**
 * Hook that provides custom loading for a module by its id.
 * The first hook returning a non-null result wins.
 */
export type LoadHook = (
  id: string,
) => Promise<LoadResult | null | undefined> | LoadResult | null | undefined;

/**
 * Hook that transforms module source code sequentially.
 * Each hook receives the output of the previous hook.
 */
export type TransformHook = (
  code: string,
  id: string,
) =>
  | Promise<TransformResult | null | undefined>
  | TransformResult
  | null
  | undefined;

/**
 * Hook fired after a module has been parsed.
 * All moduleParsed hooks fire in parallel.
 */
export type ModuleParsedHook = (info: unknown) => Promise<void> | void;

/** Result returned by a load hook. */
export interface LoadResult {
  readonly code: string;
  readonly map?: unknown;
  readonly ast?: unknown;
  readonly meta?: Record<string, unknown>;
  readonly syntheticNamedExports?: boolean | string;
  readonly moduleSideEffects?: boolean | "no-treeshake";
}

/** Result returned by a transform hook. */
export interface TransformResult {
  readonly code: string;
  readonly map?: unknown;
  readonly ast?: unknown;
  readonly meta?: Record<string, unknown>;
  readonly syntheticNamedExports?: boolean | string;
  readonly moduleSideEffects?: boolean | "no-treeshake";
}

/** Fully loaded and parsed module data. */
export interface LoadedModule {
  readonly code: string;
  readonly ast: unknown;
  readonly meta: Record<string, unknown>;
  readonly moduleSideEffects: boolean | "no-treeshake";
  readonly syntheticNamedExports: boolean | string;
}

/** Options for constructing a ModuleLoader. */
export interface LoaderOptions {
  readonly fs: FsModule;
  readonly maxParallelFileOps: number;
  readonly loadHooks: ReadonlyArray<LoadHook>;
  readonly transformHooks: ReadonlyArray<TransformHook>;
  readonly moduleParsedHooks: ReadonlyArray<ModuleParsedHook>;
}

/**
 * Module loading pipeline that coordinates hooks, filesystem access,
 * transforms, and parsing with bounded concurrency.
 *
 * Pipeline stages:
 * 1. Try load hooks (first non-null wins)
 * 2. Default: read from filesystem
 * 3. Run transform hooks sequentially
 * 4. Parse to AST if not provided
 * 5. Fire moduleParsed hooks in parallel
 * 6. Return result
 */
export class ModuleLoader {
  private readonly fs: FsModule;
  private readonly semaphore: Semaphore;
  private readonly loadHooks: ReadonlyArray<LoadHook>;
  private readonly transformHooks: ReadonlyArray<TransformHook>;
  private readonly moduleParsedHooks: ReadonlyArray<ModuleParsedHook>;

  constructor(options: LoaderOptions) {
    this.fs = options.fs;
    this.semaphore = createSemaphore(options.maxParallelFileOps);
    this.loadHooks = options.loadHooks;
    this.transformHooks = options.transformHooks;
    this.moduleParsedHooks = options.moduleParsedHooks;
  }

  /**
   * Load a module by its resolved id.
   *
   * Acquires a semaphore slot, runs the load/transform/parse pipeline,
   * fires moduleParsed hooks, and returns the fully-loaded module data.
   *
   * @param id - The resolved module id (absolute path or virtual id).
   * @returns The loaded module with code, AST, and metadata.
   * @throws {Error} If the module cannot be loaded from hooks or filesystem.
   */
  async loadModule(id: string): Promise<LoadedModule> {
    await this.semaphore.acquire();
    try {
      return await this.executeLoadPipeline(id);
    } finally {
      this.semaphore.release();
    }
  }

  /**
   * Execute the full load pipeline for a single module.
   */
  private async executeLoadPipeline(id: string): Promise<LoadedModule> {
    const normalizedId = normalizePath(id);

    // Stage 1: Try load hooks (first non-null wins)
    const loadResult = await this.runLoadHooks(normalizedId);

    // Stage 2: Default filesystem read if no hook provided content
    let code: string;
    let ast: unknown = undefined;
    let meta: Record<string, unknown> = {};
    let syntheticNamedExports: boolean | string = false;
    let moduleSideEffects: boolean | "no-treeshake" = true;

    if (loadResult !== null && loadResult !== undefined) {
      code = loadResult.code;
      ast = loadResult.ast;
      meta = loadResult.meta ? { ...loadResult.meta } : {};
      syntheticNamedExports = loadResult.syntheticNamedExports ?? false;
      moduleSideEffects = loadResult.moduleSideEffects ?? true;
    } else {
      code = await this.readFromFilesystem(normalizedId);
    }

    // Stage 3: Run transform hooks sequentially
    const transformState = await this.runTransformHooks(
      code,
      normalizedId,
      ast,
      meta,
      syntheticNamedExports,
      moduleSideEffects,
    );
    code = transformState.code;
    ast = transformState.ast;
    meta = transformState.meta;
    syntheticNamedExports = transformState.syntheticNamedExports;
    moduleSideEffects = transformState.moduleSideEffects;

    // Stage 4: Parse to AST if not already provided
    if (ast === undefined || ast === null) {
      ast = parse(code, { sourceType: "module" });
    }

    // Stage 5: Fire moduleParsed hooks in parallel
    const moduleInfo: LoadedModule = Object.freeze({
      code,
      ast,
      meta: Object.freeze({ ...meta }),
      moduleSideEffects,
      syntheticNamedExports,
    });

    await this.fireModuleParsedHooks(moduleInfo);

    // Stage 6: Return result
    return moduleInfo;
  }

  /**
   * Run load hooks iteratively; first non-null result wins.
   */
  private async runLoadHooks(
    id: string,
  ): Promise<LoadResult | null | undefined> {
    for (let i = 0; i < this.loadHooks.length; i++) {
      const result = await this.loadHooks[i](id);
      if (result !== null && result !== undefined) {
        return result;
      }
    }
    return null;
  }

  /**
   * Read module source from the filesystem.
   */
  private async readFromFilesystem(id: string): Promise<string> {
    return this.fs.readFile(id, "utf-8");
  }

  /**
   * Run transform hooks sequentially, threading state through each.
   */
  private async runTransformHooks(
    initialCode: string,
    id: string,
    initialAst: unknown,
    initialMeta: Record<string, unknown>,
    initialSyntheticNamedExports: boolean | string,
    initialModuleSideEffects: boolean | "no-treeshake",
  ): Promise<{
    code: string;
    ast: unknown;
    meta: Record<string, unknown>;
    syntheticNamedExports: boolean | string;
    moduleSideEffects: boolean | "no-treeshake";
  }> {
    let code = initialCode;
    let ast = initialAst;
    let meta = initialMeta;
    let syntheticNamedExports = initialSyntheticNamedExports;
    let moduleSideEffects = initialModuleSideEffects;

    for (let i = 0; i < this.transformHooks.length; i++) {
      const result = await this.transformHooks[i](code, id);
      if (result !== null && result !== undefined) {
        code = result.code;
        ast = result.ast ?? undefined;
        if (result.meta) {
          meta = { ...meta, ...result.meta };
        }
        if (result.syntheticNamedExports !== undefined) {
          syntheticNamedExports = result.syntheticNamedExports;
        }
        if (result.moduleSideEffects !== undefined) {
          moduleSideEffects = result.moduleSideEffects;
        }
      }
    }

    return { code, ast, meta, syntheticNamedExports, moduleSideEffects };
  }

  /**
   * Fire all moduleParsed hooks in parallel.
   */
  private async fireModuleParsedHooks(info: LoadedModule): Promise<void> {
    const promises: Array<Promise<void> | void> = [];
    for (let i = 0; i < this.moduleParsedHooks.length; i++) {
      promises.push(this.moduleParsedHooks[i](info));
    }
    await Promise.all(promises);
  }
}
