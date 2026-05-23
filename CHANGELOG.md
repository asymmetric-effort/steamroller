# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
