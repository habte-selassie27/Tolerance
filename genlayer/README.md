# Tolerance GenLayer dispute judge

This component contains the narrow Phase 2C Intelligent Contract for contested semantic adjudication. It does not custody X Layer funds, operate the relay, poll GenLayer for production settlement, or sign X Layer attestations.

## Frozen boundaries

- Current network: Studionet only, imported in TypeScript from `genlayer-js/chains`.
- Submitter: the contract deployer, immutable for V1. Submission authority is not verdict authority.
- Business verdicts: `RELEASE_FULL`, `REFUND_FULL`, `INSUFFICIENT_EVIDENCE`.
- Consensus: leader and validators independently reason over the same packet. Equivalence requires the same verdict and the same mandatory-requirement statuses; prose and valid citations may differ.
- State: one canonical `ResolvedCaseV1` per Tolerance case ID, write-once.
- Privacy: synthetic/authorized dispute packets only. Complete commercial EvidenceBundles remain private and offchain.

## Reproducible tools

Python 3.12 is the supported local runtime. On Windows, the project-scoped environment avoids the observed Python 3.14/Direct Mode fd-0 incompatibility.

```powershell
py -3.12 -m venv .venv-genlayer
.\.venv-genlayer\Scripts\python.exe -m pip install -r genlayer\requirements.txt
$env:PYTHONIOENCODING='utf-8'
.\.venv-genlayer\Scripts\genvm-lint.exe check genlayer\contracts\ToleranceDisputeJudge.py --json
Set-Location genlayer
..\.venv-genlayer\Scripts\python.exe -m pytest tests\direct -v
..\.venv-genlayer\Scripts\gltest.exe tests\integration\test_studionet_judge.py -v -s --network studionet
```

`gltest.config.yaml` selects the built-in Studionet definition. No RPC URL or chain ID is copied into contract logic.

## Packet and result commitments

`DisputePacketV1` uses UTF-8 JSON, recursively sorted keys, compact separators and `ensure_ascii=false`. `disputePacketHash` is SHA-256 over that canonical object with the hash field omitted. This identifies the exact bounded packet; it is not the locked EvidenceBundle `evidenceRoot`.

The Phase 2D EVM digest is defined in `schemas/resolved-case.ts` and mirrored by a Foundry vector. It uses `keccak256(abi.encode(...))`, not JSON hashing or `abi.encodePacked`.

## Studionet evidence — 2026-08-08

- Contract: `0xF20Fd73435C71Ddf178a9DfbD78114AeD0b902E4`
- Finalized deployment transaction: `0x85c3e32c00c7e60e6911fc5c474cd6e83c27a29c3347ee8bc739a6422348906d`
- Finalized synthetic release transaction: `0x77220a0c27a2a95d0a7e4f30c07a1d8a785ee4e77fd0031ab74cabad8f695566`
- Finalized state read: `resolved=true`, verdict `RELEASE_FULL`; duplicate overwrite transaction failed as designed.

This proves the contract and current runner execute on Studionet. It does not authorize an X Layer settlement; Phase 2D must independently require final transaction status plus matching finalized resolved state.

## Appeals

An `ACCEPTED` transaction remains appealable during its Finality Window. Current tools expose `genlayer appeal-bond <txId>` to query the minimum bond and `genlayer appeal <txId> [--bond]` to submit an appeal. An appeal remains tied to the same GenLayer transaction/Tolerance case while another consensus round runs. Who submits and sponsors initial/appeal GEN, and how both parties request an appeal, remain Phase 2D product decisions. `UNDETERMINED` never becomes the Tolerance business verdict `INSUFFICIENT_EVIDENCE` and does not create resolved state.
