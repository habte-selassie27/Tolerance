import { randomUUID, createHash } from "node:crypto";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
if (process.env.RUN_PHASE3_INTEGRATION_TESTS !== "1")
  throw new Error("Set RUN_PHASE3_INTEGRATION_TESTS=1 to run this live suite.");

const db = new PrismaClient();
const suffix = randomUUID();
const ids: string[] = [];
const hex = (value: string) =>
  `0x${createHash("sha256").update(value).digest("hex")}`;
let buyerUserId = "";
let supplierUserId = "";
let outsiderUserId = "";
let buyerOrgId = "";
let supplierOrgId = "";
let dealId = "";
let obligationId = "";

beforeAll(async () => {
  const staleDeals = await db.deal.findMany({
    where: { reference: { startsWith: "RC3-INTEGRATION-" } },
    select: { id: true },
  });
  const staleDealIds = staleDeals.map((deal) => deal.id);
  if (staleDealIds.length) {
    await db.dealInvitation.deleteMany({
      where: { dealId: { in: staleDealIds } },
    });
    await db.dealParticipant.deleteMany({
      where: { dealId: { in: staleDealIds } },
    });
    await db.deal.deleteMany({ where: { id: { in: staleDealIds } } });
  }
  const staleOrganizations = await db.organization.findMany({
    where: { slug: { startsWith: "rc3-integration-" } },
    select: { id: true },
  });
  const staleOrganizationIds = staleOrganizations.map(
    (organization) => organization.id,
  );
  if (staleOrganizationIds.length) {
    await db.auditEvent.deleteMany({
      where: { organizationId: { in: staleOrganizationIds } },
    });
    await db.organizationMember.deleteMany({
      where: { organizationId: { in: staleOrganizationIds } },
    });
    await db.organization.deleteMany({
      where: { id: { in: staleOrganizationIds } },
    });
  }
  await db.user.deleteMany({
    where: {
      authSubject: { startsWith: "rc3-integration-" },
      memberships: { none: {} },
      createdDeals: { none: {} },
    },
  });
  const users = await Promise.all(
    ["buyer", "supplier", "outsider"].map((role) =>
      db.user.create({
        data: {
          authSubject: `rc3-integration-${role}-${suffix}`,
          email: `rc3-${role}-${suffix}@example.invalid`,
        },
      }),
    ),
  );
  [buyerUserId, supplierUserId, outsiderUserId] = users.map((user) => user.id);
  ids.push(...users.map((user) => user.id));
  const buyerOrg = await db.organization.create({
    data: {
      name: "RC3 Synthetic Buyer",
      slug: `rc3-integration-buyer-${suffix}`,
    },
  });
  const supplierOrg = await db.organization.create({
    data: {
      name: "RC3 Synthetic Supplier",
      slug: `rc3-integration-supplier-${suffix}`,
    },
  });
  buyerOrgId = buyerOrg.id;
  supplierOrgId = supplierOrg.id;
  await db.organizationMember.createMany({
    data: [
      { organizationId: buyerOrg.id, userId: buyerUserId, role: "OWNER" },
      { organizationId: supplierOrg.id, userId: supplierUserId, role: "OWNER" },
    ],
  });
  const deal = await db.deal.create({
    data: {
      organizationId: buyerOrg.id,
      reference: `RC3-INTEGRATION-${suffix}`,
      title: "RC3 synthetic two-party lifecycle",
      buyerOrganizationRef: buyerOrg.name,
      supplierOrganizationRef: supplierOrg.name,
      createdById: buyerUserId,
    },
  });
  dealId = deal.id;
  await db.dealParticipant.createMany({
    data: [
      { dealId, organizationId: buyerOrg.id, role: "BUYER" },
      { dealId, organizationId: supplierOrg.id, role: "SUPPLIER" },
    ],
  });
  const agreement = await db.agreement.create({
    data: {
      dealId,
      version: 1,
      status: "APPROVED",
      agreementHash: hex(`agreement-${suffix}`),
      createdById: buyerUserId,
    },
  });
  const obligation = await db.obligation.create({
    data: {
      dealId,
      agreementId: agreement.id,
      createdById: buyerUserId,
      buyerWallet: "0x1111111111111111111111111111111111111111",
      supplierWallet: "0x2222222222222222222222222222222222222222",
      amount: 1000,
      tokenAddress: "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c",
      tokenDecimals: 6,
      xLayerChainId: 1952,
      xLayerEscrow: "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
      xLayerObligationId: String(Date.now()),
      toleranceCaseId: hex(`case-${suffix}`),
      agreementHash: agreement.agreementHash,
      policyHash: hex(`policy-${suffix}`),
    },
  });
  obligationId = obligation.id;
});

