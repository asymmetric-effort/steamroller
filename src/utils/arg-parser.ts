/**
 * Zero-dependency CLI argument parser supporting long/short flags,
 * boolean negation, dot notation, arrays, aliases, and defaults.
 *
 * Replaces yargs-parser with a focused, type-safe implementation.
 *
 * @module utils/arg-parser
 */

/**
 * Result of parsing command-line arguments.
 * The `_` property holds positional (non-flag) arguments.
 * Named properties hold parsed flag values.
 */
export interface ParsedArgs {
  readonly _: ReadonlyArray<string>;
  readonly [key: string]: unknown;
}

/**
 * Configuration options controlling how arguments are parsed.
 *
 * - `boolean`: flags treated as boolean (no value consumed)
 * - `string`: flags whose values are always kept as strings
 * - `array`: flags that accumulate into arrays
 * - `alias`: maps from canonical name to one or more aliases
 * - `default`: fallback values for flags not supplied
 */
export interface ParserOptions {
  readonly boolean?: ReadonlyArray<string>;
  readonly string?: ReadonlyArray<string>;
  readonly array?: ReadonlyArray<string>;
  readonly alias?: Readonly<Record<string, string | ReadonlyArray<string>>>;
  readonly default?: Readonly<Record<string, unknown>>;
}

/** Maximum depth for dot-notation nesting to prevent abuse. */
const MAX_DOT_DEPTH = 10;

/** Maximum number of arguments we will process. */
const MAX_ARGS = 10_000;

/**
 * Build a bidirectional alias map so lookups work in either direction.
 * Given `{ verbose: ['v'] }`, produces:
 *   `{ verbose: 'verbose', v: 'verbose' }`
 */
const buildAliasMap = (
  aliasConfig: Readonly<Record<string, string | ReadonlyArray<string>>>,
): Readonly<Record<string, string>> => {
  const map: Record<string, string> = {};
  const keys = Object.keys(aliasConfig);
  for (const key of keys) {
    map[key] = key;
    const aliases = aliasConfig[key];
    if (typeof aliases === "string") {
      map[aliases] = key;
    } else if (Array.isArray(aliases)) {
      for (const a of aliases) {
        map[a] = key;
      }
    }
  }
  return map;
};

/**
 * Resolve a flag name through the alias map, returning the canonical name.
 */
const resolveAlias = (
  name: string,
  aliasMap: Readonly<Record<string, string>>,
): string => {
  return aliasMap[name] ?? name;
};

/**
 * Check whether a flag name is configured as a boolean flag.
 */
const isBooleanFlag = (
  name: string,
  booleans: ReadonlyArray<string>,
): boolean => {
  return booleans.includes(name);
};

/**
 * Check whether a flag name is configured as a string flag.
 */
const isStringFlag = (
  name: string,
  strings: ReadonlyArray<string>,
): boolean => {
  return strings.includes(name);
};

/**
 * Check whether a flag name is configured as an array flag.
 */
const isArrayFlag = (
  name: string,
  arrays: ReadonlyArray<string>,
): boolean => {
  return arrays.includes(name);
};

/**
 * Coerce a string value to the appropriate JS type.
 * Boolean-like strings ("true"/"false") become booleans,
 * numeric strings become numbers, unless the flag is typed as string.
 */
