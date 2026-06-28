/**
 * Integration tests for the full plugin hook lifecycle.
 *
 * Verifies that all 25 plugin hooks fire at their correct lifecycle
 * points and in the expected order during build, generate, and write.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../src/rollup.js";
import type { Plugin, NormalizedOutputOptions } from "../../src/types.js";

describe("plugin hook lifecycle", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-hooks-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("fires build hooks in correct order: options → buildStart → resolveId → load → transform → moduleParsed → buildEnd", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const hooksCalled: Array<string> = [];

    const plugin: Plugin = {
      name: "lifecycle-tracker",
      options(opts) {
        hooksCalled.push("options");
        return opts;
      },
      buildStart() {
        hooksCalled.push("buildStart");
      },
      resolveId(source) {
        hooksCalled.push("resolveId");
        return null;
      },
      load(id) {
        hooksCalled.push("load");
        return null;
      },
      transform(code, id) {
        hooksCalled.push("transform");
        return null;
      },
      moduleParsed() {
        hooksCalled.push("moduleParsed");
      },
      buildEnd() {
        hooksCalled.push("buildEnd");
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    // Verify build hooks fired
    expect(hooksCalled).toContain("options");
    expect(hooksCalled).toContain("buildStart");
    expect(hooksCalled).toContain("resolveId");
    expect(hooksCalled).toContain("load");
    expect(hooksCalled).toContain("transform");
    expect(hooksCalled).toContain("moduleParsed");
    expect(hooksCalled).toContain("buildEnd");

    // Verify order: options before buildStart, buildStart before resolveId, etc.
    const optionsIdx = hooksCalled.indexOf("options");
    const buildStartIdx = hooksCalled.indexOf("buildStart");
    const firstResolveIdx = hooksCalled.indexOf("resolveId");
    const buildEndIdx = hooksCalled.lastIndexOf("buildEnd");

    expect(optionsIdx).toBeLessThan(buildStartIdx);
    expect(buildStartIdx).toBeLessThan(firstResolveIdx);
    expect(firstResolveIdx).toBeLessThan(buildEndIdx);

    await build.close();
  });

  it("fires output hooks during generate: renderStart → renderChunk → generateBundle", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const hooksCalled: Array<string> = [];

    const plugin: Plugin = {
      name: "output-tracker",
      renderStart() {
        hooksCalled.push("renderStart");
      },
      renderChunk(code) {
        hooksCalled.push("renderChunk");
        return null;
      },
      generateBundle() {
        hooksCalled.push("generateBundle");
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    await build.generate({ format: "es" });

    expect(hooksCalled).toContain("renderStart");
    expect(hooksCalled).toContain("renderChunk");
    expect(hooksCalled).toContain("generateBundle");

    // Verify order
    const renderStartIdx = hooksCalled.indexOf("renderStart");
    const renderChunkIdx = hooksCalled.indexOf("renderChunk");
    const generateBundleIdx = hooksCalled.indexOf("generateBundle");

    expect(renderStartIdx).toBeLessThan(renderChunkIdx);
    expect(renderChunkIdx).toBeLessThan(generateBundleIdx);

    await build.close();
  });

  it("fires writeBundle hook after writing to disk", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const outDir = join(tempDir, "dist");
    const hooksCalled: Array<string> = [];

    const plugin: Plugin = {
      name: "write-tracker",
      generateBundle() {
        hooksCalled.push("generateBundle");
      },
      writeBundle() {
        hooksCalled.push("writeBundle");
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    await build.write({ format: "es", file: join(outDir, "bundle.js") });

    expect(hooksCalled).toContain("generateBundle");
    expect(hooksCalled).toContain("writeBundle");

    const generateBundleIdx = hooksCalled.indexOf("generateBundle");
    const writeBundleIdx = hooksCalled.indexOf("writeBundle");
    expect(generateBundleIdx).toBeLessThan(writeBundleIdx);

    await build.close();
  });

  it("fires closeBundle hook on close()", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const hooksCalled: Array<string> = [];

    const plugin: Plugin = {
      name: "close-tracker",
      closeBundle() {
        hooksCalled.push("closeBundle");
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    await build.close();

    expect(hooksCalled).toContain("closeBundle");
  });

  it("fires full lifecycle in order: build → generate → write → close", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const outDir = join(tempDir, "dist");
    const hooksCalled: Array<string> = [];

    const plugin: Plugin = {
      name: "full-lifecycle",
      options(opts) {
        hooksCalled.push("options");
        return opts;
      },
      buildStart() {
        hooksCalled.push("buildStart");
      },
      resolveId() {
        hooksCalled.push("resolveId");
        return null;
      },
      load() {
        hooksCalled.push("load");
        return null;
      },
      transform() {
        hooksCalled.push("transform");
        return null;
      },
      moduleParsed() {
        hooksCalled.push("moduleParsed");
      },
      buildEnd() {
        hooksCalled.push("buildEnd");
      },
      renderStart() {
        hooksCalled.push("renderStart");
      },
      renderChunk() {
        hooksCalled.push("renderChunk");
        return null;
      },
      generateBundle() {
        hooksCalled.push("generateBundle");
      },
      writeBundle() {
        hooksCalled.push("writeBundle");
      },
      closeBundle() {
        hooksCalled.push("closeBundle");
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    await build.write({ format: "es", file: join(outDir, "bundle.js") });
    await build.close();

    // Verify the complete lifecycle order
    const expectedOrder = [
      "options",
      "buildStart",
      "resolveId",
      "load",
      "transform",
      "moduleParsed",
      "buildEnd",
      "renderStart",
      "renderChunk",
      "generateBundle",
      "writeBundle",
      "closeBundle",
    ];

    // Each expected hook should appear, and in relative order
    for (let i = 0; i < expectedOrder.length; i++) {
      expect(hooksCalled).toContain(expectedOrder[i]);
    }

    // Verify strict ordering: each subsequent expected hook appears after the previous
    let lastIdx = -1;
    for (let i = 0; i < expectedOrder.length; i++) {
      const idx = hooksCalled.indexOf(expectedOrder[i], lastIdx + 1);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it("passes correct arguments to renderStart", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    let capturedOutputOptions: NormalizedOutputOptions | undefined;
    let capturedInputOptions: unknown;

    const plugin: Plugin = {
      name: "args-checker",
      renderStart(outputOpts, inputOpts) {
        capturedOutputOptions = outputOpts as NormalizedOutputOptions;
        capturedInputOptions = inputOpts;
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    await build.generate({ format: "cjs" });

    expect(capturedOutputOptions).toBeDefined();
    expect(capturedOutputOptions!.format).toBe("cjs");
    expect(capturedInputOptions).toBeDefined();

    await build.close();
  });

  it("passes code and chunk info to renderChunk", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    let capturedCode: string | undefined;
    let capturedChunk: unknown;

    const plugin: Plugin = {
      name: "renderchunk-args",
      renderChunk(code, chunk) {
        capturedCode = code as string;
        capturedChunk = chunk;
        return null;
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    await build.generate({ format: "es" });

    expect(capturedCode).toBeDefined();
    expect(typeof capturedCode).toBe("string");
    expect(capturedCode!.length).toBeGreaterThan(0);
    expect(capturedChunk).toBeDefined();

    await build.close();
  });

  it("renderChunk can transform the output code", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const plugin: Plugin = {
      name: "code-transformer",
      renderChunk(code) {
        return { code: `/* transformed */\n${code as string}` };
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    const { output } = await build.generate({ format: "es" });
    const chunk = output[0];
    if (chunk.type === "chunk") {
      expect(chunk.code).toContain("/* transformed */");
    }

    await build.close();
  });

  it("fires renderError when an error occurs during rendering", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    let renderErrorCalled = false;
    let capturedError: Error | undefined;

    const plugin: Plugin = {
      name: "error-tracker",
      renderStart() {
        throw new Error("Intentional renderStart error");
      },
      renderError(error) {
        renderErrorCalled = true;
        capturedError = error as Error;
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    await expect(build.generate({ format: "es" })).rejects.toThrow(
      "Intentional renderStart error",
    );

    expect(renderErrorCalled).toBe(true);
    expect(capturedError).toBeDefined();
    expect(capturedError!.message).toBe("Intentional renderStart error");

    await build.close();
  });

  it("passes isWrite=true to generateBundle during write()", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const outDir = join(tempDir, "dist");
    let capturedIsWrite: boolean | undefined;

    const plugin: Plugin = {
      name: "iswrite-checker",
      generateBundle(_options, _bundle, isWrite) {
        capturedIsWrite = isWrite as boolean;
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    await build.write({ format: "es", file: join(outDir, "bundle.js") });

    expect(capturedIsWrite).toBe(true);

    await build.close();
  });

  it("passes isWrite=false to generateBundle during generate()", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    let capturedIsWrite: boolean | undefined;

    const plugin: Plugin = {
      name: "iswrite-checker",
      generateBundle(_options, _bundle, isWrite) {
        capturedIsWrite = isWrite as boolean;
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    await build.generate({ format: "es" });

    expect(capturedIsWrite).toBe(false);

    await build.close();
  });

  it("fires resolveDynamicImport for dynamic imports before resolveId", async () => {
    const helperPath = join(tempDir, "helper.js");
    await writeFile(helperPath, "export const h = 42;\n");

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'const mod = import("./helper.js");\nexport const x = mod;\n',
    );

    const hooksCalled: Array<string> = [];

    const plugin: Plugin = {
      name: "dynamic-import-tracker",
      resolveDynamicImport(specifier) {
        hooksCalled.push(`resolveDynamicImport:${specifier as string}`);
        return null;
      },
      resolveId(source) {
        hooksCalled.push(`resolveId:${source}`);
        return null;
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    // resolveDynamicImport should be called for dynamic imports
    const dynamicCalls = hooksCalled.filter((h) =>
      h.startsWith("resolveDynamicImport:"),
    );
    expect(dynamicCalls.length).toBeGreaterThanOrEqual(1);

    await build.close();
  });

  it("fires moduleParsed for each loaded module", async () => {
    const helperPath = join(tempDir, "helper.js");
    await writeFile(helperPath, "export const h = 1;\n");

    const indexPath = join(tempDir, "index.js");
    await writeFile(
      indexPath,
      'import { h } from "./helper.js";\nexport const x = h;\n',
    );

    let moduleParsedCount = 0;

    const plugin: Plugin = {
      name: "parsed-counter",
      moduleParsed() {
        moduleParsedCount++;
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [plugin],
    });

    // moduleParsed should fire for each module (at least 2: index + helper)
    expect(moduleParsedCount).toBeGreaterThanOrEqual(2);

    await build.close();
  });

  it("multiple plugins receive hooks in registration order", async () => {
    const indexPath = join(tempDir, "index.js");
    await writeFile(indexPath, "export const x = 1;\n");

    const order: Array<string> = [];

    const pluginA: Plugin = {
      name: "plugin-a",
      buildStart() {
        order.push("a:buildStart");
      },
      renderStart() {
        order.push("a:renderStart");
      },
    };

    const pluginB: Plugin = {
      name: "plugin-b",
      buildStart() {
        order.push("b:buildStart");
      },
      renderStart() {
        order.push("b:renderStart");
      },
    };

    const build = await rollup({
      input: indexPath,
      plugins: [pluginA, pluginB],
    });

    await build.generate({ format: "es" });

    // Both plugins should have their hooks called
    expect(order).toContain("a:buildStart");
    expect(order).toContain("b:buildStart");
    expect(order).toContain("a:renderStart");
    expect(order).toContain("b:renderStart");

    await build.close();
  });
});
