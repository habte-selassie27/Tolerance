# Evidence and evaluation

The document ingestion, provenance, evaluation-context, AI-evaluation and dispute-packet pipeline as it was built, phase by phase.

> Archived build record. It describes how these parts were assembled, not necessarily how they work today. For current decisions see [`ARCHITECTURE_DECISION_RECORD`](../architecture/ARCHITECTURE_DECISION_RECORD.md).

## Phase 3A — Application Data Plane

### Authority boundaries

PostgreSQL is the durable application index for Tolerance users, commercial
documents, workflow metadata, and observed protocol facts. It is not an
economic ledger: X Layer remains authoritative for obligation funding and
settlement. GenLayer finalized contract state remains authoritative for a
contested adjudication result.

`ProtocolEvent` and `AdjudicationCase` are idempotent observations. They are
never used to override either chain.

### Identity and access

Supabase Auth authenticates users. `User.authSubject` references the Supabase
user ID; passwords and password hashes are not copied into application tables.
Server-side guards require authenticated membership before organization, deal,
or document access. UI visibility is not an authorization mechanism.

### Private documents

The `tolerance-private-evidence` Storage bucket is private. Object keys are
opaque UUID paths, while original filenames are metadata only. The server
computes SHA-256 content hashes, validates MIME type and size, and issues a
60-second signed URL only after document access is authorized.

### Commercial provenance

Agreement and Amendment versions are append-only. Requirements preserve their
governing source reference and acceptance criteria. SourceBlocks preserve
document/page/order/locator/hash/extraction-version provenance for Phase 3B;
this phase does not extract text or call an AI model. Evidence uses an explicit
many-to-many EvidenceRequirement mapping.

### Frozen protocol configuration

The typed configuration is restricted to X Layer Testnet (1952), the deployed
Tolerance escrow, and GenLayer Studionet (61999) judge. Mainnet and Bradbury are
not configured. `AUTOMATIC_ATTESTATION_ENABLED` defaults to `false`, and an
attempt to enable it fails closed. The automatic relay remains unavailable
until Studionet provides safe minimal execution and transaction-binding
observability without unsafe validator/consensus payloads.

### Phase 3B entry criteria

Phase 3B may add private document extraction, OCR where necessary, SourceBlock
creation, and requirement/evidence workflows only after preserving this
authorization and provenance boundary.

---

## Phase 3B1A — Private PDF Extraction

PDF.js (`pdfjs-dist` 6.2.108) runs only in server modules. The private object is downloaded through the server-only Supabase admin boundary, and SHA-256 is recomputed before parsing. A mismatch fails closed as `FILE_INTEGRITY_MISMATCH`.

Documents progress through `READY_FOR_EXTRACTION`, `EXTRACTING`, `EXTRACTED`, `FAILED`, or `OCR_REQUIRED`; timestamps, extractor version, and a small deterministic failure code are retained. PDF.js is queried page-by-page with 1-based provenance. Native-text-empty PDFs are `OCR_REQUIRED`; OCR is deliberately not included.

`normalizeSourceText` only normalizes line endings and non-semantic whitespace. `SourceBlockHashV1` is SHA-256 over UTF-8 lines: `ToleranceSourceBlockV1`, document content hash, page, block order, locator, extractor version, and normalized text. The persistence transaction replaces only the same extractor-version block set then marks the document extracted, making retries idempotent.

All extraction and SourceBlock reads require Phase 3A document authorization. No signed URL is persisted. This checkpoint excludes requirements workflows, evidence mapping/bundles, OCR, LLMs, GenLayer submission, and automatic attestation.

### Phase 3B1B entry

Add governing-source and evidence-mapping operations only after retaining this immutable source provenance boundary.

---

## Phase 3B1B-1 — Provenance Services

Requirements and evidence are server-only domain records scoped to an obligation and its deal. `RequirementSourceBlock`, `EvidenceRequirement`, and `EvidenceSourceBlock` use composite primary keys, making repeated attachments idempotent. Each attachment verifies organization membership and rejects source documents from a different deal.

Governing terms retain their original SourceBlocks. Approved amendments can be represented by additional source attachments and precedence; draft amendments are not treated as effective by the service layer. Evidence retains document/source-block provenance rather than copied document text.

Audit events remain application-owned and must contain identifiers and action metadata only—never PDF text, credentials, tokens, or keys. The storage and extraction boundaries remain unchanged and private.

