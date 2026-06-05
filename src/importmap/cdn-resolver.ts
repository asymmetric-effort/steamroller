/**
 * @module importmap/cdn-resolver
 * @description Resolves npm package specifiers to CDN URLs.
 * Supports esm.sh, unpkg, jsdelivr, and skypack providers
 * with version pinning and subpath resolution.
 */

import type { CdnProvider } from "./types.js";

/** Base URL templates for each CDN provider. */
const CDN_BASE_URLS: Readonly<Record<CdnProvider, string>> = {
  "esm.sh": "https://esm.sh/",
  unpkg: "https://unpkg.com/",
  jsdelivr: "https://cdn.jsdelivr.net/npm/",
  skypack: "https://cdn.skypack.dev/",
};

/**
 * Parse a bare specifier into its package name and optional subpath.
 * Handles scoped packages (e.g. @scope/pkg/sub) and plain packages (e.g. lodash/merge).
 *
 * @param specifier - The bare import specifier
 * @returns An object with packageName and subpath (empty string if none)
 */
export const parseSpecifier = (
  specifier: string,
): { readonly packageName: string; readonly subpath: string } => {
  const trimmed = specifier.trim();
  if (trimmed.length === 0) {
    return { packageName: "", subpath: "" };
  }

  if (trimmed.startsWith("@")) {
    // Scoped package: @scope/name or @scope/name/subpath
    const slashIdx = trimmed.indexOf("/");
    if (slashIdx === -1) {
      return { packageName: trimmed, subpath: "" };
    }
    const secondSlash = trimmed.indexOf("/", slashIdx + 1);
    if (secondSlash === -1) {
      return { packageName: trimmed, subpath: "" };
    }
    return {
      packageName: trimmed.slice(0, secondSlash),
      subpath: trimmed.slice(secondSlash + 1),
    };
  }

  // Plain package: name or name/subpath
  const slashIdx = trimmed.indexOf("/");
  if (slashIdx === -1) {
    return { packageName: trimmed, subpath: "" };
  }
  return {
    packageName: trimmed.slice(0, slashIdx),
    subpath: trimmed.slice(slashIdx + 1),
  };
};

/**
 * Resolve a bare npm specifier to a full CDN URL.
 *
 * @param specifier - The bare import specifier (e.g. "lodash/merge", "@vue/reactivity")
 * @param version - The pinned version string (e.g. "4.17.21"). Empty string for no pinning.
 * @param cdn - The CDN provider to use. Default: "esm.sh"
 * @returns The fully resolved CDN URL
 */
export const resolveToCdn = (
  specifier: string,
  version: string,
  cdn: CdnProvider = "esm.sh",
): string => {
  const baseUrl = CDN_BASE_URLS[cdn];
  const { packageName, subpath } = parseSpecifier(specifier);

  if (packageName.length === 0) {
    return baseUrl;
  }

  const versionSuffix = version.length > 0 ? `@${version}` : "";
  const subpathSuffix = subpath.length > 0 ? `/${subpath}` : "";

  return `${baseUrl}${packageName}${versionSuffix}${subpathSuffix}`;
};

/**
 * Get the base URL for a given CDN provider.
 *
 * @param cdn - The CDN provider
 * @returns The base URL string
 */
export const getCdnBaseUrl = (cdn: CdnProvider): string => {
  return CDN_BASE_URLS[cdn];
};
