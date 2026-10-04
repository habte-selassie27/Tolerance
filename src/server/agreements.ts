import "server-only";

import type { ProtocolVersion } from "@prisma/client";

import {
  assertDeployedProtocol,
  deploymentForProtocol,
} from "../config/protocol";
import { prisma } from "../lib/prisma";

/** Approved commercial terms are append-only; a new version supersedes them. */
export function assertAgreementIsMutable(
  status: "DRAFT" | "APPROVED" | "SUPERSEDED",
) {
  if (status !== "DRAFT") {
    throw new Error("Agreement versions are immutable after approval.");
  }
}

export async function approveAgreementVersion(agreementId: string) {
  const agreement = await prisma.agreement.findUniqueOrThrow({
    where: { id: agreementId },
  });
  assertAgreementIsMutable(agreement.status);
  return prisma.agreement.update({
    where: { id: agreementId },
    data: { status: "APPROVED", effectiveAt: new Date() },
  });
}

export class ProtocolVersionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function protocolVersionForObligation(input: {
  protocolVersion: ProtocolVersion;
  packetVersion: number;
  xLayerChainId: number;
  xLayerEscrow: string;
  genLayerJudge: string | null;
}) {
  const deployment = deploymentForProtocol(input.protocolVersion);
  if (input.packetVersion !== deployment.packetVersion)
    throw new ProtocolVersionError("PACKET_VERSION_PROTOCOL_MISMATCH");
  if (input.protocolVersion === "V2" && !deployment.deployed)
    throw new ProtocolVersionError("PROTOCOL_V2_NOT_DEPLOYED");
  if (!deployment.xLayer.escrow || !deployment.genLayer.judge)
    throw new ProtocolVersionError("PROTOCOL_DEPLOYMENT_INCOMPLETE");
  if (
    input.xLayerChainId !== deployment.xLayer.chainId ||
    input.xLayerEscrow.toLowerCase() !== deployment.xLayer.escrow.toLowerCase()
  )
    throw new ProtocolVersionError("XLAYER_PROTOCOL_VERSION_MISMATCH");
  if (
    !input.genLayerJudge ||
    input.genLayerJudge.toLowerCase() !==
      deployment.genLayer.judge.toLowerCase()
  )
    throw new ProtocolVersionError("GENLAYER_PROTOCOL_VERSION_MISMATCH");
  return deployment;
}

/** Safe submission routing: V2 cannot silently fall back to the V1 judge. */
export function judgeForSubmission(version: ProtocolVersion): string {
  try {
    return assertDeployedProtocol(version).genLayer.judge!;
  } catch {
    throw new ProtocolVersionError(`PROTOCOL_${version}_NOT_DEPLOYED`);
  }
}
