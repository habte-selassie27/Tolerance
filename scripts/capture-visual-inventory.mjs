import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const baseURL = process.env.VISUAL_BASE_URL ?? "https://tolerance.vercel.app";
const phase = process.env.VISUAL_PHASE ?? "before";
const fixture = JSON.parse(
  await readFile(resolve("test-results/playwright/fixture.json"), "utf8"),
);
const outputRoot = resolve("test-results", "visual", phase);
const allViewports = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768 },
  mobile: { width: 390, height: 844 },
};
const selectedViewport = process.env.VISUAL_VIEWPORT;
const viewports = selectedViewport
  ? { [selectedViewport]: allViewports[selectedViewport] }
  : allViewports;
if (selectedViewport && !viewports[selectedViewport]) {
  throw new Error(`Unknown visual viewport: ${selectedViewport}`);
}
const publicRoutes = [
  ["landing", "/"],
  ["login", "/login"],
  ["signup", "/signup"],
  ["demo", "/demo"],
  ["invitation", `/invite/${fixture.invitationToken}`],
];
const appRoutes = [
  ["workspace", "/app"],
  ["deals", "/app/deals"],
  ["deal-dossier", `/app/deals/${fixture.dealId}`],
  [
    "obligation",
    `/app/deals/${fixture.dealId}/obligations/${fixture.obligationId}`,
  ],
  ["dispute", `/app/disputes/${fixture.workflowId}`],
  ["activity", "/app/activity"],
  ["account", "/app/account"],
];

const browser = await chromium.launch({ headless: true });
try {
  for (const [viewportName, viewport] of Object.entries(viewports)) {
    const directory = resolve(outputRoot, viewportName);
    await mkdir(directory, { recursive: true });

    const publicContext = await browser.newContext({ viewport });
    const publicPage = await publicContext.newPage();
    for (const [name, route] of publicRoutes) {
      await publicPage.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
      await publicPage.screenshot({
        path: resolve(directory, `${name}.png`),
        fullPage: true,
      });
    }
    await publicContext.close();

    const appContext = await browser.newContext({ viewport });
    const appPage = await appContext.newPage();
    await appPage.goto(`${baseURL}/login`, { waitUntil: "networkidle" });
    await appPage.getByLabel("Email").fill(fixture.primaryEmail);
    await appPage
      .getByLabel("Password", { exact: true })
      .fill(fixture.primaryPassword);
    await appPage.getByRole("button", { name: "Sign in" }).click();
    await appPage.waitForURL(/\/app$/);
    for (const [name, route] of appRoutes) {
      await appPage.goto(`${baseURL}${route}`, { waitUntil: "networkidle" });
      await appPage.screenshot({
        path: resolve(directory, `${name}.png`),
        fullPage: true,
      });
      if (name === "deal-dossier") {
        const review = appPage.getByRole("button", { name: "Awaiting review" });
        if (await review.isVisible()) {
          await review.click();
          await appPage.screenshot({
            path: resolve(directory, "requirement-drawer.png"),
            fullPage: true,
          });
          await appPage
            .getByRole("button", { name: "Close detail panel" })
            .click();
        }
      }
    }
    await appContext.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`Captured ${phase} visual inventory.\n`);
