# RC5B V2 local lane

RC5B introduces a parallel, undeployed V2 lane. V1 remains bound to its
existing escrow and judge; no V1 row, packet, or hash is upgraded.

V2 commitments use distinct domains:

- `ToleranceEvidenceManifestV2` commits the private evidence hashes and frozen
  public source references, not bytes that validators have not yet fetched.
- `ToleranceFetchedSourceVerificationV1` commits the canonical results observed
  by validator-side retrieval.
- `ToleranceDisputePacketV2` and `ToleranceResolvedCaseV2` are separate from
  V1 canonical artifacts.

Public URLs are HTTPS-only, exact-host and policy-path bound. Credentials,
fragments, query strings, localhost, IP literals, and non-standard ports are
rejected. The V2 judge calls `gl.nondet.web.get` inside its nondeterministic
validator execution. Packet content is never accepted as fetched source
content. A failed or unavailable mandatory source produces
`INSUFFICIENT_EVIDENCE`, not a satisfied requirement.

The `20260812000200_rc5b_protocol_v2` migration is additive. JudgeV2 is
recorded separately after Studionet verification, while the V2 escrow remains
null and `deployed` remains false. All V2 worker submission attempts therefore
fail before send. This prevents an implicit V2-to-V1 fallback while V1 remains
economically live.
