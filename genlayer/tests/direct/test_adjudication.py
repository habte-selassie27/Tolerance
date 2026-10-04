import json
import pytest

from conftest import canonical_json, make_packet, response


@pytest.mark.parametrize(
    "verdict,status,citations",
    [
        ("RELEASE_FULL", "SATISFIED", ["SRC-1"]),
        ("REFUND_FULL", "NOT_SATISFIED", ["SRC-1"]),
        ("INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE", []),
    ],
)
def test_clear_business_verdicts(submit, verdict, status, citations):
    assert submit(adjudication=response(verdict, status, citations))["verdict"] == verdict


@pytest.mark.parametrize(
    "adjudication,error",
    [
        ({"verdict": "PAY_HALF", "requirements": [], "reasoning": "x"}, "unsupported verdict"),
        ({"verdict": "RELEASE_FULL", "requirements": [], "reasoning": "x", "amount": 10}, "invalid adjudication schema"),
        (response(source_ids=["FAKE-SOURCE"]), "fabricated source citation"),
        (response(source_ids=[]), "material finding lacks citation"),
        (response("RELEASE_FULL", "NOT_SATISFIED"), "release without satisfied"),
        (response("REFUND_FULL", "SATISFIED"), "refund lacks affirmative"),
        (response("INSUFFICIENT_EVIDENCE", "SATISFIED"), "insufficient-evidence verdict lacks support"),
        (response(status="UNKNOWN"), "unsupported requirement status"),
        (response(requirements=[{"requirement_id": "R-1", "status": "SATISFIED", "source_ids": ["SRC-1"], "material": False}]), "materiality does not match"),
    ],
)
def test_structured_output_rejections(direct_vm, judge, adjudication, error):
    direct_vm.mock_llm(r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*", canonical_json(adjudication))
    with direct_vm.expect_revert(error):
        judge.submit_case(canonical_json(make_packet()))


def test_malformed_llm_json_rejected(direct_vm, judge):
    direct_vm.mock_llm(r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*", "not-json")
    with direct_vm.expect_revert("malformed adjudication JSON"):
        judge.submit_case(canonical_json(make_packet()))


def test_validator_requires_same_verdict_and_material_status(direct_vm, judge):
    direct_vm.mock_llm(r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*", canonical_json(response()))
    judge.submit_case(canonical_json(make_packet()))
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*", canonical_json(response("REFUND_FULL", "NOT_SATISFIED")))
    assert direct_vm.run_validator() is False


def test_validator_allows_different_reasoning_and_valid_citation(direct_vm, judge):
    packet = make_packet(sourceBlocks=[
        {"sourceId": "SRC-1", "documentId": "inspection-1", "page": 2, "content": "Measured diameter 10.0 mm."},
        {"sourceId": "SRC-2", "documentId": "inspection-1", "page": 3, "content": "Gauge record confirms 10.0 mm."},
    ])
    direct_vm.mock_llm(r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*", canonical_json(response()))
    judge.submit_case(canonical_json(packet))
    direct_vm.clear_mocks()
    other = response(source_ids=["SRC-2"])
    other["reasoning"] = "Independent gauge evidence reaches the same material conclusion."
    direct_vm.mock_llm(r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*", canonical_json(other))
    assert direct_vm.run_validator() is True
