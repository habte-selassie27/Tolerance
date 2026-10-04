import { Router } from "express";

import { prisma } from "../../lib/prisma";
import { currentAuthenticatedSubject } from "../../lib/request-context";
import { requireSession, workspaceActor } from "../workspace";

export const workspaceRouter: Router = Router();

/** Backing data for the persistent workspace shell: identity and wallet state. */
workspaceRouter.get(
  "/workspace",
  requireSession,
  async (_request, response) => {
    const actor = await workspaceActor();
    const [membership, wallet] = await Promise.all([
      prisma.organizationMember.findFirst({
        where: { userId: actor.id },
        include: { organization: true },
      }),
      prisma.walletAccount.findFirst({
        where: { userId: actor.id, verificationStatus: "VERIFIED" },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    response.json({
      organization: membership?.organization.name ?? "Workspace setup",
      user: actor.displayName ?? actor.email ?? "Tolerance user",
      wallet: wallet?.address ?? null,
      needsOnboarding: !membership,
      emailVerified: Boolean(currentAuthenticatedSubject()?.emailConfirmedAt),
    });
  },
);

/** The authorized "what needs attention" summary for the workspace home. */
workspaceRouter.get(
  "/workspace/summary",
  requireSession,
  async (_request, response) => {
    const actor = await workspaceActor();
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: actor.id },
      select: { organizationId: true },
    });
    if (!membership) {
      response.json({ needsOnboarding: true });
      return;
    }
    const [deals, obligations, workflows, events] = await Promise.all([
      prisma.deal.count({
        where: { organizationId: membership.organizationId },
      }),
      prisma.obligation.count({
        where: { deal: { organizationId: membership.organizationId } },
      }),
      prisma.adjudicationCase.findMany({
        where: {
          obligation: { deal: { organizationId: membership.organizationId } },
        },
        select: {
          id: true,
          workflowStatus: true,
          obligation: { select: { deal: { select: { title: true } } } },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.auditEvent.findMany({
        where: { organizationId: membership.organizationId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);
    response.json({
      needsOnboarding: false,
      metrics: {
        deals,
        obligations,
        awaitingWallet: workflows.filter(
          (item) =>
            item.workflowStatus === "PACKET_READY" ||
            item.workflowStatus === "XLAYER_BINDING_PENDING",
        ).length,
        adjudications: workflows.length,
      },
      workflows: workflows.map((item) => ({
        id: item.id,
        workflowStatus: item.workflowStatus,
        dealTitle: item.obligation.deal.title,
      })),
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        createdAt: event.createdAt.toISOString(),
      })),
    });
  },
);

/** Creates the actor's first organization during onboarding. */
workspaceRouter.post(
  "/organizations",
  requireSession,
  async (request, response) => {
    const actor = await workspaceActor();
    const name =
      typeof request.body?.name === "string" ? request.body.name.trim() : "";
    if (name.length < 2) {
      response.status(400).json({
        code: "INVALID_INPUT",
        message: "Enter an organization name.",
      });
      return;
    }
    const existing = await prisma.organizationMember.findFirst({
      where: { userId: actor.id },
    });
    const requestedNext =
      typeof request.body?.next === "string" ? request.body.next : null;
    if (existing) {
      response.json({ ok: true, alreadyMember: true });
      return;
    }
    const base =
      name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 42) || "workspace";
    const organization = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: { name, slug: `${base}-${actor.id.slice(0, 8)}` },
      });
      await tx.organizationMember.create({
        data: {
          organizationId: created.id,
          userId: actor.id,
          role: "OWNER",
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: created.id,
          actorId: actor.id,
          action: "ORGANIZATION_CREATED",
          targetType: "Organization",
          targetId: created.id,
          metadata: { source: "onboarding" },
        },
      });
      return created;
    });
    response.json({ ok: true, organizationId: organization.id, requestedNext });
  },
);
