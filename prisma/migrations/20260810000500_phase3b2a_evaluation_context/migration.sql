CREATE TABLE "EvaluationContextSnapshot" (
  "id" TEXT NOT NULL,
  "obligationId" TEXT NOT NULL,
  "evidenceBundleId" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "evaluationContextHash" TEXT NOT NULL,
  "canonicalJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvaluationContextSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EvaluationContextSnapshot_evidenceBundleId_evaluationContextHash_key" ON "EvaluationContextSnapshot"("evidenceBundleId", "evaluationContextHash");
ALTER TABLE "EvaluationContextSnapshot" ADD CONSTRAINT "EvaluationContextSnapshot_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvaluationContextSnapshot" ADD CONSTRAINT "EvaluationContextSnapshot_evidenceBundleId_fkey" FOREIGN KEY ("evidenceBundleId") REFERENCES "EvidenceBundleSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
