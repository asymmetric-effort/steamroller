# Steamroller Native Bindings

Optional Rust-based native accelerators for performance-critical paths in steamroller.

## Architecture

The native bindings system uses a **try-native, fallback-to-TypeScript** strategy:

1. At startup, `src/native/index.ts` attempts to `require()` a platform-specific
   npm package (e.g. `@steamroller/native-linux-x64`).
2. If the package is installed and loads successfully, bridge modules
   (`parser-bridge.ts`, `minifier-bridge.ts`, `resolver-bridge.ts`) route
   calls through the native implementation.
3. If the native package is missing or fails to load, the bridges silently
   fall back to the pure TypeScript implementations with zero overhead.

### Components

| Component | Rust Crate         | Bridge                          | Fallback                 |
| --------- | ------------------ | ------------------------------- | ------------------------ |
| Parser    | `native/parser/`   | `src/native/parser-bridge.ts`   | `src/parser/parser.ts`   |
| Minifier  | `native/minifier/` | `src/native/minifier-bridge.ts` | `src/minify/minifier.ts` |
| Resolver  | `native/resolver/` | `src/native/resolver-bridge.ts` | `src/module/resolve.ts`  |

### Platform Packages

Native binaries are distributed as platform-specific npm optional dependencies:

- `@steamroller/native-linux-x64`
- `@steamroller/native-darwin-arm64`
- `@steamroller/native-win32-x64`

## Building

Prerequisites: Rust toolchain (rustup), Node.js 18+, napi-rs CLI.

```bash
# Install napi-rs CLI
npm install -g @napi-rs/cli

# Build all native modules (from repo root)
cd native/parser && napi build --release
cd native/minifier && napi build --release
cd native/resolver && napi build --release
```

## Fallback Strategy

The fallback is completely transparent to consumers:

- No configuration needed - `'auto'` mode detects native availability at startup
- Native failures (crashes, invalid output) are caught and retried with TypeScript
- AST output from the native parser is validated against the expected ESTree structure
- Debug mode (`NODE_DEBUG=steamroller`) logs comparative timing information
