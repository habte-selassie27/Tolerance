CREATE TYPE "DealParticipantRole" AS ENUM ('BUYER', 'SUPPLIER');
CREATE TYPE "DealInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "ProtocolActionStatus" AS ENUM ('PREPARED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'UNKNOWN');

CREATE TABLE "DealParticipant" (
  "dealId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "role" "DealParticipantRole" NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealParticipant_pkey" PRIMARY KEY ("dealId", "organizationId")
);
CREATE UNIQUE INDEX "DealParticipant_dealId_role_key" ON "DealParticipant"("dealId", "role");
CREATE INDEX "DealParticipant_organizationId_idx" ON "DealParticipant"("organizationId");
ALTER TABLE "DealParticipant" ADD CONSTRAINT "DealParticipant_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealParticipant" ADD CONSTRAINT "DealParticipant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
CREATE UNIQUE INDEX "DealInvitation_tokenHash_key" ON "DealInvitation"("tokenHash");
CREATE INDEX "DealInvitation_dealId_status_idx" ON "DealInvitation"("dealId", "status");
CREATE INDEX "DealInvitation_intendedEmail_status_idx" ON "DealInvitation"("intendedEmail", "status");
ALTER TABLE "DealInvitation" ADD CONSTRAINT "DealInvitation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealInvitation" ADD CONSTRAINT "DealInvitation_invitingOrganizationId_fkey" FOREIGN KEY ("invitingOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DealInvitation" ADD CONSTRAINT "DealInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
CREATE UNIQUE INDEX "ProtocolActionIntent_transactionHash_key" ON "ProtocolActionIntent"("transactionHash");
CREATE UNIQUE INDEX "ProtocolActionIntent_obligationId_action_expectedState_key" ON "ProtocolActionIntent"("obligationId", "action", "expectedState");
CREATE INDEX "ProtocolActionIntent_status_updatedAt_idx" ON "ProtocolActionIntent"("status", "updatedAt");
ALTER TABLE "ProtocolActionIntent" ADD CONSTRAINT "ProtocolActionIntent_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProtocolActionIntent" ADD CONSTRAINT "ProtocolActionIntent_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "DealParticipant" ("dealId", "organizationId", "role", "acceptedAt")
SELECT "id", "organizationId", 'BUYER'::"DealParticipantRole", "createdAt" FROM "Deal"
ON CONFLICT DO NOTHING;
