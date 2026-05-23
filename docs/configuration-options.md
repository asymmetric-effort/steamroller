# Configuration Options

This page documents all input and output configuration options for Steamroller.

> **Note:** Steamroller is pre-implementation. Detailed documentation will be added as features are
> implemented.

## Input Options

### `input`

The entry point(s) for the bundle.

```typescript
// Single entry
input: "src/index.ts"

// Multiple entries
input: ["src/index.ts", "src/cli.ts"]

// Named entries
input: { main: "src/index.ts", cli: "src/cli.ts" }
```

**Type:** `string | string[] | Record<string, string>`

---

### `plugins`

An array of plugins to use during bundling.

```typescript
plugins: [resolve(), commonjs()]
```

**Type:** `(Plugin | null | false | undefined)[]`

---

### `external`

Modules to treat as external (not included in the bundle).

```typescript
// Array of module IDs
external: ["lodash", "react"]

// Function
external: (id) => id.startsWith("node:")
```

**Type:** `string[] | RegExp[] | ((id: string) => boolean)`

---

### `onwarn`

Handler for warning messages during bundling.

**Type:** `(warning: RollupWarning, defaultHandler: (warning: RollupWarning) => void) => void`

---

### `cache`

The cache from a previous build to speed up subsequent builds.

**Type:** `RollupCache | false`

---

### `treeshake`

Controls tree-shaking behavior.

**Type:** `boolean | TreeshakingOptions`

---

## Output Options

### `dir`

The directory for output chunks when code-splitting.

**Type:** `string`

---

### `file`

The output file path for single-file builds.

**Type:** `string`

---

### `format`

The output format.

**Type:** `"es" | "cjs" | "iife" | "umd" | "amd" | "system"`

---

### `name`

The global variable name for `iife` and `umd` builds.

**Type:** `string`

---

### `globals`

Global variable names for external modules in `iife` and `umd` builds.

```typescript
globals: {
  jquery: "$",
  react: "React",
}
```

**Type:** `Record<string, string> | ((id: string) => string)`

---

### `sourcemap`

Controls source map generation.

**Type:** `boolean | "inline" | "hidden"`

---

### `banner` / `footer`

Code to prepend or append to the bundle.

**Type:** `string | (() => string | Promise<string>)`

---

### `intro` / `outro`

Code to insert inside the wrapper (after the banner, before the footer).

**Type:** `string | (() => string | Promise<string>)`

---

### `exports`

Controls what is exported from the bundle.

**Type:** `"auto" | "default" | "named" | "none"`

---

### `interop`

Controls interop behavior for default/namespace imports from CommonJS modules.

**Type:** `"auto" | "esModule" | "default" | "defaultOnly" | ((id: string) => string)`

---

### `paths`

Rewrites external module IDs in the output.

**Type:** `Record<string, string> | ((id: string) => string)`
