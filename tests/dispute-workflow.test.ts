import { decodeFunctionData, type Address } from "viem";
import { describe, expect, it } from "vitest";

import { protocolConfig } from "../src/config/protocol";
import {
  assertDisputeWorkflowTransition,
  buildUnsignedXLayerEnterDisputeTransaction,
  COMMERCIAL_OBLIGATION_ESCROW_DISPUTE_ABI,
  validateXLayerDisputeObservation,
  type ExpectedXLayerDisputeBinding,
  type XLayerDisputeObservation,
} from "../src/server/dispute-workflow";

const packetHash = `0x${"7".repeat(64)}` as const;
const transactionHash = `0x${"8".repeat(64)}` as const;
const buyer = "0x1111111111111111111111111111111111111111" as const;
const supplier = "0x2222222222222222222222222222222222222222" as const;
const expected: ExpectedXLayerDisputeBinding = {
  chainId: 1952,
  escrow: protocolConfig.xLayer.escrow as Address,
  obligationId: 71n,
  disputePacketHash: packetHash,
  buyer,
  supplier,
};

function observation(): XLayerDisputeObservation {
  return {
    chainId: 1952,
    transactionHash,
    finalized: true,
    succeeded: true,
    to: protocolConfig.xLayer.escrow as Address,
    functionName: "enterDispute",
    obligationId: 71n,
    disputePacketHash: packetHash,
    event: {
      address: protocolConfig.xLayer.escrow as Address,
      eventName: "DisputeEntered",
      obligationId: 71n,
      initiator: buyer,
      disputePacketHash: packetHash,
    },
    obligationState: 5,
    onchainDisputePacketHash: packetHash,
    blockNumber: 123n,
  };
}

describe("Phase 3C1 dispute workflow", () => {
  it("allows the explicit Phase 3C1 and Phase 3C2 transitions only", () => {
    expect(
      assertDisputeWorkflowTransition("PACKET_READY", "XLAYER_BINDING_PENDING"),
    ).toBe(true);
    expect(
      assertDisputeWorkflowTransition(
        "XLAYER_BINDING_PENDING",
        "XLAYER_DISPUTE_CONFIRMED",
      ),
    ).toBe(true);
    expect(
      assertDisputeWorkflowTransition(
        "XLAYER_DISPUTE_CONFIRMED",
        "GENLAYER_SUBMISSION_PENDING",
      ),
    ).toBe(true);
    expect(
      assertDisputeWorkflowTransition(
        "GENLAYER_SUBMISSION_PENDING",
        "GENLAYER_SUBMITTED",
      ),
    ).toBe(true);
    for (const transition of [
      ["PACKET_READY", "XLAYER_DISPUTE_CONFIRMED"],
      ["GENLAYER_SUBMISSION_PENDING", "PACKET_READY"],
      ["GENLAYER_SUBMITTED", "REVIEW_REQUIRED"],
    ] as const)
      expect(() =>
        assertDisputeWorkflowTransition(transition[0], transition[1]),
      ).toThrow("ILLEGAL_WORKFLOW_TRANSITION");
  });

  it("builds exact unsigned enterDispute calldata without a signer", () => {
    const prepared = buildUnsignedXLayerEnterDisputeTransaction({
      obligationId: 71n,
      disputePacketHash: packetHash,
    });
    expect(prepared).toMatchObject({
      chainId: 1952,
      to: protocolConfig.xLayer.escrow,
      method: "enterDispute",
      obligationId: 71n,
      disputePacketHash: packetHash,
      value: 0n,
    });
    expect(prepared).not.toHaveProperty("account");
    expect(prepared).not.toHaveProperty("signature");
    expect(
      decodeFunctionData({
        abi: COMMERCIAL_OBLIGATION_ESCROW_DISPUTE_ABI,
        data: prepared.data,
      }),
    ).toEqual({
      functionName: "enterDispute",
      args: [71n, packetHash],
    });
  });

  it("accepts an exact finalized party-signed X Layer binding", () => {
    expect(validateXLayerDisputeObservation(expected, observation())).toBe(
      true,
    );
  });

  it.each([
    ["chainId", 1, "WRONG_XLAYER_CHAIN"],
    ["finalized", false, "XLAYER_TRANSACTION_NOT_FINALIZED"],
    ["succeeded", false, "XLAYER_TRANSACTION_FAILED"],
    ["to", buyer, "WRONG_XLAYER_ESCROW"],
    ["functionName", "executeGenLayerResolution", "WRONG_XLAYER_METHOD"],
    ["obligationId", 72n, "WRONG_XLAYER_OBLIGATION"],
    ["disputePacketHash", `0x${"9".repeat(64)}`, "WRONG_XLAYER_PACKET_HASH"],
    ["event", null, "DISPUTE_ENTERED_EVENT_MISMATCH"],
    ["obligationState", 4, "XLAYER_OBLIGATION_NOT_DISPUTED"],
    [
      "onchainDisputePacketHash",
      `0x${"9".repeat(64)}`,
      "XLAYER_STATE_PACKET_HASH_MISMATCH",
    ],
  ] as const)("rejects an invalid %s observation", (field, value, error) => {
    expect(() =>
      validateXLayerDisputeObservation(expected, {
        ...observation(),
        [field]: value,
      }),
    ).toThrow(error);
  });

  it("rejects an event initiated by a non-party wallet", () => {
    const observed = observation();
    observed.event = {
      ...observed.event!,
      initiator: "0x3333333333333333333333333333333333333333",
    };
    expect(() => validateXLayerDisputeObservation(expected, observed)).toThrow(
      "DISPUTE_INITIATOR_NOT_PARTY",
    );
  });
});
