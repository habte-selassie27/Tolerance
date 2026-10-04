import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

type BrowserFixture = {
  dealId: string;
  obligationId: string;
  workflowId: string;
  walletWorkflowId: string;
  foreignDealId: string;
  foreignObligationId: string;
  foreignWorkflowId: string;
  walletExpectedParty: string;
  onboardingEmail: string;
  invitationToken: string;
  e2eWalletPrivateKey: `0x${string}`;
  e2eWalletAddress: string;
  primaryEmail: string;
  primaryPassword: string;
};

type SupabaseAdmin = {
  auth: {
    admin: {
      listUsers(input: { perPage: number }): Promise<{
        data: {
          users: Array<{
            id: string;
            email?: string | null;
            user_metadata?: Record<string, unknown>;
          }>;
        };
        error: unknown;
      }>;
      updateUserById(
        id: string,
        input: {
          password: string;
          email_confirm: boolean;
          user_metadata?: Record<string, unknown>;
        },
      ): Promise<{ error: unknown }>;
      createUser(input: {
        email: string;
        password: string;
        email_confirm: boolean;
      }): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
      deleteUser(id: string): Promise<{ error: unknown }>;
    };
  };
};

const fixturePath = resolve("test-results/playwright/fixture.json");
function hex(value: string) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

async function ensureAuthUser(
  admin: SupabaseAdmin,
  email: string,
  password: string,
) {
  const credentialVersion = createHash("sha256")
    .update(password)
    .digest("hex")
    .slice(0, 16);
  const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw listed.error;
  const existing = listed.data.users.find((user) => user.email === email);
  if (existing) {
    const updated = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { tolerance_e2e_credential_version: credentialVersion },
    });
    if (updated.error) throw updated.error;
    return existing.id;
  }
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw created.error ?? new Error("Unable to create E2E auth user.");
  return created.data.user.id;
}

