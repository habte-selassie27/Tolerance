import { defineConfig } from "@playwright/test";

const authState = "playwright/.auth/primary.json";
const externalBaseUrl = process.env.E2E_BASE_URL;
const localBaseUrl = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/playwright",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "line",
  timeout: 120_000,
  use: {
    baseURL: externalBaseUrl ?? localBaseUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: "WEB_PORT=3100 PORT=3101 pnpm dev",
          url: `${localBaseUrl}/api/health`,
          timeout: 120_000,
          reuseExistingServer: false,
        },
      }),
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "authenticated",
      testMatch: /.*\.authenticated\.spec\.ts/,
      use: { storageState: authState },
      dependencies: ["setup"],
    },
    { name: "unauthenticated", testMatch: /.*\.unauthenticated\.spec\.ts/ },
  ],
  globalSetup: "./tests/e2e/global.setup.ts",
});
