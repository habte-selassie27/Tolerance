# Skills Bible routing

Inspected read-only clone of `ometere123/the-skills-bible` on 2026-08-08: canonical router, `web3-application`, `fintech-product`, and `ai-agent-product` recipes. Tolerance is not an autonomous agent: it uses bounded semantic evaluation, so the AI-agent recipe is deliberately reduced.

## Routing rule

The following is a project-level eligible set, not a context bundle. For every implementation task, route to the smallest sufficient subset for that task and load only those skills. Example: Phase 1 uses `implementation-planner`, `domain-model-designer`, `frontend-architecture-specialist` and `smart-contract-architect`; it does not preload document processing, AI red-team, accessibility QA or blockchain indexing guidance.

## Phase 2 task routing

The escrow task is routed to `smart-contract-architect`, `smart-contract-development-engineer`, `smart-contract-security-engineer`, and `smart-contract-testing-verification-engineer`. `wallet-key-management-engineer` applies only to EIP-712 signer rotation/revocation and the production custody boundary. No frontend, backend, AI, data, DeFi, tokenomics, account-abstraction, cross-chain, oracle or deployment-operation skill is loaded.

### Phase 2B closure sweep

The task-level composition was limited to `smart-contract-testing-verification-engineer` for deterministic negative, fuzz, invariant, and EIP-712 separation coverage, plus `smart-contract-security-engineer` for the source-level authorization/accounting review. `smart-contract-development-engineer` governed the approved evidence-deadline production fix. `smart-contract-architect` was intentionally not routed because no architecture or economic policy changed. Frontend, backend, AI, database, GenLayer-contract, bridge, DeFi, tokenomics, account-abstraction, deployment, and UX skills were excluded. The Skills Bible repository remained read-only.

For Phase 2B specifically, this remains a per-task route rather than every project skill. The attestor path uses the wallet-key-management skill only for distinct signing domains and role rotation; it does not authorize a bridge or relay implementation.

### Phase 2C task route

The smallest Skills Bible composition was `ai-systems-architect` for the deterministic/semantic/authority boundary, `structured-output-engineer` for strict adjudication and citation schemas, `ai-evaluation-architect` for the versioned synthetic corpus and release evidence, and `prompt-injection-defense-engineer` for treating all packet text as untrusted data. Frontend, backend, database, product-design, DeFi, wallet, cross-chain, smart-contract and general agent-orchestration skills were intentionally excluded. Official GenLayer `write-contract`, `genvm-lint`, `direct-tests`, `integration-tests` and `genlayer-cli` skills governed vendor-specific implementation. Both skill repositories remained read-only.

| Canonical skill                                             | Governs                 | Why selected / why adjacent skill is excluded                                                                                   |
| ----------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `implementation-planner`                                    | Phase 0 and phase gates | Converts frozen scope to gated build plan; no generic project-management stack needed.                                          |
| `product-design-architect`                                  | Phases 1, 6, 11         | Makes the requirement/evidence matrix the product centre; `dashboard-information-design-specialist` is too dashboard-oriented.  |
| `product-art-direction-specialist`                          | Phase 6                 | Enforces industrial commercial-assurance direction; no generic design trend skill needed.                                       |
| `frontend-architecture-specialist`                          | Phases 1, 6, 7          | Client/server and UI boundaries; no micro-frontend skill because one app.                                                       |
| `backend-architecture-specialist`                           | Phases 1, 3-5           | Modular service/data boundaries; no event-stream platform because jobs are modest.                                              |
| `domain-model-designer`                                     | Phase 1                 | Versioned agreement-obligation-evidence model; no generic document DB modeler because relational audit model is preferred.      |
| `file-media-processing-engineer`                            | Phase 4                 | Safe ingest/extract pipeline; no media-generation skill.                                                                        |
| `ai-systems-architect`                                      | Phase 5                 | Trust boundary and deterministic/semantic split.                                                                                |
| `structured-output-engineer`                                | Phase 5                 | Machine-valid adjudication contract; no tool-use/memory skill because AI cannot act or retain broad context.                    |
| `ai-evaluation-architect`                                   | Phases 5, 9             | Evidence-grounded benchmark and acceptance thresholds.                                                                          |
| `prompt-injection-defense-engineer`                         | Phases 4, 5, 9          | Treats commercial files as hostile instructions.                                                                                |
| `smart-contract-architect`                                  | Phase 2                 | Minimal escrow state machine.                                                                                                   |
| `smart-contract-development-engineer`                       | Phase 2                 | Implement the small contract; no DeFi/lending/tokenomics skills (explicitly out of scope).                                      |
| `smart-contract-security-engineer`                          | Phases 2, 9             | Review authorization, replay, settlement and reentrancy.                                                                        |
| `smart-contract-testing-verification-engineer`              | Phase 2                 | Foundry fuzz/invariant and verification strategy.                                                                               |
| `wallet-key-management-engineer`                            | Phases 2, 7             | Wallet + isolated adjudication signer boundary; no account-abstraction skill because Builder Codes exclude ERC-4337 operations. |
| `data-security-engineer`                                    | Phases 3, 9             | Private documents, retention and object-level controls.                                                                         |
| `authorization-security-engineer`                           | Phases 3, 9             | B2B tenant/role boundaries; no identity-verification system because KYC is not V1.                                              |
| `end-to-end-testing-engineer`                               | Phases 7, 9             | Cross-system Testnet journey.                                                                                                   |
| `accessibility-testing-specialist` and `design-qa-reviewer` | Phase 11                | Critical path accessibility and visual fidelity; no broad mobile-product designer because desktop/tablet is primary.            |
| `blockchain-data-indexing-engineer`                         | Phase 10                | Canonical receipt/event reconciliation; no full analytics platform before real traffic.                                         |

The selected composition is intentionally smaller than the union of the Web3, fintech and AI-agent recipes. Payments are Testnet escrow rather than a regulated payment service; no billing, lending, account abstraction, RAG, multi-agent orchestration, cross-chain, oracle, DAO or protocol-engineering skill is needed.

# Phase 2D-A routing

- `wallet-key-management-engineer`: separate test signer identities, key isolation, threshold-signature and rotation boundaries.
- `integration-testing-specialist`: actual protocol/serialization boundaries and deterministic failure fixtures.
- `security-testing-engineer`: fail-closed finality, authorization, mismatch, replay and malformed-state cases.
- `blockchain-data-indexing-engineer`: reconcile canonical transaction finality and finalized contract state rather than coordinator metadata.

The Skills Bible remained read-only. Frontend, database, product-design, AI-adjudication, cross-chain bridge, and smart-contract-development skills are intentionally excluded: Phase 2D-A does not change those components.

# Phase 3A routing

- `build-projects-end-to-end`: application data-plane architecture, security
  boundaries, migration safety, verification, and completion criteria.
- Intentionally excluded: UI/product-design, Web3 execution, and GenLayer
  contract skills. Phase 3A neither changes frozen protocol contracts nor
  builds the Phase 3B extraction/UI layers.

The Skills Bible remains read-only.
