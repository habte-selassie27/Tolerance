import { routeParam } from "../errors";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { requireUser } from "../../server/auth";
import {
  confirmXLayerDisputeBinding,
  createDisputeWorkflow,
  prepareXLayerEnterDispute,
} from "../../server/dispute-workflow";
import {
  genLayerSubmissionMode,
  pollGenLayerSubmissionStatus,
  requestGenLayerCaseSubmission,
  submitGenLayerCase,
} from "../../server/genlayer-submission";
import { observeGenLayerResolution } from "../../server/resolution-observation";
import {
  requireSession,
  requireWorkflowAccess,
  workspaceActor,
} from "../workspace";

export const disputesRouter: Router = Router();

const startSchema = z.object({ obligationId: z.uuid() });
const prepareSchema = z.object({
  workflowVersion: z.number().int().nonnegative(),
});
const confirmSchema = z.object({
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

disputesRouter.get("/disputes", requireSession, async (_request, response) => {
  const actor = await workspaceActor();
  const rows = await prisma.adjudicationCase.findMany({
    where: {
      obligation: {
        deal: { organization: { members: { some: { userId: actor.id } } } },
      },
    },
    include: { obligation: { include: { deal: true } } },
    orderBy: { updatedAt: "desc" },
  });
  response.json({
    disputes: rows.map((row) => ({
      id: row.id,
      xLayerObligationId: row.obligation.xLayerObligationId,
      dealTitle: row.obligation.deal.title,
      workflowStatus: row.workflowStatus,
      lifecycle: row.lifecycle,
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
});

disputesRouter.get(
  "/disputes/:workflowId",
  requireSession,
  async (request, response) => {
    const { workflow } = await requireWorkflowAccess(
      routeParam(request, "workflowId"),
    );
    const observation = workflow.resolutionObservation;
    const round = observation?.attestationRounds[0];
    const settlement = round?.settlementExecution;
    response.json({
      id: workflow.id,
      workflowVersion: workflow.workflowVersion,
      workflowStatus: workflow.workflowStatus ?? "PACKET_READY",
      lifecycle: workflow.lifecycle,
      caseId: workflow.caseId,
      disputePacketHash: workflow.disputePacketHash,
      judgeAddress: workflow.judgeAddress,
      xLayerDisputeTxHash: workflow.xLayerDisputeTxHash,
      deal: {
        id: workflow.obligation.dealId,
        title: workflow.obligation.deal.title,
      },
      obligation: {
        id: workflow.obligation.id,
        xLayerObligationId: workflow.obligation.xLayerObligationId,
        buyerWallet: workflow.obligation.buyerWallet,
      },
      observation: observation ? { verdict: observation.verdict } : null,
      settlementVerification: round
        ? {
            signatureCount: round.signatures.length,
            threshold: round.threshold,
            status: round.status,
          }
        : null,
      settlement: settlement
        ? {
            status: settlement.status,
            transactionHash: settlement.transactionHash,
          }
        : null,
    });
  },
);

disputesRouter.post("/disputes", requireSession, async (request, response) => {
  const actor = await requireUser();
  const input = startSchema.parse(request.body);
  const result = await createDisputeWorkflow(actor.id, input.obligationId);
  response.status(201).json({
    ok: true,
    workflowId: result.workflow.id,
    reused: result.reused,
  });
});

disputesRouter.post(
  "/disputes/:workflowId/prepare",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const input = prepareSchema.parse(request.body);
    const result = await prepareXLayerEnterDispute(
      actor.id,
      routeParam(request, "workflowId"),
      input.workflowVersion,
    );
    response.json({
      workflowVersion: result.workflow.workflowVersion,
      transaction: result.transaction,
    });
  },
);

disputesRouter.post(
  "/disputes/:workflowId/confirm",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const input = confirmSchema.parse(request.body);
    await confirmXLayerDisputeBinding(
      actor.id,
      routeParam(request, "workflowId"),
      input.transactionHash,
    );
    response.json({ ok: true });
  },
);

disputesRouter.post(
  "/disputes/:workflowId/genlayer-submission",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    if (genLayerSubmissionMode() === "worker") {
      await requestGenLayerCaseSubmission(
        actor.id,
        routeParam(request, "workflowId"),
      );
    } else {
      await submitGenLayerCase(actor.id, routeParam(request, "workflowId"));
    }
    response.json({ ok: true });
  },
);

disputesRouter.post(
  "/disputes/:workflowId/poll",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const result = await pollGenLayerSubmissionStatus(
      actor.id,
      routeParam(request, "workflowId"),
    );
    response.json({
      ok: true,
      workflowId: result.workflow.id,
      workflowStatus: result.workflow.workflowStatus,
      submissionState: result.workflow.submissionState,
      lastStatus: result.workflow.lastStatus,
      failureCode: result.workflow.failureCode,
      status: result.status,
    });
  },
);

disputesRouter.post(
  "/disputes/:workflowId/observe",
  requireSession,
  async (request, response) => {
    const actor = await requireUser();
    const workflowId = routeParam(request, "workflowId");
    const result = await observeGenLayerResolution(actor.id, workflowId);
    response.json({
      ok: true,
      reused: result.reused,
      workflowId,
      observation: {
        id: result.observation.id,
        verdict: result.observation.verdict,
        verificationLevel: result.observation.verificationLevel,
        resultHash: result.observation.resultHash,
        disputePacketHash: result.observation.disputePacketHash,
        genLayerTxHash: result.observation.genLayerTxHash,
        observedAt: result.observation.observedAt,
      },
    });
  },
);
