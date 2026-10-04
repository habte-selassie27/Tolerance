import "server-only";

import { chains, createClient } from "genlayer-js";
import { type Address, type Hex } from "viem";

import { protocolConfig } from "../config/protocol";
import { prisma } from "../lib/prisma";
import {
  canonicalDisputePacketJson,
  type CanonicalJson,
} from "../../genlayer/schemas/dispute-packet";
import {
  hashResolvedCaseV1,
  ResolvedBusinessVerdict,
  type ResolvedCaseV1,
} from "../../genlayer/schemas/resolved-case";
import {
  verifyResolvedCase,
  type ExpectedCase,
} from "../../packages/phase2d/core";
import { guards } from "./auth";
import {
  assertDisputeWorkflowTransition,
  DisputeWorkflowError,
} from "./dispute-workflow";
import {
  type GenLayerStatusClient,
  JsonRpcGenLayerStatusClient,
} from "./genlayer-submission";

const OBSERVER_VERSION = "1";
const HEX = /^0x[0-9a-fA-F]+$/;

export interface FinalizedJudgeStateReader {
  readCase(input: { judge: Address; caseId: Hex }): Promise<unknown>;
}

/** Uses gen_call against latest-final state only; it never reads a transaction or receipt. */
export class GenLayerFinalizedJudgeStateReader implements FinalizedJudgeStateReader {
  private readonly client = createClient({ chain: chains.studionet });

  async readCase(input: { judge: Address; caseId: Hex }) {
    return this.client.readContract({
      address: input.judge,
      functionName: "get_case",
      args: [input.caseId],
      transactionHashVariant: "latest-final" as never,
    });
  }
}

function asHex(value: unknown, field: string, expectedBytes?: number): Hex {
  if (
    typeof value !== "string" ||
    !HEX.test(value) ||
    (expectedBytes !== undefined && value.length !== 2 + expectedBytes * 2)
  )
    throw new DisputeWorkflowError(`MALFORMED_RESOLVED_CASE_${field}`);
  return value.toLowerCase() as Hex;
}

function asBigInt(value: unknown, field: string): bigint {
  try {
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "bigint"
    )
      throw new Error();
    return BigInt(value);
  } catch {
    throw new DisputeWorkflowError(`MALFORMED_RESOLVED_CASE_${field}`);
  }
}

function verdict(value: unknown) {
  if (value === "RELEASE_FULL" || value === 0)
    return ResolvedBusinessVerdict.RELEASE_FULL;
  if (value === "REFUND_FULL" || value === 1)
    return ResolvedBusinessVerdict.REFUND_FULL;
  if (value === "INSUFFICIENT_EVIDENCE" || value === 2)
    return ResolvedBusinessVerdict.INSUFFICIENT_EVIDENCE;
  throw new DisputeWorkflowError("MALFORMED_RESOLVED_CASE_VERDICT");
}

export function parseResolvedCaseV1(
  value: unknown,
): ResolvedCaseV1 & { resolved: boolean } {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw new DisputeWorkflowError("MALFORMED_FINALIZED_JUDGE_STATE");
    }
  }
  if (!raw || typeof raw !== "object")
    throw new DisputeWorkflowError("MALFORMED_FINALIZED_JUDGE_STATE");
  const item = raw as Record<string, unknown>;
  if (item.resolved !== true)
    throw new DisputeWorkflowError("JUDGE_CASE_NOT_RESOLVED");
  return {
    schemaVersion: asBigInt(item.schemaVersion, "SCHEMA_VERSION"),
    caseId: asHex(item.caseId, "CASE_ID", 32),
    xLayerChainId: asBigInt(item.xLayerChainId, "XLAYER_CHAIN"),
    xLayerEscrow: asHex(item.xLayerEscrow, "XLAYER_ESCROW", 20) as Address,
    obligationId: asBigInt(item.obligationId, "OBLIGATION_ID"),
    agreementHash: asHex(item.agreementHash, "AGREEMENT_HASH", 32),
    policyHash: asHex(item.policyHash, "POLICY_HASH", 32),
    evidenceRoot: asHex(item.evidenceRoot, "EVIDENCE_ROOT", 32),
    disputePacketHash: asHex(item.disputePacketHash, "PACKET_HASH", 32),
    verdict: verdict(item.verdict),
    resolved: true,
  };
}

function canonicalResolvedCase(value: ResolvedCaseV1 & { resolved: boolean }) {
  return canonicalDisputePacketJson({
    agreementHash: value.agreementHash,
    caseId: value.caseId,
    disputePacketHash: value.disputePacketHash,
    evidenceRoot: value.evidenceRoot,
    obligationId: Number(value.obligationId),
    policyHash: value.policyHash,
    resolved: true,
    schemaVersion: Number(value.schemaVersion),
    verdict: value.verdict,
    xLayerChainId: Number(value.xLayerChainId),
    xLayerEscrow: value.xLayerEscrow,
  } satisfies Record<string, CanonicalJson>);
}

async function loadAuthorizedWorkflow(actorId: string, workflowId: string) {
  const workflow = await prisma.adjudicationCase.findUniqueOrThrow({
    where: { id: workflowId },
    include: {
      obligation: { include: { deal: true } },
      disputePacketSnapshot: true,
      resolutionObservation: true,
    },
  });
  await guards.requireDealAccess(actorId, workflow.obligation.dealId);
  if (!workflow.disputePacketSnapshot || !workflow.submissionTxHash)
    throw new DisputeWorkflowError("GENLAYER_SUBMISSION_REQUIRED");
  if (
    workflow.workflowStatus !== "GENLAYER_SUBMITTED" &&
    workflow.workflowStatus !== "GENLAYER_FINALIZED" &&
    workflow.workflowStatus !== "ATTESTATION_BLOCKED"
  )
    throw new DisputeWorkflowError(
      "WORKFLOW_NOT_READY_FOR_RESOLUTION_OBSERVATION",
    );
  if (
    workflow.genLayerChainId !== protocolConfig.genLayer.chainId ||
    workflow.judgeAddress.toLowerCase() !==
      protocolConfig.genLayer.judge.toLowerCase()
  )
    throw new DisputeWorkflowError("GENLAYER_CONFIG_MISMATCH");
  return workflow;
}

