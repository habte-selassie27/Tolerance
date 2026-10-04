import "server-only";

import { Prisma, type DisputeWorkflowStatus } from "@prisma/client";
import {
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
} from "viem";

import { protocolConfig } from "../config/protocol";
import { prisma } from "../lib/prisma";
import { xLayerTestnet } from "../../packages/phase2d/xlayer";
import { guards } from "./auth";
import { buildDisputePacketV1 } from "./dispute-packet";
import { assertDecisiveEvidenceAuthority } from "./evidence-authority";

export const DISPUTE_WORKFLOW_STATES = [
  "PACKET_READY",
  "XLAYER_BINDING_PENDING",
  "XLAYER_DISPUTE_CONFIRMED",
  "GENLAYER_SUBMISSION_PENDING",
  "GENLAYER_SUBMITTED",
  "GENLAYER_FINALIZED",
  "ATTESTATION_BLOCKED",
  "ATTESTATION_PENDING",
  "ATTESTATION_READY",
  "SETTLEMENT_PENDING",
  "SETTLEMENT_SUBMITTED",
  "SETTLED",
  "REFUNDED",
  "SETTLEMENT_UNKNOWN",
  "GENLAYER_SUBMISSION_UNKNOWN",
  "REVIEW_REQUIRED",
] as const satisfies readonly DisputeWorkflowStatus[];

const ALLOWED_TRANSITIONS = new Map<
  DisputeWorkflowStatus,
  readonly DisputeWorkflowStatus[]
>([
  ["PACKET_READY", ["XLAYER_BINDING_PENDING"]],
  ["XLAYER_BINDING_PENDING", ["XLAYER_DISPUTE_CONFIRMED"]],
  ["XLAYER_DISPUTE_CONFIRMED", ["GENLAYER_SUBMISSION_PENDING"]],
  [
    "GENLAYER_SUBMISSION_PENDING",
    ["GENLAYER_SUBMITTED", "GENLAYER_SUBMISSION_UNKNOWN"],
  ],
  ["GENLAYER_SUBMITTED", ["GENLAYER_FINALIZED"]],
  ["GENLAYER_FINALIZED", ["ATTESTATION_BLOCKED"]],
  ["ATTESTATION_BLOCKED", []],
  ["ATTESTATION_PENDING", ["ATTESTATION_READY", "ATTESTATION_BLOCKED"]],
  ["ATTESTATION_READY", ["SETTLEMENT_PENDING"]],
  ["SETTLEMENT_PENDING", ["SETTLEMENT_SUBMITTED", "SETTLEMENT_UNKNOWN"]],
  ["SETTLEMENT_SUBMITTED", ["SETTLED", "REFUNDED", "REVIEW_REQUIRED"]],
  ["SETTLED", []],
  ["REFUNDED", []],
  ["SETTLEMENT_UNKNOWN", ["REVIEW_REQUIRED"]],
  ["GENLAYER_SUBMISSION_UNKNOWN", ["REVIEW_REQUIRED"]],
  ["REVIEW_REQUIRED", []],
]);

const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;

