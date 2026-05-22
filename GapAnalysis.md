# Steamroller — Gap Analysis

> Current state vs. target state for 100% feature parity and 100% API compatibility with rollup v4.60.4.

## Current State

The `asymmetric-effort/steamroller` repository is an empty git repo with:
- `PLAN.md` — exhaustive implementation plan
- No source code, no tests, no CI, no documentation, no package configuration

## Target State

A fully functional, zero-dependency TypeScript module bundler that is a drop-in replacement for rollup v4.60.4, published to npm as `steamroller`.

---

## Gap Categories

### G0 — Project Infrastructure (Phase 0)

| ID | Gap | Current | Target |
|---|---|---|---|
| G0.1 | No LICENSE file | missing | MIT license file |
| G0.2 | No CODE_OF_CONDUCT.md | missing | Contributor Covenant or equivalent |
| G0.3 | No SECURITY.md | missing | Vulnerability reporting procedures and response timelines |
| G0.4 | No CONTRIBUTING.md | missing | Setup instructions, dev workflows, coding conventions |
| G0.5 | No TypeScript config | missing | tsconfig.json with strict mode, ES2022 target, NodeNext modules |
| G0.6 | No package.json | missing | Zero-dep package with exports map, bin, engines |
| G0.7 | No .gitignore | missing | Standard Node/TypeScript ignores |
| G0.8 | No CI/CD pipeline | missing | Multi-stage GitHub Actions (lint→test→build→e2e), CodeQL, Dependabot |
| G0.9 | No git hooks | missing | Pre-commit (typecheck+format), pre-push (tests+coverage) |
| G0.10 | No test infrastructure | missing | Node.js test runner, coverage reporting, 98% threshold |
| G0.11 | No compatibility test harness | missing | Differential testing framework (rollup vs steamroller) |

### G1 — JavaScript Parser (Phase 1)

| ID | Gap | Current | Target |
|---|---|---|---|
| G1.1 | No lexer/tokenizer | missing | Full ES2024 tokenizer with ASI, position tracking, annotation detection |
| G1.2 | No parser | missing | Recursive descent parser producing ESTree AST for all ES2024 grammar |
| G1.3 | No statement parsing | missing | All statement types including using/await using |
| G1.4 | No declaration parsing | missing | Functions, classes, imports, exports |
| G1.5 | No expression parsing | missing | All expression types including optional chaining, nullish coalescing, dynamic import |
| G1.6 | No pattern parsing | missing | Destructuring (array, object, assignment, rest) |
| G1.7 | No literal parsing | missing | Strings, numbers, BigInt, RegExp, template literals |
| G1.8 | No RegExp feature support | missing | Named groups, lookbehind, unicode properties, /v flag |
| G1.9 | No top-level await | missing | Top-level await in module mode |
| G1.10 | No import attributes | missing | `with { type: "json" }` syntax |
| G1.11 | No decorator support | missing | Stage 3 decorator syntax with metadata |
| G1.12 | No JSX parsing | missing | JSXElement, JSXFragment, attributes, expressions, text nodes |
| G1.13 | No AST type definitions | missing | Full ESTree-compatible types with RollupAstNode wrapper |
| G1.14 | No public parser API | missing | parseAst() and parseAstAsync() exported from steamroller/parseAst |
| G1.15 | No hashbang support | missing | #! comment handling at start of source |

### G2 — Module Graph (Phase 2)

| ID | Gap | Current | Target |
|---|---|---|---|
| G2.1 | No Module class | missing | Module representation with id, code, AST, imports, exports, scope, metadata |
| G2.2 | No ExternalModule class | missing | External module representation |
| G2.3 | No ModuleInfo interface | missing | Full ModuleInfo with all 20+ properties |
| G2.4 | No resolution pipeline | missing | resolveId hook, resolveDynamicImport, default resolution, external checking |
| G2.5 | No loading pipeline | missing | load hook, fs read, parse, transform hook, moduleParsed hook |
| G2.6 | No cache system | missing | RollupCache, PluginCache, shouldTransformCachedModule, experimentalCacheExpiry |
| G2.7 | No graph construction | missing | Entry point traversal, dependency resolution, circular detection, topological sort |
| G2.8 | No syntheticNamedExports | missing | Fallback namespace resolution, codegen, tree-shaking interaction |
| G2.9 | No filesystem abstraction | missing | RollupFsModule interface with all methods, Node.js adapter |
| G2.10 | No shimMissingExports | missing | Generate void 0 shims for missing exports |

