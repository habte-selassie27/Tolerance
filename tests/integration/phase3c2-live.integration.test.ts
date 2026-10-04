import nextEnv from "@next/env";
import { describe, expect, it } from "vitest";

import {
  pollGenLayerSubmissionStatus,
  submitGenLayerCase,
} from "../../src/server/genlayer-submission";

if (process.env.RUN_PHASE3C2_LIVE_SUBMISSION !== "1") {
  throw new Error(
    "Set RUN_PHASE3C2_LIVE_SUBMISSION=1 for the controlled Studionet submission proof.",
  );
}

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const actorId = process.env.PHASE3C2_LIVE_ACTOR_ID;
const workflowId = process.env.PHASE3C2_LIVE_WORKFLOW_ID;
if (!actorId || !workflowId)
  throw new Error(
    "PHASE3C2_LIVE_ACTOR_ID and PHASE3C2_LIVE_WORKFLOW_ID are required for a pre-confirmed synthetic workflow.",
  );

describe("Phase 3C2 controlled Studionet submission", () => {
  it("submits only a server-owned, X Layer-confirmed workflow and polls safe status", async () => {
    const submitted = await submitGenLayerCase(actorId, workflowId);
    expect(submitted.workflow.workflowStatus).toBe("GENLAYER_SUBMITTED");
    expect(submitted.workflow.submissionTxHash).toMatch(/^0x[0-9a-f]{64}$/);
    const observed = await pollGenLayerSubmissionStatus(actorId, workflowId);
    expect(observed.status).toBeTruthy();
    expect(observed.workflow.submissionTxHash).toBe(
      submitted.workflow.submissionTxHash,
    );
  }, 120_000);
});
