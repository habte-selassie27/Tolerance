import pytest

from conftest import canonical_json, make_packet


def test_authorized_submitter_resolves_write_once(judge, submit):
    resolved = submit()
    assert resolved["resolved"] is True
    assert resolved["verdict"] == "RELEASE_FULL"
    with pytest.raises(Exception, match="case already resolved"):
        submit()


def test_unauthorized_submitter_rejected(direct_vm, direct_bob, judge):
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("unauthorized case submitter"):
        judge.submit_case(canonical_json(make_packet()))


def test_unknown_case_is_empty(judge):
    assert judge.get_case("0x" + "aa" * 32) == ""


def test_malformed_case_and_hashes_rejected(direct_vm, judge):
    with direct_vm.expect_revert("invalid caseId"):
        judge.get_case("not-a-hash")
    packet = make_packet(agreementHash="0x12")
    with direct_vm.expect_revert("invalid agreementHash"):
        judge.submit_case(canonical_json(packet))


def test_unsupported_schema_and_packet_hash_rejected(direct_vm, judge):
    packet = make_packet(schemaVersion="2")
    with direct_vm.expect_revert("unsupported schemaVersion"):
        judge.submit_case(canonical_json(packet))
    packet = make_packet()
    packet["disputePacketHash"] = "0x" + "ff" * 32
    with direct_vm.expect_revert("disputePacketHash mismatch"):
        judge.submit_case(canonical_json(packet))


def test_case_id_must_match_exact_x_layer_identity(direct_vm, judge):
    packet = make_packet(caseId="0x" + "11" * 32)
    with direct_vm.expect_revert("caseId does not match X Layer identity"):
        judge.submit_case(canonical_json(packet))
