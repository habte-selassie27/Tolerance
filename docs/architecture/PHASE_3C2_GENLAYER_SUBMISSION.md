# Phase 3C2: Safe GenLayer dispute submission

## Scope

Phase 3C2 begins only after the Phase 3C1 wallet-owned `enterDispute` binding is finalized and recorded as `XLAYER_DISPUTE_CONFIRMED`. It submits the exact immutable `DisputePacketSnapshot.canonicalJson` to the configured Studionet judge. It does not verify a commercial resolution, sign an attestation, or settle an X Layer obligation.

## Preconditions and immutable boundary

The server loads the workflow, obligation, packet snapshot, evidence-bundle snapshot, evaluation-context snapshot, and validated AI snapshot itself. Before an intent is created it verifies the organization authorization, X Layer `DISPUTED` binding, X Layer packet hash, case ID, agreement hash, policy hash, evidence root, packet canonical bytes, recomputed packet hash, current Studionet chain (`61999`), and configured judge. The request surface accepts only a workflow ID; it never accepts packet JSON, packet hashes, a judge, verdict, or chain identity from a client.

`DisputePacketV1` is not transformed after the Phase 3C1 confirmation. The submission payload is the stored canonical string whose recomputed hash equals both the immutable snapshot and the confirmed X Layer commitment.

## CLI/keychain signer boundary

`CliGenLayerCaseSubmitter` uses the active encrypted GenLayer CLI account (`tolerance-studionet-submitter`) through the CLI-managed client. It never exports or reads key material. Per invocation it creates one ignored temporary deployment workspace containing exactly one generated TypeScript deploy script. The script receives only the configured public judge and exact canonical packet string and calls:

```ts
client.writeContract({
  address: configuredJudge,
  functionName: "submit_case",
  args: [exactCanonicalPacketString],
  value: 0n,
});
```

The script emits only a narrow transaction-hash record. The workspace is deleted in `finally`, including failed executions. No application deploy scripts, private keys, wallet data, or browser-supplied fields are executed.

## Durable intent and crash handling

An `AdjudicationCase` stores a server-generated request ID, dispatch state, timestamps, transaction hash, sanitized failure code, safe lifecycle status, and retry time. The state machine is:

```text
XLAYER_DISPUTE_CONFIRMED
  -> GENLAYER_SUBMISSION_PENDING (INTENT_CREATED)
  -> GENLAYER_SUBMISSION_PENDING (DISPATCHING)
  -> GENLAYER_SUBMITTED (SUBMITTED)
```

An intent that was persisted but never entered `DISPATCHING` is safe to retry: no external send has been attempted. Once dispatch begins, an executor failure or recovery from a potentially dispatched attempt becomes `GENLAYER_SUBMISSION_UNKNOWN` and requires review; the service never blindly resubmits it. This deliberately favors duplicate-submit safety over availability.

Repeated requests after a persisted transaction hash return that same submission. Conditional updates and `workflowVersion` ensure concurrent callers cannot make two external sends.

## Status-only observation

`JsonRpcGenLayerStatusClient` calls only `gen_getTransactionStatus` with `{ txId }`. It stores the sanitized status/code and observation time. `ACCEPTED` and `FINALIZED` are protocol lifecycle observations only in this phase; they do not produce a verified Tolerance result. `UNDETERMINED` remains distinct from business `INSUFFICIENT_EVIDENCE`. Malformed or unknown lifecycle status changes the workflow to `REVIEW_REQUIRED`.

Broad transaction, receipt, consensus-payload, and validator APIs remain prohibited from this path. Phase 3C3 owns safe finalized resolution verification.

## Privacy and safety

Routine records and audit events contain workflow, case, public judge, packet hash, transaction hash, status, and failure category only. They do not retain keychain material, private keys, broad CLI/client objects, raw provider responses, or complete evidence packets. `AUTOMATIC_ATTESTATION_ENABLED` remains hard-disabled and no X Layer settlement operation is introduced.

## Verification

Unit tests mock the CLI and JSON-RPC boundaries to cover exact raw-string transport, runtime cleanup, malformed executor output, pre-send versus possible-send failures, and all required status classes. The real Supabase integration uses synthetic records to prove durable intents, submitted hash persistence, idempotency, status recording, authorization, and unknown-state persistence.

The controlled live harness creates a labelled synthetic X Layer obligation with
the configured test-party wallets, then uses the production Phase 3C1 verifier
and Phase 3C2 CLI/keychain submitter. It records only submission identity plus
safe status polling and intentionally does not inspect or verify
`ResolvedCaseV1`. A transaction cannot enter that path until X Layer's
`finalized` block has reached the `enterDispute` receipt block; a delayed
finalized head leaves the workflow pending rather than treating a mined receipt
as a confirmed binding.

## Phase 3C3 boundary

Phase 3C3 may consume `GENLAYER_SUBMITTED` lifecycle observations to implement narrowly safe finalized-resolution verification. It must not be folded into the submitter, and Phase 3C2 does not initiate attestation or settlement.
