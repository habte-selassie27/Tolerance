# GenLayer test strategy

Phase 2C uses 27 Direct Mode tests for authorization, write-once storage, packet hashing, clear verdicts, malformed/unsafe structured output, citation validation, prompt injection, amendment handling and substantive validator equivalence. A versioned ten-case synthetic manufacturing corpus covers clean pass, material failure, missing evidence, approved/unapproved/conflicting amendments, PASS/measurement contradiction, injection, identity mismatch and ambiguity.

Studionet integration deploys the exact contract, submits a synthetic clear-release case through real validator consensus, waits for `FINALIZED`, reads `LATEST_FINAL` state, confirms `resolved == true`, and proves duplicate overwrite fails. `ACCEPTED` is never treated as economic finality. Protocol `UNDETERMINED` remains distinct from the business verdict `INSUFFICIENT_EVIDENCE`; a transaction without a resolved finalized record is not attestable.

Phase 2D must reject `ACCEPTED`, wrong Studionet chain/IC/case/escrow/obligation/hash/nonce/expiry and revoked attestors. It must test `UNDETERMINED`, and a later-finalized transaction with no resolved case, as no-transfer outcomes. These relay tests are explicitly not implemented in Phase 2C.
