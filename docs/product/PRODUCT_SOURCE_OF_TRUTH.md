# Tolerance product source of truth

## Authority

The authoritative product artefact is `Inspection-to-Payment_Product-Brief.pdf` (provided by the product owner; read 2026-08-08). This document records only implementation-critical decisions derived from it. If it conflicts with this document, the brief wins.

## Product

Tolerance is an AI-assisted, evidence-cited conditional-settlement workflow for cross-border custom manufacturing: buyer and supplier agree one payment milestone's requirements, lock evidence, obtain a bounded adjudication, allow a challenge, then settle on X Layer Testnet.

It is not a lending product, receivables marketplace, DEX, wallet, DAO, generic procurement platform, legal-enforceability product, or an autonomous AI settlement system.

## V1 actors and job

Buyer/importer funds an obligation; supplier accepts terms and supplies evidence; procurement/operations defines requirements; finance reconciles; a human resolver handles review/disputes. The job is: decide whether agreed evidence entitles a supplier to payment, with an auditable reason.

## Frozen lifecycle

Agreement version -> obligation -> reviewed requirements -> mutual acceptance -> funding -> evidence bundle -> deterministic validation -> AI semantic adjudication -> policy result -> provisional verdict -> challenge or expiry -> settlement/refund/split. Agreement and locked evidence versions are append-only.

## Non-negotiable boundaries

- AI is an evidence interpreter only: no keys, transactions, state-transition authority, invented facts, or silent resolution of uncertainty.
- Documents and PII stay offchain; chain holds only economic state and hashes/roots.
- Deterministic checks govern quantities, dates, money, signatures and state transitions; uncertainty escalates.
- Only PASS may be proposed for automatic finalisation, after policy checks and a challenge period.
- August 21, 2026 target: production-quality Testnet workflow with synthetic/authorised documents, not real-money or universal legal readiness.
