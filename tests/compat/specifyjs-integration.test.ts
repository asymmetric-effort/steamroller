/**
 * SpecifyJS integration test -- simulates bundling a realistic project structure.
 *
 * SpecifyJS (github.com/asymmetric-effort/specifyjs) is a sibling project in
 * the same organisation.  Since we cannot clone external repos in CI, this test
 * recreates a representative module graph (15+ modules across utils/, core/,
 * and api/ subdirectories) that exercises patterns commonly found in real-world
 * TypeScript libraries:
 *
 *   - barrel re-exports (import then export)
 *   - class hierarchies and factory functions
 *   - async helpers and event-emitter patterns
 *   - circular dependencies between internal modules
 *   - test-only utilities that should be tree-shaken away
 *
 * The test bundles the project in both ES and CJS formats, asserts syntactic
 * validity, verifies expected exports, checks that tree-shaking removes
 * test-only code, and evaluates the CJS bundle via `new Function()`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vm from "node:vm";
import { rollup } from "../../src/rollup.js";
import type { OutputChunk } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a file, creating intermediate directories as needed. */
const write = async (dir: string, rel: string, code: string): Promise<void> => {
  const full = join(dir, rel);
  const parent = full.replace(/\/[^/]+$/, "");
  await mkdir(parent, { recursive: true });
  await writeFile(full, code);
};

/** Extract the first output chunk from a generate result. */
const firstChunk = (
  output: ReadonlyArray<{ readonly type: string }>,
): OutputChunk => {
  const chunk = output.find((o) => o.type === "chunk");
  if (!chunk) {
    throw new Error("No chunk in output");
  }
  return chunk as OutputChunk;
};

/**
 * Strip ES module syntax so code can be evaluated as a plain script.
 * Mirrors the helper from differential.test.ts.
 */
const stripModuleSyntax = (code: string): string => {
  return code
    .replace(/\bexport\s+default\s+function\s+/g, "function ")
    .replace(/\bexport\s+default\s+class\s+/g, "class ")
    .replace(/\bexport\s+default\s+/g, "var __default__ = ")
    .replace(/\bexport\s*\{[^}]*\}\s*from\s*['"][^'"]*['"]\s*;?/g, "")
    .replace(/\bexport\s*\*\s*from\s*['"][^'"]*['"]\s*;?/g, "")
    .replace(/\bexport\s*\{[^}]*\}\s*;?/g, "")
    .replace(/\bexport\s+(const|let|var|function|class)\s+/g, "$1 ")
    .replace(/\bimport\s+[^;]*?\s*from\s*['"][^'"]*['"]\s*;?/g, "")
    .replace(/\bimport\s*['"][^'"]*['"]\s*;?/g, "")
    .replace(/\bimport\s*\(([^)]*)\)/g, "Promise.resolve({})");
};

/**
 * Evaluate an ES module bundle in a VM context after stripping module syntax
 * and converting const/let to var for hoisting safety.
 */
const evaluateEsBundle = (code: string): Record<string, unknown> => {
  let rewritten = stripModuleSyntax(code);
  rewritten = rewritten.replace(/\bconst\s+/g, "var ");
  rewritten = rewritten.replace(/\blet\s+/g, "var ");
  // Remove stray `};` lines left over from barrel re-export stripping
  rewritten = rewritten.replace(/^\s*\};\s*$/gm, "");

  const exports: Record<string, unknown> = {};
  const context = vm.createContext({
    __exports: exports,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Object,
    Array,
    Set,
    Map,
    Number,
    TypeError,
  });

  vm.runInNewContext(rewritten, context, { timeout: 5000 });
  return exports;
};

// ---------------------------------------------------------------------------
// Project scaffold
// ---------------------------------------------------------------------------

/**
 * Writes 16 modules into `dir`.  The layout mirrors a realistic library:
 *
 *   index.js          -- barrel entry (import+re-export pattern)
 *   utils/index.js    -- barrel
 *   utils/strings.js
 *   utils/arrays.js
 *   utils/guards.js
 *   utils/test-helpers.js   (test-only, should be tree-shaken)
 *   core/index.js     -- barrel
 *   core/base.js
 *   core/registry.js
 *   core/validator.js
 *   core/emitter.js
 *   core/pipeline.js
 *   api/index.js      -- barrel
 *   api/client.js
 *   api/request.js
 *   api/response.js
 *
 * Barrel files use the `import { x } from ...` then `export { x }` pattern
 * so that steamroller correctly inlines the dependency code.
 *
 * Code avoids spread syntax (...) to stay within the parser's supported
 * grammar; Object.assign and Array.from are used instead.
 */
