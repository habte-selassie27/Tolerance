import { routeParam } from "../errors";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import {
  createWalletChallenge,
  unlinkWallet,
  verifyWalletChallenge,
} from "../../server/counterparty";
import { requireUser } from "../../server/auth";
import { requireSession, workspaceActor } from "../workspace";

export const accountRouter: Router = Router();

const challengeSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});
const verifySchema = z.object({ signature: z.string().min(1).max(512) });

accountRouter.get("/activity", requireSession, async (_request, response) => {
  const actor = await workspaceActor();
  const events = await prisma.auditEvent.findMany({
    where: { organization: { members: { some: { userId: actor.id } } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  response.json({
    events: events.map((event) => ({
      id: event.id,
      action: event.action,
      targetType: event.targetType,
      createdAt: event.createdAt.toISOString(),
    })),
  });
});

accountRouter.get("/account", requireSession, async (_request, response) => {
  const actor = await workspaceActor();
  const [memberships, wallets] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { userId: actor.id },
      include: { organization: true },
    }),
    prisma.walletAccount.findMany({
      where: { userId: actor.id, verificationStatus: "VERIFIED" },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  response.json({
    displayName: actor.displayName,
    email: actor.email,
    organizations: memberships.map(({ organization, role }) => ({
      id: organization.id,
      name: organization.name,
      role,
    })),
    wallets: wallets.map((wallet) => ({
      id: wallet.id,
      address: wallet.address,
    })),
  });
});

accountRouter.post(
  "/wallets/challenges",
  requireSession,
  async (request, response) => {
    await requireUser();
    const input = challengeSchema.parse(request.body);
    response.status(201).json(await createWalletChallenge(input.address));
  },
);

accountRouter.post(
  "/wallets/challenges/:challengeId/verification",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const input = verifySchema.parse(request.body);
    await verifyWalletChallenge(
      routeParam(request, "challengeId"),
      input.signature,
    );
    response.json({ ok: true, verifiedFor: actor.id });
  },
);

accountRouter.delete(
  "/wallets/:walletId",
  requireSession,
  async (request, response) => {
    await requireUser();
    await unlinkWallet(routeParam(request, "walletId"));
    response.json({ ok: true });
  },
);
