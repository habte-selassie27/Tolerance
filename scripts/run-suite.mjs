import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

/**
 * Every opt-in integration suite is declared here instead of in its own
 * wrapper script: a suite is the configuration it needs, the files it runs and
 * the flags Vitest should see. Adding a suite costs a row, not a file.
 *
 * `RUN_PHASE3_INTEGRATION_TESTS` gates the whole `tests/integration/` folder in
 * `vitest.config.mts`; the per-suite flags narrow it to one suite.
 */
const SUITES = {
  persistence: {
    description:
      "Provenance persistence, cross-boundary rejections and the commercial lifecycle.",
    required: [
      "DATABASE_URL",
      "DIRECT_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
    files: [
      "tests/integration/phase3b1b-provenance.integration.test.ts",
      "tests/integration/rc3-commercial.integration.test.ts",
    ],
    env: { RUN_PHASE3_INTEGRATION_TESTS: "1" },
    vitest: [
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
  },
  "openai-evaluation": {
    description: "Constrained AI evaluation against the real OpenAI provider.",
    required: ["OPENAI_API_KEY", "TOLERANCE_EVALUATION_MODEL"],
    files: ["tests/integration/openai-evaluation.integration.test.ts"],
    env: {
      RUN_PHASE3_INTEGRATION_TESTS: "1",
      RUN_OPENAI_EVALUATION_INTEGRATION: "1",
    },
    vitest: [],
  },
  "phase3c2-live": {
    description: "Controlled live GenLayer submission lane.",
    required: [
      "DATABASE_URL",
      "DIRECT_URL",
      "PHASE3C2_LIVE_ACTOR_ID",
      "PHASE3C2_LIVE_WORKFLOW_ID",
    ],
    files: ["tests/integration/phase3c2-live.integration.test.ts"],
    env: { RUN_PHASE3C2_LIVE_SUBMISSION: "1" },
    vitest: [],
  },
  "phase3c23-live": {
    description: "Controlled live X Layer lane over the provenance suite.",
    required: ["DATABASE_URL", "DIRECT_URL"],
    files: ["tests/integration/phase3b1b-provenance.integration.test.ts"],
    env: {
      RUN_PHASE3_INTEGRATION_TESTS: "1",
      RUN_PHASE3C23_LIVE_XLAYER: "1",
    },
    vitest: [],
  },
  "phase3b2c-golden": {
    description:
      "Golden dispute-packet vectors cross-checked against the Python reference.",
    required: [],
    files: ["tests/integration/phase3b2c-golden.integration.test.ts"],
    env: {
      RUN_PHASE3_INTEGRATION_TESTS: "1",
      UPDATE_PHASE3B2C_GOLDENS: process.env.UPDATE_PHASE3B2C_GOLDENS ?? "0",
    },
    vitest: [],
    python: {
      cwd: "../genlayer",
      pytest: ["tests/direct/test_phase3b2c_application_packets.py", "-v"],
    },
  },
  "rc5-evidence-authority": {
    description: "Evidence authority boundary with a real database.",
    required: ["DATABASE_URL", "DIRECT_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    files: ["tests/integration/rc5-evidence-authority.integration.test.ts"],
    env: {
      RUN_PHASE3_INTEGRATION_TESTS: "1",
      RUN_RC5_EVIDENCE_AUTHORITY_INTEGRATION: "1",
    },
    vitest: [
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
  },
};

/**
 * A venv lays its interpreter out differently per platform, so probe both
 * layouts rather than assuming one.
 */
function resolvePython() {
  const candidate = ["Scripts/python.exe", "bin/python3", "bin/python"]
    .map((relative) =>
      fileURLToPath(new URL(`../.venv-genlayer/${relative}`, import.meta.url)),
    )
    .find((path) => existsSync(path));
  if (!candidate) {
    throw new Error("This suite requires .venv-genlayer with Python 3.12.");
  }
  const preflight = spawnSync(
    candidate,
    [
      "-c",
      "import sys; assert sys.version_info[:2] == (3, 12), f'Python 3.12 required, got {sys.version.split()[0]}'",
    ],
    { stdio: "inherit" },
  );
  if (preflight.status !== 0) process.exit(preflight.status ?? 1);
  return candidate;
}

const usage = () =>
  Object.entries(SUITES)
    .map(([name, suite]) => `  ${name.padEnd(24)} ${suite.description}`)
    .join("\n");

const [name, ...passthrough] = process.argv.slice(2);

if (!name || name === "--list" || name === "--help") {
  console.log(
    `Usage: node scripts/run-suite.mjs <suite> [vitest args...]\n\n${usage()}`,
  );
  process.exit(name ? 0 : 1);
}

const suite = SUITES[name];
if (!suite) {
  console.error(`Unknown integration suite: ${name}\n\n${usage()}`);
  process.exit(1);
}

loadEnvConfig(process.cwd());

const missing = suite.required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing required integration configuration for "${name}": ${missing.join(", ")}`,
  );
}

const vitest = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);

const child = spawn(
  process.execPath,
  [vitest, "run", ...suite.files, ...suite.vitest, ...passthrough],
  {
    stdio: "inherit",
    env: { ...process.env, ...suite.env },
  },
);

child.once("exit", (code) => {
  if (code) process.exit(code);
  if (!suite.python) process.exit(0);
  const direct = spawnSync(
    resolvePython(),
    ["-m", "pytest", ...suite.python.pytest],
    {
      cwd: fileURLToPath(new URL(suite.python.cwd, import.meta.url)),
      stdio: "inherit",
    },
  );
  process.exit(direct.status ?? 1);
});
