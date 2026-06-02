/**
 * @module plugins/driver
 * @description Plugin driver (hook execution engine) for steamroller.
 * Provides strategies for executing plugin hooks: first, sequential,
 * parallel, and reduce. Supports hook ordering (pre/post) and
 * duplicate plugin name detection.
 */

import type { Plugin, StringFilter } from "../types.js";
import { DUPLICATE_PLUGIN_NAME } from "../utils/error-codes.js";

/** Strategy for executing hooks across plugins. */
export type HookStrategy = "first" | "sequential" | "parallel";

/** Definition of a hook with execution metadata. */
export interface HookDefinition {
  readonly name: string;
  readonly strategy: HookStrategy;
  readonly async: boolean;
}

/** Warning structure emitted by the plugin driver. */
export interface PluginWarning {
  readonly code: string;
  readonly message: string;
}

/**
 * Extract the handler function from an ObjectHook.
 * ObjectHook can be a plain function or an object with { handler, order, filter }.
 */
export const getHookHandler = <T>(
  hook: T | { readonly handler: T; readonly order?: string | null },
): T => {
  if (
    hook !== null &&
    hook !== undefined &&
    typeof hook === "object" &&
    "handler" in (hook as Record<string, unknown>)
  ) {
    return (hook as { readonly handler: T }).handler;
  }
  return hook as T;
};

/**
 * Get the execution order from an ObjectHook.
 * Returns 'pre', 'post', or null.
 */
export const getHookOrder = (hook: unknown): "pre" | "post" | null => {
  if (
    hook !== null &&
    hook !== undefined &&
    typeof hook === "object" &&
    "order" in (hook as Record<string, unknown>)
  ) {
    const order = (hook as { readonly order?: "pre" | "post" | null }).order;
    return order ?? null;
  }
  return null;
};

/**
 * Get the HookFilter id pattern from an ObjectHook.
 * Returns the StringFilter for module ID matching, or undefined if none.
 */
export const getHookFilter = (hook: unknown): StringFilter | undefined => {
  if (
    hook !== null &&
    hook !== undefined &&
    typeof hook === "object" &&
    "id" in (hook as Record<string, unknown>)
  ) {
    return (hook as { readonly id?: StringFilter }).id;
  }
  return undefined;
};

/**
 * Check whether a hook should run for the given module ID.
 * If the hook has no filter, it always runs. If it has an id filter,
 * the module ID must match the filter pattern(s).
 */
export const shouldRunHookForModule = (
  hook: unknown,
  moduleId: string | undefined,
): boolean => {
  if (moduleId === undefined) {
    return true;
  }
  const filter = getHookFilter(hook);
  return matchesFilter(moduleId, filter);
};

/** Safely access a hook property from a plugin by name. */
const getPluginHook = (plugin: Plugin, hookName: string): unknown => {
  return (plugin as unknown as Record<string, unknown>)[hookName];
};

/**
 * Sort plugins by their hook order for a specific hook name.
 * Order: pre -> normal (no order) -> post.
 */
export const sortPluginsByOrder = (
  plugins: ReadonlyArray<Plugin>,
  hookName: string,
): ReadonlyArray<Plugin> => {
  const pre: Array<Plugin> = [];
  const normal: Array<Plugin> = [];
  const post: Array<Plugin> = [];

  for (const plugin of plugins) {
    const hook = getPluginHook(plugin, hookName);
    const order = getHookOrder(hook);
    if (order === "pre") {
      pre.push(plugin);
    } else if (order === "post") {
      post.push(plugin);
    } else {
      normal.push(plugin);
    }
  }

  return [...pre, ...normal, ...post];
};

/**
 * Test whether a value matches a StringFilter.
 * Supports string (equality or substring), RegExp, or array of either.
 */
export const matchesFilter = (
  value: string,
  filter: string | RegExp | ReadonlyArray<string | RegExp> | undefined,
): boolean => {
  if (filter === undefined || filter === null) {
    return true;
  }
  if (typeof filter === "string") {
    return value === filter || value.includes(filter);
  }
  if (filter instanceof RegExp) {
    return filter.test(value);
  }
  for (const f of filter) {
    if (typeof f === "string") {
      if (value === f || value.includes(f)) {
        return true;
      }
    } else {
      if (f.test(value)) {
        return true;
      }
    }
  }
  return false;
};

/** Type for a hook handler function. */
type HookHandlerFn = (...args: Array<unknown>) => unknown;

/**
 * Plugin driver: orchestrates hook execution across all registered plugins.
 *
 * Supports four execution strategies:
 * - first: stops at first non-null result
 * - sequential: runs all hooks in order, collects results
 * - parallel: runs all hooks concurrently
 * - reduce: threads an accumulator through each hook
 */
export class PluginDriver {
  private readonly plugins: ReadonlyArray<Plugin>;
  private readonly onWarning: (warning: PluginWarning) => void;

