-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AmendmentStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('AGREEMENT', 'AMENDMENT', 'TECHNICAL_SPECIFICATION', 'INSPECTION_REPORT', 'SHIPMENT_EVIDENCE', 'OTHER_EVIDENCE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'UPLOADED', 'READY_FOR_EXTRACTION', 'EXTRACTING', 'EXTRACTED', 'FAILED', 'OCR_REQUIRED', 'READY', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('PREPARED', 'OBSERVED', 'DISPUTED', 'SETTLED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProtocolVersion" AS ENUM ('V1', 'V2');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('REGISTERED', 'LOCKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "EvidenceAuthorityLevel" AS ENUM ('PARTY_UPLOADED', 'COUNTERPARTY_ACKNOWLEDGED', 'PREAGREED_EXTERNAL_SOURCE', 'THIRD_PARTY_SIGNED', 'ONCHAIN_VERIFIED', 'SERVER_FETCH_VERIFIED');

-- CreateEnum
CREATE TYPE "EvidenceSourceMode" AS ENUM ('PRIVATE_DOCUMENT', 'EXTERNAL_URL', 'THIRD_PARTY_SIGNED_DOCUMENT', 'ONCHAIN_RECORD');

-- CreateEnum
CREATE TYPE "AdjudicationLifecycle" AS ENUM ('SUBMITTED', 'PENDING', 'PROPOSING', 'COMMITTING', 'REVEALING', 'ACCEPTED', 'UNDETERMINED', 'FINALIZED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AiEvaluationStatus" AS ENUM ('REQUESTED', 'SUCCEEDED_UNVALIDATED', 'VALIDATED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeWorkflowStatus" AS ENUM ('PACKET_READY', 'XLAYER_BINDING_PENDING', 'XLAYER_DISPUTE_CONFIRMED', 'GENLAYER_SUBMISSION_PENDING', 'GENLAYER_SUBMITTED', 'GENLAYER_FINALIZED', 'ATTESTATION_BLOCKED', 'ATTESTATION_PENDING', 'ATTESTATION_READY', 'SETTLEMENT_PENDING', 'SETTLEMENT_SUBMITTED', 'SETTLED', 'REFUNDED', 'SETTLEMENT_UNKNOWN', 'GENLAYER_SUBMISSION_UNKNOWN', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "ResolutionVerificationLevel" AS ENUM ('FINALIZED_STATE_VERIFIED', 'ATTESTATION_ELIGIBLE');

-- CreateEnum
CREATE TYPE "AttestationRoundStatus" AS ENUM ('BLOCKED', 'OPEN', 'THRESHOLD_REACHED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SettlementExecutionStatus" AS ENUM ('INTENT_CREATED', 'DISPATCHING', 'SUBMITTED', 'FINALIZED', 'FAILED_BEFORE_SEND', 'SETTLEMENT_UNKNOWN', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "DealParticipantRole" AS ENUM ('BUYER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "DealInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProtocolActionStatus" AS ENUM ('PREPARED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "GenLayerSubmissionState" AS ENUM ('INTENT_CREATED', 'DISPATCHING', 'SUBMITTED', 'FAILED_BEFORE_SEND', 'UNKNOWN', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "JudgeV2SyntheticProofStatus" AS ENUM ('INTENT_CREATED', 'DISPATCHING', 'SUBMITTED', 'FINALIZED', 'FAILED_BEFORE_SEND', 'UNKNOWN', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "authSubject" TEXT NOT NULL,
    "email" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chainFamily" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "normalizedAddress" TEXT NOT NULL,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "normalizedAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "buyerOrganizationRef" TEXT NOT NULL,
    "supplierOrganizationRef" TEXT NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealParticipant" (
    "dealId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "DealParticipantRole" NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealParticipant_pkey" PRIMARY KEY ("dealId","organizationId")
);

-- CreateTable
CREATE TABLE "DealInvitation" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "invitingOrganizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "intendedEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" "DealParticipantRole" NOT NULL,
    "status" "DealInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByOrganizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agreement" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
    "documentId" TEXT,
    "agreementHash" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "supersedesAgreementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Amendment" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "amendmentHash" TEXT NOT NULL,
    "documentId" TEXT,
    "status" "AmendmentStatus" NOT NULL DEFAULT 'DRAFT',
    "precedence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Amendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "localStatus" "ObligationStatus" NOT NULL DEFAULT 'PREPARED',
    "protocolVersion" "ProtocolVersion" NOT NULL DEFAULT 'V1',
    "packetVersion" INTEGER NOT NULL DEFAULT 1,
    "genLayerJudge" TEXT,
    "createdById" TEXT NOT NULL,
    "buyerWallet" TEXT NOT NULL,
    "supplierWallet" TEXT NOT NULL,
    "amount" DECIMAL(78,0) NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "tokenDecimals" INTEGER NOT NULL,
    "xLayerChainId" INTEGER NOT NULL,
    "xLayerEscrow" TEXT NOT NULL,
    "xLayerObligationId" TEXT NOT NULL,
    "toleranceCaseId" TEXT NOT NULL,
    "agreementHash" TEXT NOT NULL,
    "policyHash" TEXT NOT NULL,
    "evidenceRoot" TEXT,
    "disputePacketHash" TEXT,
    "observedOnchainState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtocolActionIntent" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "expectedState" TEXT NOT NULL,
    "transactionHash" TEXT,
    "status" "ProtocolActionStatus" NOT NULL DEFAULT 'PREPARED',
    "calldataHash" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProtocolActionIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "governingSourceRef" TEXT NOT NULL,
    "acceptanceCriteria" TEXT NOT NULL,
    "evidenceExpectations" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "ordering" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storageObjectKey" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "pageCount" INTEGER,
    "extractorVersion" TEXT,
    "processingError" TEXT,
    "extractionStartedAt" TIMESTAMP(3),
    "extractionCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceBlock" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "blockOrder" INTEGER NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "sourceLocator" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "extractionVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementSourceBlock" (
    "requirementId" TEXT NOT NULL,
    "sourceBlockId" TEXT NOT NULL,
    "precedence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RequirementSourceBlock_pkey" PRIMARY KEY ("requirementId","sourceBlockId")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "documentId" TEXT,
    "sourceBlockId" TEXT,
    "contentHash" TEXT NOT NULL,
    "bundleHash" TEXT NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'REGISTERED',
    "authorityLevel" "EvidenceAuthorityLevel" NOT NULL DEFAULT 'PARTY_UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "sourcePolicyHash" TEXT,
    "canonicalSourceUrl" TEXT,
    "expectedContentHash" TEXT,
    "expectedContentType" TEXT,
    "extractionRule" TEXT,
    "frozenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceSourcePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "EvidenceSourceBlock" (
    "evidenceId" TEXT NOT NULL,
    "sourceBlockId" TEXT NOT NULL,

    CONSTRAINT "EvidenceSourceBlock_pkey" PRIMARY KEY ("evidenceId","sourceBlockId")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "EvidenceRequirement" (
    "evidenceId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,

    CONSTRAINT "EvidenceRequirement_pkey" PRIMARY KEY ("evidenceId","requirementId")
);

-- CreateTable
CREATE TABLE "AdjudicationCase" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "disputePacketSnapshotId" TEXT,
    "requestedById" TEXT,
    "caseId" TEXT NOT NULL,
    "disputePacketHash" TEXT NOT NULL,
    "judgeAddress" TEXT NOT NULL,
    "genLayerChainId" INTEGER NOT NULL,
    "submissionTxHash" TEXT,
    "submissionRequestId" TEXT,
    "submissionState" "GenLayerSubmissionState",
    "submissionRequestedAt" TIMESTAMP(3),
    "submissionDispatchAt" TIMESTAMP(3),
    "submissionSubmittedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lifecycle" "AdjudicationLifecycle",
    "workflowStatus" "DisputeWorkflowStatus",
    "workflowVersion" INTEGER NOT NULL DEFAULT 0,
    "xLayerDisputeTxHash" TEXT,
    "xLayerDisputeConfirmedAt" TIMESTAMP(3),
    "lastObservedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "finalizedVerdict" TEXT,
    "finalizedResultHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdjudicationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "ResolutionObservation" (
    "id" TEXT NOT NULL,
    "adjudicationCaseId" TEXT NOT NULL,
    "genLayerTxHash" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "judgeAddress" TEXT NOT NULL,
    "genLayerChainId" INTEGER NOT NULL,
    "disputePacketHash" TEXT NOT NULL,
    "agreementHash" TEXT NOT NULL,
    "policyHash" TEXT NOT NULL,
    "evidenceRoot" TEXT NOT NULL,
    "canonicalJson" TEXT NOT NULL,
    "resultHash" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "observerVersion" TEXT NOT NULL,
    "verificationLevel" "ResolutionVerificationLevel" NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResolutionObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttestationRound" (
    "id" TEXT NOT NULL,
    "adjudicationCaseId" TEXT NOT NULL,
    "resolutionObservationId" TEXT NOT NULL,
    "payloadVersion" TEXT NOT NULL,
    "canonicalPayload" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiry" TIMESTAMP(3) NOT NULL,
    "threshold" INTEGER NOT NULL,
    "allowedSigners" JSONB NOT NULL,
    "status" "AttestationRoundStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AttestationRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttestationSignature" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "signer" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttestationSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementExecution" (
    "id" TEXT NOT NULL,
    "attestationRoundId" TEXT NOT NULL,
    "transactionHash" TEXT,
    "status" "SettlementExecutionStatus" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "finalizedBlock" BIGINT,
    "finalEscrowState" TEXT,
    "failureCode" TEXT,
    "nextAttemptAt" TIMESTAMP(3),

    CONSTRAINT "SettlementExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtocolEvent" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "observedState" TEXT NOT NULL,
    "blockNumber" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProtocolEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "organizationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_authSubject_key" ON "User"("authSubject");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_chainFamily_network_normalizedAddress_key" ON "WalletAccount"("chainFamily", "network", "normalizedAddress");

-- CreateIndex
CREATE UNIQUE INDEX "WalletChallenge_nonce_key" ON "WalletChallenge"("nonce");

-- CreateIndex
CREATE INDEX "WalletChallenge_userId_expiresAt_idx" ON "WalletChallenge"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_organizationId_reference_key" ON "Deal"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "DealParticipant_organizationId_idx" ON "DealParticipant"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DealParticipant_dealId_role_key" ON "DealParticipant"("dealId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "DealInvitation_tokenHash_key" ON "DealInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "DealInvitation_dealId_status_idx" ON "DealInvitation"("dealId", "status");

-- CreateIndex
CREATE INDEX "DealInvitation_intendedEmail_status_idx" ON "DealInvitation"("intendedEmail", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_dealId_version_key" ON "Agreement"("dealId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Agreement_dealId_agreementHash_key" ON "Agreement"("dealId", "agreementHash");

-- CreateIndex
CREATE UNIQUE INDEX "Amendment_agreementId_version_key" ON "Amendment"("agreementId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Obligation_toleranceCaseId_key" ON "Obligation"("toleranceCaseId");

-- CreateIndex
CREATE INDEX "Obligation_protocolVersion_idx" ON "Obligation"("protocolVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Obligation_xLayerChainId_xLayerEscrow_xLayerObligationId_key" ON "Obligation"("xLayerChainId", "xLayerEscrow", "xLayerObligationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolActionIntent_transactionHash_key" ON "ProtocolActionIntent"("transactionHash");

-- CreateIndex
CREATE INDEX "ProtocolActionIntent_status_updatedAt_idx" ON "ProtocolActionIntent"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolActionIntent_obligationId_action_expectedState_key" ON "ProtocolActionIntent"("obligationId", "action", "expectedState");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_obligationId_requirementKey_key" ON "Requirement"("obligationId", "requirementKey");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageObjectKey_key" ON "Document"("storageObjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "Document_dealId_contentHash_key" ON "Document"("dealId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "SourceBlock_documentId_extractionVersion_blockOrder_key" ON "SourceBlock"("documentId", "extractionVersion", "blockOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_obligationId_contentHash_key" ON "Evidence"("obligationId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceSourcePolicy_requirementId_key" ON "EvidenceSourcePolicy"("requirementId");

-- CreateIndex
CREATE INDEX "EvidenceSourcePolicy_obligationId_frozenAt_idx" ON "EvidenceSourcePolicy"("obligationId", "frozenAt");

-- CreateIndex
CREATE INDEX "EvidenceAuthorityAcknowledgement_obligationId_evidenceId_idx" ON "EvidenceAuthorityAcknowledgement"("obligationId", "evidenceId");

-- CreateIndex
CREATE INDEX "EvidenceAuthorityAcknowledgement_acknowledgingUserId_idx" ON "EvidenceAuthorityAcknowledgement"("acknowledgingUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceAuthorityAcknowledgement_evidenceId_acknowledgingOr_key" ON "EvidenceAuthorityAcknowledgement"("evidenceId", "acknowledgingOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceBundleSnapshot_obligationId_evidenceBundleHash_key" ON "EvidenceBundleSnapshot"("obligationId", "evidenceBundleHash");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceBundleSnapshot_obligationId_evidenceRoot_key" ON "EvidenceBundleSnapshot"("obligationId", "evidenceRoot");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationContextSnapshot_evidenceBundleId_evaluationContex_key" ON "EvaluationContextSnapshot"("evidenceBundleId", "evaluationContextHash");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluationRun_evaluationContextId_provider_model_requestS_key" ON "AiEvaluationRun"("evaluationContextId", "provider", "model", "requestSchemaVersion", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluationSnapshot_evaluationRunId_key" ON "AiEvaluationSnapshot"("evaluationRunId");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluationSnapshot_evaluationContextId_evaluationContextH_key" ON "AiEvaluationSnapshot"("evaluationContextId", "evaluationContextHash");

-- CreateIndex
CREATE UNIQUE INDEX "DisputePacketSnapshot_aiEvaluationId_disputePacketHash_key" ON "DisputePacketSnapshot"("aiEvaluationId", "disputePacketHash");

-- CreateIndex
CREATE UNIQUE INDEX "AdjudicationCase_caseId_key" ON "AdjudicationCase"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "AdjudicationCase_submissionTxHash_key" ON "AdjudicationCase"("submissionTxHash");

-- CreateIndex
CREATE UNIQUE INDEX "AdjudicationCase_submissionRequestId_key" ON "AdjudicationCase"("submissionRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "AdjudicationCase_xLayerDisputeTxHash_key" ON "AdjudicationCase"("xLayerDisputeTxHash");

-- CreateIndex
CREATE INDEX "AdjudicationCase_workflowStatus_idx" ON "AdjudicationCase"("workflowStatus");

-- CreateIndex
CREATE INDEX "AdjudicationCase_disputePacketSnapshotId_idx" ON "AdjudicationCase"("disputePacketSnapshotId");

-- CreateIndex
CREATE INDEX "AdjudicationCase_submissionState_nextAttemptAt_idx" ON "AdjudicationCase"("submissionState", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdjudicationCase_obligationId_disputePacketSnapshotId_key" ON "AdjudicationCase"("obligationId", "disputePacketSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeV2SyntheticProof_caseId_key" ON "JudgeV2SyntheticProof"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeV2SyntheticProof_submissionTxHash_key" ON "JudgeV2SyntheticProof"("submissionTxHash");

-- CreateIndex
CREATE INDEX "JudgeV2SyntheticProof_status_submissionRequestedAt_idx" ON "JudgeV2SyntheticProof"("status", "submissionRequestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionObservation_adjudicationCaseId_key" ON "ResolutionObservation"("adjudicationCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionObservation_genLayerTxHash_key" ON "ResolutionObservation"("genLayerTxHash");

-- CreateIndex
CREATE INDEX "ResolutionObservation_verificationLevel_idx" ON "ResolutionObservation"("verificationLevel");

-- CreateIndex
CREATE UNIQUE INDEX "ResolutionObservation_caseId_resultHash_key" ON "ResolutionObservation"("caseId", "resultHash");

-- CreateIndex
CREATE UNIQUE INDEX "AttestationRound_digest_key" ON "AttestationRound"("digest");

-- CreateIndex
CREATE INDEX "AttestationRound_status_expiry_idx" ON "AttestationRound"("status", "expiry");

-- CreateIndex
CREATE UNIQUE INDEX "AttestationRound_resolutionObservationId_payloadVersion_key" ON "AttestationRound"("resolutionObservationId", "payloadVersion");

-- CreateIndex
CREATE UNIQUE INDEX "AttestationSignature_roundId_signer_key" ON "AttestationSignature"("roundId", "signer");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementExecution_attestationRoundId_key" ON "SettlementExecution"("attestationRoundId");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementExecution_transactionHash_key" ON "SettlementExecution"("transactionHash");

-- CreateIndex
CREATE INDEX "SettlementExecution_status_nextAttemptAt_idx" ON "SettlementExecution"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProtocolEvent_txHash_eventType_key" ON "ProtocolEvent"("txHash", "eventType");

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletChallenge" ADD CONSTRAINT "WalletChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealParticipant" ADD CONSTRAINT "DealParticipant_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealParticipant" ADD CONSTRAINT "DealParticipant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealInvitation" ADD CONSTRAINT "DealInvitation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealInvitation" ADD CONSTRAINT "DealInvitation_invitingOrganizationId_fkey" FOREIGN KEY ("invitingOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealInvitation" ADD CONSTRAINT "DealInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agreement" ADD CONSTRAINT "Agreement_supersedesAgreementId_fkey" FOREIGN KEY ("supersedesAgreementId") REFERENCES "Agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Amendment" ADD CONSTRAINT "Amendment_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Amendment" ADD CONSTRAINT "Amendment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "Agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obligation" ADD CONSTRAINT "Obligation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocolActionIntent" ADD CONSTRAINT "ProtocolActionIntent_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocolActionIntent" ADD CONSTRAINT "ProtocolActionIntent_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceBlock" ADD CONSTRAINT "SourceBlock_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementSourceBlock" ADD CONSTRAINT "RequirementSourceBlock_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementSourceBlock" ADD CONSTRAINT "RequirementSourceBlock_sourceBlockId_fkey" FOREIGN KEY ("sourceBlockId") REFERENCES "SourceBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_sourceBlockId_fkey" FOREIGN KEY ("sourceBlockId") REFERENCES "SourceBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSourcePolicy" ADD CONSTRAINT "EvidenceSourcePolicy_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSourcePolicy" ADD CONSTRAINT "EvidenceSourcePolicy_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAuthorityAcknowledgement" ADD CONSTRAINT "EvidenceAuthorityAcknowledgement_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAuthorityAcknowledgement" ADD CONSTRAINT "EvidenceAuthorityAcknowledgement_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAuthorityAcknowledgement" ADD CONSTRAINT "EvidenceAuthorityAcknowledgement_acknowledgingOrganization_fkey" FOREIGN KEY ("acknowledgingOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceAuthorityAcknowledgement" ADD CONSTRAINT "EvidenceAuthorityAcknowledgement_acknowledgingUserId_fkey" FOREIGN KEY ("acknowledgingUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSourceBlock" ADD CONSTRAINT "EvidenceSourceBlock_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceSourceBlock" ADD CONSTRAINT "EvidenceSourceBlock_sourceBlockId_fkey" FOREIGN KEY ("sourceBlockId") REFERENCES "SourceBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceBundleSnapshot" ADD CONSTRAINT "EvidenceBundleSnapshot_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationContextSnapshot" ADD CONSTRAINT "EvaluationContextSnapshot_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationContextSnapshot" ADD CONSTRAINT "EvaluationContextSnapshot_evidenceBundleId_fkey" FOREIGN KEY ("evidenceBundleId") REFERENCES "EvidenceBundleSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationRun" ADD CONSTRAINT "AiEvaluationRun_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationRun" ADD CONSTRAINT "AiEvaluationRun_evaluationContextId_fkey" FOREIGN KEY ("evaluationContextId") REFERENCES "EvaluationContextSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationSnapshot" ADD CONSTRAINT "AiEvaluationSnapshot_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationSnapshot" ADD CONSTRAINT "AiEvaluationSnapshot_evaluationContextId_fkey" FOREIGN KEY ("evaluationContextId") REFERENCES "EvaluationContextSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationSnapshot" ADD CONSTRAINT "AiEvaluationSnapshot_evaluationRunId_fkey" FOREIGN KEY ("evaluationRunId") REFERENCES "AiEvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputePacketSnapshot" ADD CONSTRAINT "DisputePacketSnapshot_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputePacketSnapshot" ADD CONSTRAINT "DisputePacketSnapshot_evidenceBundleId_fkey" FOREIGN KEY ("evidenceBundleId") REFERENCES "EvidenceBundleSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputePacketSnapshot" ADD CONSTRAINT "DisputePacketSnapshot_evaluationContextId_fkey" FOREIGN KEY ("evaluationContextId") REFERENCES "EvaluationContextSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputePacketSnapshot" ADD CONSTRAINT "DisputePacketSnapshot_aiEvaluationId_fkey" FOREIGN KEY ("aiEvaluationId") REFERENCES "AiEvaluationSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRequirement" ADD CONSTRAINT "EvidenceRequirement_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRequirement" ADD CONSTRAINT "EvidenceRequirement_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjudicationCase" ADD CONSTRAINT "AdjudicationCase_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjudicationCase" ADD CONSTRAINT "AdjudicationCase_disputePacketSnapshotId_fkey" FOREIGN KEY ("disputePacketSnapshotId") REFERENCES "DisputePacketSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdjudicationCase" ADD CONSTRAINT "AdjudicationCase_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResolutionObservation" ADD CONSTRAINT "ResolutionObservation_adjudicationCaseId_fkey" FOREIGN KEY ("adjudicationCaseId") REFERENCES "AdjudicationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationRound" ADD CONSTRAINT "AttestationRound_adjudicationCaseId_fkey" FOREIGN KEY ("adjudicationCaseId") REFERENCES "AdjudicationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationRound" ADD CONSTRAINT "AttestationRound_resolutionObservationId_fkey" FOREIGN KEY ("resolutionObservationId") REFERENCES "ResolutionObservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttestationSignature" ADD CONSTRAINT "AttestationSignature_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "AttestationRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementExecution" ADD CONSTRAINT "SettlementExecution_attestationRoundId_fkey" FOREIGN KEY ("attestationRoundId") REFERENCES "AttestationRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtocolEvent" ADD CONSTRAINT "ProtocolEvent_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

