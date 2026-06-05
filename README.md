<p align="center">
  <img src="logo.png" alt="Steamroller" width="128" height="128">
</p>

<h1 align="center">Steamroller</h1>

<p align="center">
  A zero-dependency TypeScript reimplementation of <a href="https://rollupjs.org">rollup</a> with 100% feature parity and 100% API compatibility.
</p>

## Overview

Steamroller is a JavaScript module bundler that:

- Parses ES module source code into ASTs
- Builds a module dependency graph
- Performs statement-level tree-shaking via static analysis
- Generates optimized output bundles in 6 formats (ES, CJS, UMD, AMD, IIFE, SystemJS)
- Supports code splitting via dynamic imports and multiple entry points
- Provides a 27-hook plugin system for extensibility
- Generates and composes source maps
- Offers watch mode for incremental rebuilds
- Exposes a CLI with 80+ flags

## Status

**Pre-release** -- this project is under active development and not yet functional.

See [PLAN.md](PLAN.md) for the exhaustive implementation plan and [GapAnalysis.md](GapAnalysis.md) for the current gap analysis.

## Design Principles

- **Zero runtime dependencies** -- no `node_modules` at runtime
- **Pure TypeScript** -- no native code, no WASM, no build-time code generation
- **Drop-in compatible** -- same API, same types, same behavior as rollup v4.60.4
- **MIT licensed** -- all code is original

## Installation

```bash
npm install @asymmetric-effort/steamroller
```

## Usage

### JavaScript API

```typescript
import { rollup } from "@asymmetric-effort/steamroller";

const bundle = await rollup({
  input: "src/main.js",
});

await bundle.write({
  file: "dist/bundle.js",
  format: "es",
});

await bundle.close();
```

### CLI

```bash
npx steamroller src/main.js --file dist/bundle.js --format es
```

### Configuration File

```javascript
// steamroller.config.mjs
export default {
  input: "src/main.js",
  output: {
    file: "dist/bundle.js",
    format: "es",
  },
};
```

```bash
npx steamroller -c
```

## Compatibility

Steamroller targets 100% feature parity with rollup v4.60.4. After the v1.0.0 release, steamroller versions are independent and may diverge from rollup.

### Plugin Compatibility

Steamroller is compatible with the official `@rollup/plugin-*` ecosystem. Plugins that work with rollup should work with steamroller without modification.

### Migration from Rollup

1. `npm uninstall rollup && npm install @asymmetric-effort/steamroller`
2. Replace `import { rollup } from 'rollup'` with `import { rollup } from '@asymmetric-effort/steamroller'`
3. Rename config file (optional -- `rollup.config.*` is still supported)
4. Replace `npx rollup` with `npx steamroller` in scripts

## Requirements

- Node.js >= 18.0.0

## Development

```bash
git clone https://github.com/asymmetric-effort/steamroller.git
cd steamroller
npm install
npm run build
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## Coding Standards

This project follows the [Asymmetric Effort Coding Standards](https://coding-standards.asymmetric-effort.com).

## License

[MIT](LICENSE)

## Links

- [GitHub Repository](https://github.com/asymmetric-effort/steamroller)
- [Issue Tracker](https://github.com/asymmetric-effort/steamroller/issues)
- [Implementation Plan](PLAN.md)
- [Gap Analysis](GapAnalysis.md)
