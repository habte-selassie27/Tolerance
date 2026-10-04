// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {CommercialObligationEscrowTest} from "./CommercialObligationEscrow.t.sol";
import {CommercialObligationEscrow} from "../contracts/CommercialObligationEscrow.sol";

contract CommercialObligationEscrowEIP712SeparationTest is CommercialObligationEscrowTest {
    function testAllSixAuthorizationFamiliesAreNonInterchangeable() public {
        _dispute(201);
        CommercialObligationEscrow.FastOutcomePayload memory f = CommercialObligationEscrow.FastOutcomePayload(
            201,
            EVIDENCE,
            AGREEMENT,
            POLICY,
            CommercialObligationEscrow.FastOutcome.RELEASE_AUTHORISED_AMOUNT,
            AMOUNT,
            1,
            block.timestamp + 1 days
        );
        CommercialObligationEscrow.MutualResolutionPayload memory m = CommercialObligationEscrow.MutualResolutionPayload(
            201, EVIDENCE, AGREEMENT, POLICY, 0, AMOUNT, 2, block.timestamp + 1 days
        );
        CommercialObligationEscrow.GenLayerResolutionPayload memory g =
            _resolution(201, CommercialObligationEscrow.GenLayerVerdict.RELEASE_FULL, 3);
        bytes memory fs = _signature(adjudicatorKey, escrow.fastOutcomeDigest(f));
        bytes memory bs = _signature(buyerKey, escrow.mutualResolutionDigest(m));
        bytes memory ss = _signature(supplierKey, escrow.mutualResolutionDigest(m));
        bytes memory gs = _signature(attestorOneKey, escrow.genLayerResolutionDigest(g));
        vm.expectRevert(); // Fast -> Mutual
        escrow.executeMutualResolution(m, fs, ss);
        bytes[] memory a = new bytes[](2); // Fast -> GenLayer
        a[0] = fs;
        a[1] = _signature(attestorTwoKey, escrow.genLayerResolutionDigest(g));
        vm.expectRevert();
        escrow.executeGenLayerResolution(g, a);
        _createAcceptFundEvidence(202); // Mutual -> Fast
        f.obligationId = 202;
        f.nonce = 4;
        vm.expectRevert();
        escrow.proposeFastOutcome(f, bs);
        a[0] = bs; // Mutual -> GenLayer
        vm.expectRevert();
        escrow.executeGenLayerResolution(g, a);
        vm.expectRevert(); // GenLayer -> Fast
        escrow.proposeFastOutcome(f, gs);
        vm.expectRevert(); // GenLayer -> Mutual
        escrow.executeMutualResolution(m, gs, ss);
    }

    function testMaterialFieldMutationInvalidatesSignatures() public {
        _createAcceptFundEvidence(203);
        CommercialObligationEscrow.FastOutcomePayload memory f = CommercialObligationEscrow.FastOutcomePayload(
            203,
            EVIDENCE,
            AGREEMENT,
            POLICY,
            CommercialObligationEscrow.FastOutcome.RELEASE_AUTHORISED_AMOUNT,
            AMOUNT,
            9,
            block.timestamp + 1 days
        );
        bytes memory s = _signature(adjudicatorKey, escrow.fastOutcomeDigest(f));
        f.evidenceRoot = keccak256("changed");
        vm.expectRevert(CommercialObligationEscrow.InvalidHash.selector);
        escrow.proposeFastOutcome(f, s);
        f.evidenceRoot = EVIDENCE;
        f.policyHash = keccak256("changed");
        vm.expectRevert(CommercialObligationEscrow.InvalidHash.selector);
        escrow.proposeFastOutcome(f, s);
    }
}
