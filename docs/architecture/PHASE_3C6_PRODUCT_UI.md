# Phase 3C6 — Product Workspace and Lifecycle UI

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
