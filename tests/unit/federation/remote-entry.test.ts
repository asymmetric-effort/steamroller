/**
 * @module tests/unit/federation/remote-entry
 * @description Unit tests for the remote entry generator.
 */

import { describe, it, expect } from "vitest";
import {
  generateContainerInit,
  generateModuleMap,
  generateContainerAPI,
  generateGlobalRegistration,
  generateRemoteEntry,
  generateRemoteModuleLoad,
  generateSharedInit,
} from "../../../src/federation/remote-entry.js";
import type { ResolvedFederationOptions } from "../../../src/federation/types.js";

describe("generateContainerInit", () => {
  it("generates container name assignment", () => {
    const code = generateContainerInit("myApp");
    expect(code).toContain('"myApp"');
    expect(code).toContain("__federation_container_name__");
  });

  it("initializes modules and shared init flag", () => {
    const code = generateContainerInit("app1");
    expect(code).toContain("__federation_modules__");
    expect(code).toContain("__federation_shared_init__");
    expect(code).toContain("false");
  });
});

describe("generateModuleMap", () => {
  it("generates empty map for no exposes", () => {
    const code = generateModuleMap({});
    expect(code).toContain("__federation_module_map__");
    expect(code).toContain("{}");
  });

  it("generates map with exposed modules", () => {
    const code = generateModuleMap({
      "./Button": "./src/components/Button.js",
      "./utils": "./src/utils/index.js",
    });
    expect(code).toContain('"./Button"');
    expect(code).toContain('"./src/components/Button.js"');
    expect(code).toContain('"./utils"');
    expect(code).toContain("import(");
  });

  it("wraps each module in a factory function", () => {
    const code = generateModuleMap({ "./Foo": "./src/Foo.js" });
    expect(code).toContain("() => import(");
  });
});

describe("generateContainerAPI", () => {
  it("generates get function", () => {
    const code = generateContainerAPI();
    expect(code).toContain("get: function(module)");
    expect(code).toContain("__federation_module_map__");
  });

  it("generates init function", () => {
    const code = generateContainerAPI();
    expect(code).toContain("init: function(sharedScope)");
    expect(code).toContain("__federation_shared_init__");
  });

  it("throws error for missing modules in get", () => {
    const code = generateContainerAPI();
    expect(code).toContain("does not exist in container");
  });
});

describe("generateGlobalRegistration", () => {
  it("generates globalThis assignment for var format", () => {
    const code = generateGlobalRegistration("myApp", "var");
    expect(code).toContain("globalThis");
    expect(code).toContain('"myApp"');
  });

  it("generates export for module format", () => {
    const code = generateGlobalRegistration("myApp", "module");
    expect(code).toContain("export");
    expect(code).toContain("default");
  });

  it("defaults to var format", () => {
    const code = generateGlobalRegistration("myApp");
    expect(code).toContain("globalThis");
  });
});

describe("generateRemoteEntry", () => {
  const baseOptions: ResolvedFederationOptions = {
    name: "testApp",
    exposes: { "./Button": "./src/Button.js" },
    remotes: {},
    shared: {},
    filename: "remoteEntry.js",
  };

  it("includes container header comment", () => {
    const code = generateRemoteEntry(baseOptions);
    expect(code).toContain("// Container: testApp");
  });

  it("includes container init code", () => {
    const code = generateRemoteEntry(baseOptions);
    expect(code).toContain("__federation_container_name__");
  });

  it("includes module map for exposed modules", () => {
    const code = generateRemoteEntry(baseOptions);
    expect(code).toContain('"./Button"');
    expect(code).toContain('"./src/Button.js"');
  });

  it("includes container API", () => {
    const code = generateRemoteEntry(baseOptions);
    expect(code).toContain("__federation_container__");
    expect(code).toContain("get:");
    expect(code).toContain("init:");
  });

  it("includes global registration", () => {
    const code = generateRemoteEntry(baseOptions);
    expect(code).toContain("globalThis");
  });
});

describe("generateRemoteModuleLoad", () => {
  it("generates script loading code", () => {
    const code = generateRemoteModuleLoad(
      "app2",
      "http://localhost:3002/remoteEntry.js",
      "./Widget",
    );
    expect(code).toContain("document.createElement");
    expect(code).toContain('"http://localhost:3002/remoteEntry.js"');
  });

  it("initializes the container with shared scope", () => {
    const code = generateRemoteModuleLoad(
      "app2",
      "http://example.com/entry.js",
      ".",
    );
    expect(code).toContain("container.init(__federation_shared_scope__)");
  });

  it("calls get with the exposed module name", () => {
    const code = generateRemoteModuleLoad(
      "app2",
      "http://example.com/entry.js",
      "./Button",
    );
    expect(code).toContain('container.get("./Button")');
  });

  it("wraps in async IIFE", () => {
    const code = generateRemoteModuleLoad(
      "app2",
      "http://example.com/entry.js",
      ".",
    );
    expect(code).toContain("async function()");
    expect(code).toContain("})()");
  });
});

describe("generateSharedInit", () => {
  it("returns empty string for no shared deps", () => {
    const code = generateSharedInit({});
    expect(code).toBe("");
  });

  it("generates registration for shared deps", () => {
    const code = generateSharedInit({
      react: {
        packageName: "react",
        requiredVersion: "^18.0.0",
        singleton: true,
        strictVersion: false,
        eager: true,
      },
    });
    expect(code).toContain("__federation_shared_scope__");
    expect(code).toContain('"react"');
    expect(code).toContain("^18.0.0");
    expect(code).toContain("eager: true");
  });
});
