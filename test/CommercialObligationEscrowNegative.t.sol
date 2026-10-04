// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CommercialObligationEscrowTest} from "./CommercialObligationEscrow.t.sol";
import {CommercialObligationEscrow} from "../contracts/CommercialObligationEscrow.sol";

contract CommercialObligationEscrowNegativeTest is CommercialObligationEscrowTest {
    function testNegativeLifecycleAndEvidenceGuards() public {
        vm.prank(buyer);
        escrow.createObligation(101, supplier, AMOUNT, AGREEMENT, POLICY, 60, 60);
        vm.expectRevert(CommercialObligationEscrow.InvalidState.selector);
        vm.prank(buyer);
        escrow.fund(101);
        vm.expectRevert(CommercialObligationEscrow.InvalidState.selector);
        vm.prank(supplier);
        escrow.commitEvidence(101, EVIDENCE);
        vm.prank(supplier);
        escrow.acceptObligation(101);
        vm.prank(buyer);
        escrow.fund(101);
        vm.expectRevert(CommercialObligationEscrow.InvalidState.selector);
        vm.prank(supplier);
        escrow.commitEvidence(101, bytes32(0));
        vm.prank(supplier);
        escrow.commitEvidence(101, EVIDENCE);
        vm.expectRevert(CommercialObligationEscrow.InvalidState.selector);
        vm.prank(supplier);
        escrow.commitEvidence(101, keccak256("replacement"));
        vm.expectRevert(CommercialObligationEscrow.InvalidState.selector);
        vm.prank(buyer);
        escrow.refundForEvidenceTimeout(101);

        vm.prank(buyer);
        escrow.createObligation(102, supplier, AMOUNT, AGREEMENT, POLICY, 60, 60);
        vm.prank(supplier);
        escrow.acceptObligation(102);
        vm.prank(buyer);
        escrow.fund(102);
        vm.expectRevert(CommercialObligationEscrow.TooEarly.selector);
        vm.prank(buyer);
        escrow.refundForEvidenceTimeout(102);
        vm.warp(block.timestamp + 60);
        vm.expectRevert(CommercialObligationEscrow.EvidenceSubmissionWindowClosed.selector);
        vm.prank(supplier);
        escrow.commitEvidence(102, EVIDENCE);
        vm.prank(buyer);
        escrow.refundForEvidenceTimeout(102);
        vm.expectRevert(CommercialObligationEscrow.InvalidState.selector);
        vm.prank(buyer);
        escrow.refundForEvidenceTimeout(102);
    }

    function testNegativeFastOutcomeAuthorizationBindingsAndBoundaries() public {
        _createAcceptFundEvidence(103);
        (CommercialObligationEscrow.FastOutcomePayload memory p,) =
            _fast(103, CommercialObligationEscrow.FastOutcome.RELEASE_AUTHORISED_AMOUNT, AMOUNT, 103);
        bytes32 digest = escrow.fastOutcomeDigest(p);
        vm.expectRevert(CommercialObligationEscrow.InvalidSignature.selector);
        escrow.proposeFastOutcome(p, _signature(outsiderKey, digest));
        escrow.revokeRole(escrow.ADJUDICATOR_ROLE(), adjudicator);
        vm.expectRevert(CommercialObligationEscrow.InvalidSignature.selector);
        escrow.proposeFastOutcome(p, _signature(adjudicatorKey, digest));
        escrow.grantRole(escrow.ADJUDICATOR_ROLE(), adjudicator);
        p.expiry = block.timestamp - 1;
        bytes memory expiredSig = _signature(adjudicatorKey, escrow.fastOutcomeDigest(p));
        vm.expectRevert(CommercialObligationEscrow.ExpiredAuthorization.selector);
        escrow.proposeFastOutcome(p, expiredSig);
        p.expiry = block.timestamp + 1 days;
        p.policyHash = keccak256("wrong");
        bytes memory wrongPolicySig = _signature(adjudicatorKey, escrow.fastOutcomeDigest(p));
        vm.expectRevert(CommercialObligationEscrow.InvalidHash.selector);
        escrow.proposeFastOutcome(p, wrongPolicySig);
        p.policyHash = POLICY;
        p.amount = AMOUNT - 1;
        bytes memory wrongAmountSig = _signature(adjudicatorKey, escrow.fastOutcomeDigest(p));
        vm.expectRevert(CommercialObligationEscrow.InvalidOutcome.selector);
        escrow.proposeFastOutcome(p, wrongAmountSig);
        p.amount = AMOUNT;
        bytes memory sig = _signature(adjudicatorKey, escrow.fastOutcomeDigest(p));
        escrow.proposeFastOutcome(p, sig);
        vm.expectRevert(CommercialObligationEscrow.InvalidState.selector);
        escrow.proposeFastOutcome(p, sig);
        vm.expectRevert(CommercialObligationEscrow.TooEarly.selector);
        escrow.finalizeFastOutcome(103);
        vm.warp(escrow.getObligation(103).challengeDeadline);
        vm.expectRevert(CommercialObligationEscrow.ChallengeWindowClosed.selector);
        vm.prank(buyer);
        escrow.challenge(103, bytes32(0));
        escrow.finalizeFastOutcome(103);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function testNegativeMutualAndThresholdAuthorization() public {
        _dispute(104);
        CommercialObligationEscrow.MutualResolutionPayload memory m = CommercialObligationEscrow.MutualResolutionPayload(
            104, EVIDENCE, AGREEMENT, POLICY, AMOUNT / 2, AMOUNT / 2, 104, block.timestamp + 1 days
        );
        bytes32 md = escrow.mutualResolutionDigest(m);
        vm.expectRevert(CommercialObligationEscrow.InvalidSignature.selector);
        escrow.executeMutualResolution(m, _signature(buyerKey, md), _signature(buyerKey, md));
        m.buyerAmount = AMOUNT / 2 - 1;
        vm.expectRevert(CommercialObligationEscrow.AmountMismatch.selector);
        escrow.executeMutualResolution(m, "", "");
        m.buyerAmount = AMOUNT / 2;
        bytes memory bs = _signature(buyerKey, escrow.mutualResolutionDigest(m));
        bytes memory ss = _signature(supplierKey, escrow.mutualResolutionDigest(m));
        escrow.executeMutualResolution(m, bs, ss);
        vm.expectRevert(CommercialObligationEscrow.InvalidState.selector);
        escrow.executeMutualResolution(m, bs, ss);

        _dispute(105);
        CommercialObligationEscrow.GenLayerResolutionPayload memory g =
            _resolution(105, CommercialObligationEscrow.GenLayerVerdict.RELEASE_FULL, 105);
        bytes32 gd = escrow.genLayerResolutionDigest(g);
        bytes[] memory one = new bytes[](1);
        one[0] = _signature(attestorOneKey, gd);
        vm.expectRevert(CommercialObligationEscrow.InsufficientAttestations.selector);
        escrow.executeGenLayerResolution(g, one);
        bytes[] memory two = new bytes[](2);
        two[0] = one[0];
        two[1] = one[0];
        vm.expectRevert(CommercialObligationEscrow.DuplicateSigner.selector);
        escrow.executeGenLayerResolution(g, two);
        two[1] = _signature(outsiderKey, gd);
        vm.expectRevert(CommercialObligationEscrow.InvalidSignature.selector);
        escrow.executeGenLayerResolution(g, two);
        g.genLayerResultHash = keccak256("mutated");
        two[0] = _signature(attestorOneKey, gd);
        two[1] = _signature(attestorTwoKey, gd);
        vm.expectRevert(CommercialObligationEscrow.InvalidSignature.selector);
        escrow.executeGenLayerResolution(g, two);
    }

    function testPauseProtectiveAndEconomicSemantics() public {
        vm.prank(buyer);
        escrow.createObligation(106, supplier, AMOUNT, AGREEMENT, POLICY, 60, 60);
        vm.prank(supplier);
        escrow.acceptObligation(106);
        escrow.grantRole(escrow.PAUSER_ROLE(), address(this));
        escrow.pause();
        vm.expectRevert();
        vm.prank(buyer);
        escrow.fund(106);
        escrow.unpause();
        vm.prank(buyer);
        escrow.fund(106);
        escrow.pause();
        vm.prank(supplier);
        escrow.commitEvidence(106, EVIDENCE);
        vm.prank(buyer);
        escrow.enterDispute(106, PACKET);
        vm.expectRevert();
        vm.prank(outsider);
        escrow.unpause();
    }

    function testInsufficientAllowanceAndBalanceDoNotCorruptState() public {
        vm.prank(buyer);
        escrow.createObligation(107, supplier, AMOUNT, AGREEMENT, POLICY, 60, 60);
        vm.prank(supplier);
        escrow.acceptObligation(107);
        vm.prank(buyer);
        token.approve(address(escrow), 0);
        vm.expectRevert();
        vm.prank(buyer);
        escrow.fund(107);
        assertEq(uint8(escrow.getObligation(107).state), uint8(CommercialObligationEscrow.ObligationState.ACCEPTED));
    }
}
