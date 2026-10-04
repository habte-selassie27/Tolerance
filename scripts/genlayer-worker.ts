import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { loadEnvConfig } from "@next/env";
import { protocolConfig, protocolDeployments } from "../src/config/protocol";
import { prisma } from "../src/lib/prisma";
import {
  CliGenLayerCaseSubmitter,
  processNextPendingGenLayerSubmission,
} from "../src/server/genlayer-submission";
import {
  processNextPendingJudgeV2SyntheticProof,
  reconcileSubmittedJudgeV2SyntheticProof,
} from "../src/server/judge-v2-synthetic-proof";

const run = promisify(execFile);
const expectedAddress = "0xb5ecd6dda36b370aca4af5e2005d8e2ae89c6db2";
const intervalMs = Number(process.env.GENLAYER_WORKER_POLL_MS ?? "15000");

function log(event: string, metadata: Record<string, string | boolean> = {}) {
  process.stdout.write(`${JSON.stringify({ event, ...metadata })}\n`);
}

async function command(command: string, args: string[]) {
  if (process.platform === "win32")
    return run("cmd.exe", ["/d", "/s", "/c", [command, ...args].join(" ")], {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  return run(command, args, { windowsHide: true, maxBuffer: 1024 * 1024 });
}

export async function selfCheck() {
  if (process.env.GENLAYER_SUBMISSION_MODE !== "worker")
    throw new Error("GENLAYER_WORKER_MODE_REQUIRED");
  if (process.env.AUTOMATIC_ATTESTATION_ENABLED !== "false")
    throw new Error("AUTOMATIC_ATTESTATION_MUST_BE_DISABLED");
  await prisma.$queryRaw`SELECT 1`;
  const cli = "genlayer";
  const [accounts, network] = await Promise.all([
    command(cli, ["account", "list"]),
    command(cli, ["network", "info"]),
  ]);
  const accountOutput = String(accounts.stdout).toLowerCase();
  const networkOutput = String(network.stdout).toLowerCase();
  if (!accountOutput.includes(expectedAddress))
    throw new Error("GENLAYER_SUBMITTER_ADDRESS_MISMATCH");
  if (!networkOutput.includes("studionet") || !networkOutput.includes("61999"))
    throw new Error("GENLAYER_NETWORK_MISMATCH");
  if (protocolConfig.genLayer.chainId !== 61999)
    throw new Error("GENLAYER_PROTOCOL_CONFIG_MISMATCH");
  const judgeV2 = protocolDeployments.V2.genLayer.judge;
  if (
    !judgeV2 ||
    protocolDeployments.V2.deployed ||
    protocolDeployments.V2.xLayer.escrow
  )
    throw new Error("GENLAYER_V2_PROOF_CONFIG_MISMATCH");
  const [v1Submitter, v2Submitter] = await Promise.all([
    command(cli, [
      "call",
      protocolConfig.genLayer.judge,
      "get_authorized_submitter",
    ]),
    command(cli, ["call", judgeV2, "get_authorized_submitter"]),
  ]);
  if (!String(v1Submitter.stdout).toLowerCase().includes(expectedAddress))
    throw new Error("GENLAYER_V1_JUDGE_SUBMITTER_MISMATCH");
  if (!String(v2Submitter.stdout).toLowerCase().includes(expectedAddress))
    throw new Error("GENLAYER_V2_JUDGE_SUBMITTER_MISMATCH");
  log("GENLAYER_WORKER_READY", {
    account: expectedAddress,
    network: "studionet",
    v1Judge: protocolConfig.genLayer.judge,
    v2Judge: judgeV2,
  });
}

async function runOnce() {
  const submitter = new CliGenLayerCaseSubmitter();
  const result = await processNextPendingGenLayerSubmission(submitter);
  const proofResult = await processNextPendingJudgeV2SyntheticProof(submitter);
  const proofObservation = await reconcileSubmittedJudgeV2SyntheticProof();
  log("GENLAYER_WORKER_TICK", {
    dispatched: Boolean(result?.dispatched),
    hasEligibleIntent: Boolean(result),
    syntheticProofDispatched: Boolean(proofResult?.dispatched),
    hasSyntheticProofIntent: Boolean(proofResult),
    syntheticProofFinalized: Boolean(proofObservation?.finalized),
  });
}

async function main() {
  loadEnvConfig(process.cwd());
  await selfCheck();
  if (process.env.GENLAYER_WORKER_SELF_CHECK_ONLY === "true") return;
  await runOnce();
  if (process.env.GENLAYER_WORKER_ONCE === "true") return;
  const timer = setInterval(
    () => {
      void runOnce().catch((error) =>
        log("GENLAYER_WORKER_TICK_FAILED", {
          code: error instanceof Error ? error.message : "UNKNOWN",
        }),
      );
    },
    Number.isFinite(intervalMs) && intervalMs >= 1000 ? intervalMs : 15000,
  );
  const stop = () => {
    clearInterval(timer);
    process.exitCode = 0;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

void main()
  .catch((error) => {
    log("GENLAYER_WORKER_STARTUP_FAILED", {
      code: error instanceof Error ? error.message : "UNKNOWN",
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.GENLAYER_WORKER_SELF_CHECK_ONLY === "true")
      await prisma.$disconnect();
  });
