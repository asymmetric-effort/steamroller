# Migration Guide

This guide covers migrating to Steamroller from Rollup or esbuild. Steamroller is a zero-dependency TypeScript reimplementation of Rollup with 100% API compatibility, plus additional features like an esbuild-compatible `build()` API, built-in minification, built-in TypeScript type stripping, and post-bundle validation.

## Table of Contents

- [Migrating from Rollup](#migrating-from-rollup)
  - [Step 1: Install Steamroller](#step-1-install-steamroller)
  - [Step 2: Update Imports](#step-2-update-imports)
  - [Step 3: Update Config Files](#step-3-update-config-files)
  - [Step 4: Update Package Scripts](#step-4-update-package-scripts)
  - [Step 5: Review Plugin Usage](#step-5-review-plugin-usage)
  - [Step 6: Verify Your Build](#step-6-verify-your-build)
- [API Compatibility](#api-compatibility)
  - [rollup()](#rollup)
  - [generate() and write()](#generate-and-write)
  - [watch()](#watch)
  - [parseAst and parseAstAsync](#parseast-and-parseastasync)
  - [defineConfig()](#defineconfig)
  - [VERSION](#version)
- [Config File Compatibility](#config-file-compatibility)
- [Plugin Compatibility](#plugin-compatibility)
  - [Plugins That Work Without Changes](#plugins-that-work-without-changes)
  - [Plugins That May Need Adaptation](#plugins-that-may-need-adaptation)
  - [Plugin Hook Support](#plugin-hook-support)
  - [Plugin Context Methods](#plugin-context-methods)
- [New Features Not in Rollup](#new-features-not-in-rollup)
  - [build() API (esbuild-Compatible)](#build-api-esbuild-compatible)
  - [Built-in Minification](#built-in-minification)
  - [Built-in TypeScript Type Stripping](#built-in-typescript-type-stripping)
  - [Post-Bundle Validation](#post-bundle-validation)
- [Migrating from esbuild](#migrating-from-esbuild)
- [Known Limitations and Differences](#known-limitations-and-differences)
- [Migration Checklist](#migration-checklist)

---

## Migrating from Rollup

Steamroller targets 100% feature parity with Rollup v4.60.4. In most cases, migration is a drop-in replacement: swap the package, update import paths, and your existing config and plugins continue to work.

### Step 1: Install Steamroller

```bash
npm uninstall rollup
npm install --save-dev steamroller
```

### Step 2: Update Imports

Replace all `'rollup'` imports with `'steamroller'`:

```typescript
// Before
import { rollup, watch, defineConfig } from "rollup";
import { parseAst } from "rollup/parseAst";

// After
import { rollup, watch, defineConfig } from "steamroller";
import { parseAst } from "steamroller/parseAst";
```

The sub-path exports match Rollup's layout:

| Rollup Import           | Steamroller Import           |
| ----------------------- | ---------------------------- |
| `rollup`                | `steamroller`                |
| `rollup/parseAst`       | `steamroller/parseAst`       |
| `rollup/parse-ast`      | `steamroller/parse-ast`      |
| `rollup/loadConfigFile` | `steamroller/loadConfigFile` |

### Step 3: Update Config Files

Steamroller reads both `steamroller.config.*` and `rollup.config.*` config files, so renaming is optional. If you want to rename:

```bash
mv rollup.config.js steamroller.config.js
# or
mv rollup.config.mjs steamroller.config.mjs
# or
mv rollup.config.ts steamroller.config.ts
```

The config file format is identical. No changes to the config content are needed:

```javascript
// steamroller.config.js (same format as rollup.config.js)
import { defineConfig } from "steamroller";

export default defineConfig({
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "es",
    sourcemap: true,
  },
});
```

### Step 4: Update Package Scripts

Replace `rollup` with `steamroller` in your `package.json` scripts:

```json
{
  "scripts": {
    "build": "steamroller --config",
    "dev": "steamroller --config --watch"
  }
}
```

The CLI accepts the same flags as Rollup. Common flags include:

| Flag              | Description                         |
| ----------------- | ----------------------------------- |
| `-c, --config`    | Use a config file                   |
| `-i, --input`     | Entry point(s)                      |
| `-o, --file`      | Output file                         |
| `-d, --dir`       | Output directory                    |
| `-f, --format`    | Output format (es, cjs, iife, etc.) |
| `-w, --watch`     | Watch mode                          |
| `-m, --sourcemap` | Generate source maps                |
| `--no-treeshake`  | Disable tree-shaking                |

### Step 5: Review Plugin Usage

Most Rollup plugins work without changes. See [Plugin Compatibility](#plugin-compatibility) below for details.

### Step 6: Verify Your Build

Run your build and compare the output:

```bash
npm run build
```

If you have tests or validation scripts, run them against the Steamroller output to confirm correctness.

---

## API Compatibility

Steamroller exposes the same JavaScript API as Rollup. The following sections document each API function and its compatibility status.

### rollup()

Creates a bundle from input options. This is the core API and is fully compatible with Rollup's `rollup()` function.

```typescript
import { rollup } from "steamroller";

const bundle = await rollup({
  input: "src/main.js",
  plugins: [
    /* ... */
  ],
  external: ["lodash"],
});
```

**Parameters:**

| Parameter      | Type           | Description                     |
| -------------- | -------------- | ------------------------------- |
| `inputOptions` | `InputOptions` | Rollup-compatible input options |

**Returns:** `Promise<RollupBuild>` with `generate()`, `write()`, and `close()` methods.

**Compatibility:** Full. Accepts the same `InputOptions` as Rollup, including `input`, `plugins`, `external`, `treeshake`, `cache`, `onwarn`/`onLog`, `shimMissingExports`, `maxParallelFileOps`, and `perf`.

### generate() and write()

Called on the `RollupBuild` object returned by `rollup()`. Both accept `OutputOptions` and return `{ output }` containing chunks and assets.

```typescript
// In-memory generation
const { output } = await bundle.generate({
  format: "es",
  sourcemap: true,
});

// Write to disk
const { output } = await bundle.write({
  dir: "dist",
  format: "es",
  sourcemap: true,
});

// Always close when done
await bundle.close();
```

**Output options supported:**

- `dir`, `file`, `format` (es, cjs, iife, umd, amd, system)
- `name`, `globals`, `exports`
- `sourcemap` (boolean, `"inline"`, `"hidden"`)
- `banner`, `footer`, `intro`, `outro`
- `paths`, `interop`, `compact`
- `chunkFileNames`, `entryFileNames`, `assetFileNames`

**Compatibility:** Full. Same `OutputOptions` and same return shape (`OutputChunk[]` and `OutputAsset[]`).

### watch()

Creates a file watcher that triggers rebuilds on changes. Fully compatible with Rollup's `watch()` API.

```typescript
import { watch } from "steamroller";

const watcher = watch({
  input: "src/main.js",
  output: {
    dir: "dist",
    format: "es",
  },
});

watcher.on("event", (event) => {
  if (event.code === "BUNDLE_END") {
    console.log(`Build completed in ${event.duration}ms`);
  }
});

// Later: stop watching
watcher.close();
```

**Events:** `event`, `change`, `restart`, `close`.

**Compatibility:** Full. Supports single config or array of configs. Same event types and watcher interface.

### parseAst and parseAstAsync

Parse JavaScript source into an ESTree-compatible AST. Available as both synchronous and asynchronous variants.

```typescript
import { parseAst, parseAstAsync } from "steamroller";

// Synchronous
const ast = parseAst("const x = 1;");

// Asynchronous (with abort support)
const controller = new AbortController();
const ast = await parseAstAsync("const x = 1;", {
  signal: controller.signal,
});
```

**Options:**

| Option                       | Type          | Description                       |
| ---------------------------- | ------------- | --------------------------------- |
| `sourceType`                 | `string`      | `"module"` or `"script"`          |
| `jsx`                        | `boolean`     | Enable JSX parsing (reserved)     |
| `allowReturnOutsideFunction` | `boolean`     | Allow top-level return statements |
| `signal`                     | `AbortSignal` | Abort signal (async only)         |

**Compatibility:** Full. Returns a frozen ESTree `Program` node, same as Rollup's `parseAst`.

### defineConfig()

A type-helper identity function for config files. Returns its input unchanged but provides editor autocompletion and type checking.

```typescript
import { defineConfig } from "steamroller";

// Single config
export default defineConfig({
  input: "src/index.ts",
  output: { dir: "dist", format: "es" },
});

// Array of configs
export default defineConfig([
  { input: "src/index.ts", output: { file: "dist/index.mjs", format: "es" } },
  { input: "src/index.ts", output: { file: "dist/index.cjs", format: "cjs" } },
]);

// Function form
export default defineConfig((cliArgs) => ({
  input: "src/index.ts",
  output: { dir: "dist", format: "es" },
}));
```

**Compatibility:** Full. Accepts single config, array of configs, or config function, same as Rollup.

### VERSION

A string constant containing the current Steamroller version.

```typescript
import { VERSION } from "steamroller";
console.log(VERSION);
```

**Compatibility:** Full. Same export name and type as Rollup's `VERSION`.

---

## Config File Compatibility

Steamroller supports the same config file formats as Rollup:

| File Name                | Supported |
| ------------------------ | --------- |
| `steamroller.config.js`  | Yes       |
| `steamroller.config.mjs` | Yes       |
| `steamroller.config.ts`  | Yes       |
| `steamroller.config.cjs` | Yes       |
| `rollup.config.js`       | Yes       |
| `rollup.config.mjs`      | Yes       |
| `rollup.config.ts`       | Yes       |
| `rollup.config.cjs`      | Yes       |

**Config format features:**

- Default export (single config or array of configs)
- Function export receiving CLI arguments
- `defineConfig()` helper for type safety
- All Rollup input and output options
- Plugin arrays with falsy values filtered automatically

No changes to your config file content are required when migrating from Rollup.

---

## Plugin Compatibility

Steamroller implements the same 27-hook plugin interface as Rollup. Plugins that use documented Rollup hook APIs should work without modification.

### Plugins That Work Without Changes

The following official `@rollup/plugin-*` packages are compatible:

| Plugin                        | Notes                                 |
| ----------------------------- | ------------------------------------- |
| `@rollup/plugin-node-resolve` | Module resolution                     |
| `@rollup/plugin-commonjs`     | CommonJS to ESM conversion            |
| `@rollup/plugin-typescript`   | Full TypeScript compilation           |
| `@rollup/plugin-json`         | Import JSON files                     |
| `@rollup/plugin-replace`      | String replacement                    |
| `@rollup/plugin-terser`       | Terser minification (or use built-in) |
| `@rollup/plugin-alias`        | Module aliasing                       |
| `@rollup/plugin-inject`       | Auto-import globals                   |
| `@rollup/plugin-virtual`      | Virtual modules                       |
| `@rollup/plugin-sucrase`      | Fast TypeScript stripping             |
| `rollup-plugin-esbuild`       | esbuild-based transpilation           |
| `rollup-plugin-swc3`          | SWC-based transpilation               |

### Plugins That May Need Adaptation

Plugins that rely on Rollup internals (undocumented APIs, private module paths, or Rollup-specific AST node types) may need updates. Common cases:

- **Plugins importing from `rollup/dist/*` internal paths** -- these are Rollup implementation details and do not exist in Steamroller.
- **Plugins that monkey-patch the Rollup module** -- will not work since the module identity is different.
- **Plugins that check `this.meta.rollupVersion`** -- Steamroller reports its own version. Use feature detection instead of version checks.

### Plugin Hook Support

All standard Rollup plugin hooks are supported:

**Build Hooks:**

| Hook                   | Type       | Supported |
| ---------------------- | ---------- | --------- |
| `options`              | sync/async | Yes       |
| `buildStart`           | async      | Yes       |
| `resolveId`            | async      | Yes       |
| `load`                 | async      | Yes       |
| `transform`            | async      | Yes       |
| `moduleParsed`         | async      | Yes       |
| `resolveDynamicImport` | async      | Yes       |
| `buildEnd`             | async      | Yes       |

**Output Generation Hooks:**

| Hook               | Type  | Supported |
| ------------------ | ----- | --------- |
| `outputOptions`    | sync  | Yes       |
| `renderStart`      | async | Yes       |
| `banner`           | async | Yes       |
| `footer`           | async | Yes       |
| `intro`            | async | Yes       |
| `outro`            | async | Yes       |
| `renderChunk`      | async | Yes       |
| `augmentChunkHash` | sync  | Yes       |
| `generateBundle`   | async | Yes       |
| `writeBundle`      | async | Yes       |
| `closeBundle`      | async | Yes       |

**Watch Hooks:**

| Hook           | Type | Supported |
| -------------- | ---- | --------- |
| `watchChange`  | sync | Yes       |
| `closeWatcher` | sync | Yes       |

### Plugin Context Methods

Inside hook functions, `this` provides the standard plugin context:

| Method               | Description                            | Supported |
| -------------------- | -------------------------------------- | --------- |
| `this.emitFile()`    | Emit a chunk or asset                  | Yes       |
| `this.getFileName()` | Get emitted file name by reference ID  | Yes       |
| `this.resolve()`     | Resolve an import through the pipeline | Yes       |
| `this.parse()`       | Parse code into an AST                 | Yes       |
| `this.warn()`        | Emit a warning                         | Yes       |
| `this.error()`       | Emit an error and abort                | Yes       |

---

## New Features Not in Rollup

Steamroller adds several features beyond Rollup's API surface.

### build() API (esbuild-Compatible)

Steamroller provides a `build()` function that accepts esbuild-style options and returns esbuild-style results. This makes it possible to replace esbuild with Steamroller by changing a single import.

```typescript
// Before (esbuild)
import { build } from "esbuild";

// After (Steamroller)
import { build } from "steamroller";

await build({
  entryPoints: ["src/index.ts"],
  outdir: "dist",
  format: "esm",
  bundle: true,
  minify: true,
  sourcemap: true,
  target: "es2020",
  external: [],
});
```

**Supported `BuildOptions`:**

| Option        | Type                                | Description                          |
| ------------- | ----------------------------------- | ------------------------------------ |
| `entryPoints` | `string[]`                          | Entry point files                    |
| `outdir`      | `string`                            | Output directory                     |
| `outfile`     | `string`                            | Output file (single entry)           |
| `format`      | `"esm" \| "cjs" \| "iife"`          | Output format                        |
| `bundle`      | `boolean`                           | Bundle dependencies (default: false) |
| `minify`      | `boolean`                           | Minify output (default: false)       |
| `sourcemap`   | `boolean \| "inline" \| "external"` | Source map generation                |
| `target`      | `string`                            | ECMAScript target (e.g., `"es2020"`) |
| `platform`    | `"browser" \| "node" \| "neutral"`  | Target platform                      |
| `external`    | `string[]`                          | External modules                     |

**`BuildResult` shape:**

```typescript
interface BuildResult {
  outputFiles: BuildOutputFile[]; // { path, contents (Uint8Array), text }
  errors: BuildMessage[]; // { text, location? }
  warnings: BuildMessage[]; // { text, location? }
}
```

Internally, `build()` translates esbuild-style options into `rollup()` + `generate()` calls and converts the output back.

### Built-in Minification

Steamroller includes a built-in minifier, removing the need for `@rollup/plugin-terser` or similar plugins for basic minification.

```typescript
import { minify } from "steamroller";

const result = minify(code, {
  removeComments: true, // Remove comments (preserves legal comments)
  collapseWhitespace: true, // Collapse whitespace
  removeUnnecessarySemicolons: true, // Remove semicolons before }
  mangle: false, // Rename local variables
  removeUnnecessaryParentheses: true, // Remove safe unnecessary parens
});
```

When using the `build()` API, set `minify: true` and the built-in minifier is applied automatically via the `compact` output option.

For the Rollup-style API, use the `compact` output option:

```typescript
const { output } = await bundle.generate({
  format: "es",
  compact: true,
});
```

### Built-in TypeScript Type Stripping

Steamroller automatically handles TypeScript source files (`.ts`, `.tsx`) via built-in type stripping, following the same approach as Node 22's `--experimental-strip-types`. No plugin is needed for standard TypeScript.

**What type stripping handles:**

- Type annotations (`const x: string = "hello"`)
- Interfaces and type aliases
- Generics (`function identity<T>(x: T): T`)
- `as` expressions and non-null assertions
- `import type` and `export type` statements
- Function return type annotations
- Optional property markers and `readonly` modifiers

**What requires a plugin (`@rollup/plugin-typescript`):**

- Enums (`enum Direction { Up, Down }`)
- Namespaces (`namespace Util { ... }`)
- Decorators with `emitDecoratorMetadata`
- `const enum` (inlined at compile time)
- Parameter properties (`constructor(private name: string)`)

If your project only uses erasable TypeScript features, you can drop the TypeScript plugin entirely:

```javascript
// steamroller.config.js -- no TypeScript plugin needed
export default {
  input: "src/index.ts",
  output: { dir: "dist", format: "es" },
};
```

See [docs/typescript-strategy.md](typescript-strategy.md) for the full TypeScript support strategy.

### Post-Bundle Validation

Steamroller includes a post-bundle validation system that verifies output correctness. The bundle validator checks:

- **Syntactic validity** -- every output chunk is parseable JavaScript
- **Import specifier resolution** -- import specifiers reference other chunks in the bundle or declared external dependencies
- **Deconflicted name consistency** -- renamed identifiers are consistent across chunks

This runs automatically during `generate()` and `write()`, catching broken output before it reaches production. Validation issues are reported as warnings in the build output.

---

## Migrating from esbuild

If you are migrating from esbuild, the `build()` API provides the smoothest path. The goal is a single-import change:

```typescript
// Before
import { build } from "esbuild";

// After
import { build } from "steamroller";
```

### Example: SpecifyJS-style Build

The following pattern (multiple ESM entries with code splitting, plus per-entry CJS builds) works with both esbuild and Steamroller:

```typescript
import { build } from "steamroller";

const entries = [
  { input: "src/index.ts", name: "mylib" },
  { input: "src/server/index.ts", name: "mylib-server" },
];

// ESM with code splitting
await build({
  entryPoints: entries.map((e) => e.input),
  outdir: "dist/esm",
  format: "esm",
  bundle: true,
  minify: true,
  sourcemap: true,
  target: "es2020",
  banner: { js: "/* copyright */" },
  external: [],
});

// CJS (per-entry, no splitting)
for (const { input, name } of entries) {
  await build({
    entryPoints: [input],
    outfile: `dist/${name}.cjs.js`,
    format: "cjs",
    bundle: true,
    minify: true,
    sourcemap: true,
    target: "es2020",
    banner: { js: "/* copyright */" },
    external: [],
  });
}
```

### esbuild Options Not Yet Supported

The following esbuild-specific options do not have direct equivalents in Steamroller's `build()` API:

| esbuild Option    | Status            | Workaround                                              |
| ----------------- | ----------------- | ------------------------------------------------------- |
| `splitting`       | Not yet supported | Use `rollup()` API with `output.dir` for code splitting |
| `chunkNames`      | Not yet supported | Use `rollup()` API with `output.chunkFileNames`         |
| `banner`/`footer` | Planned (#263)    | Use `rollup()` API with `output.banner`/`output.footer` |
| `define`          | Not supported     | Use `@rollup/plugin-replace`                            |
| `loader`          | Not applicable    | Use Rollup plugins for custom loaders                   |
| `jsx`             | Not yet supported | Use `@rollup/plugin-typescript` or similar              |
| `tsconfig`        | Not applicable    | Run `tsc` separately for type checking                  |
| `write`           | Not supported     | `build()` always returns in-memory; write manually      |
| `metafile`        | Not supported     | Use `rollup()` API for detailed build metadata          |

---

## Known Limitations and Differences

### Pre-release Status

Steamroller is under active development and not yet at v1.0. The core pipeline is functional but some features tracked in the issue tracker are still in progress. Check the [GitHub issues](https://github.com/asymmetric-effort/steamroller/issues) for current status.

### Intentional Differences from Rollup

| Area                   | Difference                                                                       |
| ---------------------- | -------------------------------------------------------------------------------- |
| Implementation         | Pure TypeScript, zero runtime dependencies (Rollup uses native code for parsing) |
| Error messages         | Warning and error text will differ from Rollup                                   |
| Performance            | Performance characteristics may differ; some operations may be faster or slower  |
| TypeScript support     | Built-in type stripping (Rollup requires a plugin)                               |
| Minification           | Built-in minifier (Rollup requires a plugin)                                     |
| Post-bundle validation | Built-in validation checks (not available in Rollup)                             |
| `build()` API          | esbuild-compatible API (not available in Rollup)                                 |
| AST parser             | Custom JavaScript parser (Rollup uses SWC/Acorn)                                 |

### In-Progress Features (Phase 1)

The following features are tracked for the first consumer adoption milestone:

| Feature                          | Issue | Notes                                          |
| -------------------------------- | ----- | ---------------------------------------------- |
| ESM code splitting               | #256  | Shared chunks for multiple entry points        |
| Built-in minification            | #258  | Basic minifier exists; production hardening    |
| Banner/footer injection          | #263  | `output.banner` and `output.footer` in build() |
| Source map composition           | #262  | Multi-step source map merging                  |
| Target option (es2020)           | #265  | Downleveling to older ES targets               |
| Post-build validation            | #261  | `verify-build` integration                     |
| Zero-tolerance output validation | #266  | Strict correctness checks                      |
| npm publish (v0.1.0)             | #257  | First publishable release                      |
| Declaration file generation      | #267  | `.d.ts` generation pattern                     |

### Behavioral Notes

- **Tree-shaking:** Steamroller performs statement-level tree-shaking with scope analysis, pure annotations, and cross-module binding tracing. Results should be equivalent to Rollup but may differ at the edges for highly dynamic code.
- **Source maps:** Steamroller composes source maps through its own VLQ encoder/decoder and `MagicString` implementation. Map output may have minor structural differences while remaining functionally equivalent.
- **Config loading:** Steamroller reads `rollup.config.*` files for backward compatibility, but prefers `steamroller.config.*` if both exist.
- **Cache:** The `cache` option is accepted for API compatibility. Cache behavior may differ from Rollup's implementation.

---

## Migration Checklist

Use this checklist to track your migration progress:

### Package Setup

- [ ] Uninstall Rollup: `npm uninstall rollup`
- [ ] Install Steamroller: `npm install --save-dev steamroller`
- [ ] Update `package.json` scripts (replace `rollup` with `steamroller`)

### Code Changes

- [ ] Update all `import { ... } from 'rollup'` to `import { ... } from 'steamroller'`
- [ ] Update all `import { ... } from 'rollup/parseAst'` to `import { ... } from 'steamroller/parseAst'`
- [ ] Rename config file (optional): `rollup.config.*` to `steamroller.config.*`
- [ ] Update `defineConfig` import in config file (if renaming)

### Plugin Review

- [ ] Verify all plugins use documented hook APIs (not Rollup internals)
- [ ] Check for plugins that inspect `this.meta.rollupVersion`
- [ ] Consider removing `@rollup/plugin-terser` (Steamroller has built-in minification)
- [ ] Consider removing TypeScript plugin if only using erasable TS features

### Validation

- [ ] Run the build and verify it completes without errors
- [ ] Compare output bundle sizes with previous Rollup output
- [ ] Run your test suite against the new bundles
- [ ] Verify source maps work in your debugger/error tracking
- [ ] Check that all import paths resolve correctly in the output
- [ ] Test in target environments (browser, Node.js, etc.)

### Optional: Adopt New Features

- [ ] Try built-in minification (`compact: true` or `minify: true` in `build()`)
- [ ] Try built-in TypeScript type stripping (remove TS plugin for simple projects)
- [ ] Try the `build()` API for esbuild-style workflows
- [ ] Enable post-bundle validation to catch output issues early
