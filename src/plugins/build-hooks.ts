/**
 * @module plugins/build-hooks
 * @description Build phase hook definitions and executor for steamroller.
 * Defines all 9 build hooks with their execution strategies and provides
 * a typed BuildHookExecutor class that wraps PluginDriver for safe invocation.
 */

import type {
  Plugin,
  InputOptions,
  NormalizedInputOptions,
  ModuleInfo,
  ResolvedId,
  LoadResult,
  TransformResult,
} from "../types.js";
import { PluginDriver, getHookHandler, sortPluginsByOrder } from "./driver.js";

// ============================================================
// Hook Strategy Types
// ============================================================

/** Execution strategy for a build hook. */
export type BuildHookStrategy = "sequential" | "parallel" | "first";

/** Metadata describing a single build hook. */
export interface BuildHookDefinition {
  readonly strategy: BuildHookStrategy;
  readonly async: boolean;
}

// ============================================================
// Hook Definitions
// ============================================================

/**
 * All 9 build phase hooks with their execution strategies.
 *
 * - sequential: hooks run in order, each may modify the result
 * - parallel: all hooks fire concurrently (notification-style)
 * - first: stops at first non-null result
 */
export const BUILD_HOOKS: Readonly<Record<string, BuildHookDefinition>> = {
  options: { strategy: "sequential", async: true },
  buildStart: { strategy: "parallel", async: true },
  resolveId: { strategy: "first", async: true },
  resolveDynamicImport: { strategy: "first", async: true },
  load: { strategy: "first", async: true },
  shouldTransformCachedModule: { strategy: "first", async: true },
  transform: { strategy: "sequential", async: true },
  moduleParsed: { strategy: "parallel", async: true },
  buildEnd: { strategy: "parallel", async: true },
} as const;

// ============================================================
// Build Hook Executor
// ============================================================

/**
 * BuildHookExecutor wraps PluginDriver with typed hook invocations
 * for all 9 build phase hooks. Each method enforces the correct
 * execution strategy and argument types.
 */
export class BuildHookExecutor {
  private readonly driver: PluginDriver;

  constructor(driver: PluginDriver) {
    this.driver = driver;
  }

  /** Get the underlying plugin driver (for testing). */
  getDriver(): PluginDriver {
    return this.driver;
  }

  /**
   * options hook: sequential (reduce) strategy.
   * Each plugin may modify the input options object.
   * Returns the final accumulated options.
   */
  async options(inputOptions: InputOptions): Promise<InputOptions> {
    return this.driver.hookReduce<InputOptions>(
      "options",
      inputOptions,
      (acc: InputOptions, result: unknown): InputOptions => {
        return { ...acc, ...(result as Partial<InputOptions>) };
      },
      [inputOptions],
    );
  }

  /**
   * buildStart hook: parallel strategy.
   * All plugins are notified concurrently when build starts.
   */
  async buildStart(options: NormalizedInputOptions): Promise<void> {
    await this.driver.hookParallel("buildStart", [options]);
  }

  /**
   * resolveId hook: first strategy.
   * Stops at the first plugin returning a non-null resolution.
   */
  async resolveId(
    source: string,
    importer: string | undefined,
    options: {
      readonly isEntry: boolean;
      readonly attributes: Readonly<Record<string, string>>;
    },
  ): Promise<ResolvedId | string | null> {
    return this.driver.hookFirst<ResolvedId | string>("resolveId", [
      source,
      importer,
      options,
    ]);
  }

  /**
   * resolveDynamicImport hook: first strategy.
   * Stops at the first plugin returning a non-null resolution
   * for a dynamic import specifier.
   */
  async resolveDynamicImport(
    specifier: string | unknown,
    importer: string,
    options: {
      readonly attributes: Readonly<Record<string, string>>;
    },
  ): Promise<ResolvedId | string | null> {
    return this.driver.hookFirst<ResolvedId | string>("resolveDynamicImport", [
      specifier,
      importer,
      options,
    ]);
  }

  /**
   * load hook: first strategy.
   * Stops at the first plugin that provides module content.
   */
  async load(id: string): Promise<LoadResult | null> {
    return this.driver.hookFirst<LoadResult>("load", [id]);
  }

  /**
   * shouldTransformCachedModule hook: first strategy.
   * Stops at the first plugin returning a boolean decision.
   */
  async shouldTransformCachedModule(options: {
    readonly id: string;
    readonly code: string;
    readonly ast: unknown;
    readonly meta: Readonly<Record<string, unknown>>;
  }): Promise<boolean | null> {
    return this.driver.hookFirst<boolean>("shouldTransformCachedModule", [
      options,
    ]);
  }

  /**
   * transform hook: sequential (reduce) strategy.
   * Each plugin receives the accumulated code from previous plugins.
   * Returns the final { code, map } result.
   */
  async transform(
    code: string,
    id: string,
  ): Promise<{ readonly code: string; readonly map?: unknown }> {
    const plugins = this.driver.getPlugins();
    const sorted = sortPluginsByOrder(plugins, "transform");
    let acc: { readonly code: string; readonly map?: unknown } = {
      code,
      map: undefined,
    };

    for (const plugin of sorted) {
      const hook = (plugin as unknown as Record<string, unknown>)["transform"];
      if (!hook) {
        continue;
      }
      const handler = getHookHandler(hook) as (
        ...args: Array<unknown>
      ) => unknown;
      if (typeof handler !== "function") {
        continue;
      }
      const result = await handler.call(undefined, acc.code, id);
      if (result === null || result === undefined) {
        continue;
      }
      if (typeof result === "string") {
        acc = { code: result, map: undefined };
      } else {
        const r = result as {
          readonly code?: string;
          readonly map?: unknown;
        };
        acc = { code: r.code ?? acc.code, map: r.map ?? acc.map };
      }
    }

    return acc;
  }

  /**
   * moduleParsed hook: parallel strategy.
   * All plugins are notified concurrently when a module is parsed.
   */
  async moduleParsed(info: ModuleInfo): Promise<void> {
    await this.driver.hookParallel("moduleParsed", [info]);
  }

  /**
   * buildEnd hook: parallel strategy.
   * All plugins are notified concurrently when build ends.
   * Receives an error if the build failed.
   */
  async buildEnd(error?: Error): Promise<void> {
    await this.driver.hookParallel("buildEnd", [error]);
  }
}
