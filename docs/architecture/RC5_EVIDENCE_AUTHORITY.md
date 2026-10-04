# RC5 — Evidence authority hardening

## Decision

Tolerance now keeps **integrity** distinct from **authority**. A document
content hash and page-aware `SourceBlock` prove that an extracted excerpt is
bound to a particular stored document. They do not prove that the document is
an independently authoritative statement of fact.

Ordinary private uploads therefore persist as `PARTY_UPLOADED`. They cannot,
on their own, support a mandatory `SATISFIED` or `NOT_SATISFIED` finding on
the contested commercial path. The application raises
`EVIDENCE_AUTHORITY_INSUFFICIENT`; it never rewrites the AI evaluation.

## RC5A authority levels

| Level                       | Meaning                                                                               | Decisive in RC5A                                  |
| --------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `PARTY_UPLOADED`            | One party supplied a private document.                                                | No                                                |
| `COUNTERPARTY_ACKNOWLEDGED` | The other deal organization explicitly acknowledged the exact evidence/document hash. | Yes, where policy permits                         |
| `PREAGREED_EXTERNAL_SOURCE` | A policy identified a public source before dispute.                                   | No — not validator-fetched yet                    |
| `THIRD_PARTY_SIGNED`        | An issuer-authenticated document is recorded under an issuer policy.                  | Yes, where policy permits                         |
| `ONCHAIN_VERIFIED`          | A deterministic on-chain source is recorded.                                          | Yes, where policy permits                         |
| `SERVER_FETCH_VERIFIED`     | The server fetched a source.                                                          | No — it is not validator-independent verification |

The acknowledgement is immutable and binds obligation, evidence ID, exact
document content hash, acknowledging organization/user, timestamp, and
authority version. A new document version creates a new evidence identity and
cannot inherit an acknowledgement.

## Evidence-source policy

`EvidenceSourcePolicy` is a server-owned, versioned policy per requirement.
It can constrain source mode, domain/URL, issuer, document type, required
authority, counterparty acknowledgement, issuer signature, and future
validator-side retrieval intent. It is frozen when the matching X Layer
obligation is observed as created. Missing policy at that point is snapshotted
as the conservative private-document / counterparty-acknowledgement default.

This model is additive. It does not change `EvidenceBundleV1`,
`DeterministicEvaluationContextV1`, `AiEvaluationV1`, `DisputePacketV1`, or
any existing `policyHash`. Existing snapshots remain readable and immutable;
future contested progression is fail-closed if decisive authority is absent.

## Current GenLayer boundary

The deployed `ToleranceDisputeJudge` receives a hash-bound canonical packet and
interprets its supplied `sourceBlocks[].content`. It contains no
`gl.nondet.web.get`, `gl.nondet.web.request`, or `gl.nondet.web.render` call.
It therefore does not independently retrieve a private PDF or public URL.

## V2 public-source path (design only)

The future public path is:

```text
Frozen EvidenceSourcePolicyV1
  -> exact URL / host + path policy / issuer / expected hash
  -> DisputePacketV2 EvidenceSourceReferenceV1
  -> every GenLayer validator gl.nondet.web.get(...)
  -> consensus on response hash + stable extraction rule
  -> semantic adjudication over validator-retrieved content
```

Party-selected URLs are not authoritative merely because they are public. A
commit-pinned URL offers immutable bytes, not issuer identity or factual
truth. V2 must enforce a frozen pre-dispute URL/host/path/issuer policy and
must bind the retrieved result to the same adjudication pass.

Private documents continue through exact hash, counterparty acknowledgement,
or issuer signature. A hybrid case may contain both private acknowledged
evidence and public validator-retrieved evidence.

## Migration blast radius

The existing judge cannot acquire V2 web fetching without changing its code.
The escrow constructor stores `sourceGenLayerIntelligentContract` as an
immutable, and `executeGenLayerResolution` rejects a payload whose source IC
does not equal it. Therefore a new `ToleranceDisputeJudgeV2` requires a new
X Layer escrow deployment for V2 obligations. Existing V1 escrow obligations
and their immutable hashes must remain on the V1 continuity path.

No judge, escrow, chain deployment, or automatic attestation change is part of
RC5A.
