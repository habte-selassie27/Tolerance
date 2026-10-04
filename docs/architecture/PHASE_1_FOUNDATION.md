# Phase 1 foundation decisions

## Implemented baseline

- Local Git repository on `main`, with one coherent foundation commit.
- Next.js 16.3.0 / React 19.2.7 / TypeScript 6.0.3 foundation; no product flow screens.
- pnpm 11.3.0 lockfile and exact package versions. ESLint, Prettier, Vitest and GitHub Actions CI are configured.
- Foundry workspace uses Solidity 0.8.30 but intentionally contains no escrow source, deployment scripts or tests in Phase 1.
- Shared domain vocabulary lives in `packages/domain`; it encodes requirement statuses, obligation states, permitted state transitions and the resolver-only split outcome rule.
- Foundation configuration uses a schema parser. Production configuration fails closed when `TOLERANCE_APP_ORIGIN` is absent. Auth, storage, database, AI, RPC, wallet and signer configuration are deferred to their owning phases.

## Deliberate non-implementation

No database migration, document processor, job runner, AI call, wallet flow, Builder Code, escrow behavior, deployment or product UI has been added.

## Build modification

Next.js added `allowJs`, `skipLibCheck`, and development type includes to `tsconfig.json` during the successful production build. These are framework-generated compatibility settings; strict project type checking remains enabled.
