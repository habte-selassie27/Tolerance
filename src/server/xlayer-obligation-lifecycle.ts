import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  createPublicClient,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  parseAbi,
  padHex,
  numberToHex,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { protocolConfig } from "../config/protocol";
import { prisma } from "../lib/prisma";
import { xLayerTestnet } from "../../packages/phase2d/xlayer";
import { guards } from "./auth";
import { EVALUATION_POLICY_V1 } from "./evaluation-context";
import { computeToleranceCaseId } from "../../genlayer/schemas/resolved-case";
import { freezeEvidenceSourcePoliciesForObligation } from "./evidence-authority";

export const OBLIGATION_LIFECYCLE_ABI = parseAbi([
  "function createObligation(uint256 obligationId,address supplier,uint256 amount,bytes32 agreementHash,bytes32 policyHash,uint64 challengeDuration,uint64 evidenceWindow)",
  "function acceptObligation(uint256 obligationId)",
  "function fund(uint256 obligationId)",
  "function commitEvidence(uint256 obligationId,bytes32 evidenceRoot)",
  "function refundForEvidenceTimeout(uint256 obligationId)",
  "function challenge(uint256 obligationId,bytes32 challengeReferenceHash)",
  "function finalizeFastOutcome(uint256 obligationId)",
  "function getObligation(uint256 obligationId) view returns ((address buyer,address supplier,uint256 amount,bytes32 agreementHash,bytes32 policyHash,uint64 challengeDuration,uint64 evidenceSubmissionWindow,uint64 fundedAt,uint64 challengeDeadline,bytes32 evidenceRoot,bytes32 disputePacketHash,uint8 proposedOutcome,uint8 state) obligation)",
]);

export const ERC20_APPROVAL_ABI = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
]);

export type CommercialAction =
  | "CREATE_OBLIGATION"
  | "ACCEPT_OBLIGATION"
  | "APPROVE_TOKEN"
  | "FUND_OBLIGATION"
  | "COMMIT_EVIDENCE"
  | "CHALLENGE_OUTCOME"
  | "FINALIZE_UNCONTESTED"
  | "REFUND_EVIDENCE_TIMEOUT";

const stateByAction: Record<
  CommercialAction,
  { from: number | null; expected: string }
> = {
  CREATE_OBLIGATION: { from: null, expected: "CREATED" },
  ACCEPT_OBLIGATION: { from: 0, expected: "ACCEPTED" },
  APPROVE_TOKEN: { from: 1, expected: "ACCEPTED" },
  FUND_OBLIGATION: { from: 1, expected: "FUNDED" },
  COMMIT_EVIDENCE: { from: 2, expected: "EVIDENCE_COMMITTED" },
  CHALLENGE_OUTCOME: { from: 4, expected: "DISPUTED" },
  FINALIZE_UNCONTESTED: { from: 4, expected: "TERMINAL" },
  REFUND_EVIDENCE_TIMEOUT: { from: 2, expected: "REFUNDED" },
};

export class CommercialLifecycleError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
  }
}

export function validateCommercialTransactionBinding(
  expected: {
    chainId: number;
    contract: string;
    method: string;
    calldataHash: string;
    wallet: string | null;
    acceptedStates: number[];
  },
  observed: {
    chainId: number;
    finalized: boolean;
    succeeded: boolean;
    contract: string;
    method: string;
    calldataHash: string;
    wallet: string;
    eventMatched: boolean;
    state: number;
  },
) {
  if (observed.chainId !== expected.chainId)
    throw new CommercialLifecycleError("WRONG_CHAIN");
  if (!observed.finalized)
    throw new CommercialLifecycleError("TRANSACTION_NOT_FINALIZED");
  if (!observed.succeeded)
    throw new CommercialLifecycleError("TRANSACTION_FAILED");
  if (observed.contract.toLowerCase() !== expected.contract.toLowerCase())
    throw new CommercialLifecycleError("WRONG_CONTRACT");
  if (observed.method !== expected.method)
    throw new CommercialLifecycleError("WRONG_FUNCTION");
  if (
    observed.calldataHash.toLowerCase() !== expected.calldataHash.toLowerCase()
  )
    throw new CommercialLifecycleError("CALLDATA_MISMATCH");
  if (
    expected.wallet &&
    observed.wallet.toLowerCase() !== expected.wallet.toLowerCase()
  )
    throw new CommercialLifecycleError("WRONG_WALLET");
  if (!observed.eventMatched)
    throw new CommercialLifecycleError("EVENT_MISMATCH");
  if (!expected.acceptedStates.includes(observed.state))
    throw new CommercialLifecycleError("STATE_MISMATCH");
  return true;
}

