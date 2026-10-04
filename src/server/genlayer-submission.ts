import "server-only";

import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import type {
  DisputeWorkflowStatus,
  GenLayerSubmissionState,
} from "@prisma/client";

import {
  protocolConfig,
  deploymentForProtocol,
  type ProtocolVersion,
} from "../config/protocol";
import { prisma } from "../lib/prisma";
import {
  canonicalDisputePacketJson,
  hashDisputePacketV1,
  type CanonicalJson,
} from "../../genlayer/schemas/dispute-packet";
import { guards } from "./auth";
import {
  assertDisputeWorkflowTransition,
  DisputeWorkflowError,
} from "./dispute-workflow";

const execFile = promisify(execFileCallback);
const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;
const GENLAYER_STATUSES = new Set([
  "PENDING",
  "PROPOSING",
  "COMMITTING",
  "REVEALING",
  "ACCEPTED",
  "UNDETERMINED",
  "FINALIZED",
  "CANCELED",
  "APPEAL_REVEALING",
  "APPEAL_COMMITTING",
  "READY_TO_FINALIZE",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
]);

const LIFECYCLE_STATUSES = new Set([
  "PENDING",
  "PROPOSING",
  "COMMITTING",
  "REVEALING",
  "ACCEPTED",
  "UNDETERMINED",
  "FINALIZED",
  "CANCELED",
]);

export type GenLayerTransactionStatus =
  | "PENDING"
  | "PROPOSING"
  | "COMMITTING"
  | "REVEALING"
  | "ACCEPTED"
  | "UNDETERMINED"
  | "FINALIZED"
  | "CANCELED"
  | "APPEAL_REVEALING"
  | "APPEAL_COMMITTING"
  | "READY_TO_FINALIZE"
  | "VALIDATORS_TIMEOUT"
  | "LEADER_TIMEOUT";

export class GenLayerSubmissionError extends Error {
  constructor(
    readonly code: string,
    readonly mayHaveBeenSent: boolean,
  ) {
    super(code);
  }
}

export interface GenLayerCaseSubmitter {
  submitCase(input: {
    judge: string;
    canonicalPacket: string;
    protocolVersion?: ProtocolVersion;
    purpose?: GenLayerSubmissionPurpose;
  }): Promise<{ transactionHash: string }>;
}

/**
 * Commercial V2 remains disabled until its separately deployed X Layer escrow
 * exists.  This narrow purpose is solely for the isolated JudgeV2 validator
 * fetch proof and must never be inferred from a commercial workflow.
 */
export type GenLayerSubmissionPurpose =
  "COMMERCIAL_CASE" | "JUDGEV2_SYNTHETIC_PROOF";

export type PacketTransportMetadata = {
  packetByteLength: number;
  packetSha256: string;
  disputePacketHash: string;
};

export function packetTransportMetadata(
  canonicalPacket: string,
): PacketTransportMetadata {
  let parsed: { disputePacketHash?: unknown };
  try {
    parsed = JSON.parse(canonicalPacket) as { disputePacketHash?: unknown };
  } catch {
    throw new GenLayerSubmissionError("INVALID_CANONICAL_PACKET", false);
  }
  if (
    typeof parsed.disputePacketHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(parsed.disputePacketHash)
  )
    throw new GenLayerSubmissionError("INVALID_DISPUTE_PACKET_HASH", false);
  return {
    packetByteLength: Buffer.byteLength(canonicalPacket, "utf8"),
    packetSha256: `0x${createHash("sha256").update(canonicalPacket, "utf8").digest("hex")}`,
    disputePacketHash: parsed.disputePacketHash.toLowerCase(),
  };
}

export interface GenLayerStatusClient {
  getTransactionStatus(
    transactionHash: string,
  ): Promise<{ status: GenLayerTransactionStatus; statusCode: number }>;
}

export type GenLayerSubmissionMode = "local-cli" | "worker";

/**
 * A public web process may create an intent, but never run the encrypted
 * GenLayer CLI account. Production deployments must use the worker mode.
 */
