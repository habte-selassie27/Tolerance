# Product and release

Workspace UI, release-candidate assembly, known integration-test debt and the commercial lifecycle audit.

> Archived build record. It describes how these parts were assembled, not necessarily how they work today. For current decisions see [`ARCHITECTURE_DECISION_RECORD`](../architecture/ARCHITECTURE_DECISION_RECORD.md).

## Phase 3C6 — Product Workspace and Lifecycle UI

The App Router workspace lives under `/app`: home, deals, deal dossier,
obligation, disputes, dispute lifecycle, and activity. Server components load
authorized persisted Tolerance data. Server actions accept only route identity
and invoke existing authorization/workflow services; they never accept a
packet, verdict, hash, judge, or chain identity from the browser.

The UI uses an inspection-dossier visual system: neutral paper surfaces,
industrial green structure, and a single orange action accent. Evidence,
governing terms, amendment lineage, citations, and evaluation results are
primary. Hashes and canonical packet JSON are disclosed only in technical
details.

The wallet client uses the browser EIP-1193 provider only to connect a party
wallet, switch to X Layer Testnet, and send the exact unsigned transaction
returned by Phase 3C1. It returns only the transaction hash to the server,
which independently verifies it. Pending X Layer bindings suppress duplicate
entry and accurately state that GenLayer submission remains blocked.

The dispute timeline humanizes narrow lifecycle status without exposing GenLayer
consensus internals. `UNDETERMINED` remains distinct from insufficient evidence.
`FINALIZED_STATE_VERIFIED` is displayed as a verified result, while
`ATTESTATION_BLOCKED` is clearly described as settlement verification pending;
the UI neither signs nor enables automatic settlement.

Responsive CSS converts the dossier matrices and wide rows to stacked cards at
narrow widths, with semantic headings, labels, focus treatment, and status text
in addition to color. Phase 3D may add product authentication onboarding,
document upload interactions, and browser E2E fixtures without changing the
server-owned trust boundaries.

---

## Phase 3D — Tolerance Release Candidate

### Scope

Phase 3D hardens the existing product rather than modifying protocol semantics. It adds a safe readiness endpoint, controlled deterministic synthetic fixtures, route-level loading/error recovery, release documentation, and a deployment contract.

### Demo dataset

The controlled demo uses isolated synthetic integration fixtures: a 316L precision component, original ±0.25 mm term, approved ±0.15 mm amendment, 50.10 mm inspection evidence, provenance, evidence bundle, evaluation context, validated synthetic evaluation snapshot, and packet snapshot through the production builder chain. It does not create live X Layer or GenLayer transactions, and must run only against a non-production database.

### Deployment boundary

The Next.js application, database access, private storage workflow, and OpenAI server calls can run in a conventional server deployment. The CLI/keychain GenLayer submitter must run in an isolated persistent worker/runtime with access to its encrypted account; it must not be placed in ephemeral serverless execution or copied into application environment variables.

### Readiness

`GET /api/health` checks process configuration shape and database reachability without exposing secrets, RPC payloads, balances, or database internals. A 503 means only that readiness could not be established.

### Existing X Layer workflow

The existing synthetic workflow `89ec6878-d168-493d-8a9f-cdf9ff840c44` / obligation `9899757356` remains `XLAYER_BINDING_PENDING`. The release candidate preserves it and allows safe confirmation using the same transaction only. It never creates a replacement transaction to make a demo appear complete.

### Authentication verification

The workspace exposes a real Supabase password sign-in route at `/login`. The committed Playwright harness creates or reuses only synthetic E2E identities through the server-only Supabase admin boundary, signs in through this route, and stores the resulting browser state only in an ignored local directory. Protected routes also use the Next.js 16 `proxy.ts` session prefilter; every loader and action still independently reconciles the authenticated subject and enforces organization membership.

Run the browser gate only with ignored local `E2E_TEST_EMAIL` and
`E2E_TEST_PASSWORD` values:

```bash
pnpm test:e2e
```

The suite exercises authenticated workspace, deal, obligation, dispute, and
activity routes; cross-organization URLs; an unauthenticated redirect; wallet
unavailable/wrong-account states; and desktop, tablet, and mobile lifecycle
layout checks. It never sends an X Layer transaction.

### Release envelope