export async function observeGenLayerResolution(
  actorId: string,
  workflowId: string,
  statusClient: GenLayerStatusClient = new JsonRpcGenLayerStatusClient(),
  reader: FinalizedJudgeStateReader = new GenLayerFinalizedJudgeStateReader(),
) {
  const workflow = await loadAuthorizedWorkflow(actorId, workflowId);
  if (workflow.resolutionObservation)
    return { observation: workflow.resolutionObservation, reused: true };
  const status = await statusClient.getTransactionStatus(
    workflow.submissionTxHash!,
  );
  const observedAt = new Date();
  if (status.status === "UNDETERMINED") {
    await prisma.adjudicationCase.update({
      where: { id: workflowId },
      data: {
        lifecycle: "UNDETERMINED",
        lastStatus: status.status,
        lastObservedAt: observedAt,
      },
    });
    throw new DisputeWorkflowError("GENLAYER_UNDETERMINED");
  }
  if (status.status !== "FINALIZED") {
    await prisma.adjudicationCase.update({
      where: { id: workflowId },
      data: { lastStatus: status.status, lastObservedAt: observedAt },
    });
    throw new DisputeWorkflowError("GENLAYER_NOT_FINALIZED");
  }
  const actual = parseResolvedCaseV1(
    await reader.readCase({
      judge: protocolConfig.genLayer.judge as Address,
      caseId: workflow.caseId as Hex,
    }),
  );
  const expected: ExpectedCase = {
    schemaVersion: 1n,
    caseId: workflow.caseId as Hex,
    xLayerChainId: BigInt(workflow.obligation.xLayerChainId),
    xLayerEscrow: workflow.obligation.xLayerEscrow as Address,
    obligationId: BigInt(workflow.obligation.xLayerObligationId),
    agreementHash: workflow.obligation.agreementHash.replace(
      "sha256:",
      "0x",
    ) as Hex,
    policyHash: workflow.obligation.policyHash.replace("sha256:", "0x") as Hex,
    evidenceRoot: workflow.obligation.evidenceRoot!.replace(
      "sha256:",
      "0x",
    ) as Hex,
    disputePacketHash: workflow.disputePacketHash as Hex,
    judge: protocolConfig.genLayer.judge as Address,
    genLayerTxId: workflow.submissionTxHash as Hex,
    expiry: 0n,
    nonce: 0n,
  };
  const resolved = verifyResolvedCase(expected, actual);
  const resultHash = hashResolvedCaseV1(resolved);
  const canonicalJson = canonicalResolvedCase(actual);
  const persisted = await prisma.$transaction(async (tx) => {
    const existing = await tx.resolutionObservation.findUnique({
      where: { adjudicationCaseId: workflowId },
    });
    if (existing) return existing;
    assertDisputeWorkflowTransition("GENLAYER_SUBMITTED", "GENLAYER_FINALIZED");
    const finalized = await tx.adjudicationCase.updateMany({
      where: {
        id: workflowId,
        workflowStatus: "GENLAYER_SUBMITTED",
        workflowVersion: workflow.workflowVersion,
      },
      data: {
        workflowStatus: "GENLAYER_FINALIZED",
        workflowVersion: { increment: 1 },
        lifecycle: "FINALIZED",
        lastStatus: "FINALIZED",
        lastObservedAt: observedAt,
      },
    });
    if (finalized.count !== 1)
      throw new DisputeWorkflowError("STALE_WORKFLOW_VERSION");
    const observation = await tx.resolutionObservation.create({
      data: {
        adjudicationCaseId: workflowId,
        genLayerTxHash: workflow.submissionTxHash!,
        caseId: resolved.caseId,
        judgeAddress: protocolConfig.genLayer.judge,
        genLayerChainId: protocolConfig.genLayer.chainId,
        disputePacketHash: resolved.disputePacketHash,
        agreementHash: resolved.agreementHash,
        policyHash: resolved.policyHash,
        evidenceRoot: resolved.evidenceRoot,
        canonicalJson,
        resultHash,
        verdict: ResolvedBusinessVerdict[resolved.verdict],
        observerVersion: OBSERVER_VERSION,
        verificationLevel: "FINALIZED_STATE_VERIFIED",
        observedAt,
      },
    });
    assertDisputeWorkflowTransition(
      "GENLAYER_FINALIZED",
      "ATTESTATION_BLOCKED",
    );
    await tx.adjudicationCase.update({
      where: { id: workflowId },
      data: {
        workflowStatus: "ATTESTATION_BLOCKED",
        workflowVersion: { increment: 1 },
        finalizedVerdict: ResolvedBusinessVerdict[resolved.verdict],
        finalizedResultHash: resultHash,
        failureCode: "ATTESTATION_INDEPENDENT_TX_PROVENANCE_UNAVAILABLE",
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId,
        organizationId: workflow.obligation.deal.organizationId,
        action: "GENLAYER_RESOLUTION_FINALIZED_STATE_VERIFIED",
        targetType: "ResolutionObservation",
        targetId: observation.id,
        metadata: { resultHash, verificationLevel: "FINALIZED_STATE_VERIFIED" },
      },
    });
    return observation;
  });
  return { observation: persisted, reused: false };
}
