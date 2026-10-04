# Tolerance security model

## Trust boundaries

- **Private documents:** stored offchain in private storage. Curated SourceBlock text needed for a dispute is included in `DisputePacketV1` and visible to the GenLayer validator execution environment; full private PDF bytes, storage object keys, and signed URLs are not included.
- **Evidence authority:** a content hash and SourceBlock prove integrity and provenance, not an independent factual source. Ordinary evidence is `PARTY_UPLOADED`; contested mandatory findings require authority permitted by the frozen obligation policy (for example, an exact-hash counterparty acknowledgement, issuer-signed evidence, or deterministic on-chain evidence).
- **AI:** OpenAI receives only deterministic evaluation context material. Citation and deterministic validation are application gates. AI is not evidence, policy, settlement, or consensus authority.
- **GenLayer:** the frozen judge adjudicates the immutable packet. Tolerance forbids broad transaction and receipt APIs that expose consensus/validator payloads.
- **X Layer:** the escrow remains the settlement authority. Party wallets sign `enterDispute`; a narrow relayer may pay gas only for an already-threshold-authorized settlement payload.

## Custody and authority

- Browser wallets never transmit private keys to Tolerance.
- Wallet linking requires an expiring server-generated nonce and `personal_sign` ownership proof; observing `eth_accounts` alone never creates a verified association. Supabase identity, X Layer party wallet, GenLayer worker signer, attestors, and the settlement relayer remain separate identities.
- Counterparty invitations store only a SHA-256 token hash and require a pending, unexpired, recipient-email-bound, single-use acceptance by an organization the authenticated recipient belongs to.
- Pre-dispute escrow calls use a durable server-owned calldata hash. A wallet returns only a transaction hash; Tolerance checks finalized inclusion, contract, method, signer, event, amount/party binding, and resulting state before advancing.
- The GenLayer submitter uses a persistent encrypted CLI/keychain identity; its private key is not in source, environment variables, browser code, or routine logs.
- Independent attestors hold their own keys. The coordinator verifies submitted signatures but cannot fabricate a 2-of-3 authorization.
- `AUTOMATIC_ATTESTATION_ENABLED=false` is enforced by configuration parsing and must remain false.

## Replay and lifecycle safety

- Immutable bundle, context, evaluation, and packet snapshots bind hashes across the pipeline.
- Evidence-source policies freeze after X Layer obligation creation. An acknowledgement is single-use per evidence/organization and binds the exact document content hash; a replacement document cannot inherit it.
- X Layer confirms the exact packet commitment before GenLayer submission.
- External sends persist an intent before dispatch; uncertain post-send windows become review states rather than blind retries.
- Repeated workflow/submission/packet actions are idempotent under database constraints.

## Explicit limitations

`FINALIZED_STATE_VERIFIED` is not `ATTESTATION_ELIGIBLE`. The latter additionally needs safe independent proof of GenLayer execution success and target/method/case binding without prohibited broad observation APIs. Until that exists, production settlement progression remains blocked.

The deployed V1 judge does not independently fetch evidence URLs. A future
validator-retrieved public-source path requires a versioned judge/packet and,
because the escrow pins the source GenLayer intelligent contract immutably, a
separate escrow continuity/migration plan.

## Reporting

Do not include secrets, raw documents, full dispute packets, wallet material, provider responses, or consensus payloads in an issue. Report the boundary, affected ID, and sanitized reproduction details.