This is a controlled Testnet release candidate, not a Mainnet release. Automatic attestation and automatic settlement remain fail-closed. Deployment still requires target-specific credentials, a persistent GenLayer submitter worker, migration ownership, monitoring, backup/restore ownership, and a secure authenticated demo account.

---

## Phase 3 Integration Test Debt

The following deliberate test-depth work is deferred to **Phase 3D — pre-release hardening**: broader cross-organization/cross-deal authorization permutations, extraction concurrency integration, forced extraction-persistence rollback integration, expanded audit-event integration, and retry/race scenarios. These are coverage gaps, not known product defects.

---

## Tolerance commercial lifecycle — RC3

The deployed `CommercialObligationEscrow` remains frozen. RC3 adds application preparation, wallet UX, durable transaction intents, finalized receipt/event/state verification, and safe reconciliation around its existing calls.

| Frozen action               | Contract authority                                                 | Tolerance classification                   | RC3 product boundary                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createObligation`          | Buyer (`msg.sender`)                                               | Server-prepared / buyer-signed             | Server derives obligation ID, parties, exact amount, agreement/policy hashes, token, escrow, deadlines, chain, and case ID from accepted organizations and persisted data.                                                            |
| `acceptObligation`          | Immutable supplier                                                 | Server-prepared / supplier-signed          | Offered only to the accepted supplier organization; verified wallet must match the stored supplier.                                                                                                                                   |
| ERC-20 `approve`            | Buyer token holder                                                 | Server-prepared / buyer-signed             | Exact obligation amount and configured escrow only; unlimited approval is not requested.                                                                                                                                              |
| `fund`                      | Immutable buyer                                                    | Server-prepared / buyer-signed             | Exact stored obligation; finalized receipt, event, amount, parties, and `FUNDED` state are checked.                                                                                                                                   |
| `commitEvidence`            | Immutable supplier                                                 | Server-prepared / supplier-signed          | Uses the server-owned deterministic `evidenceRoot`; private documents remain offchain.                                                                                                                                                |
| `refundForEvidenceTimeout`  | Immutable buyer                                                    | Server-prepared / buyer-signed             | Frozen deadline and state remain contract-enforced; Tolerance verifies the finalized refund event/state.                                                                                                                              |
| `proposeFastOutcome`        | Any submitter carrying an authorized adjudicator EIP-712 signature | Protocol authorization required            | UI explains the path and renders proposal/challenge states. Generating the isolated adjudicator authorization remains disabled until its separate signer custody is provisioned; the ordinary Vercel application cannot fabricate it. |
| `challenge`                 | Buyer or supplier                                                  | Server-prepared / party-signed             | Uses the stored case/evidence reference; exact party, finalized event, and `DISPUTED` state are checked.                                                                                                                              |
| `finalizeFastOutcome`       | Permissionless after deadline                                      | Server-prepared / wallet-signed gas action | Offered from a persisted proposed-outcome state; the contract enforces the deadline and Tolerance verifies `SETTLED` or `REFUNDED`.                                                                                                   |
| `enterDispute`              | Buyer or supplier                                                  | Phase 3C1 server-prepared / party-signed   | Existing exact packet-commitment flow remains unchanged.                                                                                                                                                                              |
| GenLayer `submit_case`      | Authorized Tolerance worker                                        | Server/worker                              | User wallets never call the judge. Durable intent → encrypted Railway signer → Studionet.                                                                                                                                             |
| `executeGenLayerResolution` | Relayer carrying 2-of-3 attestation                                | Protocol/relayer                           | Existing Phase 3C5 threshold and replay protections remain unchanged; automatic attestation is disabled.                                                                                                                              |

### State projection

The browser never advances commercial state. After a wallet returns only a public transaction hash, Tolerance verifies chain `1952`, finalized successful inclusion, configured contract, exact calldata hash/function, expected signer, required event, and resulting frozen escrow state. A recorded nonfinal transaction suppresses duplicate submission and exposes only **Recheck status**.

### Identity separation

Supabase Auth, verified party wallets, the encrypted GenLayer worker account, independent attestors, and the settlement relayer remain separate identities. Linking a new account wallet never rewrites an obligation's immutable buyer or supplier. A wallet bound to a non-cancelled obligation cannot be unlinked.
