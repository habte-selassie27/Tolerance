-- Tolerance application-owned Phase 3A data plane. This migration does not
-- touch Supabase-managed auth or storage schemas.
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "DealStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED');
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');
CREATE TYPE "AmendmentStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');
CREATE TYPE "DocumentType" AS ENUM ('AGREEMENT', 'AMENDMENT', 'TECHNICAL_SPECIFICATION', 'INSPECTION_REPORT', 'SHIPMENT_EVIDENCE', 'OTHER_EVIDENCE');
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'READY', 'REJECTED', 'DELETED');
CREATE TYPE "ObligationStatus" AS ENUM ('PREPARED', 'OBSERVED', 'DISPUTED', 'SETTLED', 'REFUNDED', 'CANCELLED');
CREATE TYPE "EvidenceStatus" AS ENUM ('REGISTERED', 'LOCKED', 'SUPERSEDED');
CREATE TYPE "AdjudicationLifecycle" AS ENUM ('SUBMITTED', 'PENDING', 'PROPOSING', 'COMMITTING', 'REVEALING', 'ACCEPTED', 'UNDETERMINED', 'FINALIZED', 'CANCELED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL, "authSubject" TEXT NOT NULL, "email" TEXT, "displayName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WalletAccount" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "chainFamily" TEXT NOT NULL, "network" TEXT NOT NULL,
  "address" TEXT NOT NULL, "normalizedAddress" TEXT NOT NULL, "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Organization" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrganizationMember" (
  "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("organizationId", "userId")
);
CREATE TABLE "Deal" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "reference" TEXT NOT NULL, "title" TEXT NOT NULL,
  "buyerOrganizationRef" TEXT NOT NULL, "supplierOrganizationRef" TEXT NOT NULL, "status" "DealStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Agreement" (
  "id" TEXT NOT NULL, "dealId" TEXT NOT NULL, "version" INTEGER NOT NULL, "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
  "documentId" TEXT, "agreementHash" TEXT NOT NULL, "effectiveAt" TIMESTAMP(3), "supersedesAgreementId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, "createdById" TEXT NOT NULL,
  CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Amendment" (
  "id" TEXT NOT NULL, "agreementId" TEXT NOT NULL, "version" INTEGER NOT NULL, "amendmentHash" TEXT NOT NULL, "documentId" TEXT,
  "status" "AmendmentStatus" NOT NULL DEFAULT 'DRAFT', "precedence" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Amendment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Obligation" (
  "id" TEXT NOT NULL, "dealId" TEXT NOT NULL, "agreementId" TEXT NOT NULL, "localStatus" "ObligationStatus" NOT NULL DEFAULT 'PREPARED',
  "createdById" TEXT NOT NULL, "buyerWallet" TEXT NOT NULL, "supplierWallet" TEXT NOT NULL, "amount" DECIMAL(78,0) NOT NULL,
  "tokenAddress" TEXT NOT NULL, "tokenDecimals" INTEGER NOT NULL, "xLayerChainId" INTEGER NOT NULL, "xLayerEscrow" TEXT NOT NULL,
  "xLayerObligationId" TEXT NOT NULL, "toleranceCaseId" TEXT NOT NULL, "agreementHash" TEXT NOT NULL, "policyHash" TEXT NOT NULL,
  "evidenceRoot" TEXT, "disputePacketHash" TEXT, "observedOnchainState" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Requirement" (
  "id" TEXT NOT NULL, "obligationId" TEXT NOT NULL, "requirementKey" TEXT NOT NULL, "title" TEXT NOT NULL,
  "description" TEXT NOT NULL, "category" TEXT NOT NULL, "governingSourceRef" TEXT NOT NULL, "acceptanceCriteria" TEXT NOT NULL,
  "evidenceExpectations" TEXT NOT NULL, "required" BOOLEAN NOT NULL DEFAULT true, "ordering" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Document" (
  "id" TEXT NOT NULL, "dealId" TEXT NOT NULL, "uploadedById" TEXT NOT NULL, "documentType" "DocumentType" NOT NULL,
  "originalFilename" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "byteSize" INTEGER NOT NULL, "contentHash" TEXT NOT NULL,
  "storageObjectKey" TEXT NOT NULL, "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING', "pageCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SourceBlock" (
  "id" TEXT NOT NULL, "documentId" TEXT NOT NULL, "pageNumber" INTEGER, "blockOrder" INTEGER NOT NULL,
  "normalizedText" TEXT NOT NULL, "sourceLocator" TEXT NOT NULL, "contentHash" TEXT NOT NULL, "extractionVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceBlock_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Evidence" (
  "id" TEXT NOT NULL, "obligationId" TEXT NOT NULL, "documentId" TEXT, "sourceBlockId" TEXT, "contentHash" TEXT NOT NULL,
  "bundleHash" TEXT NOT NULL, "status" "EvidenceStatus" NOT NULL DEFAULT 'REGISTERED', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "EvidenceRequirement" (
  "evidenceId" TEXT NOT NULL, "requirementId" TEXT NOT NULL,
  CONSTRAINT "EvidenceRequirement_pkey" PRIMARY KEY ("evidenceId", "requirementId")
);
CREATE TABLE "AdjudicationCase" (
  "id" TEXT NOT NULL, "obligationId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "disputePacketHash" TEXT NOT NULL,
  "judgeAddress" TEXT NOT NULL, "genLayerChainId" INTEGER NOT NULL, "submissionTxHash" TEXT,
  "lifecycle" "AdjudicationLifecycle" NOT NULL DEFAULT 'SUBMITTED', "finalizedVerdict" TEXT, "finalizedResultHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdjudicationCase_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProtocolEvent" (
  "id" TEXT NOT NULL, "obligationId" TEXT NOT NULL, "txHash" TEXT NOT NULL, "eventType" TEXT NOT NULL,
  "observedState" TEXT NOT NULL, "blockNumber" BIGINT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProtocolEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL, "actorId" TEXT, "organizationId" TEXT NOT NULL, "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL, "targetId" TEXT NOT NULL, "metadata" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_authSubject_key" ON "User"("authSubject");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "WalletAccount_chainFamily_network_normalizedAddress_key" ON "WalletAccount"("chainFamily", "network", "normalizedAddress");
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "Deal_organizationId_reference_key" ON "Deal"("organizationId", "reference");
CREATE UNIQUE INDEX "Agreement_dealId_version_key" ON "Agreement"("dealId", "version");
CREATE UNIQUE INDEX "Agreement_dealId_agreementHash_key" ON "Agreement"("dealId", "agreementHash");
CREATE UNIQUE INDEX "Amendment_agreementId_version_key" ON "Amendment"("agreementId", "version");
CREATE UNIQUE INDEX "Obligation_toleranceCaseId_key" ON "Obligation"("toleranceCaseId");
CREATE UNIQUE INDEX "Obligation_xLayerChainId_xLayerEscrow_xLayerObligationId_key" ON "Obligation"("xLayerChainId", "xLayerEscrow", "xLayerObligationId");
CREATE UNIQUE INDEX "Requirement_obligationId_requirementKey_key" ON "Requirement"("obligationId", "requirementKey");
CREATE UNIQUE INDEX "Document_storageObjectKey_key" ON "Document"("storageObjectKey");
CREATE UNIQUE INDEX "Document_dealId_contentHash_key" ON "Document"("dealId", "contentHash");
CREATE UNIQUE INDEX "SourceBlock_documentId_extractionVersion_blockOrder_key" ON "SourceBlock"("documentId", "extractionVersion", "blockOrder");
CREATE UNIQUE INDEX "Evidence_obligationId_contentHash_key" ON "Evidence"("obligationId", "contentHash");
CREATE UNIQUE INDEX "AdjudicationCase_caseId_key" ON "AdjudicationCase"("caseId");
CREATE UNIQUE INDEX "AdjudicationCase_submissionTxHash_key" ON "AdjudicationCase"("submissionTxHash");
CREATE UNIQUE INDEX "ProtocolEvent_txHash_eventType_key" ON "ProtocolEvent"("txHash", "eventType");

ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_supersedesAgreementId_fkey" FOREIGN KEY ("supersedesAgreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Amendment" ADD CONSTRAINT "Amendment_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Amendment" ADD CONSTRAINT "Amendment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SourceBlock" ADD CONSTRAINT "SourceBlock_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_sourceBlockId_fkey" FOREIGN KEY ("sourceBlockId") REFERENCES "SourceBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceRequirement" ADD CONSTRAINT "EvidenceRequirement_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceRequirement" ADD CONSTRAINT "EvidenceRequirement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdjudicationCase" ADD CONSTRAINT "AdjudicationCase_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProtocolEvent" ADD CONSTRAINT "ProtocolEvent_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
