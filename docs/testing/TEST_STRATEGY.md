# Test strategy

## Release candidate summary

The final release-candidate commands must be run on the candidate revision:

| Category                     | Command                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| Application unit/integration | `pnpm test`                                                                           |
| Opt-in integration suites    | `pnpm test:integration:<suite>`                                                       |
| Formatting/lint/types/build  | `pnpm format:check && pnpm lint && pnpm typecheck && pnpm build`                      |
| Prisma                       | `pnpm exec prisma validate && pnpm exec prisma migrate status`                        |
| Direct Mode                  | `.venv-genlayer` active, then `python -m pytest genlayer/tests/direct -v`             |
| Foundry                      | `forge test`                                                                          |
| Browser QA                   | Project-local Vite dev server plus in-app browser inspection at desktop/tablet/mobile |

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

## GenLayer

Phase 2C uses 27 Direct Mode tests for authorization, write-once storage, packet hashing, clear verdicts, malformed/unsafe structured output, citation validation, prompt injection, amendment handling and substantive validator equivalence. A versioned ten-case synthetic manufacturing corpus covers clean pass, material failure, missing evidence, approved/unapproved/conflicting amendments, PASS/measurement contradiction, injection, identity mismatch and ambiguity.

Studionet integration deploys the exact contract, submits a synthetic clear-release case through real validator consensus, waits for `FINALIZED`, reads `LATEST_FINAL` state, confirms `resolved == true`, and proves duplicate overwrite fails. `ACCEPTED` is never treated as economic finality. Protocol `UNDETERMINED` remains distinct from the business verdict `INSUFFICIENT_EVIDENCE`; a transaction without a resolved finalized record is not attestable.

Phase 2D must reject `ACCEPTED`, wrong Studionet chain/IC/case/escrow/obligation/hash/nonce/expiry and revoked attestors. It must test `UNDETERMINED`, and a later-finalized transaction with no resolved case, as no-transfer outcomes. These relay tests are explicitly not implemented in Phase 2C.

## Smart contract

Foundry covers create/accept/fund/evidence, fast full-release/refund, the exact no-evidence timeout boundary, challenge while paused, mutual split, strict source/hash/expiry binding, revoked/duplicate/insufficient attestors, and fuzzed full accounting. Release gates: `forge fmt --check`, `forge build`, and `forge test`.

Dedicated closure suites cover lifecycle/evidence/time/authorization/pause/token negative paths and all six directional EIP-712 family-confusion attempts. Stateful invariants remain configured at 128 runs × depth 64.

Phase 2C/2D integration must prove that `ACCEPTED`, protocol `UNDETERMINED`, and a later-finalized transaction without a matching `{ resolved: true, resultHash }` case record never settle X Layer funds.

## Release gates

No known critical/high security finding; all contract invariants/fuzz tests pass; all required AI cases pass or escalate as expected; no auto-PASS with missing mandatory evidence; fabricated/non-bundle citations are rejected; E2E Testnet flow succeeds repeatedly from a clean state; source verified; Builder Code attribution verified when code exists; accessibility critical path passes. Contract tests prove only the resolver can split, and challenge duration cannot change after acceptance.
