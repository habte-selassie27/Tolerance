import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
for (const required of ["DATABASE_URL", "DIRECT_URL"]) {
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
    "tests/integration/phase3b1b-provenance.integration.test.ts",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RUN_PHASE3_INTEGRATION_TESTS: "1",
      RUN_PHASE3C23_LIVE_XLAYER: "1",
    },
  },
);
child.once("exit", (code) => process.exit(code ?? 1));
