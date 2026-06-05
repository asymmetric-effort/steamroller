/**
 * @module importmap/types
 * @description Type definitions for import map generation and CDN resolution.
 */

/** CDN providers supported for bare specifier resolution. */
export type CdnProvider = "esm.sh" | "unpkg" | "jsdelivr" | "skypack";

/**
 * Standard import map JSON structure.
 * @see https://html.spec.whatwg.org/multipage/webappapis.html#import-maps
 */
export interface ImportMapJson {
  readonly imports: Readonly<Record<string, string>>;
  readonly scopes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** Options controlling import map generation. */
export interface ImportMapOptions {
  /** CDN provider to use for resolving bare specifiers. Default: "esm.sh". */
  readonly cdn?: CdnProvider;

  /**
   * External packages to include in the import map.
   * Keys are bare specifiers, values are package version strings.
   * If a value is an empty string, the version is omitted from the CDN URL.
   */
  readonly externals?: Readonly<Record<string, string>>;

  /** Base URL prefix for local (non-CDN) chunk references. Default: "./". */
  readonly baseUrl?: string;
}
