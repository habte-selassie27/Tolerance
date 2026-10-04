import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

for (const required of [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  if (!process.env[required]) {
    throw new Error(`Missing required integration configuration: ${required}`);
  }
}

const vitestEntrypoint = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);
const child = spawn(
  process.execPath,
  [
    vitestEntrypoint,
    "run",
    "tests/integration/phase3b1b-provenance.integration.test.ts",
    "tests/integration/rc3-commercial.integration.test.ts",
    "--reporter",
    "verbose",
    "--pool",
    "forks",
    "--maxWorkers",
    "1",
    "--no-file-parallelism",
    "--testTimeout",
    "90000",
    "--hookTimeout",
    "60000",
    "--teardownTimeout",
    "30000",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, RUN_PHASE3_INTEGRATION_TESTS: "1" },
  },
);

child.once("exit", (code) => process.exit(code ?? 1));
