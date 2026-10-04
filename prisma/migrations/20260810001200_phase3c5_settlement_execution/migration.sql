CREATE TYPE "SettlementExecutionStatus" AS ENUM ('INTENT_CREATED', 'DISPATCHING', 'SUBMITTED', 'FINALIZED', 'FAILED_BEFORE_SEND', 'SETTLEMENT_UNKNOWN', 'REVIEW_REQUIRED');
CREATE TABLE "SettlementExecution" (
  "id" TEXT NOT NULL, "attestationRoundId" TEXT NOT NULL, "transactionHash" TEXT,
  "status" "SettlementExecutionStatus" NOT NULL, "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3), "finalizedAt" TIMESTAMP(3), "finalizedBlock" BIGINT,
  "finalEscrowState" TEXT, "failureCode" TEXT, "nextAttemptAt" TIMESTAMP(3),
  CONSTRAINT "SettlementExecution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SettlementExecution_attestationRoundId_key" ON "SettlementExecution"("attestationRoundId");
CREATE UNIQUE INDEX "SettlementExecution_transactionHash_key" ON "SettlementExecution"("transactionHash");
CREATE INDEX "SettlementExecution_status_nextAttemptAt_idx" ON "SettlementExecution"("status", "nextAttemptAt");
ALTER TABLE "SettlementExecution" ADD CONSTRAINT "SettlementExecution_attestationRoundId_fkey" FOREIGN KEY ("attestationRoundId") REFERENCES "AttestationRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
