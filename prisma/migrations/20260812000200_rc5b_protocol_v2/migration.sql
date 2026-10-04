-- Additive V2 routing and source-reference fields. Existing obligations remain V1.
CREATE TYPE "ProtocolVersion" AS ENUM ('V1', 'V2');
ALTER TABLE "Obligation" ADD COLUMN "protocolVersion" "ProtocolVersion" NOT NULL DEFAULT 'V1';
ALTER TABLE "Obligation" ADD COLUMN "packetVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Obligation" ADD COLUMN "genLayerJudge" TEXT;
ALTER TABLE "EvidenceSourcePolicy" ADD COLUMN "sourcePolicyHash" TEXT;
ALTER TABLE "EvidenceSourcePolicy" ADD COLUMN "canonicalSourceUrl" TEXT;
ALTER TABLE "EvidenceSourcePolicy" ADD COLUMN "expectedContentHash" TEXT;
ALTER TABLE "EvidenceSourcePolicy" ADD COLUMN "expectedContentType" TEXT;
ALTER TABLE "EvidenceSourcePolicy" ADD COLUMN "extractionRule" TEXT;
CREATE INDEX "Obligation_protocolVersion_idx" ON "Obligation"("protocolVersion");
