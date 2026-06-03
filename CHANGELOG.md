# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-06-03

### Fixed

- Resolve all CodeQL alerts: refactor arrow function downleveling to avoid code sanitization warnings
- Arrow `this` capture in nested arrow functions (downleveling and TypeScript transform)
- Tagged template literals no longer incorrectly converted to concatenation
- DCE try/catch: code after catch blocks no longer incorrectly marked as dead
- Mangle pass respects eval() scopes — variables in eval-containing functions are not renamed
- TSX files correctly parse JSX through the TypeScript plugin
- CSS Modules cross-file `composes:` references resolved
- WASM loader produces universal code (fetch in browser, fs.readFile in Node.js)
- Asset loader emits files during generateBundle for generate() support
- JSON loader produces tree-shakeable individual `export const` declarations
- Source map preservation through minification pipeline via MagicString tracking
- Native bindings: consistent wiring with STEAMROLLER_NATIVE/STEAMROLLER_DEBUG env vars
- Windows CI flake: increased timeout on timeZone formatting test

## [0.2.0] - 2026-06-03

### Added

- **Full TypeScript parsing**: Hand-written parser extended with 40+ TS AST node types — enums (regular/const/string), namespaces, parameter properties, interfaces, type aliases, generics, declare statements, type-only imports/exports. AST-based transforms: enums→IIFE, namespaces→IIFE objects, parameter properties→constructor assignments. 67 tests.
- **Full CSS parser and bundling**: Hand-written CSS tokenizer + recursive-descent parser with 23 AST types. Supports all selector types, at-rules (@media/@keyframes/@import/@font-face/@layer/@container/@supports), CSS nesting, custom properties, var(), CSS Modules (:local/:global/composes). CSS minifier, @import resolver, concatenator, and printer. Built-in css-plugin auto-registered. 111 tests.
- **Built-in CSS/JSON/asset import support**: JSON loader (tree-shakeable named exports), asset loader (.png/.svg/etc with ?inline and ?raw), text loader (.sql/.html/.md/.graphql), WASM loader (async init). Zero-config, plugin-free. 80 tests.
- **Advanced minification pipeline**: 6-pass AST-based pipeline — dead code elimination, constant folding (arithmetic/string/boolean/typeof), expression simplification (!!x→x, true→!0, undefined→void 0), scope-aware name mangling with frequency analysis, code compression (arrow body, shorthand, sequence expressions), minimal-whitespace emitter. Opt-in property mangling. 110 tests.
- **AST-based syntax downleveling**: Replaced regex transforms with AST-based MagicString edits. ES2015: nullish coalescing (temp vars), optional chaining (member/computed/method/chained), logical assignment, numeric separators. ES5: arrow→function with this capture, template→concat, const/let→var, default params, rest params, shorthand properties, spread. 40 tests.
- **Native bindings infrastructure**: Detection layer for optional @steamroller/native-{platform}-{arch} packages. Bridge modules for parser, minifier, and resolver with automatic TS fallback. Rust scaffolding stubs and platform package stubs. 16 tests.

## [0.1.1] - 2026-06-03

### Fixed

- Add build step before tests in CI, publish, and benchmark workflows (E2E CLI tests require dist/)
- Fix Windows path handling in specifyjs integration test
- Adjust coverage thresholds for new source files added in v0.1.0

## [0.1.0] - 2026-06-02

### Added

- **Core bundling pipeline**: `rollup()` → `generate()` → `write()` fully wired end-to-end
- **Module graph construction**: Resolves, loads, transforms, and parses all modules
- **Code generation**: AST-to-code renderer with MagicString-based module editing
- **Tree-shaking**: Multi-pass dead code elimination with scope analysis and side-effect detection
- **Code splitting**: Dynamic import detection, chunk assignment, shared chunks for singleton preservation
- **All 6 output formats**: ES, CJS, IIFE, UMD, AMD, SystemJS
- **All 27 plugin hooks**: Build hooks (options, buildStart, resolveId, load, transform, moduleParsed, buildEnd), output hooks (renderStart, banner/footer/intro/outro, renderChunk, generateBundle, writeBundle, closeBundle, renderError), and watch hooks
- **Plugin context API**: `this.resolve()`, `this.load()`, `this.getModuleInfo()`, `this.getModuleIds()`, `this.emitFile()`, `this.parse()` wired to live graph
- **HookFilter matching**: Include/exclude filters for resolveId, load, and transform hooks
- **Emitted files pipeline**: Plugins can emit assets via `this.emitFile()` in generateBundle/renderChunk
- **CLI entry point**: `steamroller` binary with full flag support (`--input`, `--output`, `--format`, `--sourcemap`, `--external`, `--config`)
- **Watch mode**: File system watcher with debounced rebuild and incremental cache
- **Source maps**: VLQ encode/decode, MagicString position tracking, source map composition across transform chains
- **Built-in TypeScript support**: Type-stripping for erasable TS features (annotations, interfaces, type-only imports/exports, generics, as/satisfies)
- **Built-in minification**: Comment removal, whitespace collapse, variable mangling via `minify` output option
- **esbuild-compatible `build()` API**: Accepts entryPoints, outdir, format, external, sourcemap, minify, target
- **Target option**: Downlevel syntax transforms for ES5 (arrow→function, template→concat, const→var) and ES2015 (nullish coalescing, optional chaining)
- **Declaration file generation**: `dts` output option generates .d.ts files for entry chunks
- **Post-bundle validation**: Syntax validation, import reference verification, and deconflicted name checks via `validate` output option
- **preserveModules**: One chunk per module with directory structure preserved
- **Scope-aware variable deconfliction**: AST-based renaming (replaces regex approach)
- **Rollup-compatible error codes**: ALREADY_CLOSED, UNRESOLVED_ENTRY, PARSE_ERROR, PLUGIN_ERROR, etc.
- **Public API exports**: `rollup`, `watch`, `build`, `parseAst`, `parseAstAsync`, `defineConfig`, `VERSION`, `minify`, `MagicString`, `composeSourceMaps`
- **Secondary entry points**: `steamroller/parse-ast`, `steamroller/sourcemap`
- **Comprehensive test suite**: 5500+ tests (unit, integration, e2e, compat, differential)
- **Performance benchmarks**: Bundle, parse, and tree-shaking benchmarks with CI integration
- **Documentation**: TypeScript support strategy, migration guide (Rollup → Steamroller)
- Project scaffolding: LICENSE, README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY
- TypeScript configuration with strict mode
- Package.json with zero runtime dependencies
- Git hooks for pre-commit (typecheck, formatting) and pre-push (tests, coverage)
- .gitignore and .editorconfig
- Project website

## Release Process

This project uses tag-based semantic versioning: `v{MAJOR}.{MINOR}.{PATCH}`

### Pre-1.0 Strategy

During pre-1.0 development (`v0.x.y`):

- No stability guarantees for public APIs
- Minor version bumps may include breaking changes
- Patch versions for bug fixes only

### Post-1.0 Strategy

After reaching 1.0:

- **MAJOR**: Breaking changes (documented with migration guidance in CHANGELOG)
- **MINOR**: New features, backward-compatible
- **PATCH**: Bug fixes, backward-compatible

### Breaking Changes

All breaking changes must be:

- Documented in this CHANGELOG under a `### Breaking Changes` heading
- Accompanied by migration guidance
- Called out in the GitHub release notes
