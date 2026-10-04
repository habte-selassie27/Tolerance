CREATE TYPE "AiEvaluationStatus" AS ENUM ('REQUESTED', 'SUCCEEDED_UNVALIDATED', 'VALIDATED', 'REJECTED', 'FAILED');

CREATE TABLE "AiEvaluationRun" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "evaluationContextId" TEXT NOT NULL,
    "evaluationContextHash" TEXT NOT NULL,
    "requestSchemaVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "AiEvaluationStatus" NOT NULL DEFAULT 'REQUESTED',
    "failureCode" TEXT,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "AiEvaluationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiEvaluationSnapshot" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "evaluationContextId" TEXT NOT NULL,
    "evaluationRunId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "evaluationContextHash" TEXT NOT NULL,
    "validatorVersion" TEXT NOT NULL,
    "evaluation" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiEvaluationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiEvaluationRun_evaluationContextId_provider_model_requestS_key" ON "AiEvaluationRun"("evaluationContextId", "provider", "model", "requestSchemaVersion", "idempotencyKey");
CREATE UNIQUE INDEX "AiEvaluationSnapshot_evaluationRunId_key" ON "AiEvaluationSnapshot"("evaluationRunId");
CREATE UNIQUE INDEX "AiEvaluationSnapshot_evaluationContextId_evaluationContextH_key" ON "AiEvaluationSnapshot"("evaluationContextId", "evaluationContextHash");

ALTER TABLE "AiEvaluationRun" ADD CONSTRAINT "AiEvaluationRun_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationRun" ADD CONSTRAINT "AiEvaluationRun_evaluationContextId_fkey" FOREIGN KEY ("evaluationContextId") REFERENCES "EvaluationContextSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationSnapshot" ADD CONSTRAINT "AiEvaluationSnapshot_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationSnapshot" ADD CONSTRAINT "AiEvaluationSnapshot_evaluationContextId_fkey" FOREIGN KEY ("evaluationContextId") REFERENCES "EvaluationContextSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiEvaluationSnapshot" ADD CONSTRAINT "AiEvaluationSnapshot_evaluationRunId_fkey" FOREIGN KEY ("evaluationRunId") REFERENCES "AiEvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
