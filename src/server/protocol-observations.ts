import "server-only";

import { prisma } from "../lib/prisma";
import { protocolObservationSchema } from "./validation";

/**
 * Indexed observations are idempotent caches. X Layer and GenLayer remain the
 * authorities for settlement and adjudication respectively.
 */
export async function recordProtocolObservation(input: unknown) {
  const observation = protocolObservationSchema.parse(input);
  return prisma.protocolEvent.upsert({
    where: {
      txHash_eventType: {
        txHash: observation.txHash,
        eventType: observation.eventType,
      },
    },
    create: observation,
    update: {
      observedState: observation.observedState,
      blockNumber: observation.blockNumber,
    },
  });
}

export async function recordAdjudicationObservation(input: {
  obligationId: string;
  caseId: string;
  disputePacketHash: string;
  judgeAddress: string;
  genLayerChainId: number;
  submissionTxHash?: string;
  lifecycle:
    | "SUBMITTED"
    | "PENDING"
    | "PROPOSING"
    | "COMMITTING"
    | "REVEALING"
    | "ACCEPTED"
    | "UNDETERMINED"
    | "FINALIZED"
    | "CANCELED";
  finalizedVerdict?: string;
  finalizedResultHash?: string;
}) {
  const { caseId, ...rest } = input;
  return prisma.adjudicationCase.upsert({
    where: { caseId },
    create: { caseId, ...rest },
    update: rest,
  });
}
