CREATE TABLE "DisputePacketSnapshot" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "evidenceBundleId" TEXT NOT NULL,
    "evaluationContextId" TEXT NOT NULL,
    "aiEvaluationId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "disputePacketHash" TEXT NOT NULL,
    "canonicalJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisputePacketSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DisputePacketSnapshot_aiEvaluationId_disputePacketHash_key" ON "DisputePacketSnapshot"("aiEvaluationId", "disputePacketHash");
ALTER TABLE "DisputePacketSnapshot" ADD CONSTRAINT "DisputePacketSnapshot_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisputePacketSnapshot" ADD CONSTRAINT "DisputePacketSnapshot_evidenceBundleId_fkey" FOREIGN KEY ("evidenceBundleId") REFERENCES "EvidenceBundleSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisputePacketSnapshot" ADD CONSTRAINT "DisputePacketSnapshot_evaluationContextId_fkey" FOREIGN KEY ("evaluationContextId") REFERENCES "EvaluationContextSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisputePacketSnapshot" ADD CONSTRAINT "DisputePacketSnapshot_aiEvaluationId_fkey" FOREIGN KEY ("aiEvaluationId") REFERENCES "AiEvaluationSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
