# Phase 3D — Tolerance Release Candidate

## Scope

Phase 3D hardens the existing product rather than modifying protocol semantics. It adds a safe readiness endpoint, controlled deterministic synthetic fixtures, route-level loading/error recovery, release documentation, and a deployment contract.

## Demo dataset

The controlled demo uses isolated synthetic integration fixtures: a 316L precision component, original ±0.25 mm term, approved ±0.15 mm amendment, 50.10 mm inspection evidence, provenance, evidence bundle, evaluation context, validated synthetic evaluation snapshot, and packet snapshot through the production builder chain. It does not create live X Layer or GenLayer transactions, and must run only against a non-production database.

## Deployment boundary

The Next.js application, database access, private storage workflow, and OpenAI server calls can run in a conventional server deployment. The CLI/keychain GenLayer submitter must run in an isolated persistent worker/runtime with access to its encrypted account; it must not be placed in ephemeral serverless execution or copied into application environment variables.

## Readiness

`GET /api/health` checks process configuration shape and database reachability without exposing secrets, RPC payloads, balances, or database internals. A 503 means only that readiness could not be established.

## Existing X Layer workflow

The existing synthetic workflow `89ec6878-d168-493d-8a9f-cdf9ff840c44` / obligation `9899757356` remains `XLAYER_BINDING_PENDING`. The release candidate preserves it and allows safe confirmation using the same transaction only. It never creates a replacement transaction to make a demo appear complete.

## Authentication verification

The workspace exposes a real Supabase password sign-in route at `/login`. The committed Playwright harness creates or reuses only synthetic E2E identities through the server-only Supabase admin boundary, signs in through this route, and stores the resulting browser state only in an ignored local directory. Protected routes also use the Next.js 16 `proxy.ts` session prefilter; every loader and action still independently reconciles the authenticated subject and enforces organization membership.

Run the browser gate only with ignored local `E2E_TEST_EMAIL` and
`E2E_TEST_PASSWORD` values:

```bash
pnpm test:e2e
```

The suite exercises authenticated workspace, deal, obligation, dispute, and
activity routes; cross-organization URLs; an unauthenticated redirect; wallet
unavailable/wrong-account states; and desktop, tablet, and mobile lifecycle
layout checks. It never sends an X Layer transaction.

## Release envelope

This is a controlled Testnet release candidate, not a Mainnet release. Automatic attestation and automatic settlement remain fail-closed. Deployment still requires target-specific credentials, a persistent GenLayer submitter worker, migration ownership, monitoring, backup/restore ownership, and a secure authenticated demo account.
