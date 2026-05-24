# JavaScript API

Steamroller exposes a JavaScript API for programmatic bundling, file watching, configuration
helpers, and version information.

> **Note:** Steamroller is pre-implementation. Detailed documentation will be added as features are
> implemented.

## `rollup()`

Creates a bundle from the given input options.

```typescript
import { rollup } from "steamroller";

const bundle = await rollup(inputOptions);
const { output } = await bundle.write(outputOptions);
await bundle.close();
```

### Parameters

| Parameter      | Type           | Description                |
| -------------- | -------------- | -------------------------- |
| `inputOptions` | `InputOptions` | Bundle input configuration |

### Returns

`Promise<RollupBuild>` - A build object with `generate()`, `write()`, and `close()` methods.

---

## `watch()`

Watches input files and rebuilds on changes.

```typescript
import { watch } from "steamroller";

const watcher = watch(watchOptions);

watcher.on("event", (event) => {
  // handle rebuild events
});

watcher.close();
```

### Parameters

| Parameter      | Type                                         | Description         |
| -------------- | -------------------------------------------- | ------------------- |
| `watchOptions` | `RollupWatchOptions \| RollupWatchOptions[]` | Watch configuration |

### Returns

`RollupWatcher` - A watcher instance with event subscription and `close()` methods.

---

## `defineConfig()`

A helper for defining configuration with type inference. Returns the input unchanged.

```typescript
import { defineConfig } from "steamroller";

export default defineConfig({
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "es",
  },
});
```

### Parameters

| Parameter | Type                               | Description             |
| --------- | ---------------------------------- | ----------------------- |
| `config`  | `RollupOptions \| RollupOptions[]` | Configuration object(s) |

### Returns

`RollupOptions | RollupOptions[]` - The same configuration, unchanged.

---

## `VERSION`

A string constant containing the current Steamroller version.

```typescript
import { VERSION } from "steamroller";

console.log(VERSION); // e.g., "0.1.0"
```
