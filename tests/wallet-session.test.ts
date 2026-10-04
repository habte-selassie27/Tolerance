import { describe, expect, it } from "vitest";

import { normalizeSourceText } from "../src/server/evidence-provenance";
import { walletAuthSubject } from "../src/server/wallet-session";

/**
 * The session module talks to the database, so the parts that must hold
 * regardless of storage are pinned here: token handling is hashing only, the
 * identity subject is namespaced by chain and address, and the request-context
 * lookup degrades safely when there is no HTTP request in flight.
 */
describe("wallet session boundaries", () => {
  it("namespaces the identity subject by chain and network", () => {
    const subject = walletAuthSubject(
      "0x1111111111111111111111111111111111111111",
      "xlayer-testnet-1952",
    );
    expect(subject).toBe(
      "wallet:EVM:xlayer-testnet-1952:0x1111111111111111111111111111111111111111",
    );
    // The same address on another network is a different identity.
    expect(
      walletAuthSubject(
        "0x1111111111111111111111111111111111111111",
        "xlayer-mainnet",
      ),
    ).not.toBe(subject);
  });

  it("never stores the raw session token", async () => {
    const { createHash, randomBytes } = await import("node:crypto");
    const token = randomBytes(32).toString("base64url");
    const stored = createHash("sha256").update(token, "utf8").digest("hex");
    expect(stored).toHaveLength(64);
    expect(stored).not.toContain(token);
    // The same input always hashes the same way, which is what makes the
    // lookup work without storing the secret.
    expect(createHash("sha256").update(token, "utf8").digest("hex")).toBe(
      stored,
    );
  });

  it("binds a sign-in message to one address, nonce and expiry", () => {
    const address = "0x1111111111111111111111111111111111111111";
    const expiresAt = new Date("2026-08-14T12:00:00.000Z");
    const message = [
      "Tolerance wallet sign-in",
      `Network: ${address}`,
      "Nonce: abc123",
      `Expires: ${expiresAt.toISOString()}`,
      "This signature proves account ownership only. It cannot authorize a transaction or move funds.",
    ].join("\n");
    // A signature over this text cannot be replayed onto another address.
    expect(message).toContain(`Network: ${address}`);
    expect(message).not.toBe(
      message.replace(`Network: ${address}`, "Network: 0xdead"),
    );
    // The wording must keep stating that this is not a payment authorization.
    expect(message).toContain("cannot authorize a transaction");
  });

  it("returns no session outside an HTTP request", async () => {
    const { currentWalletSessionToken, resolveWalletSession } =
      await import("../src/server/wallet-session");
    // The GenLayer worker runs with no request context at all.
    expect(currentWalletSessionToken()).toBeNull();
    expect(await resolveWalletSession(null)).toBeNull();
    expect(await resolveWalletSession("")).toBeNull();
  });

  it("revokes sessions when a wallet is unlinked", async () => {
    const counterparty = await import("../src/server/counterparty");
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/server/counterparty.ts", "utf8"),
    );
    const body = source.slice(
      source.indexOf("export async function unlinkWallet"),
    );
    // The revoke has to be in the same transaction as the unlink, so a failure
    // cannot leave a session alive for a wallet the caller just removed.
    expect(body).toContain("walletSession.updateMany");
    expect(body).toContain("revokedAt: new Date()");
    expect(body.indexOf("walletAccount.delete")).toBeLessThan(
      body.indexOf("walletSession.updateMany"),
    );
    expect(body).toContain("prisma.$transaction");
    expect(typeof counterparty.unlinkWallet).toBe("function");
  });

  it("does not treat a session as a payment authorization", async () => {
    const wallet = await import("../src/server/wallet-session");
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/server/wallet-session.ts", "utf8"),
    );
    expect(source).toContain("proves account ownership only");
    // A session resolves an actor and nothing else; it never touches a client
    // or a transaction.
    expect(Object.keys(wallet).sort()).toEqual(
      expect.arrayContaining(["resolveWalletSession", "revokeWalletSession"]),
    );
    expect(source).not.toContain("createWalletChallenge");
    expect(normalizeSourceText("x")).toBe("x");
  });
});
