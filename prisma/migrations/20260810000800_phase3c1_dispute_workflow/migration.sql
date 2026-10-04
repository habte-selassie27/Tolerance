-- Phase 3C1 adds application workflow coordination only. Existing observation
-- rows remain unclassified until explicitly adopted by a later migration.
CREATE TYPE "DisputeWorkflowStatus" AS ENUM (
    'PACKET_READY',
    'XLAYER_BINDING_PENDING',
    'XLAYER_DISPUTE_CONFIRMED',
    'GENLAYER_SUBMISSION_PENDING'
);

ALTER TABLE "AdjudicationCase"
    ALTER COLUMN "lifecycle" DROP DEFAULT,
    ALTER COLUMN "lifecycle" DROP NOT NULL,
    ADD COLUMN "disputePacketSnapshotId" TEXT,
    ADD COLUMN "requestedById" TEXT,
    ADD COLUMN "workflowStatus" "DisputeWorkflowStatus",
    ADD COLUMN "workflowVersion" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "xLayerDisputeTxHash" TEXT,
    ADD COLUMN "xLayerDisputeConfirmedAt" TIMESTAMP(3),
    ADD COLUMN "lastObservedAt" TIMESTAMP(3),
    ADD COLUMN "failureCode" TEXT,
    ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AdjudicationCase_xLayerDisputeTxHash_key"
    ON "AdjudicationCase"("xLayerDisputeTxHash");
CREATE UNIQUE INDEX "AdjudicationCase_obligationId_disputePacketSnapshotId_key"
    ON "AdjudicationCase"("obligationId", "disputePacketSnapshotId");
CREATE INDEX "AdjudicationCase_workflowStatus_idx"
    ON "AdjudicationCase"("workflowStatus");
CREATE INDEX "AdjudicationCase_disputePacketSnapshotId_idx"
    ON "AdjudicationCase"("disputePacketSnapshotId");

ALTER TABLE "AdjudicationCase"
    ADD CONSTRAINT "AdjudicationCase_disputePacketSnapshotId_fkey"
    FOREIGN KEY ("disputePacketSnapshotId") REFERENCES "DisputePacketSnapshot"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdjudicationCase"
    ADD CONSTRAINT "AdjudicationCase_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