### G3 — Tree-Shaking (Phase 3)

| ID | Gap | Current | Target |
|---|---|---|---|
| G3.1 | No scope analysis | missing | All scope types, binding tracking, hoisting, TDZ, import/export resolution |
| G3.2 | No side effect detection | missing | Statement/expression-level analysis, module-level effects |
| G3.3 | No pure annotations | missing | @__PURE__, #__PURE__, @__NO_SIDE_EFFECTS__ |
| G3.4 | No eval deoptimization | missing | Direct eval scope deoptimization, EVAL warning |
| G3.5 | No getter/setter side effects | missing | Property access side effects, accessor handling |
| G3.6 | No tree-shaking engine | missing | Multi-pass iterative algorithm with convergence |
| G3.7 | No tree-shaking presets | missing | recommended, smallest, safest presets |
| G3.8 | No experimentalLogSideEffects | missing | Debug logging for included statements |

### G4 — Code Generation (Phase 4)

| ID | Gap | Current | Target |
|---|---|---|---|
| G4.1 | No AST-to-code renderer | missing | Statement/expression rendering, compact mode, indent option |
| G4.2 | No generatedCode presets | missing | es5 and es2015 presets with fine-grained options |
| G4.3 | No JSX transform output | missing | Classic and automatic modes, factory/fragment config |
| G4.4 | No MagicString-based rendering | missing | Source-preserving transformation approach |
| G4.5 | No variable deconfliction | missing | Collision detection, $N rename strategy, reserved word handling |
| G4.6 | No import/export rewriting | missing | Format-appropriate rewrites, live bindings, namespace objects |
| G4.7 | No interop modes | missing | compat, auto, esModule, default, defaultOnly |
| G4.8 | No module concatenation | missing | Multi-module chunks, deconfliction, hoisted imports |
| G4.9 | No RollupBuild object | missing | cache, close, asyncDispose, generate, write, getTimings, watchFiles |
| G4.10 | No output validation | missing | Re-parse output to verify valid JS (validate option) |
| G4.11 | No banner/footer/intro/outro | missing | Addon hooks with string and function variants |

### G5 — Source Maps (Phase 5)

| ID | Gap | Current | Target |
|---|---|---|---|
| G5.1 | No VLQ codec | missing | VLQ encoding/decoding, base64 mapping |
| G5.2 | No MagicString implementation | missing | Full MagicString + Bundle class with source map tracking |
| G5.3 | No source map composition | missing | Transform chain composition, getCombinedSourcemap, renderChunk merging |
| G5.4 | No source map output | missing | All output modes (file, inline, hidden), all options (baseUrl, excludeSources, debugIds, pathTransform, ignoreList, fileNames) |

### G6 — Plugin System (Phase 6)

| ID | Gap | Current | Target |
|---|---|---|---|
| G6.1 | No plugin driver | missing | Hook execution (first/sequential/parallel), modifiers (order/sequential/filter) |
| G6.2 | No build phase hooks | missing | 9 hooks: options→buildStart→resolveId→resolveDynamicImport→load→shouldTransformCachedModule→transform→moduleParsed→buildEnd |
| G6.3 | No output generation hooks | missing | 14 hooks: outputOptions→renderStart→renderDynamicImport→resolveFileUrl→resolveImportMeta→banner/footer/intro/outro→renderChunk→augmentChunkHash→generateBundle→writeBundle→renderError→closeBundle |
| G6.4 | No watch hooks | missing | watchChange, closeWatcher |
| G6.5 | No onLog hook | missing | Sync sequential log interception |
| G6.6 | No plugin context | missing | this.resolve, this.load, this.parse, this.emitFile, this.getFileName, this.setAssetSource, this.error/warn/info/debug, this.meta, this.cache, this.fs, this.addWatchFile, this.getModuleIds, this.getModuleInfo, this.getWatchFiles, this.getCombinedSourcemap |
| G6.7 | No EmittedFile handling | missing | EmittedAsset, EmittedChunk, EmittedPrebuiltChunk |

