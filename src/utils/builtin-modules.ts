/**
 * Static list of Node.js built-in module names for
 * MISSING_NODE_BUILTINS warning detection.
 *
 * @module utils/builtin-modules
 */

/** Node.js built-in module names (bare, without node: prefix). */
export const BUILTIN_MODULES: ReadonlyArray<string> = [
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
] as const;

/** Node.js built-in module names with the `node:` prefix. */
export const BUILTIN_MODULES_WITH_PREFIX: ReadonlyArray<string> =
  BUILTIN_MODULES.map((m: string): string => `node:${m}`);

/** Set for O(1) lookup of bare module names. */
const BUILTIN_SET: ReadonlySet<string> = new Set([
  ...BUILTIN_MODULES,
  ...BUILTIN_MODULES_WITH_PREFIX,
]);

/**
 * Returns whether the given module identifier is a Node.js built-in,
 * accepting both bare names (`fs`) and prefixed names (`node:fs`).
 */
export const isBuiltinModule = (id: string): boolean => BUILTIN_SET.has(id);
