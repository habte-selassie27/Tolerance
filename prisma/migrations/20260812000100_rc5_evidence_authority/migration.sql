CREATE TYPE "EvidenceAuthorityLevel" AS ENUM (
  'PARTY_UPLOADED',
  'COUNTERPARTY_ACKNOWLEDGED',
  'PREAGREED_EXTERNAL_SOURCE',
  'THIRD_PARTY_SIGNED',
  'ONCHAIN_VERIFIED',
  'SERVER_FETCH_VERIFIED'
);

CREATE TYPE "EvidenceSourceMode" AS ENUM (
  'PRIVATE_DOCUMENT',
  'EXTERNAL_URL',
  'THIRD_PARTY_SIGNED_DOCUMENT',
  'ONCHAIN_RECORD'
);

ALTER TABLE "Evidence"
  ADD COLUMN "authorityLevel" "EvidenceAuthorityLevel" NOT NULL DEFAULT 'PARTY_UPLOADED';

CREATE TABLE "EvidenceSourcePolicy" (
  "id" TEXT NOT NULL,
  "obligationId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL DEFAULT '1',
  "sourceMode" "EvidenceSourceMode" NOT NULL,
  "minimumAuthority" "EvidenceAuthorityLevel" NOT NULL,
  "allowedDomain" TEXT,
  "exactUrl" TEXT,
  "urlPattern" TEXT,
  "expectedIssuer" TEXT,
  "expectedDocumentType" "DocumentType",
  "counterpartyAcknowledgementRequired" BOOLEAN NOT NULL DEFAULT false,
  "thirdPartySignatureRequired" BOOLEAN NOT NULL DEFAULT false,
  "validatorFetchIntended" BOOLEAN NOT NULL DEFAULT false,
  "frozenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvidenceSourcePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceAuthorityAcknowledgement" (
  "id" TEXT NOT NULL,
  "obligationId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "documentContentHash" TEXT NOT NULL,
  "acknowledgingOrganizationId" TEXT NOT NULL,
  "acknowledgingUserId" TEXT NOT NULL,
  "authorityVersion" TEXT NOT NULL DEFAULT '1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceAuthorityAcknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvidenceSourcePolicy_requirementId_key"
  ON "EvidenceSourcePolicy"("requirementId");
CREATE INDEX "EvidenceSourcePolicy_obligationId_frozenAt_idx"
  ON "EvidenceSourcePolicy"("obligationId", "frozenAt");
CREATE UNIQUE INDEX "EvidenceAuthorityAcknowledgement_evidenceId_acknowledgingOrganizationId_key"
  ON "EvidenceAuthorityAcknowledgement"("evidenceId", "acknowledgingOrganizationId");
CREATE INDEX "EvidenceAuthorityAcknowledgement_obligationId_evidenceId_idx"
  ON "EvidenceAuthorityAcknowledgement"("obligationId", "evidenceId");
CREATE INDEX "EvidenceAuthorityAcknowledgement_acknowledgingUserId_idx"
  ON "EvidenceAuthorityAcknowledgement"("acknowledgingUserId");

ALTER TABLE "EvidenceSourcePolicy"
  ADD CONSTRAINT "EvidenceSourcePolicy_obligationId_fkey"
  FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceSourcePolicy"
  ADD CONSTRAINT "EvidenceSourcePolicy_requirementId_fkey"
  FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceAuthorityAcknowledgement"
  ADD CONSTRAINT "EvidenceAuthorityAcknowledgement_obligationId_fkey"
  FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceAuthorityAcknowledgement"
  ADD CONSTRAINT "EvidenceAuthorityAcknowledgement_evidenceId_fkey"
  FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceAuthorityAcknowledgement"
  ADD CONSTRAINT "EvidenceAuthorityAcknowledgement_acknowledgingOrganizationId_fkey"
  FOREIGN KEY ("acknowledgingOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceAuthorityAcknowledgement"
  ADD CONSTRAINT "EvidenceAuthorityAcknowledgement_acknowledgingUserId_fkey"
  FOREIGN KEY ("acknowledgingUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
