import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import { ZodError } from "zod";

import { EvaluationProviderError } from "../server/ai-evaluation";
import { AuthorizationError } from "../server/auth";
import { DealInvitationError } from "../server/counterparty";
import { DisputePacketError } from "../server/dispute-packet";
import { DisputeWorkflowError } from "../server/dispute-workflow";
import { EvaluationValidationError } from "../server/evaluation-context";
import { EvidenceAuthorityError } from "../server/evidence-authority";
import { EvidenceBundleError } from "../server/evidence-bundle";
import { GenLayerSubmissionError } from "../server/genlayer-submission";
import { ProvenanceError } from "../server/provenance-services";
import { WalletOwnershipError } from "../server/counterparty";
import { WalletSessionError } from "../server/wallet-session";
import { CommercialLifecycleError } from "../server/xlayer-obligation-lifecycle";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    override readonly message: string,
    readonly code: string,
    /** Seconds the caller should wait, sent as Retry-After. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function unauthorized(message = "Authentication is required.") {
  return new ApiError(401, message, "UNAUTHENTICATED");
}

export function notFound(message = "That record was not found.") {
  return new ApiError(404, message, "NOT_FOUND");
}

/**
 * Domain failures carry deliberate, non-sensitive codes or operator-facing
 * copy, so they are surfaced verbatim with a status that reflects whether the
 * caller can retry the same request.
 */
function classify(error: unknown) {
  const bodyError = error as { type?: unknown };
  if (bodyError?.type === "entity.too.large")
    return {
      status: 413,
      message: "That request is larger than the allowed size.",
      code: "PAYLOAD_TOO_LARGE",
    };
  if (bodyError?.type === "entity.parse.failed")
    return {
      status: 400,
      message: "The request payload is invalid.",
      code: "INVALID_INPUT",
    };
  if (error instanceof ApiError)
    return {
      status: error.status,
      message: error.message,
      code: error.code,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  if (error instanceof AuthorizationError)
    return {
      status: 403,
      message: error.message,
      code: "NOT_AUTHORIZED",
    };
  if (error instanceof ZodError)
    return {
      status: 400,
      message: error.issues[0]?.message ?? "The request payload is invalid.",
      code: "INVALID_INPUT",
    };
  if (error instanceof ProvenanceError)
    return { status: 400, message: error.message, code: "INVALID_REQUEST" };
  if (error instanceof EvaluationValidationError)
    return { status: 400, message: error.message, code: "EVALUATION_REJECTED" };
  if (error instanceof EvidenceBundleError)
    return { status: 409, message: error.message, code: error.code };
  if (error instanceof GenLayerSubmissionError)
    return error.code === "GENLAYER_STATUS_UNAVAILABLE"
      ? {
          status: 503,
          message: "The GenLayer network could not be reached.",
          code: error.code,
          retryAfterSeconds: 15,
        }
      : { status: 409, message: error.message, code: error.code };
  if (error instanceof EvaluationProviderError)
    return error.code === "PROVIDER_TRANSIENT"
      ? {
          status: 503,
          message: "The evaluation service is temporarily unavailable.",
          code: "PROVIDER_UNAVAILABLE",
          retryAfterSeconds: 30,
        }
      : {
          status: 502,
          message: "The evaluation service returned an unusable result.",
          code: "PROVIDER_FAILED",
        };
  if (
    error instanceof DisputeWorkflowError ||
    error instanceof CommercialLifecycleError ||
    error instanceof EvidenceAuthorityError
  )
    return { status: 409, message: error.message, code: "STATE_CONFLICT" };
  if (error instanceof WalletSessionError)
    return { status: 401, message: error.message, code: error.code };
  if (
    error instanceof WalletOwnershipError ||
    error instanceof DealInvitationError ||
    error instanceof DisputePacketError
  )
    return { status: 400, message: error.message, code: "INVALID_REQUEST" };
  return null;
}

export const apiErrorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  if (response.headersSent) return next(error);
  const classified = classify(error);
  if (classified) {
    if (classified.retryAfterSeconds)
      response.setHeader("Retry-After", String(classified.retryAfterSeconds));
    response.status(classified.status).json({
      code: classified.code,
      message: classified.message,
    });
    return;
  }
  // Unclassified failures must never leak internal detail to the browser.
  console.error("tolerance.api.unhandled_error", {
    name: error instanceof Error ? error.name : typeof error,
  });
  response.status(500).json({
    code: "INTERNAL_ERROR",
    message: "Tolerance could not complete that request.",
  });
};

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    code: "NOT_FOUND",
    message: `No API route matches ${request.method} ${request.path}.`,
  });
};

/**
 * Express widens `params` to `string | string[]` when a route declares more
 * than one handler, which would break the Prisma `where` clauses below. Route
 * parameters are single segments here, so they are read through this helper.
 */
export function routeParam(request: Request, name: string): string {
  const value = request.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
