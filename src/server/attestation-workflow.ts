import "server-only";

import {
  hashTypedData,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";

import {
  escrowDomain,
  GENLAYER_RESOLUTION_TYPES,
  makeResolutionPayload,
} from "../../packages/phase2d/core";
import { ResolvedBusinessVerdict } from "../../genlayer/schemas/resolved-case";
import { protocolConfig } from "../config/protocol";
import { prisma } from "../lib/prisma";
import { guards } from "./auth";
import { DisputeWorkflowError } from "./dispute-workflow";

export const ATTESTATION_PAYLOAD_VERSION = "phase2d-eip712-v1";

export type ServerAttestationPolicy = {
  allowedSigners: readonly Address[];
  threshold: number;
  expirySeconds: number;
};

function normalized(address: string) {
  return address.toLowerCase();
}

function parseSigners(value: unknown): Address[] {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string")
  )
    throw new DisputeWorkflowError("MALFORMED_ATTESTATION_POLICY");
  return value.map((entry) => entry as Address);
}

async function authorizedRound(actorId: string, roundId: string) {
  const round = await prisma.attestationRound.findUniqueOrThrow({
    where: { id: roundId },
    include: {
      adjudicationCase: {
        include: { obligation: { include: { deal: true } } },
      },
      signatures: true,
    },
  });
  await guards.requireDealAccess(
    actorId,
    round.adjudicationCase.obligation.dealId,
  );
  return round;
}

function payloadFor(
  observation: {
    caseId: string;
    judgeAddress: string;
    genLayerChainId: number;
    genLayerTxHash: string;
    resultHash: string;
    disputePacketHash: string;
    agreementHash: string;
    policyHash: string;
    evidenceRoot: string;
    verdict: string;
  },
  obligationId: string,
  escrow: string,
  nonce: bigint,
  expiry: bigint,
) {
  const verdict =
    ResolvedBusinessVerdict[
      observation.verdict as keyof typeof ResolvedBusinessVerdict
    ];
  if (verdict === undefined)
    throw new DisputeWorkflowError("MALFORMED_RESOLUTION_VERDICT");
  return makeResolutionPayload(
    {
      schemaVersion: 1n,
      caseId: observation.caseId as Hex,
      xLayerChainId: BigInt(protocolConfig.xLayer.chainId),
      xLayerEscrow: escrow as Address,
      obligationId: BigInt(obligationId),
      agreementHash: observation.agreementHash as Hex,
      policyHash: observation.policyHash as Hex,
      evidenceRoot: observation.evidenceRoot as Hex,
      disputePacketHash: observation.disputePacketHash as Hex,
      judge: observation.judgeAddress as Address,
      genLayerTxId: observation.genLayerTxHash as Hex,
      expiry,
      nonce,
    },
    {
      schemaVersion: 1n,
      caseId: observation.caseId as Hex,
      xLayerChainId: BigInt(protocolConfig.xLayer.chainId),
      xLayerEscrow: escrow as Address,
      obligationId: BigInt(obligationId),
      agreementHash: observation.agreementHash as Hex,
      policyHash: observation.policyHash as Hex,
      evidenceRoot: observation.evidenceRoot as Hex,
      disputePacketHash: observation.disputePacketHash as Hex,
      verdict,
    },
  );
}