  constructor(
    plugins: ReadonlyArray<Plugin>,
    onWarning: (warning: PluginWarning) => void,
  ) {
    const names = new Set<string>();
    for (const plugin of plugins) {
      if (names.has(plugin.name)) {
        onWarning({
          code: DUPLICATE_PLUGIN_NAME,
          message: `Plugin name '${plugin.name}' is duplicated`,
        });
      }
      names.add(plugin.name);
    }
    this.plugins = plugins;
    this.onWarning = onWarning;
  }

  /** Get the registered plugins. */
  getPlugins(): ReadonlyArray<Plugin> {
    return this.plugins;
  }

  /** Get the warning handler (for testing). */
  getWarningHandler(): (warning: PluginWarning) => void {
    return this.onWarning;
  }

  /**
   * Execute hook with 'first' strategy.
   * Stops at the first plugin that returns a non-null/undefined value.
   * When filterModuleId is provided, hooks with an id filter that doesn't
   * match the module ID will be skipped.
   */
  async hookFirst<R>(
    hookName: string,
    args: ReadonlyArray<unknown>,
    context?: unknown,
    filterModuleId?: string,
  ): Promise<R | null> {
    const sorted = sortPluginsByOrder(this.plugins, hookName);
    for (const plugin of sorted) {
      const hook = getPluginHook(plugin, hookName);
      if (!hook) {
        continue;
      }
      const handler = getHookHandler(hook) as HookHandlerFn;
      if (typeof handler !== "function") {
        continue;
      }
      if (!shouldRunHookForModule(hook, filterModuleId)) {
        continue;
      }
      const result = await handler.apply(context, [...args]);
      if (result != null) {
        return result as R;
      }
    }
    return null;
  }

  /**
   * Execute hook with 'sequential' strategy.
   * Runs all plugins in order, collecting non-null results.
   * When filterModuleId is provided, hooks with an id filter that doesn't
   * match the module ID will be skipped.
   */
  async hookSequential<R>(
    hookName: string,
    args: ReadonlyArray<unknown>,
    context?: unknown,
    filterModuleId?: string,
  ): Promise<ReadonlyArray<R>> {
    const sorted = sortPluginsByOrder(this.plugins, hookName);
    const results: Array<R> = [];
    for (const plugin of sorted) {
      const hook = getPluginHook(plugin, hookName);
      if (!hook) {
        continue;
      }
      const handler = getHookHandler(hook) as HookHandlerFn;
      if (typeof handler !== "function") {
        continue;
      }
      if (!shouldRunHookForModule(hook, filterModuleId)) {
        continue;
      }
      const result = await handler.apply(context, [...args]);
      if (result != null) {
        results.push(result as R);
      }
    }
    return results;
  }

  /**
   * Execute hook with 'parallel' strategy.
   * All hooks start concurrently; waits for all to complete.
   * When filterModuleId is provided, hooks with an id filter that doesn't
   * match the module ID will be skipped.
   */
  async hookParallel(
    hookName: string,
    args: ReadonlyArray<unknown>,
    context?: unknown,
    filterModuleId?: string,
  ): Promise<void> {
    const sorted = sortPluginsByOrder(this.plugins, hookName);
    const promises: Array<Promise<void>> = [];
    for (const plugin of sorted) {
      const hook = getPluginHook(plugin, hookName);
      if (!hook) {
        continue;
      }
      const handler = getHookHandler(hook) as HookHandlerFn;
      if (typeof handler !== "function") {
        continue;
      }
      if (!shouldRunHookForModule(hook, filterModuleId)) {
        continue;
      }
      promises.push(
        Promise.resolve(handler.apply(context, [...args])).then(
          () => undefined,
        ),
      );
    }
    await Promise.all(promises);
  }

  /**
   * Execute hook with 'reduce' strategy.
   * Threads an accumulator through each plugin's hook result.
   * When filterModuleId is provided, hooks with an id filter that doesn't
   * match the module ID will be skipped.
   */
  async hookReduce<R>(
    hookName: string,
    initial: R,
    reducer: (acc: R, result: unknown) => R,
    args: ReadonlyArray<unknown>,
    context?: unknown,
    filterModuleId?: string,
  ): Promise<R> {
    const sorted = sortPluginsByOrder(this.plugins, hookName);
    let acc = initial;
    for (const plugin of sorted) {
      const hook = getPluginHook(plugin, hookName);
      if (!hook) {
        continue;
      }
      const handler = getHookHandler(hook) as HookHandlerFn;
      if (typeof handler !== "function") {
        continue;
      }
      if (!shouldRunHookForModule(hook, filterModuleId)) {
        continue;
      }
      const result = await handler.apply(context, [...args, acc]);
      if (result != null) {
        acc = reducer(acc, result);
      }
    }
    return acc;
  }
}
