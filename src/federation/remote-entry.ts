/**
 * @module federation/remote-entry
 * @description Remote entry generator for module federation.
 * Generates remoteEntry.js code that registers exposed modules,
 * supports async module loading via dynamic import, and handles
 * shared scope registration.
 */

import type {
  ResolvedFederationOptions,
  ResolvedSharedConfig,
} from "./types.js";
import { generateSharedScopeCode } from "./shared-scope.js";

/**
 * Generate the container initialization code.
 * Sets up the __federation_container__ global with get/init methods.
 *
 * @param name - The container name.
 * @returns Generated JavaScript code.
 */
export const generateContainerInit = (name: string): string => {
  return [
    `var __federation_container_name__ = ${JSON.stringify(name)};`,
    "",
    "var __federation_modules__ = {};",
    "var __federation_shared_init__ = false;",
    "",
  ].join("\n");
};

/**
 * Generate the module map code for exposed modules.
 * Each exposed module is registered as a lazy-loadable factory.
 *
 * @param exposes - Map of exposed module names to their file paths.
 * @returns Generated JavaScript code.
 */
export const generateModuleMap = (
  exposes: Readonly<Record<string, string>>,
): string => {
  const entries = Object.entries(exposes);
  if (entries.length === 0) {
    return "var __federation_module_map__ = {};\n";
  }

  const moduleEntries = entries
    .map(([key, path]) => {
      return `  ${JSON.stringify(key)}: () => import(${JSON.stringify(path)})`;
    })
    .join(",\n");

  return ["var __federation_module_map__ = {", moduleEntries, "};", ""].join(
    "\n",
  );
};

/**
 * Generate the container API code (get and init functions).
 * - get(moduleName): returns a factory for the requested module
 * - init(sharedScope): initializes shared dependencies
 *
 * @returns Generated JavaScript code.
 */
export const generateContainerAPI = (): string => {
  return [
    "var __federation_container__ = {",
    "  get: function(module) {",
    "    if (!__federation_module_map__[module]) {",
    '      throw new Error("Module " + module + " does not exist in container");',
    "    }",
    "    return __federation_module_map__[module];",
    "  },",
    "  init: function(sharedScope) {",
    "    if (__federation_shared_init__) return;",
    "    __federation_shared_init__ = true;",
    "    Object.keys(sharedScope).forEach(function(key) {",
    "      if (!__federation_shared_scope__[key]) {",
    "        __federation_shared_scope__[key] = sharedScope[key];",
    "      }",
    "    });",
    "  }",
    "};",
    "",
  ].join("\n");
};

/**
 * Generate the global registration code that makes the container accessible.
 *
 * @param name - The container name.
 * @param format - The output format ("var" or "module").
 * @returns Generated JavaScript code.
 */
export const generateGlobalRegistration = (
  name: string,
  format: "var" | "module" = "var",
): string => {
  if (format === "module") {
    return ["export { __federation_container__ as default };", ""].join("\n");
  }
  return [
    `globalThis[${JSON.stringify(name)}] = __federation_container__;`,
    "",
  ].join("\n");
};

/**
 * Generate the complete remoteEntry.js code for a federated container.
 *
 * @param options - Resolved federation options.
 * @returns The full remoteEntry.js source code.
 */
export const generateRemoteEntry = (
  options: ResolvedFederationOptions,
): string => {
  const parts: string[] = [
    "// Federation Remote Entry",
    `// Container: ${options.name}`,
    "",
    generateContainerInit(options.name),
    generateSharedScopeCode(options.shared),
    generateModuleMap(options.exposes),
    generateContainerAPI(),
    generateGlobalRegistration(options.name),
  ];

  return parts.join("\n");
};

/**
 * Generate code for loading a remote module at runtime.
 *
 * @param remoteName - The name of the remote container.
 * @param remoteUrl - URL to the remote entry file.
 * @param exposedModule - The module name to load from the remote.
 * @returns Generated JavaScript code for dynamic remote loading.
 */
export const generateRemoteModuleLoad = (
  remoteName: string,
  remoteUrl: string,
  exposedModule: string,
): string => {
  return [
    `(async function() {`,
    `  if (!globalThis[${JSON.stringify(remoteName)}]) {`,
    `    await new Promise(function(resolve, reject) {`,
    `      var script = document.createElement("script");`,
    `      script.src = ${JSON.stringify(remoteUrl)};`,
    `      script.onload = resolve;`,
    `      script.onerror = reject;`,
    `      document.head.appendChild(script);`,
    `    });`,
    `  }`,
    `  var container = globalThis[${JSON.stringify(remoteName)}];`,
    `  container.init(__federation_shared_scope__);`,
    `  var factory = container.get(${JSON.stringify(exposedModule)});`,
    `  return factory();`,
    `})()`,
  ].join("\n");
};

/**
 * Generate initialization code for shared scope entries
 * that are provided by shared dependencies config.
 *
 * @param shared - Map of shared dependency configurations.
 * @returns Generated JavaScript code for registering provided shared modules.
 */
export const generateSharedInit = (
  shared: Readonly<Record<string, ResolvedSharedConfig>>,
): string => {
  const entries = Object.entries(shared);
  if (entries.length === 0) {
    return "";
  }

  const registrations = entries
    .map(([key, config]) => {
      return [
        `  __federation_shared_scope__[${JSON.stringify(key)}] = {`,
        `    version: ${JSON.stringify(config.requiredVersion)},`,
        `    get: function() { return import(${JSON.stringify(key)}); },`,
        `    loaded: ${config.eager},`,
        `    eager: ${config.eager}`,
        "  };",
      ].join("\n");
    })
    .join("\n");

  return [
    "// Initialize shared scope entries",
    "(function() {",
    registrations,
    "})();",
    "",
  ].join("\n");
};
