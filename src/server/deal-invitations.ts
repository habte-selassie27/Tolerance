import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { requireUser } from "./auth";
import { AuthorizationError } from "./authorization";

export class DealInvitationError extends Error {}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalized))
    throw new DealInvitationError("Enter a valid counterparty email.");
  return normalized;
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function assertInvitationAcceptance(
  invitation: {
    status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
    intendedEmail: string;
    invitingOrganizationId: string;
    expiresAt: Date;
  },
  input: { actorEmail: string | null; organizationId: string; now?: Date },
) {
  if (invitation.status !== "PENDING")
    throw new DealInvitationError("This invitation is no longer available.");
  if (invitation.expiresAt.getTime() <= (input.now ?? new Date()).getTime())
    throw new DealInvitationError("This invitation has expired.");
  if (
    !input.actorEmail ||
    input.actorEmail.toLowerCase() !== invitation.intendedEmail
  )
    throw new DealInvitationError(
      "Sign in with the email address that received this invitation.",
    );
  if (input.organizationId === invitation.invitingOrganizationId)
    throw new DealInvitationError(
      "Choose a separate counterparty organization.",
    );
}

export async function createDealInvitation(dealId: string, email: string) {
  const actor = await requireUser();
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: actor.id },
    select: { organizationId: true },
  });
  if (!membership) throw new AuthorizationError();
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, organizationId: membership.organizationId },
    select: { id: true },
  });
  if (!deal) throw new AuthorizationError();
  const intendedEmail = normalizeEmail(email);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.dealInvitation.updateMany({
      where: { dealId, role: "SUPPLIER", status: "PENDING" },
      data: { status: "REVOKED" },
    });
    const created = await tx.dealInvitation.create({
      data: {
        dealId,
        invitingOrganizationId: membership.organizationId,
        createdById: actor.id,
        intendedEmail,
        tokenHash,
        role: "SUPPLIER",
        expiresAt,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: membership.organizationId,
        actorId: actor.id,
        action: "DEAL_INVITATION_CREATED",
        targetType: "DealInvitation",
        targetId: created.id,
        metadata: {
          dealId,
          role: "SUPPLIER",
          expiresAt: expiresAt.toISOString(),
        },
      },
    });
    return created;
  });
  return { invitation, token };
}

export async function inspectDealInvitation(token: string) {
  const invitation = await prisma.dealInvitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { deal: true, invitingOrganization: true },
  });
  if (!invitation || invitation.status !== "PENDING")
    throw new DealInvitationError("This invitation is no longer available.");
  if (invitation.expiresAt.getTime() <= Date.now()) {
    await prisma.dealInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    throw new DealInvitationError("This invitation has expired.");
  }
  return invitation;
}

export async function acceptDealInvitation(
  token: string,
  organizationId: string,
) {
  const actor = await requireUser();
  const invitation = await inspectDealInvitation(token);
  assertInvitationAcceptance(invitation, {
    actorEmail: actor.email,
    organizationId,
  });
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: actor.id } },
  });
  if (!membership) throw new AuthorizationError();
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.dealInvitation.updateMany({
      where: {
        id: invitation.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedByOrganizationId: organizationId,
      },
    });
    if (claimed.count !== 1)
      throw new DealInvitationError("This invitation has already been used.");
    await tx.dealParticipant.create({
      data: {
        dealId: invitation.dealId,
        organizationId,
        role: invitation.role,
      },
    });
    const acceptedOrganization = await tx.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true },
    });
    await tx.deal.update({
      where: { id: invitation.dealId },
      data: { supplierOrganizationRef: acceptedOrganization.name },
    });
    await tx.auditEvent.createMany({
      data: [
        {
          organizationId: invitation.invitingOrganizationId,
          actorId: actor.id,
          action: "DEAL_INVITATION_ACCEPTED",
          targetType: "Deal",
          targetId: invitation.dealId,
          metadata: { counterpartyOrganizationId: organizationId },
        },
        {
          organizationId,
          actorId: actor.id,
          action: "DEAL_ACCESS_ACCEPTED",
          targetType: "Deal",
          targetId: invitation.dealId,
          metadata: {
            invitingOrganizationId: invitation.invitingOrganizationId,
          },
        },
      ],
    });
    return tx.dealParticipant.findUniqueOrThrow({
      where: {
        dealId_organizationId: { dealId: invitation.dealId, organizationId },
      },
    });
  });
}
