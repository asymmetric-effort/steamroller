# Steamroller Gap Analysis

> Source: **Rollup v4.x** (https://github.com/rollup/rollup)
> Target: **Steamroller** at `~/git/steamroller`
> Date: 2026-05-23

---

## Executive Summary

Steamroller has substantial component-level implementation across 116 TypeScript source files covering parsing, module graph construction, code generation, format wrappers, plugin hooks, tree-shaking, source maps, code splitting, watch mode, and CLI argument parsing. However, **the components are not wired together end-to-end**. The `rollup()` function skips module graph construction (Step 6 is a placeholder that produces an empty `modules` array), and `generate()` produces an empty output chunk. Calling `rollup({input: 'test.js'})` today returns a valid `RollupBuild` object, but the generated bundle contains zero code. No real JavaScript file is ever read, parsed, resolved, transformed, or emitted.

**Overall completion: ~40% by component breadth, ~5% by end-to-end functionality.**

---

## 1. End-to-End Pipeline Integration

### 1.1 rollup() Entry Point

| Aspect | Rollup v4 | Steamroller | Status |
|--------|-----------|-------------|--------|
| Validate and normalize input options | Full validation with detailed errors | Implemented | DONE |
| Create plugin driver | Full lifecycle management | Implemented (basic) | DONE |
| Run `options` hook | Runs across all plugins | Implemented | DONE |
| Run `buildStart` hook | Runs in parallel | Implemented | DONE |
| **Build module graph** | Resolves, loads, transforms, parses all modules | **Placeholder: `const modules = [] `** | CRITICAL GAP |
| **Tree-shaking** | Multi-pass dead code elimination on real AST | Comment says "handled during graph construction" but graph is never built | CRITICAL GAP |
| Run `buildEnd` hook | Runs in parallel | Implemented | DONE |
| Return RollupBuild | With generate/write/close | Implemented (shell only) | PARTIAL |

**The fundamental gap**: `src/rollup.ts` line 107 assigns `const modules: Array<unknown> = []` instead of calling `buildModuleGraph()`. The module graph builder (`src/module/graph.ts`), module loader (`src/module/loader.ts`), and resolver (`src/module/resolve.ts`) all exist as standalone units but are never invoked from the main pipeline.

### 1.2 generate() / write()

| Aspect | Rollup v4 | Steamroller | Status |
|--------|-----------|-------------|--------|
| Normalize output options | Full | Not called during generate | GAP |
| Run `renderStart` hook | Parallel across plugins | Not wired | GAP |
| Assign modules to chunks | Based on entries, dynamic imports, manual chunks | Not wired (splitting logic exists standalone) | GAP |
| Render each chunk | MagicString edits, import/export rewriting | Not wired (module-render.ts exists standalone) | GAP |
| Run `renderChunk` hook | Sequential, per-chunk | Not wired | GAP |
| Run `banner/footer/intro/outro` hooks | Sequential | Not wired | GAP |
| Generate source maps | Compose transforms, chunk maps, VLQ encode | Not wired (sourcemap/ exists standalone) | GAP |
| Run `generateBundle` hook | Sequential with full bundle | Not wired | GAP |
| Run `writeBundle` hook (write only) | Parallel after disk write | Not wired | GAP |
| **Actually write files to disk** | fs.writeFile for chunks and assets | **Stub: `writeOutput()` is a no-op** | CRITICAL GAP |
| Produce non-empty code | Concatenated, format-wrapped output | **Output chunk has `code: ""`** | CRITICAL GAP |

### 1.3 close()

| Aspect | Rollup v4 | Steamroller | Status |
|--------|-----------|-------------|--------|
| Run `closeBundle` hook | Parallel | Not wired (sets `closed = true` only) | GAP |
| Release resources | Plugin cleanup | Not implemented | GAP |

---

## 2. Parser

The parser is the most complete subsystem. It is a hand-written recursive-descent parser with a full lexer, producing ESTree-compatible ASTs.

| Feature | Rollup v4 (uses SWC/acorn) | Steamroller | Status |
|---------|---------------------------|-------------|--------|
| ES2024 syntax | Full via SWC | Hand-written lexer + parser | DONE |
| Module/script mode | Both | Both | DONE |
| Import/export declarations | Full | Full | DONE |
| Dynamic import() | Full | Parsed | DONE |
| JSX | Via plugin (acorn-jsx) | Built-in (parser/jsx.ts) | DONE |
| Decorators (Stage 3) | Via SWC | Implemented (parser/decorators.ts) | DONE |
| Async/generators | Full | Full | DONE |
| Template literals | Full | Full | DONE |
| Destructuring/patterns | Full | Full (parser/patterns.ts) | DONE |
| Recoverable parsing | N/A (Rollup relies on SWC) | Implemented (error collection mode) | EXTRA |
| Hashbang support | Yes | Yes | DONE |
| `parseAst()` / `parseAstAsync()` | Public API | Implemented | DONE |
| TypeScript parsing | Via SWC (strips types) | **Not implemented** | GAP |
| Error recovery quality | SWC-grade | Basic skip-to-statement-boundary | PARTIAL |

**Assessment**: The parser works well for standard JavaScript. It cannot handle TypeScript, which most real-world Rollup projects require (typically via plugin, but Rollup's SWC parser handles it natively since v4).

---

## 3. Module Graph

| Feature | Rollup v4 | Steamroller | Status |
|---------|-----------|-------------|--------|
| BFS graph traversal | Yes | Implemented in graph.ts | DONE |
| resolveId pipeline (plugin hooks -> default) | Chained hooks | **Not wired** (resolve.ts + driver.ts exist separately) | GAP |
| load pipeline (plugin hooks -> fs fallback) | Chained hooks | **Not wired** (loader.ts exists separately) | GAP |
| transform pipeline (sequential) | Chained hooks | **Not wired** (loader.ts exists separately) | GAP |
| moduleParsed notification | Parallel hooks | **Not wired** | GAP |
| Circular dependency detection | Warning | Implemented in graph.ts | DONE |
| Topological sort | Kahn's algorithm | Implemented in graph.ts | DONE |
| External module handling | Full | Implemented (ExternalModule.ts) | DONE |
| Module class (imports/exports extraction) | Full | Implemented (Module.ts) | DONE |
| ModuleInfo for plugin API | Full | Implemented (Module.toModuleInfo()) | DONE |
| Module cache / incremental | Full | Cache types exist, incremental.ts exists | PARTIAL |
| **Integration: graph builder called from rollup()** | Yes | **No -- never called** | CRITICAL GAP |

---

## 4. Plugin System

### 4.1 Plugin Driver

| Feature | Rollup v4 | Steamroller | Status |
|---------|-----------|-------------|--------|
| Hook strategies: first, sequential, parallel | Yes | Implemented | DONE |
| Hook reduce strategy | Yes | Implemented | DONE |
| Hook ordering (pre/normal/post) | Yes | Implemented | DONE |
| Duplicate plugin name detection | Warning | Implemented | DONE |
| ObjectHook support (handler + order + filter) | Yes | Implemented (getHookHandler, getHookOrder) | DONE |
| StringFilter matching | Yes | Implemented (matchesFilter) | DONE |

### 4.2 Build Hooks (9 hooks)

| Hook | Rollup v4 | Steamroller | Status |
|------|-----------|-------------|--------|
| options | Sequential, sync-first | Implemented and wired in rollup.ts | DONE |
| buildStart | Parallel | Implemented and wired in rollup.ts | DONE |
| resolveId | First | Defined, **not wired to module graph** | GAP |
| resolveDynamicImport | First | Defined, not wired | GAP |
| load | First | Defined, not wired | GAP |
| shouldTransformCachedModule | First | Defined, not wired | GAP |
| transform | Sequential | Defined, not wired | GAP |
| moduleParsed | Parallel | Defined, not wired | GAP |
| buildEnd | Parallel | Implemented and wired in rollup.ts | DONE |

### 4.3 Output Hooks (14 hooks)

| Hook | Rollup v4 | Steamroller | Status |
|------|-----------|-------------|--------|
| renderStart | Parallel | Defined in output-hooks.ts, not wired | GAP |
| banner | Sequential | Defined, not wired | GAP |
| footer | Sequential | Defined, not wired | GAP |
| intro | Sequential | Defined, not wired | GAP |
| outro | Sequential | Defined, not wired | GAP |
| renderDynamicImport | First | Defined, not wired | GAP |
| augmentChunkHash | Sequential | Defined, not wired | GAP |
| resolveFileUrl | First | Defined, not wired | GAP |
| resolveImportMeta | First | Defined, not wired | GAP |
| renderChunk | Sequential | Defined, not wired | GAP |
| generateBundle | Sequential | Defined, not wired | GAP |
| writeBundle | Parallel | Defined, not wired | GAP |
| closeBundle | Parallel | Defined, not wired | GAP |
| renderError | Parallel | Defined, not wired | GAP |

### 4.4 Watch Hooks (2 hooks)

| Hook | Rollup v4 | Steamroller | Status |
|------|-----------|-------------|--------|
| watchChange | Sequential | Defined in watch-hooks.ts | PARTIAL |
| closeWatcher | Sequential | Defined in watch-hooks.ts | PARTIAL |

### 4.5 Plugin Context

| Feature | Rollup v4 | Steamroller | Status |
|---------|-----------|-------------|--------|
| this.resolve() | Calls resolveId pipeline | Typed, InMemoryModuleGraph exists | PARTIAL |
| this.load() | Triggers full load pipeline | Typed, not functional | GAP |
| this.parse() | Returns AST | Typed, parser exists | PARTIAL |
| this.emitFile() | Emit chunks/assets | EmittedFiles system exists | PARTIAL |
| this.getFileName() | Resolve emitted file name | Exists | PARTIAL |
| this.setAssetSource() | Set asset content | Exists | PARTIAL |
| this.addWatchFile() | Track watch dependencies | Typed | PARTIAL |
| this.getWatchFiles() | List watched files | Typed | PARTIAL |
| this.getModuleInfo() | Module metadata | Typed, graph not populated | GAP |
| this.getModuleIds() | Iterate modules | Typed, graph not populated | GAP |
| this.warn() / this.error() | Log/throw | Typed | PARTIAL |
| this.cache | Per-plugin cache | PluginCache implemented | DONE |

**Summary**: 4 of 25 hooks are actually wired and executing. The remaining 21 have type definitions and hook executor code but are never called from the build pipeline.

---

## 5. Code Generation

| Feature | Rollup v4 | Steamroller | Status |
|---------|-----------|-------------|--------|
| AST-to-code renderer | astring-based | Stack-based iterative renderer (renderer.ts, ~1250 lines) | DONE |
| MagicString-based module editing | Yes (uses magic-string npm) | Custom MagicString implementation (magic-string.ts) | DONE |
| Import rewriting (ES, CJS) | Full | Implemented in module-render.ts | DONE |
| Export rewriting (ES, CJS) | Full | Implemented in module-render.ts | DONE |
| Variable deconfliction | Scope-aware | Regex-based word-boundary replacement | PARTIAL |
| Compact mode | Yes | Basic whitespace collapse | PARTIAL |
| Module concatenation | Scope-hoisting | concatenate.ts exists | PARTIAL |
| **Integration: codegen called from generate()** | Yes | **No -- generate() returns empty chunk** | CRITICAL GAP |

---

## 6. Output Formats

All six format wrappers are implemented as standalone `FormatWrapper` objects with `wrapChunk()`, `getExternalImportCode()`, and `getExportCode()` methods.

| Format | Rollup v4 | Steamroller | Status |
|--------|-----------|-------------|--------|
| es | Full | Implemented (es.ts) | DONE (standalone) |
| cjs | Full with interop helpers | Implemented (cjs.ts) with __esModule, interop helpers | DONE (standalone) |
| iife | Full with globals, name, extend | Implemented (iife.ts) | DONE (standalone) |
| umd | Full (AMD + CJS + global) | Implemented (umd.ts) | DONE (standalone) |
| amd | Full with define() | Implemented (amd.ts) | DONE (standalone) |
| system | Full with System.register | Implemented (system.ts) | DONE (standalone) |
| Format dispatcher | getFormat() | getFormatWrapper() | DONE |
| **Integration: formats called during generate()** | Yes | **No** | CRITICAL GAP |

**Assessment**: Format wrappers produce structurally correct output when given imports/exports/code, but they are never called from the build pipeline. No end-to-end validation that the generated code actually runs.

---

## 7. Tree-Shaking

| Feature | Rollup v4 | Steamroller | Status |
|---------|-----------|-------------|--------|
| Multi-pass inclusion engine | Yes | engine.ts (worklist-based, iterative) | DONE (standalone) |
| Scope analysis | Full (own scope implementation) | scope.ts (Scope/Binding/Reference) | DONE (standalone) |
| Side-effect detection | Statement-level | side-effects.ts | DONE (standalone) |
| Pure function annotations | `/*@__PURE__*/` | pure.ts | DONE (standalone) |
| Deoptimization (try/catch, eval) | Yes | deoptimize.ts | DONE (standalone) |
| moduleSideEffects option | Boolean, function, "no-external" | Supported in options.ts | DONE |
| propertyReadSideEffects | Yes | Supported in options.ts | DONE |
| tryCatchDeoptimization | Yes | Supported in options.ts | DONE |
| unknownGlobalSideEffects | Yes | Supported in options.ts | DONE |
| manualPureFunctions | Yes | Supported in options.ts | DONE |
| **Integration: tree-shaking applied to real modules** | Yes | **No -- engine never receives real module data** | CRITICAL GAP |

---

## 8. Source Maps

| Feature | Rollup v4 | Steamroller | Status |
|---------|-----------|-------------|--------|
| VLQ encode/decode | Yes | vlq.ts | DONE |
| MagicString with position tracking | Yes (npm magic-string) | Custom implementation (magic-string.ts) | DONE |
| Source map composition (transform chain) | Yes | compose.ts | DONE |
| Output modes (true, 'inline', 'hidden', false) | Yes | output.ts | DONE |
| sourcemapBaseUrl | Yes | Supported | DONE |
| sourcemapExcludeSources | Yes | Supported | DONE |
| sourcemapPathTransform | Yes | Supported | DONE |
| sourcemapIgnoreList | Yes | Supported | DONE |
| x_google_ignoreList | Yes | Typed | DONE |
| **Integration: source maps generated during build** | Yes | **No -- never called from pipeline** | CRITICAL GAP |

---

## 9. Code Splitting

| Feature | Rollup v4 | Steamroller | Status |
|---------|-----------|-------------|--------|
| Split point detection | Dynamic imports | split-points.ts | DONE (standalone) |
| Chunk assignment | Entry + dynamic + manual + shared | chunk-assignment.ts | DONE (standalone) |
| Chunk naming | Pattern-based ([name], [hash]) | chunk-naming.ts | DONE (standalone) |
| Chunk optimization (min size, max size) | Yes | chunk-optimization.ts | DONE (standalone) |
| Content hashing | Yes | hash.ts | DONE (standalone) |
| **Integration: splitting applied during generate()** | Yes | **No** | CRITICAL GAP |

---

## 10. Watch Mode

| Feature | Rollup v4 | Steamroller | Status |
|---------|-----------|-------------|--------|
| watch() entry function | Full | watch-entry.ts (creates watcher, emits START) | PARTIAL |
| File system watcher | chokidar-based | file-watcher.ts (fs.watch-based) | DONE (standalone) |
| Debounced rebuild | Yes | watcher.ts (RollupWatcherImpl with buildDelay) | DONE (standalone) |
| Event protocol (START/BUNDLE_START/BUNDLE_END/END/ERROR) | Full | Implemented in watcher.ts | DONE |
| Incremental rebuild with cache | Yes | incremental.ts (shouldRebuildModule) | PARTIAL |
| **Integration: watch() triggers real builds** | Yes | **watch-entry.ts creates a stub watcher that never builds** | CRITICAL GAP |

The `watch-entry.ts` `createWatcher()` function has `void configs` (explicitly suppresses unused variable) and never triggers any build. It only emits a START event via `Promise.resolve()`. Meanwhile, `watcher.ts` has a `RollupWatcherImpl` class that does call `createIncrementalBuild`, but `watch-entry.ts` does not use it.

---

## 11. CLI

| Feature | Rollup v4 | Steamroller | Status |
|---------|-----------|-------------|--------|
| `rollup` binary in package.json `bin` | Yes | **No `bin` field in package.json** | CRITICAL GAP |
| CLI argument parser | Full (all flags) | parse-cli.ts (maps flags to options) | DONE |
| Config file loading | rollup.config.js/ts/mjs | config-loader.ts (findConfigFile, loadConfigFile) | DONE (standalone) |
| Terminal output (colors, progress) | Full | terminal.ts (formatWarning, displayBundleStart, etc.) | DONE (standalone) |
| Log filtering | --filterLogs | log-filter.ts | DONE (standalone) |
| Stdin input | --stdin | stdin.ts (readStdin) | DONE (standalone) |
| Environment variables | --environment | stdin.ts (handleEnvironment) | DONE (standalone) |
| **Integration: CLI entry point that runs builds** | `#!/usr/bin/env node` main script | **No executable entry point** | CRITICAL GAP |

The CLI module barrel (`cli/index.ts`) re-exports parsers and formatters but there is no `bin/steamroller.ts` or equivalent that wires `parseCli()` -> `rollup()` -> `generate()` -> write to disk.

---

## 12. Configuration

| Feature | Rollup v4 | Steamroller | Status |
|---------|-----------|-------------|--------|
| normalizeInputOptions | Full | normalize-input.ts | DONE |
| normalizeOutputOptions | Full | normalize-output.ts | DONE |
| validateInputOptions | Full | validate.ts | DONE |
| validateOutputOptions | Full | validate.ts | DONE |
| defineConfig() | Type helper | define-config.ts | DONE |
| VERSION constant | Matches package.json | "0.0.0" (hardcoded) | DONE |

---

## 13. Testing

| Category | Count | Quality |
|----------|-------|---------|
| Unit test files | 119 | Extensive coverage of individual modules |
| Integration test files | 0 (tests/integration/.gitkeep only) | **No integration tests exist** |
| E2E test files | 0 (tests/e2e/.gitkeep only) | **No E2E tests exist** |
| Compat test files | 4 (harness, real-world, plugin-compat, build-tools, rollup-suite) | **Scaffolded but not functional** (real-world tests emit "not yet functional" warnings) |

**Assessment**: Unit tests verify individual components in isolation. There are zero tests that verify `rollup()` produces a working bundle from actual JavaScript files on disk. The "compat" tests validate configuration structures, not actual bundling behavior.

---

## 14. Build and Distribution

| Feature | Rollup v4 | Steamroller | Status |
|---------|-----------|-------------|--------|
| npm package with bin | Yes | **No `bin` field** | GAP |
| CommonJS + ESM dual package | Yes | Configured in exports map | DONE |
| TypeScript declarations | Yes | Configured (types field) | DONE |
| Zero runtime dependencies | Rollup has native bindings | Zero devDeps only | DONE |
| CI/CD pipeline | Full | **Not present** | GAP |
| Pre-commit hooks | Yes | Scripts defined but no husky/lint-staged | PARTIAL |

---

## 15. Priority-Ordered Work Items

### P0: Critical Integration (must be done for any functionality)

1. **Wire module graph into rollup()**: Replace `const modules = []` in `src/rollup.ts` with actual calls to the resolver, loader, and graph builder. This requires:
   - Creating a `resolveId` function that chains plugin hooks with `defaultResolve`
   - Creating a `loadModule` function that chains plugin hooks with fs fallback via `ModuleLoader`
   - Passing these to `buildModuleGraph()`
   - Feeding the resulting `ModuleGraph` into `BuildState`

2. **Wire code generation into generate()**: Replace the empty-chunk stub in `src/build/rollup-build.ts` with actual:
   - Output option normalization
   - Chunk assignment from the module graph
   - Module rendering via `renderModule()` + MagicString
   - Format wrapping via `getFormatWrapper()`
   - Source map generation
   - Output hook execution (renderStart through generateBundle)

3. **Wire file writing into write()**: Replace the no-op `writeOutput()` with actual `fs.writeFile` calls, directory creation, and writeBundle hook execution.

### P1: Essential for Real-World Use

4. **Create CLI entry point**: Add `bin/steamroller.ts` (or `src/cli/main.ts`) that ties `parseCli` -> config loading -> `rollup()` -> `generate()`/`write()`. Add `"bin"` field to package.json.

5. **Wire tree-shaking to module graph**: After graph construction, run the tree-shaking engine on the actual module scopes/bindings, feeding results into the `includedStatements` set for code generation.

6. **Wire code splitting to generate()**: Use `detectSplitPoints()` + `assignChunks()` on the real module graph during output generation.

7. **Wire all plugin hooks**: Connect the remaining 21 unconnected hooks at their proper lifecycle points:
   - resolveId, load, transform, moduleParsed during graph build
   - All 14 output hooks during generate/write
   - watchChange, closeWatcher during watch mode

8. **Wire watch mode**: Connect `watch-entry.ts` to `RollupWatcherImpl` so it actually triggers builds via the `rollup()` pipeline.

### P2: Parity and Quality

9. **Add integration tests**: Tests that call `rollup()` with real `.js` files and verify the output code is correct and executable.

10. **Add E2E tests**: Tests that run the CLI binary against sample projects and verify outputs.

11. **Add CI/CD pipeline**: GitHub Actions with lint -> typecheck -> test -> build stages.

12. **TypeScript stripping**: Either add TypeScript parsing to the parser or document that TypeScript support requires a plugin (like Rollup's @rollup/plugin-typescript).

13. **Variable deconfliction**: The current regex-based approach in `module-render.ts` will produce incorrect results for identifiers inside strings, comments, or property names. Needs scope-aware renaming.

14. **Rollup compatibility test suite**: Port a subset of Rollup's own test fixtures to verify behavioral parity.

15. **Performance benchmarking**: Ensure parsing, graph construction, and code generation are competitive with Rollup.

### P3: Polish

16. **Error messages**: Match Rollup's error codes and message formats for ecosystem compatibility.
17. **Plugin filter system**: Wire the HookFilter matching for resolveId, load, transform hooks.
18. **Asset emission**: Wire the emitted files system through generate/write.
19. **Preserve modules mode**: `preserveModules` output option.
20. **experimentalMinChunkSize**: Advanced splitting optimization.

---

## 16. Rollup Public API Parity Checklist

| API | Steamroller | Functional? |
|-----|-------------|-------------|
| `rollup(options)` -> `RollupBuild` | Exported | Returns valid object but builds nothing |
| `RollupBuild.generate(outputOptions)` | Implemented | Returns empty chunk |
| `RollupBuild.write(outputOptions)` | Implemented | No-op (no files written) |
| `RollupBuild.close()` | Implemented | Sets closed flag only |
| `RollupBuild.cache` | Implemented | Always undefined |
| `RollupBuild.watchFiles` | Implemented | Always empty |
| `RollupBuild.getTimings` | Implemented | Returns empty object |
| `watch(options)` -> `RollupWatcher` | Exported | Emits START event, never builds |
| `RollupWatcher.on(event, listener)` | Implemented | Listeners registered but no real events |
| `RollupWatcher.close()` | Implemented | Sets closed, fires close listeners |
| `parseAst(code)` | Exported | **Fully functional** |
| `parseAstAsync(code)` | Exported | **Fully functional** |
| `defineConfig(options)` | Exported | **Fully functional** (type passthrough) |
| `VERSION` | Exported | "0.0.0" |
| CLI binary (`rollup -c`) | Not exported | **Does not exist** |

---

## 17. Conclusion

Steamroller has impressive breadth: nearly every subsystem that Rollup provides has a corresponding implementation. The parser is production-quality. The format wrappers, tree-shaking engine, source map utilities, code splitting logic, and plugin driver are all well-structured with thorough unit tests.

**The critical gap is integration.** The components were built by parallel agents and were never connected into a working pipeline. The `rollup()` function does not build a module graph. The `generate()` function does not run code generation. The `write()` function does not write files. The CLI does not exist as an executable.

The path from current state to a functional bundler requires primarily **wiring work** -- connecting the existing components through the main pipeline in `rollup.ts` and `rollup-build.ts`. The individual components appear to have the right interfaces and data structures; the challenge is integration, error handling across boundaries, and end-to-end testing.
