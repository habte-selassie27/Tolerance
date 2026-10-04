import { describe, expect, it } from "vitest";

import { ResolvedBusinessVerdict } from "../genlayer/schemas/resolved-case";
import { parseResolvedCaseV1 } from "../src/server/resolution-observation";

const bytes32 = (character: string) => `0x${character.repeat(64)}`;

const finalized = {
  resolved: true,
  schemaVersion: "1",
  caseId: bytes32("a"),
  xLayerChainId: "1952",
  xLayerEscrow: "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
  obligationId: "9100000001",
  agreementHash: bytes32("b"),
  policyHash: bytes32("c"),
  evidenceRoot: bytes32("d"),
  disputePacketHash: bytes32("e"),
  verdict: "RELEASE_FULL",
};

describe("Phase 3C3 finalized resolution parsing", () => {
  it("accepts only resolved, frozen ResolvedCaseV1 fields from finalized state", () => {
    const parsed = parseResolvedCaseV1(JSON.stringify(finalized));
    expect(parsed.resolved).toBe(true);
    expect(parsed.caseId).toBe(finalized.caseId);
    expect(parsed.verdict).toBe(ResolvedBusinessVerdict.RELEASE_FULL);
    expect(parsed.obligationId).toBe(9100000001n);
  });

  it.each([
    [{ ...finalized, resolved: false }, "JUDGE_CASE_NOT_RESOLVED"],
    [{ ...finalized, verdict: "PAY_NOW" }, "MALFORMED_RESOLVED_CASE_VERDICT"],
    [{ ...finalized, caseId: "0x1234" }, "MALFORMED_RESOLVED_CASE_CASE_ID"],
    [
      { ...finalized, agreementHash: "not-a-hash" },
      "MALFORMED_RESOLVED_CASE_AGREEMENT_HASH",
    ],
    ["not JSON", "MALFORMED_FINALIZED_JUDGE_STATE"],
  ])("fails closed for malformed finalized state", (input, error) => {
    expect(() => parseResolvedCaseV1(input)).toThrow(error);
  });
});
