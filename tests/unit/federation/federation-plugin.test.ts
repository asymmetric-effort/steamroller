/**
 * @module tests/unit/federation/federation-plugin
 * @description Unit tests for the module federation plugin.
 */

import { describe, it, expect, vi } from "vitest";
import {
  federationPlugin,
  resolveRemoteConfig,
  resolveSharedConfig,
  resolveFederationOptions,
  parseRemoteImport,
  isSharedImport,
} from "../../../src/federation/federation-plugin.js";
import type { FederationOptions } from "../../../src/federation/types.js";

describe("resolveRemoteConfig", () => {
  it("resolves a string URL to default format", () => {
    const config = resolveRemoteConfig("http://localhost:3001/remoteEntry.js");
    expect(config.url).toBe("http://localhost:3001/remoteEntry.js");
    expect(config.format).toBe("var");
  });

  it("resolves an object with custom format", () => {
    const config = resolveRemoteConfig({
      url: "http://example.com/entry.js",
      format: "module",
    });
    expect(config.url).toBe("http://example.com/entry.js");
    expect(config.format).toBe("module");
  });
});

describe("resolveSharedConfig", () => {
  it("resolves a version string to full config", () => {
    const config = resolveSharedConfig("react", "^18.0.0");
    expect(config.packageName).toBe("react");
    expect(config.requiredVersion).toBe("^18.0.0");
    expect(config.singleton).toBe(false);
    expect(config.eager).toBe(false);
  });

  it("resolves an object config with defaults", () => {
    const config = resolveSharedConfig("react", { singleton: true });
    expect(config.packageName).toBe("react");
    expect(config.requiredVersion).toBe("*");
    expect(config.singleton).toBe(true);
    expect(config.strictVersion).toBe(false);
  });

  it("uses custom packageName when provided", () => {
    const config = resolveSharedConfig("react", {
      packageName: "react-custom",
      requiredVersion: "^17.0.0",
    });
    expect(config.packageName).toBe("react-custom");
  });
});

describe("resolveFederationOptions", () => {
  it("resolves minimal options", () => {
    const resolved = resolveFederationOptions({ name: "app1" });
    expect(resolved.name).toBe("app1");
    expect(resolved.exposes).toEqual({});
    expect(resolved.remotes).toEqual({});
    expect(resolved.shared).toEqual({});
    expect(resolved.filename).toBe("remoteEntry.js");
  });

  it("resolves exposes with string values", () => {
    const resolved = resolveFederationOptions({
      name: "app1",
      exposes: { "./Button": "./src/Button.js" },
    });
    expect(resolved.exposes["./Button"]).toBe("./src/Button.js");
  });

  it("resolves exposes with object values", () => {
    const resolved = resolveFederationOptions({
      name: "app1",
      exposes: { "./Button": { path: "./src/Button.js", name: "MyButton" } },
    });
    expect(resolved.exposes["./Button"]).toBe("./src/Button.js");
  });

  it("resolves custom filename", () => {
    const resolved = resolveFederationOptions({
      name: "app1",
      filename: "custom-entry.js",
    });
    expect(resolved.filename).toBe("custom-entry.js");
  });
});

describe("parseRemoteImport", () => {
  const remotes = {
    app2: {
      url: "http://localhost:3002/remoteEntry.js",
      format: "var" as const,
    },
    app3: {
      url: "http://localhost:3003/remoteEntry.js",
      format: "var" as const,
    },
  };

  it("parses a bare remote import", () => {
    const result = parseRemoteImport("app2", remotes);
    expect(result).toEqual({ remoteName: "app2", exposedModule: "." });
  });

  it("parses a remote import with subpath", () => {
    const result = parseRemoteImport("app2/Button", remotes);
    expect(result).toEqual({ remoteName: "app2", exposedModule: "./Button" });
  });

  it("returns null for non-remote imports", () => {
    const result = parseRemoteImport("react", remotes);
    expect(result).toBeNull();
  });

  it("does not match partial remote names", () => {
    const result = parseRemoteImport("app2extra", remotes);
    expect(result).toBeNull();
  });
});

describe("isSharedImport", () => {
  const shared = {
    react: {
      packageName: "react",
      requiredVersion: "^18.0.0",
      singleton: true,
      strictVersion: false,
      eager: false,
    },
  };

  it("matches exact package name", () => {
    expect(isSharedImport("react", shared)).toBe("react");
  });

  it("matches subpath import", () => {
    expect(isSharedImport("react/jsx-runtime", shared)).toBe("react");
  });

  it("returns null for non-shared imports", () => {
    expect(isSharedImport("lodash", shared)).toBeNull();
  });
});

