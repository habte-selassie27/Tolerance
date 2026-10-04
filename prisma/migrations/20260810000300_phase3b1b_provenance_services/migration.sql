CREATE TABLE "EvidenceSourceBlock" ("evidenceId" TEXT NOT NULL, "sourceBlockId" TEXT NOT NULL, CONSTRAINT "EvidenceSourceBlock_pkey" PRIMARY KEY ("evidenceId", "sourceBlockId"));
ALTER TABLE "EvidenceSourceBlock" ADD CONSTRAINT "EvidenceSourceBlock_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceSourceBlock" ADD CONSTRAINT "EvidenceSourceBlock_sourceBlockId_fkey" FOREIGN KEY ("sourceBlockId") REFERENCES "SourceBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
