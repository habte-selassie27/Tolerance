import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
for (const required of ["OPENAI_API_KEY", "TOLERANCE_EVALUATION_MODEL"]) {
  if (!process.env[required])
    throw new Error(
      `Missing required OpenAI integration configuration: ${required}`,
    );
}
const vitest = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);
const child = spawn(
  process.execPath,
  [vitest, "run", "tests/integration/openai-evaluation.integration.test.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RUN_PHASE3_INTEGRATION_TESTS: "1",
      RUN_OPENAI_EVALUATION_INTEGRATION: "1",
    },
  },
);
child.once("exit", (code) => process.exit(code ?? 1));
