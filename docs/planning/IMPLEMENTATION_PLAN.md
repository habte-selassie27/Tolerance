# Implementation plan

| Phase                                 | Exit gate                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0: source, research and plan          | Product owner approves these documents and outstanding decisions.                                                                             |
| 1: foundation/domain                  | Pinned stack, schema and state contracts reviewed; no ambiguous state transitions.                                                            |
| 2A: cross-network architecture        | GenLayer network strategy, resolved-case finality boundary, packet/privacy and threshold trust model approved.                                |
| 2B: X Layer escrow                    | Contract unit/access/fuzz/invariant suites pass; final source network/IC deployment parameters remain deferred.                               |
| 2C: GenLayer Intelligent Contract     | Judge lint/direct/consensus tests pass; write-once resolved state and EVM hash vectors are frozen; Studionet finalized state is demonstrated. |
| 2D: relay and integrated proof        | Relay verifies final transaction plus case result; threshold attestation settles a synthetic Testnet case.                                    |
| 3: identity/data/storage              | Organisation-scoped authorisation and immutable-version flows pass integration tests.                                                         |
| 4: document/evidence pipeline         | Quarantine, extraction, ordered manifests and locked roots work on authorised/synthetic samples.                                              |
| 5: validation/adjudication            | Deterministic policy plus citation-validated AI output passes required adversarial corpus.                                                    |
| 6: buyer/supplier workflow            | Agreement review, acceptance, evidence matrix and audit UX complete; no generic Web3 aesthetic.                                               |
| 7: wallet/settlement integration      | Fund, propose, challenge and finalise paths complete in real Testnet E2E.                                                                     |
| 8: dispute workflow                   | Challenge freezes auto-settlement; GenLayer and mutual-resolution workflow is audited and tested.                                             |
| 9: hardening                          | Threat-model tests, negative paths and AI red-team cases meet gate.                                                                           |
| 10: X Layer attribution/observability | App, adjudication and canonical chain events correlate; Builder Code attribution verified if issued.                                          |
| 11: QA                                | Responsive, accessibility and visual regression critical path passes.                                                                         |
| 12: release/demo                      | Clean-state rehearsal succeeds for PASS, REVIEW and DISPUTED scenarios; submission evidence prepared.                                         |

Change control: GREEN may enter a current phase; AMBER is recorded for later; RED stops affected work and is surfaced for approval.