export function genLayerSubmissionMode(): GenLayerSubmissionMode {
  const configured = process.env.GENLAYER_SUBMISSION_MODE ?? "local-cli";
  if (configured === "worker") return "worker";
  if (
    configured === "local-cli" &&
    process.env.TOLERANCE_ENVIRONMENT !== "production"
  )
    return "local-cli";
  throw new DisputeWorkflowError("GENLAYER_LOCAL_CLI_DISABLED_IN_PRODUCTION");
}

type CommandResult = { stdout: string; stderr: string };
export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string },
) => Promise<CommandResult>;

function generatedDeployScript(judge: string, canonicalPacket: string) {
  return `import type { GenLayerClient } from "genlayer-js/types";\n\nconst judge = ${JSON.stringify(judge)};\nconst canonicalPacket = ${JSON.stringify(canonicalPacket)};\n\nexport default async function main(client: GenLayerClient<any>) {\n  const transactionHash = await client.writeContract({\n    address: judge as \`0x\${string}\`,\n    functionName: "submit_case",\n    args: [canonicalPacket],\n    value: 0n,\n  });\n  process.stdout.write(JSON.stringify({ transactionHash }) + "\\n");\n}\n`;
}

function parseSubmissionOutput(stdout: string) {
  const matches = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"));
  if (matches.length !== 1)
    throw new GenLayerSubmissionError("MALFORMED_EXECUTOR_OUTPUT", true);
  let parsed: unknown;
  try {
    parsed = JSON.parse(matches[0]!);
  } catch {
    throw new GenLayerSubmissionError("MALFORMED_EXECUTOR_OUTPUT", true);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Object.keys(parsed).length !== 1 ||
    typeof (parsed as { transactionHash?: unknown }).transactionHash !==
      "string" ||
    !TRANSACTION_HASH.test(
      (parsed as { transactionHash: string }).transactionHash,
    )
  )
    throw new GenLayerSubmissionError("MALFORMED_EXECUTOR_OUTPUT", true);
  return (parsed as { transactionHash: string }).transactionHash.toLowerCase();
}

