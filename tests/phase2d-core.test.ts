import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  collectThreshold,
  makeResolutionPayload,
  observeFinalizedCase,
  verifyResolvedCase,
  type ExpectedCase,
} from "../packages/phase2d/core";
import { ResolvedBusinessVerdict } from "../genlayer/schemas/resolved-case";
const h = (n: string) => `0x${n.repeat(64)}` as `0x${string}`;
const escrow = "0x2222222222222222222222222222222222222222" as const;
const judge = "0xF20Fd73435C71Ddf178a9DfbD78114AeD0b902E4" as const;
const expected: ExpectedCase = {
  schemaVersion: 1n,
  caseId: h("0"),
  xLayerChainId: 1952n,
  xLayerEscrow: escrow,
  obligationId: 7n,
  agreementHash: h("3"),
  policyHash: h("4"),
  evidenceRoot: h("5"),
  disputePacketHash: h("6"),
  judge,
  genLayerTxId: h("a"),
  expiry: 9999999999n,
  nonce: 1n,
};
const actual = {
  ...expected,
  caseId:
    "0x229c5066c62add29d4b29981a1ecf120aaa4ebcba0d135a17510e91cb41b3d00" as const,
  resolved: true,
  verdict: ResolvedBusinessVerdict.RELEASE_FULL,
};
const client = (
  value: {
    status?: string;
    result?: "FINISHED_WITH_RETURN" | "FINISHED_WITH_ERROR";
    recipient?: `0x${string}`;
    method?: "submit_case" | "other";
  } = {},
) => ({
  getStatus: async () => ({
    hash: expected.genLayerTxId,
    status: value.status ?? "FINALIZED",
  }),
  getExecutionResult: async () => ({
    hash: expected.genLayerTxId,
    result: value.result ?? "FINISHED_WITH_RETURN",
  }),
  getBinding: async () => ({
    hash: expected.genLayerTxId,
    recipient: value.recipient ?? judge,
    method: value.method,
  }),
  readContract: async () => actual,
});
describe("Phase 2D verification core", () => {
  it("fails closed for non-final, failed, wrong recipient and unresolved cases", async () => {
    for (const tx of [
      { status: "ACCEPTED" },
      { result: "FINISHED_WITH_ERROR" as const },
      { recipient: escrow },
      { method: "other" as const },
    ])
      await expect(
        observeFinalizedCase(client(tx), expected),
      ).rejects.toThrow();
    expect(() =>
      verifyResolvedCase(expected, { ...actual, resolved: false }),
    ).toThrow();
    expect(() =>
      verifyResolvedCase(expected, { ...actual, policyHash: h("9") }),
    ).toThrow();
  });
  it("requires two unique authorized signatures", async () => {
    const p = makeResolutionPayload(expected, actual);
    const a = privateKeyToAccount(h("1"));
    const b = privateKeyToAccount(h("2"));
    const sign = (x: typeof a) =>
      x.signTypedData({
        domain: {
          name: "ToleranceEscrow",
          version: "1",
          chainId: 1952,
          verifyingContract: escrow,
        },
        types: {
          GenLayerResolution: [
            { name: "sourceChainId", type: "uint256" },
            { name: "sourceIntelligentContract", type: "address" },
            { name: "caseId", type: "bytes32" },
            { name: "genLayerTransactionId", type: "bytes32" },
            { name: "genLayerResultHash", type: "bytes32" },
            { name: "xLayerChainId", type: "uint256" },
            { name: "xLayerEscrow", type: "address" },
            { name: "obligationId", type: "uint256" },
            { name: "agreementHash", type: "bytes32" },
            { name: "policyHash", type: "bytes32" },
            { name: "evidenceRoot", type: "bytes32" },
            { name: "disputePacketHash", type: "bytes32" },
            { name: "verdict", type: "uint8" },
            { name: "nonce", type: "uint256" },
            { name: "expiry", type: "uint256" },
          ],
        },
        primaryType: "GenLayerResolution",
        message: p,
      });
    const sa = await sign(a);
    const sb = await sign(b);
    await expect(
      collectThreshold(p, [sa], [a.address, b.address], 2, 1n),
    ).rejects.toThrow();
    await expect(
      collectThreshold(p, [sa, sa], [a.address, b.address], 2, 1n),
    ).rejects.toThrow();
    await expect(
      collectThreshold(p, [sa, sb], [a.address, b.address], 2, 1n),
    ).resolves.toBeDefined();
  });
});
