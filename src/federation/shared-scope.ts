/**
 * @module federation/shared-scope
 * @description Shared dependency management for module federation.
 * Handles version comparison, scope negotiation, and fallback logic
 * for deduplicating common libraries across federated applications.
 */

import type { ResolvedSharedConfig } from "./types.js";

/** A registered shared module in the shared scope. */
export interface SharedScopeEntry {
  /** The version of this shared module (semver string). */
  readonly version: string;
  /** Factory function that returns the module. */
  readonly get: () => Promise<unknown>;
  /** Whether this entry has been loaded. */
  loaded: boolean;
  /** Whether this is an eager dependency. */
  readonly eager: boolean;
}

/** A scope containing shared module registrations keyed by package name. */
export interface SharedScope {
  readonly [packageName: string]: SharedScopeEntry[];
}

/**
 * Parse a semver version string into its components.
 *
 * @param version - A semver version string (e.g. "1.2.3", "1.2.3-beta.1").
 * @returns An object with major, minor, patch, and prerelease, or null if invalid.
 */
export const parseSemver = (
  version: string,
): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
} | null => {
  const cleaned = version.replace(/^[=v]/, "");
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(cleaned);
  if (!match) {
    return null;
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] ?? "",
  };
};

/**
 * Compare two semver version strings.
 *
 * @param a - First version.
 * @param b - Second version.
 * @returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export const compareSemver = (a: string, b: string): -1 | 0 | 1 => {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    return 0;
  }
  if (pa.major !== pb.major) {
    return pa.major < pb.major ? -1 : 1;
  }
  if (pa.minor !== pb.minor) {
    return pa.minor < pb.minor ? -1 : 1;
  }
  if (pa.patch !== pb.patch) {
    return pa.patch < pb.patch ? -1 : 1;
  }
  // No prerelease is "greater" than any prerelease
  if (pa.prerelease === "" && pb.prerelease !== "") {
    return 1;
  }
  if (pa.prerelease !== "" && pb.prerelease === "") {
    return -1;
  }
  if (pa.prerelease < pb.prerelease) {
    return -1;
  }
  if (pa.prerelease > pb.prerelease) {
    return 1;
  }
  return 0;
};

/**
 * Check whether a version satisfies a semver range.
 * Supports ^, ~, >=, exact match, and * ranges.
 *
 * @param version - The concrete version to test.
 * @param range - The version range (e.g. "^1.2.0", "~1.2.0", ">=1.0.0", "1.2.3", "*").
 * @returns True if the version satisfies the range.
 */
export const satisfiesRange = (version: string, range: string): boolean => {
  if (range === "*" || range === "") {
    return true;
  }

  const parsed = parseSemver(version);
  if (!parsed) {
    return false;
  }

  // Caret range: ^major.minor.patch — compatible with same major
  if (range.startsWith("^")) {
    const rangeVersion = parseSemver(range.slice(1));
    if (!rangeVersion) {
      return false;
    }
    if (parsed.major !== rangeVersion.major) {
      return false;
    }
    // Must be >= the range version
    return compareSemver(version, range.slice(1)) >= 0;
  }

  // Tilde range: ~major.minor.patch — compatible with same major.minor
  if (range.startsWith("~")) {
    const rangeVersion = parseSemver(range.slice(1));
    if (!rangeVersion) {
      return false;
    }
    if (parsed.major !== rangeVersion.major) {
      return false;
    }
    if (parsed.minor !== rangeVersion.minor) {
      return false;
    }
    return compareSemver(version, range.slice(1)) >= 0;
  }

  // >= range
  if (range.startsWith(">=")) {
    return compareSemver(version, range.slice(2)) >= 0;
  }

  // Exact match
  return compareSemver(version, range) === 0;
};

/**
 * Find the best matching version from a list of shared scope entries.
 *
 * @param entries - Available versions in the shared scope.
 * @param requiredVersion - The version range to satisfy.
 * @param singleton - If true, return the highest version regardless.
 * @returns The best matching entry, or null.
 */
export const findBestMatch = (
  entries: readonly SharedScopeEntry[],
  requiredVersion: string,
  singleton: boolean,
): SharedScopeEntry | null => {
  if (entries.length === 0) {
    return null;
  }

  if (singleton) {
    // For singletons, pick the highest available version
    let best: SharedScopeEntry = entries[0];
    for (let i = 1; i < entries.length; i++) {
      if (compareSemver(entries[i].version, best.version) > 0) {
        best = entries[i];
      }
    }
    return best;
  }

  // Find the highest version that satisfies the range
  let best: SharedScopeEntry | null = null;
  for (const entry of entries) {
    if (satisfiesRange(entry.version, requiredVersion)) {
      if (best === null || compareSemver(entry.version, best.version) > 0) {
        best = entry;
      }
    }
  }
  return best;
};

/**
 * Register a shared module into the shared scope.
 *
 * @param scope - The shared scope to register into.
 * @param packageName - The package name.
 * @param entry - The entry to register.
 * @returns The updated scope (mutated in place for performance).
 */
export const registerShared = (
  scope: Record<string, SharedScopeEntry[]>,
  packageName: string,
  entry: SharedScopeEntry,
): Record<string, SharedScopeEntry[]> => {
  if (!scope[packageName]) {
    scope[packageName] = [];
  }
  scope[packageName].push(entry);
  return scope;
};

/**
 * Generate the runtime shared scope negotiation code.
 * This code is injected into the bundle to handle shared dependency resolution.
 *
 * @param shared - Map of shared dependency configurations.
 * @returns Generated JavaScript code as a string.
 */
export const generateSharedScopeCode = (
  shared: Readonly<Record<string, ResolvedSharedConfig>>,
): string => {
  const entries = Object.entries(shared);
  if (entries.length === 0) {
    return "var __federation_shared_scope__ = {};\n";
  }

  const registrations = entries
    .map(([key, config]) => {
      const opts = [
        `requiredVersion: ${JSON.stringify(config.requiredVersion)}`,
        `singleton: ${config.singleton}`,
        `strictVersion: ${config.strictVersion}`,
        `eager: ${config.eager}`,
      ].join(", ");
      return `  ${JSON.stringify(key)}: { ${opts} }`;
    })
    .join(",\n");

  return [
    "var __federation_shared_scope__ = {",
    registrations,
    "};",
    "",
    "function __federation_get_shared__(name, requiredVersion) {",
    "  var scope = __federation_shared_scope__;",
    "  if (scope[name] && scope[name].__loaded__) {",
    "    return scope[name].__loaded__;",
    "  }",
    "  return undefined;",
    "}",
    "",
  ].join("\n");
};

/**
 * Generate fallback code for a shared dependency.
 * Used when a shared version is not available in the scope.
 *
 * @param packageName - The package name.
 * @param localModulePath - Path to the local bundled fallback.
 * @returns Generated JavaScript code as a string.
 */
export const generateFallbackCode = (
  packageName: string,
  localModulePath: string,
): string => {
  return [
    `function __federation_fallback_${packageName.replace(/[^a-zA-Z0-9_]/g, "_")}__() {`,
    `  return import(${JSON.stringify(localModulePath)});`,
    "}",
    "",
  ].join("\n");
};
