/**
 * @module federation/federation-plugin
 * @description Module federation plugin for steamroller.
 * Enables exposing modules as remotely loadable, consuming remote modules
 * from other deployed applications, and sharing/deduplicating common
 * dependencies across federated apps with semantic version negotiation.
 */

import type { Plugin, TransformResult } from "../types.js";
import type {
  FederationOptions,
  ResolvedFederationOptions,
  ResolvedRemoteConfig,
  ResolvedSharedConfig,
  RemoteConfig,
  SharedConfig,
} from "./types.js";
import {
  generateRemoteEntry,
  generateRemoteModuleLoad,
} from "./remote-entry.js";
import {
  generateSharedScopeCode,
  generateFallbackCode,
} from "./shared-scope.js";

/** Prefix used to identify remote module imports. */
const REMOTE_PREFIX = "virtual:federation/";
/** Module ID for the remote entry virtual module. */
const REMOTE_ENTRY_ID = "virtual:federation-entry";

/**
 * Resolve a remote config value to a normalized object form.
 *
 * @param value - A URL string or RemoteConfig object.
 * @returns A fully resolved remote config.
 */
export const resolveRemoteConfig = (
  value: string | RemoteConfig,
): ResolvedRemoteConfig => {
  if (typeof value === "string") {
    return { url: value, format: "var" };
  }
  return {
    url: value.url,
    format: value.format ?? "var",
  };
};

/**
 * Resolve a shared config value to a normalized object form.
 *
 * @param key - The package name.
 * @param value - A version string or SharedConfig object.
 * @returns A fully resolved shared config.
 */
export const resolveSharedConfig = (
  key: string,
  value: string | SharedConfig,
): ResolvedSharedConfig => {
  if (typeof value === "string") {
    return {
      packageName: key,
      requiredVersion: value,
      singleton: false,
      strictVersion: false,
      eager: false,
    };
  }
  return {
    packageName: value.packageName ?? key,
    requiredVersion: value.requiredVersion ?? "*",
    singleton: value.singleton ?? false,
    strictVersion: value.strictVersion ?? false,
    eager: value.eager ?? false,
  };
};

/**
 * Resolve full federation options into their normalized form.
 *
 * @param options - Raw user-provided federation options.
 * @returns Fully resolved federation options.
 */
export const resolveFederationOptions = (
  options: FederationOptions,
): ResolvedFederationOptions => {
  const exposes: Record<string, string> = {};
  if (options.exposes) {
    for (const [key, value] of Object.entries(options.exposes)) {
      exposes[key] = typeof value === "string" ? value : value.path;
    }
  }

  const remotes: Record<string, ResolvedRemoteConfig> = {};
  if (options.remotes) {
    for (const [key, value] of Object.entries(options.remotes)) {
      remotes[key] = resolveRemoteConfig(value);
    }
  }

  const shared: Record<string, ResolvedSharedConfig> = {};
  if (options.shared) {
    for (const [key, value] of Object.entries(options.shared)) {
      shared[key] = resolveSharedConfig(key, value);
    }
  }

  return {
    name: options.name,
    exposes,
    remotes,
    shared,
    filename: options.filename ?? "remoteEntry.js",
  };
};

/**
 * Check if an import source refers to a remote module.
 *
 * @param source - The import specifier.
 * @param remotes - Map of remote container names.
 * @returns An object with remoteName and exposedModule if matched, or null.
 */
export const parseRemoteImport = (
  source: string,
  remotes: Readonly<Record<string, ResolvedRemoteConfig>>,
): { remoteName: string; exposedModule: string } | null => {
  for (const remoteName of Object.keys(remotes)) {
    if (source === remoteName || source.startsWith(remoteName + "/")) {
      const exposedModule =
        source === remoteName
          ? "."
          : "./" + source.slice(remoteName.length + 1);
      return { remoteName, exposedModule };
    }
  }
  return null;
};

/**
 * Check if an import source refers to a shared dependency.
 *
 * @param source - The import specifier.
 * @param shared - Map of shared dependency configurations.
 * @returns The package name if matched, or null.
 */
export const isSharedImport = (
  source: string,
  shared: Readonly<Record<string, ResolvedSharedConfig>>,
): string | null => {
  for (const packageName of Object.keys(shared)) {
    if (source === packageName || source.startsWith(packageName + "/")) {
      return packageName;
    }
  }
  return null;
};

/**
 * Create the module federation plugin.
 *
 * @param options - Federation configuration options.
 * @returns A Plugin that enables module federation.
 */
