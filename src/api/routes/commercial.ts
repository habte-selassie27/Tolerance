import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { requireUser } from "../../server/auth";
import { createDealInvitation } from "../../server/deal-invitations";
import { acknowledgeEvidenceAuthority } from "../../server/evidence-authority";
import {
  confirmCommercialAction,
  createPreparedObligation,
  prepareCommercialAction,
  recordCommercialActionSubmission,
  type CommercialAction,
} from "../../server/xlayer-obligation-lifecycle";
import { notFound, routeParam } from "../errors";
import { appOrigin } from "../app";
import {
  requireDealAccess,
  requireSession,
  workspaceActor,
} from "../workspace";

export const commercialRouter: Router = Router();

const createDealSchema = z.object({
  reference: z.string().trim().min(1),
  title: z.string().trim().min(1),
  buyer: z.string().trim().min(1),
  supplier: z.string().trim().min(1),
});

const invitationSchema = z.object({ email: z.email() });

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

commercialRouter.get("/deals", requireSession, async (_request, response) => {
  const actor = await workspaceActor();
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: actor.id },
    select: { organizationId: true },
  });
  if (!membership) {
    response.json({ needsOnboarding: true, deals: [] });
    return;
  }
  const deals = await prisma.deal.findMany({
    where: {
      OR: [
        { organizationId: membership.organizationId },
        {
          participants: {
            some: { organizationId: membership.organizationId },
          },
        },
      ],
    },
    include: {
      agreements: { orderBy: { version: "desc" }, take: 1 },
      obligations: { select: { id: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  response.json({
    needsOnboarding: false,
    deals: deals.map((deal) => ({
      id: deal.id,
      reference: deal.reference,
      title: deal.title,
      supplierOrganizationRef: deal.supplierOrganizationRef,
      agreementStatus: deal.agreements[0]?.status ?? null,
      obligationCount: deal.obligations.length,
      updatedAt: deal.updatedAt.toISOString(),
    })),
  });
});

commercialRouter.post("/deals", requireSession, async (request, response) => {
  const actor = await workspaceActor();
  const membership = await prisma.organizationMember.findFirstOrThrow({
    where: { userId: actor.id },
    select: { organizationId: true },
  });
  const input = createDealSchema.parse(request.body);
  const deal = await prisma.$transaction(async (tx) => {
    const created = await tx.deal.create({
      data: {
        organizationId: membership.organizationId,
        reference: input.reference,
        title: input.title,
        buyerOrganizationRef: input.buyer,
        supplierOrganizationRef: input.supplier,
        createdById: actor.id,
      },
    });
    await tx.dealParticipant.create({
      data: {
        dealId: created.id,
        organizationId: membership.organizationId,
        role: "BUYER",
      },
    });
    return created;
  });
  response.status(201).json({ ok: true, dealId: deal.id });
});

commercialRouter.get(
  "/deals/:dealId",
  requireSession,
  async (request, response) => {
    const dealId = routeParam(request, "dealId");
    await requireDealAccess(dealId);
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        agreements: {
          include: { amendments: { orderBy: { precedence: "desc" } } },
          orderBy: { version: "desc" },
        },
        documents: {
          include: { sourceBlocks: true },
          orderBy: { createdAt: "desc" },
        },
        obligations: {
          include: {
            requirements: { include: { governingSources: true } },
            evidence: { select: { id: true } },
            adjudicationCases: { select: { id: true } },
          },
        },
        participants: { include: { organization: true } },
      },
    });
    if (!deal) throw notFound("That dossier was not found.");
    response.json({
      id: deal.id,
      reference: deal.reference,
      title: deal.title,
      buyerOrganizationRef: deal.buyerOrganizationRef,
      supplierOrganizationRef: deal.supplierOrganizationRef,
      agreementStatus: deal.agreements[0]?.status ?? null,
      participants: deal.participants.map((participant) => ({
        organizationId: participant.organizationId,
        organizationName: participant.organization.name,
        role: participant.role,
      })),
      agreements: deal.agreements.map((agreement) => ({
        id: agreement.id,
        version: agreement.version,
        status: agreement.status,
        amendments: agreement.amendments.map((amendment) => ({
          id: amendment.id,
          status: amendment.status,
          version: amendment.version,
          precedence: amendment.precedence,
        })),
      })),
      documents: deal.documents.map((document) => ({
        id: document.id,
        originalFilename: document.originalFilename,
        documentType: document.documentType,
        status: document.status,
        contentHash: document.contentHash,
        sourceBlockCount: document.sourceBlocks.length,
      })),
      obligations: deal.obligations.map((obligation) => ({
        id: obligation.id,
        xLayerObligationId: obligation.xLayerObligationId,
        localStatus: obligation.localStatus,
        evidenceCount: obligation.evidence.length,
        adjudicationCaseId: obligation.adjudicationCases[0]?.id ?? null,
        requirements: obligation.requirements.map((requirement) => ({
          id: requirement.id,
          title: requirement.title,
          acceptanceCriteria: requirement.acceptanceCriteria,
          evidenceExpectations: requirement.evidenceExpectations,
        })),
      })),
    });
  },
);

commercialRouter.post(
  "/deals/:dealId/invitations",
  requireSession,
  async (request, response) => {
    const input = invitationSchema.parse(request.body);
    const { token } = await createDealInvitation(
      routeParam(request, "dealId"),
      input.email,
    );
    response.status(201).json({
      ok: true,
      invitationUrl: `${appOrigin()}/invite/${token}`,
    });
  },
);

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

commercialRouter.get(
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

commercialRouter.post(
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

commercialRouter.post(
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

commercialRouter.post(
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

commercialRouter.post(
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

commercialRouter.post(
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
