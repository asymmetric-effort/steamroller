# CLI Usage

The Steamroller CLI provides command-line access to bundling, watching, and configuration.

> **Note:** Steamroller is pre-implementation. Detailed documentation will be added as features are
> implemented.

## Installation

```bash
# Install globally
npm install -g steamroller

# Or use as a project dependency
npm install --save-dev steamroller
```

## Basic Usage

```bash
# Bundle using a config file
steamroller

# Bundle with a specific config file
steamroller --config rollup.config.ts

# Bundle with explicit input and output
steamroller --input src/index.ts --output dist/bundle.js --format es
```

## Flags

### `--config`, `-c`

Path to the configuration file. Defaults to `steamroller.config.js` or `rollup.config.js`.

```bash
steamroller --config my-config.ts
```

---

### `--input`, `-i`

The entry point file(s) for the bundle.

```bash
steamroller --input src/index.ts

# Multiple inputs
steamroller --input src/index.ts --input src/cli.ts
```

---

### `--output.dir`, `-d`

Output directory for code-split builds.

```bash
steamroller --input src/index.ts --output.dir dist
```

---

### `--output.file`, `-o`

Output file path for single-file builds.

```bash
steamroller --input src/index.ts --output.file dist/bundle.js
```

---

### `--format`, `-f`

Output format: `es`, `cjs`, `iife`, `umd`, `amd`, or `system`.

```bash
steamroller --input src/index.ts --output.file dist/bundle.js --format cjs
```

---

### `--name`, `-n`

Global variable name for `iife` and `umd` formats.

```bash
steamroller --input src/index.ts --output.file dist/bundle.js --format iife --name MyLib
```

---

### `--watch`, `-w`

Watch input files and rebuild on changes.

```bash
steamroller --config rollup.config.ts --watch
```

---

### `--sourcemap`

Generate source maps. Values: `true`, `inline`, or `hidden`.

```bash
steamroller --input src/index.ts --output.file dist/bundle.js --sourcemap

# Inline source maps
steamroller --input src/index.ts --output.file dist/bundle.js --sourcemap inline
```

---

### `--external`, `-e`

Mark module IDs as external.

```bash
steamroller --input src/index.ts --output.file dist/bundle.js --external lodash --external react
```

---

### `--globals`, `-g`

Map external module IDs to global variable names (for `iife`/`umd`).

```bash
steamroller --format iife --globals jquery:$,react:React
```

---

### `--plugin`

Load a plugin by module name.

```bash
steamroller --plugin @rollup/plugin-node-resolve
```

---

### `--environment`

Pass environment variables to the config file.

```bash
steamroller --environment BUILD:production,DEBUG:false
```

---

### `--no-treeshake`

Disable tree-shaking.

```bash
steamroller --no-treeshake
```

---

### `--silent`

Suppress warnings.

```bash
steamroller --silent
```

---

### `--version`, `-v`

Print the Steamroller version.

```bash
steamroller --version
```

---

### `--help`, `-h`

Show help information.

```bash
steamroller --help
```