export function lifecycleActionMatrix() {
  return [
    ["createObligation", "BUYER", "SERVER_PREPARED_PARTY_SIGNED"],
    ["acceptObligation", "SUPPLIER", "SERVER_PREPARED_PARTY_SIGNED"],
    ["approve", "BUYER", "SERVER_PREPARED_PARTY_SIGNED"],
    ["fund", "BUYER", "SERVER_PREPARED_PARTY_SIGNED"],
    ["commitEvidence", "SUPPLIER", "SERVER_PREPARED_PARTY_SIGNED"],
    ["proposeFastOutcome", "ADJUDICATOR", "PROTOCOL_AUTHORIZATION_REQUIRED"],
    ["challenge", "BUYER_OR_SUPPLIER", "SERVER_PREPARED_PARTY_SIGNED"],
    ["finalizeFastOutcome", "ANY", "SERVER_PREPARED_PARTY_SIGNED"],
    ["enterDispute", "BUYER_OR_SUPPLIER", "PHASE_3C1_EXISTING"],
    ["executeGenLayerResolution", "RELAYER", "PHASE_3C5_THRESHOLD_GATED"],
  ] as const;
}

function protocolHash(value: string) {
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase();
  if (/^sha256:[0-9a-fA-F]{64}$/.test(value))
    return `0x${value.slice(7).toLowerCase()}`;
  throw new CommercialLifecycleError("INVALID_PROTOCOL_HASH");
}

