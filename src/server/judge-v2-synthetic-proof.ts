import "server-only";

import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import {
  encodeAbiParameters,
  keccak256,
  sha256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

import {
  canonicalDisputePacketJson,
  type CanonicalJson,
} from "../../genlayer/schemas/dispute-packet";
import {
  hashDisputePacketV2,
  hashEvidenceAuthorityPolicyV1,
  hashEvidenceManifestV2,
  validateEvidenceSourceReference,
  type EvidenceSourceReferenceV1,
} from "../../genlayer/schemas/v2";
import { deploymentForProtocol, protocolConfig } from "../config/protocol";
import { prisma } from "../lib/prisma";
import {
  GenLayerSubmissionError,
  JsonRpcGenLayerStatusClient,
  packetTransportMetadata,
  type GenLayerCaseSubmitter,
  type GenLayerStatusClient,
} from "./genlayer-submission";
import { type FinalizedJudgeStateReader } from "./resolution-observation";

const SYNTHETIC_ESCROW =
  "0x0000000000000000000000000000000000000001" as Address;
const SUCCESS_OBLIGATION_ID = 5_025_001;
const FAILURE_OBLIGATION_ID = 5_025_002;
const execFile = promisify(execFileCallback);

export type JudgeV2SyntheticProofInput = {
  sourceUrl: string;
  expectedContentHash?: Hex;
  expectedExtractHash?: Hex;
  failureMode?: "EXPECTED_CONTENT_HASH_MISMATCH";
};

function hashLabel(label: string): Hex {
  return sha256(stringToHex(label));
}

function syntheticCaseId(obligationId: number): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }],
      [1952n, SYNTHETIC_ESCROW, BigInt(obligationId)],
    ),
  );
}

function sourceReference(input: JudgeV2SyntheticProofInput) {
  const url = new URL(input.sourceUrl);
  const allowedPath = url.pathname;
  const expectedContentHash = input.failureMode
    ? (`0x${"ff".repeat(32)}` as Hex)
    : input.expectedContentHash;
  const sourcePolicyHash = hashEvidenceAuthorityPolicyV1({
    retrievalMode: "GET_JSON",
    allowedHost: url.hostname.toLowerCase(),
    allowedPath,
    ...(expectedContentHash ? { expectedContentHash } : {}),
    expectedContentType: "application/json",
    extractionRule: "JSON_FIELD:measurementMm",
  });
  const source: EvidenceSourceReferenceV1 = {
    sourceId: "SYNTHETIC_PUBLIC_MEASUREMENT",
    sourcePolicyHash,
    canonicalUrl: input.sourceUrl,
    retrievalMode: "GET_JSON",
    allowedHost: url.hostname.toLowerCase(),
    allowedPath,
    ...(expectedContentHash ? { expectedContentHash } : {}),
    expectedContentType: "application/json",
    extractionRule: "JSON_FIELD:measurementMm",
    requirementIds: ["SYNTHETIC-DIAMETER"],
  };
  return validateEvidenceSourceReference(source);
}

/**
 * Creates the only V2 artifact allowed before a V2 escrow exists: a clearly
 * marked synthetic JudgeV2 proof with a non-production identity.  It is never
 * used by commercial routing, funding, or settlement code.
 */
