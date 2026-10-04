import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
for (const name of [
  "DATABASE_URL",
  "DIRECT_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  if (!process.env[name])
    throw new Error(`Missing required integration configuration: ${name}`);
}

const vitestEntrypoint = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);
const child = spawn(
  process.execPath,
  [
    vitestEntrypoint,
    "run",
    "tests/integration/rc5-evidence-authority.integration.test.ts",
    "--reporter",
    "verbose",
    "--pool",
    "forks",
    "--maxWorkers",
    "1",
    "--no-file-parallelism",
    "--testTimeout",
    "60000",
    "--hookTimeout",
    "60000",
    "--teardownTimeout",
    "30000",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RUN_PHASE3_INTEGRATION_TESTS: "1",
      RUN_RC5_EVIDENCE_AUTHORITY_INTEGRATION: "1",
    },
  },
);
child.once("exit", (code) => process.exit(code ?? 1));
