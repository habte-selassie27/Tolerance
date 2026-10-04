# Tolerance — working agreements

Reconstructed 2026-10-04 after the original file was lost during the Next.js to
Vite/React Router/Express migration. Review and replace with the real content.

## Commands

- `pnpm dev` — Express API (`src/api`) plus the Vite dev server (`src/client`).
- `pnpm build` — `prisma generate`, client bundle, then the server bundle.
- `pnpm start` — serve `dist/client` and the API from one Node process.
- `pnpm verify` — format, lint, typecheck, unit tests, build. Must stay green.

## Boundaries

- `src/server/*` is framework-agnostic domain logic. It must not import from
  `src/api` or `src/client`, and it must not know about HTTP.
- `src/server/*` and `src/lib/*` resolve the caller through the ambient request
  context in `src/lib/request-context.ts`, never through a framework API.
- `src/api/*` owns request parsing, authorization prefilter, and error mapping.
- `src/client/*` reaches the server only through `/api`. Never import a
  `server-only` module into the browser bundle.
- Authorization decisions belong on the server. The browser only renders the
  actions the API has already authorized.

## Rules

- Never weaken an authorization check to make a test or a UI pass.
- Never log or return configuration values, secrets, or private document
  contents. Unclassified server failures return a generic message.
- The GenLayer submitter private key must never enter this process.
- Run `pnpm verify` before considering any change complete.