const defaultCommandRunner: CommandRunner = async (command, args, options) => {
  try {
    const result = await execFile(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch {
    throw new GenLayerSubmissionError("GENLAYER_CLI_EXECUTION_FAILED", true);
  }
};

/**
 * Uses the active encrypted CLI/keychain account. The temporary script contains
 * only server-owned public judge and packet values and is deleted in all paths.
 */
export class CliGenLayerCaseSubmitter implements GenLayerCaseSubmitter {
  constructor(
    private readonly command = process.platform === "win32"
      ? "genlayer.cmd"
      : "genlayer",
    private readonly runtimeBase = join(
      process.cwd(),
      ".phase3c2-genlayer-submit",
    ),
    private readonly runCommand: CommandRunner = defaultCommandRunner,
  ) {}

  async submitCase(input: {
    judge: string;
    canonicalPacket: string;
    protocolVersion?: ProtocolVersion;
    purpose?: GenLayerSubmissionPurpose;
  }): Promise<{ transactionHash: string }> {
    const version = input.protocolVersion ?? "V1";
    const purpose = input.purpose ?? "COMMERCIAL_CASE";
    const deployment = deploymentForProtocol(version);
    if (purpose === "JUDGEV2_SYNTHETIC_PROOF" && version !== "V2")
      throw new GenLayerSubmissionError("SYNTHETIC_PROOF_REQUIRES_V2", false);
    if (
      purpose !== "JUDGEV2_SYNTHETIC_PROOF" &&
      (!deployment.deployed || !deployment.xLayer.escrow)
    )
      throw new GenLayerSubmissionError(
        `PROTOCOL_${version}_NOT_DEPLOYED`,
        false,
      );
    if (!deployment.genLayer.judge)
      throw new GenLayerSubmissionError(
        `PROTOCOL_${version}_NOT_DEPLOYED`,
        false,
      );
    if (input.judge.toLowerCase() !== deployment.genLayer.judge.toLowerCase())
      throw new GenLayerSubmissionError("WRONG_CONFIGURED_JUDGE", false);
    if (!input.canonicalPacket || typeof input.canonicalPacket !== "string")
      throw new GenLayerSubmissionError("INVALID_CANONICAL_PACKET", false);
    if (version === "V2") packetTransportMetadata(input.canonicalPacket);
    let workspace: string | undefined;
    try {
      await mkdir(this.runtimeBase, { recursive: true });
      workspace = await mkdtemp(join(this.runtimeBase, "submit-"));
      const deployDir = join(workspace, "deploy");
      await mkdir(deployDir);
      const scriptPath = join(deployDir, "001_submit_case.ts");
      await writeFile(
        scriptPath,
        generatedDeployScript(input.judge, input.canonicalPacket),
        "utf8",
      );
      const scripts = await readFile(scriptPath, "utf8");
      if (!scripts.includes('functionName: "submit_case"'))
        throw new GenLayerSubmissionError("EXECUTOR_SCRIPT_INVALID", false);
      const result = await this.runCommand(this.command, ["deploy"], {
        cwd: workspace,
      });
      return { transactionHash: parseSubmissionOutput(result.stdout) };
    } catch (error) {
      if (error instanceof GenLayerSubmissionError) throw error;
      throw new GenLayerSubmissionError(
        "GENLAYER_EXECUTOR_PRE_SEND_FAILED",
        false,
      );
    } finally {
      if (workspace) await rm(workspace, { recursive: true, force: true });
    }
  }
}

export class JsonRpcGenLayerStatusClient implements GenLayerStatusClient {
  constructor(
    private readonly rpcUrl = protocolConfig.genLayer.rpcUrl,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async getTransactionStatus(transactionHash: string) {
    if (!TRANSACTION_HASH.test(transactionHash))
      throw new GenLayerSubmissionError(
        "MALFORMED_GENLAYER_TRANSACTION_HASH",
        false,
      );
    let response: Response;
    try {
      response = await this.fetcher(this.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "gen_getTransactionStatus",
          // Studionet accepts the raw transaction hash, not the debug/trace
          // object shape. This remains a narrow status-only read.
          params: [transactionHash],
          id: 1,
        }),
      });
    } catch {
      throw new GenLayerSubmissionError("GENLAYER_STATUS_UNAVAILABLE", false);
    }
    if (!response.ok)
      throw new GenLayerSubmissionError("GENLAYER_STATUS_UNAVAILABLE", false);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new GenLayerSubmissionError("MALFORMED_GENLAYER_STATUS", false);
    }
    const result = (body as { result?: unknown })?.result;
    const status =
      typeof result === "string"
        ? result
        : typeof result === "object" && result
          ? (result as { status?: unknown }).status
          : undefined;
    if (typeof status !== "string")
      throw new GenLayerSubmissionError("MALFORMED_GENLAYER_STATUS", false);
    if (!GENLAYER_STATUSES.has(status))
      throw new GenLayerSubmissionError("UNKNOWN_GENLAYER_STATUS", false);
    return {
      status: status as GenLayerTransactionStatus,
      statusCode:
        typeof result === "object" &&
        result &&
        Number.isInteger((result as { statusCode?: unknown }).statusCode)
          ? (result as { statusCode: number }).statusCode
          : 0,
    };
  }
}

const workflowStates = new Set<DisputeWorkflowStatus>([
  "XLAYER_DISPUTE_CONFIRMED",
  "GENLAYER_SUBMISSION_PENDING",
  "GENLAYER_SUBMITTED",
  "GENLAYER_SUBMISSION_UNKNOWN",
  "REVIEW_REQUIRED",
]);

function assertPhase3C2State(status: DisputeWorkflowStatus | null) {
  if (!status || !workflowStates.has(status))
    throw new DisputeWorkflowError("NOT_A_PHASE3C2_WORKFLOW");
}

async function loadAuthorizedSubmissionWorkflow(
  actorId: string,
  workflowId: string,
) {
  const workflow = await prisma.adjudicationCase.findUniqueOrThrow({
    where: { id: workflowId },
    include: {
      obligation: { include: { deal: true } },
      disputePacketSnapshot: {
        include: {
          evidenceBundle: true,
          evaluationContext: { include: { evidenceBundle: true } },
          aiEvaluation: { include: { evaluationRun: true } },
        },
      },
    },
  });
  await guards.requireDealAccess(actorId, workflow.obligation.dealId);
  assertPhase3C2State(workflow.workflowStatus);
  return workflow;
}

