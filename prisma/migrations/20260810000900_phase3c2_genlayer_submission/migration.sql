-- Phase 3C2: durable, server-owned GenLayer submission intent state.
CREATE TYPE "GenLayerSubmissionState" AS ENUM (
  'INTENT_CREATED',
  'DISPATCHING',
  'SUBMITTED',
  'FAILED_BEFORE_SEND',
  'UNKNOWN',
  'REVIEW_REQUIRED'
);

ALTER TYPE "DisputeWorkflowStatus" ADD VALUE 'GENLAYER_SUBMITTED';
ALTER TYPE "DisputeWorkflowStatus" ADD VALUE 'GENLAYER_SUBMISSION_UNKNOWN';
ALTER TYPE "DisputeWorkflowStatus" ADD VALUE 'REVIEW_REQUIRED';

ALTER TABLE "AdjudicationCase"
  ADD COLUMN "lastStatus" TEXT,
  ADD COLUMN "submissionDispatchAt" TIMESTAMP(3),
  ADD COLUMN "submissionRequestId" TEXT,
  ADD COLUMN "submissionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "submissionState" "GenLayerSubmissionState",
  ADD COLUMN "submissionSubmittedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AdjudicationCase_submissionRequestId_key"
  ON "AdjudicationCase"("submissionRequestId");

CREATE INDEX "AdjudicationCase_submissionState_nextAttemptAt_idx"
  ON "AdjudicationCase"("submissionState", "nextAttemptAt");