const coerceValue = (
  value: string,
  name: string,
  strings: ReadonlyArray<string>,
): string | number | boolean => {
  if (isStringFlag(name, strings)) {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return value;
};

/**
 * Set a value on a mutable result object, supporting dot-notation keys
 * and array accumulation. Uses iterative descent instead of recursion.
 */
const setValue = (
  result: Record<string, unknown>,
  key: string,
  value: unknown,
  arrays: ReadonlyArray<string>,
): void => {
  const parts = key.split(".");
  if (parts.length > MAX_DOT_DEPTH) {
    /* istanbul ignore next -- defensive guard */
    return;
  }

  const isArray = isArrayFlag(key, arrays);

  /* Walk to the parent container, creating intermediate objects. */
  const lastIndex = parts.length - 1;
  /* eslint-disable-next-line no-restricted-syntax -- mutable ref needed */
  type Container = Record<string, unknown>;
  const stack: Array<{ obj: Container; key: string }> = [];
  const current: { ref: Container } = { ref: result };

  for (const part of parts.slice(0, lastIndex)) {
    const existing = current.ref[part];
    if (existing === undefined || existing === null || typeof existing !== "object" || Array.isArray(existing)) {
      current.ref[part] = {};
    }
    stack.push({ obj: current.ref, key: part });
    current.ref = current.ref[part] as Container;
  }

  const finalKey = parts[lastIndex];

  if (isArray) {
    const existing = current.ref[finalKey];
    if (Array.isArray(existing)) {
      (existing as Array<unknown>).push(value);
    } else {
      current.ref[finalKey] = [value];
    }
  } else {
    current.ref[finalKey] = value;
  }
};

/**
 * Parse an array of CLI arguments into a structured result object.
 *
 * Supports:
 * - Long flags: `--flag`, `--flag=value`, `--flag value`
 * - Short flags: `-f`, `-f value`, `-fvalue`
 * - Boolean negation: `--no-flag` sets `flag` to `false`
 * - Dot notation: `--foo.bar=baz` produces `{ foo: { bar: 'baz' } }`
 * - Array accumulation: repeated `--flag v1 --flag v2` produces `{ flag: ['v1', 'v2'] }`
 * - Comma-separated arrays: `--flag a,b` produces `{ flag: ['a', 'b'] }` for array-typed flags
 * - Positional arguments collected in `_`
 * - `--` stops flag parsing; remaining tokens become positional
 *
 * @param args - The raw argument tokens (e.g., `process.argv.slice(2)`)
 * @param options - Optional parser configuration
 * @returns A frozen ParsedArgs object
 */
export const parseArgs = (
  args: ReadonlyArray<string>,
  options?: ParserOptions,
): ParsedArgs => {
  const booleans: ReadonlyArray<string> = options?.boolean ?? [];
  const strings: ReadonlyArray<string> = options?.string ?? [];
  const arrays: ReadonlyArray<string> = options?.array ?? [];
  const aliasMap = buildAliasMap(options?.alias ?? {});
  const defaults: Readonly<Record<string, unknown>> = options?.default ?? {};

  const positional: Array<string> = [];
  const result: Record<string, unknown> = {};

  const argCount = Math.min(args.length, MAX_ARGS);
  const mutableArgs = args.slice(0, argCount);

  /** Track current index with a wrapper for mutation inside the loop. */
  const cursor = { i: 0 };

  /** Whether we have seen `--` and should stop parsing flags. */
  const state = { dashdash: false };

  for (cursor.i = 0; cursor.i < mutableArgs.length; cursor.i += 1) {
    const arg = mutableArgs[cursor.i];

    /* After `--`, everything is positional. */
    if (state.dashdash) {
      positional.push(arg);
      continue;
    }

    /* Bare `--` separator. */
    if (arg === "--") {
      state.dashdash = true;
      continue;
    }

    /* Long flag: --flag, --flag=value, --no-flag */
    if (arg.startsWith("--")) {
      const raw = arg.slice(2);

      /* Check for = sign */
      const eqIndex = raw.indexOf("=");

      if (eqIndex !== -1) {
        /* --flag=value */
        const name = resolveAlias(raw.slice(0, eqIndex), aliasMap);
        const rawValue = raw.slice(eqIndex + 1);

        if (isArrayFlag(name, arrays) && rawValue.includes(",")) {
          const parts = rawValue.split(",");
          for (const part of parts) {
            setValue(result, name, coerceValue(part, name, strings), arrays);
          }
        } else {
          setValue(result, name, coerceValue(rawValue, name, strings), arrays);
        }
        continue;
      }

      /* --no-flag negation */
      if (raw.startsWith("no-")) {
        const negated = raw.slice(3);
        const name = resolveAlias(negated, aliasMap);
        if (isBooleanFlag(name, booleans)) {
          setValue(result, name, false, arrays);
          continue;
        }
        /* If not a known boolean, treat as a normal flag named "no-<x>" */
      }

      const name = resolveAlias(raw, aliasMap);

      /* Boolean flag: no value consumed */
      if (isBooleanFlag(name, booleans)) {
        setValue(result, name, true, arrays);
        continue;
      }

      /* String/array flag: consume next token as value if available */
      if (isStringFlag(name, strings) || isArrayFlag(name, arrays)) {
        const next = mutableArgs[cursor.i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          cursor.i += 1;
          if (isArrayFlag(name, arrays) && next.includes(",")) {
            const parts = next.split(",");
            for (const part of parts) {
              setValue(result, name, coerceValue(part, name, strings), arrays);
            }
          } else {
            setValue(result, name, coerceValue(next, name, strings), arrays);
          }
        } else {
          setValue(result, name, isStringFlag(name, strings) ? "" : true, arrays);
        }
        continue;
      }

      /* Unknown flag: peek at next token to determine if it's a value */
      const next = mutableArgs[cursor.i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        cursor.i += 1;
        setValue(result, name, coerceValue(next, name, strings), arrays);
      } else {
        setValue(result, name, true, arrays);
      }
      continue;
    }

    /* Short flag(s): -f, -f value, -fvalue, -abc */
    if (arg.startsWith("-") && arg.length > 1 && arg[1] !== "-") {
      const chars = arg.slice(1);

      /* Single char: -f or -f value or -fvalue */
      if (chars.length === 1) {
        const name = resolveAlias(chars, aliasMap);

        if (isBooleanFlag(name, booleans)) {
          setValue(result, name, true, arrays);
          continue;
        }

        const next = mutableArgs[cursor.i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          cursor.i += 1;
          if (isArrayFlag(name, arrays) && next.includes(",")) {
            const parts = next.split(",");
            for (const part of parts) {
              setValue(result, name, coerceValue(part, name, strings), arrays);
            }
          } else {
            setValue(result, name, coerceValue(next, name, strings), arrays);
          }
        } else {
          setValue(result, name, true, arrays);
        }
        continue;
      }

      /* Multiple chars: could be -fvalue or -abc (combined booleans) */
      const firstChar = chars[0];
      const firstName = resolveAlias(firstChar, aliasMap);

      /* If first char is a known non-boolean, rest is the value */
      if (isStringFlag(firstName, strings) || isArrayFlag(firstName, arrays)) {
        const val = chars.slice(1);
        if (isArrayFlag(firstName, arrays) && val.includes(",")) {
          const parts = val.split(",");
          for (const part of parts) {
            setValue(result, firstName, coerceValue(part, firstName, strings), arrays);
          }
        } else {
          setValue(result, firstName, coerceValue(val, firstName, strings), arrays);
        }
        continue;
      }

      /* If first char is boolean, treat rest as separate flags */
      if (isBooleanFlag(firstName, booleans)) {
        setValue(result, firstName, true, arrays);
        for (const ch of chars.slice(1)) {
          const chName = resolveAlias(ch, aliasMap);
          setValue(result, chName, true, arrays);
        }
        continue;
      }

      /* Unknown first char: treat the rest as the value */
      const restValue = chars.slice(1);
      setValue(result, firstName, coerceValue(restValue, firstName, strings), arrays);
      continue;
    }

    /* Positional argument */
    positional.push(arg);
  }

  /* Apply defaults for keys not already set */
  const defaultKeys = Object.keys(defaults);
  for (const key of defaultKeys) {
    if (result[key] === undefined) {
      const defaultVal = defaults[key];
      if (isArrayFlag(key, arrays) && !Array.isArray(defaultVal)) {
        result[key] = [defaultVal];
      } else {
        result[key] = defaultVal;
      }
    }
  }

  /* Also set aliases of defaults */
  const aliasConfigKeys = Object.keys(options?.alias ?? {});
  for (const canonical of aliasConfigKeys) {
    const aliases = (options?.alias ?? {})[canonical];
    const allNames = typeof aliases === "string" ? [aliases] : (aliases ?? []);
    for (const alias of allNames) {
      if (result[canonical] !== undefined && result[alias] === undefined) {
        result[alias] = result[canonical];
      }
    }
  }

  /* Build the final frozen result */
  const parsed: ParsedArgs = {
    _: Object.freeze([...positional]),
    ...result,
  };

  return Object.freeze(parsed);
};
