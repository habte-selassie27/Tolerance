# Foundation and attestation

Decisions and verification work that established the repository, the protocol configuration and the resolution-attestation core.

> Archived build record. It describes how these parts were assembled, not necessarily how they work today. For current decisions see [`ARCHITECTURE_DECISION_RECORD`](../architecture/ARCHITECTURE_DECISION_RECORD.md).

## Phase 1 foundation decisions

### Implemented baseline

- Local Git repository on `main`, with one coherent foundation commit.
- Next.js 16.3.0 / React 19.2.7 / TypeScript 6.0.3 foundation; no product flow screens.
- pnpm 11.3.0 lockfile and exact package versions. ESLint, Prettier, Vitest and GitHub Actions CI are configured.
- Foundry workspace uses Solidity 0.8.30 but intentionally contains no escrow source, deployment scripts or tests in Phase 1.
- Shared domain vocabulary lives in `packages/domain`; it encodes requirement statuses, obligation states, permitted state transitions and the resolver-only split outcome rule.
- Foundation configuration uses a schema parser. Production configuration fails closed when `TOLERANCE_APP_ORIGIN` is absent. Auth, storage, database, AI, RPC, wallet and signer configuration are deferred to their owning phases.

### Deliberate non-implementation

No database migration, document processor, job runner, AI call, wallet flow, Builder Code, escrow behavior, deployment or product UI has been added.

### Build modification

Next.js added `allowJs`, `skipLibCheck`, and development type includes to `tsconfig.json` during the successful production build. These are framework-generated compatibility settings; strict project type checking remains enabled.

---

## Phase 2D-A resolution-attestation verification core

Phase 2D-A is credential-independent. It is deliberately fail-closed: an attestor signs only after independent narrow status, execution-result and transaction-binding sources establish `FINALIZED`, `FINISHED_WITH_RETURN`, and the configured judge recipient, then reads `get_case` using `LATEST_FINAL`, verifies every atomic Tolerance binding, and recomputes the ABI-encoded `ToleranceResolvedCaseV1` result hash.

The broad `getTransaction` response is prohibited in the attestation observer. On 2026-08-09, a Studionet response included validator configuration with private-key material. Tolerance did not retain or use it. The observer now accepts only explicit safe DTOs and must not resume live signing until a documented minimal source for execution and transaction binding is verified.

`ACCEPTED`, `UNDETERMINED`, failed execution, a missing/unresolved case, a foreign judge, or any binding mismatch produces no signature. Where the SDK exposes decoded call data, the observer rejects a method other than `submit_case`; receipt recipient and successful finality remain the minimum independently verified linkage.

The coordinator only recovers and deduplicates signatures over the exact EIP-712 `GenLayerResolution` payload. It cannot supply a recipient, split, or alternate verdict/hash: those fields derive from the verified case and the frozen escrow maps funds only to its immutable parties.

### Packet canonicalization

`DisputePacketV1` hashes compact JSON encoded as UTF-8 with recursively sorted Unicode scalar keys, `,`/`:` separators, preserved array order, unescaped Unicode, no Unicode normalization, and SHA-256. `disputePacketHash` is omitted before hashing. Booleans and null retain JSON spellings; integers must be IEEE-754 safe integers; floats, NaN, Infinity, non-JSON values, and unpaired surrogate code points are forbidden.

### Live boundary

The committed `.env.phase2d.local.example` names the ignored secrets required for Phase 2D-B. Test-only deterministic accounts in tests never represent Testnet attestors. Studionet is the only GenLayer network for this build; Bradbury is out of scope.

### Phase 2D-B1 live staging — complete

Studionet finalized immutable `RELEASE_FULL` and `INSUFFICIENT_EVIDENCE` records for two live X Layer disputes. The deployed X Layer receiver also accepted a separately labelled synthetic 2-of-3 fixture. This fixture is not GenLayer-derived settlement.

Automatic GenLayer-derived attestation remains feature-gated. Studionet has not supplied a verified safe minimal source for both successful finalized execution and recipient/method/case binding without retrieving unsafe validator or consensus configuration. The observer remains fail-closed and broad transaction or receipt APIs remain prohibited.
