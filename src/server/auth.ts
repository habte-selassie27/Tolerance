import "server-only";

import { prisma } from "../lib/prisma";
import { createServerSupabaseClient } from "../lib/supabase/server";
import { AuthorizationError, createAuthorizationGuards } from "./authorization";

export type AuthenticatedActor = {
  id: string;
  authSubject: string;
  email: string | null;
  displayName: string | null;
};

export async function requireUser(): Promise<AuthenticatedActor> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    throw new AuthorizationError("Authentication is required.");

  const user = await prisma.user.upsert({
    where: { authSubject: data.user.id },
    create: {
      authSubject: data.user.id,
      email: data.user.email ?? null,
      displayName:
        typeof data.user.user_metadata.display_name === "string"
          ? data.user.user_metadata.display_name
          : null,
    },
    update: {
      email: data.user.email ?? null,
      displayName:
        typeof data.user.user_metadata.display_name === "string"
          ? data.user.user_metadata.display_name
          : undefined,
    },
    select: { id: true, authSubject: true, email: true, displayName: true },
  });
  return user;
}

export const guards = createAuthorizationGuards({
  async findMembership(organizationId, userId) {
    return Boolean(
      await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { userId: true },
      }),
    );
  },
  async findDealOrganizations(dealId) {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        organizationId: true,
        participants: { select: { organizationId: true } },
      },
    });
    return deal
      ? [
          ...new Set([
            deal.organizationId,
            ...deal.participants.map((p) => p.organizationId),
          ]),
        ]
      : [];
  },
  async findDocumentOrganizations(documentId) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        deal: {
          select: {
            organizationId: true,
            participants: { select: { organizationId: true } },
          },
        },
      },
    });
    return document
      ? [
          ...new Set([
            document.deal.organizationId,
            ...document.deal.participants.map((p) => p.organizationId),
          ]),
        ]
      : [];
  },
});
