// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

contract ToleranceResolvedCaseHashTest is Test {
    bytes32 internal constant RESULT_DOMAIN = keccak256("ToleranceResolvedCaseV1");

    function test_caseIdAndResultHashMatchSharedViemVector() public pure {
        uint256 xLayerChainId = 1952;
        address escrow = 0x2222222222222222222222222222222222222222;
        uint256 obligationId = 7;
        bytes32 caseId = keccak256(abi.encode(xLayerChainId, escrow, obligationId));
        assertEq(caseId, 0x229c5066c62add29d4b29981a1ecf120aaa4ebcba0d135a17510e91cb41b3d00);

        bytes32 resultHash = keccak256(
            abi.encode(
                RESULT_DOMAIN,
                uint256(1),
                caseId,
                xLayerChainId,
                escrow,
                obligationId,
                bytes32(uint256(0x3333333333333333333333333333333333333333333333333333333333333333)),
                bytes32(uint256(0x4444444444444444444444444444444444444444444444444444444444444444)),
                bytes32(uint256(0x5555555555555555555555555555555555555555555555555555555555555555)),
                bytes32(uint256(0x6666666666666666666666666666666666666666666666666666666666666666)),
                uint8(0)
            )
        );
        assertEq(RESULT_DOMAIN, 0x045c68e6217c52f00f19665907bd26004809ef2ce6c833e050ee7b7706462416);
        assertEq(resultHash, 0x30f422dedfb7917adb9175861f62062a17fd461570a2774c5efe6cd080d9ad6d);
    }
}
