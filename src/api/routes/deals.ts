import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { createDealInvitation } from "../../server/deal-invitations";
import { appOrigin } from "../origin";
import { notFound, routeParam } from "../errors";
import {
  requireDealAccess,
  requireSession,
  workspaceActor,
} from "../workspace";

export const dealsRouter: Router = Router();

const createDealSchema = z.object({
  reference: z.string().trim().min(1),
  title: z.string().trim().min(1),
  buyer: z.string().trim().min(1),
  supplier: z.string().trim().min(1),
});

const invitationSchema = z.object({
  email: z.email(),
});

dealsRouter.get("/deals", requireSession, async (_request, response) => {
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

dealsRouter.post("/deals", requireSession, async (request, response) => {
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

dealsRouter.get("/deals/:dealId", requireSession, async (request, response) => {
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
});

dealsRouter.post(
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
