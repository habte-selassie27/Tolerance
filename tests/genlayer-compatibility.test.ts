import { describe, expect, it } from "vitest";
import { toleranceGenLayerNetwork } from "../genlayer/config/network";
import {
  computeToleranceCaseId,
  hashResolvedCaseV1,
  ResolvedBusinessVerdict,
  TOLERANCE_RESOLVED_CASE_V1_DOMAIN,
} from "../genlayer/schemas/resolved-case";

const fixture = {
  schemaVersion: 1n,
  xLayerChainId: 1952n,
  xLayerEscrow: "0x2222222222222222222222222222222222222222" as const,
  obligationId: 7n,
  agreementHash:
    "0x3333333333333333333333333333333333333333333333333333333333333333" as const,
  policyHash:
    "0x4444444444444444444444444444444444444444444444444444444444444444" as const,
  evidenceRoot:
    "0x5555555555555555555555555555555555555555555555555555555555555555" as const,
  disputePacketHash:
    "0x6666666666666666666666666666666666666666666666666666666666666666" as const,
  verdict: ResolvedBusinessVerdict.RELEASE_FULL,
};

describe("GenLayer/X Layer compatibility", () => {
  it("imports the official Studionet chain definition", () => {
    expect(toleranceGenLayerNetwork.id).toBe(61999);
    expect(toleranceGenLayerNetwork.rpcUrls.default.http[0]).toBe(
      "https://studio.genlayer.com/api",
    );
  });

  it("freezes the Tolerance case identity with abi.encode-compatible types", () => {
    expect(
      computeToleranceCaseId(
        fixture.xLayerChainId,
        fixture.xLayerEscrow,
        fixture.obligationId,
      ),
    ).toBe(
      "0x229c5066c62add29d4b29981a1ecf120aaa4ebcba0d135a17510e91cb41b3d00",
    );
  });

  it("freezes the versioned EVM result hash", () => {
    const caseId = computeToleranceCaseId(
      fixture.xLayerChainId,
      fixture.xLayerEscrow,
      fixture.obligationId,
    );
    expect(TOLERANCE_RESOLVED_CASE_V1_DOMAIN).toBe(
      "0x045c68e6217c52f00f19665907bd26004809ef2ce6c833e050ee7b7706462416",
    );
    expect(hashResolvedCaseV1({ ...fixture, caseId })).toBe(
      "0x30f422dedfb7917adb9175861f62062a17fd461570a2774c5efe6cd080d9ad6d",
    );
  });
});
