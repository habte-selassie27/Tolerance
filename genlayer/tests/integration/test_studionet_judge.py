import hashlib
import json

from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded
from gltest.types import TransactionHashVariant, TransactionStatus
from gltest.utils import extract_contract_address


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def release_packet():
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
    packet["disputePacketHash"] = "0x" + hashlib.sha256(canonical_json(packet).encode()).hexdigest()
    return packet


def test_studionet_deploy_resolve_and_read_write_once():
    factory = get_contract_factory("ToleranceDisputeJudge")
    deployment = factory.deploy_contract_tx(
        args=[], wait_transaction_status=TransactionStatus.FINALIZED, wait_retries=180
    )
    assert tx_execution_succeeded(deployment)
    contract = factory.build_contract(extract_contract_address(deployment))
    receipt = contract.submit_case(args=[canonical_json(release_packet())]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED, wait_retries=180
    )
    assert tx_execution_succeeded(receipt)
    resolved = json.loads(
        contract.get_case(args=[release_packet()["caseId"]]).call(
            transaction_hash_variant=TransactionHashVariant.LATEST_FINAL
        )
    )
    assert resolved["resolved"] is True
    assert resolved["verdict"] == "RELEASE_FULL"
    duplicate = contract.submit_case(args=[canonical_json(release_packet())]).transact()
    assert not tx_execution_succeeded(duplicate)
    print("STUDIONET_CONTRACT_ADDRESS=" + str(contract.address))
    print("STUDIONET_DEPLOY_TX=" + str(deployment.get("hash", deployment.get("transaction_hash", "unknown"))))
    print("STUDIONET_RESOLVE_TX=" + str(receipt.get("hash", receipt.get("transaction_hash", "unknown"))))