export function buildJudgeV2SyntheticProof(input: JudgeV2SyntheticProofInput) {
  const deployment = deploymentForProtocol("V2");
  if (!deployment.genLayer.judge)
    throw new Error("PROTOCOL_V2_JUDGE_NOT_CONFIGURED");
  if (deployment.deployed || deployment.xLayer.escrow)
    throw new Error("SYNTHETIC_PROOF_REQUIRES_ESCROW_UNDEPLOYED");
  if (protocolConfig.automaticAttestationEnabled)
    throw new Error("AUTOMATIC_ATTESTATION_MUST_BE_DISABLED");

  const source = sourceReference(input);
  const obligationId = input.failureMode
    ? FAILURE_OBLIGATION_ID
    : SUCCESS_OBLIGATION_ID;
  const packet = {
    schemaVersion: "2",
    caseId: syntheticCaseId(obligationId),
    xLayerChainId: 1952,
    xLayerEscrow: SYNTHETIC_ESCROW,
    obligationId,
    agreementHash: hashLabel("TOLERANCE_RC5B2_5_SYNTHETIC_AGREEMENT"),
    policyHash: hashLabel("TOLERANCE_RC5B2_5_SYNTHETIC_COMMERCIAL_POLICY"),
    evidenceRoot: hashEvidenceManifestV2({
      privateEvidence: [],
      publicSources: [source],
    }),
    decisionRubric:
      "Release only when the validator-fetched measurement is at most 50.15 mm.",
    burdenOfProof:
      "The synthetic supplier bears the burden using validator-fetched public evidence.",
    disputedRequirements: [
      {
        requirementId: "SYNTHETIC-DIAMETER",
        mandatory: true,
        text: "Measured diameter must be less than or equal to 50.15 mm.",
      },
    ],
    governingTerms: [
      {
        requirementId: "SYNTHETIC-DIAMETER",
        term: "Maximum measured diameter: 50.15 mm.",
      },
    ],
    approvedAmendments: [],
    privateEvidence: [],
    // Deliberately a source reference only. No fetched bytes, text, or fact is
    // packet-supplied for this public evidence class.
    publicSources: [source],
    deterministicCheckResults: [],
    buyerChallengeStatement: "Synthetic bounded validator-fetch proof.",
    supplierResponse:
      "Synthetic public source is policy-bound before dispatch.",
  } as unknown as Record<string, CanonicalJson>;
  const disputePacketHash = hashDisputePacketV2(packet);
  const canonicalPacket = canonicalDisputePacketJson({
    ...packet,
    disputePacketHash,
  } as CanonicalJson);
  const metadata = packetTransportMetadata(canonicalPacket);
  if (metadata.disputePacketHash !== disputePacketHash.toLowerCase())
    throw new Error("SYNTHETIC_PACKET_HASH_MISMATCH");
  return {
    caseId: packet.caseId as Hex,
    judgeAddress: deployment.genLayer.judge.toLowerCase(),
    source,
    canonicalPacket,
    disputePacketHash,
    evidenceRoot: packet.evidenceRoot as Hex,
    metadata,
  };
}

export async function createJudgeV2SyntheticProofIntent(
  input: JudgeV2SyntheticProofInput,
) {
  const proof = buildJudgeV2SyntheticProof(input);
  return prisma.judgeV2SyntheticProof.upsert({
    where: { caseId: proof.caseId },
    create: {
      protocolVersion: "V2",
      purpose: "JUDGEV2_SYNTHETIC_PROOF",
      caseId: proof.caseId,
      judgeAddress: proof.judgeAddress,
      canonicalPacket: proof.canonicalPacket,
      disputePacketHash: proof.disputePacketHash,
      packetByteLength: proof.metadata.packetByteLength,
      packetSha256: proof.metadata.packetSha256,
      sourcePolicyHash: proof.source.sourcePolicyHash,
      canonicalSourceUrl: proof.source.canonicalUrl,
      expectedContentHash: proof.source.expectedContentHash,
      expectedExtractHash: input.expectedExtractHash,
    },
    update: {},
  });
}

type ResolvedProofCase = {
  schemaVersion: "2";
  caseId: Hex;
  xLayerChainId: 1952;
  xLayerEscrow: Address;
  obligationId: number;
  agreementHash: Hex;
  policyHash: Hex;
  evidenceRoot: Hex;
  disputePacketHash: Hex;
  sourceVerificationHash: Hex;
  resolved: true;
  verdict: "RELEASE_FULL" | "REFUND_FULL" | "INSUFFICIENT_EVIDENCE";
};

