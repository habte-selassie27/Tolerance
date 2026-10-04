# Tolerance RC3 — commercial lifecycle completion

RC3 adds the missing product boundaries around the already-frozen protocol. It does not change Solidity, GenLayer schemas, hashes, deployments, threshold rules, or signer custody.

## Account and counterparty lifecycle

- `/app/account` exposes profile, organization, verified X Layer wallet, wallet linking, guarded unlink, security explanation, and sign out.
- Wallet ownership is an expiring server nonce signed with `personal_sign`; recovered address, authenticated user, message binding, expiry, and one-time consumption are checked transactionally.
- A deal owner creates a seven-day opaque supplier invitation. Only a SHA-256 token hash is stored. Invitations are deal-bound, organization-bound, recipient-email-bound, single-use, expiring, and revocable by replacement.
- Acceptance creates a role-specific `DealParticipant`; the owner and accepted counterparty then pass the same deal-scoped authorization guard. Unrelated organizations remain rejected.
- Invitation links survive login, signup confirmation, and organization onboarding through validated same-origin relative redirects.

## Commercial actions

`ProtocolActionIntent` records the exact calldata hash before a wallet send. The UI sends only the returned unsigned `{ chainId, to, data }` through the user's wallet and reports only the transaction hash. The server independently checks finality, sender, method, calldata, event, amount/party binding, and escrow state before persistence advances.

The new obligation form accepts only the amount. Tolerance derives the verified buyer/supplier wallets, approved agreement hash, deterministic evaluation-policy hash, configured token/escrow/network, random protocol obligation ID, and frozen Tolerance case ID.

## Fast path

The obligation workspace distinguishes uncontested settlement from contested adjudication. Evidence commitment, challenge, timeout refund, and uncontested finalization controls are present when server-projected state and role permit. `proposeFastOutcome` still requires the frozen authorized-adjudicator EIP-712 signature. The ordinary web application does not hold that role key and therefore cannot fabricate a proposal authorization.

## Mail delivery boundary

Supabase Auth remains the confirmation and password-recovery authority. Brevo is Custom SMTP only. The Brevo CLI authenticates operator identity but cannot manage senders, domains, or SMTP keys; those values are entered directly into Brevo/Supabase dashboards and never enter source, logs, or browser bundles.

The staging proof command `pnpm test:e2e:rc3-mail` uses a disposable synthetic inbox and isolated synthetic dossier. It verifies actual message receipt, confirmation callback, onboarding, recovery receipt, password replacement, post-reset login, counterparty acceptance, wallet ownership proof, and obligation rendering without a chain write. Tolerance itself has no Brevo API or SMTP secret.
