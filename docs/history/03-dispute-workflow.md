# Dispute workflow

X Layer dispute binding, safe GenLayer submission, resolution observation, operational attestation and guarded settlement.

> Archived build record. It describes how these parts were assembled, not necessarily how they work today. For current decisions see [`ARCHITECTURE_DECISION_RECORD`](../architecture/ARCHITECTURE_DECISION_RECORD.md).

## Phase 3C1 — Dispute workflow and X Layer binding

### Scope

Phase 3C1 creates the application workflow between an immutable, validated `DisputePacketSnapshot` and the X Layer escrow's `enterDispute` transition. It does not submit a GenLayer case, observe GenLayer, collect attestations, or execute settlement.

The backend prepares and verifies. A buyer or supplier wallet signs and sends the transaction. Tolerance never receives or stores the party's private key.

### Authoritative lineage

`createDisputeWorkflow(actorId, obligationId)` authorizes the actor against the obligation's deal organization and invokes the existing packet builder. Consequently, creation succeeds only for the current persisted lineage:

`Obligation -> EvidenceBundleSnapshot -> EvaluationContextSnapshot -> VALIDATED AiEvaluationSnapshot -> DisputePacketSnapshot`.

The service accepts only actor and application identifiers. It does not accept client-provided packet JSON, packet hash, evidence root, case ID, protocol address, requirement data, or verdict. Rejected AI output and stale evidence bindings fail before a workflow is created.

`AdjudicationCase` remains the existing workflow root. Phase 3C1 binds it to `DisputePacketSnapshot` and records the requesting user, workflow state/version, X Layer dispute transaction, confirmation time, observation time, retry metadata, and failure category. Legacy adjudication observation rows retain a null workflow state rather than being mislabeled as Phase 3C1 workflows.

### State machine

Phase 3C1 permits exactly:

```text
PACKET_READY
  -> XLAYER_BINDING_PENDING
  -> XLAYER_DISPUTE_CONFIRMED
```

`GENLAYER_SUBMISSION_PENDING` is reserved in the enum for Phase 3C2 but has no reachable Phase 3C1 transition. Every other transition fails closed. `workflowVersion` is compared and incremented atomically to reject stale writers and lost updates.

### Idempotency

The database uniquely binds an obligation and packet snapshot to one adjudication workflow. The protocol `caseId` remains unique, as does the confirmed X Layer dispute transaction hash. Repeating workflow creation for the same immutable packet returns the existing row and creates no duplicate audit event. Repeating confirmation with the same already-confirmed transaction is also idempotent.

### Unsigned wallet transaction

`prepareXLayerEnterDispute` moves the workflow to `XLAYER_BINDING_PENDING` and returns only:

- X Layer Testnet chain ID `1952`;
- configured escrow address;
- method `enterDispute`;
- ABI calldata;
- numeric X Layer obligation ID;
- immutable dispute packet hash;
- zero native value.

It returns no account, signer, signature, private key, or send operation. The wallet must be a contract-recognized buyer or supplier; the escrow enforces that authority on-chain.

### Confirmation boundary

The caller may submit only a workflow ID and transaction hash. The server-owned verifier fetches and decodes the transaction and fails unless all conditions hold:

- the configured X Layer client reports chain `1952`;
- the transaction is finalized and succeeded;
- destination is the configured escrow;
- decoded method is `enterDispute`;
- obligation ID and packet hash match the immutable workflow;
- the escrow emitted the matching `DisputeEntered` event;
- the event initiator matches the persisted buyer or supplier wallet;
- finalized escrow state is `DISPUTED`;
- finalized on-chain `disputePacketHash` matches the packet snapshot.

Only then does the application atomically record `XLAYER_DISPUTE_CONFIRMED`, update the coarse obligation observation, upsert the protocol event, and write an audit event. A transaction hash alone is never evidence of success.

### Security model

- Supabase authentication remains the session boundary; server-side organization membership remains the object/tenant authorization boundary.
- Wallet keys and signatures never cross into the backend service.
- The transaction hash is attacker-controlled lookup input and grants no authority.
- Packet and protocol bindings come exclusively from persisted server state and typed protocol configuration.
- Wrong chain, escrow, method, obligation, packet hash, event, initiator, finality, execution status, or final contract state is rejected.
- Optimistic concurrency and database uniqueness prevent duplicate or stale workflow mutations.
- Audit events are created only for successful workflow creation, preparation, and confirmation.

