# Smart-contract test strategy

Foundry covers create/accept/fund/evidence, fast full-release/refund, the exact no-evidence timeout boundary, challenge while paused, mutual split, strict source/hash/expiry binding, revoked/duplicate/insufficient attestors, and fuzzed full accounting. Release gates: `forge fmt --check`, `forge build`, and `forge test`.

Dedicated closure suites cover lifecycle/evidence/time/authorization/pause/token negative paths and all six directional EIP-712 family-confusion attempts. Stateful invariants remain configured at 128 runs × depth 64.

Phase 2C/2D integration must prove that `ACCEPTED`, protocol `UNDETERMINED`, and a later-finalized transaction without a matching `{ resolved: true, resultHash }` case record never settle X Layer funds.
