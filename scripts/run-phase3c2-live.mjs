import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

for (const required of [
  "DATABASE_URL",
  "DIRECT_URL",
  "PHASE3C2_LIVE_ACTOR_ID",
  "PHASE3C2_LIVE_WORKFLOW_ID",
]) {
  if (!process.env[required])
    throw new Error(
      `Missing required controlled-live configuration: ${required}`,
    );
}

const vitestEntrypoint = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);
const child = spawn(
  process.execPath,
  [
    vitestEntrypoint,
    "run",
    "tests/integration/phase3c2-live.integration.test.ts",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, RUN_PHASE3C2_LIVE_SUBMISSION: "1" },
  },
);
child.once("exit", (code) => process.exit(code ?? 1));
