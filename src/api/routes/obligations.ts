import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { requireUser } from "../../server/auth";
import { acknowledgeEvidenceAuthority } from "../../server/evidence-authority";
import {
  confirmCommercialAction,
  createPreparedObligation,
  prepareCommercialAction,
  recordCommercialActionSubmission,
  type CommercialAction,
} from "../../server/xlayer-obligation-lifecycle";
import { notFound, routeParam } from "../errors";
import { requireDealAccess, requireSession } from "../workspace";

export const obligationsRouter: Router = Router();

const commercialActionSchema = z.object({
  action: z.enum([
    "CREATE_OBLIGATION",
    "ACCEPT_OBLIGATION",
    "APPROVE_TOKEN",
    "FUND_OBLIGATION",
    "COMMIT_EVIDENCE",
    "CHALLENGE_OUTCOME",
    "FINALIZE_UNCONTESTED",
    "REFUND_EVIDENCE_TIMEOUT",
  ]),
});

const createObligationSchema = z.object({
  amount: z.string().regex(/^[1-9][0-9]*$/),
});

const transactionHashSchema = z.object({
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

/**
 * The party-authorized action matrix is decided here rather than in the
 * browser: the browser only receives the actions this actor may take.
 */
function authorizedActions(
  state: string | null,
  role: string | null,
  hasEvidenceRoot: boolean,
) {
  const actions: CommercialAction[] = [];
  if (!state && role === "BUYER") actions.push("CREATE_OBLIGATION");
  if (state === "CREATED" && role === "SUPPLIER")
    actions.push("ACCEPT_OBLIGATION");
  if (state === "ACCEPTED" && role === "BUYER")
    actions.push("APPROVE_TOKEN", "FUND_OBLIGATION");
  if (state === "FUNDED" && role === "SUPPLIER" && hasEvidenceRoot)
    actions.push("COMMIT_EVIDENCE");
  if (state === "FUNDED" && role === "BUYER")
    actions.push("REFUND_EVIDENCE_TIMEOUT");
  if (state === "VERDICT_PROPOSED")
    actions.push("CHALLENGE_OUTCOME", "FINALIZE_UNCONTESTED");
  return actions;
}

obligationsRouter.get(
  "/deals/:dealId/obligations/:obligationId",
  requireSession,
  async (request, response) => {
    const dealId = routeParam(request, "dealId");
    const obligationId = routeParam(request, "obligationId");
    const actor = await requireDealAccess(dealId);
    const obligation = await prisma.obligation.findFirst({
      where: { id: obligationId, dealId },
      include: {
        requirements: {
          include: { governingSources: true },
          orderBy: { ordering: "asc" },
        },
        evidence: {
          include: {
            sourceBlock: { include: { document: true } },
            acknowledgements: { select: { id: true } },
          },
        },
        aiEvaluationSnapshots: {
          where: { evaluationRun: { status: "VALIDATED" } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        disputePacketSnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
        adjudicationCases: { orderBy: { updatedAt: "desc" }, take: 1 },
        deal: { include: { participants: true } },
        protocolActions: { orderBy: { updatedAt: "desc" } },
      },
    });
    if (!obligation) throw notFound("That obligation was not found.");
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: actor.id },
      select: { organizationId: true },
    });
    const organizationIds = new Set(
      memberships.map((membership) => membership.organizationId),
    );
    const participant = obligation.deal.participants.find((item) =>
      organizationIds.has(item.organizationId),
    );
    const role =
      participant?.role ??
      (organizationIds.has(obligation.deal.organizationId) ? "BUYER" : null);
    const state = obligation.observedOnchainState;
    const evaluation = obligation.aiEvaluationSnapshots[0]?.evaluation as
      | {
          requirements?: Array<{
            requirementId: string;
            result: string;
            explanation: string;
            claims: Array<{ text?: string; citations?: string[] }>;
          }>;
        }
      | undefined;
    const submitted = obligation.protocolActions.find(
      (intent) => intent.status === "SUBMITTED" && intent.transactionHash,
    );
    const packet = obligation.disputePacketSnapshots[0];
    response.json({
      id: obligation.id,
      dealId: obligation.dealId,
      xLayerObligationId: obligation.xLayerObligationId,
      amount: obligation.amount.toString(),
      localStatus: obligation.localStatus,
      observedOnchainState: state,
      role,
      counterpartyWallet:
        role === "BUYER" ? obligation.supplierWallet : obligation.buyerWallet,
      actions: authorizedActions(state, role, Boolean(obligation.evidenceRoot)),
      adjudicationCaseId: obligation.adjudicationCases[0]?.id ?? null,
      packet: packet
        ? {
            disputePacketHash: packet.disputePacketHash,
            canonicalJson: packet.canonicalJson,
          }
        : null,
      pendingSubmission: submitted
        ? {
            intentId: submitted.id,
            action: submitted.action,
            transactionHash: submitted.transactionHash,
          }
        : null,
      evaluation: evaluation?.requirements ?? [],
      requirements: obligation.requirements.map((requirement) => ({
        id: requirement.id,
        title: requirement.title,
        acceptanceCriteria: requirement.acceptanceCriteria,
        evidenceExpectations: requirement.evidenceExpectations,
      })),
      evidence: obligation.evidence.map((evidence) => ({
        id: evidence.id,
        status: evidence.status,
        authorityLevel: evidence.authorityLevel,
        acknowledged: evidence.acknowledgements.length > 0,
        documentFilename:
          evidence.sourceBlock?.document.originalFilename ?? null,
        provenance: evidence.sourceBlock
          ? {
              normalizedText: evidence.sourceBlock.normalizedText,
              pageNumber: evidence.sourceBlock.pageNumber,
              blockOrder: evidence.sourceBlock.blockOrder,
            }
          : null,
      })),
    });
  },
);

obligationsRouter.post(
  "/deals/:dealId/obligations",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const input = createObligationSchema.parse(request.body);
    const obligation = await createPreparedObligation(
      actor.id,
      routeParam(request, "dealId"),
      input.amount,
    );
    response.status(201).json({ ok: true, obligationId: obligation.id });
  },
);

obligationsRouter.post(
  "/obligations/:obligationId/commercial-actions",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const input = commercialActionSchema.parse(request.body);
    const prepared = await prepareCommercialAction(
      actor.id,
      routeParam(request, "obligationId"),
      input.action,
    );
    response.json(prepared);
  },
);

obligationsRouter.post(
  "/commercial-actions/:intentId/submission",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const input = transactionHashSchema.parse(request.body);
    const result = await recordCommercialActionSubmission(
      actor.id,
      routeParam(request, "intentId"),
      input.transactionHash as `0x${string}`,
    );
    response.json({
      ok: true,
      intentId: result.id,
      status: result.status,
    });
  },
);

obligationsRouter.post(
  "/commercial-actions/:intentId/confirm",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const result = await confirmCommercialAction(
      actor.id,
      routeParam(request, "intentId"),
    );
    response.json({
      ...result,
      blockNumber: result.blockNumber.toString(),
    });
  },
);

obligationsRouter.post(
  "/evidence/:evidenceId/acknowledgement",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    await acknowledgeEvidenceAuthority(
      actor.id,
      routeParam(request, "evidenceId"),
    );
    response.json({ ok: true });
  },
);