### Persistence and tests

Migration `20260810000800_phase3c1_dispute_workflow` is additive. It introduces `DisputeWorkflowStatus`, relations to the immutable packet and requesting user, workflow coordination fields, uniqueness for packet/transaction identity, and query indexes.

The focused unit suite covers the legal transition graph, reserved-state rejection, exact unsigned calldata, absence of signing fields, finalized binding acceptance, and negative chain/escrow/method/obligation/hash/event/party/state cases. The real Supabase suite covers validated-AI and stale-lineage denial, tenant authorization, idempotent creation, optimistic concurrency, persistence, audit writes, protocol-event recording, and idempotent confirmation using synthetic data. It performs no blockchain transaction.

Run the persistence suite with `pnpm test:integration:phase3c1` using ignored local Supabase configuration.

### Phase boundary

Phase 3C1 stops at `XLAYER_DISPUTE_CONFIRMED`. It neither advances to `GENLAYER_SUBMISSION_PENDING` nor calls GenLayer. Phase 3C2 may begin only from a persisted confirmed workflow and must preserve the immutable packet and on-chain binding established here.

---

## Phase 3C2: Safe GenLayer dispute submission

### Scope

Phase 3C2 begins only after the Phase 3C1 wallet-owned `enterDispute` binding is finalized and recorded as `XLAYER_DISPUTE_CONFIRMED`. It submits the exact immutable `DisputePacketSnapshot.canonicalJson` to the configured Studionet judge. It does not verify a commercial resolution, sign an attestation, or settle an X Layer obligation.

### Preconditions and immutable boundary

The server loads the workflow, obligation, packet snapshot, evidence-bundle snapshot, evaluation-context snapshot, and validated AI snapshot itself. Before an intent is created it verifies the organization authorization, X Layer `DISPUTED` binding, X Layer packet hash, case ID, agreement hash, policy hash, evidence root, packet canonical bytes, recomputed packet hash, current Studionet chain (`61999`), and configured judge. The request surface accepts only a workflow ID; it never accepts packet JSON, packet hashes, a judge, verdict, or chain identity from a client.

`DisputePacketV1` is not transformed after the Phase 3C1 confirmation. The submission payload is the stored canonical string whose recomputed hash equals both the immutable snapshot and the confirmed X Layer commitment.

### CLI/keychain signer boundary

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

### Durable intent and crash handling

An `AdjudicationCase` stores a server-generated request ID, dispatch state, timestamps, transaction hash, sanitized failure code, safe lifecycle status, and retry time. The state machine is:

```text
XLAYER_DISPUTE_CONFIRMED
  -> GENLAYER_SUBMISSION_PENDING (INTENT_CREATED)
  -> GENLAYER_SUBMISSION_PENDING (DISPATCHING)
  -> GENLAYER_SUBMITTED (SUBMITTED)
```

An intent that was persisted but never entered `DISPATCHING` is safe to retry: no external send has been attempted. Once dispatch begins, an executor failure or recovery from a potentially dispatched attempt becomes `GENLAYER_SUBMISSION_UNKNOWN` and requires review; the service never blindly resubmits it. This deliberately favors duplicate-submit safety over availability.

Repeated requests after a persisted transaction hash return that same submission. Conditional updates and `workflowVersion` ensure concurrent callers cannot make two external sends.

### Status-only observation

`JsonRpcGenLayerStatusClient` calls only `gen_getTransactionStatus` with `{ txId }`. It stores the sanitized status/code and observation time. `ACCEPTED` and `FINALIZED` are protocol lifecycle observations only in this phase; they do not produce a verified Tolerance result. `UNDETERMINED` remains distinct from business `INSUFFICIENT_EVIDENCE`. Malformed or unknown lifecycle status changes the workflow to `REVIEW_REQUIRED`.

Broad transaction, receipt, consensus-payload, and validator APIs remain prohibited from this path. Phase 3C3 owns safe finalized resolution verification.

### Privacy and safety

