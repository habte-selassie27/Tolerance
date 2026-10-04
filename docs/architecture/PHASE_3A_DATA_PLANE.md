# Phase 3A — Application Data Plane

## Authority boundaries

PostgreSQL is the durable application index for Tolerance users, commercial
documents, workflow metadata, and observed protocol facts. It is not an
economic ledger: X Layer remains authoritative for obligation funding and
settlement. GenLayer finalized contract state remains authoritative for a
contested adjudication result.

`ProtocolEvent` and `AdjudicationCase` are idempotent observations. They are
never used to override either chain.

## Identity and access

Supabase Auth authenticates users. `User.authSubject` references the Supabase
user ID; passwords and password hashes are not copied into application tables.
Server-side guards require authenticated membership before organization, deal,
or document access. UI visibility is not an authorization mechanism.

## Private documents

The `tolerance-private-evidence` Storage bucket is private. Object keys are
opaque UUID paths, while original filenames are metadata only. The server
computes SHA-256 content hashes, validates MIME type and size, and issues a
60-second signed URL only after document access is authorized.

## Commercial provenance

Agreement and Amendment versions are append-only. Requirements preserve their
governing source reference and acceptance criteria. SourceBlocks preserve
document/page/order/locator/hash/extraction-version provenance for Phase 3B;
this phase does not extract text or call an AI model. Evidence uses an explicit
many-to-many EvidenceRequirement mapping.

## Frozen protocol configuration

The typed configuration is restricted to X Layer Testnet (1952), the deployed
Tolerance escrow, and GenLayer Studionet (61999) judge. Mainnet and Bradbury are
not configured. `AUTOMATIC_ATTESTATION_ENABLED` defaults to `false`, and an
attempt to enable it fails closed. The automatic relay remains unavailable
until Studionet provides safe minimal execution and transaction-binding
observability without unsafe validator/consensus payloads.

## Phase 3B entry criteria

Phase 3B may add private document extraction, OCR where necessary, SourceBlock
creation, and requirement/evidence workflows only after preserving this
authorization and provenance boundary.
