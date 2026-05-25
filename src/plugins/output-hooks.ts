/**
 * @module plugins/output-hooks
 * @description Output generation phase hook definitions and executor for steamroller.
 * Defines all 14 output hooks with their execution strategies and provides
 * a typed OutputHookExecutor class that wraps PluginDriver for safe invocation.
 */

import type {
  NormalizedOutputOptions,
  NormalizedInputOptions,
  OutputBundle,
  RenderedChunk,
  ModuleFormat,
  SourceMapInput,
} from "../types.js";
import { PluginDriver, sortPluginsByOrder, getHookHandler } from "./driver.js";

// ============================================================
// Hook Strategy Types
// ============================================================

/** Execution strategy for an output hook. */
export type OutputHookStrategy = "sequential" | "parallel" | "first";

/** Metadata describing a single output hook. */
export interface OutputHookDefinition {
  readonly strategy: OutputHookStrategy;
  readonly async: boolean;
}

// ============================================================
// Hook Definitions
// ============================================================

/**
 * All 14 output phase hooks with their execution strategies.
 *
 * - sequential: hooks run in order, each may modify the result
 * - parallel: all hooks fire concurrently (notification-style)
 * - first: stops at first non-null result
 */
export const OUTPUT_HOOKS: Readonly<Record<string, OutputHookDefinition>> = {
  renderStart: { strategy: "parallel", async: true },
  banner: { strategy: "sequential", async: true },
  footer: { strategy: "sequential", async: true },
  intro: { strategy: "sequential", async: true },
  outro: { strategy: "sequential", async: true },
  renderDynamicImport: { strategy: "first", async: true },
  augmentChunkHash: { strategy: "sequential", async: true },
  resolveFileUrl: { strategy: "first", async: true },
  resolveImportMeta: { strategy: "first", async: true },
  renderChunk: { strategy: "sequential", async: true },
  generateBundle: { strategy: "sequential", async: true },
  writeBundle: { strategy: "parallel", async: true },
  closeBundle: { strategy: "parallel", async: true },
  renderError: { strategy: "parallel", async: true },
} as const;

// ============================================================
// Render Chunk Result Type
// ============================================================

/** Result of the renderChunk hook chain. */
export interface RenderChunkResult {
  readonly code: string;
  readonly map?: SourceMapInput;
}

// ============================================================
// Resolve File URL Options
// ============================================================

/** Options passed to the resolveFileUrl hook. */
export interface ResolveFileUrlOptions {
  readonly chunkId: string;
  readonly fileName: string;
  readonly format: ModuleFormat;
  readonly moduleId: string;
  readonly referenceId: string;
  readonly relativePath: string;
}

// ============================================================
// Resolve Import Meta Options
// ============================================================

/** Options passed to the resolveImportMeta hook. */
export interface ResolveImportMetaOptions {
  readonly chunkId: string;
  readonly format: ModuleFormat;
  readonly moduleId: string;
}

// ============================================================
// Render Dynamic Import Options
// ============================================================

/** Options passed to the renderDynamicImport hook. */
export interface RenderDynamicImportOptions {
  readonly customResolution: string | null;
  readonly format: ModuleFormat;
  readonly moduleId: string;
  readonly targetModuleId: string | null;
}

/** Result of the renderDynamicImport hook. */
export interface RenderDynamicImportResult {
  readonly left: string;
  readonly right: string;
}

// ============================================================
// Output Hook Executor
// ============================================================

/** Type for a hook handler function. */
type HookHandlerFn = (...args: Array<unknown>) => unknown;

/**
 * OutputHookExecutor wraps PluginDriver with typed hook invocations
 * for all 14 output phase hooks. Each method enforces the correct
 * execution strategy and argument types.
 */
export class OutputHookExecutor {
  private readonly driver: PluginDriver;

  constructor(driver: PluginDriver) {
    this.driver = driver;
  }

  /** Get the underlying plugin driver (for testing). */
  getDriver(): PluginDriver {
    return this.driver;
  }

  /**
   * renderStart hook: parallel strategy.
   * All plugins are notified concurrently when output generation starts.
   */
  async renderStart(
    outputOptions: NormalizedOutputOptions,
    inputOptions: NormalizedInputOptions,
  ): Promise<void> {
    await this.driver.hookParallel("renderStart", [
      outputOptions,
      inputOptions,
    ]);
  }

  /**
   * banner hook: sequential strategy.
   * Collects banner strings from all plugins and concatenates them.
   */
  async banner(chunk: RenderedChunk): Promise<string> {
    const results = await this.driver.hookSequential<string>("banner", [chunk]);
    return results.filter(Boolean).join("\n");
  }

