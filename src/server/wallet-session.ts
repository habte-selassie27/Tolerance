import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { getAddress, recoverMessageAddress } from "viem";

import { prisma } from "../lib/prisma";
import { currentCookieStore } from "../lib/request-context";
import type { AuthenticatedActor } from "./auth";

/**
 * First-party sessions for people who prove control of a wallet instead of
 * proving control of a Supabase account.
 *
 * The design mirrors the rules the rest of the codebase already follows for
 * commercial actions:
 *
 * - The raw token exists only in the caller's cookie. Only its sha256 is
 *   stored, so a database disclosure cannot be replayed as a session.
 * - A challenge is single-use and time-boxed, and the signed message carries
 *   the chain, address, nonce and an expiry, so one signature can never be
 *   replayed onto another address, chain or deployment.
 * - A session proves *identity only*. It never authorizes an X Layer
 *   transaction; that still requires a separate, freshly verified signature
 *   per action through the commercial lifecycle.
 */

export const WALLET_SESSION_COOKIE = "tolerance_wallet_session";

const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
const CHALLENGE_TTL_MS = 5 * 60_000;
const CHALLENGE_DOMAIN = "Tolerance wallet sign-in";

export class WalletSessionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WalletSessionError";
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizeAddress(address: string) {
  try {
    return getAddress(address).toLowerCase();
  } catch {
    throw new WalletSessionError(
      "INVALID_ADDRESS",
      "Enter a valid EVM wallet address.",
    );
  }
}

/**
 * The identity a wallet sign-in resolves to. `authSubject` is namespaced by
 * chain and address so the same address on two networks is two accounts, and
 * so it can never collide with a Supabase subject.
 */
export function walletAuthSubject(address: string, network: string) {
  return `wallet:EVM:${network}:${address}`;
}

function signInMessage(input: {
  address: string;
  nonce: string;
  expiresAt: Date;
}) {
  return [
    CHALLENGE_DOMAIN,
    `Network: ${input.address}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${input.expiresAt.toISOString()}`,
    "This signature proves account ownership only. It cannot authorize a transaction or move funds.",
  ].join("\n");
}

/** Issues a sign-in challenge. No account has to exist yet. */
export async function createWalletSignInChallenge(
  addressInput: string,
  network: string,
) {
  const address = normalizeAddress(addressInput);
  const nonce = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const message = signInMessage({ address, nonce, expiresAt });
  const challenge = await prisma.walletChallenge.create({
    data: {
      purpose: "SIGN_IN",
      userId: null,
      normalizedAddress: address,
      network,
      nonce,
      message,
      expiresAt,
    },
    select: { id: true, message: true, expiresAt: true },
  });
  return { ...challenge, address };
}

/**
 * Consumes a challenge and mints a session. The challenge is marked used in
 * the same transaction that creates the session, so a signature can be
 * presented at most once even under concurrent requests.
 */
export async function verifyWalletSignInChallenge(input: {
  challengeId: string;
  signature: string;
}) {
  const challenge = await prisma.walletChallenge.findUnique({
    where: { id: input.challengeId },
  });
  if (!challenge || challenge.purpose !== "SIGN_IN") {
    throw new WalletSessionError(
      "CHALLENGE_NOT_FOUND",
      "That sign-in challenge is no longer valid.",
    );
  }
  let recovered: string;
  try {
    recovered = (
      await recoverMessageAddress({
        message: challenge.message,
        signature: input.signature as `0x${string}`,
      })
    ).toLowerCase();
  } catch {
    throw new WalletSessionError(
      "INVALID_SIGNATURE",
      "Wallet signature is invalid.",
    );
  }
  if (recovered !== challenge.normalizedAddress) {
    throw new WalletSessionError(
      "ADDRESS_MISMATCH",
      "That signature was not produced by the requested address.",
    );
  }

  const token = randomBytes(32).toString("base64url");
  const user = await prisma.$transaction(async (tx) => {
    const consumed = await tx.walletChallenge.updateMany({
      where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new WalletSessionError(
        "CHALLENGE_CONSUMED",
        "That sign-in challenge has already been used.",
      );
    }
    const authSubject = walletAuthSubject(
      challenge.normalizedAddress,
      challenge.network,
    );
    const account = await tx.user.upsert({
      where: { authSubject },
      create: {
        authSubject,
        email: null,
        displayName: `${getAddress(challenge.normalizedAddress).slice(0, 8)}…`,
      },
      // A wallet account never silently inherits an email; that arrives only
      // through the confirmation step the workspace gate requires.
      update: {},
      select: { id: true, authSubject: true, email: true, displayName: true },
    });
    await tx.walletSession.create({
      data: {
        tokenHash: hashToken(token),
        userId: account.id,
        network: challenge.network,
        address: getAddress(challenge.normalizedAddress),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return account;
  });

  return {
    token,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    actor: user satisfies AuthenticatedActor,
    address: getAddress(challenge.normalizedAddress),
  };
}

/** Resolves a raw cookie token to an actor, or null when it is not usable. */
export async function resolveWalletSession(
  token: string | null | undefined,
): Promise<AuthenticatedActor | null> {
  if (!token) return null;
  const session = await prisma.walletSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          authSubject: true,
          email: true,
          displayName: true,
        },
      },
    },
  });
  if (!session || session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  // Best-effort freshness signal; never fails the request.
  void prisma.walletSession
    .update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);
  return session.user;
}

/** The session presented by the current request, if any. */
export function currentWalletSessionToken() {
  return currentCookieStore()?.get(WALLET_SESSION_COOKIE)?.value ?? null;
}

export async function resolveCurrentWalletSession() {
  return resolveWalletSession(currentWalletSessionToken());
}

export async function revokeWalletSession(
  token: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;
  const { count } = await prisma.walletSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count > 0;
}
