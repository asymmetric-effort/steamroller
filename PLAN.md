# Steamroller — Exhaustive Implementation Plan

> A zero-dependency TypeScript reimplementation of rollup with 100% feature parity and 100% API compatibility.

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Phase 0: Project Scaffolding](#3-phase-0-project-scaffolding)
4. [Phase 1: JavaScript Parser](#4-phase-1-javascript-parser)
5. [Phase 2: Module Graph](#5-phase-2-module-graph)
6. [Phase 3: Tree-Shaking](#6-phase-3-tree-shaking)
7. [Phase 4: Code Generation](#7-phase-4-code-generation)
8. [Phase 5: Source Maps](#8-phase-5-source-maps)
9. [Phase 6: Plugin System](#9-phase-6-plugin-system)
10. [Phase 7: Code Splitting](#10-phase-7-code-splitting)
11. [Phase 8: Output Formats](#11-phase-8-output-formats)
12. [Phase 9: Watch Mode](#12-phase-9-watch-mode)
13. [Phase 10: CLI](#13-phase-10-cli)
14. [Phase 11: Configuration](#14-phase-11-configuration)
15. [Phase 12: Compatibility & Conformance](#15-phase-12-compatibility--conformance)
16. [Public API Surface](#16-public-api-surface)
17. [Configuration Options](#17-configuration-options)
18. [Type System](#18-type-system)
19. [Testing Strategy](#19-testing-strategy)
20. [Licensing & Compliance](#20-licensing--compliance)
21. [Versioning & Distribution](#21-versioning--distribution)
22. [Cross-Platform Concerns](#22-cross-platform-concerns)
23. [Error & Warning Code System](#23-error--warning-code-system)
24. [Performance Strategy](#24-performance-strategy)
25. [Risk Register](#25-risk-register)

---

## 1. Project Overview

### Goal

Reimplement the npm `rollup` package (v4.60.4) as a pure TypeScript package named `steamroller` with:

- **100% feature parity**: every feature rollup supports, steamroller supports
- **100% API compatibility**: drop-in replacement; same function signatures, same types, same behavior
- **Zero runtime dependencies**: no `node_modules` at runtime (devDependencies are acceptable)
- **MIT license**: all code original or MIT-compatible
- **Coding standards**: full compliance with https://coding-standards.asymmetric-effort.com

### What Rollup Is

Rollup is a JavaScript module bundler that:

- Parses ES module source code into ASTs
- Builds a module dependency graph
- Performs statement-level tree-shaking via static analysis
- Generates optimized output bundles in 6 formats (es, cjs, umd, amd, iife, system)
- Supports code splitting via dynamic imports and multiple entry points
- Provides a 24-hook plugin system for extensibility
- Generates and composes source maps
- Offers watch mode for incremental rebuilds
- Exposes a CLI with 80+ flags

### Rollup's Architecture (Reference)

| Component | Rollup Implementation | Lines | Steamroller Approach |
|---|---|---|---|
| JS/JSX Parser | Rust/SWC via N-API | ~2MB binary | Pure TypeScript |
| Content Hashing (xxHash) | Rust via N-API | included in binary | Pure TypeScript |
| AST Buffer Conversion | JavaScript | ~2,361 | Not needed (parse directly to ESTree) |
| Module Graph / Tree-Shaking / Codegen | JavaScript | ~24,406 | TypeScript |
| CLI | JavaScript | ~9,615 | TypeScript |
| Watch Mode | JavaScript | ~866 | TypeScript |
| Config Loading | JavaScript | ~572 | TypeScript |

### Rollup's Dependencies (All MIT-Compatible)

Rollup bundles 30 dependencies (MIT, ISC, 0BSD). Its only runtime npm dependency is `@types/estree` (MIT, types-only). All 26 optional `@rollup/rollup-*` native packages are MIT. No license conflicts exist; reimplementation is legally clear.

---

## 2. Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────┐
│                       CLI                           │
│  (argument parsing, config loading, watch mode)     │
├─────────────────────────────────────────────────────┤
│                   Public API                        │
│  rollup() / watch() / defineConfig() / VERSION      │
│  parseAst() / parseAstAsync()                       │
│  loadConfigFile() / getLogFilter()                  │
├─────────────────────────────────────────────────────┤
│                 Plugin Driver                       │
│  Hook orchestration (first/sequential/parallel)     │
│  Plugin context (this.resolve, this.load, etc.)     │
├──────────────┬──────────────┬───────────────────────┤
│  Build Phase │              │  Output Phase         │
│  ┌─────────┐ │              │  ┌──────────────────┐ │
│  │ Parser  │ │              │  │ Code Generator   │ │
│  │ (ESTree)│ │              │  │ (6 formats)      │ │
│  └────┬────┘ │              │  └────────┬─────────┘ │
│  ┌────┴────┐ │              │  ┌────────┴─────────┐ │
│  │ Module  │ │              │  │ Chunk Splitter   │ │
│  │ Graph   │ │              │  │ & Optimizer      │ │
│  └────┬────┘ │              │  └────────┬─────────┘ │
│  ┌────┴────┐ │              │  ┌────────┴─────────┐ │
│  │  Scope  │ │              │  │  Source Map       │ │
│  │ Analysis│ │              │  │  Composer         │ │
│  └────┬────┘ │              │  └──────────────────┘ │
│  ┌────┴────┐ │              │                       │
│  │  Tree   │ │              │                       │
│  │ Shaker  │ │              │                       │
│  └─────────┘ │              │                       │
├──────────────┴──────────────┴───────────────────────┤
│              Utilities                              │
│  Hashing / MagicString / FS Abstraction / Logging   │
└─────────────────────────────────────────────────────┘
```

### Threading Model

Steamroller is **single-threaded** (main event loop only) for the MVP:

- [ ] All operations run on the main thread, using async/await for I/O concurrency
- [ ] `parseAstAsync` uses `Promise.resolve().then(...)` to yield to the event loop periodically (not a worker thread)
  - The `AbortSignal` parameter is checked between parsing statements to allow cancellation
  - This matches rollup's behavior from the JS side (the native parser runs in Node's thread pool, but steamroller has no native code)
- [ ] `maxParallelFileOps` controls concurrent `fs.readFile` calls via a semaphore pattern, not threads
- [ ] Plugin hooks marked "parallel" run concurrently via `Promise.all`, not threads
- [ ] **Post-MVP consideration**: worker threads for parsing multiple modules concurrently (opt-in, behind a flag) — noted in §24

### Directory Structure

```
~/git/steamroller/
├── PLAN.md
├── CLAUDE.md
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── SECURITY.md
├── LICENSE
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Public API entry point
│   ├── parseAst.ts                 # parseAst / parseAstAsync entry
│   ├── loadConfigFile.ts           # loadConfigFile entry
│   ├── getLogFilter.ts             # getLogFilter entry
│   ├── rollup.ts                   # rollup() function
│   ├── watch.ts                    # watch() function
│   ├── parser/
│   │   ├── lexer.ts                # Tokenizer
│   │   ├── parser.ts               # Recursive descent parser
│   │   ├── jsx.ts                  # JSX parsing extension
│   │   ├── tokens.ts               # Token type definitions
│   │   └── estree.ts               # ESTree AST node types
│   ├── graph/
│   │   ├── ModuleGraph.ts          # Module dependency graph
│   │   ├── Module.ts               # Module representation
│   │   ├── ExternalModule.ts       # External module representation
│   │   ├── ModuleLoader.ts         # Module loading pipeline
│   │   └── ResolveId.ts            # Default resolution logic
│   ├── analysis/
│   │   ├── Scope.ts                # Scope chain representation
│   │   ├── ScopeAnalyzer.ts        # Scope/binding analysis
│   │   ├── TreeShaker.ts           # Tree-shaking engine
│   │   ├── SideEffects.ts          # Side effect detection
│   │   └── ExportTracer.ts         # Export usage tracing
│   ├── codegen/
│   │   ├── CodeGenerator.ts        # Base code generation
│   │   ├── formats/
│   │   │   ├── es.ts               # ES module output
│   │   │   ├── cjs.ts              # CommonJS output
│   │   │   ├── umd.ts              # UMD output
│   │   │   ├── amd.ts              # AMD output
│   │   │   ├── iife.ts             # IIFE output
│   │   │   └── system.ts           # SystemJS output
│   │   ├── ChunkSplitter.ts        # Code splitting logic
│   │   ├── ChunkNamer.ts           # Chunk file naming
│   │   └── Renderer.ts             # AST-to-code rendering
│   ├── sourcemap/
│   │   ├── SourceMap.ts            # SourceMap representation
│   │   ├── MagicString.ts          # String manipulation with maps
│   │   ├── VLQ.ts                  # VLQ encoding/decoding
│   │   └── Composer.ts             # Source map composition
│   ├── plugin/
│   │   ├── PluginDriver.ts         # Plugin orchestration
│   │   ├── PluginContext.ts         # this.* context for hooks
│   │   ├── TransformPluginContext.ts
│   │   ├── HookRunner.ts           # first/sequential/parallel
│   │   └── PluginCache.ts          # Plugin caching system
│   ├── hash/
│   │   └── xxhash.ts               # xxHash implementation
│   ├── cli/
│   │   ├── cli.ts                  # CLI entry point
│   │   ├── args.ts                 # Argument parsing
│   │   ├── logging.ts              # Terminal output & colors
│   │   └── run.ts                  # Build/watch execution
│   ├── fs/
│   │   ├── VirtualFS.ts            # RollupFsModule implementation
│   │   └── NodeFS.ts               # Node.js fs adapter
│   ├── utils/
│   │   ├── path.ts                 # Cross-platform path manipulation
│   │   ├── sanitizeFileName.ts     # File name sanitization
│   │   ├── errors.ts               # Error construction with error codes
│   │   ├── errorCodes.ts           # All error/warning code constants
│   │   ├── logs.ts                 # Log/warning types
│   │   ├── interop.ts              # CJS/ESM interop helpers
│   │   ├── glob.ts                 # Glob pattern matching (picomatch replacement)
│   │   ├── braces.ts               # Brace expansion
│   │   ├── lru.ts                  # LRU cache (flru replacement)
│   │   ├── colors.ts               # ANSI terminal colors (picocolors replacement)
│   │   ├── formatters.ts           # pretty-bytes, pretty-ms replacements
│   │   ├── builtinModules.ts       # Node.js built-in module list
│   │   └── perf.ts                 # Performance timing instrumentation
│   └── types/
│       ├── index.ts                # All public types (re-exports)
│       ├── options.ts              # Input/Output option types
│       ├── plugin.ts               # Plugin-related types
│       ├── output.ts               # OutputChunk/OutputAsset types
│       └── module.ts               # ModuleInfo types
├── tests/
│   ├── unit/
│   │   ├── parser/
│   │   ├── graph/
│   │   ├── analysis/
│   │   ├── codegen/
│   │   ├── sourcemap/
│   │   ├── plugin/
│   │   ├── hash/
│   │   ├── cli/
│   │   ├── utils/                  # glob, braces, LRU, path, colors, formatters
│   │   └── errors/                 # Error code coverage
│   ├── integration/
│   │   ├── bundling/
│   │   ├── treeshaking/
│   │   ├── codesplitting/
│   │   ├── formats/
│   │   ├── plugins/
│   │   ├── sourcemaps/
│   │   └── errors/                 # Error/warning code parity tests
│   ├── e2e/
│   │   ├── cli/
│   │   ├── watch/
│   │   ├── compatibility/
│   │   └── real-projects/          # Bundling real open-source projects
│   ├── fuzz/
│   │   ├── corpus/                 # Seed corpus from Test262
│   │   └── harness.ts              # Fuzz test harness
│   └── snapshots/                  # Output format & error message snapshots
└── docs/
    ├── index.md
    ├── javascript-api.md
    ├── configuration-options.md
    ├── plugin-development.md
    ├── cli.md
    └── migration-from-rollup.md
```

---

## 3. Phase 0: Project Scaffolding

### 0.1 Repository Setup

- [x] Initialize git repo with `main` branch
- [x] Create remote at `asymmetric-effort/steamroller`
- [ ] Create `LICENSE` (MIT)
- [ ] Create `CODE_OF_CONDUCT.md`
- [ ] Create `SECURITY.md` with reporting procedures and response timelines
- [ ] Create `CONTRIBUTING.md` with setup instructions and dev workflows

### 0.2 TypeScript Configuration

- [ ] `tsconfig.json` with strict mode, no suppressions
- [ ] Target: ES2022 (Node 18+)
- [ ] Module: NodeNext
- [ ] Declaration files enabled
- [ ] Source maps for development

### 0.3 Package Configuration

- [ ] `package.json` with:
  - `name`: `steamroller`
  - `type`: `module`
  - `engines`: `{ "node": ">=18.0.0" }`
  - `bin`: `{ "steamroller": "dist/bin/steamroller" }`
  - `exports` map matching rollup's structure:
    - `.` → main entry (types + ESM + CJS)
    - `./parseAst` → parser entry
    - `./loadConfigFile` → config loader entry
    - `./getLogFilter` → log filter entry
  - Zero `dependencies`
  - DevDependencies: TypeScript, test runner only
- [ ] `.gitignore`
- [ ] `.editorconfig`

### 0.4 CI/CD Pipeline

- [ ] GitHub Actions workflow (pinned to commit SHAs):
  - Stage 1: Lint + typecheck
  - Stage 2: Unit tests + coverage
  - Stage 3: Build
  - Stage 4: Integration + E2E tests
  - Stage 5: Performance benchmarks (compare against previous commit, alert on > 10% regression)
- [ ] Platform matrix: Ubuntu, macOS, Windows (all stages)
- [ ] Node.js version matrix: 18.x, 20.x, 22.x
- [ ] CodeQL enabled
- [ ] Dependabot enabled (source + GitHub Actions)
- [ ] Pre-commit hooks: typecheck + formatting
- [ ] Pre-push hooks: tests + coverage threshold (98%)
- [ ] Coverage threshold enforcement in CI
- [ ] Nightly job: fuzz testing (parser fuzzer, 1-hour run)
- [ ] Nightly job: differential testing against rollup with real-world projects

### 0.5 Testing Infrastructure

- [ ] Test runner (Node.js built-in test runner, zero deps)
- [ ] Coverage reporting (Node.js built-in `--experimental-vm-modules` + c8 or similar)
- [ ] Test directory structure: `unit/`, `integration/`, `e2e/`
- [ ] Rollup compatibility test suite (run identical inputs through both rollup and steamroller, diff outputs)

---

## 4. Phase 1: JavaScript Parser

The parser is the largest and most complex component. Rollup uses a Rust/SWC-based parser compiled to native code. Steamroller must implement an equivalent parser in pure TypeScript.

### 1.1 Lexer/Tokenizer

- [ ] Full ECMAScript 2024 tokenizer
- [ ] Token types:
  - Identifiers and keywords (including contextual: `async`, `yield`, `let`, `of`, `from`, `as`, `get`, `set`, `static`, etc.)
  - Numeric literals (decimal, hex `0x`, octal `0o`, binary `0b`, BigInt `n` suffix, numeric separators `_`)
  - String literals (single-quoted, double-quoted, escape sequences including Unicode `\u{...}`)
  - Template literals (head, middle, tail, no-substitution)
  - Regular expression literals (with flag validation)
  - Punctuators (all operators, including `?.`, `??`, `**`, `||=`, `&&=`, `??=`, `#`)
  - Comments (single-line, multi-line, hashbang `#!`)
  - Whitespace and line terminators (for ASI)
- [ ] Source position tracking (byte offsets for `start`/`end`)
- [ ] Automatic semicolon insertion (ASI) detection
- [ ] `/*@__PURE__*/` and `/*#__PURE__*/` annotation detection
- [ ] `/*@__NO_SIDE_EFFECTS__*/` annotation detection
- [ ] Lookahead support for parser disambiguation
- [ ] Regex vs division disambiguation (context-dependent)

### 1.2 Parser (Recursive Descent)

- [ ] Full ECMAScript 2024 grammar, producing ESTree-compatible AST
- [ ] Hashbang (`#!`) comment handling at start of source
- [ ] Statement types:
  - `BlockStatement`, `BreakStatement`, `ContinueStatement`, `DebuggerStatement`
  - `DoWhileStatement`, `EmptyStatement`, `ExpressionStatement`
  - `ForStatement`, `ForInStatement`, `ForOfStatement`
  - `IfStatement`, `LabeledStatement`, `ReturnStatement`
  - `SwitchStatement` (`SwitchCase`), `ThrowStatement`
  - `TryStatement` (`CatchClause`), `WhileStatement`, `WithStatement`
  - `VariableDeclaration` (`VariableDeclarator`) — `var`, `let`, `const`, `using`, `await using` (Explicit Resource Management)
- [ ] Declaration types:
  - `FunctionDeclaration`, `ClassDeclaration`
  - `ImportDeclaration` (`ImportSpecifier`, `ImportDefaultSpecifier`, `ImportNamespaceSpecifier`)
  - `ExportNamedDeclaration`, `ExportDefaultDeclaration`, `ExportAllDeclaration`
- [ ] Expression types:
  - `ArrayExpression`, `ObjectExpression` (`Property`, `SpreadElement`)
  - `FunctionExpression`, `ArrowFunctionExpression`
  - `ClassExpression` (`ClassBody`, `MethodDefinition`, `PropertyDefinition`, `StaticBlock`)
  - `TaggedTemplateExpression`, `TemplateLiteral` (`TemplateElement`)
  - `SequenceExpression`, `ConditionalExpression`
  - `BinaryExpression`, `LogicalExpression` (`||`, `&&`, `??`)
  - `UnaryExpression`, `UpdateExpression`
  - `AssignmentExpression` (all operators including `||=`, `&&=`, `??=`)
  - `MemberExpression`, `OptionalMemberExpression` (optional chaining `?.`)
  - `CallExpression`, `OptionalCallExpression`
  - `NewExpression`, `YieldExpression`, `AwaitExpression`
  - `ImportExpression` (dynamic `import()`)
  - `MetaProperty` (`import.meta`, `new.target`)
  - `ChainExpression` (wraps optional chaining)
- [ ] Pattern types:
  - `AssignmentPattern`, `ArrayPattern`, `ObjectPattern`, `RestElement`
- [ ] Literal types:
  - `Literal` (string, number, boolean, null, RegExp, BigInt)
- [ ] `Program` (script vs module mode)
- [ ] Top-level `await` in module mode
- [ ] Import attributes / assertions (`with { type: "json" }`)
- [ ] Decorator syntax (stage 3) with decorator metadata
- [ ] `allowReturnOutsideFunction` option
- [ ] Error recovery with meaningful error messages and positions

### 1.2.1 Regular Expression Features

- [ ] Named capture groups (`(?<name>...)`)
- [ ] Lookbehind assertions (`(?<=...)`, `(?<!...)`)
- [ ] Unicode property escapes (`\p{Script=Greek}`, `\P{...}`)
- [ ] `/s` (dotAll) flag
- [ ] `/d` (hasIndices) flag
- [ ] `/v` (unicodeSets) flag — set notation and properties of strings
- [ ] Flag validation and conflict detection (`/u` vs `/v` mutual exclusivity)

### 1.3 JSX Extension

- [ ] JSX element parsing (`JSXElement`, `JSXFragment`)
- [ ] JSX attributes (`JSXAttribute`, `JSXSpreadAttribute`)
- [ ] JSX expressions (`JSXExpressionContainer`, `JSXSpreadChild`)
- [ ] JSX text nodes (`JSXText`)
- [ ] JSX namespaced names (`JSXNamespacedName`)
- [ ] JSX member expressions (`JSXMemberExpression`)
- [ ] Self-closing elements
- [ ] Fragment shorthand (`<>...</>`)
- [ ] Configurable via `jsx` option (off by default)

### 1.4 AST Format

- [ ] Full ESTree compliance (https://github.com/estree/estree)
- [ ] Location info: `{start: number, end: number}` (byte offsets only, no line/column `loc`)
- [ ] Rollup-specific `RollupAstNode<T>` wrapper type
- [ ] `ProgramNode` type (Program with position-only location)

### 1.5 Public Parser API

- [ ] `parseAst(input: string, options?: {allowReturnOutsideFunction?: boolean; jsx?: boolean}): ProgramNode`
- [ ] `parseAstAsync(input: string, options?: {allowReturnOutsideFunction?: boolean; jsx?: boolean; signal?: AbortSignal}): Promise<ProgramNode>`
- [ ] Exported from `steamroller/parseAst` sub-entry

### Estimated Complexity

This is the largest single component. A full ES2024+JSX parser is approximately 8,000–15,000 lines of TypeScript. Key challenges:
- Correct ASI (automatic semicolon insertion) — many edge cases
- Cover expression parsing ambiguities (arrow functions vs parenthesized expressions, async arrows, etc.)
- Regex vs division context sensitivity
- Destructuring patterns vs expressions
- Strict mode vs sloppy mode semantics
- Performance — must parse large files efficiently without native code

---

## 5. Phase 2: Module Graph

### 2.1 Module Representation

- [ ] `Module` class:
  - `id: string` (resolved file path)
  - `code: string` (source code)
  - `ast: ProgramNode` (parsed AST)
  - `imports: ImportDescription[]` (static imports)
  - `exports: ExportDescription[]` (static exports)
  - `dynamicImports: DynamicImportDescription[]`
  - `dependencies: Set<Module | ExternalModule>`
  - `importers: Set<Module>`
  - `isEntry: boolean`
  - `isIncluded: boolean`
  - `scope: ModuleScope`
  - `sideEffects: boolean | 'no-treeshake'`
  - `attributes: Record<string, string>` (import attributes)
  - `meta: Record<string, unknown>` (plugin metadata)
  - `syntheticNamedExports: boolean | string`
  - `hasDefaultExport: boolean`

- [ ] `ExternalModule` class:
  - `id: string`
  - `importers: Set<Module>`
  - `isExternal: true`

### 2.2 ModuleInfo Interface

Full `ModuleInfo` compatibility:
- [ ] `id`, `code`, `ast`, `isEntry`, `isExternal`, `isIncluded`
- [ ] `hasDefaultExport`, `exports`, `exportedBindings`
- [ ] `importedIds`, `importedIdResolutions`
- [ ] `importers`, `dynamicImporters`
- [ ] `dynamicallyImportedIds`, `dynamicallyImportedIdResolutions`
- [ ] `implicitlyLoadedAfterOneOf`, `implicitlyLoadedBefore`
- [ ] `attributes`, `meta`, `moduleSideEffects`
- [ ] `syntheticNamedExports`, `safeVariableNames`

### 2.3 Module Loader

- [ ] Resolution pipeline:
  1. Call `resolveId` plugin hook (first semantics)
  2. For dynamic imports, try `resolveDynamicImport` first
  3. Default resolution: absolute paths and relative paths only
  4. External checking against `external` option
  5. `makeAbsoluteExternalsRelative` handling
- [ ] Loading pipeline:
  1. Call `load` plugin hook (first semantics)
  2. Default: read from filesystem (via `RollupFsModule` abstraction)
  3. Parse source to AST
  4. Call `transform` plugin hook (sequential)
  5. Call `moduleParsed` plugin hook (parallel)
- [ ] Cache integration:
  - `shouldTransformCachedModule` hook support
  - Module-level caching via `RollupCache`
  - `PluginCache` per-plugin data persistence
  - `experimentalCacheExpiry` — number of builds after which unused cache entries are purged (prevents unbounded cache growth in watch mode)
- [ ] Parallel file operations with `maxParallelFileOps` limit
- [ ] `preserveSymlinks` option support

### 2.4 Module Graph Construction

- [ ] Build from entry points (`input` option: string, string[], Record<string, string>)
- [ ] Recursive dependency traversal
- [ ] Circular dependency detection and warning
- [ ] Module ordering (topological sort with cycle handling)
- [ ] `implicitlyLoadedBefore` / `implicitlyLoadedAfterOneOf` relationships
- [ ] `shimMissingExports` support

### 2.5 Synthetic Named Exports

The `syntheticNamedExports` feature allows a module's default export (or another named export) to serve as a fallback namespace for any named import that doesn't match a real export. This is critical for CommonJS interop and must be handled across resolution, tree-shaking, and codegen:

- [ ] `syntheticNamedExports: true` — use the module's `default` export as the fallback namespace
- [ ] `syntheticNamedExports: 'someExport'` — use a specific named export as the fallback namespace
- [ ] Resolution behavior:
  - When resolving `import { foo } from './mod'` and `./mod` has no explicit `foo` export but has `syntheticNamedExports: true`, resolve `foo` to a property access on the default export
  - `ModuleInfo.exports` should still list only real exports; synthetic exports are resolved dynamically
- [ ] Code generation:
  - `import { foo } from './mod'` → access `mod_default.foo` (where `mod_default` is the deconflicted default binding)
  - `import * as ns from './mod'` → namespace object includes both real exports and a synthetic fallback
- [ ] Tree-shaking interaction:
  - Synthetic exports cannot be statically analyzed for usage — the entire default export must be preserved if any synthetic named import is used
  - `SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT` error when the fallback export doesn't exist
  - `EXTERNAL_SYNTHETIC_EXPORTS` error when `syntheticNamedExports` is set on an external module

### 2.6 Filesystem Abstraction

- [ ] `RollupFsModule` interface implementation:
  - `appendFile`, `copyFile`, `mkdir`, `mkdtemp`, `readdir`, `readFile`
  - `realpath`, `rename`, `rmdir`, `stat`, `lstat`, `unlink`, `writeFile`
- [ ] `RollupDirectoryEntry`, `RollupFileStats`, `BufferEncoding` types
- [ ] Default Node.js fs adapter
- [ ] Accessible via `this.fs` in plugin context

---

## 6. Phase 3: Tree-Shaking

### 3.1 Scope Analysis

- [ ] Scope chain construction:
  - Global scope
  - Module scope
  - Function scope (including arrow functions)
  - Block scope (`let`, `const`, `class`)
  - Catch clause scope
  - Class body scope (static blocks, field initializers)
  - `with` statement scope (deoptimize)
- [ ] Binding tracking:
  - Declaration sites
  - Reference sites
  - Re-assignment tracking
  - Hoisting (`var`, `function`)
  - Temporal dead zone (`let`, `const`, `class`)
- [ ] Import/export binding resolution:
  - Named imports → named exports
  - Default imports → default exports
  - Namespace imports → module namespace
  - Re-exports (`export { x } from 'y'`, `export * from 'y'`)
  - Live binding semantics

### 3.2 Side Effect Detection

- [ ] Statement-level side effect analysis
- [ ] Expression side effect classification:
  - Function calls: side-effectful by default
  - Property access: configurable (`propertyReadSideEffects`)
  - Assignment: always side-effectful
  - `delete`: side-effectful
  - `throw`: side-effectful
  - `new`: side-effectful
- [ ] Module-level side effects:
  - `moduleSideEffects` option (boolean, `'no-external'`, string[], function)
  - `package.json` `sideEffects` field (via plugin)
- [ ] Pure annotations:
  - `/*@__PURE__*/` and `/*#__PURE__*/` on call expressions
  - `/*@__NO_SIDE_EFFECTS__*/` on function declarations
  - `treeshake.annotations` option
- [ ] `manualPureFunctions` list
- [ ] `unknownGlobalSideEffects` option
- [ ] `tryCatchDeoptimization` option
- [ ] `correctVarValueBeforeDeclaration` option
- [ ] `eval()` deoptimization:
  - Direct `eval()` calls deoptimize the entire containing scope (cannot statically determine which bindings are referenced)
  - Emit `EVAL` warning when `eval()` is detected
  - All bindings in the scope chain must be preserved (cannot tree-shake)
  - Indirect eval (`(0, eval)(...)` or `window.eval(...)`) does not deoptimize scope
- [ ] `arguments` object handling:
  - Presence of `arguments` in a non-arrow function prevents certain optimizations
  - Cannot statically determine which parameters are accessed via `arguments[n]`
- [ ] Getter/setter side effects:
  - Object literal getters are side-effectful when the property is read (`propertyReadSideEffects` controls this)
  - Object literal setters are side-effectful when the property is assigned
  - Class accessor properties (get/set) follow the same rules
  - `Object.defineProperty` with get/set is always side-effectful

### 3.3 Side Effect Logging

- [ ] `experimentalLogSideEffects` option implementation:
  - Log each included statement with module ID, position, and reason for inclusion
  - Output format: `{module, position: {line, column}, statement}` for each side-effectful statement
  - Useful for debugging why modules/statements survive tree-shaking

### 3.4 Tree-Shaking Engine

- [ ] Multi-pass iterative algorithm:
  1. Mark entry point exports as used
  2. Trace all references from used bindings
  3. Include statements that declare or modify used bindings
  4. Include statements with side effects
  5. Repeat until no new statements are included (convergence)
- [ ] Presets:
  - `'recommended'` (default): balanced
  - `'smallest'`: most aggressive (all side-effect options false)
  - `'safest'`: most conservative (all side-effect options true)
- [ ] `experimentalLogSideEffects` support for debugging

---

## 7. Phase 4: Code Generation

### 4.1 AST-to-Code Renderer

- [ ] Statement rendering with proper formatting
- [ ] Expression rendering with correct operator precedence and parenthesization
- [ ] `compact` mode (minimize whitespace in generated wrapper code)
- [ ] `indent` option (boolean or custom string)
- [ ] `generatedCode` presets:
  - `'es5'`: `var`, no arrow functions, no shorthand, no symbols
  - `'es2015'`: `const`, arrow functions, shorthand properties, `Symbol.toStringTag`
  - Fine-grained: `arrowFunctions`, `constBindings`, `objectShorthand`, `reservedNamesAsProps`, `symbols`

### 4.2 Import/Export Rewriting

- [ ] Rewrite ES imports to format-appropriate code
- [ ] Rewrite ES exports to format-appropriate code
- [ ] Handle live bindings (getter-based access for mutable exports)
- [ ] Handle namespace objects (`Object.freeze`, `Object.defineProperty`)
- [ ] `esModule` flag insertion (`__esModule` property)
- [ ] `interop` modes: `'compat'`, `'auto'`, `'esModule'`, `'default'`, `'defaultOnly'`
- [ ] `externalLiveBindings` option
- [ ] `freeze` option
- [ ] `reexportProtoFromExternal` option

### 4.3 Module Concatenation

- [ ] Concatenate included modules into chunks
- [ ] Variable name deconfliction across modules
- [ ] Hoisted imports at chunk top
- [ ] `hoistTransitiveImports` option
- [ ] `minifyInternalExports` option (single-char export names)
- [ ] Module ordering within chunks

### 4.4 JSX Transform Output

When `jsx` option is configured, the parser produces JSX AST nodes and the code generator must transform them:

- [ ] `mode: 'classic'` — transform `<Foo bar={1}>` to `React.createElement(Foo, {bar: 1})`
  - `factory` option specifies the createElement function (default `React.createElement`)
  - `fragment` option specifies the Fragment component (default `React.Fragment`)
- [ ] `mode: 'automatic'` — transform to `_jsx(Foo, {bar: 1})` with auto-injected imports
  - `importSource` option specifies where to import `jsx`/`jsxs`/`Fragment` from (default `react`)
  - Inject `import { jsx as _jsx } from 'react/jsx-runtime'` automatically
  - Use `jsxs` for elements with multiple children
- [ ] `mode: 'preserve'` — leave JSX untransformed in output (for downstream tools)
- [ ] Spread attribute handling: `<Foo {...props} />` → `createElement(Foo, props)` or `_jsx(Foo, {...props})`
- [ ] Key extraction in automatic mode: `<Foo key={k} />` → `_jsx(Foo, {}, k)` (key is a separate argument)
- [ ] Fragment shorthand: `<>...</>` → `createElement(Fragment, null, ...)` or `_jsxs(Fragment, {children: [...]})`
- [ ] `MISSING_JSX_EXPORT` error when factory/fragment not found in the import source

### 4.5 Rendering Approach (Architectural Decision)

Steamroller uses **MagicString-based source transformation** (same approach as rollup):

- [ ] Original source text is preserved; modifications are applied as targeted edits via MagicString
- [ ] Import/export statements are overwritten with format-appropriate code
- [ ] Unused statements are removed via `MagicString.remove(start, end)`
- [ ] Variable references that need deconfliction are overwritten in-place
- [ ] This approach preserves original formatting, comments, and whitespace in non-modified regions
- [ ] Source maps are accurate because MagicString tracks every edit's original position
- [ ] Alternative (AST re-printing) was rejected: it would lose original formatting and produce worse source maps

### 4.6 Variable Name Deconfliction

When concatenating multiple modules into a single chunk, top-level bindings may collide:

- [ ] Collect all top-level declared names from all modules in the chunk
- [ ] Detect collisions (same name declared in 2+ modules)
- [ ] Rename strategy: append `$1`, `$2`, etc. until unique (e.g., `foo` → `foo$1`)
- [ ] Also deconflict against:
  - JavaScript reserved words
  - Global built-ins (`undefined`, `NaN`, `Infinity`, `arguments`)
  - Format-specific globals (`exports`, `module`, `require`, `define`, `System`)
  - Names introduced by the output wrapper
- [ ] Update all references to renamed bindings throughout the chunk
- [ ] Renamed bindings in export statements must use `{ original as renamed }` syntax
- [ ] Namespace objects must map original export names to deconflicted internal names

### 4.7 RollupBuild Object

- [ ] `cache: RollupCache | undefined` — module cache for incremental rebuilds
- [ ] `close(): Promise<void>` — release resources
- [ ] `closed: boolean` — whether `close()` has been called
- [ ] `[Symbol.asyncDispose](): Promise<void>` — support `await using build = await rollup(options)`
- [ ] `generate(outputOptions): Promise<RollupOutput>` — generate output in memory
- [ ] `write(outputOptions): Promise<RollupOutput>` — generate and write to disk
- [ ] `getTimings(): SerializedTimings` — available only when `perf: true`
  - Phase timing: `initialize`, `generate module graph`, `sort and bind modules`, `mark included statements` (per tree-shaking pass), `initialize render`, `generate chunks`, `render chunks`, `transform chunks`, `generate bundle`
  - Memory allocation per phase
  - Format: `Record<string, [number, number, number]>` (time ms, memory bytes, total memory bytes)
- [ ] `watchFiles: string[]` — all files that were read during the build

### 4.8 Output Validation

- [ ] `validate` output option: re-parse generated output chunks and verify they are syntactically valid JavaScript
- [ ] Report validation errors with chunk name and parse error details

### 4.9 Banner/Footer/Intro/Outro

- [ ] `banner` option (string or function, outside wrapper)
- [ ] `footer` option (string or function, outside wrapper)
- [ ] `intro` option (string or function, inside wrapper)
- [ ] `outro` option (string or function, inside wrapper)
- [ ] Per-chunk function variants receive `RenderedChunk`

---

## 8. Phase 5: Source Maps

### 5.1 VLQ Codec

- [ ] VLQ (Variable-Length Quantity) encoding
- [ ] VLQ decoding
- [ ] Base64 character mapping
- [ ] Segment format: `[generatedColumn, sourceIndex, originalLine, originalColumn, nameIndex]`

### 5.2 MagicString

Reimplement `magic-string` functionality (MIT, currently bundled by rollup):

- [ ] `MagicString` class:
  - `overwrite(start, end, content)` / `update(start, end, content)`
  - `appendLeft(index, content)`, `appendRight(index, content)`
  - `prependLeft(index, content)`, `prependRight(index, content)`
  - `remove(start, end)`
  - `move(start, end, index)`
  - `indent(str?)`, `trim()`, `trimStart()`, `trimEnd()`
  - `slice(start, end)`
  - `toString()`, `generateMap(options)`, `generateDecodedMap(options)`
  - `clone()`, `snip(start, end)`
  - `hasChanged()`, `isEmpty()`
  - `length`, `original`, `storedNames`
- [ ] `Bundle` class for concatenating MagicString instances with source maps

### 5.3 Source Map Composition

- [ ] Compose maps from transform chain (plugin transforms)
- [ ] `this.getCombinedSourcemap()` in transform context
- [ ] Merge maps during `renderChunk` hook
- [ ] Final map generation at output time

### 5.4 Source Map Output

- [ ] `SourceMap` type with `toString()` and `toUrl()` methods
- [ ] `debugId` support (`sourcemapDebugIds` option)
- [ ] Output modes:
  - `sourcemap: true` → separate `.map` file + `//# sourceMappingURL=...`
  - `sourcemap: 'inline'` → base64 data URI appended
  - `sourcemap: 'hidden'` → separate file, no URL comment
  - `sourcemap: false` → no map
- [ ] `sourcemapBaseUrl` option
- [ ] `sourcemapExcludeSources` option
- [ ] `sourcemapFile` option
- [ ] `sourcemapFileNames` option
- [ ] `sourcemapPathTransform` function
- [ ] `sourcemapIgnoreList` function (populates `x_google_ignoreList`)

---

## 9. Phase 6: Plugin System

### 6.1 Plugin Driver

- [ ] Hook execution strategies:
  - **first**: sequential, stop at first non-null return
  - **sequential**: all plugins in order, each awaits previous
  - **parallel**: all plugins start, do not block each other
- [ ] Hook modifiers (object form `{handler, order?, sequential?, filter?}`):
  - `order: 'pre' | 'post' | null`
  - `sequential: true` (force parallel hooks to serialize)
  - `filter: {id?: StringFilter, code?: StringFilter}` (conditional execution)
- [ ] Sync vs async hook enforcement
- [ ] Plugin ordering (user-specified + `order` modifier)

### 6.2 Build Phase Hooks (9 hooks)

| # | Hook | Type | Semantics |
|---|------|------|-----------|
| 1 | `options` | async | sequential |
| 2 | `buildStart` | async | parallel |
| 3 | `resolveId` | async | first |
| 4 | `resolveDynamicImport` | async | first |
| 5 | `load` | async | first |
| 6 | `shouldTransformCachedModule` | async | first |
| 7 | `transform` | async | sequential |
| 8 | `moduleParsed` | async | parallel |
| 9 | `buildEnd` | async | parallel |

### 6.3 Output Generation Hooks (14 hooks)

| # | Hook | Type | Semantics |
|---|------|------|-----------|
| 10 | `outputOptions` | sync | sequential |
| 11 | `renderStart` | async | parallel |
| 12 | `renderDynamicImport` | sync | first |
| 13 | `resolveFileUrl` | sync | first |
| 14 | `resolveImportMeta` | sync | first |
| 15 | `banner` | async | sequential |
| 16 | `footer` | async | sequential |
| 17 | `intro` | async | sequential |
| 18 | `outro` | async | sequential |
| 19 | `renderChunk` | async | sequential |
| 20 | `augmentChunkHash` | sync | sequential |
| 21 | `generateBundle` | async | sequential |
| 22 | `writeBundle` | async | parallel |
| 23 | `renderError` | async | parallel |
| 24 | `closeBundle` | async | parallel |

### 6.4 Watch Hooks (2 hooks)

| # | Hook | Type | Semantics |
|---|------|------|-----------|
| 25 | `watchChange` | async | parallel |
| 26 | `closeWatcher` | async | parallel |

### 6.5 Cross-Cutting Hooks (1 hook)

| # | Hook | Type | Semantics |
|---|------|------|-----------|
| 27 | `onLog` | sync | sequential |

### 6.6 Plugin Context (`this.*`)

Module operations:
- [ ] `this.addWatchFile(id: string): void`
- [ ] `this.load(options: {id, resolveDependencies?, ...ModuleOptions}): Promise<ModuleInfo>`
- [ ] `this.resolve(source, importer?, {attributes?, custom?, isEntry?, skipSelf?}): Promise<ResolvedId | null>`
- [ ] `this.parse(code, options?): AstNode` (synchronous ESTree parse)
- [ ] `this.getModuleIds(): IterableIterator<string>`
- [ ] `this.getModuleInfo(moduleId): ModuleInfo | null`
- [ ] `this.getWatchFiles(): string[]`

Asset/chunk emission:
- [ ] `this.emitFile(emittedFile: EmittedFile): string` (returns referenceId)
- [ ] `this.getFileName(referenceId: string): string`
- [ ] `this.setAssetSource(referenceId: string, source: string | Uint8Array): void`

Source maps:
- [ ] `this.getCombinedSourcemap(): SourceMap` (only in `transform` hook via `TransformPluginContext`)

Logging:
- [ ] `this.error(error, pos?): never`
- [ ] `this.warn(log, pos?): void`
- [ ] `this.info(log, pos?): void`
- [ ] `this.debug(log, pos?): void`

Metadata:
- [ ] `this.meta: {rollupVersion: string, watchMode: boolean}`
- [ ] `this.cache: PluginCache` with `get<T>(id, cb?)`, `set(id, value)`, `has(id)`, `delete(id)`
- [ ] `this.fs: RollupFsModule`

### 6.7 EmittedFile Types

- [ ] `EmittedAsset`: `{type: 'asset', fileName?, name?, needsCodeReference?, originalFileName?, source?}`
- [ ] `EmittedChunk`: `{type: 'chunk', id, fileName?, implicitlyLoadedAfterOneOf?, importer?, name?, preserveSignature?}`
- [ ] `EmittedPrebuiltChunk`: `{type: 'prebuilt-chunk', code, fileName, exports?, map?, sourcemapFileName?}`

---

## 10. Phase 7: Code Splitting

### 7.1 Split Point Detection

- [ ] Dynamic `import()` expressions create split points
- [ ] Multiple entry points create implicit split points
- [ ] `implicitlyLoadedBefore` / `implicitlyLoadedAfterOneOf` plugin-driven splits

### 7.2 Chunk Assignment

- [ ] Assign modules to chunks based on:
  - Entry point ownership
  - Shared dependency extraction (modules imported by 2+ chunks)
  - `manualChunks` option (object or function form)
- [ ] `preserveModules` mode (1 output file per input module)
- [ ] `inlineDynamicImports` mode (force single output)
- [ ] `experimentalMinChunkSize` (merge small chunks below byte threshold)

### 7.3 Chunk Naming

- [ ] `entryFileNames` pattern (default `"[name].js"`)
- [ ] `chunkFileNames` pattern (default `"[name]-[hash].js"`)
- [ ] `assetFileNames` pattern (default `"assets/[name]-[hash][extname]"`)
- [ ] Placeholders: `[name]`, `[hash]`, `[format]`, `[extname]`
- [ ] `hashCharacters` option: `'base64'`, `'base36'`, `'hex'`
- [ ] `sanitizeFileName` option (boolean or function)

### 7.4 Chunk Optimization

- [ ] `preserveEntrySignatures`: `'strict'`, `'allow-extension'`, `'exports-only'`, `false`
- [ ] `hoistTransitiveImports` option
- [ ] `minifyInternalExports` option

### 7.5 Content Hashing

- [ ] xxHash implementation in pure TypeScript
- [ ] Three encoding variants: base64url, base36, base16 (hex)
- [ ] Hash incorporates (in deterministic order):
  - Rendered chunk code content (after all transforms)
  - `augmentChunkHash` plugin contributions
  - Referenced file names and emitted asset hashes (for referential stability)
  - Import/export bindings structure (so adding an unused export changes the hash)
  - Dependent chunk hashes (transitive hash stability)
  - Output format and relevant output options (so changing format changes hashes)
- [ ] Hash length: 21 characters for base64, proportionally longer for base36/hex
- [ ] Deterministic ordering: modules within chunks sorted consistently to ensure identical inputs always produce identical hashes

---

## 11. Phase 8: Output Formats

### 8.1 ES Module Format (`es` / `esm` / `module`)

- [ ] Preserve `import`/`export` statements
- [ ] No wrapper function
- [ ] Native `import()` for dynamic imports
- [ ] Native code splitting support
- [ ] No `"use strict"` (implicit in ES modules)

### 8.2 CommonJS Format (`cjs` / `commonjs`)

- [ ] `'use strict';` at top (controlled by `strict` option)
- [ ] Exports via `exports.name = value` or `module.exports = value`
- [ ] `__esModule` property insertion (controlled by `esModule` option)
- [ ] `dynamicImportInCjs` option (use `import()` or `require()` for dynamic imports)
- [ ] `require()` for inter-chunk imports in code-split output

### 8.3 UMD Format (`umd`)

- [ ] Factory function wrapper detecting CJS, AMD, or global
- [ ] `name` option required (global variable name)
- [ ] `globals` mapping for external dependencies
- [ ] `extend` option (extend existing global vs replace)
- [ ] `noConflict` option (generate `noConflict()` method)
- [ ] `'use strict';` inside wrapper

### 8.4 AMD Format (`amd`)

- [ ] `define(['deps'], function(deps) { ... })` wrapper
- [ ] `amd.id` option (named vs anonymous modules)
- [ ] `amd.autoId` option
- [ ] `amd.basePath` option
- [ ] `amd.define` option (custom define function name)
- [ ] `amd.forceJsExtensionForImports` option

### 8.5 IIFE Format (`iife`)

- [ ] `var Name = (function(deps) { ... })(globals)` wrapper
- [ ] `name` option required
- [ ] `globals` mapping
- [ ] `extend` option
- [ ] `'use strict';` inside wrapper

### 8.6 SystemJS Format (`system` / `systemjs`)

- [ ] `System.register([], function(exports) { ... })` wrapper
- [ ] Setter/getter mechanism for live bindings
- [ ] `systemNullSetters` option (replace empty setters with `null`)
- [ ] Eager export registration

### 8.7 Cross-Format Concerns

- [ ] `exports` option: `'auto'`, `'default'`, `'named'`, `'none'`
- [ ] `interop` option for CJS/external default import handling
- [ ] `paths` option (rewrite external import paths)
- [ ] `externalImportAttributes` option
- [ ] `importAttributesKey` option (`'with'` or `'assert'`)
- [ ] `virtualDirname` option

---

## 12. Phase 9: Watch Mode

### 9.1 File Watcher

- [ ] Implement file watching using `fs.watch` (Node.js built-in, no chokidar dependency)
- [ ] Debouncing via `watch.buildDelay` option
- [ ] `watch.include` / `watch.exclude` glob filtering
- [ ] Change event types: `'create'`, `'update'`, `'delete'`
- [ ] `chokidar` options compatibility layer (map to native `fs.watch` where possible)
- [ ] `watch.allowInputInsideOutputPath` option

### 9.2 Watch Event Emitter

- [ ] `RollupWatcher` class implementing `AwaitingEventEmitter`:
  - `on(event, handler)`, `off(event, handler)`
  - `onCurrentRun(event, handler)`, `removeListenersForCurrentRun()`
  - `close(): Promise<void>`
  - `emit(event, ...args)`
  - `removeAllListeners()`
- [ ] Events: `'change'`, `'close'`, `'event'`, `'restart'`
- [ ] Watch event sequence: `START` → `BUNDLE_START` → `BUNDLE_END` → `END` (or `ERROR`)
- [ ] `BUNDLE_END` includes `result: RollupBuild` for `generate()`/`write()`

### 9.3 Incremental Rebuild

- [ ] Cache reuse between rebuilds
- [ ] Only re-parse changed modules
- [ ] `shouldTransformCachedModule` hook for plugin-controlled cache invalidation
- [ ] Set `ROLLUP_WATCH=true` environment variable
- [ ] `watch.skipWrite` option (rebuild without writing to disk)
- [ ] `watch.clearScreen` option

### 9.4 Watch CLI Hooks

- [ ] `--watch.onStart <cmd>` — shell command on START event
- [ ] `--watch.onBundleStart <cmd>` — shell command on BUNDLE_START
- [ ] `--watch.onBundleEnd <cmd>` — shell command on BUNDLE_END
- [ ] `--watch.onEnd <cmd>` — shell command on END
- [ ] `--watch.onError <cmd>` — shell command on ERROR

---

## 13. Phase 10: CLI

### 10.1 Argument Parser

- [ ] Parse all 80+ CLI flags (see section 17 for full list)
- [ ] Support short flags (`-c`, `-d`, `-e`, `-f`, `-g`, `-h`, `-i`, `-m`, `-n`, `-o`, `-p`, `-v`, `-w`)
- [ ] Support `--no-*` negation flags
- [ ] Support dot-notation for nested options (`--treeshake.annotations`, `--amd.id`, etc.)
- [ ] Support comma-separated values (`-e lodash,react`)
- [ ] Support repeatable flags (`-p plugin1 -p plugin2`)
- [ ] `--environment KEY:VALUE,...` for config-time env vars
- [ ] `--stdin=ext` and `--no-stdin` support
- [ ] Zero dependencies (no yargs/commander)

### 10.2 Config File Loading

- [ ] Config file discovery: `steamroller.config.mjs` → `.cjs` → `.js` → `rollup.config.mjs` → `.cjs` → `.js` (rollup names for migration convenience)
- [ ] Config as: object, array, function, async function
- [ ] `--configPlugin` support (transpile config file)
- [ ] `--configImportAttributesKey` option
- [ ] `--bundleConfigAsCjs` option
- [ ] `defineConfig()` type helper (3 overloads)
- [ ] `loadConfigFile()` public API
- [ ] Merge CLI options with config file options (CLI takes precedence)

### 10.3 Terminal Output

- [ ] Colored output (detect terminal support, no picocolors dependency)
- [ ] Build summary (input → output, size, timing)
- [ ] Warning display with code location
- [ ] `--silent` mode
- [ ] `--logLevel` support (`debug`, `info`, `warn`)
- [ ] `--failAfterWarnings` (exit code 1)
- [ ] `--filterLogs` with `key:value` syntax, `!` negation, `*` wildcard, `&` conjunction
- [ ] `--perf` performance timing output
- [ ] `--validate` output validation
- [ ] Progress display in watch mode

### 10.4 Log Filter

- [ ] `getLogFilter(filters: string[]): (log: RollupLog) => boolean`
- [ ] Exported from `steamroller/getLogFilter` sub-entry

### 10.5 Miscellaneous CLI Features

- [ ] `--forceExit` (process.exit when done)
- [ ] `--waitForBundleInput` (wait for entry files to exist)
- [ ] `--strictDeprecations` (throw on deprecated features)
- [ ] stdin support (pipe code as input)

---

## 14. Phase 11: Configuration

### 11.1 Input Options Normalization

- [ ] Normalize `input` (string → `{main: string}`)
- [ ] Normalize `external` (string/regex/array → function)
- [ ] Normalize `plugins` (flatten arrays, remove falsy)
- [ ] Normalize `treeshake` (boolean/preset → full options)
- [ ] Normalize `jsx` (preset → full options)
- [ ] Apply defaults for all omitted options
- [ ] Produce `NormalizedInputOptions`

### 11.2 Output Options Normalization

- [ ] Validate format-specific requirements (`name` for umd/iife)
- [ ] Validate `file` vs `dir` mutual exclusivity
- [ ] Validate code splitting constraints
- [ ] Normalize `generatedCode` (preset → full options)
- [ ] Normalize `interop` (string → function)
- [ ] Apply format-specific defaults
- [ ] Produce `NormalizedOutputOptions`

### 11.3 Option Validation & Deprecation

- [ ] Unknown option warnings
- [ ] Deprecated option handling (warn or throw based on `strictDeprecations`)
- [ ] Conflicting option detection and error messages

---

## 15. Phase 12: Compatibility & Conformance

### 12.1 Rollup Test Suite Compatibility

- [ ] Port/adapt rollup's own test suite (MIT licensed)
- [ ] Run identical inputs through both rollup and steamroller
- [ ] Diff outputs for behavioral parity
- [ ] Test all 6 output formats
- [ ] Test all tree-shaking scenarios
- [ ] Test all code splitting scenarios
- [ ] Test circular dependency handling
- [ ] Test external dependency handling
- [ ] Test source map accuracy
- [ ] Test plugin hook ordering and semantics
- [ ] Test error/warning messages

### 12.2 Plugin Ecosystem Compatibility

- [ ] Verify compatibility with official `@rollup/plugin-*` plugins:
  - `@rollup/plugin-node-resolve`
  - `@rollup/plugin-commonjs`
  - `@rollup/plugin-json`
  - `@rollup/plugin-typescript`
  - `@rollup/plugin-babel`
  - `@rollup/plugin-terser`
  - `@rollup/plugin-alias`
  - `@rollup/plugin-replace`
  - `@rollup/plugin-virtual`
  - `@rollup/plugin-wasm`
  - `@rollup/plugin-url`
  - `@rollup/plugin-image`
  - `@rollup/plugin-yaml`
  - `@rollup/plugin-dsv`
  - `@rollup/plugin-html`
  - `@rollup/plugin-inject`
  - `@rollup/plugin-strip`
  - `@rollup/plugin-sucrase`
  - `@rollup/plugin-graphql`
  - `@rollup/plugin-beep`

### 12.3 Build Tool Compatibility

- [ ] Verify steamroller works as a drop-in for rollup in:
  - Vite (uses rollup for production builds)
  - Svelte (uses rollup)
  - Various rollup-based library build tools

### 12.4 Performance Benchmarks

- [ ] Parse time comparison (steamroller TS parser vs rollup native parser)
- [ ] Bundle time for small projects (< 100 modules)
- [ ] Bundle time for medium projects (100-1000 modules)
- [ ] Bundle time for large projects (1000+ modules)
- [ ] Memory usage comparison
- [ ] Watch mode rebuild speed
- [ ] Identify and optimize hot paths

---

## 16. Public API Surface

### Entry: `steamroller` (main)

```typescript
export function rollup(options: RollupOptions): Promise<RollupBuild>;
export function watch(config: RollupWatchOptions | RollupWatchOptions[]): RollupWatcher;
export function defineConfig(options: RollupOptions): RollupOptions;
export function defineConfig(options: RollupOptions[]): RollupOptions[];
export function defineConfig(optionsFunction: RollupOptionsFunction): RollupOptionsFunction;
export const VERSION: string;
```

### Entry: `steamroller/parseAst`

```typescript
export function parseAst(input: string, options?: ParseAstOptions): ProgramNode;
export function parseAstAsync(input: string, options?: ParseAstAsyncOptions): Promise<ProgramNode>;
```

### Entry: `steamroller/loadConfigFile`

```typescript
export function loadConfigFile(
  fileName: string,
  commandOptions: any,
  watchMode?: boolean
): Promise<{options: MergedRollupOptions[]; warnings: BatchWarnings}>;
```

### Entry: `steamroller/getLogFilter`

```typescript
export function getLogFilter(filters: string[]): (log: RollupLog) => boolean;
```

---

## 17. Configuration Options

### Full Input Options List

| Option | Type | Default |
|---|---|---|
| `input` | `string \| string[] \| Record<string,string>` | required |
| `plugins` | `InputPluginOption` | `[]` |
| `external` | `ExternalOption` | `[]` |
| `cache` | `boolean \| RollupCache` | `true` |
| `context` | `string` | `"undefined"` |
| `experimentalCacheExpiry` | `number` | — |
| `experimentalLogSideEffects` | `boolean` | `false` |
| `fs` | `RollupFsModule` | Node.js fs |
| `jsx` | `false \| JsxPreset \| JsxOptions` | `false` |
| `logLevel` | `LogLevelOption` | `"info"` |
| `makeAbsoluteExternalsRelative` | `boolean \| "ifRelativeSource"` | `"ifRelativeSource"` |
| `maxParallelFileOps` | `number` | `1000` |
| `moduleContext` | `function \| Record<string,string>` | — |
| `onLog` | `LogHandlerWithDefault` | — |
| `onwarn` | `WarningHandlerWithDefault` | — |
| `perf` | `boolean` | `false` |
| `preserveEntrySignatures` | `PreserveEntrySignaturesOption` | `"exports-only"` |
| `preserveSymlinks` | `boolean` | `false` |
| `shimMissingExports` | `boolean` | `false` |
| `strictDeprecations` | `boolean` | `false` |
| `treeshake` | `boolean \| TreeshakingPreset \| TreeshakingOptions` | `true` |
| `watch` | `WatcherOptions \| false` | — |

### Full Output Options List

| Option | Type | Default |
|---|---|---|
| `format` | `ModuleFormat` | `"es"` |
| `file` | `string` | — |
| `dir` | `string` | — |
| `name` | `string` | — |
| `globals` | `GlobalsOption` | `{}` |
| `plugins` | `OutputPluginOption` | `[]` |
| `assetFileNames` | `string \| function` | `"assets/[name]-[hash][extname]"` |
| `banner` | `AddonHook` | — |
| `chunkFileNames` | `string \| function` | `"[name]-[hash].js"` |
| `compact` | `boolean` | `false` |
| `dynamicImportInCjs` | `boolean` | `true` |
| `entryFileNames` | `string \| function` | `"[name].js"` |
| `esModule` | `boolean \| "if-default-prop"` | `"if-default-prop"` |
| `experimentalMinChunkSize` | `number` | `1` |
| `exports` | `"auto" \| "default" \| "named" \| "none"` | `"auto"` |
| `extend` | `boolean` | `false` |
| `externalImportAttributes` | `boolean` | `true` |
| `externalLiveBindings` | `boolean` | `true` |
| `footer` | `AddonHook` | — |
| `freeze` | `boolean` | `true` |
| `generatedCode` | `"es5" \| "es2015" \| GeneratedCodeOptions` | `"es5"` |
| `hashCharacters` | `HashCharacters` | `"base64"` |
| `hoistTransitiveImports` | `boolean` | `true` |
| `importAttributesKey` | `ImportAttributesKey` | `"assert"` |
| `indent` | `boolean \| string` | `true` |
| `inlineDynamicImports` | `boolean` | `false` |
| `interop` | `InteropType \| GetInterop` | `"default"` |
| `intro` | `AddonHook` | — |
| `manualChunks` | `ManualChunksOption` | — |
| `minifyInternalExports` | `boolean` | format-dependent |
| `noConflict` | `boolean` | `false` |
| `outro` | `AddonHook` | — |
| `paths` | `Record<string,string> \| function` | — |
| `preserveModules` | `boolean` | `false` |
| `preserveModulesRoot` | `string` | — |
| `reexportProtoFromExternal` | `boolean` | `true` |
| `sanitizeFileName` | `boolean \| function` | `true` |
| `sourcemap` | `boolean \| "inline" \| "hidden"` | `false` |
| `sourcemapBaseUrl` | `string` | — |
| `sourcemapDebugIds` | `boolean` | `false` |
| `sourcemapExcludeSources` | `boolean` | `false` |
| `sourcemapFile` | `string` | — |
| `sourcemapFileNames` | `string \| function` | — |
| `sourcemapIgnoreList` | `boolean \| function` | — |
| `sourcemapPathTransform` | `function` | — |
| `strict` | `boolean` | `true` |
| `systemNullSetters` | `boolean` | `true` |
| `validate` | `boolean` | `false` |
| `virtualDirname` | `string` | `"_virtual"` |
| `amd` | `AmdOptions` | — |

---

## 18. Type System

### Types to Export

All types from rollup's `rollup.d.ts` must be re-exported with identical signatures. Major type categories:

**Core types:** `RollupOptions`, `MergedRollupOptions`, `InputOptions`, `OutputOptions`, `NormalizedInputOptions`, `NormalizedOutputOptions`, `RollupBuild`, `RollupOutput`, `RollupWatcher`, `RollupCache`

**Output types:** `OutputChunk`, `OutputAsset`, `RenderedChunk`, `PreRenderedChunk`, `RenderedModule`, `OutputBundle`, `PreRenderedAsset`

**Plugin types:** `Plugin`, `OutputPlugin`, `PluginHooks`, `FunctionPluginHooks`, `InputPluginHooks`, `OutputPluginHooks`, `PluginContext`, `TransformPluginContext`, `MinimalPluginContext`, `PluginCache`, `EmittedFile`, `EmittedAsset`, `EmittedChunk`, `EmittedPrebuiltChunk`

**Hook types:** `ResolveIdHook`, `LoadHook`, `TransformHook`, `ModuleParsedHook`, `RenderChunkHook`, all other hook type aliases

**Module types:** `ModuleInfo`, `ModuleJSON`, `TransformModuleJSON`, `ModuleOptions`, `ResolvedId`, `PartialResolvedId`, `ResolveIdResult`, `SourceDescription`, `LoadResult`, `TransformResult`

**Source map types:** `SourceMap`, `SourceMapSegment`, `ExistingDecodedSourceMap`, `ExistingRawSourceMap`, `DecodedSourceMapOrMissing`, `SourceMapInput`

**Option types:** `ExternalOption`, `GlobalsOption`, `InputOption`, `ManualChunksOption`, `ModuleSideEffectsOption`, `PreserveEntrySignaturesOption`, `TreeshakingOptions`, `TreeshakingPreset`, `GeneratedCodeOptions`, `NormalizedGeneratedCodeOptions`, `NormalizedTreeshakingOptions`, `JsxOptions`, `NormalizedJsxOptions`, `JsxPreset`, `AmdOptions`, `NormalizedAmdOptions`, `WatcherOptions`, `ChokidarOptions`, `RollupWatchOptions`, `RollupWatchHooks`

**Utility types:** `MaybeArray<T>`, `MaybePromise<T>`, `PartialNull<T>`, `NullValue`, `ObjectHook<T,O>`, `HookFilter`, `StringFilter`, `StringOrRegExp`

**Log types:** `RollupError`, `RollupLog`, `LogLevel`, `LogLevelOption`, `LogHandler`, `LogHandlerWithDefault`, `LoggingFunction`, `LoggingFunctionWithPosition`

**AST types:** `RollupAstNode<T>`, `AstNode`, `ProgramNode`

**FS types:** `RollupFsModule`, `RollupDirectoryEntry`, `RollupFileStats`, `BufferEncoding`

**Watch types:** `ChangeEvent`, `RollupWatcherEvent`, `AwaitingEventEmitter`, `AwaitedEventListener`

**Misc types:** `SerializedTimings`, `SerializablePluginCache`, `InteropType`, `GetInterop`, `InternalModuleFormat`, `ModuleFormat`, `ImportAttributesKey`, `HashCharacters`, `GetManualChunk`, `ManualChunkMeta`, `GetModuleInfo`, `EmitFile`, `BatchWarnings`, `LoadConfigFile`, `GetLogFilter`, `ParseAst`, `ParseAstAsync`, `PluginImpl`, `RollupOptionsFunction`

---

## 19. Testing Strategy

### Coverage Target: 98%

Per Asymmetric Effort coding standards, minimum 98% coverage across unit, integration, and E2E tests.

### Unit Tests (`tests/unit/`)

| Component | Key Test Areas |
|---|---|
| Lexer | All token types, edge cases (ASI, regex vs division, template literals, Unicode escapes, numeric separators, BigInt) |
| Parser | Every AST node type, error recovery, JSX, import attributes, destructuring, async/await, generators, classes, optional chaining, nullish coalescing |
| Scope analysis | All scope types, hoisting, TDZ, closures, class fields, static blocks |
| Tree-shaking | Side effect detection, pure annotations, all preset behaviors, multi-pass convergence |
| Code generator | All 6 formats, all interop modes, all generatedCode options, compact mode |
| Source maps | VLQ encode/decode, MagicString operations, map composition, all sourcemap options |
| Plugin driver | Hook execution order, first/sequential/parallel semantics, hook modifiers, plugin context methods |
| xxHash | Correctness against reference implementation, all 3 encodings |
| CLI args | All flags, negation, dot notation, comma separation, env vars |
| Config loader | All config formats, merging, validation |
| Chunk splitter | Dynamic imports, multiple entries, manualChunks, preserveModules |

### Integration Tests (`tests/integration/`)

| Scenario | Description |
|---|---|
| Basic bundling | Single entry, multiple modules, ES output |
| Tree-shaking | Dead code elimination with various module patterns |
| Code splitting | Dynamic imports, shared chunks, manual chunks |
| All formats | Same input → all 6 output formats, verify correctness |
| External deps | External marking, globals, interop |
| Circular deps | Warning emission, correct output ordering |
| Source maps | Accuracy through transform chains |
| Plugin hooks | Full hook lifecycle with test plugins |
| Cache | Rebuild with cache, cache invalidation |
| Emitted files | Assets, chunks, prebuilt chunks |

### E2E Tests (`tests/e2e/`)

| Scenario | Description |
|---|---|
| CLI | All flag combinations, config file loading, stdin |
| Watch mode | File change detection, rebuild, event sequence |
| Compatibility | Same input through rollup and steamroller, diff outputs |
| Plugin ecosystem | Official @rollup/plugin-* compatibility |
| Real projects | Bundle actual open-source libraries (see targets below) |
| Performance | Benchmarks against rollup (see §24 for budget) |

### Fuzz Testing (`tests/fuzz/`)

- [ ] Grammar-aware fuzzer for the parser — generate random but syntactically plausible JS, verify no crashes
- [ ] Seed corpus from Test262 test suite (~50K files)
- [ ] Differential fuzzing: parse with steamroller and acorn, compare ASTs
- [ ] Crash/hang detection with timeout limits
- [ ] Run in CI as a nightly job (too slow for per-commit)

### Snapshot Testing

- [ ] Snapshot output for each of the 6 output formats with a fixed input
- [ ] Snapshot error/warning messages with their codes
- [ ] Snapshot source maps (decoded segments) for a fixed input through a transform chain
- [ ] Snapshot chunk hashes for determinism verification

### Real-World Project Targets

Test steamroller as a drop-in bundler for these open-source projects:

| Project | Why | Complexity |
|---|---|---|
| `d3` | Large library, deep re-exports, tree-shaking critical | High |
| `three.js` | Very large (1000+ modules), ES modules | High |
| `svelte` (compiler output) | Uses rollup directly | Medium |
| `preact` | Small but exercises all export patterns | Low |
| `lodash-es` | Hundreds of small modules, tree-shaking showcase | Medium |
| A Vite-based app | Validates Vite integration path | High |

### Regression Testing

- [ ] CI runs differential test: same inputs through rollup v4.60.4 and steamroller, diff outputs
- [ ] Any behavioral difference must be explicitly documented and justified
- [ ] Error code parity tests: trigger every error code from §23, verify exact `code` string

---

## 20. Licensing & Compliance

### License

- Steamroller: **MIT**
- All code: original implementation, no copied code from rollup or dependencies
- Rollup's API design (function signatures, option names, type definitions) are not copyrightable (functional interfaces)

### Compliance Checks

- [ ] `LICENSE` file with MIT text
- [ ] `package.json` `license` field: `"MIT"`
- [ ] No runtime dependencies (zero supply chain risk)
- [ ] No hardcoded secrets or credentials
- [ ] CodeQL enabled
- [ ] Dependabot enabled (devDependencies + GitHub Actions)
- [ ] All GitHub Actions pinned to commit SHAs
- [ ] `SECURITY.md` with vulnerability reporting procedures

### Third-Party Considerations

- Rollup is MIT licensed — studying its behavior and API for compatibility is permitted
- ESTree specification is open — implementing it is unrestricted
- Type definitions describe interfaces, not implementations — compatible types are not derivative works
- No code from rollup or its bundled dependencies will be copied
- If any algorithm from rollup is referenced during implementation, it will be independently reimplemented

---

## 21. Versioning & Distribution

### Versioning Strategy

Steamroller follows standard **semver** (Semantic Versioning):

- **MAJOR** (x.0.0): Breaking changes to the public API, removed features, incompatible behavioral changes
- **MINOR** (0.x.0): New features, new configuration options, new plugin hooks — all backward-compatible
- **PATCH** (0.0.x): Bug fixes, performance improvements, documentation updates

Steamroller versions are **independent** of rollup versions. The MVP targets feature parity with rollup v4.60.4, but after that steamroller may diverge, adding its own features or taking different design directions. There is no ongoing obligation to track rollup releases.

### Tag-Based Releases

Per coding standards, releases use git tags:
- [ ] Tags follow `v{MAJOR}.{MINOR}.{PATCH}` format (e.g., `v1.0.0`)
- [ ] Each tag triggers CI/CD publish pipeline
- [ ] `CHANGELOG.md` updated with every release
- [ ] Breaking changes documented with migration guidance

### MVP Version

- [ ] `v1.0.0` — first stable release with 100% feature parity with rollup v4.60.4
- [ ] Pre-1.0 releases (`v0.x.y`) for early testing, no stability guarantees

### Distribution Strategy

- [ ] Publish to npm as `steamroller`
- [ ] No `@scope` prefix (top-level package name)
- [ ] No rollup compatibility shim package — steamroller is its own product
- [ ] CLI binary is `steamroller` (not `rollup`)
- [ ] Config file discovery also checks `steamroller.config.mjs` → `.cjs` → `.js` (in addition to `rollup.config.*` for migration convenience)
- [ ] Users migrate by:
  1. `npm uninstall rollup && npm install steamroller`
  2. Replace `import { rollup } from 'rollup'` with `import { rollup } from 'steamroller'`
  3. Rename config file (optional — `rollup.config.*` still works)
  4. Replace `npx rollup` with `npx steamroller` in scripts

### `this.meta.rollupVersion` Behavior

- [ ] `this.meta.rollupVersion` returns steamroller's own version string
- [ ] `this.meta.watchMode` behaves identically to rollup
- [ ] Plugins that do version-gating against `this.meta.rollupVersion` may need to be patched — document this as a known migration concern

---

## 22. Cross-Platform Concerns

### Path Handling

- [ ] Normalize all internal paths to forward slashes (`/`) regardless of OS
- [ ] Accept backslash paths (`\`) on Windows as input, convert immediately
- [ ] Output paths always use forward slashes (matching rollup behavior)
- [ ] Handle UNC paths on Windows (`\\server\share`)
- [ ] Handle drive letters on Windows (`C:\...`)
- [ ] `path.posix` vs `path.win32` — use `path.posix` for all internal operations, `path` (platform-native) only at OS boundaries (fs reads/writes)

### Filesystem Case Sensitivity

- [ ] macOS HFS+ and Windows NTFS are case-insensitive; Linux ext4 is case-sensitive
- [ ] Module IDs must be compared case-sensitively (treat `Foo.js` and `foo.js` as different modules)
- [ ] Emit a warning when two module IDs differ only by case (likely a bug on case-insensitive filesystems)
- [ ] `sanitizeFileName` must handle platform-specific reserved characters (Windows: `<>:"/\|?*`, CON/PRN/NUL reserved names)

### Line Endings

- [ ] Parse both `\n` (LF) and `\r\n` (CRLF) correctly
- [ ] Preserve original line endings in non-modified source regions
- [ ] Source map line tracking must account for CRLF as a single line terminator
- [ ] Output uses `\n` by default (matching rollup)

### File Watching (Platform Differences)

- [ ] Linux `fs.watch` uses inotify — reliable but limited by `fs.inotify.max_user_watches`
- [ ] macOS `fs.watch` uses FSEvents — reliable, no watch limit
- [ ] Windows `fs.watch` uses ReadDirectoryChangesW — can miss rapid changes
- [ ] Fallback to polling (`fs.watchFile`) when `fs.watch` is unavailable or unreliable
- [ ] Handle file replacement patterns (write-to-temp + rename) used by editors like vim

### Symlinks

- [ ] `preserveSymlinks: false` (default): resolve symlinks via `fs.realpath` before module ID comparison
- [ ] `preserveSymlinks: true`: use the symlink path as the module ID
- [ ] Handle circular symlinks gracefully (detect and error)

---

## 23. Error & Warning Code System

Rollup uses a structured error/warning system with specific codes that plugins and tools inspect programmatically. Steamroller must reproduce these exactly.

### Error Codes (exhaustive list)

| Code | Trigger |
|---|---|
| `ALREADY_CLOSED` | Calling `generate()`/`write()` after `close()` |
| `AMBIGUOUS_EXTERNAL_NAMESPACES` | Multiple externals re-export the same name |
| `ANONYMOUS_PLUGIN_CACHE` | Plugin uses cache without `name` property |
| `ASSET_NOT_FINALISED` | `getFileName()` called before asset source is set |
| `ASSET_NOT_FOUND` | Invalid reference ID passed to `getFileName()` |
| `ASSET_SOURCE_ALREADY_SET` | `setAssetSource()` called twice |
| `ASSET_SOURCE_MISSING` | Asset emitted without setting source |
| `BAD_LOADER` | `load` hook returned non-string, non-null |
| `CANNOT_CALL_NAMESPACE` | Namespace import used as function call |
| `CANNOT_EMIT_FROM_OPTIONS_HOOK` | `emitFile()` called in `options` hook |
| `CHUNK_NOT_GENERATED` | `getFileName()` called before chunk generated |
| `CHUNK_INVALID` | Invalid emitted chunk configuration |
| `CIRCULAR_DEPENDENCY` | Circular import chain detected (warning) |
| `CIRCULAR_REEXPORT` | Circular re-export chain |
| `CONST_REASSIGN` | Assignment to `const` variable detected |
| `CYCLIC_CROSS_CHUNK_REEXPORT` | Cyclic cross-chunk re-export |
| `DEPRECATED_FEATURE` | Use of deprecated option or behavior |
| `DUPLICATE_ARGUMENT_NAME` | Duplicate parameter name in strict mode |
| `DUPLICATE_EXPORT` | Same name exported twice |
| `DUPLICATE_PLUGIN_NAME` | Two plugins share the same `name` |
| `EMPTY_BUNDLE` | Bundle has no chunks |
| `EVAL` | Use of `eval()` detected (warning) |
| `EXTERNAL_MODULES_CANNOT_BE_INCLUDED_IN_MANUAL_CHUNKS` | External module in `manualChunks` |
| `EXTERNAL_MODULES_CANNOT_BE_TRANSFORMED_TO_MODULES` | External marked as non-external by plugin |
| `EXTERNAL_SYNTHETIC_EXPORTS` | `syntheticNamedExports` on external module |
| `FILE_NAME_CONFLICT` | Two emitted files have the same `fileName` |
| `FILE_NOT_FOUND` | Referenced file does not exist |
| `FIRST_SIDE_EFFECT` | First side effect detected in module (with `experimentalLogSideEffects`) |
| `ILLEGAL_IDENTIFIER_AS_NAME` | Non-identifier used as UMD/IIFE `name` |
| `ILLEGAL_REASSIGNMENT` | Reassignment of import binding |
| `IMPORT_ATTRIBUTES_KEY_NOT_SUPPORTED` | Import attributes not supported in format |
| `INCONSISTENT_IMPORT_ATTRIBUTES` | Same module imported with different attributes |
| `INVALID_ANNOTATION` | Malformed pure annotation |
| `INVALID_CHUNK` | Invalid chunk configuration |
| `INVALID_CONFIG_MODULE_FORMAT` | Config file format issues |
| `INVALID_EXPORT_OPTION` | Invalid `exports` option value for the actual exports |
| `INVALID_EXTERNAL_ID` | External module ID issues |
| `INVALID_IMPORT_ATTRIBUTE` | Invalid import attribute |
| `INVALID_LOG_POSITION` | Position argument in logging outside valid range |
| `INVALID_OPTION` | Invalid configuration option value |
| `INVALID_PLUGIN_HOOK` | Plugin returned wrong type from hook |
| `INVALID_ROLLUP_PHASE` | Hook called in wrong build phase |
| `INVALID_SETASSETSOURCE` | Invalid `setAssetSource()` call |
| `MISSING_EXPORT` | Imported binding not exported by source module |
| `MISSING_GLOBAL_NAME` | External used in IIFE/UMD without `globals` mapping (warning) |
| `MISSING_IMPLICIT_DEPENDANT` | Implicit dependency not found |
| `MISSING_JSX_EXPORT` | JSX factory/fragment not exported |
| `MISSING_NAME_OPTION_FOR_IIFE_EXPORT` | IIFE/UMD format without `name` |
| `MISSING_NODE_BUILTINS` | Node.js built-in imported without marking external (warning) |
| `MISSING_OPTION` | Required option not provided |
| `MIXED_EXPORTS` | Module has both default and named exports (warning) |
| `MODULE_LEVEL_DIRECTIVE` | Module-level directive (like `"use strict"`) in unexpected position |
| `NAMESPACE_CONFLICT` | Conflicting re-exports in namespace |
| `NO_TRANSFORM_MAP_OR_AST_WITHOUT_CODE` | Plugin returned map/AST without code from transform |
| `OPTIMIZE_CHUNK_STATUS` | Chunk optimization status |
| `PARSE_ERROR` | JavaScript parse error |
| `PLUGIN_ERROR` | Uncaught error in plugin hook |
| `RESERVED_NAMESPACE` | Assignment to reserved namespace |
| `SHIMMED_EXPORT` | Export shimmed with `void 0` (when `shimMissingExports: true`) |
| `SOURCEMAP_BROKEN` | Source map chain broken by plugin |
| `SOURCEMAP_ERROR` | Source map processing error |
| `SYNTHETIC_NAMED_EXPORTS_NEED_NAMESPACE_EXPORT` | `syntheticNamedExports` without default/namespace export |
| `THIS_IS_UNDEFINED` | Top-level `this` rewritten to `undefined` (warning) |
| `UNEXPECTED_NAMED_IMPORT` | Named import from module with only default export |
| `UNKNOWN_OPTION` | Unrecognized configuration option (warning) |
| `UNRESOLVED_ENTRY` | Entry point could not be resolved |
| `UNRESOLVED_IMPORT` | Import could not be resolved (warning/error depending on context) |
| `UNUSED_EXTERNAL_IMPORT` | External import binding not used (warning) |
| `VALIDATION_ERROR` | Output validation failed (when `validate: true`) |

### Implementation Requirements

- [ ] Every error/warning includes a `code` string property matching the table above
- [ ] Error objects include: `code`, `message`, `id` (module), `pos` (byte offset), `loc` ({line, column, file}), `frame` (code frame with pointer), `stack`
- [ ] Warning objects include: `code`, `message`, plus context-specific properties
- [ ] `RollupLog` type covers both errors and warnings
- [ ] `frame` generation: show 2 lines before, the error line with a `^` pointer, and 2 lines after
- [ ] Plugins can inspect `code` on errors/warnings — exact string matching is required for compatibility

---

## 24. Performance Strategy

### Performance Budget

| Scenario | Target | Rationale |
|---|---|---|
| Small project (< 50 modules, < 10K LOC) | < 3x rollup wall time | Acceptable for dev workflows |
| Medium project (50–500 modules, 10K–100K LOC) | < 5x rollup wall time | Noticeable but tolerable |
| Large project (500+ modules, 100K+ LOC) | < 8x rollup wall time | Stretch goal; may require optimization passes |
| Parse single file (10K LOC) | < 50ms | Parser is the hot path |
| Watch mode incremental rebuild | < 2x rollup rebuild time | Critical for DX |
| Memory usage | < 2x rollup peak RSS | Prevent OOM on large projects |

### Parser Optimization Strategy

The parser is the primary performance bottleneck (replacing Rust native code with TypeScript):

- [ ] **Single-pass tokenization**: avoid re-scanning; tokenize on demand as the parser consumes
- [ ] **Avoid object allocation in hot paths**: reuse token objects, use numeric enums for token types
- [ ] **Typed arrays for position tracking**: use `Uint32Array` for source positions instead of object properties
- [ ] **String interning**: intern frequently-used identifier strings to reduce allocation
- [ ] **Pre-computed keyword lookup**: use a trie or perfect hash for keyword detection instead of `Set.has()`
- [ ] **Avoid regex in lexer hot path**: character-by-character scanning with switch statements
- [ ] **Profile-guided optimization**: benchmark against Test262 suite, optimize the top 10 hot functions

### Module Graph Optimization

- [ ] **Lazy parsing**: only fully parse modules that survive tree-shaking (parse imports/exports first, defer body)
- [ ] **Parallel module loading**: use `maxParallelFileOps` to batch concurrent fs reads
- [ ] **Module cache**: reuse parsed ASTs across rebuilds in watch mode
- [ ] **Efficient dependency tracking**: use array indices instead of Map lookups where possible

### Code Generation Optimization

- [ ] **String concatenation**: use array-of-strings + join instead of repeated string concatenation
- [ ] **Source map generation**: defer VLQ encoding until final output (work with decoded segments internally)
- [ ] **Chunk rendering**: render chunks in parallel where they don't share mutable state

### Profiling & Monitoring

- [ ] `perf: true` option instruments all phases with `performance.now()`
- [ ] `getTimings()` returns `SerializedTimings` — `Record<string, [timeMs, memoryBytes, totalMemoryBytes]>`
- [ ] Phases to instrument:
  - `# PARSE` (per module)
  - `# RESOLVE_ID` (per import)
  - `# TRANSFORM` (per module)
  - `# BUILD` (total build phase)
  - `# GENERATE` (total output phase)
  - `# TREESHAKE` (per pass)
  - `# RENDER_CHUNK` (per chunk)
  - `# WRITE` (disk I/O)
- [ ] CI benchmarks: track parse/bundle/render times per commit, alert on > 10% regression

### Future Performance Paths (Post-MVP)

- WASM compilation of parser via AssemblyScript or wasm-bindgen (if pure TS is too slow)
- Worker thread parallelism for parsing multiple modules concurrently
- Incremental parsing (re-parse only changed regions of a file in watch mode)
- Native addon escape hatch for performance-critical users (opt-in, not required)

---

## 25. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Parser correctness | High — incorrect AST breaks everything downstream | Medium | Exhaustive test suite against Test262; fuzz testing with AFL/libFuzzer-style harness; differential testing against acorn/SWC output on real-world codebases |
| Parser performance | High — pure TS parser will be slower than Rust/native | High | Concrete budget (see §24); profile against Test262; optimize top 10 hot functions; WASM escape hatch post-MVP if needed |
| Tree-shaking edge cases | High — incorrect elimination breaks user code | Medium | Port rollup's own tree-shaking test fixtures; differential testing; `experimentalLogSideEffects` for debugging |
| Source map accuracy | Medium — incorrect maps degrade debugging experience | Medium | Validate maps with `source-map` library; visual verification in Chrome/Firefox DevTools; snapshot tests for VLQ output |
| Plugin compatibility | High — plugins are rollup's primary value proposition | Medium | Test against top 20 official plugins; maintain compatibility test suite; exact error code parity (see §23) |
| Vite compatibility | High — Vite is rollup's largest consumer | Medium | Test steamroller as Vite's bundler; monitor Vite's rollup usage patterns; test with Vite's own test suite |
| Undocumented rollup behaviors | Medium — plugins may rely on behaviors not in docs | Medium | Differential testing at scale; run real-world projects through both bundlers; community bug reports |
| Cross-platform inconsistencies | Medium — path handling, case sensitivity, fs.watch differences | Medium | CI matrix: Linux + macOS + Windows; path normalization layer (see §22); platform-specific test fixtures |
| Error code mismatch | Medium — tools/plugins inspect error codes programmatically | Medium | Catalog all rollup error codes (see §23); test that every error path emits correct code string |
| Scope creep | Medium — rollup continues releasing new features | Certain | MVP targets v4.60.4 parity; post-MVP steamroller may diverge intentionally |
| ES spec evolution | Low — new syntax requires parser updates | Low | Modular parser grammar; each syntax feature is a self-contained module; Test262 subset as regression suite |
| npm name squatting | Low — `steamroller` name may be taken | Low | Check npm registry early; have fallback names ready |

---

## Appendix A: Rollup Native Code Functions (to reimplement in TypeScript)

| Function | Purpose | Steamroller Approach |
|---|---|---|
| `parse(code, allowReturnOutsideFunction, jsx)` | Synchronous JS/JSX parsing to ESTree AST | Pure TypeScript recursive descent parser |
| `parseAsync(code, allowReturnOutsideFunction, jsx, signal)` | Async parsing with AbortSignal | Same parser, wrapped in Promise with signal checking |
| `xxhashBase64Url(buffer)` | 128-bit xxHash, base64url encoded | Pure TypeScript xxHash128 implementation |
| `xxhashBase36(buffer)` | 128-bit xxHash, base36 encoded | Same hash, base36 encoding |
| `xxhashBase16(buffer)` | 128-bit xxHash, hex encoded | Same hash, hex encoding |

## Appendix B: Bundled Library Reimplementations (Complete)

All 30 of rollup's bundled dependencies must be replaced with zero-dependency implementations.

### Core Libraries

| Library | Purpose in Rollup | Steamroller Approach | Est. Lines |
|---|---|---|---|
| `magic-string` | String manipulation with source map tracking | Reimplement core API | ~500 |
| `@jridgewell/sourcemap-codec` | VLQ encode/decode for source maps | Reimplement | ~200 |
| `@rollup/pluginutils` | Plugin utility functions (`createFilter`, `dataToEsm`, `addExtension`, `attachScopes`, `extractAssignedNames`, `makeLegalIdentifier`) | Reimplement all exports | ~400 |

### File Watching Stack

| Library | Purpose in Rollup | Steamroller Approach | Est. Lines |
|---|---|---|---|
| `chokidar` | Cross-platform file watching | Use Node.js `fs.watch` / `fs.watchFile` with platform-specific handling | ~600 |
| `readdirp` | Recursive directory reading | `fs.readdir` with `{recursive: true}` (Node 18.17+) or manual recursion | ~100 |
| `anymatch` | Glob matching for watch include/exclude | Inline into watcher using our glob matcher | ~50 |
| `binary-extensions` | List of binary file extensions | Static array constant | ~10 |
| `is-binary-path` | Check if file path is binary | Check extension against static list | ~10 |
| `normalize-path` | Convert backslash paths to forward slash | `path.replace(/\\/g, '/')` | ~5 |

### Glob/Pattern Matching Stack

| Library | Purpose in Rollup | Steamroller Approach | Est. Lines |
|---|---|---|---|
| `picomatch` | Glob pattern matching engine | Reimplement glob-to-regex conversion | ~300 |
| `braces` | Brace expansion (`{a,b,c}`) | Reimplement | ~150 |
| `fill-range` | Numeric/alpha range expansion (`{1..5}`) | Reimplement | ~80 |
| `to-regex-range` | Numeric range to regex | Reimplement | ~60 |
| `is-number` | Check if value is a number | `typeof v === 'number' && !isNaN(v)` | ~5 |
| `glob-parent` | Extract non-glob parent directory | Scan for first glob character | ~30 |
| `is-extglob` | Detect extglob patterns | Regex check | ~5 |
| `is-glob` | Detect glob patterns | Character scan | ~20 |

### CLI Stack

| Library | Purpose in Rollup | Steamroller Approach | Est. Lines |
|---|---|---|---|
| `yargs-parser` | CLI argument parsing | Custom argument parser | ~400 |
| `picocolors` | Terminal color output | ANSI escape codes with `process.stdout.isTTY` detection | ~50 |
| `pretty-bytes` | Human-readable byte sizes | Reimplement | ~30 |
| `pretty-ms` | Human-readable millisecond durations | Reimplement | ~30 |
| `parse-ms` | Parse milliseconds into components | Reimplement | ~20 |
| `date-time` | Formatted date/time strings | `Intl.DateTimeFormat` or manual formatting | ~15 |
| `time-zone` | Timezone abbreviation | `Intl.DateTimeFormat` with `timeZoneName: 'short'` | ~10 |

### Utility Libraries

| Library | Purpose in Rollup | Steamroller Approach | Est. Lines |
|---|---|---|---|
| `signal-exit` | Reliable process exit handling | `process.on('exit'/'SIGINT'/'SIGTERM'/'SIGHUP')` with cleanup | ~60 |
| `is-reference` | Detect AST identifier references vs declarations | Reimplement (check parent node type) | ~50 |
| `locate-character` | Map byte offset to line/column | Reimplement (scan for newlines) | ~30 |
| `flru` | LRU cache for internal caching | Reimplement simple LRU with Map | ~40 |
| `builtin-modules` | List of Node.js built-in module names | Static array from `module.builtinModules` at build time | ~10 |
| `tslib` | TypeScript runtime helpers | Not needed — compile with `importHelpers: false`, inline helpers | 0 |

**Total estimated reimplementation: ~3,350 lines**

---

*MVP targets feature parity with rollup v4.60.4. After v1.0.0, steamroller versions are independent and may diverge from rollup's feature trajectory.*