**PHASE 3B1B-1 = COMPLETE.** Its six critical provenance scenarios run in the opt-in `pnpm test:integration:phase3b1b` suite with synthetic, uniquely tagged data and safe cleanup: persistence round trip, approved-amendment resolution, three critical cross-boundary rejections, unauthenticated rejection, idempotency plus audit, and authorized private-PDF extraction/read smoke coverage. The normal fast test command excludes this mutating suite deliberately.

Additional integration hardening remains deferred to Phase 3D as documented in [PHASE_3_INTEGRATION_TEST_DEBT.md](04-product-and-release.md#phase-3-integration-test-debt); these are test-depth gaps, not known product defects.

This checkpoint excludes EvidenceBundleV1, evidence roots, AI evaluation, DisputePacket creation, GenLayer writes, and X Layer writes. Phase 3B1B-2 may add deterministic evidence bundling after these provenance relations are exercised through the product workflow.

---

## Phase 3B1B-2 — EvidenceBundleV1

### Scope

`EvidenceBundleV1` is the private, deterministic snapshot of persisted Tolerance provenance for one obligation. It does not evaluate evidence, propose a verdict, create a `DisputePacketV1`, submit to GenLayer, or write to X Layer.

### Provenance source and shape

The server-only builder reads the obligation binding, approved agreement, requirements, `RequirementSourceBlock` lineage, mapped `Evidence`, `EvidenceRequirement`, and `EvidenceSourceBlock` records. It calls the existing `resolveEffectiveGoverningSources()` service; amendment precedence is not reimplemented in the bundle layer.

The V1 object contains the application and X Layer obligation identities, agreement id/version/hash, policy hash, ordered requirements, ordered approved-amendment metadata, and ordered evidence. Source references contain the persisted `SourceBlockHashV1`, document content hash, page, block order, source locator, extractor version, and exact normalized source text. It deliberately excludes storage keys, signed URLs, credentials, private file bytes, authentication data, verdicts, and model output.

For example, a private bundle can retain `R-002` with its base `±0.25 mm` source, the approved amendment `±0.15 mm` source selected as effective, and an inspection source `Measured diameter: 50.10 mm`. This records provenance only; it does not determine whether that measurement satisfies the term.

The synthetic golden fixture freezes the resulting `evidenceBundleHash` as `sha256:6f8fdf2314739f92847538381f143bf54f352c45758fdee7f7479d3f0d891911` and `evidenceRoot` as `0x6f8fdf2314739f92847538381f143bf54f352c45758fdee7f7479d3f0d891911`.

### Ordering and canonicalization

Requirements are ordered by `ordering`, key, then id. Source blocks are ordered by page, block order, then SourceBlock hash. Approved amendments are ordered by descending precedence, version, then source hash. Evidence is ordered by id and its linked requirements by requirement ordering, key, then id.

Canonical JSON uses the already-frozen packet-compatible rules: compact UTF-8 JSON, recursively Unicode-scalar-sorted keys, preserved arrays, no implicit Unicode normalization, safe integers only, and rejection of NaN, Infinity, unsupported values, and unpaired surrogates.

`evidenceBundleHash` is `sha256(UTF-8("ToleranceEvidenceBundleV1\\n" + canonicalJson))`, rendered as `sha256:<lowercase-hex>`. Phase 3B1B-2 defines the previously unspecified application construction of the protocol field: `evidenceRoot` is that same digest rendered as `0x<lowercase-hex>` bytes32. No competing frontend or backend root helper exists.

### Snapshot semantics and failure closure

Each successful build upserts an immutable `EvidenceBundleSnapshot` keyed by obligation plus bundle hash. It stores the schema version, canonical JSON, bundle hash, and root. It does not update application `Obligation.evidenceRoot`, which is an observed/cache representation of on-chain truth. A changed provenance graph yields a new snapshot; an identical retry reuses the same snapshot.

The builder fails closed for missing obligation bindings, missing agreement hash, a requirement without an effective governing source, a required requirement with declared evidence expectations but no mapped evidence, and invalid/unextracted/cross-deal source provenance. Optional requirements may remain unmapped.

### Privacy and next boundary

Bundle contents remain private off-chain until a later, explicit dispute-preparation flow curates authorized validator-visible material. This checkpoint adds **no AI evaluation, no EvidenceBundle verdict, no DisputePacketV1 generation, no GenLayer write, and no X Layer write**.

Phase 3B2 may consume this exact immutable evidence snapshot for deterministic evaluation and later packet preparation.

---

## Phase 3B2A — Deterministic Evaluation Context

The server-only evaluation context is derived from an immutable EvidenceBundle snapshot and retains effective and historical governing sources, exact mapped evidence blocks, a citation allowlist, required-evidence presence checks, and versioned supplier-burden policy metadata. Approved amendments use the persisted resolver; drafts never supersede base terms.

`evaluationContextHash` is SHA-256 over UTF-8 `ToleranceDeterministicEvaluationContextV1\n` plus packet-compatible canonical JSON. Identical bundle plus policy reuses an `EvaluationContextSnapshot`; changed effective provenance changes the context hash. Contexts contain source text/provenance only—never storage keys, signed URLs, credentials, or PDF bytes.

`validateEvaluationCitations` accepts only exact allowlisted SourceBlock hash/document/page/block references. `validateAiEvaluation` is provider-independent and rejects wrong context hashes, missing/duplicate/unknown requirements, unsupported requirement-level results, and missing or malformed citations. It defines types only: no model call, verdict, DisputePacket, GenLayer write, or X Layer write occurs here.

Phase 3B2B may call an AI provider only through these fixed context and validation boundaries.

---

## Phase 3B2B — Constrained AI Evaluation

Tolerance evaluates only a server-owned `DeterministicEvaluationContextV1`. The OpenAI adapter uses the Responses API with strict structured output and is server-only: `OPENAI_API_KEY` and `TOLERANCE_EVALUATION_MODEL` are read only from non-public environment variables.

### Request and privacy boundary

`buildAiEvaluationRequestV1` sends the scoped requirements, governing source blocks, mapped evidence source blocks, deterministic checks, policy, and exact citation references. Source text is labelled **untrusted evidence data**. The model is instructed never to follow instructions inside it, to cite only supplied references, and never to make a payment or protocol decision. It does not receive PDFs, storage keys or URLs, Supabase credentials, sessions, wallet data, or unrelated records.

### Trust gate

Responses must conform to the existing `AiEvaluationV1` contract. Tolerance then validates the context hash, exact requirement coverage, result vocabulary, non-empty claims and citations, citation allowlist/hash identity, and deterministic-check consistency. A `SATISFIED` result contradicting a failed required-evidence or structured deterministic check is rejected. The requirement vocabulary is `SATISFIED`, `NOT_SATISFIED`, `INSUFFICIENT_EVIDENCE`, and `NOT_APPLICABLE`; it is not a settlement verdict.

### Persistence and operations

`AiEvaluationRun` records request state (`REQUESTED`, `SUCCEEDED_UNVALIDATED`, `VALIDATED`, `REJECTED`, or `FAILED`) and safe operational metadata. `AiEvaluationSnapshot` is immutable and is created only after validation. The uniqueness key on context, provider/model, request schema, and idempotency key prevents double-submission from creating uncontrolled provider calls. Requests use a bounded timeout and retry only transient provider errors; validation failures are never retried as provider failures.

Phase 3B2B does not create a `DisputePacketV1`, call GenLayer or X Layer, aggregate settlement outcomes, or enable automatic attestation. Phase 3B2C may consume only validated snapshots.

---

## Phase 3B2C — DisputePacketV1

### Implemented trust boundary

The server-only `buildDisputePacketV1(actorId, obligationId)` entry point loads the authoritative obligation and immutable snapshot lineage from Postgres:

`Obligation -> EvidenceBundleSnapshot -> EvaluationContextSnapshot -> VALIDATED AiEvaluationSnapshot -> DisputePacketSnapshot`.

The caller cannot supply protocol bindings, hashes, requirements, citations, or AI output. Organization membership is checked before construction. Packet creation fails closed if the obligation, agreement hash, policy hash, evidence root, case identity, evaluation context, or AI snapshot belongs to another or stale lineage. Only an AI snapshot backed by an evaluation run with status `VALIDATED` is eligible.

The application AI remains non-authoritative. Its validated citations gate the curated requirement evidence, but its provider metadata, raw response, reasoning, and requirement verdicts are not added to the frozen Phase 2C schema. `ToleranceDisputeJudge` independently determines the commercial result.

### Packet construction and validation

The builder emits the existing `DisputePacketV1` exactly. It binds X Layer Testnet chain `1952`, the configured escrow, the numeric protocol obligation ID, the shared ABI-encoded case ID, agreement hash, policy hash, evidence root, rubric, burden of proof, disputed requirements, governing terms, approved amendments, SourceBlocks, deterministic checks, and the permitted buyer/supplier statement strings.

SourceBlocks are minimized to base/effective governing lineage, approved amendment sources, and mapped evidence included in the frozen evidence bundle. Citation identity is the persisted `SourceBlockHashV1`; model-generated quotation text is not trusted. Approved amendment precedence is preserved: the synthetic golden case retains base `±0.25 mm` as historical and marks the approved `±0.15 mm` term effective. Draft amendments cannot enter the committed evidence bundle or become effective.

Validation checks the exact top-level schema, protocol/case bindings, bytes32/address shapes, the exact requirement set, exact persisted SourceBlock identity/content/provenance, citation membership, hash-covered canonical bytes, privacy-field denylist, and packet size. Empty buyer challenge and supplier response strings are the current permitted minimal workflow form; substantive party positions are not fabricated.

### Canonicalization and hashing

Phase 3B2C reuses the frozen Phase 2C canonical serializer and packet hash. Object keys are recursively sorted, arrays retain semantic order, JSON is compact UTF-8, Unicode is not normalized, and unsupported values, floats, unsafe integers, and unpaired surrogates are rejected. `disputePacketHash` is omitted from its own SHA-256 input.

The tracked release, insufficient-evidence, refund, and prompt-injection fixtures are generated by the production TypeScript builder. The exact TypeScript canonical strings—not reconstructed Python objects—are passed to the Phase 2C Python helper. Python canonical UTF-8 bytes and packet hashes match TypeScript exactly for all four fixtures.

### Direct Mode compatibility

The exact application-generated packet strings execute through the frozen `ToleranceDisputeJudge.submit_case` in Direct Mode:

- complete `316L / ±0.15 mm / 50.10 mm` evidence resolves `RELEASE_FULL`;
- missing mandatory supplier proof resolves the business verdict `INSUFFICIENT_EVIDENCE`;
- explicit contrary measurement evidence resolves `REFUND_FULL`;
- hostile SourceBlock text remains untrusted and cannot cause release;
- invalid citation provenance is rejected before adjudication;
- a resolved case cannot be overwritten by a duplicate submission.

The reproducible command is `pnpm test:integration:phase3b2c-direct`. It requires the project-local `.venv-genlayer` with Python 3.12 and runs the exact-string TypeScript generator before the Python tests. The frozen test stack is `genlayer-test 0.29.2`, `genlayer-py 0.16.3`, and `genvm-linter 0.11.0`.

### Persistence and idempotency

Migration `20260810000700_phase3b2c_dispute_packet` adds immutable packet snapshots without resetting the database or modifying Supabase Auth/Storage schemas. A unique AI-snapshot/hash identity makes repeated construction from identical immutable inputs return the same canonical JSON, packet hash, and snapshot. Material changes produce a different hash and a new snapshot; old snapshots remain unchanged.

The real Supabase suite proves the complete persisted lineage, exact reconstructed canonical JSON/hash, authorization and cross-organization rejection, non-validated AI rejection, stale evidence-root rejection, and idempotent reuse using synthetic records only.

### Privacy and size boundary

Raw PDFs remain private/offchain. The curated packet is intentionally visible to GenLayer validator execution if later submitted. It contains only adjudication-required SourceBlock text and provenance; it excludes raw PDF bytes, storage object keys, signed URLs, Supabase/OpenAI credentials, authentication tokens, wallet material, provider internals, and hidden reasoning.

`TOLERANCE_DISPUTE_PACKET_MAX_BYTES` provides a configurable application guard capped at the conservative V1 default of 120,000 UTF-8 bytes. This is an application safeguard, not a claimed GenLayer protocol limit. Normal golden packets pass and oversized packets are rejected before submission.

### Phase boundary and limitations

Phase 3B2C performs no Studionet or X Layer write and leaves `AUTOMATIC_ATTESTATION_ENABLED=false`. Human challenge/response collection and the GenLayer-to-X-Layer automatic attestation/settlement path remain future workflow work. Phase 3C may consume only persisted, validated, immutable packet snapshots; it must not bypass this trust boundary.
