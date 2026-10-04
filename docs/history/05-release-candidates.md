# Release candidates

Per-release-candidate completion and hardening records for the commercial lifecycle, evidence authority and the V2 local lane.

> Archived build record. It describes how these parts were assembled, not necessarily how they work today. For current decisions see [`ARCHITECTURE_DECISION_RECORD`](../architecture/ARCHITECTURE_DECISION_RECORD.md).

## Tolerance RC3 — commercial lifecycle completion

RC3 adds the missing product boundaries around the already-frozen protocol. It does not change Solidity, GenLayer schemas, hashes, deployments, threshold rules, or signer custody.

### Account and counterparty lifecycle

- `/app/account` exposes profile, organization, verified X Layer wallet, wallet linking, guarded unlink, security explanation, and sign out.
- Wallet ownership is an expiring server nonce signed with `personal_sign`; recovered address, authenticated user, message binding, expiry, and one-time consumption are checked transactionally.
- A deal owner creates a seven-day opaque supplier invitation. Only a SHA-256 token hash is stored. Invitations are deal-bound, organization-bound, recipient-email-bound, single-use, expiring, and revocable by replacement.
- Acceptance creates a role-specific `DealParticipant`; the owner and accepted counterparty then pass the same deal-scoped authorization guard. Unrelated organizations remain rejected.
- Invitation links survive login, signup confirmation, and organization onboarding through validated same-origin relative redirects.

### Commercial actions

`ProtocolActionIntent` records the exact calldata hash before a wallet send. The UI sends only the returned unsigned `{ chainId, to, data }` through the user's wallet and reports only the transaction hash. The server independently checks finality, sender, method, calldata, event, amount/party binding, and escrow state before persistence advances.

The new obligation form accepts only the amount. Tolerance derives the verified buyer/supplier wallets, approved agreement hash, deterministic evaluation-policy hash, configured token/escrow/network, random protocol obligation ID, and frozen Tolerance case ID.

### Fast path

The obligation workspace distinguishes uncontested settlement from contested adjudication. Evidence commitment, challenge, timeout refund, and uncontested finalization controls are present when server-projected state and role permit. `proposeFastOutcome` still requires the frozen authorized-adjudicator EIP-712 signature. The ordinary web application does not hold that role key and therefore cannot fabricate a proposal authorization.

### Mail delivery boundary

Supabase Auth remains the confirmation and password-recovery authority. Brevo is Custom SMTP only. The Brevo CLI authenticates operator identity but cannot manage senders, domains, or SMTP keys; those values are entered directly into Brevo/Supabase dashboards and never enter source, logs, or browser bundles.

The staging proof command `pnpm test:e2e:rc3-mail` uses a disposable synthetic inbox and isolated synthetic dossier. It verifies actual message receipt, confirmation callback, onboarding, recovery receipt, password replacement, post-reset login, counterparty acceptance, wallet ownership proof, and obligation rendering without a chain write. Tolerance itself has no Brevo API or SMTP secret.

---

## RC5 — Evidence authority hardening

### Decision

Tolerance now keeps **integrity** distinct from **authority**. A document
content hash and page-aware `SourceBlock` prove that an extracted excerpt is
bound to a particular stored document. They do not prove that the document is
an independently authoritative statement of fact.

Ordinary private uploads therefore persist as `PARTY_UPLOADED`. They cannot,
on their own, support a mandatory `SATISFIED` or `NOT_SATISFIED` finding on
the contested commercial path. The application raises
`EVIDENCE_AUTHORITY_INSUFFICIENT`; it never rewrites the AI evaluation.

### RC5A authority levels

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

### Evidence-source policy

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

### Current GenLayer boundary

The deployed `ToleranceDisputeJudge` receives a hash-bound canonical packet and
interprets its supplied `sourceBlocks[].content`. It contains no
`gl.nondet.web.get`, `gl.nondet.web.request`, or `gl.nondet.web.render` call.
It therefore does not independently retrieve a private PDF or public URL.

### V2 public-source path (design only)

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

### Migration blast radius

The existing judge cannot acquire V2 web fetching without changing its code.
The escrow constructor stores `sourceGenLayerIntelligentContract` as an
immutable, and `executeGenLayerResolution` rejects a payload whose source IC
does not equal it. Therefore a new `ToleranceDisputeJudgeV2` requires a new
X Layer escrow deployment for V2 obligations. Existing V1 escrow obligations
and their immutable hashes must remain on the V1 continuity path.

No judge, escrow, chain deployment, or automatic attestation change is part of
RC5A.

---

## RC5B V2 local lane

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