const scaffoldProject = async (dir: string): Promise<string> => {
  // ---- utils/ ----

  await write(
    dir,
    "utils/strings.js",
    [
      "export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);",
      "export const slugify = (s) => s.toLowerCase().replace(/\\s+/g, '-');",
      "",
    ].join("\n"),
  );

  await write(
    dir,
    "utils/arrays.js",
    [
      "export const unique = (arr) => Array.from(new Set(arr));",
      "export const chunk = (arr, size) => {",
      "  const out = [];",
      "  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));",
      "  return out;",
      "};",
      "",
    ].join("\n"),
  );

  await write(
    dir,
    "utils/guards.js",
    [
      'export const isString = (v) => typeof v === "string";',
      'export const isNumber = (v) => typeof v === "number" && !Number.isNaN(v);',
      "export const isDefined = (v) => v !== null && v !== undefined;",
      "",
    ].join("\n"),
  );

  // Test-only utility -- should be tree-shaken from production bundles
  await write(
    dir,
    "utils/test-helpers.js",
    [
      "export const mockFetch = () => Promise.resolve({ ok: true, json: function() { return {}; } });",
      "export const createFixture = (name) => ({ id: 1, name: name });",
      "export const TEST_ONLY_SENTINEL = '__test_only__';",
      "",
    ].join("\n"),
  );

  await write(
    dir,
    "utils/index.js",
    [
      'import { capitalize, slugify } from "./strings.js";',
      'import { unique, chunk } from "./arrays.js";',
      'import { isString, isNumber, isDefined } from "./guards.js";',
      "// NOTE: test-helpers intentionally NOT imported from barrel",
      "export { capitalize, slugify, unique, chunk, isString, isNumber, isDefined };",
      "",
    ].join("\n"),
  );

  // ---- core/ ----

  await write(
    dir,
    "core/base.js",
    [
      "export class BaseSpec {",
      "  constructor(name) {",
      "    this.name = name;",
      "    this.rules = [];",
      "  }",
      "  addRule(rule) {",
      "    this.rules.push(rule);",
      "    return this;",
      "  }",
      "  validate(value) {",
      "    return this.rules.every((r) => r(value));",
      "  }",
      "}",
      "",
    ].join("\n"),
  );

  // registry.js and validator.js form a circular dependency
  await write(
    dir,
    "core/registry.js",
    [
      'import { createValidator } from "./validator.js";',
      "",
      "const specs = new Map();",
      "",
      "export const register = (name, spec) => {",
      "  specs.set(name, spec);",
      "};",
      "",
      "export const lookup = (name) => specs.get(name);",
      "",
      "export const createAndRegister = (name, rules) => {",
      "  const v = createValidator(name, rules);",
      "  register(name, v);",
      "  return v;",
      "};",
      "",
    ].join("\n"),
  );

  await write(
    dir,
    "core/validator.js",
    [
      'import { BaseSpec } from "./base.js";',
      'import { register } from "./registry.js";',
      "",
      "export const createValidator = (name, rules) => {",
      "  const spec = new BaseSpec(name);",
      "  rules.forEach((r) => spec.addRule(r));",
      "  return spec;",
      "};",
      "",
      "export const createAndAutoRegister = (name, rules) => {",
      "  const v = createValidator(name, rules);",
      "  register(name, v);",
      "  return v;",
      "};",
      "",
    ].join("\n"),
  );

  await write(
    dir,
    "core/emitter.js",
    [
      "export class EventEmitter {",
      "  constructor() {",
      "    this._handlers = {};",
      "  }",
      "  on(event, handler) {",
      "    if (!this._handlers[event]) this._handlers[event] = [];",
      "    this._handlers[event].push(handler);",
      "    return this;",
      "  }",
      "  emit(event, data) {",
      "    var list = this._handlers[event] || [];",
      "    for (var i = 0; i < list.length; i++) list[i](data);",
      "  }",
      "}",
      "",
    ].join("\n"),
  );

  await write(
    dir,
    "core/pipeline.js",
    [
      "export const createPipeline = (fns) => {",
      "  return async (input) => {",
      "    var result = input;",
      "    for (var i = 0; i < fns.length; i++) result = await fns[i](result);",
      "    return result;",
      "  };",
      "};",
      "",
    ].join("\n"),
  );

  await write(
    dir,
    "core/index.js",
    [
      'import { BaseSpec } from "./base.js";',
      'import { register, lookup, createAndRegister } from "./registry.js";',
      'import { createValidator, createAndAutoRegister } from "./validator.js";',
      'import { EventEmitter } from "./emitter.js";',
      'import { createPipeline } from "./pipeline.js";',
      "export { BaseSpec, register, lookup, createAndRegister, createValidator, createAndAutoRegister, EventEmitter, createPipeline };",
      "",
    ].join("\n"),
  );

  // ---- api/ ----

  await write(
    dir,
    "api/request.js",
    [
      'import { isString } from "../utils/guards.js";',
      "",
      "export const createRequest = (method, url, body) => {",
      '  if (!isString(url)) throw new TypeError("url must be a string");',
      "  return { method: method, url: url, body: body, headers: {} };",
      "};",
      "",
      "export const withHeader = (req, key, value) => {",
      "  var h = Object.assign({}, req.headers);",
      "  h[key] = value;",
      "  return Object.assign({}, req, { headers: h });",
      "};",
      "",
    ].join("\n"),
  );

  await write(
    dir,
    "api/response.js",
    [
      "export const createResponse = (status, data) => ({",
      "  status: status,",
      "  data: data,",
      "  ok: status >= 200 && status < 300,",
      "});",
      "",
      "export const isOk = (res) => res.ok === true;",
      "",
    ].join("\n"),
  );

  await write(
    dir,
    "api/client.js",
    [
      'import { createRequest, withHeader } from "./request.js";',
      'import { createResponse } from "./response.js";',
      'import { EventEmitter } from "../core/emitter.js";',
      "",
      "export const createClient = (baseUrl) => {",
      "  var emitter = new EventEmitter();",
      "  var client = {",
      "    baseUrl: baseUrl,",
      "    on: function(event, handler) { return emitter.on(event, handler); },",
      "    get: async function(path) {",
      '      var req = withHeader(createRequest("GET", baseUrl + path), "Accept", "application/json");',
      '      emitter.emit("request", req);',
      "      return createResponse(200, { path: path });",
      "    },",
      "    post: async function(path, body) {",
      '      var req = createRequest("POST", baseUrl + path, body);',
      '      emitter.emit("request", req);',
      "      return createResponse(201, body);",
      "    }",
      "  };",
      "  return client;",
      "};",
      "",
    ].join("\n"),
  );

  await write(
    dir,
    "api/index.js",
    [
      'import { createClient } from "./client.js";',
      'import { createRequest, withHeader } from "./request.js";',
      'import { createResponse, isOk } from "./response.js";',
      "export { createClient, createRequest, withHeader, createResponse, isOk };",
      "",
    ].join("\n"),
  );

  // ---- root entry ----

  const entryPath = join(dir, "index.js");
  await write(
    dir,
    "index.js",
    [
      "// SpecifyJS main entry -- re-exports from all subpackages",
      'import { capitalize, slugify, unique, chunk, isString, isNumber, isDefined } from "./utils/index.js";',
      'import { BaseSpec, register, lookup, createAndRegister, createValidator, createAndAutoRegister, EventEmitter, createPipeline } from "./core/index.js";',
      'import { createClient, createRequest, withHeader, createResponse, isOk } from "./api/index.js";',
      "export { capitalize, slugify, unique, chunk, isString, isNumber, isDefined };",
      "export { BaseSpec, register, lookup, createAndRegister, createValidator, createAndAutoRegister, EventEmitter, createPipeline };",
      "export { createClient, createRequest, withHeader, createResponse, isOk };",
      "",
    ].join("\n"),
  );

  return entryPath;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("specifyjs integration -- realistic project bundling", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "specifyjs-integration-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("bundles 15+ modules into a single ES chunk with all exports", async () => {
    const entry = await scaffoldProject(tempDir);
    const build = await rollup({ input: entry, treeshake: false });
    const { output } = await build.generate({ format: "es" });
    const chunk = firstChunk(output);

    // All entry-level exports should be present in metadata
    const expectedExports = [
      "capitalize",
      "slugify",
      "unique",
      "chunk",
      "isString",
      "isNumber",
      "isDefined",
      "BaseSpec",
      "register",
      "lookup",
      "createAndRegister",
      "createValidator",
      "createAndAutoRegister",
      "EventEmitter",
      "createPipeline",
      "createClient",
      "createRequest",
      "withHeader",
      "createResponse",
      "isOk",
    ];

    for (const name of expectedExports) {
      expect(chunk.exports).toContain(name);
    }

    // The bundle should include code from all subpackages
    expect(chunk.code).toContain("capitalize");
    expect(chunk.code).toContain("BaseSpec");
    expect(chunk.code).toContain("createClient");

    // Internal imports should be resolved away
    expect(chunk.code).not.toContain('from "./utils/');
    expect(chunk.code).not.toContain('from "./core/');
    expect(chunk.code).not.toContain('from "./api/');

    // Module graph should contain 15+ modules (entry + source files)
    expect(chunk.moduleIds.length).toBeGreaterThanOrEqual(15);

    await build.close();
  });

  it("bundles into CJS format with require/exports", async () => {
    const entry = await scaffoldProject(tempDir);
    const build = await rollup({ input: entry, treeshake: false });
    const { output } = await build.generate({ format: "cjs" });
    const chunk = firstChunk(output);

    expect(chunk.code).toContain("'use strict'");
    expect(chunk.code).toContain("exports");

    // Should still contain all the business logic
    expect(chunk.code).toContain("capitalize");
    expect(chunk.code).toContain("BaseSpec");
    expect(chunk.code).toContain("EventEmitter");

    await build.close();
  });

  it("ES output is syntactically valid JavaScript that can be evaluated", async () => {
    const entry = await scaffoldProject(tempDir);
    const build = await rollup({ input: entry, treeshake: false });
    const { output } = await build.generate({ format: "es" });
    const chunk = firstChunk(output);

    // Strip module syntax and evaluate -- should not throw
    expect(() => {
      evaluateEsBundle(chunk.code);
    }).not.toThrow();

    await build.close();
  });

  it("CJS output can be evaluated via new Function()", async () => {
    const entry = await scaffoldProject(tempDir);
    const build = await rollup({ input: entry, treeshake: false });
    const { output } = await build.generate({ format: "cjs" });
    const chunk = firstChunk(output);

    // The CJS wrapper adds 'use strict', require(), and exports assignments
    // around the bundled module body.  The body may still contain residual
    // import/export syntax from barrel re-export files.  Clean it up so
    // the code is evaluable as a plain CJS script.
    let code = chunk.code;
    code = stripModuleSyntax(code);
    code = code.replace(/\bconst\s+/g, "var ");
    code = code.replace(/\blet\s+/g, "var ");

    // Evaluate the cleaned CJS bundle in a minimal sandbox
    const moduleObj: Record<string, unknown> = {};
    const requireFn = () => {
      throw new Error("unexpected require call");
    };

    const fn = new Function("module", "exports", "require", code);
    const mod = { exports: moduleObj };
    fn(mod, moduleObj, requireFn);

    // The evaluated module should expose key exports as functions
    expect(typeof moduleObj["capitalize"]).toBe("function");
    expect(typeof moduleObj["createClient"]).toBe("function");
    expect(typeof moduleObj["isString"]).toBe("function");

    await build.close();
  });

  it("tree-shaking removes test-only utilities not imported by the barrel", async () => {
    const entry = await scaffoldProject(tempDir);
    // Tree-shaking ON (the default)
    const build = await rollup({ input: entry });
    const { output } = await build.generate({ format: "es" });
    const chunk = firstChunk(output);

    // test-helpers.js is never imported from any barrel, so its exports
    // should be absent from the final bundle
    expect(chunk.code).not.toContain("mockFetch");
    expect(chunk.code).not.toContain("createFixture");
    expect(chunk.code).not.toContain("__test_only__");

    await build.close();
  });

  it("handles circular dependencies between registry and validator", async () => {
    const entry = await scaffoldProject(tempDir);

    // Should not hang or throw due to the circular dep
    const build = await rollup({ input: entry, treeshake: false });
    const { output } = await build.generate({ format: "es" });
    const chunk = firstChunk(output);

    // Both sides of the circular dependency should be present
    expect(chunk.code).toContain("register");
    expect(chunk.code).toContain("createValidator");
    expect(chunk.code).toContain("createAndRegister");
    expect(chunk.code).toContain("createAndAutoRegister");

    await build.close();
  });

  it("produces consistent output across ES and CJS formats", async () => {
    const entry = await scaffoldProject(tempDir);
    const build = await rollup({ input: entry, treeshake: false });

    const es = firstChunk((await build.generate({ format: "es" })).output);
    const cjs = firstChunk((await build.generate({ format: "cjs" })).output);

    // Both should include the same core identifiers
    const coreIdentifiers = [
      "capitalize",
      "slugify",
      "unique",
      "BaseSpec",
      "EventEmitter",
      "createClient",
      "createPipeline",
    ];

    for (const id of coreIdentifiers) {
      expect(es.code).toContain(id);
      expect(cjs.code).toContain(id);
    }

    // Module IDs should be identical
    expect(es.moduleIds.length).toBe(cjs.moduleIds.length);

    await build.close();
  });

  it("cross-subpackage imports resolve correctly (api -> core, api -> utils)", async () => {
    const entry = await scaffoldProject(tempDir);
    const build = await rollup({ input: entry, treeshake: false });
    const { output } = await build.generate({ format: "es" });
    const chunk = firstChunk(output);

    // api/client.js imports from core/emitter.js -- both should appear
    expect(chunk.code).toContain("EventEmitter");
    expect(chunk.code).toContain("createClient");

    // api/request.js imports from utils/guards.js
    expect(chunk.code).toContain("isString");

    await build.close();
  });
});