describe("federationPlugin", () => {
  const baseOptions: FederationOptions = {
    name: "hostApp",
    exposes: {
      "./Button": "./src/components/Button.js",
      "./utils": "./src/utils/index.js",
    },
    remotes: {
      remoteApp: "http://localhost:3001/remoteEntry.js",
    },
    shared: {
      react: "^18.0.0",
      "react-dom": { requiredVersion: "^18.0.0", singleton: true },
    },
  };

  it("has the correct plugin name", () => {
    const plugin = federationPlugin(baseOptions);
    expect(plugin.name).toBe("steamroller:federation");
  });

  it("resolves the virtual remote entry module", () => {
    const plugin = federationPlugin(baseOptions);
    const resolveId = plugin.resolveId as (
      source: string,
      importer: string | undefined,
    ) => unknown;
    const result = resolveId.call(
      {} as never,
      "virtual:federation-entry",
      undefined,
    );
    expect(result).toEqual({
      id: "virtual:federation-entry",
      external: false,
    });
  });

  it("resolves remote module imports to virtual IDs", () => {
    const plugin = federationPlugin(baseOptions);
    const resolveId = plugin.resolveId as (
      source: string,
      importer: string | undefined,
    ) => unknown;
    const result = resolveId.call({} as never, "remoteApp/Button", undefined);
    expect(result).toEqual({
      id: "virtual:federation/remoteApp/./Button",
      external: false,
    });
  });

  it("returns null for unrelated imports in resolveId", () => {
    const plugin = federationPlugin(baseOptions);
    const resolveId = plugin.resolveId as (
      source: string,
      importer: string | undefined,
    ) => unknown;
    const result = resolveId.call({} as never, "lodash", undefined);
    expect(result).toBeNull();
  });

  it("loads the remote entry virtual module", () => {
    const plugin = federationPlugin(baseOptions);
    const load = plugin.load as (id: string) => unknown;
    const result = load.call({} as never, "virtual:federation-entry") as {
      code: string;
    };
    expect(result).toBeDefined();
    expect(result.code).toContain("__federation_container__");
    expect(result.code).toContain("hostApp");
  });

  it("loads a virtual remote module with loading code", () => {
    const plugin = federationPlugin(baseOptions);
    const load = plugin.load as (id: string) => unknown;
    const result = load.call(
      {} as never,
      "virtual:federation/remoteApp/./Button",
    ) as { code: string };
    expect(result).toBeDefined();
    expect(result.code).toContain("http://localhost:3001/remoteEntry.js");
    expect(result.code).toContain("export default");
  });

  it("returns null when loading non-virtual modules", () => {
    const plugin = federationPlugin(baseOptions);
    const load = plugin.load as (id: string) => unknown;
    const result = load.call({} as never, "./src/app.js");
    expect(result).toBeNull();
  });

  it("rewrites remote imports in transform", () => {
    const plugin = federationPlugin(baseOptions);
    const transform = plugin.transform as (code: string, id: string) => unknown;
    const code = `import { Button } from "remoteApp/Button";`;
    const result = transform.call({} as never, code, "./src/app.js") as {
      code: string;
    } | null;
    expect(result).not.toBeNull();
    expect(result!.code).toContain("virtual:federation/");
  });

  it("marks shared dependency imports in transform", () => {
    const plugin = federationPlugin(baseOptions);
    const transform = plugin.transform as (code: string, id: string) => unknown;
    const code = `import React from "react";`;
    const result = transform.call({} as never, code, "./src/app.js") as {
      code: string;
    } | null;
    expect(result).not.toBeNull();
    expect(result!.code).toContain("federation:shared");
  });

  it("returns null from transform when no changes needed", () => {
    const plugin = federationPlugin(baseOptions);
    const transform = plugin.transform as (code: string, id: string) => unknown;
    const code = `import { foo } from "./local.js";`;
    const result = transform.call({} as never, code, "./src/app.js");
    expect(result).toBeNull();
  });

  it("skips transform for node_modules", () => {
    const plugin = federationPlugin(baseOptions);
    const transform = plugin.transform as (code: string, id: string) => unknown;
    const code = `import React from "react";`;
    const result = transform.call(
      {} as never,
      code,
      "node_modules/some-pkg/index.js",
    );
    expect(result).toBeNull();
  });

  it("emits remote entry in generateBundle when exposes exist", () => {
    const plugin = federationPlugin(baseOptions);
    const emitFile = vi.fn();
    const generateBundle = plugin.generateBundle as (
      options: unknown,
      bundle: unknown,
      isWrite: boolean,
    ) => void;
    generateBundle.call({ emitFile } as never, {}, {}, false);
    expect(emitFile).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "asset",
        fileName: "remoteEntry.js",
      }),
    );
    const emittedSource = emitFile.mock.calls[0][0].source as string;
    expect(emittedSource).toContain("__federation_container__");
  });

  it("does not emit remote entry when no exposes are configured", () => {
    const plugin = federationPlugin({
      name: "consumer",
      remotes: { app2: "http://example.com/entry.js" },
    });
    const emitFile = vi.fn();
    const generateBundle = plugin.generateBundle as (
      options: unknown,
      bundle: unknown,
      isWrite: boolean,
    ) => void;
    generateBundle.call({ emitFile } as never, {}, {}, false);
    expect(emitFile).not.toHaveBeenCalled();
  });

  it("handles dynamic imports of remote modules in transform", () => {
    const plugin = federationPlugin(baseOptions);
    const transform = plugin.transform as (code: string, id: string) => unknown;
    const code = `const mod = import("remoteApp/Widget");`;
    const result = transform.call({} as never, code, "./src/app.js") as {
      code: string;
    } | null;
    expect(result).not.toBeNull();
    expect(result!.code).toContain("virtual:federation/");
  });
});
