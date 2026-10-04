import "server-only";

import { randomBytes } from "node:crypto";
import { getAddress, recoverMessageAddress } from "viem";
import { prisma } from "../lib/prisma";
import { requireUser } from "./auth";

export class WalletOwnershipError extends Error {}

export function assertWalletChallenge(
  challenge: {
    userId: string;
    normalizedAddress: string;
    message: string;
    expiresAt: Date;
    usedAt: Date | null;
  },
  input: { actorId: string; recoveredAddress: string; now?: Date },
) {
  const now = input.now ?? new Date();
  if (challenge.userId !== input.actorId)
    throw new WalletOwnershipError("Wallet challenge was not found.");
  if (challenge.usedAt)
    throw new WalletOwnershipError("Wallet challenge has already been used.");
  if (challenge.expiresAt.getTime() <= now.getTime())
    throw new WalletOwnershipError("Wallet challenge has expired.");
  if (input.recoveredAddress.toLowerCase() !== challenge.normalizedAddress)
    throw new WalletOwnershipError("The signature does not match this wallet.");
  if (!challenge.message.includes(`Wallet: ${challenge.normalizedAddress}`))
    throw new WalletOwnershipError("Wallet challenge binding is invalid.");
}

export async function createWalletChallenge(address: string) {
  const actor = await requireUser();
  let normalizedAddress: string;
  try {
    normalizedAddress = getAddress(address).toLowerCase();
  } catch {
    throw new WalletOwnershipError("Enter a valid EVM wallet address.");
  }
  const nonce = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  const message = [
    "Tolerance wallet ownership verification",
    `Account: ${actor.id}`,
    `Wallet: ${normalizedAddress}`,
    "Network: X Layer Testnet (1952)",
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt.toISOString()}`,
    "This signature does not authorize a transaction or transfer funds.",
  ].join("\n");
  const challenge = await prisma.walletChallenge.create({
    data: { userId: actor.id, normalizedAddress, nonce, message, expiresAt },
    select: { id: true, message: true, expiresAt: true },
  });
  return challenge;
}

export async function verifyWalletChallenge(
  challengeId: string,
  signature: string,
) {
  const actor = await requireUser();
  const challenge = await prisma.walletChallenge.findUnique({
    where: { id: challengeId },
  });
  if (!challenge)
    throw new WalletOwnershipError("Wallet challenge was not found.");
  let recovered: string;
  try {
    recovered = (
      await recoverMessageAddress({
        message: challenge.message,
        signature: signature as `0x${string}`,
      })
    ).toLowerCase();
  } catch {
    throw new WalletOwnershipError("Wallet signature is invalid.");
  }
  assertWalletChallenge(challenge, {
    actorId: actor.id,
    recoveredAddress: recovered,
  });
  return prisma.$transaction(async (tx) => {
    const consumed = await tx.walletChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new WalletOwnershipError("Wallet challenge is no longer valid.");
    return tx.walletAccount.upsert({
      where: {
        chainFamily_network_normalizedAddress: {
          chainFamily: "EVM",
          network: "xlayer-testnet-1952",
          normalizedAddress: challenge.normalizedAddress,
        },
      },
      create: {
        userId: actor.id,
        chainFamily: "EVM",
        network: "xlayer-testnet-1952",
        address: getAddress(challenge.normalizedAddress),
        normalizedAddress: challenge.normalizedAddress,
        verificationStatus: "VERIFIED",
      },
      update: {
        userId: actor.id,
        address: getAddress(challenge.normalizedAddress),
        verificationStatus: "VERIFIED",
      },
    });
  });
}

export async function unlinkWallet(walletId: string) {
  const actor = await requireUser();
  const wallet = await prisma.walletAccount.findFirst({
    where: { id: walletId, userId: actor.id, verificationStatus: "VERIFIED" },
  });
  if (!wallet) throw new WalletOwnershipError("Verified wallet was not found.");
  const immutableBindings = await prisma.obligation.count({
    where: {
      OR: [
        { buyerWallet: { equals: wallet.address, mode: "insensitive" } },
        { supplierWallet: { equals: wallet.address, mode: "insensitive" } },
      ],
      localStatus: { notIn: ["CANCELLED"] },
    },
  });
  if (immutableBindings)
    throw new WalletOwnershipError(
      "This wallet is assigned to an obligation and cannot be unlinked.",
    );
  await prisma.walletAccount.delete({ where: { id: wallet.id } });
}