  /**
   * footer hook: sequential strategy.
   * Collects footer strings from all plugins and concatenates them.
   */
  async footer(chunk: RenderedChunk): Promise<string> {
    const results = await this.driver.hookSequential<string>("footer", [chunk]);
    return results.filter(Boolean).join("\n");
  }

  /**
   * intro hook: sequential strategy.
   * Collects intro strings from all plugins and concatenates them.
   */
  async intro(chunk: RenderedChunk): Promise<string> {
    const results = await this.driver.hookSequential<string>("intro", [chunk]);
    return results.filter(Boolean).join("\n");
  }

  /**
   * outro hook: sequential strategy.
   * Collects outro strings from all plugins and concatenates them.
   */
  async outro(chunk: RenderedChunk): Promise<string> {
    const results = await this.driver.hookSequential<string>("outro", [chunk]);
    return results.filter(Boolean).join("\n");
  }

  /**
   * renderDynamicImport hook: first strategy.
   * Stops at the first plugin returning a non-null dynamic import rendering.
   */
  async renderDynamicImport(
    options: RenderDynamicImportOptions,
  ): Promise<RenderDynamicImportResult | null> {
    return this.driver.hookFirst<RenderDynamicImportResult>(
      "renderDynamicImport",
      [options],
    );
  }

  /**
   * augmentChunkHash hook: sequential strategy.
   * Collects hash augmentation strings from all plugins and concatenates them.
   */
  async augmentChunkHash(chunk: RenderedChunk): Promise<string> {
    const results = await this.driver.hookSequential<string>(
      "augmentChunkHash",
      [chunk],
    );
    return results.filter(Boolean).join("");
  }

  /**
   * resolveFileUrl hook: first strategy.
   * Stops at the first plugin returning a non-null file URL resolution.
   */
  async resolveFileUrl(options: ResolveFileUrlOptions): Promise<string | null> {
    return this.driver.hookFirst<string>("resolveFileUrl", [options]);
  }

  /**
   * resolveImportMeta hook: first strategy.
   * Stops at the first plugin returning a non-null import.meta resolution.
   */
  async resolveImportMeta(
    property: string | null,
    options: ResolveImportMetaOptions,
  ): Promise<string | null> {
    return this.driver.hookFirst<string>("resolveImportMeta", [
      property,
      options,
    ]);
  }

  /**
   * renderChunk hook: sequential (reduce) strategy.
   * Each plugin receives the accumulated code from previous plugins.
   * Returns the final { code, map } result.
   */
  async renderChunk(
    code: string,
    chunk: RenderedChunk,
    options: NormalizedOutputOptions,
  ): Promise<RenderChunkResult> {
    const plugins = this.driver.getPlugins();
    const sorted = sortPluginsByOrder(plugins, "renderChunk");
    let acc: RenderChunkResult = { code, map: undefined };

    for (const plugin of sorted) {
      const hook = (plugin as unknown as Record<string, unknown>)[
        "renderChunk"
      ];
      if (!hook) {
        continue;
      }
      const handler = getHookHandler(hook) as HookHandlerFn;
      if (typeof handler !== "function") {
        continue;
      }
      const result = await handler.call(undefined, acc.code, chunk, options);
      if (result === null || result === undefined) {
        continue;
      }
      if (typeof result === "string") {
        acc = { code: result, map: undefined };
      } else {
        const r = result as {
          readonly code?: string;
          readonly map?: SourceMapInput;
        };
        acc = { code: r.code ?? acc.code, map: r.map ?? acc.map };
      }
    }

    return acc;
  }

  /**
   * generateBundle hook: sequential strategy.
   * Runs all plugins in order with the output bundle.
   * Plugins may mutate the bundle (e.g., add/remove assets).
   */
  async generateBundle(
    options: NormalizedOutputOptions,
    bundle: OutputBundle,
    isWrite: boolean,
  ): Promise<void> {
    await this.driver.hookSequential("generateBundle", [
      options,
      bundle,
      isWrite,
    ]);
  }

  /**
   * writeBundle hook: parallel strategy.
   * All plugins are notified concurrently after bundle is written to disk.
   */
  async writeBundle(
    options: NormalizedOutputOptions,
    bundle: OutputBundle,
  ): Promise<void> {
    await this.driver.hookParallel("writeBundle", [options, bundle]);
  }

  /**
   * closeBundle hook: parallel strategy.
   * All plugins are notified concurrently when the bundle is closed.
   */
  async closeBundle(): Promise<void> {
    await this.driver.hookParallel("closeBundle", []);
  }

  /**
   * renderError hook: parallel strategy.
   * All plugins are notified concurrently when a render error occurs.
   */
  async renderError(error?: Error): Promise<void> {
    await this.driver.hookParallel("renderError", [error]);
  }
}
