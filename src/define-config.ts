/**
 * Type helper for Steamroller configuration files.
 *
 * Provides IntelliSense and type checking when authoring config files.
 */

/**
 * Placeholder type for Rollup-compatible configuration options.
 *
 * This will be replaced with a full type definition when the config
 * system is implemented (see #116).
 */
export interface RollupOptions {
  readonly [key: string]: unknown;
}

/**
 * A function form of configuration that receives CLI arguments and
 * returns one or more config objects (optionally async).
 */
export type RollupOptionsFunction = (
  commandLineArgs: Record<string, unknown>,
) => RollupOptions | ReadonlyArray<RollupOptions> | Promise<RollupOptions | ReadonlyArray<RollupOptions>>;

// NOTE: defineConfig uses function overloads, which require the
// `function` keyword in TypeScript. This is an acceptable exception
// to any preference for arrow functions.

/** Accept a single configuration object. */
export function defineConfig(options: RollupOptions): RollupOptions;
/** Accept an array of configuration objects. */
export function defineConfig(
  options: ReadonlyArray<RollupOptions>,
): ReadonlyArray<RollupOptions>;
/** Accept a function that produces configuration. */
export function defineConfig(options: RollupOptionsFunction): RollupOptionsFunction;
/**
 * Identity helper that returns its input unchanged.
 *
 * Use this in `steamroller.config.ts` to get type checking and
 * editor auto-completion for configuration options.
 */
export function defineConfig(
  options: RollupOptions | ReadonlyArray<RollupOptions> | RollupOptionsFunction,
): RollupOptions | ReadonlyArray<RollupOptions> | RollupOptionsFunction {
  return options;
}
