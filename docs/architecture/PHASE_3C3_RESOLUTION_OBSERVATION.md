# Phase 3C3 — Safe Resolution Observation

Phase 3C3 consumes a Phase 3C2 `GENLAYER_SUBMITTED` workflow. It does not
submit a case, sign an attestation, or settle an X Layer obligation.

## Boundary

The observer first uses only `gen_getTransactionStatus`. A business resolution
is eligible for observation only when that narrow endpoint reports `FINALIZED`.
`ACCEPTED` and every earlier lifecycle state remain non-terminal. `UNDETERMINED`
is stored as a distinct protocol outcome; it is never translated into the
commercial `INSUFFICIENT_EVIDENCE` verdict.

After finality, `GenLayerFinalizedJudgeStateReader` performs a `gen_call`
`readContract(get_case)` against `LATEST_FINAL` state. It does not call
`gen_getTransactionReceipt`, `getTransaction`, or any broad consensus payload
endpoint. The returned frozen `ResolvedCaseV1` is parsed and passed through the
existing `verifyResolvedCase` boundary. Case ID, X Layer binding, agreement,
policy, evidence root, packet hash, verdict, and computed `resultHash` must all
match exactly.

## Persistence and state

`ResolutionObservation` is an immutable one-to-one record for an
`AdjudicationCase`. It persists the finalized transaction hash, configured
judge/chain, all resolved bindings, canonical resolved case JSON, result hash,
verdict, observer version, and verification level. A transactionally claimed
transition prevents concurrent observers from producing conflicting records:

`GENLAYER_SUBMITTED → GENLAYER_FINALIZED → ATTESTATION_BLOCKED`.

Repeated observation reuses the immutable record. An observation that cannot
prove finality does not create a record.

## Verification levels and attestation boundary

`FINALIZED_STATE_VERIFIED` means the safe lifecycle endpoint reports finality
and finalized judge state exactly verifies as `ResolvedCaseV1`.

It is deliberately not `ATTESTATION_ELIGIBLE`. Tolerance's application
submission record is useful provenance, but it is not independent proof of the
transaction target, method, or execution success. The available receipt helpers
ultimately use prohibited broad transaction APIs. `gen_dbg_traceTransaction` is
development-only and is not a production dependency. Consequently Phase 3C3
sets `ATTESTATION_BLOCKED` with
`ATTESTATION_INDEPENDENT_TX_PROVENANCE_UNAVAILABLE`; it never signs or settles.

## Privacy and safety

Routine logs carry identifiers, hashes, lifecycle state, and failure categories
only. No private keys, receipts, validator configuration, raw evidence, or full
packet data are logged or persisted by the observer. Automatic attestation
remains disabled. Phase 3C4 may begin only after an independently safe
execution-success and target/method binding capability is established.
