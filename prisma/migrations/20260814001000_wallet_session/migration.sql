-- AlterEnum
CREATE TYPE "WalletChallengePurpose" AS ENUM ('SIGN_IN', 'LINK');

-- AlterTable
ALTER TABLE "WalletChallenge" ALTER COLUMN "userId" DROP NOT NULL,
ADD COLUMN "purpose" "WalletChallengePurpose" NOT NULL DEFAULT 'LINK',
ADD COLUMN "network" TEXT NOT NULL DEFAULT 'xlayer-testnet-1952';

-- AlterTable
CREATE TABLE "WalletSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chainFamily" TEXT NOT NULL DEFAULT 'EVM',
    "network" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "WalletSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletSession_tokenHash_key" ON "WalletSession"("tokenHash");

-- CreateIndex
CREATE INDEX "WalletSession_userId_expiresAt_idx" ON "WalletSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "WalletSession_expiresAt_idx" ON "WalletSession"("expiresAt");

-- CreateIndex
CREATE INDEX "WalletChallenge_purpose_expiresAt_idx" ON "WalletChallenge"("purpose", "expiresAt");

-- AddForeignKey
ALTER TABLE "WalletSession" ADD CONSTRAINT "WalletSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
