import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

const authState = "playwright/.auth/primary.json";

test("signs in through the real Tolerance and Supabase boundary", async ({
  page,
}) => {
  const fixture = JSON.parse(
    await readFile("test-results/playwright/fixture.json", "utf8"),
  ) as { primaryEmail: string; primaryPassword: string };
  const { primaryEmail: email, primaryPassword: password } = fixture;
  await mkdir("playwright/.auth", { recursive: true });
  await page.goto("/login");
  const emailInput = page.getByLabel("Email");
  await emailInput.fill(email);
  if ((await emailInput.inputValue()) !== email)
    throw new Error("The browser did not preserve the synthetic email.");
  const passwordInput = page.getByLabel("Password", { exact: true });
  await passwordInput.fill(password);
  if ((await passwordInput.inputValue()).length !== password.length)
    throw new Error("The browser did not preserve the synthetic password.");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "What needs attention" }),
  ).toBeVisible();
  await page.context().storageState({ path: authState });
});
