# Phase 3C1 — Dispute workflow and X Layer binding

## Scope

Phase 3C1 creates the application workflow between an immutable, validated `DisputePacketSnapshot` and the X Layer escrow's `enterDispute` transition. It does not submit a GenLayer case, observe GenLayer, collect attestations, or execute settlement.

The backend prepares and verifies. A buyer or supplier wallet signs and sends the transaction. Tolerance never receives or stores the party's private key.

## Authoritative lineage

`createDisputeWorkflow(actorId, obligationId)` authorizes the actor against the obligation's deal organization and invokes the existing packet builder. Consequently, creation succeeds only for the current persisted lineage:

`Obligation -> EvidenceBundleSnapshot -> EvaluationContextSnapshot -> VALIDATED AiEvaluationSnapshot -> DisputePacketSnapshot`.

The service accepts only actor and application identifiers. It does not accept client-provided packet JSON, packet hash, evidence root, case ID, protocol address, requirement data, or verdict. Rejected AI output and stale evidence bindings fail before a workflow is created.

`AdjudicationCase` remains the existing workflow root. Phase 3C1 binds it to `DisputePacketSnapshot` and records the requesting user, workflow state/version, X Layer dispute transaction, confirmation time, observation time, retry metadata, and failure category. Legacy adjudication observation rows retain a null workflow state rather than being mislabeled as Phase 3C1 workflows.

## State machine

Phase 3C1 permits exactly:

```text
PACKET_READY
  -> XLAYER_BINDING_PENDING
  -> XLAYER_DISPUTE_CONFIRMED
```

`GENLAYER_SUBMISSION_PENDING` is reserved in the enum for Phase 3C2 but has no reachable Phase 3C1 transition. Every other transition fails closed. `workflowVersion` is compared and incremented atomically to reject stale writers and lost updates.

## Idempotency

The database uniquely binds an obligation and packet snapshot to one adjudication workflow. The protocol `caseId` remains unique, as does the confirmed X Layer dispute transaction hash. Repeating workflow creation for the same immutable packet returns the existing row and creates no duplicate audit event. Repeating confirmation with the same already-confirmed transaction is also idempotent.

## Unsigned wallet transaction

`prepareXLayerEnterDispute` moves the workflow to `XLAYER_BINDING_PENDING` and returns only:

- X Layer Testnet chain ID `1952`;
- configured escrow address;
- method `enterDispute`;
- ABI calldata;
- numeric X Layer obligation ID;
- immutable dispute packet hash;
- zero native value.

It returns no account, signer, signature, private key, or send operation. The wallet must be a contract-recognized buyer or supplier; the escrow enforces that authority on-chain.

## Confirmation boundary

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

## Security model

- Supabase authentication remains the session boundary; server-side organization membership remains the object/tenant authorization boundary.
- Wallet keys and signatures never cross into the backend service.
- The transaction hash is attacker-controlled lookup input and grants no authority.
- Packet and protocol bindings come exclusively from persisted server state and typed protocol configuration.
- Wrong chain, escrow, method, obligation, packet hash, event, initiator, finality, execution status, or final contract state is rejected.
- Optimistic concurrency and database uniqueness prevent duplicate or stale workflow mutations.
- Audit events are created only for successful workflow creation, preparation, and confirmation.

## Persistence and tests

Migration `20260810000800_phase3c1_dispute_workflow` is additive. It introduces `DisputeWorkflowStatus`, relations to the immutable packet and requesting user, workflow coordination fields, uniqueness for packet/transaction identity, and query indexes.

The focused unit suite covers the legal transition graph, reserved-state rejection, exact unsigned calldata, absence of signing fields, finalized binding acceptance, and negative chain/escrow/method/obligation/hash/event/party/state cases. The real Supabase suite covers validated-AI and stale-lineage denial, tenant authorization, idempotent creation, optimistic concurrency, persistence, audit writes, protocol-event recording, and idempotent confirmation using synthetic data. It performs no blockchain transaction.

Run the persistence suite with `pnpm test:integration:phase3c1` using ignored local Supabase configuration.

## Phase boundary

Phase 3C1 stops at `XLAYER_DISPUTE_CONFIRMED`. It neither advances to `GENLAYER_SUBMISSION_PENDING` nor calls GenLayer. Phase 3C2 may begin only from a persisted confirmed workflow and must preserve the immutable packet and on-chain binding established here.
