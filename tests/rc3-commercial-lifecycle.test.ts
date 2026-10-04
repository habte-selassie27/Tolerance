import { describe, expect, it } from "vitest";
import { createAuthorizationGuards } from "../src/server/auth";
import {
  assertInvitationAcceptance,
  hashInvitationToken,
} from "../src/server/counterparty";
import {
  assertWalletChallenge,
  WalletOwnershipError,
} from "../src/server/counterparty";
import {
  lifecycleActionMatrix,
  validateCommercialTransactionBinding,
} from "../src/server/xlayer-obligation-lifecycle";

describe("RC3 commercial lifecycle security", () => {
  it("grants a deal to either accepted organization but not an unrelated organization", async () => {
    const memberships = new Set(["buyer:buyer-user", "supplier:supplier-user"]);
    const guards = createAuthorizationGuards({
      findMembership: async (organization, user) =>
        memberships.has(`${organization}:${user}`),
      findDealOrganizations: async () => ["buyer", "supplier"],
      findDocumentOrganizations: async () => ["buyer", "supplier"],
    });
    await expect(
      guards.requireDealAccess("buyer-user", "deal"),
    ).resolves.toEqual({ organizationId: "buyer" });
    await expect(
      guards.requireDealAccess("supplier-user", "deal"),
    ).resolves.toEqual({ organizationId: "supplier" });
    await expect(guards.requireDealAccess("stranger", "deal")).rejects.toThrow(
      "authorized",
    );
  });

  it("hashes opaque invitation tokens and rejects replay, expiry, wrong recipient, and same-org acceptance", () => {
    expect(hashInvitationToken("one")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationToken("one")).not.toBe(hashInvitationToken("two"));
    const invite = {
      status: "PENDING" as const,
      intendedEmail: "supplier@example.com",
      invitingOrganizationId: "buyer-org",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    };
    expect(() =>
      assertInvitationAcceptance(invite, {
        actorEmail: "supplier@example.com",
        organizationId: "supplier-org",
        now: new Date("2029-01-01"),
      }),
    ).not.toThrow();
    expect(() =>
      assertInvitationAcceptance(
        { ...invite, status: "ACCEPTED" },
        { actorEmail: "supplier@example.com", organizationId: "supplier-org" },
      ),
    ).toThrow("no longer");
    expect(() =>
      assertInvitationAcceptance(invite, {
        actorEmail: "other@example.com",
        organizationId: "supplier-org",
      }),
    ).toThrow("email address");
    expect(() =>
      assertInvitationAcceptance(invite, {
        actorEmail: "supplier@example.com",
        organizationId: "buyer-org",
      }),
    ).toThrow("separate");
    expect(() =>
      assertInvitationAcceptance(invite, {
        actorEmail: "supplier@example.com",
        organizationId: "supplier-org",
        now: new Date("2031-01-01"),
      }),
    ).toThrow("expired");
  });

  it("rejects wrong-user, wrong-signer, expired, replayed, and tampered wallet challenges", () => {
    const base = {
      userId: "user-a",
      normalizedAddress: "0x1111111111111111111111111111111111111111",
      message: "Wallet: 0x1111111111111111111111111111111111111111",
      expiresAt: new Date("2030-01-01"),
      usedAt: null,
    };
    expect(() =>
      assertWalletChallenge(base, {
        actorId: "user-a",
        recoveredAddress: base.normalizedAddress,
        now: new Date("2029-01-01"),
      }),
    ).not.toThrow();
    expect(() =>
      assertWalletChallenge(base, {
        actorId: "user-b",
        recoveredAddress: base.normalizedAddress,
      }),
    ).toThrow(WalletOwnershipError);
    expect(() =>
      assertWalletChallenge(base, {
        actorId: "user-a",
        recoveredAddress: "0x2222222222222222222222222222222222222222",
      }),
    ).toThrow("does not match");
    expect(() =>
      assertWalletChallenge(
        { ...base, usedAt: new Date() },
        { actorId: "user-a", recoveredAddress: base.normalizedAddress },
      ),
    ).toThrow("already");
    expect(() =>
      assertWalletChallenge(base, {
        actorId: "user-a",
        recoveredAddress: base.normalizedAddress,
        now: new Date("2031-01-01"),
      }),
    ).toThrow("expired");
    expect(() =>
      assertWalletChallenge(
        { ...base, message: "tampered" },
        {
          actorId: "user-a",
          recoveredAddress: base.normalizedAddress,
          now: new Date("2029-01-01"),
        },
      ),
    ).toThrow("binding");
  });

  it("maps every frozen commercial action to its authority boundary", () => {
    const matrix = lifecycleActionMatrix();
    for (const method of [
      "createObligation",
      "acceptObligation",
      "approve",
      "fund",
      "commitEvidence",
      "proposeFastOutcome",
      "challenge",
      "finalizeFastOutcome",
      "enterDispute",
      "executeGenLayerResolution",
    ])
      expect(
        matrix.some(([name]) => name === method),
        method,
      ).toBe(true);
    expect(matrix.find(([name]) => name === "enterDispute")?.[2]).toBe(
      "PHASE_3C1_EXISTING",
    );
  });

  it.each([
    ["wrong chain", { chainId: 1 }, "WRONG_CHAIN"],
    ["nonfinal", { finalized: false }, "TRANSACTION_NOT_FINALIZED"],
    ["failed", { succeeded: false }, "TRANSACTION_FAILED"],
    [
      "wrong contract",
      { contract: "0x2222222222222222222222222222222222222222" },
      "WRONG_CONTRACT",
    ],
    ["wrong function", { method: "fund" }, "WRONG_FUNCTION"],
    [
      "wrong obligation/calldata",
      { calldataHash: "0xbb" },
      "CALLDATA_MISMATCH",
    ],
    [
      "wrong wallet",
      { wallet: "0x3333333333333333333333333333333333333333" },
      "WRONG_WALLET",
    ],
    ["event mismatch", { eventMatched: false }, "EVENT_MISMATCH"],
    ["state mismatch", { state: 2 }, "STATE_MISMATCH"],
  ])("rejects %s", (_name, mutation, code) => {
    const expected = {
      chainId: 1952,
      contract: "0x1111111111111111111111111111111111111111",
      method: "acceptObligation",
      calldataHash: "0xaa",
      wallet: "0x2222222222222222222222222222222222222222",
      acceptedStates: [1],
    };
    const observed = {
      chainId: 1952,
      finalized: true,
      succeeded: true,
      contract: expected.contract,
      method: expected.method,
      calldataHash: expected.calldataHash,
      wallet: expected.wallet,
      eventMatched: true,
      state: 1,
      ...mutation,
    };
    expect(() =>
      validateCommercialTransactionBinding(expected, observed),
    ).toThrow(code);
  });
});
