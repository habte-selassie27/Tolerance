// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CommercialObligationEscrow} from "../contracts/CommercialObligationEscrow.sol";
import {MockERC20} from "../contracts/test/MockERC20.sol";

contract CommercialObligationEscrowTest is Test {
    uint256 internal buyerKey = 0xB0B;
    uint256 internal supplierKey = 0x5A11;
    uint256 internal adjudicatorKey = 0xA11;
    uint256 internal attestorOneKey = 0xA771;
    uint256 internal attestorTwoKey = 0xA772;
    uint256 internal outsiderKey = 0xBAD;
    address internal buyer = vm.addr(buyerKey);
    address internal supplier = vm.addr(supplierKey);
    address internal adjudicator = vm.addr(adjudicatorKey);
    address internal attestorOne = vm.addr(attestorOneKey);
    address internal attestorTwo = vm.addr(attestorTwoKey);
    address internal outsider = vm.addr(outsiderKey);
    MockERC20 internal token;
    CommercialObligationEscrow internal escrow;
    bytes32 internal constant AGREEMENT = keccak256("agreement");
    bytes32 internal constant POLICY = keccak256("policy");
    bytes32 internal constant EVIDENCE = keccak256("evidence");
    bytes32 internal constant PACKET = keccak256("packet");
    uint256 internal constant AMOUNT = 1_000e6;

    function setUp() public {
        token = new MockERC20();
        escrow = new CommercialObligationEscrow(token, 61999, address(0x1234), 2, address(this));
        escrow.grantRole(escrow.PAUSER_ROLE(), address(this));
        escrow.grantRole(escrow.ADJUDICATOR_ROLE(), adjudicator);
        escrow.grantRole(escrow.RESOLUTION_ATTESTOR_ROLE(), attestorOne);
        escrow.grantRole(escrow.RESOLUTION_ATTESTOR_ROLE(), attestorTwo);
        token.mint(buyer, 10 * AMOUNT);
        vm.prank(buyer);
        token.approve(address(escrow), type(uint256).max);
    }

    function _createAcceptFundEvidence(uint256 id) internal {
        vm.prank(buyer);
        escrow.createObligation(id, supplier, AMOUNT, AGREEMENT, POLICY, 1 days, 7 days);
        vm.prank(supplier);
        escrow.acceptObligation(id);
        vm.prank(buyer);
        escrow.fund(id);
        vm.prank(supplier);
        escrow.commitEvidence(id, EVIDENCE);
    }

    function _fast(uint256 id, CommercialObligationEscrow.FastOutcome outcome, uint256 amount, uint256 nonce)
        internal
        returns (CommercialObligationEscrow.FastOutcomePayload memory p, bytes memory sig)
    {
        p = CommercialObligationEscrow.FastOutcomePayload(
            id, EVIDENCE, AGREEMENT, POLICY, outcome, amount, nonce, block.timestamp + 1 days
        );
        sig = _signature(adjudicatorKey, escrow.fastOutcomeDigest(p));
    }

    function _resolution(uint256 id, CommercialObligationEscrow.GenLayerVerdict verdict, uint256 nonce)
        internal
        view
        returns (CommercialObligationEscrow.GenLayerResolutionPayload memory p)
    {
        p = CommercialObligationEscrow.GenLayerResolutionPayload(
            61999,
            address(0x1234),
            escrow.toleranceCaseId(id),
            keccak256("transaction"),
            keccak256("result"),
            block.chainid,
            address(escrow),
            id,
            AGREEMENT,
            POLICY,
            EVIDENCE,
            PACKET,
            verdict,
            nonce,
            block.timestamp + 1 days
        );
    }

    function _signature(uint256 key, bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _dispute(uint256 id) internal {
        _createAcceptFundEvidence(id);
        vm.prank(buyer);
        escrow.enterDispute(id, PACKET);
    }

    function testHappyPathReleaseAfterChallengeWindow() public {
        _createAcceptFundEvidence(1);
        (CommercialObligationEscrow.FastOutcomePayload memory p, bytes memory sig) =
            _fast(1, CommercialObligationEscrow.FastOutcome.RELEASE_AUTHORISED_AMOUNT, AMOUNT, 1);
        escrow.proposeFastOutcome(p, sig);
        vm.warp(block.timestamp + 1 days);
        escrow.finalizeFastOutcome(1);
        assertEq(token.balanceOf(supplier), AMOUNT);
        assertEq(uint8(escrow.getObligation(1).state), uint8(CommercialObligationEscrow.ObligationState.SETTLED));
    }

    function testRefundPath() public {
        _createAcceptFundEvidence(2);
        (CommercialObligationEscrow.FastOutcomePayload memory p, bytes memory sig) =
            _fast(2, CommercialObligationEscrow.FastOutcome.REFUND_FULL, 0, 2);
        escrow.proposeFastOutcome(p, sig);
        vm.warp(block.timestamp + 1 days);
        escrow.finalizeFastOutcome(2);
        assertEq(token.balanceOf(buyer), 10 * AMOUNT);
    }

    function testNoEvidenceTimeoutAtDeadlineRefundsBuyer() public {
        vm.prank(buyer);
        escrow.createObligation(3, supplier, AMOUNT, AGREEMENT, POLICY, 60, 60);
        vm.prank(supplier);
        escrow.acceptObligation(3);
        vm.prank(buyer);
        escrow.fund(3);
        vm.warp(block.timestamp + 59);
        vm.expectRevert(CommercialObligationEscrow.TooEarly.selector);
        vm.prank(buyer);
        escrow.refundForEvidenceTimeout(3);
        vm.warp(block.timestamp + 1);
        vm.prank(buyer);
        escrow.refundForEvidenceTimeout(3);
        assertEq(token.balanceOf(buyer), 10 * AMOUNT);
    }

    function testEvidenceDeadlineIsStrictAndUnaffectedByPause() public {
        vm.prank(buyer);
        escrow.createObligation(30, supplier, AMOUNT, AGREEMENT, POLICY, 60, 60);
        vm.prank(supplier);
        escrow.acceptObligation(30);
        vm.prank(buyer);
        escrow.fund(30);
        vm.warp(block.timestamp + 59);
        escrow.pause();
        vm.prank(supplier);
        escrow.commitEvidence(30, EVIDENCE);
        escrow.unpause();
        vm.prank(buyer);
        escrow.createObligation(31, supplier, AMOUNT, AGREEMENT, POLICY, 60, 60);
        vm.prank(supplier);
        escrow.acceptObligation(31);
        vm.prank(buyer);
        escrow.fund(31);
        vm.warp(block.timestamp + 60);
        escrow.pause();
        vm.expectRevert(CommercialObligationEscrow.EvidenceSubmissionWindowClosed.selector);
        vm.prank(supplier);
        escrow.commitEvidence(31, EVIDENCE);
        vm.expectRevert();
        vm.prank(buyer);
        escrow.refundForEvidenceTimeout(31);
        escrow.unpause();
        vm.prank(buyer);
        escrow.refundForEvidenceTimeout(31);
    }

    function testChallengeBlocksAutomaticFinalizationAndWorksPaused() public {
        _createAcceptFundEvidence(4);
        (CommercialObligationEscrow.FastOutcomePayload memory p, bytes memory sig) =
            _fast(4, CommercialObligationEscrow.FastOutcome.RELEASE_AUTHORISED_AMOUNT, AMOUNT, 4);
        escrow.proposeFastOutcome(p, sig);
        escrow.pause();
        vm.prank(supplier);
        escrow.challenge(4, bytes32(0));
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert();
        escrow.finalizeFastOutcome(4);
        assertEq(uint8(escrow.getObligation(4).state), uint8(CommercialObligationEscrow.ObligationState.DISPUTED));
    }

    function testMutualSplitRequiresBothImmutableParties() public {
        _dispute(5);
        CommercialObligationEscrow.MutualResolutionPayload memory p = CommercialObligationEscrow.MutualResolutionPayload(
            5, EVIDENCE, AGREEMENT, POLICY, 400e6, 600e6, 5, block.timestamp + 1 days
        );
        bytes32 digest = escrow.mutualResolutionDigest(p);
        escrow.executeMutualResolution(p, _signature(buyerKey, digest), _signature(supplierKey, digest));
        assertEq(token.balanceOf(buyer), 9 * AMOUNT + 400e6);
        assertEq(token.balanceOf(supplier), 600e6);
    }

    function testOneAttestorCannotSettle() public {
        _dispute(6);
        CommercialObligationEscrow.GenLayerResolutionPayload memory p =
            _resolution(6, CommercialObligationEscrow.GenLayerVerdict.RELEASE_FULL, 6);
        bytes[] memory signatures = new bytes[](1);
        signatures[0] = _signature(attestorOneKey, escrow.genLayerResolutionDigest(p));
        vm.expectRevert(CommercialObligationEscrow.InsufficientAttestations.selector);
        escrow.executeGenLayerResolution(p, signatures);
    }

    function testThresholdAttestationSettlesAndCannotRedirect() public {
        _dispute(7);
        CommercialObligationEscrow.GenLayerResolutionPayload memory p =
            _resolution(7, CommercialObligationEscrow.GenLayerVerdict.RELEASE_FULL, 7);
        bytes32 digest = escrow.genLayerResolutionDigest(p);
        bytes[] memory signatures = new bytes[](2);
        signatures[0] = _signature(attestorOneKey, digest);
        signatures[1] = _signature(attestorTwoKey, digest);
        escrow.executeGenLayerResolution(p, signatures);
        assertEq(token.balanceOf(supplier), AMOUNT);
        assertEq(token.balanceOf(outsider), 0);
    }

    function testDuplicateAndRevokedAttestorsRejected() public {
        _dispute(8);
        CommercialObligationEscrow.GenLayerResolutionPayload memory p =
            _resolution(8, CommercialObligationEscrow.GenLayerVerdict.REFUND_FULL, 8);
        bytes32 digest = escrow.genLayerResolutionDigest(p);
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _signature(attestorOneKey, digest);
        sigs[1] = _signature(attestorOneKey, digest);
        vm.expectRevert(CommercialObligationEscrow.DuplicateSigner.selector);
        escrow.executeGenLayerResolution(p, sigs);
        escrow.revokeRole(escrow.RESOLUTION_ATTESTOR_ROLE(), attestorTwo);
        sigs[1] = _signature(attestorTwoKey, digest);
        vm.expectRevert(CommercialObligationEscrow.InvalidSignature.selector);
        escrow.executeGenLayerResolution(p, sigs);
    }

    function testInvalidBindingsReplayAndExpiryFail() public {
        _dispute(9);
        CommercialObligationEscrow.GenLayerResolutionPayload memory p =
            _resolution(9, CommercialObligationEscrow.GenLayerVerdict.RELEASE_FULL, 9);
        p.sourceChainId = 4221;
        bytes32 digest = escrow.genLayerResolutionDigest(p);
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _signature(attestorOneKey, digest);
        sigs[1] = _signature(attestorTwoKey, digest);
        vm.expectRevert(CommercialObligationEscrow.InvalidSource.selector);
        escrow.executeGenLayerResolution(p, sigs);
        p = _resolution(9, CommercialObligationEscrow.GenLayerVerdict.RELEASE_FULL, 10);
        p.expiry = block.timestamp - 1;
        digest = escrow.genLayerResolutionDigest(p);
        sigs[0] = _signature(attestorOneKey, digest);
        sigs[1] = _signature(attestorTwoKey, digest);
        vm.expectRevert(CommercialObligationEscrow.ExpiredAuthorization.selector);
        escrow.executeGenLayerResolution(p, sigs);
    }

    function testFuzzMutualAmountsMustAccountForAllFunds(uint96 buyerAmount) public {
        _dispute(10);
        uint256 normalizedBuyer = bound(uint256(buyerAmount), 0, AMOUNT);
        CommercialObligationEscrow.MutualResolutionPayload memory p = CommercialObligationEscrow.MutualResolutionPayload(
            10, EVIDENCE, AGREEMENT, POLICY, normalizedBuyer, AMOUNT - normalizedBuyer, 10, block.timestamp + 1 days
        );
        bytes32 digest = escrow.mutualResolutionDigest(p);
        escrow.executeMutualResolution(p, _signature(buyerKey, digest), _signature(supplierKey, digest));
        assertEq(token.balanceOf(address(escrow)), 0);
    }
}
