import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import { privateKeyToAccount } from "viem/accounts";

type BrowserFixture = {
  dealId: string;
  obligationId: string;
  workflowId: string;
  walletWorkflowId: string;
  foreignDealId: string;
  foreignObligationId: string;
  foreignWorkflowId: string;
  walletExpectedParty: string;
  invitationToken: string;
  e2eWalletPrivateKey: `0x${string}`;
  e2eWalletAddress: string;
};

async function fixture() {
  return JSON.parse(
    await readFile("test-results/playwright/fixture.json", "utf8"),
  ) as BrowserFixture;
}

async function expectNoViewportOverflow(page: import("@playwright/test").Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test("renders the authenticated commercial dossier through persisted routes", async ({
  page,
}) => {
  const data = await fixture();
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "What needs attention" }),
  ).toBeVisible();
  await page.goto("/app/deals");
  await expect(page.getByRole("heading", { name: "Deals" })).toBeVisible();
  await page.goto(`/app/deals/${data.dealId}`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Requirement matrix" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Private documents and provenance",
    }),
  ).toBeVisible();
  await page.goto(`/app/deals/${data.dealId}/obligations/${data.obligationId}`);
  await expect(
    page.getByRole("heading", { name: "Release conditions" }),
  ).toBeVisible();
  await expect(
    page.getByText("Evidence evaluation", { exact: true }),
  ).toBeVisible();
  await page.goto(`/app/disputes/${data.workflowId}`);
  await expect(page.getByLabel("Dispute lifecycle")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Resolution verified — settlement verification pending",
    }),
  ).toBeVisible();
  await page.goto("/app/activity");
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await page.goto("/app/account");
  await expect(
    page.getByRole("heading", { name: "Profile and security" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Tolerance identity stays separate/),
  ).toBeVisible();
});

test("renders server-authorized commercial lifecycle controls without a chain write", async ({
  page,
}) => {
  const data = await fixture();
  await page.goto(`/app/deals/${data.dealId}/obligations/${data.obligationId}`);
  await expect(
    page.getByRole("heading", { name: "Next X Layer action" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Tolerance prepares and verifies the call/i),
  ).toBeVisible();
  await expect(
    page.getByText(/Uncontested outcomes do not require GenLayer/i),
  ).toBeVisible();
});

test("links a post-onboarding wallet through a real ownership signature", async ({
  page,
}) => {
  const data = await fixture();
  const account = privateKeyToAccount(data.e2eWalletPrivateKey);
  await page.exposeFunction("signE2EWalletMessage", async (message: string) =>
    account.signMessage({ message }),
  );
  await page.addInitScript((address) => {
    window.ethereum = {
      request: async ({ method, params }) => {
        if (method === "eth_requestAccounts") return [address];
        if (method === "personal_sign")
          return (
            window as unknown as {
              signE2EWalletMessage(message: string): Promise<string>;
            }
          ).signE2EWalletMessage(String(params?.[0]));
        throw new Error(`Unexpected wallet method: ${method}`);
      },
    };
  }, data.e2eWalletAddress);
  await page.goto("/app/account");
  await page.getByRole("button", { name: "Connect and verify wallet" }).click();
  await expect(page.getByRole("status")).toContainText("Verified", {
    timeout: 30_000,
  });
  await page.reload();
  await expect(page.getByText("Verified · X Layer Testnet")).toBeVisible();
});

test("rejects cross-organization deal, obligation, and workflow URLs without leakage", async ({
  page,
}) => {
  const data = await fixture();
  for (const path of [
    `/app/deals/${data.foreignDealId}`,
    `/app/deals/${data.foreignDealId}/obligations/${data.foreignObligationId}`,
    `/app/disputes/${data.foreignWorkflowId}`,
  ]) {
    await page.goto(path);
    await expect(page.getByText("E2E Foreign Dossier")).toHaveCount(0);
  }
});

test("handles unavailable, wrong-network, wrong-account, and user-rejected wallet states without a chain write", async ({
  page,
}) => {
  const data = await fixture();
  await page.goto(`/app/disputes/${data.walletWorkflowId}`);
  const enter = page.getByRole("button", { name: "Enter dispute on X Layer" });
  await enter.click();
  await expect(page.getByRole("status")).toContainText("Connect an EVM wallet");

  await page.addInitScript(() => {
    window.ethereum = {
      request: async ({ method }) => {
        if (method === "eth_requestAccounts")
          return ["0x9999999999999999999999999999999999999999"];
        return "0x7a0";
      },
    };
  });
  await page.reload();
  await enter.click();
  await expect(page.getByRole("status")).toContainText(
    "Connect the buyer or supplier wallet",
  );

  await page.addInitScript((expectedParty) => {
    window.ethereum = {
      request: async ({ method }) => {
        if (method === "eth_requestAccounts") return [expectedParty];
        if (method === "eth_chainId") return "0x1";
        if (method === "wallet_switchEthereumChain")
          throw new Error("Network switch rejected");
        throw new Error("Unexpected wallet request");
      },
    };
  }, data.walletExpectedParty);
  await page.reload();
  await enter.click();
  await expect(page.getByRole("status")).toContainText(
    "Network switch rejected",
  );

  await page.addInitScript(() => {
    window.ethereum = {
      request: async ({ method }) => {
        if (method === "eth_requestAccounts")
          throw new Error("User rejected transaction");
        throw new Error("Unexpected wallet request");
      },
    };
  });
  await page.reload();
  await enter.click();
  await expect(page.getByRole("status")).toContainText(
    "User rejected transaction",
  );
});

test("keeps external-state workflows reconciliation-only and visually usable at each release breakpoint", async ({
  page,
}) => {
  const data = await fixture();
  for (const viewport of [
    { width: 1440, height: 900, label: "desktop" },
    { width: 1024, height: 768, label: "tablet" },
    { width: 390, height: 844, label: "mobile" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/app/disputes/${data.workflowId}`);
    await expect(page.getByLabel("Dispute lifecycle")).toBeVisible();
    await expectNoViewportOverflow(page);
    await page.screenshot({
      path: `test-results/playwright/${viewport.label}-dispute.png`,
      fullPage: true,
    });
  }
});
