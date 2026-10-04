import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  stringToBytes,
  type Address,
  type Hex,
} from "viem";

export const TOLERANCE_RESOLVED_CASE_V1_DOMAIN = keccak256(
  stringToBytes("ToleranceResolvedCaseV1"),
);

export enum ResolvedBusinessVerdict {
  RELEASE_FULL = 0,
  REFUND_FULL = 1,
  INSUFFICIENT_EVIDENCE = 2,
}

export interface ResolvedCaseV1 {
  schemaVersion: bigint;
  caseId: Hex;
  xLayerChainId: bigint;
  xLayerEscrow: Address;
  obligationId: bigint;
  agreementHash: Hex;
  policyHash: Hex;
  evidenceRoot: Hex;
  disputePacketHash: Hex;
  verdict: ResolvedBusinessVerdict;
}

const RESULT_FIELDS = parseAbiParameters(
  "bytes32,uint256,bytes32,uint256,address,uint256,bytes32,bytes32,bytes32,bytes32,uint8",
);

export function hashResolvedCaseV1(value: ResolvedCaseV1): Hex {
  return keccak256(
    encodeAbiParameters(RESULT_FIELDS, [
      TOLERANCE_RESOLVED_CASE_V1_DOMAIN,
      value.schemaVersion,
      value.caseId,
      value.xLayerChainId,
      value.xLayerEscrow,
      value.obligationId,
      value.agreementHash,
      value.policyHash,
      value.evidenceRoot,
      value.disputePacketHash,
      value.verdict,
    ]),
  );
}

export function computeToleranceCaseId(
  xLayerChainId: bigint,
  xLayerEscrow: Address,
  obligationId: bigint,
): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("uint256,address,uint256"), [
      xLayerChainId,
      xLayerEscrow,
      obligationId,
    ]),
  );
}
