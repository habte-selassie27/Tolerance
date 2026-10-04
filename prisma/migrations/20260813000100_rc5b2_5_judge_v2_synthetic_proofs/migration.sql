-- RC5B2.5 is additive.  These isolated proof records deliberately have no
-- relation to commercial obligations, V1 escrow state, or V1 workflow state.
CREATE TYPE "JudgeV2SyntheticProofStatus" AS ENUM (
  'INTENT_CREATED',
  'DISPATCHING',
  'SUBMITTED',
  'FINALIZED',
  'FAILED_BEFORE_SEND',
  'UNKNOWN',
  'REVIEW_REQUIRED'
);

CREATE TABLE "JudgeV2SyntheticProof" (
  "id" TEXT NOT NULL,
  "protocolVersion" "ProtocolVersion" NOT NULL DEFAULT 'V2',
  "purpose" TEXT NOT NULL DEFAULT 'JUDGEV2_SYNTHETIC_PROOF',
  "caseId" TEXT NOT NULL,
  "judgeAddress" TEXT NOT NULL,
  "canonicalPacket" TEXT NOT NULL,
  "disputePacketHash" TEXT NOT NULL,
  "packetByteLength" INTEGER NOT NULL,
  "packetSha256" TEXT NOT NULL,
  "sourcePolicyHash" TEXT NOT NULL,
  "canonicalSourceUrl" TEXT NOT NULL,
  "expectedContentHash" TEXT,
  "expectedExtractHash" TEXT,
  "sourcePolicyFrozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "JudgeV2SyntheticProofStatus" NOT NULL DEFAULT 'INTENT_CREATED',
  "submissionTxHash" TEXT,
  "submissionRequestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submissionDispatchAt" TIMESTAMP(3),
  "submissionSubmittedAt" TIMESTAMP(3),
  "finalizedAt" TIMESTAMP(3),
  "sourceVerificationHash" TEXT,
  "verdict" TEXT,
  "resolvedCase" JSONB,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JudgeV2SyntheticProof_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JudgeV2SyntheticProof_caseId_key" ON "JudgeV2SyntheticProof"("caseId");
CREATE UNIQUE INDEX "JudgeV2SyntheticProof_submissionTxHash_key" ON "JudgeV2SyntheticProof"("submissionTxHash");
CREATE INDEX "JudgeV2SyntheticProof_status_submissionRequestedAt_idx" ON "JudgeV2SyntheticProof"("status", "submissionRequestedAt");
