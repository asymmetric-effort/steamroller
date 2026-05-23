# Plugin Development

Steamroller plugins follow the Rollup plugin interface. A plugin is an object with a `name`
property and one or more hook functions.

> **Note:** Steamroller is pre-implementation. Detailed documentation will be added as features are
> implemented.

## Plugin Structure

```typescript
import type { Plugin } from "steamroller";

export const myPlugin = (): Plugin => ({
  name: "my-plugin",

  resolveId(source) {
    // resolve module IDs
  },

  load(id) {
    // load module content
  },

  transform(code, id) {
    // transform module content
  },
});
```

---

## Build Hooks

Build hooks run during the build phase and control how modules are located, loaded, and
transformed.

### `options`

Replaces or manipulates the options object. This is the first hook and has no access to prior
plugin context.

### `buildStart`

Called once at the beginning of a build. Receives the final resolved input options.

### `resolveId`

Resolves an import to a module ID (file path or virtual module). Controls how imports are located.

### `load`

Loads the content of a module given its resolved ID. Returns source code as a string.

### `transform`

Transforms the loaded source code. Can return modified code and an optional source map.

### `moduleParsed`

Called after a module has been fully parsed and its dependencies are known.

### `buildEnd`

Called when the build phase completes, regardless of success or failure.

---

## Output Generation Hooks

Output generation hooks run during `bundle.generate()` or `bundle.write()` and control how chunks
are rendered and written.

### `outputOptions`

Replaces or manipulates the output options object.

### `renderStart`

Called at the beginning of output generation. Receives output and input options.

### `banner` / `footer` / `intro` / `outro`

Return code strings to be included at specific positions in each chunk.

### `renderChunk`

Transforms individual chunk code after it has been rendered.

### `augmentChunkHash`

Adds additional data to be included in the chunk hash calculation.

### `generateBundle`

Called after all chunks have been generated. Can add, modify, or remove files from the output.

### `writeBundle`

Called after all files have been written to disk (only during `bundle.write()`).

### `closeBundle`

Called when `bundle.close()` is invoked. Use for cleanup.

---

## Plugin Context

Within hook functions, `this` provides access to the plugin context object with utility methods.

### `this.emitFile()`

Emits a file (chunk or asset) to be included in the output.

```typescript
const refId = this.emitFile({
  type: "asset",
  fileName: "data.json",
  source: JSON.stringify(data),
});
```

### `this.getFileName()`

Returns the output file name for an emitted file reference.

### `this.resolve()`

Resolves an import using the plugin pipeline.

### `this.parse()`

Parses code into an AST.

### `this.warn()`

Emits a warning message.

### `this.error()`

Emits an error and aborts the build.

---

## Emitted Files

Plugins can emit two types of files:

- **Chunks** - Additional entry points that go through the full bundling pipeline
- **Assets** - Static files included in the output as-is

```typescript
// Emit a chunk
this.emitFile({
  type: "chunk",
  id: "src/worker.ts",
  fileName: "worker.js",
});

// Emit an asset
this.emitFile({
  type: "asset",
  fileName: "manifest.json",
  source: JSON.stringify(manifest),
});
```
