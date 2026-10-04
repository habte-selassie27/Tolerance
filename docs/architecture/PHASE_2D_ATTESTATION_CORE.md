# Phase 2D-A resolution-attestation verification core

Phase 2D-A is credential-independent. It is deliberately fail-closed: an attestor signs only after independent narrow status, execution-result and transaction-binding sources establish `FINALIZED`, `FINISHED_WITH_RETURN`, and the configured judge recipient, then reads `get_case` using `LATEST_FINAL`, verifies every atomic Tolerance binding, and recomputes the ABI-encoded `ToleranceResolvedCaseV1` result hash.

The broad `getTransaction` response is prohibited in the attestation observer. On 2026-08-09, a Studionet response included validator configuration with private-key material. Tolerance did not retain or use it. The observer now accepts only explicit safe DTOs and must not resume live signing until a documented minimal source for execution and transaction binding is verified.

`ACCEPTED`, `UNDETERMINED`, failed execution, a missing/unresolved case, a foreign judge, or any binding mismatch produces no signature. Where the SDK exposes decoded call data, the observer rejects a method other than `submit_case`; receipt recipient and successful finality remain the minimum independently verified linkage.

The coordinator only recovers and deduplicates signatures over the exact EIP-712 `GenLayerResolution` payload. It cannot supply a recipient, split, or alternate verdict/hash: those fields derive from the verified case and the frozen escrow maps funds only to its immutable parties.

## Packet canonicalization

`DisputePacketV1` hashes compact JSON encoded as UTF-8 with recursively sorted Unicode scalar keys, `,`/`:` separators, preserved array order, unescaped Unicode, no Unicode normalization, and SHA-256. `disputePacketHash` is omitted before hashing. Booleans and null retain JSON spellings; integers must be IEEE-754 safe integers; floats, NaN, Infinity, non-JSON values, and unpaired surrogate code points are forbidden.

## Live boundary

The committed `.env.phase2d.local.example` names the ignored secrets required for Phase 2D-B. Test-only deterministic accounts in tests never represent Testnet attestors. Studionet is the only GenLayer network for this build; Bradbury is out of scope.

## Phase 2D-B1 live staging — complete

Studionet finalized immutable `RELEASE_FULL` and `INSUFFICIENT_EVIDENCE` records for two live X Layer disputes. The deployed X Layer receiver also accepted a separately labelled synthetic 2-of-3 fixture. This fixture is not GenLayer-derived settlement.

Automatic GenLayer-derived attestation remains feature-gated. Studionet has not supplied a verified safe minimal source for both successful finalized execution and recipient/method/case binding without retrieving unsafe validator or consensus configuration. The observer remains fail-closed and broad transaction or receipt APIs remain prohibited.
