/**
 * Unit tests for config file loader.
 *
 * @module tests/unit/cli/config-loader
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  findConfigFile,
  resolveConfigPath,
  normalizeConfig,
  loadConfigFile,
} from "../../../src/cli/config-loader.js";
import { resolve } from "node:path";

/* Mock node:fs/promises */
vi.mock("node:fs/promises", () => ({
  stat: vi.fn(),
}));

import { stat } from "node:fs/promises";

const mockStat = vi.mocked(stat);

describe("findConfigFile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should find rollup.config.mjs first", async () => {
    mockStat.mockImplementation((path) => {
      if (String(path).endsWith("rollup.config.mjs")) {
        return Promise.resolve({ isFile: () => true } as ReturnType<
          typeof import("node:fs/promises").stat extends (
            ...args: infer _A
          ) => infer R
            ? R extends Promise<infer V>
              ? () => V
              : never
            : never
        >);
      }
      return Promise.reject(new Error("ENOENT"));
    });

    const result = await findConfigFile("/project");
    expect(result).toBe(resolve("/project", "rollup.config.mjs"));
  });

  it("should find rollup.config.js when .mjs not found", async () => {
    mockStat.mockImplementation((path) => {
      if (String(path).endsWith("rollup.config.js")) {
        return Promise.resolve({ isFile: () => true } as ReturnType<
          typeof import("node:fs/promises").stat extends (
            ...args: infer _A
          ) => infer R
            ? R extends Promise<infer V>
              ? () => V
              : never
            : never
        >);
      }
      return Promise.reject(new Error("ENOENT"));
    });

    const result = await findConfigFile("/project");
    expect(result).toBe(resolve("/project", "rollup.config.js"));
  });

  it("should return null when no config file exists", async () => {
    mockStat.mockRejectedValue(new Error("ENOENT"));

    const result = await findConfigFile("/project");
    expect(result).toBeNull();
  });

  it("should find rollup.config.cjs", async () => {
    mockStat.mockImplementation((path) => {
      if (String(path).endsWith("rollup.config.cjs")) {
        return Promise.resolve({ isFile: () => true } as ReturnType<
          typeof import("node:fs/promises").stat extends (
            ...args: infer _A
          ) => infer R
            ? R extends Promise<infer V>
              ? () => V
              : never
            : never
        >);
      }
      return Promise.reject(new Error("ENOENT"));
    });

    const result = await findConfigFile("/project");
    expect(result).toBe(resolve("/project", "rollup.config.cjs"));
  });

  it("should find rollup.config.ts", async () => {
    mockStat.mockImplementation((path) => {
      if (String(path).endsWith("rollup.config.ts")) {
        return Promise.resolve({ isFile: () => true } as ReturnType<
          typeof import("node:fs/promises").stat extends (
            ...args: infer _A
          ) => infer R
            ? R extends Promise<infer V>
              ? () => V
              : never
            : never
        >);
      }
      return Promise.reject(new Error("ENOENT"));
    });

    const result = await findConfigFile("/project");
    expect(result).toBe(resolve("/project", "rollup.config.ts"));
  });
});

describe("resolveConfigPath", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return null when configFile is false", async () => {
    const result = await resolveConfigPath({ configFile: false }, "/project");
    expect(result).toBeNull();
  });

  it("should resolve relative path when configFile is a string", async () => {
    const result = await resolveConfigPath(
      { configFile: "custom.config.js" },
      "/project",
    );
    expect(result).toBe(resolve("/project", "custom.config.js"));
  });

  it("should search default locations when configFile is true", async () => {
    mockStat.mockImplementation((path) => {
      if (String(path).endsWith("rollup.config.mjs")) {
        return Promise.resolve({ isFile: () => true } as ReturnType<
          typeof import("node:fs/promises").stat extends (
            ...args: infer _A
          ) => infer R
            ? R extends Promise<infer V>
              ? () => V
              : never
            : never
        >);
      }
      return Promise.reject(new Error("ENOENT"));
    });

    const result = await resolveConfigPath({ configFile: true }, "/project");
    expect(result).toBe(resolve("/project", "rollup.config.mjs"));
  });
});

describe("normalizeConfig", () => {
  it("should wrap a single object in an array", async () => {
    const config = { input: "src/index.ts" };
    const result = await normalizeConfig(config, {});
    expect(result).toEqual([config]);
  });

  it("should return array configs unchanged", async () => {
    const configs = [{ input: "a.ts" }, { input: "b.ts" }];
    const result = await normalizeConfig(configs, {});
    expect(result).toEqual(configs);
  });

  it("should call function configs with command line args", async () => {
    const configFn = (args: Record<string, unknown>) => ({
      input: args["input"] as string,
    });
    const result = await normalizeConfig(configFn, { input: "src/main.ts" });
    expect(result).toEqual([{ input: "src/main.ts" }]);
  });

  it("should handle async function configs", async () => {
    const configFn = async () => ({ input: "async.ts" });
    const result = await normalizeConfig(configFn, {});
    expect(result).toEqual([{ input: "async.ts" }]);
  });

  it("should return empty array for null/undefined", async () => {
    const result = await normalizeConfig(null, {});
    expect(result).toEqual([]);
  });

  it("should return empty array for non-object primitives", async () => {
    const result = await normalizeConfig("invalid", {});
    expect(result).toEqual([]);
  });

  it("should handle function returning array", async () => {
    const configFn = () => [{ input: "a.ts" }, { input: "b.ts" }];
    const result = await normalizeConfig(configFn, {});
    expect(result).toEqual([{ input: "a.ts" }, { input: "b.ts" }]);
  });
});

describe("loadConfigFile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should throw for unsupported extensions", async () => {
    await expect(loadConfigFile("/project/config.yaml")).rejects.toThrow(
      "Unsupported config file extension",
    );
  });

  it("should throw when file does not exist", async () => {
    mockStat.mockRejectedValue(new Error("ENOENT"));

    await expect(loadConfigFile("/project/rollup.config.js")).rejects.toThrow(
      "Config file not found",
    );
  });
});