export const federationPlugin = (options: FederationOptions): Plugin => {
  const resolved = resolveFederationOptions(options);

  return {
    name: "steamroller:federation",

    resolveId(source: string) {
      // Handle the virtual remote entry module
      if (source === REMOTE_ENTRY_ID) {
        return { id: REMOTE_ENTRY_ID, external: false };
      }

      // Handle virtual federation module references
      if (source.startsWith(REMOTE_PREFIX)) {
        return { id: source, external: false };
      }

      // Check if the import refers to a remote module
      const remote = parseRemoteImport(source, resolved.remotes);
      if (remote) {
        const virtualId = `${REMOTE_PREFIX}${remote.remoteName}/${remote.exposedModule}`;
        return { id: virtualId, external: false };
      }

      return null;
    },

    load(id: string) {
      // Generate the remote entry module
      if (id === REMOTE_ENTRY_ID) {
        return {
          code: generateRemoteEntry(resolved),
        };
      }

      // Generate virtual modules for remote imports
      if (id.startsWith(REMOTE_PREFIX)) {
        const rest = id.slice(REMOTE_PREFIX.length);
        const slashIndex = rest.indexOf("/");
        const remoteName = slashIndex >= 0 ? rest.slice(0, slashIndex) : rest;
        const exposedModule =
          slashIndex >= 0 ? rest.slice(slashIndex + 1) : ".";
        const remote = resolved.remotes[remoteName];

        if (remote) {
          const code = generateRemoteModuleLoad(
            remoteName,
            remote.url,
            exposedModule,
          );
          return { code: `export default ${code};` };
        }
      }

      return null;
    },

    transform(code: string, id: string): TransformResult {
      // Skip virtual modules and node_modules
      if (id.startsWith(REMOTE_PREFIX) || id === REMOTE_ENTRY_ID) {
        return null;
      }
      if (id.includes("node_modules")) {
        return null;
      }

      let transformed = code;
      let hasChanges = false;

      // Rewrite remote imports to use virtual modules
      for (const remoteName of Object.keys(resolved.remotes)) {
        const importPattern = new RegExp(
          `(from\\s+["'])${escapeRegExp(remoteName)}(/[^"']*)?["']`,
          "g",
        );
        const replaced = transformed.replace(
          importPattern,
          (_match, prefix: string, subpath: string | undefined) => {
            const modulePath = subpath ? `.${subpath}` : ".";
            return `${prefix}${REMOTE_PREFIX}${remoteName}/${modulePath}"`;
          },
        );
        if (replaced !== transformed) {
          transformed = replaced;
          hasChanges = true;
        }

        const dynamicPattern = new RegExp(
          `import\\(\\s*["']${escapeRegExp(remoteName)}(/[^"']*)?["']\\s*\\)`,
          "g",
        );
        const dynamicReplaced = transformed.replace(
          dynamicPattern,
          (_match, subpath: string | undefined) => {
            const modulePath = subpath ? `.${subpath}` : ".";
            return `import("${REMOTE_PREFIX}${remoteName}/${modulePath}")`;
          },
        );
        if (dynamicReplaced !== transformed) {
          transformed = dynamicReplaced;
          hasChanges = true;
        }
      }

      // Rewrite shared dependency imports to use shared scope loader
      for (const packageName of Object.keys(resolved.shared)) {
        const sharedConfig = resolved.shared[packageName];
        const importPattern = new RegExp(
          `(from\\s+["'])${escapeRegExp(packageName)}["']`,
          "g",
        );
        if (importPattern.test(transformed)) {
          // We add a shared scope negotiation comment as a marker
          // The actual runtime code will handle version negotiation
          transformed = transformed.replace(
            importPattern,
            `$1${packageName}" /* federation:shared:${sharedConfig.requiredVersion} */`,
          );
          hasChanges = true;
        }
      }

      if (!hasChanges) {
        return null;
      }

      return { code: transformed };
    },

    generateBundle(_options, _bundle, _isWrite) {
      // Emit the remote entry file if we have exposed modules
      if (Object.keys(resolved.exposes).length > 0) {
        const remoteEntryCode = generateRemoteEntry(resolved);

        // Build shared scope code
        const sharedCode = generateSharedScopeCode(resolved.shared);

        // Build fallback code for shared deps
        const fallbackCodes = Object.entries(resolved.shared)
          .map(([key]) => generateFallbackCode(key, key))
          .join("\n");

        const fullCode = [
          remoteEntryCode,
          sharedCode ? `\n${sharedCode}` : "",
          fallbackCodes ? `\n${fallbackCodes}` : "",
        ]
          .filter(Boolean)
          .join("");

        // Use the PluginContext's emitFile if available
        // For now, we store it in the bundle directly by emitting the asset
        (
          this as unknown as {
            emitFile: (file: {
              type: string;
              fileName: string;
              source: string;
            }) => string;
          }
        ).emitFile({
          type: "asset",
          fileName: resolved.filename,
          source: fullCode,
        });
      }
    },
  };
};

/**
 * Escape a string for use in a regular expression.
 *
 * @param str - The string to escape.
 * @returns The escaped string.
 */
const escapeRegExp = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
