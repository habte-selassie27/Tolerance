CREATE TYPE "ResolutionVerificationLevel" AS ENUM (
  'FINALIZED_STATE_VERIFIED',
  'ATTESTATION_ELIGIBLE'
);

ALTER TYPE "DisputeWorkflowStatus" ADD VALUE 'GENLAYER_FINALIZED';
ALTER TYPE "DisputeWorkflowStatus" ADD VALUE 'ATTESTATION_BLOCKED';

CREATE TABLE "ResolutionObservation" (
  "id" TEXT NOT NULL,
  "adjudicationCaseId" TEXT NOT NULL,
  "genLayerTxHash" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "judgeAddress" TEXT NOT NULL,
  "genLayerChainId" INTEGER NOT NULL,
  "disputePacketHash" TEXT NOT NULL,
  "agreementHash" TEXT NOT NULL,
  "policyHash" TEXT NOT NULL,
  "evidenceRoot" TEXT NOT NULL,
  "canonicalJson" TEXT NOT NULL,
  "resultHash" TEXT NOT NULL,
  "verdict" TEXT NOT NULL,
  "observerVersion" TEXT NOT NULL,
  "verificationLevel" "ResolutionVerificationLevel" NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResolutionObservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResolutionObservation_adjudicationCaseId_key" ON "ResolutionObservation"("adjudicationCaseId");
CREATE UNIQUE INDEX "ResolutionObservation_genLayerTxHash_key" ON "ResolutionObservation"("genLayerTxHash");
CREATE UNIQUE INDEX "ResolutionObservation_caseId_resultHash_key" ON "ResolutionObservation"("caseId", "resultHash");
CREATE INDEX "ResolutionObservation_verificationLevel_idx" ON "ResolutionObservation"("verificationLevel");

ALTER TABLE "ResolutionObservation"
  ADD CONSTRAINT "ResolutionObservation_adjudicationCaseId_fkey"
  FOREIGN KEY ("adjudicationCaseId") REFERENCES "AdjudicationCase"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
