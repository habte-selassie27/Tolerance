# GenLayer dispute architecture

## Authority split

X Layer remains the sole economic authority: immutable buyer/supplier, USDt0 escrow, challenge rights and final transfers. Tolerance manages private agreement/evidence provenance and the fast path. GenLayer adjudicates contested semantics; it never custodies the escrow.

## Successful resolution rule

A GenLayer transaction being `FINALIZED` is necessary but insufficient. An outcome is eligible for a threshold X Layer attestation only when finalized Intelligent Contract state exposes a **resolved Tolerance case record** for the same case: `{ schemaVersion, caseId, bindings, resolved: true, verdict }`. Phase 2D computes the separately versioned EVM `resultHash` from those atomic fields. A protocol `UNDETERMINED` transaction that later becomes final but has no such record leaves the obligation `DISPUTED`.

`caseId = keccak256(abi.encode(xLayerChainId, xLayerEscrow, obligationId))`. It is not a human-readable sequence number.

## Dispute packet and privacy

`DisputePacketV1` is versioned, hash-addressed and derived from the locked EvidenceBundle: governing terms/amendments, relevant stable SourceBlocks/page excerpts/images, deterministic findings, exact rubric and burden of proof, plus both parties' challenge/response materials. Canonicalization is UTF-8 JSON with recursively sorted keys, compact separators and no ASCII escaping; `disputePacketHash` is SHA-256 over that representation with the hash field omitted. The contract recomputes and validates it before adjudication. Its contents are untrusted data, not instructions. Complete commercial bundles stay private; validator-visible material must be synthetic/authorised and independently inspectable. Packet curation remains a material trust risk: construction must be deterministic where practical, party-reviewable and unable to silently omit inconvenient canonical evidence.

## Economic outcomes

Only `RELEASE_FULL`, `REFUND_FULL`, and `INSUFFICIENT_EVIDENCE` are consensus-consumed economic verdicts. `INSUFFICIENT_EVIDENCE` maps to buyer refund under the accepted supplier burden-of-proof policy. No GenLayer percentage discretion exists. `ACCEPTED` has no X Layer effect; only successful finalized case state is attestable.

## Implemented Intelligent Contract boundary

`ToleranceDisputeJudge` permits only its immutable deployment submitter to submit a canonical case. Submission authority cannot choose the verdict or write resolved state directly. The leader and validators independently evaluate the same packet using a custom `run_nondet_unsafe` validator. Equivalence requires the same business verdict and the same statuses for every mandatory requirement; reasoning prose and valid supporting citations may vary. Output schema, allowed verdict/status enums, required findings and source-ID membership are checked deterministically before the write-once resolved record is stored.

## Result hash

`RESULT_DOMAIN = keccak256("ToleranceResolvedCaseV1")`. Phase 2D must compute `keccak256(abi.encode(RESULT_DOMAIN, uint256 schemaVersion, bytes32 caseId, uint256 xLayerChainId, address xLayerEscrow, uint256 obligationId, bytes32 agreementHash, bytes32 policyHash, bytes32 evidenceRoot, bytes32 disputePacketHash, uint8 verdict))`. `RELEASE_FULL=0`, `REFUND_FULL=1`, `INSUFFICIENT_EVIDENCE=2`. Shared Solidity and viem fixtures freeze this encoding; `abi.encodePacked` is forbidden.
