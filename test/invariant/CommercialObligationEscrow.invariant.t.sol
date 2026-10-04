// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {CommercialObligationEscrow} from "../../contracts/CommercialObligationEscrow.sol";
import {MockERC20} from "../../contracts/test/MockERC20.sol";

contract EscrowHandler is Test {
    CommercialObligationEscrow internal e;
    MockERC20 internal t;
    address internal admin;
    uint256 internal constant BK = 0xB0B;
    uint256 internal constant SK = 0x5A11;
    uint256 internal constant AK = 0xA11;
    uint256 internal constant A1 = 0xA771;
    uint256 internal constant A2 = 0xA772;
    address public buyer;
    address public supplier;
    address public adjudicator;
    address public attestor1;
    address public attestor2;
    address public replacementAdjudicator;
    address public replacementAttestor;
    uint256 public nextId;
    mapping(uint256 => uint256) public funded;
    mapping(uint256 => bytes32) public roots;
    mapping(bytes4 => uint256) public calls;

    constructor(CommercialObligationEscrow _e, MockERC20 _t, address _admin) {
        e = _e;
        t = _t;
        admin = _admin;
        buyer = vm.addr(BK);
        supplier = vm.addr(SK);
        adjudicator = vm.addr(AK);
        attestor1 = vm.addr(A1);
        attestor2 = vm.addr(A2);
        replacementAdjudicator = vm.addr(0xA12);
        replacementAttestor = vm.addr(0xA773);
        vm.prank(buyer);
        t.approve(address(e), type(uint256).max);
    }

    function createAcceptFund(uint96 raw) external {
        calls[this.createAcceptFund.selector]++;
        uint256 id = ++nextId;
        uint256 amount = bound(uint256(raw), 1, 1e18);
        t.mint(buyer, amount);
        vm.prank(buyer);
        e.createObligation(id, supplier, amount, keccak256("a"), keccak256("p"), 60, 60);
        vm.prank(supplier);
        e.acceptObligation(id);
        vm.prank(buyer);
        e.fund(id);
        funded[id] = amount;
    }

    function advance(uint32 x) external {
        calls[this.advance.selector]++;
        vm.warp(block.timestamp + bound(uint256(x), 0, 90 days));
    }

    function evidence(uint256 x) external {
        calls[this.evidence.selector]++;
        uint256 id = bound(x, 1, nextId == 0 ? 1 : nextId);
        if (funded[id] == 0) return;
        bytes32 r = keccak256(abi.encode(id));
        vm.prank(supplier);
        try e.commitEvidence(id, r) {
            roots[id] = r;
        } catch {}
    }

    function propose(uint256 x) external {
        calls[this.propose.selector]++;
        uint256 id = bound(x, 1, nextId == 0 ? 1 : nextId);
        if (roots[id] == 0) return;
        CommercialObligationEscrow.Obligation memory o = e.getObligation(id);
        CommercialObligationEscrow.FastOutcomePayload memory p = CommercialObligationEscrow.FastOutcomePayload(
            id,
            roots[id],
            o.agreementHash,
            o.policyHash,
            CommercialObligationEscrow.FastOutcome.RELEASE_AUTHORISED_AMOUNT,
            o.amount,
            id,
            block.timestamp + 1 days
        );
        bytes32 d = e.fastOutcomeDigest(p);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AK, d);
        try e.proposeFastOutcome(p, abi.encodePacked(r, s, v)) {} catch {}
    }

    function challenge(uint256 x) external {
        calls[this.challenge.selector]++;
        uint256 id = bound(x, 1, nextId == 0 ? 1 : nextId);
        vm.prank(buyer);
        try e.challenge(id, bytes32(0)) {} catch {}
    }

    function dispute(uint256 x) external {
        calls[this.dispute.selector]++;
        uint256 id = bound(x, 1, nextId == 0 ? 1 : nextId);
        vm.prank(buyer);
        try e.enterDispute(id, keccak256("packet")) {} catch {}
    }

    function finalize(uint256 x) external {
        calls[this.finalize.selector]++;
        uint256 id = bound(x, 1, nextId == 0 ? 1 : nextId);
        try e.finalizeFastOutcome(id) {} catch {}
    }

    function mutual(uint256 x, uint96 rawBuyerAmount) external {
        calls[this.mutual.selector]++;
        uint256 id = bound(x, 1, nextId == 0 ? 1 : nextId);
        CommercialObligationEscrow.Obligation memory o = e.getObligation(id);
        if (o.state != CommercialObligationEscrow.ObligationState.DISPUTED) return;
        uint256 b = bound(uint256(rawBuyerAmount), 0, o.amount);
        CommercialObligationEscrow.MutualResolutionPayload memory p = CommercialObligationEscrow.MutualResolutionPayload(
            id, roots[id], o.agreementHash, o.policyHash, b, o.amount - b, id + 1000, block.timestamp + 1 days
        );
        bytes32 d = e.mutualResolutionDigest(p);
        (uint8 vb, bytes32 rb, bytes32 sb) = vm.sign(BK, d);
        (uint8 vs, bytes32 rs, bytes32 ss) = vm.sign(SK, d);
        try e.executeMutualResolution(p, abi.encodePacked(rb, sb, vb), abi.encodePacked(rs, ss, vs)) {} catch {}
    }

    function attest(uint256 x) external {
        calls[this.attest.selector]++;
        uint256 id = bound(x, 1, nextId == 0 ? 1 : nextId);
        CommercialObligationEscrow.Obligation memory o = e.getObligation(id);
        if (o.state != CommercialObligationEscrow.ObligationState.DISPUTED) return;
        CommercialObligationEscrow.GenLayerResolutionPayload memory p =
            CommercialObligationEscrow.GenLayerResolutionPayload(
                61999,
                address(0x1234),
                e.toleranceCaseId(id),
                keccak256("tx"),
                keccak256("result"),
                block.chainid,
                address(e),
                id,
                o.agreementHash,
                o.policyHash,
                roots[id],
                keccak256("packet"),
                CommercialObligationEscrow.GenLayerVerdict.RELEASE_FULL,
                id + 2000,
                block.timestamp + 1 days
            );
        bytes32 d = e.genLayerResolutionDigest(p);
        bytes[] memory sigs = new bytes[](2);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(A1, d);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(A2, d);
        sigs[0] = abi.encodePacked(r1, s1, v1);
        sigs[1] = abi.encodePacked(r2, s2, v2);
        try e.executeGenLayerResolution(p, sigs) {} catch {}
    }

    function timeout(uint256 x) external {
        calls[this.timeout.selector]++;
        uint256 id = bound(x, 1, nextId == 0 ? 1 : nextId);
        vm.prank(buyer);
        try e.refundForEvidenceTimeout(id) {} catch {}
    }

    function pause() external {
        calls[this.pause.selector]++;
        vm.prank(admin);
        try e.pause() {} catch {}
    }

    function unpause() external {
        calls[this.unpause.selector]++;
        vm.prank(admin);
        try e.unpause() {} catch {}
    }

    function rotateAdjudicator() external {
        calls[this.rotateAdjudicator.selector]++;
        vm.prank(admin);
        try e.grantRole(e.ADJUDICATOR_ROLE(), replacementAdjudicator) {} catch {}
        vm.prank(admin);
        try e.revokeRole(e.ADJUDICATOR_ROLE(), replacementAdjudicator) {} catch {}
    }

    function rotateAttestor() external {
        calls[this.rotateAttestor.selector]++;
        vm.prank(admin);
        try e.grantRole(e.RESOLUTION_ATTESTOR_ROLE(), replacementAttestor) {} catch {}
        vm.prank(admin);
        try e.revokeRole(e.RESOLUTION_ATTESTOR_ROLE(), replacementAttestor) {} catch {}
    }
}

