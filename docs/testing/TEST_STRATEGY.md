# Test strategy

## Release candidate summary

The final release-candidate commands must be run on the candidate revision:

| Category                     | Command                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Application unit/integration | `pnpm test`                                                                    |
| Formatting/lint/types/build  | `pnpm format:check && pnpm lint && pnpm typecheck && pnpm build`               |
| Prisma                       | `pnpm exec prisma validate && pnpm exec prisma migrate status`                 |
| Direct Mode                  | `.\\.venv-genlayer\\Scripts\\python.exe -m pytest genlayer\\tests\\direct -v`  |
| Foundry                      | `forge test`                                                                   |
| Browser QA                   | Project-local Next app plus in-app browser inspection at desktop/tablet/mobile |

Counts are recorded only after the final commands, in the release handoff; this document intentionally avoids stale hard-coded totals.

## Layers

- Unit: pure policy, hashes, manifest ordering, stable page-aware source-block IDs, citation validation, parsers, authorisation predicates, UI state mapping.
- Integration: database transactions/versioning, private object authorisation, job retries, signer boundary, RPC reconciliation.
- Contract: Foundry unit, state-machine, fuzz, invariant and access-control suites.
- E2E: buyer -> supplier -> accept -> fund -> evidence -> verdict -> challenge/finalise on X Layer Testnet.
- Security: dependency scan, secret scan, SAST, upload abuse, BOLA/role-escalation and transaction-tampering tests.
- Accessibility/design: keyboard/screen-reader baseline, axe checks, responsive visual regression and manual dossier-matrix review.

## AI evaluation corpus

Each test has immutable source files, expected requirement verdicts/citations, source-block identifiers and policy version. Required cases: perfect evidence; missing evidence; quantity mismatch; approved amendment; conflicting amendments; prompt injection; inspection PASS but specification contradiction; wrong identity; fabricated citation; poor scan; irrelevant evidence; ambiguous correspondence; contradictory evidence; deterministic failure; insufficient evidence.

## Release gates

No known critical/high security finding; all contract invariants/fuzz tests pass; all required AI cases pass or escalate as expected; no auto-PASS with missing mandatory evidence; fabricated/non-bundle citations are rejected; E2E Testnet flow succeeds repeatedly from a clean state; source verified; Builder Code attribution verified when code exists; accessibility critical path passes. Contract tests prove only the resolver can split, and challenge duration cannot change after acceptance.