export async function createPreparedObligation(
  actorId: string,
  dealId: string,
  amountInput: string,
) {
  if (!/^[1-9][0-9]*$/.test(amountInput))
    throw new CommercialLifecycleError(
      "INVALID_AMOUNT",
      "Enter an amount in the token's smallest unit.",
    );
  const amount = BigInt(amountInput);
  const access = await guards.requireDealAccess(actorId, dealId);
  const deal = await prisma.deal.findUniqueOrThrow({
    where: { id: dealId },
    include: {
      participants: true,
      agreements: {
        where: { status: "APPROVED" },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  const role = deal.participants.find(
    (item) => item.organizationId === access.organizationId,
  )?.role;
  if (role !== "BUYER" && deal.organizationId !== access.organizationId)
    throw new CommercialLifecycleError("BUYER_ORGANIZATION_REQUIRED");
  const supplier = deal.participants.find((item) => item.role === "SUPPLIER");
  if (!supplier) throw new CommercialLifecycleError("SUPPLIER_NOT_ACCEPTED");
  const [buyerWallet, supplierMember] = await Promise.all([
    prisma.walletAccount.findFirst({
      where: { userId: actorId, verificationStatus: "VERIFIED" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.organizationMember.findFirst({
      where: { organizationId: supplier.organizationId },
      select: { userId: true },
    }),
  ]);
  if (!buyerWallet) throw new CommercialLifecycleError("BUYER_WALLET_REQUIRED");
  if (!supplierMember)
    throw new CommercialLifecycleError("SUPPLIER_MEMBER_REQUIRED");
  const supplierWallet = await prisma.walletAccount.findFirst({
    where: { userId: supplierMember.userId, verificationStatus: "VERIFIED" },
    orderBy: { updatedAt: "desc" },
  });
  if (!supplierWallet)
    throw new CommercialLifecycleError("SUPPLIER_WALLET_REQUIRED");
  const agreement = deal.agreements[0];
  if (!agreement)
    throw new CommercialLifecycleError("APPROVED_AGREEMENT_REQUIRED");
  const xLayerObligationId = BigInt(
    `0x${randomBytes(12).toString("hex")}`,
  ).toString();
  const agreementHash = protocolHash(agreement.agreementHash);
  const policyHash = `0x${createHash("sha256").update(JSON.stringify(EVALUATION_POLICY_V1)).digest("hex")}`;
  const toleranceCaseId = computeToleranceCaseId(
    1952n,
    getAddress(protocolConfig.xLayer.escrow),
    BigInt(xLayerObligationId),
  );
  return prisma.obligation.create({
    data: {
      dealId,
      agreementId: agreement.id,
      createdById: actorId,
      buyerWallet: buyerWallet.address,
      supplierWallet: supplierWallet.address,
      amount: amount.toString(),
      tokenAddress: protocolConfig.xLayer.settlementToken,
      tokenDecimals: 6,
      xLayerChainId: 1952,
      xLayerEscrow: protocolConfig.xLayer.escrow,
      xLayerObligationId,
      toleranceCaseId,
      agreementHash,
      policyHash,
    },
  });
}

type PreparedAction = {
  intentId: string;
  chainId: 1952;
  to: Address;
  data: Hex;
  method: string;
  obligationId: string;
  expectedWallet: Address | null;
  amount: string;
};

function actionData(
  action: CommercialAction,
  obligation: {
    xLayerObligationId: string;
    supplierWallet: string;
    amount: { toString(): string };
    agreementHash: string;
    policyHash: string;
    evidenceRoot: string | null;
    disputePacketHash?: string | null;
  },
  challengeReferenceHash?: Hex,
) {
  const id = BigInt(obligation.xLayerObligationId);
  switch (action) {
    case "CREATE_OBLIGATION":
      return {
        to: getAddress(protocolConfig.xLayer.escrow),
        method: "createObligation",
        data: encodeFunctionData({
          abi: OBLIGATION_LIFECYCLE_ABI,
          functionName: "createObligation",
          args: [
            id,
            getAddress(obligation.supplierWallet),
            BigInt(obligation.amount.toString()),
            obligation.agreementHash as Hex,
            obligation.policyHash as Hex,
            86_400n,
            86_400n,
          ],
        }),
      };
    case "ACCEPT_OBLIGATION":
      return call("acceptObligation", [id]);
    case "APPROVE_TOKEN":
      return {
        to: getAddress(protocolConfig.xLayer.settlementToken),
        method: "approve",
        data: encodeFunctionData({
          abi: ERC20_APPROVAL_ABI,
          functionName: "approve",
          args: [
            getAddress(protocolConfig.xLayer.escrow),
            BigInt(obligation.amount.toString()),
          ],
        }),
      };
    case "FUND_OBLIGATION":
      return call("fund", [id]);
    case "COMMIT_EVIDENCE":
      if (!obligation.evidenceRoot)
        throw new CommercialLifecycleError("EVIDENCE_ROOT_NOT_READY");
      return call("commitEvidence", [id, obligation.evidenceRoot as Hex]);
    case "CHALLENGE_OUTCOME":
      return call("challenge", [
        id,
        challengeReferenceHash ??
          (obligation.disputePacketHash as Hex | null) ??
          keccak256(
            stringToHex(`tolerance-challenge:${obligation.xLayerObligationId}`),
          ),
      ]);
    case "FINALIZE_UNCONTESTED":
      return call("finalizeFastOutcome", [id]);
    case "REFUND_EVIDENCE_TIMEOUT":
      return call("refundForEvidenceTimeout", [id]);
  }
}

function call(
  functionName:
    | "acceptObligation"
    | "fund"
    | "commitEvidence"
    | "challenge"
    | "finalizeFastOutcome"
    | "refundForEvidenceTimeout",
  args: readonly unknown[],
) {
  return {
    to: getAddress(protocolConfig.xLayer.escrow),
    method: functionName,
    data: encodeFunctionData({
      abi: OBLIGATION_LIFECYCLE_ABI,
      functionName,
      args,
    } as never),
  };
}

export async function prepareCommercialAction(
  actorId: string,
  obligationId: string,
  action: CommercialAction,
  challengeReferenceHash?: Hex,
): Promise<PreparedAction> {
  const obligation = await prisma.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    include: { deal: { include: { participants: true } } },
  });
  const access = await guards.requireDealAccess(actorId, obligation.dealId);
  const role =
    obligation.deal.participants.find(
      (participant) => participant.organizationId === access.organizationId,
    )?.role ??
    (obligation.deal.organizationId === access.organizationId ? "BUYER" : null);
  const buyerAction = [
    "CREATE_OBLIGATION",
    "APPROVE_TOKEN",
    "FUND_OBLIGATION",
    "REFUND_EVIDENCE_TIMEOUT",
  ].includes(action);
  const supplierAction = ["ACCEPT_OBLIGATION", "COMMIT_EVIDENCE"].includes(
    action,
  );
  if (
    (buyerAction && role !== "BUYER") ||
    (supplierAction && role !== "SUPPLIER")
  )
    throw new CommercialLifecycleError("WRONG_COMMERCIAL_ROLE");
  const expectedWallet = buyerAction
    ? getAddress(obligation.buyerWallet)
    : supplierAction
      ? getAddress(obligation.supplierWallet)
      : null;
  if (expectedWallet) {
    const verified = await prisma.walletAccount.findFirst({
      where: {
        userId: actorId,
        verificationStatus: "VERIFIED",
        normalizedAddress: expectedWallet.toLowerCase(),
      },
    });
    if (!verified)
      throw new CommercialLifecycleError(
        "EXPECTED_WALLET_NOT_VERIFIED",
        "Connect the wallet assigned to this obligation.",
      );
  }
  const prepared = actionData(action, obligation, challengeReferenceHash);
  const allowedObservedState: Partial<Record<CommercialAction, string | null>> =
    {
      CREATE_OBLIGATION: null,
      ACCEPT_OBLIGATION: "CREATED",
      APPROVE_TOKEN: "ACCEPTED",
      FUND_OBLIGATION: "ACCEPTED",
      COMMIT_EVIDENCE: "FUNDED",
      CHALLENGE_OUTCOME: "VERDICT_PROPOSED",
      FINALIZE_UNCONTESTED: "VERDICT_PROPOSED",
      REFUND_EVIDENCE_TIMEOUT: "FUNDED",
    };
  if (
    (obligation.observedOnchainState ?? null) !== allowedObservedState[action]
  )
    throw new CommercialLifecycleError("STALE_OBLIGATION_STATE");
  const intent = await prisma.protocolActionIntent.upsert({
    where: {
      obligationId_action_expectedState: {
        obligationId,
        action,
        expectedState: stateByAction[action].expected,
      },
    },
    create: {
      obligationId,
      requestedById: actorId,
      action,
      expectedState: stateByAction[action].expected,
      calldataHash: keccak256(prepared.data),
    },
    update: {},
  });
  return {
    intentId: intent.id,
    chainId: 1952,
    ...prepared,
    obligationId: obligation.xLayerObligationId,
    expectedWallet,
    amount: obligation.amount.toString(),
  };
}

export async function recordCommercialActionSubmission(
  actorId: string,
  intentId: string,
  transactionHash: Hex,
) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash))
    throw new CommercialLifecycleError("MALFORMED_TRANSACTION_HASH");
  const intent = await prisma.protocolActionIntent.findUniqueOrThrow({
    where: { id: intentId },
    include: { obligation: true },
  });
  await guards.requireDealAccess(actorId, intent.obligation.dealId);
  if (
    intent.transactionHash &&
    intent.transactionHash.toLowerCase() !== transactionHash.toLowerCase()
  )
    throw new CommercialLifecycleError("ACTION_ALREADY_SUBMITTED");
  return prisma.protocolActionIntent.update({
    where: { id: intent.id },
    data: { transactionHash, submittedAt: new Date(), status: "SUBMITTED" },
  });
}

export async function confirmCommercialAction(
  actorId: string,
  intentId: string,
) {
  const intent = await prisma.protocolActionIntent.findUniqueOrThrow({
    where: { id: intentId },
    include: { obligation: true },
  });
  await guards.requireDealAccess(actorId, intent.obligation.dealId);
  if (!intent.transactionHash)
    throw new CommercialLifecycleError("ACTION_NOT_SUBMITTED");
  const client = createPublicClient({
    chain: xLayerTestnet,
    transport: http(process.env.XLAYER_RPC_URL),
  });
  const hash = intent.transactionHash as Hex;
  const [transaction, receipt, finalized] = await Promise.all([
    client.getTransaction({ hash }),
    client.getTransactionReceipt({ hash }),
    client.getBlock({ blockTag: "finalized" }),
  ]);
  if (receipt.status !== "success")
    throw new CommercialLifecycleError("TRANSACTION_FAILED");
  if (receipt.blockNumber > finalized.number)
    throw new CommercialLifecycleError("TRANSACTION_NOT_FINALIZED");
  const expectedTo =
    intent.action === "APPROVE_TOKEN"
      ? protocolConfig.xLayer.settlementToken
      : protocolConfig.xLayer.escrow;
  if (transaction.to?.toLowerCase() !== expectedTo.toLowerCase())
    throw new CommercialLifecycleError("WRONG_CONTRACT");
  if (keccak256(transaction.input) !== intent.calldataHash)
    throw new CommercialLifecycleError("CALLDATA_MISMATCH");
  const abi =
    intent.action === "APPROVE_TOKEN"
      ? ERC20_APPROVAL_ABI
      : OBLIGATION_LIFECYCLE_ABI;
  const decoded = decodeFunctionData({ abi, data: transaction.input });
  const expectedMethod = actionData(
    intent.action as CommercialAction,
    intent.obligation,
  ).method;
  if (decoded.functionName !== expectedMethod)
    throw new CommercialLifecycleError("WRONG_FUNCTION");
  const action = intent.action as CommercialAction;
  const buyerActions: CommercialAction[] = [
    "CREATE_OBLIGATION",
    "APPROVE_TOKEN",
    "FUND_OBLIGATION",
    "REFUND_EVIDENCE_TIMEOUT",
  ];
  const supplierActions: CommercialAction[] = [
    "ACCEPT_OBLIGATION",
    "COMMIT_EVIDENCE",
  ];
  if (
    buyerActions.includes(action) &&
    transaction.from.toLowerCase() !==
      intent.obligation.buyerWallet.toLowerCase()
  )
    throw new CommercialLifecycleError("WRONG_WALLET");
  if (
    supplierActions.includes(action) &&
    transaction.from.toLowerCase() !==
      intent.obligation.supplierWallet.toLowerCase()
  )
    throw new CommercialLifecycleError("WRONG_WALLET");
  if (
    action === "CHALLENGE_OUTCOME" &&
    transaction.from.toLowerCase() !==
      intent.obligation.buyerWallet.toLowerCase() &&
    transaction.from.toLowerCase() !==
      intent.obligation.supplierWallet.toLowerCase()
  )
    throw new CommercialLifecycleError("WRONG_WALLET");
  if (action === "APPROVE_TOKEN") {
    const allowance = await client.readContract({
      address: getAddress(protocolConfig.xLayer.settlementToken),
      abi: ERC20_APPROVAL_ABI,
      functionName: "allowance",
      args: [transaction.from, getAddress(protocolConfig.xLayer.escrow)],
      blockNumber: finalized.number,
    });
    if (allowance < BigInt(intent.obligation.amount.toString()))
      throw new CommercialLifecycleError("ALLOWANCE_MISMATCH");
    const approvalTopic = keccak256(
      stringToHex("Approval(address,address,uint256)"),
    );
    const ownerTopic = padHex(transaction.from, { size: 32 });
    const spenderTopic = padHex(getAddress(protocolConfig.xLayer.escrow), {
      size: 32,
    });
    if (
      !receipt.logs.some(
        (log) =>
          log.address.toLowerCase() ===
            protocolConfig.xLayer.settlementToken.toLowerCase() &&
          log.topics[0] === approvalTopic &&
          log.topics[1]?.toLowerCase() === ownerTopic.toLowerCase() &&
          log.topics[2]?.toLowerCase() === spenderTopic.toLowerCase(),
      )
    )
      throw new CommercialLifecycleError("EVENT_MISMATCH");
  } else {
    const onchain = await client.readContract({
      address: getAddress(protocolConfig.xLayer.escrow),
      abi: OBLIGATION_LIFECYCLE_ABI,
      functionName: "getObligation",
      args: [BigInt(intent.obligation.xLayerObligationId)],
      blockNumber: finalized.number,
    });
    const acceptedStates: Record<CommercialAction, number[]> = {
      CREATE_OBLIGATION: [0],
      ACCEPT_OBLIGATION: [1],
      APPROVE_TOKEN: [1],
      FUND_OBLIGATION: [2],
      COMMIT_EVIDENCE: [3],
      CHALLENGE_OUTCOME: [5],
      FINALIZE_UNCONTESTED: [6, 7],
      REFUND_EVIDENCE_TIMEOUT: [7],
    };
    if (!acceptedStates[action].includes(onchain.state))
      throw new CommercialLifecycleError("STATE_MISMATCH");
    if (
      onchain.buyer.toLowerCase() !==
        intent.obligation.buyerWallet.toLowerCase() ||
      onchain.supplier.toLowerCase() !==
        intent.obligation.supplierWallet.toLowerCase()
    )
      throw new CommercialLifecycleError("PARTY_BINDING_MISMATCH");
    if (onchain.amount !== BigInt(intent.obligation.amount.toString()))
      throw new CommercialLifecycleError("AMOUNT_MISMATCH");
    const signatures: Record<
      Exclude<CommercialAction, "APPROVE_TOKEN">,
      string[]
    > = {
      CREATE_OBLIGATION: [
        "ObligationCreated(uint256,address,address,uint256,bytes32,bytes32,uint64,uint64)",
      ],
      ACCEPT_OBLIGATION: ["ObligationAccepted(uint256)"],
      FUND_OBLIGATION: ["ObligationFunded(uint256,uint256,uint64)"],
      COMMIT_EVIDENCE: ["EvidenceCommitted(uint256,bytes32)"],
      CHALLENGE_OUTCOME: ["OutcomeChallenged(uint256,address,bytes32)"],
      FINALIZE_UNCONTESTED: [
        "ObligationSettled(uint256,uint256,uint256)",
        "ObligationRefunded(uint256,uint256)",
      ],
      REFUND_EVIDENCE_TIMEOUT: ["ObligationRefunded(uint256,uint256)"],
    };
    const topics = signatures[
      action as Exclude<CommercialAction, "APPROVE_TOKEN">
    ].map((signature) => keccak256(stringToHex(signature)));
    const obligationTopic = padHex(
      numberToHex(BigInt(intent.obligation.xLayerObligationId)),
      { size: 32 },
    );
    if (
      !receipt.logs.some(
        (log) =>
          log.address.toLowerCase() ===
            protocolConfig.xLayer.escrow.toLowerCase() &&
          topics.includes(log.topics[0] as Hex) &&
          log.topics[1]?.toLowerCase() === obligationTopic.toLowerCase(),
      )
    )
      throw new CommercialLifecycleError("EVENT_MISMATCH");
  }
  await prisma.$transaction(async (tx) => {
    await tx.protocolActionIntent.update({
      where: { id: intent.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    await tx.protocolEvent.create({
      data: {
        obligationId: intent.obligationId,
        txHash: hash,
        eventType: `COMMERCIAL_${intent.action}`,
        observedState: intent.expectedState,
        blockNumber: receipt.blockNumber,
      },
    });
    await tx.obligation.update({
      where: { id: intent.obligationId },
      data: { observedOnchainState: intent.expectedState },
    });
    if (action === "CREATE_OBLIGATION")
      await freezeEvidenceSourcePoliciesForObligation(intent.obligationId, tx);
  });
  return { status: "CONFIRMED" as const, blockNumber: receipt.blockNumber };
}
