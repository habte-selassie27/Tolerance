import "server-only";

import { type Hex } from "viem";

import { prisma } from "../lib/prisma";
import { guards } from "./auth";
import { DisputeWorkflowError } from "./dispute-workflow";

/** A relayer transports a pre-verified payload; it never receives client-selected settlement data. */
export interface XLayerSettlementRelayer {
  execute(input: {
    canonicalPayload: string;
    signatures: readonly Hex[];
  }): Promise<{ transactionHash: Hex }>;
}

export async function requestSettlement(
  actorId: string,
  roundId: string,
  relayer: XLayerSettlementRelayer,
) {
  const round = await prisma.attestationRound.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      signatures: true,
      adjudicationCase: {
        include: { obligation: { include: { deal: true } } },
      },
      settlementExecution: true,
    },
  });
  await guards.requireDealAccess(
    actorId,
    round.adjudicationCase.obligation.dealId,
  );
  if (round.settlementExecution?.transactionHash)
    return { execution: round.settlementExecution, reused: true };
  if (round.status !== "THRESHOLD_REACHED")
    throw new DisputeWorkflowError("ATTESTATION_THRESHOLD_REQUIRED");
  if (round.expiry <= new Date())
    throw new DisputeWorkflowError("ATTESTATION_ROUND_EXPIRED");
  if (round.signatures.length < round.threshold)
    throw new DisputeWorkflowError("ATTESTATION_THRESHOLD_INVALID");
  const claimed = await prisma.$transaction(async (tx) => {
    const existing = await tx.settlementExecution.findUnique({
      where: { attestationRoundId: roundId },
    });
    if (existing) return existing;
    await tx.adjudicationCase.update({
      where: { id: round.adjudicationCaseId },
      data: {
        workflowStatus: "SETTLEMENT_PENDING",
        workflowVersion: { increment: 1 },
      },
    });
    return tx.settlementExecution.create({
      data: { attestationRoundId: roundId, status: "DISPATCHING" },
    });
  });
  if (claimed.status !== "DISPATCHING")
    return { execution: claimed, reused: true };
  try {
    const result = await relayer.execute({
      canonicalPayload: round.canonicalPayload,
      signatures: round.signatures.map((entry) => entry.signature as Hex),
    });
    const execution = await prisma.settlementExecution.update({
      where: { id: claimed.id },
      data: {
        transactionHash: result.transactionHash,
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });
    await prisma.adjudicationCase.update({
      where: { id: round.adjudicationCaseId },
      data: {
        workflowStatus: "SETTLEMENT_SUBMITTED",
        workflowVersion: { increment: 1 },
      },
    });
    return { execution, reused: false };
  } catch {
    await prisma.$transaction(async (tx) => {
      await tx.settlementExecution.update({
        where: { id: claimed.id },
        data: {
          status: "SETTLEMENT_UNKNOWN",
          failureCode: "RELAYER_POSSIBLE_SEND",
        },
      });
      await tx.adjudicationCase.update({
        where: { id: round.adjudicationCaseId },
        data: {
          workflowStatus: "SETTLEMENT_UNKNOWN",
          workflowVersion: { increment: 1 },
        },
      });
    });
    throw new DisputeWorkflowError("SETTLEMENT_POSSIBLE_SEND");
  }
}