function hash32(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function parseResolvedJudgeV2ProofCase(
  value: unknown,
): ResolvedProofCase {
  let raw = value;
  if (typeof raw === "string") raw = JSON.parse(raw) as unknown;
  if (!raw || typeof raw !== "object")
    throw new Error("MALFORMED_V2_JUDGE_STATE");
  const item = raw as Record<string, unknown>;
  if (
    item.schemaVersion !== "2" ||
    item.resolved !== true ||
    item.xLayerChainId !== 1952 ||
    typeof item.xLayerEscrow !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(item.xLayerEscrow) ||
    !Number.isSafeInteger(item.obligationId) ||
    !hash32(item.caseId) ||
    !hash32(item.agreementHash) ||
    !hash32(item.policyHash) ||
    !hash32(item.evidenceRoot) ||
    !hash32(item.disputePacketHash) ||
    !hash32(item.sourceVerificationHash) ||
    !["RELEASE_FULL", "REFUND_FULL", "INSUFFICIENT_EVIDENCE"].includes(
      String(item.verdict),
    )
  )
    throw new Error("MALFORMED_V2_JUDGE_STATE");
  return {
    schemaVersion: "2",
    caseId: item.caseId.toLowerCase() as Hex,
    xLayerChainId: 1952,
    xLayerEscrow: item.xLayerEscrow.toLowerCase() as Address,
    obligationId: Number(item.obligationId),
    agreementHash: item.agreementHash.toLowerCase() as Hex,
    policyHash: item.policyHash.toLowerCase() as Hex,
    evidenceRoot: item.evidenceRoot.toLowerCase() as Hex,
    disputePacketHash: item.disputePacketHash.toLowerCase() as Hex,
    sourceVerificationHash: item.sourceVerificationHash.toLowerCase() as Hex,
    resolved: true,
    verdict: item.verdict as ResolvedProofCase["verdict"],
  };
}

export function parseJudgeV2CaseCliOutput(output: string): unknown {
  const afterResult = output.split(/(?:^|\r?\n)Result:/)[1];
  const candidate = afterResult?.split(/\r?\n\[genlayer-js\]/)[0]?.trim();
  if (!candidate) return "";
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    // CLI renders a contract string directly when it already contains JSON.
    return candidate;
  }
}

/** Bounded view call only: a 32-byte case ID, never a receipt or debug API. */
export class CliJudgeV2FinalizedStateReader implements FinalizedJudgeStateReader {
  constructor(
    private readonly command = process.platform === "win32"
      ? "genlayer.cmd"
      : "genlayer",
  ) {}

  async readCase(input: { judge: Address; caseId: Hex }): Promise<unknown> {
    const result = await execFile(
      this.command,
      ["call", input.judge, "get_case", "--args", JSON.stringify(input.caseId)],
      { windowsHide: true, maxBuffer: 256 * 1024 },
    );
    return parseJudgeV2CaseCliOutput(result.stdout);
  }
}

/**
 * Read-only reconciliation through latest-final JudgeV2 state. A finalized
 * transaction without a matching stored case is REVIEW_REQUIRED, never resend.
 */
export async function reconcileSubmittedJudgeV2SyntheticProof(
  statusClient: GenLayerStatusClient = new JsonRpcGenLayerStatusClient(),
  reader: FinalizedJudgeStateReader = new CliJudgeV2FinalizedStateReader(),
) {
  const proof = await prisma.judgeV2SyntheticProof.findFirst({
    where: {
      status: "SUBMITTED",
      protocolVersion: "V2",
      submissionTxHash: { not: null },
    },
    orderBy: { submissionSubmittedAt: "asc" },
  });
  if (!proof?.submissionTxHash) return null;
  const status = await statusClient.getTransactionStatus(
    proof.submissionTxHash,
  );
  if (status.status === "UNDETERMINED") {
    await prisma.judgeV2SyntheticProof.update({
      where: { id: proof.id },
      data: { status: "UNKNOWN", failureCode: "GENLAYER_UNDETERMINED" },
    });
    return { proofId: proof.id, finalized: false, state: "UNKNOWN" as const };
  }
  if (status.status !== "FINALIZED")
    return { proofId: proof.id, finalized: false, state: status.status };
  try {
    const resolved = parseResolvedJudgeV2ProofCase(
      await reader.readCase({
        judge: proof.judgeAddress as Address,
        caseId: proof.caseId as Hex,
      }),
    );
    const packet = JSON.parse(proof.canonicalPacket) as Record<string, unknown>;
    if (
      resolved.caseId !== proof.caseId.toLowerCase() ||
      resolved.disputePacketHash !== proof.disputePacketHash.toLowerCase() ||
      resolved.xLayerEscrow !== SYNTHETIC_ESCROW ||
      resolved.obligationId !== Number(packet.obligationId)
    )
      throw new Error("V2_PROOF_RESOLVED_BINDING_MISMATCH");
    await prisma.judgeV2SyntheticProof.update({
      where: { id: proof.id },
      data: {
        status: "FINALIZED",
        finalizedAt: new Date(),
        sourceVerificationHash: resolved.sourceVerificationHash,
        verdict: resolved.verdict,
        resolvedCase: resolved,
      },
    });
    return { proofId: proof.id, finalized: true, resolved };
  } catch {
    await prisma.judgeV2SyntheticProof.update({
      where: { id: proof.id },
      data: {
        status: "REVIEW_REQUIRED",
        failureCode: "V2_PROOF_FINAL_STATE_UNVERIFIABLE",
      },
    });
    return {
      proofId: proof.id,
      finalized: false,
      state: "REVIEW_REQUIRED" as const,
    };
  }
}

