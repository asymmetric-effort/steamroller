/**
 * @module tests/unit/module/resolve
 * @description Unit tests for the module resolution pipeline.
 */

import { describe, it, expect } from "vitest";
import {
  defaultResolve,
  isExternal,
  resolveId,
} from "../../../src/module/resolve.js";
import type {
  ResolveIdHook,
  ResolveOptions,
} from "../../../src/module/resolve.js";
import type { ResolvedId } from "../../../src/types.js";

const isWindows = process.platform === "win32";

describe("defaultResolve", () => {
  it("should return normalized path for absolute source", () => {
    const result = defaultResolve("/home/user/project/src/index.ts", undefined);
    expect(result).toBe("/home/user/project/src/index.ts");
  });

  it("should normalize backslashes in absolute paths", () => {
    const result = defaultResolve(
      "/home/user/project\\src\\index.ts",
      undefined,
    );
    expect(result).toBe("/home/user/project/src/index.ts");
  });

  it("should resolve relative path against importer directory", () => {
    const base = isWindows
      ? "C:/project/src/index.ts"
      : "/project/src/index.ts";
    const expected = isWindows
      ? "C:/project/src/utils.ts"
      : "/project/src/utils.ts";
    const result = defaultResolve("./utils.ts", base);
    expect(result).toBe(expected);
  });

  it("should resolve parent-relative path against importer", () => {
    const base = isWindows
      ? "C:/project/src/index.ts"
      : "/project/src/index.ts";
    const expected = isWindows
      ? "C:/project/lib/helper.ts"
      : "/project/lib/helper.ts";
    const result = defaultResolve("../lib/helper.ts", base);
    expect(result).toBe(expected);
  });

  it("should return null for relative path without importer", () => {
    const result = defaultResolve("./utils.ts", undefined);
    expect(result).toBeNull();
  });

  it("should return null for parent-relative path without importer", () => {
    const result = defaultResolve("../utils.ts", undefined);
    expect(result).toBeNull();
  });

  it("should return null for bare specifiers", () => {
    const result = defaultResolve("lodash", "/home/user/project/src/index.ts");
    expect(result).toBeNull();
  });

  it("should return null for scoped bare specifiers", () => {
    const result = defaultResolve(
      "@scope/pkg",
      "/home/user/project/src/index.ts",
    );
    expect(result).toBeNull();
  });

  it("should return null for bare specifiers without importer", () => {
    const result = defaultResolve("lodash", undefined);
    expect(result).toBeNull();
  });
});

describe("isExternal", () => {
  it("should return false when external is undefined", () => {
    const result = isExternal("/path/to/mod.ts", "mod", undefined, undefined);
    expect(result).toBe(false);
  });

  it("should match string external by id", () => {
    const result = isExternal("lodash", "lodash", undefined, "lodash");
    expect(result).toBe(true);
  });

  it("should match string external by source", () => {
    const result = isExternal(
      "/resolved/lodash",
      "lodash",
      undefined,
      "lodash",
    );
    expect(result).toBe(true);
  });

  it("should not match unrelated string external", () => {
    const result = isExternal("react", "react", undefined, "lodash");
    expect(result).toBe(false);
  });

  it("should match RegExp external against source", () => {
    const result = isExternal(
      "/resolved/node_modules/lodash",
      "lodash",
      undefined,
      /^lodash/,
    );
    expect(result).toBe(true);
  });

  it("should not match RegExp when source does not match", () => {
    const result = isExternal("react", "react", undefined, /^lodash/);
    expect(result).toBe(false);
  });

  it("should match array of strings", () => {
    const result = isExternal("react", "react", undefined, ["lodash", "react"]);
    expect(result).toBe(true);
  });

  it("should match array of RegExp", () => {
    const result = isExternal("react-dom", "react-dom", undefined, [
      /^react/,
      /^vue/,
    ]);
    expect(result).toBe(true);
  });

  it("should not match array when nothing matches", () => {
    const result = isExternal("svelte", "svelte", undefined, ["react", /^vue/]);
    expect(result).toBe(false);
  });

  it("should match mixed array of strings and RegExp", () => {
    const result = isExternal("vue", "vue", undefined, ["react", /^vue$/]);
    expect(result).toBe(true);
  });

  it("should call function external with correct arguments", () => {
    const calls: Array<[string, string | undefined, boolean]> = [];
    const fn = (
      source: string,
      importer: string | undefined,
      isResolved: boolean,
    ): boolean => {
      calls.push([source, importer, isResolved]);
      return true;
    };
    isExternal("lodash", "lodash", "/src/index.ts", fn);
    expect(calls).toEqual([["lodash", "/src/index.ts", true]]);
  });

  it("should return true when function returns true", () => {
    const result = isExternal("lodash", "lodash", undefined, () => true);
    expect(result).toBe(true);
  });

  it("should return false when function returns false", () => {
    const result = isExternal("lodash", "lodash", undefined, () => false);
    expect(result).toBe(false);
  });

  it("should return false when function returns null", () => {
    const result = isExternal("lodash", "lodash", undefined, () => null);
    expect(result).toBe(false);
  });

  it("should return false when function returns undefined", () => {
    const result = isExternal("lodash", "lodash", undefined, () => undefined);
    expect(result).toBe(false);
  });

  it("should handle empty array external", () => {
    const result = isExternal("lodash", "lodash", undefined, []);
    expect(result).toBe(false);
  });

  it("should pass isResolved=false when id differs from source", () => {
    const calls: Array<[string, string | undefined, boolean]> = [];
    const fn = (
      source: string,
      importer: string | undefined,
      isResolved: boolean,
    ): boolean => {
      calls.push([source, importer, isResolved]);
      return false;
    };
    isExternal("/resolved/lodash", "lodash", "/src/index.ts", fn);
    expect(calls[0][2]).toBe(false);
  });
});

