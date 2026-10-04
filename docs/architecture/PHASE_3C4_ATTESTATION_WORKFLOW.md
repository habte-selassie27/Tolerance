# Phase 3C4 — Operational Attestation

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
