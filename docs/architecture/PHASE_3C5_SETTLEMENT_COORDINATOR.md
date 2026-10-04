# Phase 3C5 — Guarded Settlement Coordinator

Phase 3C5 accepts only a persisted, non-expired `THRESHOLD_REACHED`
attestation round. The coordinator forwards the frozen EIP-712 payload and
verified stored signatures to a narrow gas-relayer boundary; it never accepts
client-selected recipients, amounts, verdicts, payloads, or signatures.

It records an intent before external dispatch, returns an existing transaction
identity idempotently, and marks a possible post-dispatch failure as
`SETTLEMENT_UNKNOWN` rather than blindly retrying. A transaction hash is not a
settlement result: terminal escrow-state/event verification remains required
before a future observer may mark `SETTLED` or `REFUNDED`.

No live settlement is performed by this phase. `FINALIZED_STATE_VERIFIED` and
`BLOCKED` rounds cannot enter this path, and automatic settlement remains off.