/** One proof only per durable intent; UNKNOWN is deliberately never retried. */
export async function processNextPendingJudgeV2SyntheticProof(
  submitter: GenLayerCaseSubmitter,
) {
  if (process.env.GENLAYER_SUBMISSION_MODE !== "worker")
    throw new Error("GENLAYER_WORKER_MODE_REQUIRED");
  const candidate = await prisma.judgeV2SyntheticProof.findFirst({
    where: { status: "INTENT_CREATED", protocolVersion: "V2" },
    orderBy: { submissionRequestedAt: "asc" },
  });
  if (!candidate) return null;
  const claim = await prisma.judgeV2SyntheticProof.updateMany({
    where: { id: candidate.id, status: "INTENT_CREATED" },
    data: { status: "DISPATCHING", submissionDispatchAt: new Date() },
  });
  if (!claim.count) return null;

  const deployment = deploymentForProtocol("V2");
  const metadata = packetTransportMetadata(candidate.canonicalPacket);
  if (
    !deployment.genLayer.judge ||
    candidate.judgeAddress.toLowerCase() !==
      deployment.genLayer.judge.toLowerCase() ||
    metadata.packetByteLength !== candidate.packetByteLength ||
    metadata.packetSha256 !== candidate.packetSha256 ||
    metadata.disputePacketHash !== candidate.disputePacketHash.toLowerCase()
  ) {
    await prisma.judgeV2SyntheticProof.update({
      where: { id: candidate.id },
      data: {
        status: "FAILED_BEFORE_SEND",
        failureCode: "PROOF_LINEAGE_MISMATCH",
      },
    });
    return {
      proofId: candidate.id,
      dispatched: false,
      failureCode: "PROOF_LINEAGE_MISMATCH",
    };
  }

  try {
    const submitted = await submitter.submitCase({
      judge: candidate.judgeAddress,
      canonicalPacket: candidate.canonicalPacket,
      protocolVersion: "V2",
      purpose: "JUDGEV2_SYNTHETIC_PROOF",
    });
    await prisma.judgeV2SyntheticProof.update({
      where: { id: candidate.id },
      data: {
        status: "SUBMITTED",
        submissionTxHash: submitted.transactionHash,
        submissionSubmittedAt: new Date(),
      },
    });
    return {
      proofId: candidate.id,
      dispatched: true,
      transactionHash: submitted.transactionHash,
    };
  } catch (error) {
    const submissionError =
      error instanceof GenLayerSubmissionError ? error : undefined;
    await prisma.judgeV2SyntheticProof.update({
      where: { id: candidate.id },
      data: {
        status: submissionError?.mayHaveBeenSent
          ? "UNKNOWN"
          : "FAILED_BEFORE_SEND",
        failureCode: submissionError?.code ?? "SYNTHETIC_PROOF_DISPATCH_FAILED",
      },
    });
    return {
      proofId: candidate.id,
      dispatched: false,
      failureCode: submissionError?.code ?? "SYNTHETIC_PROOF_DISPATCH_FAILED",
    };
  }
}

export function sha256Utf8(value: string): Hex {
  return `0x${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
