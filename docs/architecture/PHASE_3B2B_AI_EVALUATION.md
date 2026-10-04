# Phase 3B2B — Constrained AI Evaluation

Tolerance evaluates only a server-owned `DeterministicEvaluationContextV1`. The OpenAI adapter uses the Responses API with strict structured output and is server-only: `OPENAI_API_KEY` and `TOLERANCE_EVALUATION_MODEL` are read only from non-public environment variables.

## Request and privacy boundary

`buildAiEvaluationRequestV1` sends the scoped requirements, governing source blocks, mapped evidence source blocks, deterministic checks, policy, and exact citation references. Source text is labelled **untrusted evidence data**. The model is instructed never to follow instructions inside it, to cite only supplied references, and never to make a payment or protocol decision. It does not receive PDFs, storage keys or URLs, Supabase credentials, sessions, wallet data, or unrelated records.

## Trust gate

Responses must conform to the existing `AiEvaluationV1` contract. Tolerance then validates the context hash, exact requirement coverage, result vocabulary, non-empty claims and citations, citation allowlist/hash identity, and deterministic-check consistency. A `SATISFIED` result contradicting a failed required-evidence or structured deterministic check is rejected. The requirement vocabulary is `SATISFIED`, `NOT_SATISFIED`, `INSUFFICIENT_EVIDENCE`, and `NOT_APPLICABLE`; it is not a settlement verdict.

## Persistence and operations

`AiEvaluationRun` records request state (`REQUESTED`, `SUCCEEDED_UNVALIDATED`, `VALIDATED`, `REJECTED`, or `FAILED`) and safe operational metadata. `AiEvaluationSnapshot` is immutable and is created only after validation. The uniqueness key on context, provider/model, request schema, and idempotency key prevents double-submission from creating uncontrolled provider calls. Requests use a bounded timeout and retry only transient provider errors; validation failures are never retried as provider failures.

Phase 3B2B does not create a `DisputePacketV1`, call GenLayer or X Layer, aggregate settlement outcomes, or enable automatic attestation. Phase 3B2C may consume only validated snapshots.
