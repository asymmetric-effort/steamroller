# Migration from Rollup

This guide covers migrating an existing Rollup project to Steamroller.

> **Note:** Steamroller is pre-implementation. This guide will be updated as features are
> implemented and compatibility details are finalized.

## Overview

Steamroller aims for full compatibility with the Rollup configuration format and plugin interface.
In most cases, migrating involves replacing the `rollup` package with `steamroller` and updating
import paths. Existing configuration files and plugins should work with minimal or no changes.

## Configuration Changes

### Package Installation

```bash
# Remove Rollup
npm uninstall rollup

# Install Steamroller
npm install --save-dev steamroller
```

### Config File

Rename your config file (optional) and update imports:

```typescript
// Before (rollup.config.ts)
import { defineConfig } from "rollup";

// After (steamroller.config.ts)
import { defineConfig } from "@asymmetric-effort/steamroller";
```

Steamroller reads both `steamroller.config.*` and `rollup.config.*` files, so renaming is optional.

### Package Scripts

Update your `package.json` scripts:

```json
{
  "scripts": {
    "build": "steamroller --config",
    "dev": "steamroller --config --watch"
  }
}
```

### Programmatic API

Update import paths in any code that uses the programmatic API:

```typescript
// Before
import { rollup, watch } from "rollup";

// After
import { rollup, watch } from "@asymmetric-effort/steamroller";
```

## Plugin Compatibility

Steamroller implements the same plugin interface as Rollup. Most Rollup plugins should work without
modification.

### Compatible Plugins

The following categories of plugins are expected to be compatible:

- `@rollup/plugin-node-resolve`
- `@rollup/plugin-commonjs`
- `@rollup/plugin-typescript`
- `@rollup/plugin-json`
- `@rollup/plugin-replace`
- `@rollup/plugin-terser`
- Other plugins using standard Rollup hook APIs

### Plugin Compatibility Notes

- Plugins that rely on Rollup internals (not the public plugin API) may require updates
- Plugins must use documented hook APIs for guaranteed compatibility
- Plugin compatibility will be validated and documented as Steamroller matures

## Known Differences

This section documents intentional deviations from Rollup behavior. As Steamroller is
pre-implementation, this list will be updated as development progresses.

### Planned Differences

- Implementation language and internal architecture differ from Rollup
- Performance characteristics may differ
- Error messages and warning text will differ

### Feature Parity Status

A detailed feature parity tracker will be maintained as implementation progresses. The goal is
full compatibility with the Rollup configuration and plugin API surface.
