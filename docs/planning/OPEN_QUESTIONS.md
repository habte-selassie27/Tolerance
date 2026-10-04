# Open questions

## BLOCKER

- None for Phase 2C.

## NEEDS DECISION BEFORE PHASE 2D

- GenLayer appeal economics/UX: original submitter, initial GEN cost sponsor, appeal-bond sponsor, and visibility while a case is ACCEPTED.
- Dispute-packet completeness/transparency policy. Central curation could bias consensus by omitting relevant locked evidence.
- Resolution-attestor custody and threshold operations. Attestor keys must not share ordinary application secrets.
- Whether the Phase 2D relay consumes the current Studionet deployment or a separately controlled redeployment; the network remains Studionet unless explicitly changed.

## NEEDS DECISION BEFORE PHASE 3

- Identity provider and deploy account/organisation ownership model.
- Storage/deployment account(s), region and retention period for authorised/synthetic documents.

## NEEDS DECISION BEFORE PHASE 4

- Persistent document-processing execution model. Keep the job interface abstract through Phase 1; choose the smallest mature worker/runtime only after measuring expected processing duration and deployment constraints. Do not assume Vercel can run a continuous pg-boss worker.

## NEEDS DECISION BEFORE PHASE 5

- Approved model provider/account, data-processing posture and acceptable review/confidence thresholds.
- First requirement taxonomy and deterministic rules for the synthetic industrial-pump demo pack.

## SAFE TO DEFER

- Bradbury or any other GenLayer network migration; mainnet asset, legal enforceability, KYC, supplier verification, formal arbitration partner, inspection-provider/ERP integrations, financing, analytics beyond hackathon evidence, multi-region/enterprise retention controls.
