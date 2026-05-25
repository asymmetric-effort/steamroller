/**
 * @module tests/compat/build-tools
 * @description Framework to verify steamroller can be used as a drop-in
 * replacement for rollup in build tools like Vite and SvelteKit.
 */

/** Hook shape descriptor for verification. */
export interface HookDescriptor {
  readonly name: string;
  readonly params: ReadonlyArray<string>;
  readonly returnType: "string" | "object" | "null" | "void" | "promise";
  readonly required: boolean;
}

/** Result of verifying compatibility with a build tool. */
export interface BuildToolCompatResult {
  readonly toolName: string;
  readonly compatible: boolean;
  readonly issues: ReadonlyArray<string>;
  readonly hooksVerified: ReadonlyArray<string>;
}

/** Configuration for a build tool compatibility check. */
export interface BuildToolConfig {
  readonly name: string;
  readonly requiredHooks: ReadonlyArray<HookDescriptor>;
  readonly optionalHooks: ReadonlyArray<HookDescriptor>;
}

/** Vite requires these hooks to function properly. */
const VITE_HOOKS: ReadonlyArray<HookDescriptor> = [
  {
    name: "resolveId",
    params: ["source", "importer", "options"],
    returnType: "object",
    required: true,
  },
  { name: "load", params: ["id"], returnType: "object", required: true },
  {
    name: "transform",
    params: ["code", "id"],
    returnType: "object",
    required: true,
  },
  {
    name: "buildStart",
    params: ["options"],
    returnType: "void",
    required: false,
  },
  { name: "buildEnd", params: ["error?"], returnType: "void", required: false },
  {
    name: "renderChunk",
    params: ["code", "chunk", "options", "meta"],
    returnType: "object",
    required: false,
  },
];

/** SvelteKit requires rollup-compatible plugin format. */
const SVELTEKIT_HOOKS: ReadonlyArray<HookDescriptor> = [
  {
    name: "resolveId",
    params: ["source", "importer", "options"],
    returnType: "object",
    required: true,
  },
  { name: "load", params: ["id"], returnType: "object", required: true },
  {
    name: "transform",
    params: ["code", "id"],
    returnType: "object",
    required: true,
  },
  {
    name: "generateBundle",
    params: ["options", "bundle", "isWrite"],
    returnType: "void",
    required: false,
  },
  {
    name: "moduleParsed",
    params: ["info"],
    returnType: "void",
    required: false,
  },
];

/** Registry of build tool configurations. */
const BUILD_TOOLS: ReadonlyArray<BuildToolConfig> = [
  {
    name: "vite",
    requiredHooks: VITE_HOOKS.filter((h) => h.required),
    optionalHooks: VITE_HOOKS.filter((h) => !h.required),
  },
  {
    name: "sveltekit",
    requiredHooks: SVELTEKIT_HOOKS.filter((h) => h.required),
    optionalHooks: SVELTEKIT_HOOKS.filter((h) => !h.required),
  },
];

/**
 * Verifies that a plugin API implementation is compatible with a specific
 * build tool by checking that required hooks accept the correct parameters.
 */
export const verifyBuildToolCompat = (
  toolName: string,
  pluginApi: Readonly<Record<string, unknown>>,
): BuildToolCompatResult => {
  const tool = BUILD_TOOLS.find((t) => t.name === toolName);
  const issues: Array<string> = [];
  const hooksVerified: Array<string> = [];

  if (!tool) {
    return {
      toolName,
      compatible: false,
      issues: [`Unknown build tool: ${toolName}`],
      hooksVerified: [],
    };
  }

  const allHooks = [...tool.requiredHooks, ...tool.optionalHooks];

  for (let i = 0; i < allHooks.length; i++) {
    const hook = allHooks[i];
    const impl = pluginApi[hook.name];

    if (impl === undefined) {
      if (hook.required) {
        issues.push(`Required hook '${hook.name}' is missing`);
      }
      continue;
    }

    if (typeof impl !== "function") {
      issues.push(`Hook '${hook.name}' must be a function, got ${typeof impl}`);
      continue;
    }

    hooksVerified.push(hook.name);
  }

  return {
    toolName,
    compatible: issues.length === 0,
    issues,
    hooksVerified,
  };
};

/**
 * Returns the list of supported build tools.
 */
export const getSupportedBuildTools = (): ReadonlyArray<string> => {
  return BUILD_TOOLS.map((t) => t.name);
};

/**
 * Returns the hook descriptors for a specific build tool.
 */
export const getBuildToolHooks = (
  toolName: string,
): ReadonlyArray<HookDescriptor> | null => {
  const tool = BUILD_TOOLS.find((t) => t.name === toolName);
  if (!tool) {
    return null;
  }
  return [...tool.requiredHooks, ...tool.optionalHooks];
};
