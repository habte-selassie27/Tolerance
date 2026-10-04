CREATE TYPE "AttestationRoundStatus" AS ENUM ('BLOCKED', 'OPEN', 'THRESHOLD_REACHED', 'EXPIRED', 'CANCELED');

CREATE TABLE "AttestationRound" (
  "id" TEXT NOT NULL, "adjudicationCaseId" TEXT NOT NULL, "resolutionObservationId" TEXT NOT NULL,
  "payloadVersion" TEXT NOT NULL, "canonicalPayload" TEXT NOT NULL, "digest" TEXT NOT NULL,
  "nonce" TEXT NOT NULL, "expiry" TIMESTAMP(3) NOT NULL, "threshold" INTEGER NOT NULL,
  "allowedSigners" JSONB NOT NULL, "status" "AttestationRoundStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "AttestationRound_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AttestationRound_digest_key" ON "AttestationRound"("digest");
CREATE UNIQUE INDEX "AttestationRound_resolutionObservationId_payloadVersion_key" ON "AttestationRound"("resolutionObservationId", "payloadVersion");
CREATE INDEX "AttestationRound_status_expiry_idx" ON "AttestationRound"("status", "expiry");
ALTER TABLE "AttestationRound" ADD CONSTRAINT "AttestationRound_adjudicationCaseId_fkey" FOREIGN KEY ("adjudicationCaseId") REFERENCES "AdjudicationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttestationRound" ADD CONSTRAINT "AttestationRound_resolutionObservationId_fkey" FOREIGN KEY ("resolutionObservationId") REFERENCES "ResolutionObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AttestationSignature" (
  "id" TEXT NOT NULL, "roundId" TEXT NOT NULL, "signer" TEXT NOT NULL, "signature" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttestationSignature_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AttestationSignature_roundId_signer_key" ON "AttestationSignature"("roundId", "signer");
ALTER TABLE "AttestationSignature" ADD CONSTRAINT "AttestationSignature_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "AttestationRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
