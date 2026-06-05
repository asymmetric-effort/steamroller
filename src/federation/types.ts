/**
 * @module federation/types
 * @description Configuration types for module federation support.
 */

/** Configuration for a remote federated application. */
export interface RemoteConfig {
  /** URL to the remote entry file (e.g. "http://localhost:3001/remoteEntry.js"). */
  readonly url: string;
  /** Format of the remote container: "var" uses a global, "module" uses ESM. */
  readonly format?: "var" | "module";
}

/** Version requirement specification for shared dependencies. */
export interface SharedConfig {
  /** The package name (e.g. "react"). */
  readonly packageName?: string;
  /** Required semver version or range (e.g. "^18.0.0"). */
  readonly requiredVersion?: string;
  /** Whether this dependency is a singleton (only one version loaded). */
  readonly singleton?: boolean;
  /** Whether to allow version mismatch warnings instead of errors. */
  readonly strictVersion?: boolean;
  /** Whether the host should provide this dependency first. */
  readonly eager?: boolean;
}

/** Configuration for an exposed module. */
export interface ExposedModule {
  /** Local path to the module to expose. */
  readonly path: string;
  /** Optional custom name for the exposed module. */
  readonly name?: string;
}

/** Top-level federation plugin options. */
export interface FederationOptions {
  /** Unique name for this federated container. */
  readonly name: string;

  /**
   * Modules exposed by this container.
   * Keys are public names (e.g. "./Button"), values are local paths.
   */
  readonly exposes?: Readonly<Record<string, string | ExposedModule>>;

  /**
   * Remote containers to consume.
   * Keys are scope names (e.g. "app2"), values are remote configs or URLs.
   */
  readonly remotes?: Readonly<Record<string, string | RemoteConfig>>;

  /**
   * Dependencies shared between federated containers.
   * Keys are package names, values are version config or version strings.
   */
  readonly shared?: Readonly<Record<string, string | SharedConfig>>;

  /** File name for the generated remote entry. Default: "remoteEntry.js". */
  readonly filename?: string;
}

/** Resolved/normalized remote config (always an object). */
export interface ResolvedRemoteConfig {
  readonly url: string;
  readonly format: "var" | "module";
}

/** Resolved/normalized shared config (always an object). */
export interface ResolvedSharedConfig {
  readonly packageName: string;
  readonly requiredVersion: string;
  readonly singleton: boolean;
  readonly strictVersion: boolean;
  readonly eager: boolean;
}

/** Resolved/normalized federation options. */
export interface ResolvedFederationOptions {
  readonly name: string;
  readonly exposes: Readonly<Record<string, string>>;
  readonly remotes: Readonly<Record<string, ResolvedRemoteConfig>>;
  readonly shared: Readonly<Record<string, ResolvedSharedConfig>>;
  readonly filename: string;
}
