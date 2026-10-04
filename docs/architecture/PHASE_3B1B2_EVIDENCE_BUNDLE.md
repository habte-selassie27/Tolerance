# Phase 3B1B-2 — EvidenceBundleV1

## Scope

`EvidenceBundleV1` is the private, deterministic snapshot of persisted Tolerance provenance for one obligation. It does not evaluate evidence, propose a verdict, create a `DisputePacketV1`, submit to GenLayer, or write to X Layer.

## Provenance source and shape

The server-only builder reads the obligation binding, approved agreement, requirements, `RequirementSourceBlock` lineage, mapped `Evidence`, `EvidenceRequirement`, and `EvidenceSourceBlock` records. It calls the existing `resolveEffectiveGoverningSources()` service; amendment precedence is not reimplemented in the bundle layer.

The V1 object contains the application and X Layer obligation identities, agreement id/version/hash, policy hash, ordered requirements, ordered approved-amendment metadata, and ordered evidence. Source references contain the persisted `SourceBlockHashV1`, document content hash, page, block order, source locator, extractor version, and exact normalized source text. It deliberately excludes storage keys, signed URLs, credentials, private file bytes, authentication data, verdicts, and model output.

For example, a private bundle can retain `R-002` with its base `±0.25 mm` source, the approved amendment `±0.15 mm` source selected as effective, and an inspection source `Measured diameter: 50.10 mm`. This records provenance only; it does not determine whether that measurement satisfies the term.

The synthetic golden fixture freezes the resulting `evidenceBundleHash` as `sha256:6f8fdf2314739f92847538381f143bf54f352c45758fdee7f7479d3f0d891911` and `evidenceRoot` as `0x6f8fdf2314739f92847538381f143bf54f352c45758fdee7f7479d3f0d891911`.

## Ordering and canonicalization

Requirements are ordered by `ordering`, key, then id. Source blocks are ordered by page, block order, then SourceBlock hash. Approved amendments are ordered by descending precedence, version, then source hash. Evidence is ordered by id and its linked requirements by requirement ordering, key, then id.

Canonical JSON uses the already-frozen packet-compatible rules: compact UTF-8 JSON, recursively Unicode-scalar-sorted keys, preserved arrays, no implicit Unicode normalization, safe integers only, and rejection of NaN, Infinity, unsupported values, and unpaired surrogates.

`evidenceBundleHash` is `sha256(UTF-8("ToleranceEvidenceBundleV1\\n" + canonicalJson))`, rendered as `sha256:<lowercase-hex>`. Phase 3B1B-2 defines the previously unspecified application construction of the protocol field: `evidenceRoot` is that same digest rendered as `0x<lowercase-hex>` bytes32. No competing frontend or backend root helper exists.

## Snapshot semantics and failure closure

Each successful build upserts an immutable `EvidenceBundleSnapshot` keyed by obligation plus bundle hash. It stores the schema version, canonical JSON, bundle hash, and root. It does not update application `Obligation.evidenceRoot`, which is an observed/cache representation of on-chain truth. A changed provenance graph yields a new snapshot; an identical retry reuses the same snapshot.

The builder fails closed for missing obligation bindings, missing agreement hash, a requirement without an effective governing source, a required requirement with declared evidence expectations but no mapped evidence, and invalid/unextracted/cross-deal source provenance. Optional requirements may remain unmapped.

## Privacy and next boundary

Bundle contents remain private off-chain until a later, explicit dispute-preparation flow curates authorized validator-visible material. This checkpoint adds **no AI evaluation, no EvidenceBundle verdict, no DisputePacketV1 generation, no GenLayer write, and no X Layer write**.

Phase 3B2 may consume this exact immutable evidence snapshot for deterministic evaluation and later packet preparation.
