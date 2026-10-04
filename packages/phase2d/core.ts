import {
  hashTypedData,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import {
  computeToleranceCaseId,
  hashResolvedCaseV1,
  ResolvedBusinessVerdict,
  type ResolvedCaseV1,
} from "../../genlayer/schemas/resolved-case";

export const STUDIONET_CHAIN_ID = 61999;
export const XLAYER_TESTNET_CHAIN_ID = 1952n;
export const GENLAYER_RESOLUTION_TYPES = {
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
} as const;

export type ExpectedCase = Omit<ResolvedCaseV1, "verdict"> & {
  judge: Address;
  genLayerTxId: Hex;
  expiry: bigint;
  nonce: bigint;
};
/** Deliberately narrow, provider-sanitized DTOs. Never pass a generic GenLayer transaction onward. */
export type SafeTransactionStatus = { hash: Hex; status: string };
export type SafeExecutionResult = {
  hash: Hex;
  result: "FINISHED_WITH_RETURN" | "FINISHED_WITH_ERROR";
};
export type SafeTransactionBinding = {
  hash: Hex;
  recipient: Address;
  method?: string;
};
export type ObservedCase = ResolvedCaseV1 & { resolved: boolean };
export type FinalityClient = {
  getStatus(args: { hash: Hex }): Promise<SafeTransactionStatus>;
  getExecutionResult(args: { hash: Hex }): Promise<SafeExecutionResult>;
  getBinding(args: { hash: Hex }): Promise<SafeTransactionBinding>;
  readContract(args: {
    address: Address;
    functionName: string;
    args: unknown[];
    transactionHashVariant: "LATEST_FINAL";
  }): Promise<unknown>;
};

export function verifyResolvedCase(
  expected: ExpectedCase,
  actual: ObservedCase,
): ResolvedCaseV1 {
  if (
    !actual.resolved ||
    actual.verdict > ResolvedBusinessVerdict.INSUFFICIENT_EVIDENCE
  )
    throw new Error("unresolved or unsupported Tolerance case");
  const expectedCaseId = computeToleranceCaseId(
    expected.xLayerChainId,
    expected.xLayerEscrow,
    expected.obligationId,
  );
  for (const key of [
    "schemaVersion",
    "caseId",
    "xLayerChainId",
    "xLayerEscrow",
    "obligationId",
    "agreementHash",
    "policyHash",
    "evidenceRoot",
    "disputePacketHash",
  ] as const) {
    if (
      actual[key].toString().toLowerCase() !==
      (key === "caseId" ? expectedCaseId : expected[key])
        .toString()
        .toLowerCase()
    )
      throw new Error(`resolved case ${key} mismatch`);
  }
  return actual;
}

export async function observeFinalizedCase(
  client: FinalityClient,
  expected: ExpectedCase,
): Promise<ResolvedCaseV1> {
  const status = await client.getStatus({ hash: expected.genLayerTxId });
  if (status.hash !== expected.genLayerTxId || status.status !== "FINALIZED")
    throw new Error("GenLayer transaction is not FINALIZED");
  const execution = await client.getExecutionResult({
    hash: expected.genLayerTxId,
  });
  if (
    execution.hash !== expected.genLayerTxId ||
    execution.result !== "FINISHED_WITH_RETURN"
  )
    throw new Error("GenLayer execution did not return successfully");
  const binding = await client.getBinding({ hash: expected.genLayerTxId });
  if (
    binding.hash !== expected.genLayerTxId ||
    binding.recipient.toLowerCase() !== expected.judge.toLowerCase()
  )
    throw new Error("unexpected GenLayer judge recipient");
  if (binding.method !== undefined && binding.method !== "submit_case")
    throw new Error("unexpected GenLayer method");
  const value = await client.readContract({
    address: expected.judge,
    functionName: "get_case",
    args: [
      computeToleranceCaseId(
        expected.xLayerChainId,
        expected.xLayerEscrow,
        expected.obligationId,
      ),
    ],
    transactionHashVariant: "LATEST_FINAL",
  });
  return verifyResolvedCase(expected, value as ObservedCase);
}

export function makeResolutionPayload(
  expected: ExpectedCase,
  resolved: ResolvedCaseV1,
) {
  const resultHash = hashResolvedCaseV1(resolved);
  return {
    sourceChainId: BigInt(STUDIONET_CHAIN_ID),
    sourceIntelligentContract: expected.judge,
    caseId: resolved.caseId,
    genLayerTransactionId: expected.genLayerTxId,
    genLayerResultHash: resultHash,
    xLayerChainId: expected.xLayerChainId,
    xLayerEscrow: expected.xLayerEscrow,
    obligationId: expected.obligationId,
    agreementHash: expected.agreementHash,
    policyHash: expected.policyHash,
    evidenceRoot: expected.evidenceRoot,
    disputePacketHash: expected.disputePacketHash,
    verdict: resolved.verdict,
    nonce: expected.nonce,
    expiry: expected.expiry,
  } as const;
}
export const escrowDomain = (chainId: bigint, verifyingContract: Address) =>
  ({
    name: "ToleranceEscrow",
    version: "1",
    chainId,
    verifyingContract,
  }) as const;
export async function verifyThenSign(
  account: {
    address: Address;
    signTypedData(args: {
      domain: ReturnType<typeof escrowDomain>;
      types: typeof GENLAYER_RESOLUTION_TYPES;
      primaryType: "GenLayerResolution";
      message: ReturnType<typeof makeResolutionPayload>;
    }): Promise<Hex>;
  },
  client: FinalityClient,
  expected: ExpectedCase,
) {
  const resolved = await observeFinalizedCase(client, expected);
  const payload = makeResolutionPayload(expected, resolved);
  return {
    payload,
    signature: await account.signTypedData({
      domain: escrowDomain(expected.xLayerChainId, expected.xLayerEscrow),
      types: GENLAYER_RESOLUTION_TYPES,
      primaryType: "GenLayerResolution",
      message: payload,
    }),
  };
}
export async function collectThreshold(
  payload: ReturnType<typeof makeResolutionPayload>,
  signatures: readonly Hex[],
  allowed: readonly Address[],
  threshold: number,
  now: bigint,
) {
  if (payload.expiry < now) throw new Error("expired attestation");
  const seen = new Set<string>();
  for (const signature of signatures) {
    const signer = await recoverTypedDataAddress({
      domain: escrowDomain(payload.xLayerChainId, payload.xLayerEscrow),
      types: GENLAYER_RESOLUTION_TYPES,
      primaryType: "GenLayerResolution",
      message: payload,
      signature,
    });
    if (!allowed.map((a) => a.toLowerCase()).includes(signer.toLowerCase()))
      throw new Error("unauthorized attestor");
    if (seen.has(signer.toLowerCase())) throw new Error("duplicate attestor");
    seen.add(signer.toLowerCase());
  }
  if (seen.size < threshold) throw new Error("insufficient attestors");
  return {
    payload,
    signatures: [...signatures],
    digest: hashTypedData({
      domain: escrowDomain(payload.xLayerChainId, payload.xLayerEscrow),
      types: GENLAYER_RESOLUTION_TYPES,
      primaryType: "GenLayerResolution",
      message: payload,
    }),
  };
}