Routine records and audit events contain workflow, case, public judge, packet hash, transaction hash, status, and failure category only. They do not retain keychain material, private keys, broad CLI/client objects, raw provider responses, or complete evidence packets. `AUTOMATIC_ATTESTATION_ENABLED` remains hard-disabled and no X Layer settlement operation is introduced.

### Verification

Unit tests mock the CLI and JSON-RPC boundaries to cover exact raw-string transport, runtime cleanup, malformed executor output, pre-send versus possible-send failures, and all required status classes. The real Supabase integration uses synthetic records to prove durable intents, submitted hash persistence, idempotency, status recording, authorization, and unknown-state persistence.

The controlled live harness creates a labelled synthetic X Layer obligation with
the configured test-party wallets, then uses the production Phase 3C1 verifier
and Phase 3C2 CLI/keychain submitter. It records only submission identity plus
safe status polling and intentionally does not inspect or verify
`ResolvedCaseV1`. A transaction cannot enter that path until X Layer's
`finalized` block has reached the `enterDispute` receipt block; a delayed
finalized head leaves the workflow pending rather than treating a mined receipt
as a confirmed binding.

### Phase 3C3 boundary

Phase 3C3 may consume `GENLAYER_SUBMITTED` lifecycle observations to implement narrowly safe finalized-resolution verification. It must not be folded into the submitter, and Phase 3C2 does not initiate attestation or settlement.

---

## Phase 3C3 — Safe Resolution Observation

Phase 3C3 consumes a Phase 3C2 `GENLAYER_SUBMITTED` workflow. It does not
submit a case, sign an attestation, or settle an X Layer obligation.

### Boundary

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

### Persistence and state

`ResolutionObservation` is an immutable one-to-one record for an
`AdjudicationCase`. It persists the finalized transaction hash, configured
judge/chain, all resolved bindings, canonical resolved case JSON, result hash,
verdict, observer version, and verification level. A transactionally claimed
transition prevents concurrent observers from producing conflicting records:

`GENLAYER_SUBMITTED → GENLAYER_FINALIZED → ATTESTATION_BLOCKED`.

Repeated observation reuses the immutable record. An observation that cannot
prove finality does not create a record.

### Verification levels and attestation boundary

`FINALIZED_STATE_VERIFIED` means the safe lifecycle endpoint reports finality
and finalized judge state exactly verifies as `ResolvedCaseV1`.

It is deliberately not `ATTESTATION_ELIGIBLE`. Tolerance's application
submission record is useful provenance, but it is not independent proof of the
transaction target, method, or execution success. The available receipt helpers
ultimately use prohibited broad transaction APIs. `gen_dbg_traceTransaction` is
development-only and is not a production dependency. Consequently Phase 3C3
sets `ATTESTATION_BLOCKED` with
`ATTESTATION_INDEPENDENT_TX_PROVENANCE_UNAVAILABLE`; it never signs or settles.

### Privacy and safety

Routine logs carry identifiers, hashes, lifecycle state, and failure categories
only. No private keys, receipts, validator configuration, raw evidence, or full
packet data are logged or persisted by the observer. Automatic attestation
remains disabled. Phase 3C4 may begin only after an independently safe
execution-success and target/method binding capability is established.

---

## Phase 3C4 — Operational Attestation

Phase 3C4 persists immutable EIP-712 attestation rounds and independently
submitted signatures. It reuses the frozen Phase 2D `GenLayerResolution`
payload, digest, 2-of-3 threshold, and escrow domain; it does not create a new
signature protocol.

`FINALIZED_STATE_VERIFIED` is deliberately insufficient for an open round. It
creates a reusable `BLOCKED` record only. An `OPEN` round requires explicit
`ATTESTATION_ELIGIBLE`, a server-owned attestation policy, and a non-expired
payload. The coordinator never signs or manufactures signatures. It recovers
each submitted signer, enforces the configured allowlist and unique
round/signer constraint, and moves to `THRESHOLD_REACHED` only after two
distinct authorized signatures.

Automatic attestation remains disabled. Test-only eligible fixtures are not
evidence of live GenLayer eligibility.

---

## Phase 3C5 — Guarded Settlement Coordinator

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
