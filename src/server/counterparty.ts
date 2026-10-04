import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getAddress, recoverMessageAddress } from "viem";

import { prisma } from "../lib/prisma";
import { AuthorizationError, requireUser } from "./auth";

export class WalletOwnershipError extends Error {}

export function assertWalletChallenge(
  challenge: {
    userId: string;
    normalizedAddress: string;
    message: string;
    expiresAt: Date;
    usedAt: Date | null;
  },
  input: { actorId: string; recoveredAddress: string; now?: Date },
) {
  const now = input.now ?? new Date();
  if (challenge.userId !== input.actorId)
    throw new WalletOwnershipError("Wallet challenge was not found.");
  if (challenge.usedAt)
    throw new WalletOwnershipError("Wallet challenge has already been used.");
  if (challenge.expiresAt.getTime() <= now.getTime())
    throw new WalletOwnershipError("Wallet challenge has expired.");
  if (input.recoveredAddress.toLowerCase() !== challenge.normalizedAddress)
    throw new WalletOwnershipError("The signature does not match this wallet.");
  if (!challenge.message.includes(`Wallet: ${challenge.normalizedAddress}`))
    throw new WalletOwnershipError("Wallet challenge binding is invalid.");
}

export async function createWalletChallenge(address: string) {
  const actor = await requireUser();
  let normalizedAddress: string;
  try {
    normalizedAddress = getAddress(address).toLowerCase();
  } catch {
    throw new WalletOwnershipError("Enter a valid EVM wallet address.");
  }
  const nonce = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  const message = [
    "Tolerance wallet ownership verification",
    `Account: ${actor.id}`,
    `Wallet: ${normalizedAddress}`,
    "Network: X Layer Testnet (1952)",
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt.toISOString()}`,
    "This signature does not authorize a transaction or transfer funds.",
  ].join("\n");
  const challenge = await prisma.walletChallenge.create({
    data: { userId: actor.id, normalizedAddress, nonce, message, expiresAt },
    select: { id: true, message: true, expiresAt: true },
  });
  return challenge;
}

export async function verifyWalletChallenge(
  challengeId: string,
  signature: string,
) {
  const actor = await requireUser();
  const challenge = await prisma.walletChallenge.findUnique({
    where: { id: challengeId },
  });
  if (!challenge)
    throw new WalletOwnershipError("Wallet challenge was not found.");
  let recovered: string;
  try {
    recovered = (
      await recoverMessageAddress({
        message: challenge.message,
        signature: signature as `0x${string}`,
      })
    ).toLowerCase();
  } catch {
    throw new WalletOwnershipError("Wallet signature is invalid.");
  }
  assertWalletChallenge(challenge, {
    actorId: actor.id,
    recoveredAddress: recovered,
  });
  return prisma.$transaction(async (tx) => {
    const consumed = await tx.walletChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new WalletOwnershipError("Wallet challenge is no longer valid.");
    return tx.walletAccount.upsert({
      where: {
        chainFamily_network_normalizedAddress: {
          chainFamily: "EVM",
          network: "xlayer-testnet-1952",
          normalizedAddress: challenge.normalizedAddress,
        },
      },
      create: {
        userId: actor.id,
        chainFamily: "EVM",
        network: "xlayer-testnet-1952",
        address: getAddress(challenge.normalizedAddress),
        normalizedAddress: challenge.normalizedAddress,
        verificationStatus: "VERIFIED",
      },
      update: {
        userId: actor.id,
        address: getAddress(challenge.normalizedAddress),
        verificationStatus: "VERIFIED",
      },
    });
  });
}

export async function unlinkWallet(walletId: string) {
  const actor = await requireUser();
  const wallet = await prisma.walletAccount.findFirst({
    where: { id: walletId, userId: actor.id, verificationStatus: "VERIFIED" },
  });
  if (!wallet) throw new WalletOwnershipError("Verified wallet was not found.");
  const immutableBindings = await prisma.obligation.count({
    where: {
      OR: [
        { buyerWallet: { equals: wallet.address, mode: "insensitive" } },
        { supplierWallet: { equals: wallet.address, mode: "insensitive" } },
      ],
      localStatus: { notIn: ["CANCELLED"] },
    },
  });
  if (immutableBindings)
    throw new WalletOwnershipError(
      "This wallet is assigned to an obligation and cannot be unlinked.",
    );
  await prisma.walletAccount.delete({ where: { id: wallet.id } });
}

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