async function waitForPasswordActivation(
  url: string,
  anonKey: string,
  email: string,
  password: string,
) {
  const verifier = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await verifier.auth.signInWithPassword({
      email,
      password,
    });
    if (!error) {
      await verifier.auth.signOut();
      return;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error("The synthetic E2E password did not become active in time.");
}

export default async function globalSetup() {
  loadEnvConfig(process.cwd());
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRole)
    throw new Error("Supabase E2E administration configuration is missing.");

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const db = new PrismaClient();
  const listed = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listed.error) throw listed.error;
  const syntheticSubjects = listed.data.users.map((user) => user.id);
  const candidate = await db.user.findFirst({
    where: {
      authSubject: { in: syntheticSubjects },
      email: { not: null },
      memberships: {
        some: {
          organization: {
            OR: [
              { name: { contains: "E2E", mode: "insensitive" } },
              { name: { contains: "DEMO", mode: "insensitive" } },
              { slug: { startsWith: "e2e-" } },
            ],
          },
        },
      },
      createdDeals: {
        some: {
          obligations: {
            some: {
              adjudicationCases: {
                some: { workflowStatus: "ATTESTATION_BLOCKED" },
              },
            },
          },
        },
      },
    },
    select: { id: true, email: true },
  });
  if (!candidate)
    throw new Error("No tagged synthetic E2E dossier user is available.");
  // Supabase admin password updates can be eventually consistent across Auth
  // edges. Recreate one dedicated, tagged E2E identity instead of mutating a
  // shared synthetic dossier identity; production authentication is untouched.
  const primaryEmail =
    process.env.E2E_TEST_EMAIL ?? "e2e-primary@tolerance.invalid";
  const primaryPassword =
    process.env.E2E_TEST_PASSWORD ?? "ToleranceE2EPrimary2026";
  const existingPrimary = (
    await admin.auth.admin.listUsers({ perPage: 1000 })
  ).data.users.find((user) => user.email === primaryEmail);
  if (existingPrimary) {
    const deleted = await admin.auth.admin.deleteUser(existingPrimary.id);
    if (deleted.error) throw deleted.error;
  }
  const primaryCreated = await admin.auth.admin.createUser({
    email: primaryEmail,
    password: primaryPassword,
    email_confirm: true,
  });
  if (primaryCreated.error || !primaryCreated.data.user)
    throw primaryCreated.error ?? new Error("Unable to create E2E auth user.");
  const primarySubject = primaryCreated.data.user.id;
  await waitForPasswordActivation(url, anonKey, primaryEmail, primaryPassword);
  // Admin password changes can reach the auth API before every regional edge.
  // A short bounded grace period prevents the browser from racing propagation.
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 30_000));
  const foreignSubject = await ensureAuthUser(
    admin,
    "e2e-foreign@tolerance.invalid",
    `Tolerance-${randomUUID()}`,
  );
  const onboardingEmail = "e2e-onboarding@tolerance.invalid";
  const onboardingSubject = await ensureAuthUser(
    admin,
    onboardingEmail,
    primaryPassword,
  );
  try {
    const conflictingPrimary = await db.user.findUnique({
      where: { email: primaryEmail },
      select: { id: true },
    });
    if (conflictingPrimary && conflictingPrimary.id !== candidate.id) {
      await db.user.update({
        where: { id: conflictingPrimary.id },
        data: {
          email: `e2e-detached-${conflictingPrimary.id}@tolerance.invalid`,
        },
      });
    }
    const primary = await db.user.update({
      where: { id: candidate.id },
      data: { authSubject: primarySubject, email: primaryEmail },
    });
    const primaryMembership = await db.organizationMember.findFirst({
      where: { userId: primary.id },
      select: { organizationId: true },
    });
    if (!primaryMembership)
      throw new Error(
        "The E2E user needs a pre-seeded synthetic organization.",
      );
    const primaryDeal = await db.deal.findFirstOrThrow({
      where: {
        organizationId: primaryMembership.organizationId,
        obligations: {
          some: {
            adjudicationCases: {
              some: { workflowStatus: "ATTESTATION_BLOCKED" },
            },
          },
        },
      },
      include: { obligations: { include: { adjudicationCases: true } } },
      orderBy: { updatedAt: "desc" },
    });
    const primaryObligation = primaryDeal.obligations[0];
    const primaryWorkflow =
      primaryObligation?.adjudicationCases.find(
        (workflow) => workflow.workflowStatus === "ATTESTATION_BLOCKED",
      ) ?? primaryObligation?.adjudicationCases[0];
    if (!primaryObligation || !primaryWorkflow)
      throw new Error(
        "The E2E synthetic dossier needs an obligation and workflow.",
      );
    await db.walletAccount.deleteMany({
      where: {
        userId: primary.id,
        address: {
          notIn: [
            primaryObligation.buyerWallet,
            primaryObligation.supplierWallet,
          ],
        },
      },
    });
    const e2eWalletPrivateKey = generatePrivateKey();
    const e2eWalletAddress = privateKeyToAccount(e2eWalletPrivateKey).address;
    const walletCaseId = hex(`e2e-primary-wallet-case:${primaryObligation.id}`);
    const walletWorkflow =
      (await db.adjudicationCase.findFirst({
        where: {
          obligationId: primaryObligation.id,
          caseId: walletCaseId,
        },
      })) ??
      (await db.adjudicationCase.create({
        data: {
          obligationId: primaryObligation.id,
          requestedById: primary.id,
          caseId: walletCaseId,
          disputePacketHash: hex("e2e-primary-wallet-packet"),
          judgeAddress: "0xFF1de4Ec0D3E26eC3BCa080Fd4587901dB48a56b",
          genLayerChainId: 61999,
          workflowStatus: "PACKET_READY",
        },
      }));
    await db.adjudicationCase.update({
      where: { id: walletWorkflow.id },
      data: {
        workflowStatus: "PACKET_READY",
        xLayerDisputeTxHash: null,
        xLayerDisputeConfirmedAt: null,
        failureCode: null,
        nextAttemptAt: null,
      },
    });

    const foreignUser = await db.user.upsert({
      where: { authSubject: foreignSubject },
      create: {
        authSubject: foreignSubject,
        email: "e2e-foreign@tolerance.invalid",
      },
      update: { email: "e2e-foreign@tolerance.invalid" },
    });
    const onboardingUser = await db.user.upsert({
      where: { authSubject: onboardingSubject },
      create: { authSubject: onboardingSubject, email: onboardingEmail },
      update: { email: onboardingEmail },
    });
    const invitationToken = "e2e-rc3-supplier-invitation";
    const invitationTokenHash = createHash("sha256")
      .update(invitationToken)
      .digest("hex");
    await db.dealParticipant.deleteMany({
      where: { dealId: primaryDeal.id, role: "SUPPLIER" },
    });
    await db.dealInvitation.upsert({
      where: { tokenHash: invitationTokenHash },
      create: {
        dealId: primaryDeal.id,
        invitingOrganizationId: primaryMembership.organizationId,
        createdById: primary.id,
        intendedEmail: onboardingEmail,
        tokenHash: invitationTokenHash,
        role: "SUPPLIER",
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
      update: {
        status: "PENDING",
        acceptedAt: null,
        acceptedByOrganizationId: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    });
    const priorOnboardingMemberships = await db.organizationMember.findMany({
      where: { userId: onboardingUser.id },
      include: { organization: { include: { deals: true } } },
    });
    for (const membership of priorOnboardingMemberships) {
      if (
        membership.organization.name === "E2E Onboarding Workspace" &&
        membership.organization.deals.length === 0
      ) {
        await db.auditEvent.deleteMany({
          where: { organizationId: membership.organizationId },
        });
        await db.dealParticipant.deleteMany({
          where: { organizationId: membership.organizationId },
        });
        await db.organizationMember.deleteMany({
          where: { organizationId: membership.organizationId },
        });
        await db.organization.delete({
          where: { id: membership.organizationId },
        });
      }
    }
    const orphanOnboardingOrganizations = await db.organization.findMany({
      where: { name: "E2E Onboarding Workspace", deals: { none: {} } },
      select: { id: true },
    });
    for (const organization of orphanOnboardingOrganizations) {
      await db.dealParticipant.deleteMany({
        where: { organizationId: organization.id },
      });
      await db.auditEvent.deleteMany({
        where: { organizationId: organization.id },
      });
      await db.organizationMember.deleteMany({
        where: { organizationId: organization.id },
      });
      await db.organization.delete({ where: { id: organization.id } });
    }
    const foreignOrg = await db.organization.upsert({
      where: { slug: "e2e-foreign-organization" },
      create: {
        slug: "e2e-foreign-organization",
        name: "E2E Foreign Organization",
      },
      update: { name: "E2E Foreign Organization" },
    });
    await db.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: foreignOrg.id,
          userId: foreignUser.id,
        },
      },
      create: {
        organizationId: foreignOrg.id,
        userId: foreignUser.id,
        role: "OWNER",
      },
      update: {},
    });
    const foreignDeal =
      (await db.deal.findFirst({
        where: {
          organizationId: foreignOrg.id,
          reference: "E2E-FOREIGN-ACCESS",
        },
      })) ??
      (await db.deal.create({
        data: {
          organizationId: foreignOrg.id,
          reference: "E2E-FOREIGN-ACCESS",
          title: "E2E Foreign Dossier",
          buyerOrganizationRef: "Synthetic buyer",
          supplierOrganizationRef: "Synthetic supplier",
          createdById: foreignUser.id,
        },
      }));
    const foreignAgreement =
      (await db.agreement.findFirst({ where: { dealId: foreignDeal.id } })) ??
      (await db.agreement.create({
        data: {
          dealId: foreignDeal.id,
          version: 1,
          status: "APPROVED",
          agreementHash: `sha256:${hex("e2e-foreign-agreement").slice(2)}`,
          createdById: foreignUser.id,
        },
      }));
    const foreignObligation =
      (await db.obligation.findFirst({ where: { dealId: foreignDeal.id } })) ??
      (await db.obligation.create({
        data: {
          dealId: foreignDeal.id,
          agreementId: foreignAgreement.id,
          createdById: foreignUser.id,
          buyerWallet: "0x1111111111111111111111111111111111111111",
          supplierWallet: "0x2222222222222222222222222222222222222222",
          amount: 1,
          tokenAddress: "0x3333333333333333333333333333333333333333",
          tokenDecimals: 6,
          xLayerChainId: 1952,
          xLayerEscrow: "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
          xLayerObligationId: "9900000001",
          toleranceCaseId: hex("e2e-foreign-case"),
          agreementHash: foreignAgreement.agreementHash,
          policyHash: `sha256:${hex("e2e-foreign-policy").slice(2)}`,
        },
      }));
    const foreignWorkflow =
      (await db.adjudicationCase.findFirst({
        where: { obligationId: foreignObligation.id },
      })) ??
      (await db.adjudicationCase.create({
        data: {
          obligationId: foreignObligation.id,
          requestedById: foreignUser.id,
          caseId: foreignObligation.toleranceCaseId,
          disputePacketHash: hex("e2e-foreign-packet"),
          judgeAddress: "0xFF1de4Ec0D3E26eC3BCa080Fd4587901dB48a56b",
          genLayerChainId: 61999,
          workflowStatus: "PACKET_READY",
        },
      }));
    const fixture: BrowserFixture = {
      dealId: primaryDeal.id,
      obligationId: primaryObligation.id,
      workflowId: primaryWorkflow.id,
      walletWorkflowId: walletWorkflow.id,
      foreignDealId: foreignDeal.id,
      foreignObligationId: foreignObligation.id,
      foreignWorkflowId: foreignWorkflow.id,
      walletExpectedParty: primaryObligation.buyerWallet,
      onboardingEmail,
      invitationToken,
      e2eWalletPrivateKey,
      e2eWalletAddress,
      primaryEmail,
      primaryPassword,
    };
    await mkdir(resolve("test-results/playwright"), { recursive: true });
    await writeFile(fixturePath, JSON.stringify(fixture), "utf8");
  } finally {
    await db.$disconnect();
  }
}
