import hashlib
import json
import atexit
import os
from pathlib import Path

import pytest


CONTRACT = Path(__file__).parents[2] / "contracts" / "ToleranceDisputeJudge.py"
_LEAKED_GLTEST_TEMP_FILES = []


@pytest.fixture(autouse=True)
def windows_gltest_fd0_unlink_workaround(monkeypatch):
    """Work around genlayer-test 0.29.2 unlinking its still-open fd-0 temp file on Windows."""
    if os.name != "nt":
        yield
        return
    original_unlink = os.unlink

    def tolerant_unlink(path, *args, **kwargs):
        try:
            return original_unlink(path, *args, **kwargs)
        except PermissionError:
            _LEAKED_GLTEST_TEMP_FILES.append(str(path))
            return None

    monkeypatch.setattr(os, "unlink", tolerant_unlink)
    yield


@atexit.register
def cleanup_gltest_temp_files():
    for path in _LEAKED_GLTEST_TEMP_FILES:
        try:
            os.unlink(path)
        except OSError:
            pass


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def make_packet(**overrides):
    packet = {
        "schemaVersion": "1",
        "caseId": "0x229c5066c62add29d4b29981a1ecf120aaa4ebcba0d135a17510e91cb41b3d00",
        "xLayerChainId": 1952,
        "xLayerEscrow": "0x" + "22" * 20,
        "obligationId": 7,
        "agreementHash": "0x" + "33" * 32,
        "policyHash": "0x" + "44" * 32,
        "evidenceRoot": "0x" + "55" * 32,
        "decisionRubric": "Release only when every mandatory accepted requirement is established.",
        "burdenOfProof": "Supplier bears the burden of establishing release conditions.",
        "disputedRequirements": [{"requirementId": "R-1", "mandatory": True, "text": "Diameter must be 10.0 +/- 0.1 mm."}],
        "governingTerms": [{"termId": "T-1", "text": "R-1 controls milestone release."}],
        "approvedAmendments": [],
        "sourceBlocks": [{"sourceId": "SRC-1", "documentId": "inspection-1", "page": 2, "content": "Measured diameter 10.0 mm."}],
        "deterministicCheckResults": [{"checkId": "D-1", "status": "PASS", "sourceIds": ["SRC-1"]}],
        "buyerChallengeStatement": "Verify the measurement against the accepted tolerance.",
        "supplierResponse": "The locked inspection report establishes compliance.",
    }
    packet.update(overrides)
    unhashed = dict(packet)
    unhashed.pop("disputePacketHash", None)
    packet["disputePacketHash"] = "0x" + hashlib.sha256(canonical_json(unhashed).encode()).hexdigest()
    return packet


def response(verdict="RELEASE_FULL", status="SATISFIED", source_ids=None, **extra):
    value = {
        "verdict": verdict,
        "requirements": [{"requirement_id": "R-1", "status": status, "source_ids": ["SRC-1"] if source_ids is None else source_ids, "material": True}],
        "reasoning": "The cited locked evidence supports the material finding.",
    }
    value.update(extra)
    return value


@pytest.fixture
def judge(direct_deploy):
    return direct_deploy(str(CONTRACT))


@pytest.fixture
def submit(direct_vm, judge):
    def _submit(packet=None, adjudication=None):
        packet = packet or make_packet()
        adjudication = adjudication or response()
        direct_vm.mock_llm(r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*", canonical_json(adjudication))
        judge.submit_case(canonical_json(packet))
        return json.loads(judge.get_case(packet["caseId"]))
    return _submit
