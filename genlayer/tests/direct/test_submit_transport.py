import json

import pytest

from conftest import canonical_json


def release_packet_for_cli():
    """Matches the one-shot Studionet raw-string fixture byte-for-byte."""
    packet = {
        "schemaVersion": "1",
        "caseId": "0x229c5066c62add29d4b29981a1ecf120aaa4ebcba0d135a17510e91cb41b3d00",
        "xLayerChainId": 1952,
        "xLayerEscrow": "0x2222222222222222222222222222222222222222",
        "obligationId": 7,
        "agreementHash": "0x" + "33" * 32,
        "policyHash": "0x" + "44" * 32,
        "evidenceRoot": "0x" + "55" * 32,
        "decisionRubric": "Release only when every mandatory condition is established; affirmatively proven material failure maps to refund.",
        "burdenOfProof": "Supplier bears the burden of establishing all mandatory release conditions.",
        "disputedRequirements": [{"requirementId": "R-1", "mandatory": True, "text": "Diameter must be 10.0 +/- 0.1 mm."}],
        "governingTerms": [{"termId": "T-1", "text": "R-1 controls milestone release."}],
        "approvedAmendments": [],
        "sourceBlocks": [{"sourceId": "SRC-1", "documentId": "synthetic-inspection-1", "page": 2, "content": "Calibrated gauge measured diameter 10.0 mm for PO TM-SYN-001."}],
        "deterministicCheckResults": [{"checkId": "D-1", "status": "PASS", "sourceIds": ["SRC-1"]}],
        "buyerChallengeStatement": "Confirm the cited measurement meets the accepted tolerance.",
        "supplierResponse": "The synthetic inspection evidence establishes compliance.",
    }
    import hashlib

    packet["disputePacketHash"] = "0x" + hashlib.sha256(canonical_json(packet).encode("utf-8")).hexdigest()
    return packet


def test_exact_cli_raw_json_string_passes_direct_mode(direct_vm, judge):
    packet_json = canonical_json(release_packet_for_cli())
    assert packet_json.startswith("{")
    assert not packet_json.startswith("str:")
    assert json.loads(packet_json)["schemaVersion"] == "1"
    direct_vm.mock_llm(
        r".*TOLERANCE ADJUDICATION INSTRUCTIONS.*",
        canonical_json({
            "verdict": "RELEASE_FULL",
            "requirements": [{"requirement_id": "R-1", "status": "SATISFIED", "source_ids": ["SRC-1"], "material": True}],
            "reasoning": "The synthetic cited measurement establishes the mandatory condition.",
        }),
    )
    judge.submit_case(packet_json)
    assert json.loads(judge.get_case(release_packet_for_cli()["caseId"]))["verdict"] == "RELEASE_FULL"


@pytest.mark.parametrize(
    ("packet_json", "error"),
    [
        ("", "malformed DisputePacketV1 JSON"),
        ("str:{\"schemaVersion\":\"1\"}", "malformed DisputePacketV1 JSON"),
        ('"str:{...}"', "unsupported schemaVersion"),
        ('"{\\"schemaVersion\\":\\"1\\"}"', "unsupported schemaVersion"),
        ("{", "malformed DisputePacketV1 JSON"),
    ],
)
def test_submit_case_rejects_transport_malformed_strings(judge, direct_vm, packet_json, error):
    with direct_vm.expect_revert(error):
        judge.submit_case(packet_json)