contract CommercialObligationEscrowInvariantTest is StdInvariant, Test {
    MockERC20 t;
    CommercialObligationEscrow e;
    EscrowHandler h;

    function setUp() public {
        t = new MockERC20();
        e = new CommercialObligationEscrow(t, 61999, address(0x1234), 2, address(this));
        h = new EscrowHandler(e, t, address(this));
        e.grantRole(e.DEFAULT_ADMIN_ROLE(), address(h));
        e.grantRole(e.PAUSER_ROLE(), address(this));
        e.grantRole(e.ADJUDICATOR_ROLE(), h.adjudicator());
        e.grantRole(e.RESOLUTION_ATTESTOR_ROLE(), h.attestor1());
        e.grantRole(e.RESOLUTION_ATTESTOR_ROLE(), h.attestor2());
        targetContract(address(h));
    }

    function invariant_recipientAndTokenConservation() public view {
        assertEq(t.balanceOf(address(e)) + t.balanceOf(h.buyer()) + t.balanceOf(h.supplier()), t.totalSupply());
    }

    function invariant_immutablePartiesAndTerminality() public view {
        for (uint256 i = 1; i <= h.nextId(); i++) {
            CommercialObligationEscrow.Obligation memory o = e.getObligation(i);
            assertEq(o.buyer, h.buyer());
            assertEq(o.supplier, h.supplier());
            assertEq(address(e.settlementToken()), address(t));
            if (
                o.state == CommercialObligationEscrow.ObligationState.SETTLED
                    || o.state == CommercialObligationEscrow.ObligationState.REFUNDED
            ) assertEq(t.balanceOf(address(e)) <= t.totalSupply(), true);
        }
    }
}
