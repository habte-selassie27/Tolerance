import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import {
  acceptDealInvitation,
  inspectDealInvitation,
} from "../../server/deal-invitations";
import { ApiError, routeParam } from "../errors";

export const invitationsRouter: Router = Router();

const acceptSchema = z.object({
  token: z.string().min(16).max(256),
  organizationId: z.uuid(),
});

/**
 * Public inspection of an invitation plus the viewer's own membership state.
 * Nothing here reveals a dossier the viewer is not already entitled to see.
 */
invitationsRouter.get("/invitations/:token", async (request, response) => {
  const token = routeParam(request, "token");
  const invitation = await inspectDealInvitation(token);
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user
    ? await prisma.user.findUnique({
        where: { authSubject: data.user.id },
        include: { memberships: { include: { organization: true } } },
      })
    : null;
  response.json({
    deal: {
      id: invitation.deal.id,
      title: invitation.deal.title,
      reference: invitation.deal.reference,
    },
    invitingOrganizationName: invitation.invitingOrganization.name,
    expiresAt: invitation.expiresAt.toISOString(),
    viewer: {
      signedIn: Boolean(user),
      organizations:
        user?.memberships.map(({ organization }) => ({
          id: organization.id,
          name: organization.name,
        })) ?? [],
    },
  });
});

invitationsRouter.post("/invitations/accept", async (request, response) => {
  const fetchSite = request.headers["sec-fetch-site"];
  if (typeof fetchSite === "string" && fetchSite !== "same-origin") {
    throw new ApiError(403, "Invalid request origin.", "INVALID_ORIGIN");
  }
  const input = acceptSchema.parse(request.body);
  const participant = await acceptDealInvitation(
    input.token,
    input.organizationId,
  );
  response.json({ ok: true, dealId: participant.dealId });
});