function validateSubmissionLineage(
  workflow: Awaited<ReturnType<typeof loadAuthorizedSubmissionWorkflow>>,
) {
  const snapshot = workflow.disputePacketSnapshot;
  if (!snapshot) throw new DisputeWorkflowError("MISSING_PACKET_SNAPSHOT");
  if (
    workflow.workflowStatus !== "XLAYER_DISPUTE_CONFIRMED" &&
    workflow.workflowStatus !== "GENLAYER_SUBMISSION_PENDING" &&
    workflow.workflowStatus !== "GENLAYER_SUBMITTED"
  )
    throw new DisputeWorkflowError(
      "WORKFLOW_NOT_READY_FOR_GENLAYER_SUBMISSION",
    );
  if (
    workflow.judgeAddress.toLowerCase() !==
      protocolConfig.genLayer.judge.toLowerCase() ||
    workflow.genLayerChainId !== protocolConfig.genLayer.chainId
  )
    throw new DisputeWorkflowError("GENLAYER_CONFIG_MISMATCH");
  if (protocolConfig.automaticAttestationEnabled)
    throw new DisputeWorkflowError("AUTOMATIC_ATTESTATION_MUST_BE_DISABLED");
  if (
    !workflow.xLayerDisputeTxHash ||
    !workflow.xLayerDisputeConfirmedAt ||
    workflow.obligation.observedOnchainState !== "DISPUTED" ||
    workflow.obligation.disputePacketHash?.toLowerCase() !==
      workflow.disputePacketHash.toLowerCase()
  )
    throw new DisputeWorkflowError("XLAYER_DISPUTE_BINDING_REQUIRED");
  if (
    snapshot.obligationId !== workflow.obligationId ||
    snapshot.caseId.toLowerCase() !== workflow.caseId.toLowerCase() ||
    snapshot.disputePacketHash.toLowerCase() !==
      workflow.disputePacketHash.toLowerCase() ||
    snapshot.evidenceBundle.obligationId !== workflow.obligationId ||
    snapshot.evaluationContext.obligationId !== workflow.obligationId ||
    snapshot.evaluationContext.evidenceBundleId !== snapshot.evidenceBundleId ||
    snapshot.aiEvaluation.obligationId !== workflow.obligationId ||
    snapshot.aiEvaluation.evaluationContextId !==
      snapshot.evaluationContextId ||
    snapshot.aiEvaluation.evaluationContextHash !==
      snapshot.evaluationContext.evaluationContextHash ||
    snapshot.aiEvaluation.evaluationRun.status !== "VALIDATED"
  )
    throw new DisputeWorkflowError("STALE_PACKET_LINEAGE");
  let packet: Record<string, CanonicalJson>;
  try {
    packet = JSON.parse(snapshot.canonicalJson) as Record<
      string,
      CanonicalJson
    >;
  } catch {
    throw new DisputeWorkflowError("MALFORMED_PERSISTED_PACKET");
  }
  const canonical = canonicalDisputePacketJson(packet as CanonicalJson);
  if (canonical !== snapshot.canonicalJson)
    throw new DisputeWorkflowError("NONCANONICAL_PERSISTED_PACKET");
  const { disputePacketHash, ...withoutHash } = packet;
  if (typeof disputePacketHash !== "string")
    throw new DisputeWorkflowError("MALFORMED_PERSISTED_PACKET");
  const recomputed = hashDisputePacketV1(
    withoutHash as { readonly disputePacketHash?: never } & Record<
      string,
      CanonicalJson
    >,
  );
  const normalizedBytes32 = (value: string | null) =>
    value?.startsWith("sha256:")
      ? `0x${value.slice("sha256:".length)}`.toLowerCase()
      : value?.toLowerCase();
  const identityMatches =
    typeof packet.caseId === "string" &&
    packet.caseId.toLowerCase() === workflow.caseId.toLowerCase() &&
    packet.xLayerChainId === workflow.obligation.xLayerChainId &&
    typeof packet.xLayerEscrow === "string" &&
    packet.xLayerEscrow.toLowerCase() ===
      workflow.obligation.xLayerEscrow.toLowerCase() &&
    packet.obligationId === Number(workflow.obligation.xLayerObligationId) &&
    packet.agreementHash ===
      normalizedBytes32(workflow.obligation.agreementHash) &&
    packet.policyHash === normalizedBytes32(workflow.obligation.policyHash) &&
    packet.evidenceRoot === normalizedBytes32(workflow.obligation.evidenceRoot);
  if (
    !identityMatches ||
    recomputed.toLowerCase() !== snapshot.disputePacketHash.toLowerCase() ||
    disputePacketHash.toLowerCase() !== snapshot.disputePacketHash.toLowerCase()
  )
    throw new DisputeWorkflowError("PACKET_BINDING_MISMATCH");
  return { snapshot, canonicalPacket: canonical };
}