export async function createAttestationRound(
  actorId: string,
  adjudicationCaseId: string,
  policy: ServerAttestationPolicy,
) {
  if (policy.threshold !== 2 || policy.allowedSigners.length !== 3)
    throw new DisputeWorkflowError("UNSUPPORTED_ATTESTATION_POLICY");
  const workflow = await prisma.adjudicationCase.findUniqueOrThrow({
    where: { id: adjudicationCaseId },
    include: {
      obligation: { include: { deal: true } },
      resolutionObservation: true,
    },
  });
  await guards.requireDealAccess(actorId, workflow.obligation.dealId);
  const observation = workflow.resolutionObservation;
  if (!observation)
    throw new DisputeWorkflowError("RESOLUTION_OBSERVATION_REQUIRED");
  const existing = await prisma.attestationRound.findUnique({
    where: {
      resolutionObservationId_payloadVersion: {
        resolutionObservationId: observation.id,
        payloadVersion: ATTESTATION_PAYLOAD_VERSION,
      },
    },
  });
  if (existing) return { round: existing, reused: true };
  const expiry = new Date(Date.now() + policy.expirySeconds * 1000);
  const nonce = 1n;
  const payload = payloadFor(
    observation,
    workflow.obligation.xLayerObligationId,
    workflow.obligation.xLayerEscrow,
    nonce,
    BigInt(Math.floor(expiry.getTime() / 1000)),
  );
  const canonicalPayload = JSON.stringify(payload, (_, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  const digest = hashTypedData({
    domain: escrowDomain(
      BigInt(protocolConfig.xLayer.chainId),
      workflow.obligation.xLayerEscrow as Address,
    ),
    types: GENLAYER_RESOLUTION_TYPES,
    primaryType: "GenLayerResolution",
    message: payload,
  });
  const status =
    observation.verificationLevel === "ATTESTATION_ELIGIBLE"
      ? "OPEN"
      : "BLOCKED";
  const round = await prisma.attestationRound.create({
    data: {
      adjudicationCaseId,
      resolutionObservationId: observation.id,
      payloadVersion: ATTESTATION_PAYLOAD_VERSION,
      canonicalPayload,
      digest,
      nonce: nonce.toString(),
      expiry,
      threshold: policy.threshold,
      allowedSigners: policy.allowedSigners.map(normalized),
      status,
    },
  });
  if (status === "OPEN")
    await prisma.adjudicationCase.update({
      where: { id: adjudicationCaseId },
      data: {
        workflowStatus: "ATTESTATION_PENDING",
        workflowVersion: { increment: 1 },
      },
    });
  return { round, reused: false };
}

export async function submitAttestationSignature(
  actorId: string,
  roundId: string,
  signature: Hex,
) {
  const round = await authorizedRound(actorId, roundId);
  if (round.status !== "OPEN")
    throw new DisputeWorkflowError("ATTESTATION_ROUND_NOT_OPEN");
  if (round.expiry <= new Date())
    throw new DisputeWorkflowError("ATTESTATION_ROUND_EXPIRED");
  const payload = JSON.parse(
    round.canonicalPayload,
    (_, value) => value,
  ) as Record<string, unknown>;
  const asBigInt = (field: string) => BigInt(String(payload[field]));
  const message = {
    ...payload,
    sourceChainId: asBigInt("sourceChainId"),
    genLayerTransactionId: payload.genLayerTransactionId as Hex,
    genLayerResultHash: payload.genLayerResultHash as Hex,
    xLayerChainId: asBigInt("xLayerChainId"),
    obligationId: asBigInt("obligationId"),
    nonce: asBigInt("nonce"),
    expiry: asBigInt("expiry"),
    verdict: Number(payload.verdict),
  } as ReturnType<typeof makeResolutionPayload>;
  const signer = normalized(
    await recoverTypedDataAddress({
      domain: escrowDomain(
        BigInt(protocolConfig.xLayer.chainId),
        message.xLayerEscrow,
      ),
      types: GENLAYER_RESOLUTION_TYPES,
      primaryType: "GenLayerResolution",
      message,
      signature,
    }),
  );
  if (!parseSigners(round.allowedSigners).map(normalized).includes(signer))
    throw new DisputeWorkflowError("UNAUTHORIZED_ATTESTOR");
  const saved = await prisma.$transaction(async (tx) => {
    await tx.attestationSignature.create({
      data: { roundId, signer, signature },
    });
    const count = await tx.attestationSignature.count({ where: { roundId } });
    if (count >= round.threshold) {
      await tx.adjudicationCase.update({
        where: { id: round.adjudicationCaseId },
        data: {
          workflowStatus: "ATTESTATION_READY",
          workflowVersion: { increment: 1 },
        },
      });
      return tx.attestationRound.update({
        where: { id: roundId },
        data: { status: "THRESHOLD_REACHED", completedAt: new Date() },
      });
    }
    return tx.attestationRound.findUniqueOrThrow({ where: { id: roundId } });
  });
  return saved;
}
