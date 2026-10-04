CREATE TABLE "EvidenceBundleSnapshot" (
  "id" TEXT NOT NULL,
  "obligationId" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "evidenceBundleHash" TEXT NOT NULL,
  "evidenceRoot" TEXT NOT NULL,
  "canonicalJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceBundleSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvidenceBundleSnapshot_obligationId_evidenceBundleHash_key"
  ON "EvidenceBundleSnapshot"("obligationId", "evidenceBundleHash");
CREATE UNIQUE INDEX "EvidenceBundleSnapshot_obligationId_evidenceRoot_key"
  ON "EvidenceBundleSnapshot"("obligationId", "evidenceRoot");

ALTER TABLE "EvidenceBundleSnapshot"
  ADD CONSTRAINT "EvidenceBundleSnapshot_obligationId_fkey"
  FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
