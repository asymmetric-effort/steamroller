/**
 * @module tests/compat/plugin-compat
 * @description Framework to verify steamroller's plugin API matches rollup's
 * plugin hook signatures and calling conventions.
 */

/** Known rollup plugin hook names and their expected shapes. */
const ROLLUP_HOOK_SIGNATURES: Readonly<Record<string, ReadonlyArray<string>>> =
  {
    buildStart: ["options"],
    buildEnd: ["error?"],
    resolveId: ["source", "importer", "options"],
    load: ["id"],
    transform: ["code", "id"],
    moduleParsed: ["info"],
    renderChunk: ["code", "chunk", "options", "meta"],
    generateBundle: ["options", "bundle", "isWrite"],
    writeBundle: ["options", "bundle"],
    closeBundle: [],
    renderStart: ["outputOptions", "inputOptions"],
    renderError: ["error?"],
    augmentChunkHash: ["chunk"],
    resolveFileUrl: ["options"],
    resolveImportMeta: ["property", "options"],
    banner: ["chunk"],
    footer: ["chunk"],
    intro: ["chunk"],
    outro: ["chunk"],
    options: ["options"],
    resolveDynamicImport: ["specifier", "importer", "options"],
    shouldTransformCachedModule: ["options"],
    watchChange: ["id", "change"],
  };

/** Result of verifying a plugin's compatibility. */
export interface PluginCompatResult {
  readonly compatible: boolean;
  readonly issues: ReadonlyArray<string>;
  readonly hooksCovered: ReadonlyArray<string>;
  readonly hooksUnsupported: ReadonlyArray<string>;
}

/** Minimal plugin shape for compatibility verification. */
export interface PluginShape {
  readonly name: string;
  readonly [key: string]: unknown;
}

/**
 * Verifies that a plugin's hook signatures are compatible with rollup's API.
 * Checks that hooks are either functions or objects with a handler property.
 */
export const verifyPluginHookSignatures = (
  plugin: PluginShape,
): PluginCompatResult => {
  const issues: Array<string> = [];
  const hooksCovered: Array<string> = [];
  const hooksUnsupported: Array<string> = [];

  if (!plugin.name || typeof plugin.name !== "string") {
    issues.push("Plugin must have a 'name' property of type string");
  }

  const hookNames = Object.keys(ROLLUP_HOOK_SIGNATURES);

  for (let i = 0; i < hookNames.length; i++) {
    const hookName = hookNames[i];
    const hookValue = plugin[hookName];

    if (hookValue === undefined || hookValue === null) {
      continue;
    }

    const hookType = typeof hookValue;

    if (hookType === "function") {
      hooksCovered.push(hookName);
      const expectedParams = ROLLUP_HOOK_SIGNATURES[hookName];
      const fn = hookValue as (...args: ReadonlyArray<unknown>) => unknown;

      if (fn.length > expectedParams.length) {
        issues.push(
          `Hook '${hookName}' accepts ${fn.length} params, expected at most ${expectedParams.length}`,
        );
      }
    } else if (
      hookType === "object" &&
      hookValue !== null &&
      typeof (hookValue as Record<string, unknown>).handler === "function"
    ) {
      hooksCovered.push(hookName);
      const obj = hookValue as Record<string, unknown>;

      if (
        obj.order !== undefined &&
        obj.order !== "pre" &&
        obj.order !== "post" &&
        obj.order !== null
      ) {
        issues.push(
          `Hook '${hookName}' has invalid order value: ${String(obj.order)}`,
        );
      }
    } else {
      hooksUnsupported.push(hookName);
      issues.push(
        `Hook '${hookName}' must be a function or { handler, order? } object, got ${hookType}`,
      );
    }
  }

  return {
    compatible: issues.length === 0,
    issues,
    hooksCovered,
    hooksUnsupported,
  };
};

/**
 * Returns the list of all known rollup hook names.
 */
export const getKnownHooks = (): ReadonlyArray<string> => {
  return Object.keys(ROLLUP_HOOK_SIGNATURES);
};

/**
 * Checks whether a plugin uses only supported hook patterns.
 */
export const validatePluginStructure = (
  plugin: PluginShape,
): {
  readonly valid: boolean;
  readonly unknownHooks: ReadonlyArray<string>;
} => {
  const knownHooks = new Set(Object.keys(ROLLUP_HOOK_SIGNATURES));
  knownHooks.add("name");
  const unknownHooks: Array<string> = [];
  const pluginKeys = Object.keys(plugin);

  for (let i = 0; i < pluginKeys.length; i++) {
    const key = pluginKeys[i];
    if (!knownHooks.has(key)) {
      unknownHooks.push(key);
    }
  }

  return {
    valid: unknownHooks.length === 0,
    unknownHooks,
  };
};
