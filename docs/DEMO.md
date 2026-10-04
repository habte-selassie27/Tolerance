# Tolerance demo — Release Candidate 3

Judges can begin without an account at [tolerance.vercel.app/demo](https://tolerance.vercel.app/demo). The route is a static, sanitized, read-only synthetic dossier: it does not bypass `/app` authorization and does not simulate a completed chain transaction.

## Preparation

1. Configure an isolated development Supabase project and `.env.local` from [`.env.example`](../.env.example).
2. Apply migrations with `pnpm exec prisma migrate deploy`.
3. Use the repository's isolated synthetic 316L integration fixtures to prepare the demo dataset in a non-production database.
4. Start the workspace: `pnpm dev` and use the authenticated demo buyer session.

For release QA, create the isolated `E2E_SYNTHETIC` Supabase identity through the server-only test harness and sign in normally at `/login`. Its credentials and Supabase service role key must never be committed or placed in browser fixtures.

The fixture does not impersonate a party wallet, submit to GenLayer, or settle an escrow obligation.

## Three-to-five minute story

1. Open the public demo and show the precision 316L coupling dossier; sign in only when demonstrating protected workspace authorization.
2. In **Terms**, show the original ±0.25 mm term and the approved ±0.15 mm amendment. Explain that an approved amendment supersedes the historical base term without deleting it.
3. In **Requirements**, open the diameter requirement. Show the inspection evidence and its SourceBlock provenance: 316L and 50.10 mm.
4. Open the **Obligation**. Show evidence evaluation, concise cited claims, and the packet summary. AI evaluates evidence; it does not decide payment.
5. Open **Review dispute packet**. Explain that the curated packet is what GenLayer can adjudicate—not raw PDFs or storage URLs.
6. Show the private supplier invitation and explicit two-organization acceptance. In Account, explain that Supabase identity and the verified external wallet are separate.
7. On an obligation, show the actual create → accept → exact test-token approval → fund → evidence commitment → proposed outcome → challenge/uncontested branches. Automated browser QA does not broadcast these calls.
8. Start a dispute only in a safe synthetic/test workflow. The wallet review receives an unsigned transaction from Tolerance; the party wallet signs it. The backend never gets a wallet private key.
9. On the lifecycle page, explain the stages: X Layer commitment, GenLayer adjudication, verified resolution, independent settlement verification, and X Layer settlement.
10. Explain the safety gate: a verified result can be shown as **settlement verification pending** until independent attestation eligibility is established.

## Fallback narrative

- **X Layer RPC slow/unavailable:** show the persisted `XLAYER_BINDING_PENDING` workflow. Tolerance does not resend the transaction and offers only safe reconciliation.
- **Studionet slow:** show the submitted/pending lifecycle wording. `UNDETERMINED` is a protocol status and is never relabelled as insufficient evidence.
- **No live signing:** use demo/test-only workflow states marked simulated. Do not claim they are Testnet transactions.

## What each screen proves

| Screen             | Product proof                                                 |
| ------------------ | ------------------------------------------------------------- |
| Deal dossier       | Authorized commercial record and amendment lineage            |
| Requirement matrix | Governing terms, evidence, evaluation, and provenance         |
| Obligation         | Commercial binding, packet readiness, and evidence evaluation |
| Dispute workflow   | Party-wallet boundary and safe external-state lifecycle       |
| Activity           | Human-readable audit trail with technical details on demand   |
