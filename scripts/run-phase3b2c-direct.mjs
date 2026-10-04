import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vitest = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url),
);
// A venv lays its interpreter out differently per platform, so probe both
// layouts rather than assuming one.
const python = ["Scripts/python.exe", "bin/python3", "bin/python"]
  .map((relative) =>
    fileURLToPath(new URL(`../.venv-genlayer/${relative}`, import.meta.url)),
  )
  .find((candidate) => existsSync(candidate));

if (!python) {
  console.error(
    "Phase 3B2C Direct Mode requires .venv-genlayer with Python 3.12.",
  );
  process.exit(1);
}
const preflight = spawnSync(
  python,
  [
    "-c",
    "import sys; assert sys.version_info[:2] == (3, 12), f'Python 3.12 required, got {sys.version.split()[0]}'",
  ],
  { cwd: root, stdio: "inherit" },
);
if (preflight.status !== 0) process.exit(preflight.status ?? 1);

const generated = spawnSync(
  process.execPath,
  [vitest, "run", "tests/integration/phase3b2c-golden.integration.test.ts"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      RUN_PHASE3_INTEGRATION_TESTS: "1",
      UPDATE_PHASE3B2C_GOLDENS: process.env.UPDATE_PHASE3B2C_GOLDENS ?? "0",
    },
  },
);
if (generated.status !== 0) process.exit(generated.status ?? 1);

const direct = spawnSync(
  python,
  ["-m", "pytest", "tests/direct/test_phase3b2c_application_packets.py", "-v"],
  {
    cwd: fileURLToPath(new URL("../genlayer", import.meta.url)),
    stdio: "inherit",
  },
);
process.exit(direct.status ?? 1);
