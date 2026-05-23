# Contributing to Steamroller

Thank you for your interest in contributing to Steamroller.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone git@github.com:YOUR_USERNAME/steamroller.git`
3. Install dependencies: `npm install`
4. Run tests: `npm test`

## Development Workflow

```bash
npm run typecheck     # TypeScript strict mode check
npm run lint          # Prettier formatting check
npm test              # Run unit/integration tests
npm run build         # Production build
```

## Before Submitting a PR

All of these must pass — the pre-commit and pre-push hooks enforce them automatically:

1. **TypeScript typecheck** — `npx tsc --noEmit` (zero errors)
2. **Prettier** — `npx prettier --check 'src/**/*.ts' 'tests/**/*.ts'`
3. **Tests** — `npm test` (zero failures)
4. **Coverage** — ≥98% statements/lines/functions/branches

## Definition of Done

All feature work must include:
- ≥98% test coverage (happy and sad paths)
- Unit, integration, and e2e tests
- Documentation for public APIs
- All linters pass
- All tests pass

See https://coding-standards.asymmetric-effort.com for full reference.

## Code Style

- TypeScript strict mode
- No `any` types unless documented
- `const` over `let`, never `var`
- Named exports over default exports
- Zero runtime dependencies

## Commit Messages

Use conventional commits:
- `feat:` — new feature
- `fix:` — bug fix
- `test:` — test additions
- `docs:` — documentation
- `refactor:` — code restructuring
- `perf:` — performance improvement
- `chore:` — tooling, CI, etc.

## Intellectual Property

- All code must be original work or MIT-compatible
- Do not copy code from other projects without license verification
- All algorithms implemented from original understanding

## Security

- Report vulnerabilities to security@asymmetric-effort.com
- See SECURITY.md for details
