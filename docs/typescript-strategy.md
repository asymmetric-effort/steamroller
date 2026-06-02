# TypeScript Support Strategy

This document describes Steamroller's approach to TypeScript support, including the current state,
planned strategies, and guidance for users with existing TypeScript workflows.

> **Note:** Steamroller is pre-implementation. This strategy outlines the planned approach and will be
> updated as features are implemented.

## Current State: JavaScript-Only Parser

Steamroller's built-in parser currently handles JavaScript only. TypeScript files (`.ts`, `.tsx`)
are not parsed natively. If you pass TypeScript source files to Steamroller without a transform
step, the bundler will fail on type annotations, interfaces, and other TypeScript-specific syntax.

## Planned Strategy: Built-in Type Stripping

For the majority of TypeScript codebases, Steamroller will support TypeScript via **built-in type
stripping**, following the same approach as Node 22's `--experimental-strip-types` feature.

Type stripping removes TypeScript-only syntax (type annotations, interfaces, type aliases, generics)
from source files before parsing, without performing type checking or code transformation. This
works because most TypeScript constructs are purely erasable -- they have no runtime impact and can
be removed to produce valid JavaScript.

### What Type Stripping Handles

Type stripping covers the most common TypeScript features:

- Type annotations (`const x: string = "hello"`)
- Interfaces and type aliases (`interface Foo { ... }`, `type Bar = ...`)
- Generics (`function identity<T>(x: T): T`)
- `as` expressions and non-null assertions (`value as string`, `value!`)
- `import type` and `export type` statements
- Function return type annotations
- Optional property markers (`prop?: string`)
- `readonly` modifiers
- Abstract class declarations (type-level portions)

### What Type Stripping Does NOT Handle

Some TypeScript features emit JavaScript code and cannot be handled by simple type erasure. These
features require a full TypeScript compiler or transformer:

- **Enums** -- `enum Direction { Up, Down }` compiles to a JavaScript object
- **Namespaces** -- `namespace Util { ... }` compiles to an IIFE
- **Decorators with emit** -- decorators that produce runtime metadata (e.g., `emitDecoratorMetadata`)
- **`const enum`** -- inlines values at compile time, requiring type resolution
- **Parameter properties** -- `constructor(private name: string)` generates assignment code
- **Legacy module syntax** -- `module` declarations (as distinct from ES modules)

## Recommended Plugin for Complex TypeScript

If your project uses any of the features listed above, you should use a TypeScript transform plugin.
We recommend `@rollup/plugin-typescript` or an equivalent:

```bash
npm install --save-dev @rollup/plugin-typescript typescript tslib
```

```javascript
// steamroller.config.js
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "es",
  },
  plugins: [typescript()],
};
```

### Alternative Plugins

Other compatible plugins include:

- **`rollup-plugin-esbuild`** -- Uses esbuild for fast TypeScript transpilation (does not type-check)
- **`rollup-plugin-swc3`** -- Uses SWC for fast TypeScript transpilation (does not type-check)
- **`@rollup/plugin-sucrase`** -- Uses Sucrase for lightweight TypeScript stripping

These alternatives trade full TypeScript compiler fidelity for significantly faster build times. They
are suitable if you run type checking separately (e.g., `tsc --noEmit`).

## Migration Guide: Rollup + @rollup/plugin-typescript

If you are migrating from a Rollup project that already uses `@rollup/plugin-typescript`, the
transition is straightforward.

### Step 1: Replace Rollup with Steamroller

```bash
npm uninstall rollup
npm install --save-dev steamroller
```

### Step 2: Keep Your TypeScript Plugin (If Needed)

If your project uses enums, namespaces, decorators with emit, or other non-erasable TypeScript
features, keep `@rollup/plugin-typescript` in your config. It is fully compatible with Steamroller:

```javascript
// steamroller.config.js
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "es",
  },
  plugins: [typescript()],
};
```

### Step 3: Consider Dropping the Plugin

If your project only uses erasable TypeScript features (type annotations, interfaces, generics),
you can remove the plugin entirely once Steamroller's built-in type stripping is available:

```bash
npm uninstall @rollup/plugin-typescript tslib
```

```javascript
// steamroller.config.js
export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "es",
  },
};
```

This simplifies your dependency tree and may improve build performance since no separate TypeScript
compilation step is needed.

### Step 4: Update Build Scripts

```json
{
  "scripts": {
    "build": "steamroller --config",
    "typecheck": "tsc --noEmit",
    "dev": "steamroller --config --watch"
  }
}
```

We recommend keeping `tsc --noEmit` as a separate type-checking step in your workflow, since neither
built-in type stripping nor most fast transpiler plugins perform type checking.

## How to Choose

| Scenario                                     | Recommendation                    |
| -------------------------------------------- | --------------------------------- |
| Standard TS (types, interfaces, generics)    | Built-in type stripping (planned) |
| Enums, namespaces, parameter properties      | `@rollup/plugin-typescript`       |
| Decorator metadata (`emitDecoratorMetadata`) | `@rollup/plugin-typescript`       |
| Maximum build speed, no type-check needed    | `rollup-plugin-esbuild` or SWC    |
| Full type-check during build                 | `@rollup/plugin-typescript`       |

## Future Roadmap: Built-in TypeScript Parsing

Long-term, Steamroller may extend its parser to handle TypeScript natively, beyond simple type
stripping. This would enable:

- Direct parsing of TypeScript AST nodes without a preprocessing step
- Support for non-erasable TypeScript features without an external plugin
- Tighter integration with TypeScript's module resolution (paths, `baseUrl`, project references)
- Potential for TypeScript-aware tree shaking and optimizations

This is a longer-term goal and depends on the maturity of the core bundler. The type-stripping
approach provides a pragmatic first step that covers the vast majority of TypeScript projects
without the complexity of a full TypeScript parser.
