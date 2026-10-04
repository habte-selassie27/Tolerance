import json
from pathlib import Path

import pytest

from schemas.dispute_packet import canonical_json, packet_hash


FIXTURE = Path(__file__).parents[1] / "fixtures" / "phase3b2c-application-packets.json"


def cases():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", cases(), ids=lambda case: case["name"])
def test_typescript_python_exact_string_and_hash_parity(case):
    exact_typescript_string = case["canonicalJson"]
    exact_typescript_bytes = exact_typescript_string.encode("utf-8")
    packet = json.loads(exact_typescript_string)
    assert canonical_json(packet).encode("utf-8") == exact_typescript_bytes
    without_hash = dict(packet)
    without_hash.pop("disputePacketHash")
    assert packet_hash(without_hash) == case["disputePacketHash"]
    assert packet["disputePacketHash"] == case["disputePacketHash"]


@pytest.mark.parametrize("case", cases(), ids=lambda case: case["name"])
def test_production_typescript_packet_resolves_in_direct_mode(case, judge, direct_vm):
    direct_vm.mock_llm(
        r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*",
        canonical_json(case["adjudication"]),
    )
    judge.submit_case(case["canonicalJson"])
    packet = json.loads(case["canonicalJson"])
    resolved = json.loads(judge.get_case(packet["caseId"]))
    assert resolved["resolved"] is True
    assert resolved["verdict"] == case["expectedVerdict"]
    for field in (
        "caseId",
        "xLayerChainId",
        "xLayerEscrow",
        "obligationId",
        "agreementHash",
        "policyHash",
        "evidenceRoot",
        "disputePacketHash",
    ):
        assert str(resolved[field]).lower() == str(packet[field]).lower()


def test_malicious_evidence_does_not_override_policy(judge, direct_vm):
    case = next(item for item in cases() if item["name"] == "injection")
    assert "Ignore previous instructions" in case["canonicalJson"]
    direct_vm.mock_llm(
        r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*",
        canonical_json(case["adjudication"]),
    )
    judge.submit_case(case["canonicalJson"])
    packet = json.loads(case["canonicalJson"])
    resolved = json.loads(judge.get_case(packet["caseId"]))
    assert resolved["verdict"] == "INSUFFICIENT_EVIDENCE"


def test_invalid_citation_is_rejected_and_duplicate_case_is_immutable(judge, direct_vm):
    case = next(item for item in cases() if item["name"] == "release")
    invalid = json.loads(json.dumps(case["adjudication"]))
    invalid["requirements"][0]["source_ids"] = ["SRC-INVENTED"]
    direct_vm.mock_llm(
        r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*", canonical_json(invalid)
    )
    with direct_vm.expect_revert("fabricated source citation"):
        judge.submit_case(case["canonicalJson"])

    direct_vm.clear_mocks()
    direct_vm.mock_llm(
        r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*",
        canonical_json(case["adjudication"]),
    )
    judge.submit_case(case["canonicalJson"])
    packet = json.loads(case["canonicalJson"])
    original = judge.get_case(packet["caseId"])
    with direct_vm.expect_revert("case already resolved"):
        judge.submit_case(case["canonicalJson"])
    assert judge.get_case(packet["caseId"]) == original