async function transitionToUnknown(
  workflowId: string,
  actorId: string,
  organizationId: string,
  failureCode: string,
) {
  await prisma.$transaction(async (tx) => {
    const result = await tx.adjudicationCase.updateMany({
      where: {
        id: workflowId,
        workflowStatus: "GENLAYER_SUBMISSION_PENDING",
        submissionState: "DISPATCHING",
      },
      data: {
        workflowStatus: "GENLAYER_SUBMISSION_UNKNOWN",
        submissionState: "UNKNOWN",
        workflowVersion: { increment: 1 },
        failureCode,
        nextAttemptAt: null,
      },
    });
    if (result.count)
      await tx.auditEvent.create({
        data: {
          actorId,
          organizationId,
          action: "GENLAYER_SUBMISSION_UNKNOWN",
          targetType: "AdjudicationCase",
          targetId: workflowId,
          metadata: { failureCode },
        },
      });
  });
}

/**
 * Creates a durable, idempotent submission intent without invoking any
 * external signer. This is the only GenLayer submission operation exposed to
 * the deployed web application.
 */
export async function requestGenLayerCaseSubmission(
  actorId: string,
  workflowId: string,
) {
  const initial = await loadAuthorizedSubmissionWorkflow(actorId, workflowId);
  if (
    initial.workflowStatus === "GENLAYER_SUBMISSION_UNKNOWN" ||
    initial.workflowStatus === "REVIEW_REQUIRED"
  )
    throw new DisputeWorkflowError("GENLAYER_REVIEW_REQUIRED");
  validateSubmissionLineage(initial);
  if (
    initial.workflowStatus === "GENLAYER_SUBMITTED" &&
    initial.submissionTxHash
  )
    return { workflow: initial, reused: true };
  if (initial.workflowStatus === "GENLAYER_SUBMISSION_PENDING")
    return { workflow: initial, reused: true };
  if (initial.workflowStatus !== "XLAYER_DISPUTE_CONFIRMED")
    throw new DisputeWorkflowError(
      "WORKFLOW_NOT_READY_FOR_GENLAYER_SUBMISSION",
    );

  assertDisputeWorkflowTransition(
    initial.workflowStatus,
    "GENLAYER_SUBMISSION_PENDING",
  );
  const requestId = initial.submissionRequestId ?? randomUUID();
  const created = await prisma.$transaction(async (tx) => {
    const result = await tx.adjudicationCase.updateMany({
      where: {
        id: workflowId,
        workflowStatus: "XLAYER_DISPUTE_CONFIRMED",
        workflowVersion: initial.workflowVersion,
      },
      data: {
        workflowStatus: "GENLAYER_SUBMISSION_PENDING",
        workflowVersion: { increment: 1 },
        submissionRequestId: requestId,
        submissionState: "INTENT_CREATED",
        submissionRequestedAt: new Date(),
        failureCode: null,
        nextAttemptAt: null,
      },
    });
    if (result.count !== 1) return null;
    const row = await tx.adjudicationCase.findUniqueOrThrow({
      where: { id: workflowId },
    });
    await tx.auditEvent.create({
      data: {
        actorId,
        organizationId: initial.obligation.deal.organizationId,
        action: "GENLAYER_SUBMISSION_INTENT_CREATED",
        targetType: "AdjudicationCase",
        targetId: workflowId,
        metadata: { requestId },
      },
    });
    return row;
  });
  if (created) return { workflow: created, reused: false };
  const current = await loadAuthorizedSubmissionWorkflow(actorId, workflowId);
  if (
    current.workflowStatus === "GENLAYER_SUBMISSION_PENDING" ||
    (current.workflowStatus === "GENLAYER_SUBMITTED" &&
      current.submissionTxHash)
  )
    return { workflow: current, reused: true };
  throw new DisputeWorkflowError("GENLAYER_SUBMISSION_IN_PROGRESS");
}

