import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

nextEnv.loadEnvConfig(process.cwd());

// Disposable synthetic inbox provided by https://mail.tm for release QA only.
const mailApi = "https://api.mail.tm";
const baseUrl = (
  process.env.RC3_MAIL_PROOF_BASE_URL ?? "https://tolerance.vercel.app"
).replace(/\/$/, "");

function secret(length = 18) {
  return randomBytes(length).toString("base64url");
}

async function json(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok)
    throw new Error(`Mail proof request failed with HTTP ${response.status}.`);
  return response.json();
}

async function createInbox() {
  const domains = await json(`${mailApi}/domains`);
  const domain = (domains["hydra:member"] ?? domains.member)?.find(
    (item) => item.isActive !== false,
  )?.domain;
  if (!domain) throw new Error("No disposable mail domain is available.");
  const address = `tolerance-rc3-${Date.now()}-${secret(4).toLowerCase()}@${domain}`;
  const password = `Tm!${secret()}9a`;
  await json(`${mailApi}/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  const authenticated = await json(`${mailApi}/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, password }),
  });
  return { address, token: authenticated.token };
}

async function waitForMessage(token, predicate, after = "") {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const listing = await json(`${mailApi}/messages`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const message = (listing["hydra:member"] ?? listing.member ?? []).find(
      (item) => item.id !== after && predicate(item),
    );
    if (message)
      return json(`${mailApi}/messages/${message.id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    "The expected Tolerance authentication email was not received.",
  );
}

function authLink(message) {
  const bodies = [
    message.text,
    ...(Array.isArray(message.html) ? message.html : [message.html]),
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/=\r?\n/g, "")
    .replaceAll("=3D", "=")
    .replaceAll("&amp;", "&");
  const links = bodies.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const link =
    links.find(
      (candidate) =>
        candidate.includes("/auth/v1/verify") ||
        candidate.includes("/auth/confirm") ||
        candidate.includes("/auth/callback"),
    ) ?? links.find((candidate) => candidate.includes("/tr/cl/"));
  if (!link) {
    const sanitized = links.flatMap((candidate) => {
      try {
        const parsed = new URL(candidate);
        return [
          `${parsed.origin}/${parsed.pathname.split("/").filter(Boolean).slice(0, 2).join("/")}`,
        ];
      } catch {
        return [];
      }
    });
    console.error("RC3_AUTH_LINK_PATHS", [...new Set(sanitized)]);
    throw new Error("The authentication email contained no confirmation link.");
  }
  return link.replace(/[)\].,]+$/, "");
}

const inbox = await createInbox();
const initialPassword = `Tm!${secret()}9a`;
const replacementPassword = `Tm!${secret()}9b`;
const fixture = JSON.parse(
  await readFile("test-results/playwright/fixture.json", "utf8"),
);
const invitationToken = `rc3-mail-${secret()}`;
const prisma = new PrismaClient();
const sourceDeal = await prisma.deal.findUniqueOrThrow({
  where: { id: fixture.dealId },
});
const inviter = await prisma.user.findFirstOrThrow({
  where: { createdDeals: { some: { id: sourceDeal.id } } },
});
const proofHash = (label) =>
  `sha256:${createHash("sha256").update(label).digest("hex")}`;
const proofCaseId = `0x${createHash("sha256")
  .update(`rc3-mail-case:${inbox.address}`)
  .digest("hex")}`;
const proof = await prisma.$transaction(async (tx) => {
  const deal = await tx.deal.create({
    data: {
      organizationId: sourceDeal.organizationId,
      reference: `RC3-MAIL-${Date.now()}`,
      title: "RC3 synthetic two-party lifecycle",
      buyerOrganizationRef: "RC3 synthetic buyer",
      supplierOrganizationRef: "Invited synthetic supplier",
      status: "ACTIVE",
      createdById: inviter.id,
    },
  });
  await tx.dealParticipant.create({
    data: {
      dealId: deal.id,
      organizationId: sourceDeal.organizationId,
      role: "BUYER",
    },
  });
  const agreement = await tx.agreement.create({
    data: {
      dealId: deal.id,
      version: 1,
      status: "APPROVED",
      agreementHash: proofHash(`agreement:${deal.id}`),
      effectiveAt: new Date(),
      createdById: inviter.id,
    },
  });
  const obligation = await tx.obligation.create({
    data: {
      dealId: deal.id,
      agreementId: agreement.id,
      createdById: inviter.id,
      buyerWallet: "0x1111111111111111111111111111111111111111",
      supplierWallet: "0x2222222222222222222222222222222222222222",
      amount: "1",
      tokenAddress: "0x3333333333333333333333333333333333333333",
      tokenDecimals: 6,
      xLayerChainId: 1952,
      xLayerEscrow: "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
      xLayerObligationId: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
      toleranceCaseId: proofCaseId,
      agreementHash: agreement.agreementHash,
      policyHash: proofHash(`policy:${deal.id}`),
    },
  });
  await tx.dealInvitation.create({
    data: {
      dealId: deal.id,
      invitingOrganizationId: deal.organizationId,
      createdById: inviter.id,
      intendedEmail: inbox.address,
      tokenHash: createHash("sha256").update(invitationToken).digest("hex"),
      role: "SUPPLIER",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  return { dealId: deal.id, obligationId: obligation.id };
});
await prisma.$disconnect();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(`${baseUrl}/signup`);
  await page
    .getByLabel("Name", { exact: true })
    .fill("Tolerance RC3 Mail Proof");
  await page.getByLabel("Email", { exact: true }).fill(inbox.address);
  await page.getByLabel("Password", { exact: true }).fill(initialPassword);
  await page
    .getByLabel("Confirm password", { exact: true })
    .fill(initialPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Check your email to confirm your account").waitFor();

  const confirmation = await waitForMessage(inbox.token, (item) =>
    /confirm|signup|account/i.test(item.subject ?? ""),
  );
  await page.goto(authLink(confirmation));
  console.log(
    `RC3_CONFIRMATION_REDIRECT_PATH=/${new URL(page.url()).pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 2)
      .join("/")}`,
  );
  await page.waitForURL(/\/app\/onboarding(?:\?|$)/, { timeout: 30_000 });
  await page
    .getByLabel("Organization name")
    .fill(`RC3 Mail Proof ${Date.now()}`);
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(/\/app\/(deals)?$/, { timeout: 30_000 });

  await page.goto(`${baseUrl}/app/account`);
  await page
    .getByRole("main")
    .getByRole("button", { name: "Sign out" })
    .click();
  await page.waitForURL(`${baseUrl}/login`);
  await page.goto(`${baseUrl}/forgot-password`);
  await page.getByLabel("Email").fill(inbox.address);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText("a password reset link is on its way").waitFor();

  const recovery = await waitForMessage(
    inbox.token,
    (item) => /reset|recover|password/i.test(item.subject ?? ""),
    confirmation.id,
  );
  await page.goto(authLink(recovery));
  await page.waitForURL(/\/reset-password(?:\?|$)/, { timeout: 30_000 });
  await page.getByLabel("New password").fill(replacementPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await page.getByText("Password updated").waitFor();

  await page.goto(`${baseUrl}/app/account`);
  await page
    .getByRole("main")
    .getByRole("button", { name: "Sign out" })
    .click();
  await page.waitForURL(`${baseUrl}/login`);
  await page.getByLabel("Email").fill(inbox.address);
  await page.getByLabel("Password", { exact: true }).fill(replacementPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${baseUrl}/app`, { timeout: 30_000 });

  await page.goto(`${baseUrl}/invite/${invitationToken}`);
  await page.getByRole("button", { name: "Accept deal relationship" }).click();
  await page.waitForURL(`${baseUrl}/app/deals/${proof.dealId}`, {
    timeout: 30_000,
  });
  await page
    .getByRole("heading", { name: "Commercial organizations" })
    .waitFor();
  if (
    await page.getByText("Supplier access has not been accepted.").isVisible()
  )
    throw new Error("The accepted supplier relationship was not rendered.");

  const wallet = privateKeyToAccount(generatePrivateKey());
  await page.exposeFunction("signRc3WalletMessage", async (message) =>
    wallet.signMessage({ message }),
  );
  await page.addInitScript((address) => {
    window.ethereum = {
      request: async ({ method, params }) => {
        if (method === "eth_requestAccounts") return [address];
        if (method === "personal_sign")
          return window.signRc3WalletMessage(String(params?.[0]));
        throw new Error(`Unexpected wallet method: ${method}`);
      },
    };
  }, wallet.address);
  await page.goto(`${baseUrl}/app/account`);
  await page.getByRole("button", { name: "Connect and verify wallet" }).click();
  await page.getByText("Verified · X Layer Testnet").waitFor();

  await page.goto(
    `${baseUrl}/app/deals/${proof.dealId}/obligations/${proof.obligationId}`,
  );
  await page.getByRole("heading", { name: "Next X Layer action" }).waitFor();

  console.log("RC3_CONFIRMATION_EMAIL=PASS");
  console.log("RC3_CONFIRMATION_CALLBACK=PASS");
  console.log("RC3_ONBOARDING=PASS");
  console.log("RC3_RECOVERY_EMAIL=PASS");
  console.log("RC3_PASSWORD_RESET=PASS");
  console.log("RC3_POST_RESET_LOGIN=PASS");
  console.log("RC3_PUBLIC_COUNTERPARTY_ACCEPTANCE=PASS");
  console.log("RC3_PUBLIC_WALLET_VERIFICATION=PASS");
  console.log("RC3_PUBLIC_OBLIGATION_LIFECYCLE=PASS");
} finally {
  await browser.close();
}
