import "server-only";

import type { NextFunction, Request, RequestHandler, Response } from "express";

import { prisma } from "../lib/prisma";
import { createServerSupabaseClient } from "../lib/supabase/server";
import { guards, requireUser } from "../server/auth";
import { unauthorized } from "./errors";

/**
 * A fast session prefilter only. Every loader and action retains its own
 * server-side authorization check against organization membership.
 */
export const requireSession: RequestHandler = async (
  _request: Request,
  _response: Response,
  next: NextFunction,
) => {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw unauthorized();
    next();
  } catch (error) {
    next(error);
  }
};

export async function workspaceActor() {
  return requireUser();
}

export async function requireDealAccess(dealId: string) {
  const actor = await workspaceActor();
  await guards.requireDealAccess(actor.id, dealId);
  return actor;
}

export async function requireWorkflowAccess(workflowId: string) {
  const actor = await workspaceActor();
  const workflow = await prisma.adjudicationCase.findUnique({
    where: { id: workflowId },
    include: {
      obligation: { include: { deal: true } },
      disputePacketSnapshot: true,
      resolutionObservation: {
        include: {
          attestationRounds: {
            include: { settlementExecution: true, signatures: true },
          },
        },
      },
    },
  });
  if (!workflow) throw unauthorized("That dispute was not found.");
  await guards.requireDealAccess(actor.id, workflow.obligation.dealId);
  return { actor, workflow };
}
