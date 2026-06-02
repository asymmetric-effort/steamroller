/**
 * Behavioral parity tests verifying steamroller produces correct output
 * for common Rollup patterns. Each test creates temporary input files,
 * runs rollup() + generate(), and verifies the output code.
 *
 * Ported from Rollup's test fixture patterns per issue #246.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rollup } from "../../../src/rollup.js";
import type { OutputChunk, RollupLog } from "../../../src/types.js";

/** Normalize Windows backslashes to forward slashes for cross-platform comparison. */
const norm = (p: string): string => p.replace(/\\/g, "/");

/** Extract the first chunk from output. */
const getChunk = (
  output: readonly [OutputChunk, ...(OutputChunk | { type: string })[]],
): OutputChunk => {
  const chunk = output[0];
  if (chunk.type !== "chunk") {
    throw new Error("Expected first output item to be a chunk");
  }
  return chunk as OutputChunk;
};

describe("rollup-suite behavioral parity", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "steamroller-compat-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ----------------------------------------------------------------
  // 1. Simple re-exports: export { x } from './y'
  // ----------------------------------------------------------------
  describe("simple re-exports", () => {
    it("re-exports a named binding from another module", async () => {
      await writeFile(
        join(tempDir, "utils.js"),
        "export const add = (a, b) => a + b;\n",
      );
      await writeFile(
        join(tempDir, "index.js"),
        ['import { add } from "./utils.js";', "export { add };", ""].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      // The dependency module's code should be inlined
      expect(chunk.code).toContain("add");
      expect(chunk.code).toContain("a + b");
      // The binding should be listed in exports
      expect(chunk.exports).toContain("add");
      await build.close();
    });

    it("re-exports multiple named bindings", async () => {
      await writeFile(
        join(tempDir, "math.js"),
        [
          "export const add = (a, b) => a + b;",
          "export const mul = (a, b) => a * b;",
          "export const sub = (a, b) => a - b;",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "index.js"),
        [
          'import { add, mul } from "./math.js";',
          "export { add, mul };",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      expect(chunk.exports).toContain("add");
      expect(chunk.exports).toContain("mul");
      expect(chunk.code).toContain("a + b");
      expect(chunk.code).toContain("a * b");
      await build.close();
    });

    it("re-exports with renaming", async () => {
      await writeFile(join(tempDir, "lib.js"), "export const foo = 42;\n");
      await writeFile(
        join(tempDir, "index.js"),
        ['import { foo } from "./lib.js";', "export { foo as bar };", ""].join(
          "\n",
        ),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      expect(chunk.code).toContain("42");
      await build.close();
    });

    it("export-from syntax produces output with the re-export", async () => {
      await writeFile(
        join(tempDir, "origin.js"),
        "export const value = 'from-origin';\n",
      );
      await writeFile(
        join(tempDir, "index.js"),
        'export { value } from "./origin.js";\n',
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });

      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      // The re-exported binding should be listed in exports
      expect(chunk.exports).toContain("value");
      // The entry module should be in watchFiles
      const watchFiles = build.watchFiles.map(norm);
      expect(watchFiles).toContain(norm(join(tempDir, "index.js")));
      await build.close();
    });
  });

  // ----------------------------------------------------------------
  // 2. Namespace imports: import * as ns from './y'
  // ----------------------------------------------------------------
  describe("namespace imports", () => {
    it("bundles namespace import into a single chunk", async () => {
      await writeFile(
        join(tempDir, "constants.js"),
        ["export const WIDTH = 800;", "export const HEIGHT = 600;", ""].join(
          "\n",
        ),
      );
      await writeFile(
        join(tempDir, "index.js"),
        [
          'import * as C from "./constants.js";',
          "export const area = C.WIDTH * C.HEIGHT;",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      // The constants module content should be inlined
      expect(chunk.code).toContain("800");
      expect(chunk.code).toContain("600");
      expect(chunk.code).toContain("area");
      await build.close();
    });

    it("namespace import resolves all exported members", async () => {
      await writeFile(
        join(tempDir, "data.js"),
        [
          "export const x = 1;",
          "export const y = 2;",
          "export const z = 3;",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "index.js"),
        [
          'import * as data from "./data.js";',
          "export const sum = data.x + data.y + data.z;",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      expect(chunk.code).toContain("1");
      expect(chunk.code).toContain("2");
      expect(chunk.code).toContain("3");
      await build.close();
    });
  });

  // ----------------------------------------------------------------
  // 3. Default + named exports combined
  // ----------------------------------------------------------------
  describe("default + named exports combined", () => {
    it("bundles module with both default and named exports", async () => {
      await writeFile(
        join(tempDir, "greeter.js"),
        [
          "export const version = '1.0';",
          "const greet = (name) => `Hello, ${name}!`;",
          "export default greet;",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "index.js"),
        [
          'import greet, { version } from "./greeter.js";',
          "export { greet, version };",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      expect(chunk.code).toContain("1.0");
      expect(chunk.code).toContain("Hello");
      await build.close();
    });

    it("default export function is preserved", async () => {
      await writeFile(
        join(tempDir, "util.js"),
        [
          "export default function double(n) { return n * 2; }",
          "export const label = 'double';",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "index.js"),
        [
          'import double, { label } from "./util.js";',
          "export { double, label };",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      expect(chunk.code).toContain("n * 2");
      expect(chunk.code).toContain("double");
      await build.close();
    });
  });

  // ----------------------------------------------------------------
  // 4. Circular dependencies (should warn but not fail)
  // ----------------------------------------------------------------
  describe("circular dependencies", () => {
    it("handles circular imports without failing", async () => {
      await writeFile(
        join(tempDir, "a.js"),
        [
          'import { bValue } from "./b.js";',
          "export const aValue = 'A';",
          "export const combined = aValue + bValue;",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "b.js"),
        [
          'import { aValue } from "./a.js";',
          "export const bValue = 'B';",
          "export const pair = aValue + bValue;",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "index.js"),
        ['import { combined } from "./a.js";', "export { combined };", ""].join(
          "\n",
        ),
      );

      const warnings: Array<RollupLog> = [];
      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
        onLog(_level, log) {
          warnings.push(log);
        },
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      // Build should succeed despite circular dependency
      expect(chunk.type).toBe("chunk");
      expect(chunk.code).toBeDefined();

      // Should emit a circular dependency warning
      const hasCircularWarning = warnings.some(
        (w) =>
          w.code === "CIRCULAR_DEPENDENCY" ||
          w.message.toLowerCase().includes("circular"),
      );
      expect(hasCircularWarning).toBe(true);
      await build.close();
    });

    it("produces output that contains declarations from both sides of the cycle", async () => {
      await writeFile(
        join(tempDir, "even.js"),
        [
          'import { isOdd } from "./odd.js";',
          "export const isEven = (n) => n === 0 ? true : isOdd(n - 1);",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "odd.js"),
        [
          'import { isEven } from "./even.js";',
          "export const isOdd = (n) => n === 0 ? false : isEven(n - 1);",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "index.js"),
        ['import { isEven } from "./even.js";', "export { isEven };", ""].join(
          "\n",
        ),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      // Both isEven and isOdd should appear in the bundled output
      expect(chunk.code).toContain("isEven");
      expect(chunk.code).toContain("isOdd");
      await build.close();
    });
  });

  // ----------------------------------------------------------------
  // 5. Dynamic imports producing separate chunks
  // ----------------------------------------------------------------
  describe("dynamic imports produce separate chunks", () => {
    it("splits dynamic import into its own chunk", async () => {
      await writeFile(
        join(tempDir, "lazy.js"),
        "export const lazy = 'loaded-lazily';\n",
      );
      await writeFile(
        join(tempDir, "index.js"),
        [
          'const loadLazy = () => import("./lazy.js");',
          "export { loadLazy };",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es", dir: "dist" });

      const chunks = output.filter(
        (o) => o.type === "chunk",
      ) as Array<OutputChunk>;
      expect(chunks.length).toBeGreaterThanOrEqual(2);

      const entryChunk = chunks.find((c) => c.isEntry);
      const dynamicChunk = chunks.find((c) => c.isDynamicEntry);

      expect(entryChunk).toBeDefined();
      expect(dynamicChunk).toBeDefined();

      // Dynamic chunk should contain the lazy module's code
      expect(dynamicChunk!.code).toContain("loaded-lazily");

      // Entry chunk should NOT contain the lazy module's code
      expect(entryChunk!.code).not.toContain("loaded-lazily");

      // Entry chunk should reference the dynamic chunk via import()
      expect(entryChunk!.code).toContain("import(");
      await build.close();
    });

    it("static dependencies remain in the entry chunk alongside dynamic splits", async () => {
      await writeFile(
        join(tempDir, "static-dep.js"),
        "export const dep = 'static-value';\n",
      );
      await writeFile(
        join(tempDir, "dynamic-dep.js"),
        "export const dyn = 'dynamic-value';\n",
      );
      await writeFile(
        join(tempDir, "index.js"),
        [
          'import { dep } from "./static-dep.js";',
          'const loadDyn = () => import("./dynamic-dep.js");',
          "export { dep, loadDyn };",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es", dir: "dist" });

      const chunks = output.filter(
        (o) => o.type === "chunk",
      ) as Array<OutputChunk>;
      const entryChunk = chunks.find((c) => c.isEntry)!;
      const dynamicChunk = chunks.find((c) => c.isDynamicEntry)!;

      // Static dep is in the entry chunk
      expect(entryChunk.code).toContain("static-value");
      // Dynamic dep is in the dynamic chunk
      expect(dynamicChunk.code).toContain("dynamic-value");
      // Static dep is NOT in the dynamic chunk
      expect(dynamicChunk.code).not.toContain("static-value");
      await build.close();
    });
  });

  // ----------------------------------------------------------------
  // 6. Tree-shaking removes unused exports
  // ----------------------------------------------------------------
  describe("tree-shaking removes unused exports", () => {
    it("removes unused named exports from dependencies", async () => {
      await writeFile(
        join(tempDir, "helpers.js"),
        [
          "export const used = 'keep-me';",
          "export const unused = 'remove-me';",
          "export const alsoUnused = 'also-remove';",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "index.js"),
        [
          'import { used } from "./helpers.js";',
          "export const result = used;",
          "",
        ].join("\n"),
      );

      const build = await rollup({ input: join(tempDir, "index.js") });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      expect(chunk.code).toContain("keep-me");
      expect(chunk.code).not.toContain("remove-me");
      expect(chunk.code).not.toContain("also-remove");
      await build.close();
    });

    it("preserves side-effectful statements even when exports are unused", async () => {
      await writeFile(
        join(tempDir, "side-effects.js"),
        [
          "console.log('initializing');",
          "export const unused = 'not-used';",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "index.js"),
        [
          'import "./side-effects.js";',
          "export const main = 'entry';",
          "",
        ].join("\n"),
      );

      const build = await rollup({ input: join(tempDir, "index.js") });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      // Side effect must be preserved
      expect(chunk.code).toContain("console.log");
      expect(chunk.code).toContain("initializing");
      await build.close();
    });

    it("includes everything when treeshake is disabled", async () => {
      await writeFile(
        join(tempDir, "all.js"),
        [
          "export const a = 'alpha';",
          "export const b = 'beta';",
          "export const c = 'gamma';",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "index.js"),
        ['import { a } from "./all.js";', "export const result = a;", ""].join(
          "\n",
        ),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      // With treeshake off, all exports should be present
      expect(chunk.code).toContain("alpha");
      expect(chunk.code).toContain("beta");
      expect(chunk.code).toContain("gamma");
      await build.close();
    });
  });

  // ----------------------------------------------------------------
  // 7. External modules preserved in output
  // ----------------------------------------------------------------
  describe("external modules preserved in output", () => {
    it("preserves external import statements in ES format", async () => {
      await writeFile(
        join(tempDir, "index.js"),
        [
          'import { readFile } from "node:fs/promises";',
          "export const read = readFile;",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        external: ["node:fs/promises"],
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      // External import should remain in the output
      expect(chunk.code).toContain("node:fs/promises");
      expect(chunk.code).toContain("import");
      // External module should appear in the imports list
      expect(chunk.imports).toContain("node:fs/promises");
      await build.close();
    });

    it("preserves multiple external modules", async () => {
      await writeFile(
        join(tempDir, "index.js"),
        [
          'import { readFile } from "node:fs/promises";',
          'import { resolve } from "node:path";',
          "export const load = (p) => readFile(resolve(p));",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        external: ["node:fs/promises", "node:path"],
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      expect(chunk.imports).toContain("node:fs/promises");
      expect(chunk.imports).toContain("node:path");
      expect(chunk.code).toContain("node:fs/promises");
      expect(chunk.code).toContain("node:path");
      await build.close();
    });

    it("external function predicate marks modules as external", async () => {
      await writeFile(
        join(tempDir, "index.js"),
        [
          'import { join } from "node:path";',
          "export const p = join('a', 'b');",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "index.js"),
        external: (id) => id.startsWith("node:"),
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      expect(chunk.imports).toContain("node:path");
      expect(chunk.code).toContain("node:path");
      await build.close();
    });
  });

  // ----------------------------------------------------------------
  // 8. Multiple entry points with shared dependencies
  // ----------------------------------------------------------------
  describe("multiple entry points with shared dependencies", () => {
    it("resolves all entry points and their shared dependencies", async () => {
      await mkdir(join(tempDir, "lib"), { recursive: true });
      await writeFile(
        join(tempDir, "lib", "shared.js"),
        "export const shared = 'shared-value';\n",
      );
      await writeFile(
        join(tempDir, "entry-a.js"),
        [
          'import { shared } from "./lib/shared.js";',
          "export const a = shared + '-a';",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "entry-b.js"),
        [
          'import { shared } from "./lib/shared.js";',
          "export const b = shared + '-b';",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: [join(tempDir, "entry-a.js"), join(tempDir, "entry-b.js")],
        treeshake: false,
      });

      // All three modules should be tracked
      const watchFiles = build.watchFiles.map(norm);
      expect(watchFiles).toContain(norm(join(tempDir, "entry-a.js")));
      expect(watchFiles).toContain(norm(join(tempDir, "entry-b.js")));
      expect(watchFiles).toContain(norm(join(tempDir, "lib", "shared.js")));
      await build.close();
    });

    it("generates output that includes shared dependency code", async () => {
      await writeFile(
        join(tempDir, "shared.js"),
        "export const common = 'shared-code';\n",
      );
      await writeFile(
        join(tempDir, "main.js"),
        [
          'import { common } from "./shared.js";',
          "export const main = common + '-main';",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: join(tempDir, "main.js"),
        treeshake: false,
      });
      const { output } = await build.generate({ format: "es" });
      const chunk = getChunk(output);

      expect(chunk.code).toContain("shared-code");
      expect(chunk.code).toContain("main");
      await build.close();
    });

    it("handles named entry points via object input", async () => {
      await writeFile(join(tempDir, "shared.js"), "export const val = 100;\n");
      await writeFile(
        join(tempDir, "app.js"),
        [
          'import { val } from "./shared.js";',
          "export const app = val;",
          "",
        ].join("\n"),
      );
      await writeFile(
        join(tempDir, "worker.js"),
        [
          'import { val } from "./shared.js";',
          "export const worker = val * 2;",
          "",
        ].join("\n"),
      );

      const build = await rollup({
        input: {
          app: join(tempDir, "app.js"),
          worker: join(tempDir, "worker.js"),
        },
        treeshake: false,
      });

      const watchFiles = build.watchFiles.map(norm);
      expect(watchFiles).toContain(norm(join(tempDir, "app.js")));
      expect(watchFiles).toContain(norm(join(tempDir, "worker.js")));
      expect(watchFiles).toContain(norm(join(tempDir, "shared.js")));
      await build.close();
    });
  });
});