### G7 — Code Splitting (Phase 7)

| ID | Gap | Current | Target |
|---|---|---|---|
| G7.1 | No split point detection | missing | Dynamic import, multi-entry, implicit load splits |
| G7.2 | No chunk assignment | missing | Entry ownership, shared extraction, manualChunks, preserveModules, inlineDynamicImports |
| G7.3 | No chunk naming | missing | entryFileNames, chunkFileNames, assetFileNames patterns with placeholders |
| G7.4 | No chunk optimization | missing | preserveEntrySignatures, hoistTransitiveImports, minifyInternalExports, experimentalMinChunkSize |
| G7.5 | No content hashing | missing | xxHash128 in TypeScript, 3 encodings, deterministic hash inputs |

### G8 — Output Formats (Phase 8)

| ID | Gap | Current | Target |
|---|---|---|---|
| G8.1 | No ES module format | missing | import/export preservation, native code splitting |
| G8.2 | No CommonJS format | missing | require/exports, __esModule, dynamicImportInCjs |
| G8.3 | No UMD format | missing | CJS/AMD/global detection wrapper, name, globals, extend, noConflict |
| G8.4 | No AMD format | missing | define wrapper, amd.id/autoId/basePath/define/forceJsExtensionForImports |
| G8.5 | No IIFE format | missing | Self-executing function wrapper, name, globals, extend |
| G8.6 | No SystemJS format | missing | System.register wrapper, setter/getter mechanism, systemNullSetters |
| G8.7 | No cross-format concerns | missing | exports option, interop, paths, externalImportAttributes, importAttributesKey, virtualDirname |

### G9 — Watch Mode (Phase 9)

| ID | Gap | Current | Target |
|---|---|---|---|
| G9.1 | No file watcher | missing | fs.watch-based watching, debouncing, include/exclude filtering |
| G9.2 | No watch event emitter | missing | RollupWatcher with AwaitingEventEmitter, event lifecycle |
| G9.3 | No incremental rebuild | missing | Cache reuse, selective re-parse, ROLLUP_WATCH env var |
| G9.4 | No watch CLI hooks | missing | onStart/onBundleStart/onBundleEnd/onEnd/onError shell commands |

### G10 — CLI (Phase 10)

| ID | Gap | Current | Target |
|---|---|---|---|
| G10.1 | No argument parser | missing | 80+ flags, short flags, negation, dot-notation, comma-separated, repeatable |
| G10.2 | No config file loading | missing | Discovery (steamroller.config.* + rollup.config.*), formats, configPlugin, defineConfig, loadConfigFile API |
| G10.3 | No terminal output | missing | Colors, build summary, warning display, silent/logLevel, failAfterWarnings, filterLogs, perf timing |
| G10.4 | No log filter | missing | getLogFilter() exported from steamroller/getLogFilter |
| G10.5 | No stdin support | missing | Pipe code as input, --stdin=ext |
| G10.6 | No misc CLI features | missing | forceExit, waitForBundleInput, strictDeprecations |

### G11 — Configuration (Phase 11)

| ID | Gap | Current | Target |
|---|---|---|---|
| G11.1 | No input normalization | missing | Normalize input, external, plugins, treeshake, jsx to canonical forms |
| G11.2 | No output normalization | missing | Validate format requirements, file/dir exclusivity, normalize generatedCode, interop |
| G11.3 | No option validation | missing | Unknown option warnings, deprecation handling, conflict detection |

### G12 — Compatibility & Conformance (Phase 12)

