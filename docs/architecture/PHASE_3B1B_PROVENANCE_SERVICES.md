# Phase 3B1B-1 — Provenance Services

Requirements and evidence are server-only domain records scoped to an obligation and its deal. `RequirementSourceBlock`, `EvidenceRequirement`, and `EvidenceSourceBlock` use composite primary keys, making repeated attachments idempotent. Each attachment verifies organization membership and rejects source documents from a different deal.

Governing terms retain their original SourceBlocks. Approved amendments can be represented by additional source attachments and precedence; draft amendments are not treated as effective by the service layer. Evidence retains document/source-block provenance rather than copied document text.

Audit events remain application-owned and must contain identifiers and action metadata only—never PDF text, credentials, tokens, or keys. The storage and extraction boundaries remain unchanged and private.

**PHASE 3B1B-1 = COMPLETE.** Its six critical provenance scenarios run in the opt-in `pnpm test:integration:phase3b1b` suite with synthetic, uniquely tagged data and safe cleanup: persistence round trip, approved-amendment resolution, three critical cross-boundary rejections, unauthenticated rejection, idempotency plus audit, and authorized private-PDF extraction/read smoke coverage. The normal fast test command excludes this mutating suite deliberately.

Additional integration hardening remains deferred to Phase 3D as documented in [PHASE_3_INTEGRATION_TEST_DEBT.md](PHASE_3_INTEGRATION_TEST_DEBT.md); these are test-depth gaps, not known product defects.

This checkpoint excludes EvidenceBundleV1, evidence roots, AI evaluation, DisputePacket creation, GenLayer writes, and X Layer writes. Phase 3B1B-2 may add deterministic evidence bundling after these provenance relations are exercised through the product workflow.
