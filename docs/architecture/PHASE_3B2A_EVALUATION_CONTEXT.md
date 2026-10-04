# Phase 3B2A — Deterministic Evaluation Context

The server-only evaluation context is derived from an immutable EvidenceBundle snapshot and retains effective and historical governing sources, exact mapped evidence blocks, a citation allowlist, required-evidence presence checks, and versioned supplier-burden policy metadata. Approved amendments use the persisted resolver; drafts never supersede base terms.

`evaluationContextHash` is SHA-256 over UTF-8 `ToleranceDeterministicEvaluationContextV1\n` plus packet-compatible canonical JSON. Identical bundle plus policy reuses an `EvaluationContextSnapshot`; changed effective provenance changes the context hash. Contexts contain source text/provenance only—never storage keys, signed URLs, credentials, or PDF bytes.

`validateEvaluationCitations` accepts only exact allowlisted SourceBlock hash/document/page/block references. `validateAiEvaluation` is provider-independent and rejects wrong context hashes, missing/duplicate/unknown requirements, unsupported requirement-level results, and missing or malformed citations. It defines types only: no model call, verdict, DisputePacket, GenLayer write, or X Layer write occurs here.

Phase 3B2B may call an AI provider only through these fixed context and validation boundaries.