| ID | Gap | Current | Target |
|---|---|---|---|
| G12.1 | No rollup test suite | missing | Port/adapt rollup's MIT-licensed test suite |
| G12.2 | No plugin ecosystem tests | missing | Verify 20 official @rollup/plugin-* packages work |
| G12.3 | No build tool tests | missing | Verify Vite, Svelte, etc. compatibility |
| G12.4 | No performance benchmarks | missing | Parse/bundle/render timing vs rollup, memory usage |
| G12.5 | No fuzz testing | missing | Grammar-aware parser fuzzer, differential fuzzing vs acorn |
| G12.6 | No real-world project tests | missing | Bundle d3, three.js, svelte, preact, lodash-es |

### GX — Cross-Cutting Concerns

| ID | Gap | Current | Target |
|---|---|---|---|
| GX.1 | No error code system | missing | 60+ error/warning codes with structured error objects, code frames |
| GX.2 | No cross-platform path handling | missing | Forward slash normalization, UNC paths, drive letters, case sensitivity |
| GX.3 | No line ending handling | missing | CRLF/LF parsing, preservation, output normalization |
| GX.4 | No performance instrumentation | missing | perf option, getTimings(), phase timing, memory tracking |
| GX.5 | No type system | missing | 100+ exported types matching rollup's rollup.d.ts |
| GX.6 | No threading model | missing | Single-threaded async/await, semaphore for maxParallelFileOps |

### GB — Bundled Library Reimplementations

| ID | Gap | Library | Target |
|---|---|---|---|
| GB.1 | No string manipulation | magic-string | MagicString + Bundle with source map tracking (~500 lines) |
| GB.2 | No VLQ codec | @jridgewell/sourcemap-codec | VLQ encode/decode (~200 lines) |
| GB.3 | No plugin utilities | @rollup/pluginutils | createFilter, dataToEsm, addExtension, etc. (~400 lines) |
| GB.4 | No file watching | chokidar + readdirp | fs.watch/fs.watchFile wrapper (~700 lines) |
| GB.5 | No glob matching | picomatch + anymatch + braces + fill-range + to-regex-range + is-number + glob-parent + is-extglob + is-glob | Glob pattern matching engine (~550 lines) |
| GB.6 | No CLI arg parsing | yargs-parser | Custom argument parser (~400 lines) |
| GB.7 | No terminal colors | picocolors | ANSI escape codes with TTY detection (~50 lines) |
| GB.8 | No formatting utils | pretty-bytes + pretty-ms + parse-ms + date-time + time-zone | Human-readable formatters (~100 lines) |
| GB.9 | No exit handling | signal-exit | Process exit/signal handlers (~60 lines) |
| GB.10 | No AST utilities | is-reference + locate-character | Reference detection + position mapping (~80 lines) |
| GB.11 | No LRU cache | flru | Simple LRU cache with Map (~40 lines) |
| GB.12 | No built-in module list | builtin-modules | Static list from module.builtinModules (~10 lines) |
| GB.13 | No content hashing | xxHash (native) | xxHash128 in pure TypeScript, 3 encodings (~300 lines) |

---

## Summary

| Category | Gap Count | Estimated Complexity |
|---|---|---|
| G0 — Infrastructure | 11 | Low |
| G1 — Parser | 15 | Very High |
| G2 — Module Graph | 10 | High |
| G3 — Tree-Shaking | 8 | Very High |
| G4 — Code Generation | 11 | High |
| G5 — Source Maps | 4 | Medium |
| G6 — Plugin System | 7 | High |
| G7 — Code Splitting | 5 | High |
| G8 — Output Formats | 7 | Medium |
| G9 — Watch Mode | 4 | Medium |
| G10 — CLI | 6 | Medium |
| G11 — Configuration | 3 | Low |
| G12 — Compatibility | 6 | Medium |
| GX — Cross-Cutting | 6 | Medium |
| GB — Reimplementations | 13 | Medium |
| **Total** | **116** | |

Every gap represents one or more atomic GitHub issues. Some gaps decompose into multiple issues for tractability.
