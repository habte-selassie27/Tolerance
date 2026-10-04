# Smart-contract architecture - amended Phase 2A design

## Evidence deadline comparison

The initial commitment is accepted only when `block.timestamp < fundedAt + evidenceSubmissionWindow`. At the deadline and afterwards, it fails even during pause; the buyer's no-evidence refund is eligible at `block.timestamp >= fundedAt + evidenceSubmissionWindow` when the state remains `FUNDED`.

## Fixed design inputs

`CommercialObligationEscrow` is a non-upgradeable, single-asset ERC-20 escrow. The constructor receives the settlement token once; X Layer Testnet USD₮0 is the intended deployment parameter after runtime verification. Parties, agreement hash, policy hash and accepted challenge duration are immutable for an obligation. The automatic path permits only a full authorised supplier release or full buyer refund after the challenge period. Resolver split is permitted only from `DISPUTED`.

The EIP-712 outcome binds obligation ID, current evidence root, policy hash, outcome, nonce and expiry. Signatures are role-checked at execution time, so adjudicator rotation/revocation applies immediately. The chain is authoritative for economic state; offchain records are projections.

## Approved liveness rule

The obligation records an immutable evidence submission window at acceptance. It begins only at funding. If it expires with no committed evidence root, buyer may receive the full timeout refund. After evidence commitment no time-based path determines a winner; parties may dispute, mutually resolve, or await a finalized GenLayer verdict plus constrained attestation.

`RESOLVER_ROLE` is replaced by `RESOLUTION_ATTESTOR_ROLE`; it may only relay a `FINALIZED` configured GenLayer Studionet verdict, never decide the dispute or supply beneficiaries. A separate 2-of-2 mutual-resolution signature supports consensual full release, full refund, or split from `DISPUTED`.
