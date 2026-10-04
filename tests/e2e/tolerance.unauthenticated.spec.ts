import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("redirects unauthenticated access to the real login boundary", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("takes a genuine new Supabase user through organization onboarding and sign out", async ({
  page,
}) => {
  const fixture = JSON.parse(
    await readFile("test-results/playwright/fixture.json", "utf8"),
  ) as {
    onboardingEmail: string;
    invitationToken: string;
    primaryPassword: string;
  };
  const password = fixture.primaryPassword;
  await page.goto("/login");
  await page.getByLabel("Email").fill(fixture.onboardingEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Complete onboarding" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your Tolerance workspace" }),
  ).toBeVisible();
  await expect(
    page.getByText(/required only when you authorize/i),
  ).toBeVisible();
  await page.getByLabel("Organization name").fill("E2E Onboarding Workspace");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/app\/deals$/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Deals", exact: true }),
  ).toBeVisible();
  await page.goto(`/invite/${fixture.invitationToken}`);
  await expect(page.getByRole("heading", { name: /Join / })).toBeVisible();
  await page.getByRole("button", { name: "Accept deal relationship" }).click();
  await expect(page).toHaveURL(/\/app\/deals\//, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "E2E Synthetic 316L coupling" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/supplier/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("keeps the public landing and demo free of horizontal overflow at release breakpoints", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of ["/", "/demo", "/signup", "/login"]) {
      await page.goto(route);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }
});

test("presents the product, signup, recovery, and read-only demo without authentication", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Turn inspection evidence/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create workspace" }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("No single AI or backend controls the payment."),
  ).toBeVisible();
  await page.getByRole("link", { name: "View demo" }).first().click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByText("Synthetic read-only demo")).toBeVisible();
  await expect(page.getByText("50.10 mm measured")).toBeVisible();
  await expect(page.getByText(/not a live-chain transaction/i)).toBeVisible();
  await page.goto("/signup");
  await expect(
    page.getByRole("heading", { name: "Create your workspace" }),
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
  await page.goto("/forgot-password");
  await expect(
    page.getByRole("heading", { name: "Reset your password" }),
  ).toBeVisible();
});