export async function submitGenLayerCase(
  actorId: string,
  workflowId: string,
  submitter: GenLayerCaseSubmitter = new CliGenLayerCaseSubmitter(),
) {
  // Direct execution is intentionally retained only for local integration
  // harnesses and the persistent worker. The Vercel action uses the intent
  // function above and never reaches this CLI boundary.
  const initial = await loadAuthorizedSubmissionWorkflow(actorId, workflowId);
  if (
    initial.workflowStatus === "GENLAYER_SUBMISSION_UNKNOWN" ||
    initial.workflowStatus === "REVIEW_REQUIRED"
  )
    throw new DisputeWorkflowError("GENLAYER_REVIEW_REQUIRED");
  const { canonicalPacket } = validateSubmissionLineage(initial);
  if (
    initial.workflowStatus === "GENLAYER_SUBMITTED" &&
    initial.submissionTxHash
  )
    return { workflow: initial, reused: true };
  const requestId = initial.submissionRequestId ?? randomUUID();
  if (initial.workflowStatus === "XLAYER_DISPUTE_CONFIRMED") {
    assertDisputeWorkflowTransition(
      initial.workflowStatus,
      "GENLAYER_SUBMISSION_PENDING",
    );
    const claimed = await prisma.$transaction(async (tx) => {
      const result = await tx.adjudicationCase.updateMany({
        where: {
          id: workflowId,
          workflowStatus: "XLAYER_DISPUTE_CONFIRMED",
          workflowVersion: initial.workflowVersion,
        },
        data: {
          workflowStatus: "GENLAYER_SUBMISSION_PENDING",
          workflowVersion: { increment: 1 },
          submissionRequestId: requestId,
          submissionState: "INTENT_CREATED",
          submissionRequestedAt: new Date(),
          failureCode: null,
          nextAttemptAt: null,
        },
      });
      if (result.count !== 1) return null;
      const row = await tx.adjudicationCase.findUniqueOrThrow({
        where: { id: workflowId },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          organizationId: initial.obligation.deal.organizationId,
          action: "GENLAYER_SUBMISSION_INTENT_CREATED",
          targetType: "AdjudicationCase",
          targetId: workflowId,
          metadata: { requestId },
        },
      });
      return row;
    });
    if (!claimed) {
      const current = await loadAuthorizedSubmissionWorkflow(
        actorId,
        workflowId,
      );
      if (
        current.workflowStatus === "GENLAYER_SUBMITTED" &&
        current.submissionTxHash
      )
        return { workflow: current, reused: true };
      if (current.submissionState === "DISPATCHING")
        throw new DisputeWorkflowError("GENLAYER_SUBMISSION_IN_PROGRESS");
      return submitGenLayerCase(actorId, workflowId, submitter);
    }
  }

  const dispatch = await prisma.adjudicationCase.updateMany({
    where: {
      id: workflowId,
      workflowStatus: "GENLAYER_SUBMISSION_PENDING",
      submissionState: { in: ["INTENT_CREATED", "FAILED_BEFORE_SEND"] },
    },
    data: {
      submissionState: "DISPATCHING",
      submissionDispatchAt: new Date(),
      failureCode: null,
      nextAttemptAt: null,
    },
  });
  if (dispatch.count !== 1) {
    const current = await loadAuthorizedSubmissionWorkflow(actorId, workflowId);
    if (
      current.workflowStatus === "GENLAYER_SUBMITTED" &&
      current.submissionTxHash
    )
      return { workflow: current, reused: true };
    if (current.submissionState === "DISPATCHING")
      throw new DisputeWorkflowError("GENLAYER_SUBMISSION_IN_PROGRESS");
    if (current.workflowStatus === "GENLAYER_SUBMISSION_UNKNOWN")
      throw new DisputeWorkflowError("GENLAYER_REVIEW_REQUIRED");
    throw new DisputeWorkflowError("SUBMISSION_INTENT_NOT_RETRYABLE");
  }

  try {
    const { transactionHash } = await submitter.submitCase({
      judge: protocolConfig.genLayer.judge,
      canonicalPacket,
    });
    if (!TRANSACTION_HASH.test(transactionHash))
      throw new GenLayerSubmissionError("MALFORMED_EXECUTOR_OUTPUT", true);
    const submittedAt = new Date();
    const workflow = await prisma.$transaction(async (tx) => {
      assertDisputeWorkflowTransition(
        "GENLAYER_SUBMISSION_PENDING",
        "GENLAYER_SUBMITTED",
      );
      const result = await tx.adjudicationCase.updateMany({
        where: {
          id: workflowId,
          workflowStatus: "GENLAYER_SUBMISSION_PENDING",
          submissionState: "DISPATCHING",
        },
        data: {
          workflowStatus: "GENLAYER_SUBMITTED",
          workflowVersion: { increment: 1 },
          submissionState: "SUBMITTED",
          submissionTxHash: transactionHash.toLowerCase(),
          submissionSubmittedAt: submittedAt,
          failureCode: null,
          nextAttemptAt: null,
        },
      });
      if (result.count !== 1)
        throw new DisputeWorkflowError("SUBMISSION_PERSISTENCE_RACE");
      const row = await tx.adjudicationCase.findUniqueOrThrow({
        where: { id: workflowId },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          organizationId: initial.obligation.deal.organizationId,
          action: "GENLAYER_CASE_SUBMITTED",
          targetType: "AdjudicationCase",
          targetId: workflowId,
          metadata: { transactionHash: transactionHash.toLowerCase() },
        },
      });
      return row;
    });
    return { workflow, reused: false };
  } catch (error) {
    const submissionError =
      error instanceof GenLayerSubmissionError
        ? error
        : new GenLayerSubmissionError("GENLAYER_EXECUTOR_UNKNOWN", true);
    if (submissionError.mayHaveBeenSent) {
      assertDisputeWorkflowTransition(
        "GENLAYER_SUBMISSION_PENDING",
        "GENLAYER_SUBMISSION_UNKNOWN",
      );
      await transitionToUnknown(
        workflowId,
        actorId,
        initial.obligation.deal.organizationId,
        submissionError.code,
      );
    } else {
      await prisma.$transaction(async (tx) => {
        const result = await tx.adjudicationCase.updateMany({
          where: {
            id: workflowId,
            workflowStatus: "GENLAYER_SUBMISSION_PENDING",
            submissionState: "DISPATCHING",
          },
          data: {
            workflowStatus: "XLAYER_DISPUTE_CONFIRMED",
            workflowVersion: { increment: 1 },
            submissionState: "FAILED_BEFORE_SEND",
            failureCode: submissionError.code,
            nextAttemptAt: new Date(),
          },
        });
        if (result.count)
          await tx.auditEvent.create({
            data: {
              actorId,
              organizationId: initial.obligation.deal.organizationId,
              action: "GENLAYER_SUBMISSION_PRE_SEND_FAILED",
              targetType: "AdjudicationCase",
              targetId: workflowId,
              metadata: { failureCode: submissionError.code },
            },
          });
      });
    }
    throw error;
  }
}