export class DisputeWorkflowError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const COMMERCIAL_OBLIGATION_ESCROW_DISPUTE_ABI = [
  {
    type: "function",
    name: "enterDispute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "obligationId", type: "uint256" },
      { name: "disputePacketHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getObligation",
    stateMutability: "view",
    inputs: [{ name: "obligationId", type: "uint256" }],
    outputs: [
      {
        name: "obligation",
        type: "tuple",
        components: [
          { name: "buyer", type: "address" },
          { name: "supplier", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "agreementHash", type: "bytes32" },
          { name: "policyHash", type: "bytes32" },
          { name: "challengeDuration", type: "uint64" },
          { name: "evidenceSubmissionWindow", type: "uint64" },
          { name: "fundedAt", type: "uint64" },
          { name: "challengeDeadline", type: "uint64" },
          { name: "evidenceRoot", type: "bytes32" },
          { name: "disputePacketHash", type: "bytes32" },
          { name: "proposedOutcome", type: "uint8" },
          { name: "state", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "DisputeEntered",
    anonymous: false,
    inputs: [
      { name: "obligationId", type: "uint256", indexed: true },
      { name: "initiator", type: "address", indexed: true },
      { name: "disputePacketHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

export type XLayerDisputeObservation = {
  chainId: number;
  transactionHash: Hex;
  finalized: boolean;
  succeeded: boolean;
  to: Address;
  functionName: string;
  obligationId: bigint;
  disputePacketHash: Hex;
  event: {
    address: Address;
    eventName: "DisputeEntered";
    obligationId: bigint;
    initiator: Address;
    disputePacketHash: Hex;
  } | null;
  obligationState: number;
  onchainDisputePacketHash: Hex;
  blockNumber: bigint;
};

export type ExpectedXLayerDisputeBinding = {
  chainId: number;
  escrow: Address;
  obligationId: bigint;
  disputePacketHash: Hex;
  buyer: Address;
  supplier: Address;
};

export interface XLayerDisputeVerifier {
  observe(transactionHash: Hex): Promise<XLayerDisputeObservation>;
}

export function assertDisputeWorkflowTransition(
  from: DisputeWorkflowStatus,
  to: DisputeWorkflowStatus,
) {
  if (!ALLOWED_TRANSITIONS.get(from)?.includes(to))
    throw new DisputeWorkflowError("ILLEGAL_WORKFLOW_TRANSITION");
  return true;
}

export function validateXLayerDisputeObservation(
  expected: ExpectedXLayerDisputeBinding,
  observed: XLayerDisputeObservation,
) {
  if (observed.chainId !== expected.chainId)
    throw new DisputeWorkflowError("WRONG_XLAYER_CHAIN");
  if (!observed.finalized)
    throw new DisputeWorkflowError("XLAYER_TRANSACTION_NOT_FINALIZED");
  if (!observed.succeeded)
    throw new DisputeWorkflowError("XLAYER_TRANSACTION_FAILED");
  if (observed.to.toLowerCase() !== expected.escrow.toLowerCase())
    throw new DisputeWorkflowError("WRONG_XLAYER_ESCROW");
  if (observed.functionName !== "enterDispute")
    throw new DisputeWorkflowError("WRONG_XLAYER_METHOD");
  if (observed.obligationId !== expected.obligationId)
    throw new DisputeWorkflowError("WRONG_XLAYER_OBLIGATION");
  if (
    observed.disputePacketHash.toLowerCase() !==
    expected.disputePacketHash.toLowerCase()
  )
    throw new DisputeWorkflowError("WRONG_XLAYER_PACKET_HASH");
  if (
    !observed.event ||
    observed.event.address.toLowerCase() !== expected.escrow.toLowerCase() ||
    observed.event.eventName !== "DisputeEntered" ||
    observed.event.obligationId !== expected.obligationId ||
    observed.event.disputePacketHash.toLowerCase() !==
      expected.disputePacketHash.toLowerCase()
  )
    throw new DisputeWorkflowError("DISPUTE_ENTERED_EVENT_MISMATCH");
  if (
    observed.event.initiator.toLowerCase() !== expected.buyer.toLowerCase() &&
    observed.event.initiator.toLowerCase() !== expected.supplier.toLowerCase()
  )
    throw new DisputeWorkflowError("DISPUTE_INITIATOR_NOT_PARTY");
  if (observed.obligationState !== 5)
    throw new DisputeWorkflowError("XLAYER_OBLIGATION_NOT_DISPUTED");
  if (
    observed.onchainDisputePacketHash.toLowerCase() !==
    expected.disputePacketHash.toLowerCase()
  )
    throw new DisputeWorkflowError("XLAYER_STATE_PACKET_HASH_MISMATCH");
  return true;
}

export class ViemXLayerDisputeVerifier implements XLayerDisputeVerifier {
  private readonly client = createPublicClient({
    chain: xLayerTestnet,
    transport: http(process.env.XLAYER_RPC_URL),
  });

  async observe(transactionHash: Hex): Promise<XLayerDisputeObservation> {
    if (!TRANSACTION_HASH.test(transactionHash))
      throw new DisputeWorkflowError("MALFORMED_XLAYER_TRANSACTION_HASH");
    const [chainId, transaction, receipt, finalizedBlock] = await Promise.all([
      this.client.getChainId(),
      this.client.getTransaction({ hash: transactionHash }),
      this.client.getTransactionReceipt({ hash: transactionHash }),
      this.client.getBlock({ blockTag: "finalized" }),
    ]);
    const decoded = decodeFunctionData({
      abi: COMMERCIAL_OBLIGATION_ESCROW_DISPUTE_ABI,
      data: transaction.input,
    });
    if (decoded.functionName !== "enterDispute")
      throw new DisputeWorkflowError("WRONG_XLAYER_METHOD");
    const [obligationId, disputePacketHash] = decoded.args;
    const disputeEvent = receipt.logs
      .filter(
        (log) =>
          log.address.toLowerCase() ===
          protocolConfig.xLayer.escrow.toLowerCase(),
      )
      .map((log) => {
        try {
          return decodeEventLog({
            abi: COMMERCIAL_OBLIGATION_ESCROW_DISPUTE_ABI,
            eventName: "DisputeEntered",
            data: log.data,
            topics: log.topics,
            strict: true,
          });
        } catch {
          return null;
        }
      })
      .find((event) => event?.eventName === "DisputeEntered");
    const isFinalized = receipt.blockNumber <= finalizedBlock.number;
    if (!isFinalized) {
      return {
        chainId,
        transactionHash,
        finalized: false,
        succeeded: receipt.status === "success",
        to:
          transaction.to ??
          ("0x0000000000000000000000000000000000000000" as Address),
        functionName: decoded.functionName,
        obligationId,
        disputePacketHash,
        event: null,
        obligationState: -1,
        onchainDisputePacketHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        blockNumber: receipt.blockNumber,
      };
    }
    const onchain = await this.client.readContract({
      address: protocolConfig.xLayer.escrow as Address,
      abi: COMMERCIAL_OBLIGATION_ESCROW_DISPUTE_ABI,
      functionName: "getObligation",
      args: [obligationId],
      blockNumber: finalizedBlock.number,
    });
    return {
      chainId,
      transactionHash,
      finalized: true,
      succeeded: receipt.status === "success",
      to:
        transaction.to ??
        ("0x0000000000000000000000000000000000000000" as Address),
      functionName: decoded.functionName,
      obligationId,
      disputePacketHash,
      event: disputeEvent
        ? {
            address: protocolConfig.xLayer.escrow as Address,
            eventName: "DisputeEntered",
            obligationId: disputeEvent.args.obligationId,
            initiator: disputeEvent.args.initiator,
            disputePacketHash: disputeEvent.args.disputePacketHash,
          }
        : null,
      obligationState: Number(onchain.state),
      onchainDisputePacketHash: onchain.disputePacketHash,
      blockNumber: receipt.blockNumber,
    };
  }
}

async function loadAuthorizedWorkflow(actorId: string, workflowId: string) {
  const workflow = await prisma.adjudicationCase.findUniqueOrThrow({
    where: { id: workflowId },
    include: {
      disputePacketSnapshot: true,
      obligation: { include: { deal: true } },
    },
  });
  await guards.requireDealAccess(actorId, workflow.obligation.dealId);
  if (!workflow.workflowStatus || !workflow.disputePacketSnapshot)
    throw new DisputeWorkflowError("NOT_A_PHASE3C1_WORKFLOW");
  if (
    workflow.disputePacketSnapshot.obligationId !== workflow.obligationId ||
    workflow.disputePacketSnapshot.disputePacketHash !==
      workflow.disputePacketHash
  )
    throw new DisputeWorkflowError("STALE_PACKET_WORKFLOW");
  return workflow;
}

function preparedTransaction(
  workflow: Awaited<ReturnType<typeof loadAuthorizedWorkflow>>,
) {
  const obligationId = BigInt(workflow.obligation.xLayerObligationId);
  const disputePacketHash = workflow.disputePacketHash as Hex;
  return buildUnsignedXLayerEnterDisputeTransaction({
    obligationId,
    disputePacketHash,
  });
}

export function buildUnsignedXLayerEnterDisputeTransaction(input: {
  obligationId: bigint;
  disputePacketHash: Hex;
}) {
  return {
    chainId: protocolConfig.xLayer.chainId,
    to: protocolConfig.xLayer.escrow as Address,
    method: "enterDispute" as const,
    data: encodeFunctionData({
      abi: COMMERCIAL_OBLIGATION_ESCROW_DISPUTE_ABI,
      functionName: "enterDispute",
      args: [input.obligationId, input.disputePacketHash],
    }),
    value: 0n,
    obligationId: input.obligationId,
    disputePacketHash: input.disputePacketHash,
  };
}

export async function createDisputeWorkflow(
  actorId: string,
  obligationId: string,
) {
  const packet = await buildDisputePacketV1(actorId, obligationId);
  // Packet integrity is not factual authority. Do not let a unilateral upload
  // enter the contested commercial path as decisive evidence.
  await assertDecisiveEvidenceAuthority(
    obligationId,
    packet.evaluation as Parameters<typeof assertDecisiveEvidenceAuthority>[1],
  );
  const existing = await prisma.adjudicationCase.findUnique({
    where: { caseId: packet.packet.caseId },
  });
  if (existing) {
    if (
      existing.obligationId === obligationId &&
      existing.disputePacketSnapshotId === packet.snapshot.id &&
      existing.disputePacketHash === packet.disputePacketHash &&
      existing.workflowStatus
    )
      return { workflow: existing, reused: true };
    throw new DisputeWorkflowError("CASE_ALREADY_BOUND");
  }
  const obligation = await prisma.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    include: { deal: true },
  });
  try {
    const workflow = await prisma.$transaction(async (tx) => {
      const created = await tx.adjudicationCase.create({
        data: {
          obligationId,
          disputePacketSnapshotId: packet.snapshot.id,
          requestedById: actorId,
          caseId: packet.packet.caseId,
          disputePacketHash: packet.disputePacketHash,
          judgeAddress: protocolConfig.genLayer.judge,
          genLayerChainId: protocolConfig.genLayer.chainId,
          lifecycle: null,
          workflowStatus: "PACKET_READY",
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          organizationId: obligation.deal.organizationId,
          action: "DISPUTE_WORKFLOW_CREATED",
          targetType: "AdjudicationCase",
          targetId: created.id,
          metadata: { disputePacketSnapshotId: packet.snapshot.id },
        },
      });
      return created;
    });
    return { workflow, reused: false };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.adjudicationCase.findUnique({
        where: { caseId: packet.packet.caseId },
      });
      if (
        raced?.obligationId === obligationId &&
        raced.disputePacketSnapshotId === packet.snapshot.id &&
        raced.disputePacketHash === packet.disputePacketHash &&
        raced.workflowStatus
      )
        return { workflow: raced, reused: true };
    }
    throw error;
  }
}

export async function prepareXLayerEnterDispute(
  actorId: string,
  workflowId: string,
  expectedVersion: number,
) {
  const workflow = await loadAuthorizedWorkflow(actorId, workflowId);
  assertDisputeWorkflowTransition(
    workflow.workflowStatus!,
    "XLAYER_BINDING_PENDING",
  );
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.adjudicationCase.updateMany({
      where: {
        id: workflowId,
        workflowStatus: "PACKET_READY",
        workflowVersion: expectedVersion,
      },
      data: {
        workflowStatus: "XLAYER_BINDING_PENDING",
        workflowVersion: { increment: 1 },
        failureCode: null,
        nextAttemptAt: null,
      },
    });
    if (result.count !== 1)
      throw new DisputeWorkflowError("STALE_WORKFLOW_VERSION");
    const row = await tx.adjudicationCase.findUniqueOrThrow({
      where: { id: workflowId },
    });
    await tx.auditEvent.create({
      data: {
        actorId,
        organizationId: workflow.obligation.deal.organizationId,
        action: "XLAYER_DISPUTE_PREPARED",
        targetType: "AdjudicationCase",
        targetId: workflowId,
        metadata: { workflowVersion: row.workflowVersion },
      },
    });
    return row;
  });
  return { workflow: updated, transaction: preparedTransaction(workflow) };
}

export async function confirmXLayerDisputeBinding(
  actorId: string,
  workflowId: string,
  transactionHash: string,
  verifier: XLayerDisputeVerifier = new ViemXLayerDisputeVerifier(),
) {
  if (!TRANSACTION_HASH.test(transactionHash))
    throw new DisputeWorkflowError("MALFORMED_XLAYER_TRANSACTION_HASH");
  const workflow = await loadAuthorizedWorkflow(actorId, workflowId);
  if (
    workflow.workflowStatus === "XLAYER_DISPUTE_CONFIRMED" &&
    workflow.xLayerDisputeTxHash?.toLowerCase() ===
      transactionHash.toLowerCase()
  )
    return { workflow, reused: true };
  assertDisputeWorkflowTransition(
    workflow.workflowStatus!,
    "XLAYER_DISPUTE_CONFIRMED",
  );
  const expected: ExpectedXLayerDisputeBinding = {
    chainId: workflow.obligation.xLayerChainId,
    escrow: workflow.obligation.xLayerEscrow as Address,
    obligationId: BigInt(workflow.obligation.xLayerObligationId),
    disputePacketHash: workflow.disputePacketHash as Hex,
    buyer: workflow.obligation.buyerWallet as Address,
    supplier: workflow.obligation.supplierWallet as Address,
  };
  let observed: XLayerDisputeObservation;
  try {
    observed = await verifier.observe(transactionHash as Hex);
    validateXLayerDisputeObservation(expected, observed);
  } catch (error) {
    const failureCode =
      error instanceof DisputeWorkflowError
        ? error.code
        : "XLAYER_OBSERVATION_FAILED";
    const observedAt = new Date();
    await prisma.$transaction(async (tx) => {
      const rejected = await tx.adjudicationCase.updateMany({
        where: {
          id: workflowId,
          workflowStatus: "XLAYER_BINDING_PENDING",
          workflowVersion: workflow.workflowVersion,
        },
        data: { failureCode, lastObservedAt: observedAt },
      });
      if (rejected.count === 1)
        await tx.auditEvent.create({
          data: {
            actorId,
            organizationId: workflow.obligation.deal.organizationId,
            action: "XLAYER_DISPUTE_CONFIRMATION_REJECTED",
            targetType: "AdjudicationCase",
            targetId: workflowId,
            metadata: { failureCode },
          },
        });
    });
    throw error;
  }
  const confirmedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.adjudicationCase.updateMany({
      where: {
        id: workflowId,
        workflowStatus: "XLAYER_BINDING_PENDING",
        workflowVersion: workflow.workflowVersion,
      },
      data: {
        workflowStatus: "XLAYER_DISPUTE_CONFIRMED",
        workflowVersion: { increment: 1 },
        xLayerDisputeTxHash: transactionHash.toLowerCase(),
        xLayerDisputeConfirmedAt: confirmedAt,
        lastObservedAt: confirmedAt,
        failureCode: null,
        nextAttemptAt: null,
      },
    });
    if (result.count !== 1)
      throw new DisputeWorkflowError("STALE_WORKFLOW_VERSION");
    await tx.obligation.update({
      where: { id: workflow.obligationId },
      data: {
        localStatus: "DISPUTED",
        disputePacketHash: workflow.disputePacketHash,
        observedOnchainState: "DISPUTED",
      },
    });
    await tx.protocolEvent.upsert({
      where: {
        txHash_eventType: {
          txHash: transactionHash.toLowerCase(),
          eventType: "DISPUTE_ENTERED",
        },
      },
      create: {
        obligationId: workflow.obligationId,
        txHash: transactionHash.toLowerCase(),
        eventType: "DISPUTE_ENTERED",
        observedState: "DISPUTED",
        blockNumber: observed.blockNumber,
      },
      update: {
        observedState: "DISPUTED",
        blockNumber: observed.blockNumber,
      },
    });
    const row = await tx.adjudicationCase.findUniqueOrThrow({
      where: { id: workflowId },
    });
    await tx.auditEvent.create({
      data: {
        actorId,
        organizationId: workflow.obligation.deal.organizationId,
        action: "XLAYER_DISPUTE_CONFIRMED",
        targetType: "AdjudicationCase",
        targetId: workflowId,
        metadata: {
          transactionHash: transactionHash.toLowerCase(),
          blockNumber: observed.blockNumber.toString(),
        },
      },
    });
    return row;
  });
  return { workflow: updated, reused: false };
}