afterAll(async () => {
  if (dealId) {
    await db.protocolActionIntent.deleteMany({ where: { obligationId } });
    await db.obligation.deleteMany({ where: { dealId } });
    await db.agreement.deleteMany({ where: { dealId } });
    await db.dealInvitation.deleteMany({ where: { dealId } });
    await db.dealParticipant.deleteMany({ where: { dealId } });
    await db.deal.deleteMany({ where: { id: dealId } });
  }
  await db.organizationMember.deleteMany({
    where: {
      organizationId: { in: [buyerOrgId, supplierOrgId].filter(Boolean) },
    },
  });
  await db.auditEvent.deleteMany({
    where: {
      organizationId: { in: [buyerOrgId, supplierOrgId].filter(Boolean) },
    },
  });
  await db.organization.deleteMany({
    where: { id: { in: [buyerOrgId, supplierOrgId].filter(Boolean) } },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});

describe("RC3 real Supabase commercial lifecycle", () => {
  it("persists two distinct organization roles on one private deal", async () => {
    const participants = await db.dealParticipant.findMany({
      where: { dealId },
      orderBy: { role: "asc" },
    });
    expect(participants).toHaveLength(2);
    expect(
      new Set(participants.map((participant) => participant.organizationId)),
    ).toEqual(new Set([buyerOrgId, supplierOrgId]));
    expect(
      participants.some(
        (participant) => participant.organizationId === outsiderUserId,
      ),
    ).toBe(false);
  });

  it("enforces one role and one organization participation per deal", async () => {
    await expect(
      db.dealParticipant.create({
        data: { dealId, organizationId: buyerOrgId, role: "SUPPLIER" },
      }),
    ).rejects.toThrow();
  });

  it("persists hashed, expiring, single-use invitation state without a raw token", async () => {
    const invitation = await db.dealInvitation.create({
      data: {
        dealId,
        invitingOrganizationId: buyerOrgId,
        createdById: buyerUserId,
        intendedEmail: `invite-${suffix}@example.invalid`,
        tokenHash: createHash("sha256")
          .update(`opaque-${suffix}`)
          .digest("hex"),
        role: "SUPPLIER",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    expect(invitation.tokenHash).not.toContain("opaque-");
    const claimed = await db.dealInvitation.updateMany({
      where: {
        id: invitation.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedByOrganizationId: supplierOrgId,
      },
    });
    expect(claimed.count).toBe(1);
    const replay = await db.dealInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { acceptedAt: new Date() },
    });
    expect(replay.count).toBe(0);
  });

  it("persists idempotent transaction intent and rejects a duplicate state action", async () => {
    const first = await db.protocolActionIntent.create({
      data: {
        obligationId,
        requestedById: buyerUserId,
        action: "CREATE_OBLIGATION",
        expectedState: "CREATED",
        calldataHash: hex(`calldata-${suffix}`),
      },
    });
    expect(first.status).toBe("PREPARED");
    await expect(
      db.protocolActionIntent.create({
        data: {
          obligationId,
          requestedById: buyerUserId,
          action: "CREATE_OBLIGATION",
          expectedState: "CREATED",
          calldataHash: hex(`other-${suffix}`),
        },
      }),
    ).rejects.toThrow();
  });
});
