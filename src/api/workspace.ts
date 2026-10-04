import "server-only";

import type { NextFunction, Request, RequestHandler, Response } from "express";

import { prisma } from "../lib/prisma";
import { setAuthenticatedSubject } from "../lib/request-context";
import { resolveCurrentWalletSession } from "../server/wallet-session";
import { ApiError } from "./errors";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function mutatingRequest(request: Request) {
  return MUTATING.has(request.method);
}

/**
 * A cookie-authenticated mutation must come from this origin. SameSite=Lax
 * already drops the cookie on a cross-site POST, so this is defence in depth
 * for the session that we mint ourselves.
 */
function sameOrigin(request: Request) {
  const site = request.headers["sec-fetch-site"];
  // Absent on non-browser clients such as curl; the cookie rules still apply.
  if (typeof site === "string" && site !== "same-origin" && site !== "none")
    return false;
  const origin = request.headers.origin;
  if (typeof origin !== "string") return true;
  return origin === `${request.protocol}://${request.headers.host}`;
}
import { createServerSupabaseClient } from "../lib/supabase";
import { guards, requireUser } from "../server/auth";
import { unauthorized } from "./errors";

/**
 * A fast session prefilter only. Every loader and action retains its own
 * server-side authorization check against organization membership.
 */
export const requireSession: RequestHandler = async (
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  try {
    // A first-party wallet session is an identity in its own right, so it is
    // accepted here rather than being forced through Supabase. A wallet account
    // carries no confirmed address, which the workspace shell reports so the
    // email step can gate it.
    const walletActor = await resolveCurrentWalletSession();
    if (walletActor) {
      if (mutatingRequest(request) && !sameOrigin(request)) {
        throw new ApiError(403, "Invalid request origin.", "INVALID_ORIGIN");
      }
      setAuthenticatedSubject({
        id: walletActor.authSubject,
        email: walletActor.email,
        emailConfirmedAt: null,
      });
      next();
      return;
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw unauthorized();
    if (mutatingRequest(request) && !sameOrigin(request)) {
      throw new ApiError(403, "Invalid request origin.", "INVALID_ORIGIN");
    }
    setAuthenticatedSubject({
      id: data.user.id,
      email: data.user.email ?? null,
      emailConfirmedAt: data.user.email_confirmed_at ?? null,
    });
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