/**
 * Worker-only, database-backed dispatcher. It never accepts a packet, judge,
 * or workflow id from a network caller; it processes one durable intent whose
 * original requester is still used for the normal authorization re-check.
 */
export async function processNextPendingGenLayerSubmission(
  submitter: GenLayerCaseSubmitter = new CliGenLayerCaseSubmitter(),
) {
  if (process.env.GENLAYER_SUBMISSION_MODE !== "worker")
    throw new DisputeWorkflowError("GENLAYER_WORKER_MODE_REQUIRED");
  const candidate = await prisma.adjudicationCase.findFirst({
    where: {
      workflowStatus: "GENLAYER_SUBMISSION_PENDING",
      submissionState: { in: ["INTENT_CREATED", "FAILED_BEFORE_SEND"] },
      requestedById: { not: null },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    orderBy: { submissionRequestedAt: "asc" },
    select: { id: true, requestedById: true },
  });
  if (!candidate?.requestedById) return null;
  try {
    const result = await submitGenLayerCase(
      candidate.requestedById,
      candidate.id,
      submitter,
    );
    return { workflowId: candidate.id, dispatched: !result.reused };
  } catch (error) {
    if (
      error instanceof DisputeWorkflowError &&
      error.code === "GENLAYER_SUBMISSION_IN_PROGRESS"
    )
      return { workflowId: candidate.id, dispatched: false };
    throw error;
  }
}

export async function pollGenLayerSubmissionStatus(
  actorId: string,
  workflowId: string,
  statusClient: GenLayerStatusClient = new JsonRpcGenLayerStatusClient(),
) {
  const workflow = await loadAuthorizedSubmissionWorkflow(actorId, workflowId);
  if (
    workflow.workflowStatus !== "GENLAYER_SUBMITTED" ||
    workflow.submissionState !== "SUBMITTED" ||
    !workflow.submissionTxHash
  )
    throw new DisputeWorkflowError("GENLAYER_SUBMISSION_NOT_FOUND");
  let observed: { status: GenLayerTransactionStatus; statusCode: number };
  try {
    observed = await statusClient.getTransactionStatus(
      workflow.submissionTxHash,
    );
  } catch (error) {
    const code =
      error instanceof GenLayerSubmissionError
        ? error.code
        : "GENLAYER_STATUS_UNAVAILABLE";
    if (
      code === "UNKNOWN_GENLAYER_STATUS" ||
      code === "MALFORMED_GENLAYER_STATUS"
    ) {
      await prisma.adjudicationCase.update({
        where: { id: workflowId },
        data: {
          workflowStatus: "REVIEW_REQUIRED",
          workflowVersion: { increment: 1 },
          submissionState: "REVIEW_REQUIRED",
          failureCode: code,
          lastObservedAt: new Date(),
        },
      });
    } else {
      await prisma.adjudicationCase.update({
        where: { id: workflowId },
        data: { failureCode: code, lastObservedAt: new Date() },
      });
    }
    throw error;
  }
  const changed = workflow.lastStatus !== observed.status;
  const lifecycle = LIFECYCLE_STATUSES.has(observed.status)
    ? (observed.status as
        | "PENDING"
        | "PROPOSING"
        | "COMMITTING"
        | "REVEALING"
        | "ACCEPTED"
        | "UNDETERMINED"
        | "FINALIZED"
        | "CANCELED")
    : undefined;
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.adjudicationCase.update({
      where: { id: workflowId },
      data: {
        ...(lifecycle ? { lifecycle } : {}),
        lastStatus: observed.status,
        lastObservedAt: new Date(),
        failureCode: null,
      },
    });
    if (changed)
      await tx.auditEvent.create({
        data: {
          actorId,
          organizationId: workflow.obligation.deal.organizationId,
          action: "GENLAYER_SUBMISSION_STATUS_OBSERVED",
          targetType: "AdjudicationCase",
          targetId: workflowId,
          metadata: {
            status: observed.status,
            statusCode: observed.statusCode,
          },
        },
      });
    return row;
  });
  return { workflow: updated, status: observed.status };
}

export function isGenLayerSubmissionState(
  value: string,
): value is GenLayerSubmissionState {
  return [
    "INTENT_CREATED",
    "DISPATCHING",
    "SUBMITTED",
    "FAILED_BEFORE_SEND",
    "UNKNOWN",
    "REVIEW_REQUIRED",
  ].includes(value);
}