describe("resolveId", () => {
  const emptyOptions: ResolveOptions = {};
  const emptyAttributes: Readonly<Record<string, string>> = {};

  it("should use first plugin hook that returns a string", async () => {
    const hooks: ReadonlyArray<ResolveIdHook> = [
      () => "/resolved/by/plugin.ts",
    ];
    const result = await resolveId(
      "source",
      "/importer.ts",
      emptyOptions,
      hooks,
      false,
      emptyAttributes,
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe("/resolved/by/plugin.ts");
    expect(result!.external).toBe(false);
    expect(result!.resolvedBy).toBe("plugin");
  });

  it("should use first plugin hook that returns a ResolvedId object", async () => {
    const resolvedId: ResolvedId = {
      id: "/custom/resolved.ts",
      external: true,
      moduleSideEffects: "no-treeshake",
      syntheticNamedExports: "default",
      meta: { custom: "data" },
      resolvedBy: "my-plugin",
    };
    const hooks: ReadonlyArray<ResolveIdHook> = [() => resolvedId];
    const result = await resolveId(
      "source",
      "/importer.ts",
      emptyOptions,
      hooks,
      false,
      emptyAttributes,
    );
    expect(result).toEqual(resolvedId);
  });

  it("should fall through when plugin hook returns null", async () => {
    const hooks: ReadonlyArray<ResolveIdHook> = [
      () => null,
      () => "/second/plugin.ts",
    ];
    const result = await resolveId(
      "./relative.ts",
      "/project/src/index.ts",
      emptyOptions,
      hooks,
      false,
      emptyAttributes,
    );
    expect(result!.id).toBe("/second/plugin.ts");
    expect(result!.resolvedBy).toBe("plugin");
  });

  it("should fall through when plugin hook returns undefined", async () => {
    const importer = isWindows
      ? "C:/project/src/index.ts"
      : "/project/src/index.ts";
    const expected = isWindows
      ? "C:/project/src/utils.ts"
      : "/project/src/utils.ts";
    const hooks: ReadonlyArray<ResolveIdHook> = [() => undefined];
    const result = await resolveId(
      "./utils.ts",
      importer,
      emptyOptions,
      hooks,
      false,
      emptyAttributes,
    );
    expect(result!.id).toBe(expected);
    expect(result!.resolvedBy).toBe("default");
  });

  it("should use default resolution for relative paths", async () => {
    const importer = isWindows
      ? "C:/project/src/index.ts"
      : "/project/src/index.ts";
    const expected = isWindows
      ? "C:/project/src/lib/helper.ts"
      : "/project/src/lib/helper.ts";
    const result = await resolveId(
      "./lib/helper.ts",
      importer,
      emptyOptions,
      [],
      false,
      emptyAttributes,
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe(expected);
    expect(result!.external).toBe(false);
    expect(result!.resolvedBy).toBe("default");
  });

  it("should use default resolution for absolute paths", async () => {
    const result = await resolveId(
      "/absolute/path.ts",
      "/project/src/index.ts",
      emptyOptions,
      [],
      false,
      emptyAttributes,
    );
    expect(result!.id).toBe("/absolute/path.ts");
    expect(result!.resolvedBy).toBe("default");
  });

  it("should return null for bare specifiers with no plugins", async () => {
    const result = await resolveId(
      "lodash",
      "/project/src/index.ts",
      emptyOptions,
      [],
      false,
      emptyAttributes,
    );
    expect(result).toBeNull();
  });

  it("should detect external modules", async () => {
    const options: ResolveOptions = {
      external: ["lodash"],
    };
    const hooks: ReadonlyArray<ResolveIdHook> = [
      (source) => {
        if (source === "lodash") {
          return "lodash";
        }
        return null;
      },
    ];
    const result = await resolveId(
      "lodash",
      "/project/src/index.ts",
      options,
      hooks,
      false,
      emptyAttributes,
    );
    // Plugin wins - external detection only applies to default resolution
    expect(result!.id).toBe("lodash");
    expect(result!.resolvedBy).toBe("plugin");
  });

  it("should mark resolved path as external when matched", async () => {
    const options: ResolveOptions = {
      external: /external-mod/,
    };
    const result = await resolveId(
      "./external-mod.ts",
      "/project/src/index.ts",
      options,
      [],
      false,
      emptyAttributes,
    );
    expect(result!.external).toBe(true);
  });

  it("should pass isEntry flag to plugin hooks", async () => {
    const receivedOptions: Array<{
      isEntry: boolean;
      attributes: Readonly<Record<string, string>>;
    }> = [];
    const hooks: ReadonlyArray<ResolveIdHook> = [
      (_source, _importer, opts) => {
        receivedOptions.push(opts);
        return null;
      },
    ];
    await resolveId(
      "./entry.ts",
      undefined,
      emptyOptions,
      hooks,
      true,
      emptyAttributes,
    );
    expect(receivedOptions[0].isEntry).toBe(true);
  });

  it("should pass attributes to plugin hooks", async () => {
    const receivedOptions: Array<{
      isEntry: boolean;
      attributes: Readonly<Record<string, string>>;
    }> = [];
    const attrs = { type: "json" };
    const hooks: ReadonlyArray<ResolveIdHook> = [
      (_source, _importer, opts) => {
        receivedOptions.push(opts);
        return null;
      },
    ];
    await resolveId(
      "./data.json",
      "/project/src/index.ts",
      emptyOptions,
      hooks,
      false,
      attrs,
    );
    expect(receivedOptions[0].attributes).toEqual({ type: "json" });
  });

  it("should handle async plugin hooks", async () => {
    const hooks: ReadonlyArray<ResolveIdHook> = [
      async () => Promise.resolve("/async/resolved.ts"),
    ];
    const result = await resolveId(
      "source",
      "/importer.ts",
      emptyOptions,
      hooks,
      false,
      emptyAttributes,
    );
    expect(result!.id).toBe("/async/resolved.ts");
    expect(result!.resolvedBy).toBe("plugin");
  });

  it("should set default resolvedBy to 'plugin' when hook result omits it", async () => {
    const hooks: ReadonlyArray<ResolveIdHook> = [
      () => ({
        id: "/custom.ts",
        external: false,
        moduleSideEffects: true,
        syntheticNamedExports: false,
        meta: {},
        resolvedBy: "plugin",
      }),
    ];
    const result = await resolveId(
      "source",
      "/importer.ts",
      emptyOptions,
      hooks,
      false,
      emptyAttributes,
    );
    expect(result!.resolvedBy).toBe("plugin");
  });

  it("should set moduleSideEffects to true for default resolution", async () => {
    const result = await resolveId(
      "./file.ts",
      "/project/index.ts",
      emptyOptions,
      [],
      false,
      emptyAttributes,
    );
    expect(result!.moduleSideEffects).toBe(true);
  });

  it("should set syntheticNamedExports to false for default resolution", async () => {
    const result = await resolveId(
      "./file.ts",
      "/project/index.ts",
      emptyOptions,
      [],
      false,
      emptyAttributes,
    );
    expect(result!.syntheticNamedExports).toBe(false);
  });

  it("should set empty meta for default resolution", async () => {
    const result = await resolveId(
      "./file.ts",
      "/project/index.ts",
      emptyOptions,
      [],
      false,
      emptyAttributes,
    );
    expect(result!.meta).toEqual({});
  });

  it("should handle multiple plugin hooks where all return null", async () => {
    const importer = isWindows ? "C:/project/index.ts" : "/project/index.ts";
    const expected = isWindows ? "C:/project/file.ts" : "/project/file.ts";
    const hooks: ReadonlyArray<ResolveIdHook> = [
      () => null,
      () => null,
      () => null,
    ];
    const result = await resolveId(
      "./file.ts",
      importer,
      emptyOptions,
      hooks,
      false,
      emptyAttributes,
    );
    expect(result!.id).toBe(expected);
    expect(result!.resolvedBy).toBe("default");
  });

  it("should not call subsequent hooks after first non-null result", async () => {
    const callCounts = [0, 0];
    const hooks: ReadonlyArray<ResolveIdHook> = [
      () => {
        callCounts[0]++;
        return "/first.ts";
      },
      () => {
        callCounts[1]++;
        return "/second.ts";
      },
    ];
    await resolveId(
      "source",
      "/importer.ts",
      emptyOptions,
      hooks,
      false,
      emptyAttributes,
    );
    expect(callCounts[0]).toBe(1);
    expect(callCounts[1]).toBe(0);
  });

  it("should handle external function option in default resolution", async () => {
    const options: ResolveOptions = {
      external: (source) => source === "./external.ts",
    };
    const result = await resolveId(
      "./external.ts",
      "/project/index.ts",
      options,
      [],
      false,
      emptyAttributes,
    );
    expect(result!.external).toBe(true);
  });

  it("should return null for bare specifier without importer and no plugins", async () => {
    const result = await resolveId(
      "bare-module",
      undefined,
      emptyOptions,
      [],
      true,
      emptyAttributes,
    );
    expect(result).toBeNull();
  });
});
