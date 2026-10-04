import "server-only";

import { prisma } from "../lib/prisma";
import { protocolConfig } from "../config/protocol";
import {
  canonicalDisputePacketJson,
  hashDisputePacketV1,
  type CanonicalJson,
} from "../../genlayer/schemas/dispute-packet";
import { computeToleranceCaseId } from "../../genlayer/schemas/resolved-case";
import { guards } from "./auth";
import type {
  EvidenceBundleV1,
  SourceBlockReferenceV1,
} from "./evidence-provenance";
import {
  validateAiAgainstDeterministicChecks,
  validateAiEvaluation,
  type AiEvaluationV1,
  type DeterministicEvaluationContextV1,
} from "./evaluation-context";

export const DISPUTE_PACKET_SCHEMA_VERSION = "1";
export const DEFAULT_DISPUTE_PACKET_MAX_BYTES = 120_000;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const FORBIDDEN_KEYS =
  /(?:storageObjectKey|signedUrl|apiKey|authToken|privateKey|serviceRole|rawPdf|providerResponse|chainOfThought)/i;

export class DisputePacketError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function configuredDisputePacketMaxBytes(
  value = process.env.TOLERANCE_DISPUTE_PACKET_MAX_BYTES,
) {
  if (value === undefined || value === "")
    return DEFAULT_DISPUTE_PACKET_MAX_BYTES;
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0 ||
    parsed > DEFAULT_DISPUTE_PACKET_MAX_BYTES
  )
    throw new DisputePacketError("INVALID_PACKET_SIZE_CONFIGURATION");
  return parsed;
}

export type DisputePacketV1 = {
  schemaVersion: "1";
  caseId: `0x${string}`;
  xLayerChainId: number;
  xLayerEscrow: string;
  obligationId: number;
  agreementHash: `0x${string}`;
  policyHash: `0x${string}`;
  evidenceRoot: `0x${string}`;
  disputePacketHash: `0x${string}`;
  decisionRubric: string;
  burdenOfProof: string;
  disputedRequirements: Array<Record<string, CanonicalJson>>;
  governingTerms: Array<Record<string, CanonicalJson>>;
  approvedAmendments: Array<Record<string, CanonicalJson>>;
  sourceBlocks: Array<Record<string, CanonicalJson>>;
  deterministicCheckResults: Array<Record<string, CanonicalJson>>;
  buyerChallengeStatement: string;
  supplierResponse: string;
};

export type TrustedDisputePacketInputs = {
  obligation: {
    applicationId: string;
    xLayerChainId: number;
    xLayerEscrow: string;
    xLayerObligationId: string;
    toleranceCaseId: string;
    agreementHash: string;
    policyHash: string;
    evidenceRoot: string | null;
  };
  bundle: EvidenceBundleV1;
  evidenceBundleHash: string;
  evidenceRoot: string;
  context: DeterministicEvaluationContextV1;
  evaluationContextHash: string;
  evaluation: AiEvaluationV1;
  buyerChallengeStatement?: string;
  supplierResponse?: string;
  maxPacketBytes?: number;
};

function bytes32(value: string, code: string): `0x${string}` {
  const normalized = value.startsWith("sha256:")
    ? `0x${value.slice("sha256:".length)}`
    : value;
  if (!BYTES32.test(normalized)) throw new DisputePacketError(code);
  return normalized.toLowerCase() as `0x${string}`;
}

function sourceSort(
  left: SourceBlockReferenceV1,
  right: SourceBlockReferenceV1,
) {
  return (
    left.documentContentHash.localeCompare(right.documentContentHash) ||
    left.pageNumber - right.pageNumber ||
    left.blockOrder - right.blockOrder ||
    left.sourceBlockHash.localeCompare(right.sourceBlockHash)
  );
}

function allRelevantSources(bundle: EvidenceBundleV1) {
  const sources = bundle.requirements.flatMap((requirement) => [
    ...requirement.baseGoverningSources,
    ...requirement.approvedAmendmentSources.map((entry) => entry.source),
    ...requirement.effectiveGoverningSources,
  ]);
  sources.push(...bundle.evidence.flatMap((evidence) => evidence.sourceBlocks));
  return [
    ...new Map(
      sources.map((source) => [source.sourceBlockHash, source]),
    ).values(),
  ].sort(sourceSort);
}

export function createDisputePacketV1(inputs: TrustedDisputePacketInputs) {
  const { obligation, bundle, context, evaluation } = inputs;
  if (
    obligation.xLayerChainId !== protocolConfig.xLayer.chainId ||
    obligation.xLayerEscrow.toLowerCase() !==
      protocolConfig.xLayer.escrow.toLowerCase()
  )
    throw new DisputePacketError("PROTOCOL_BINDING_MISMATCH");
  const numericObligationId = Number(obligation.xLayerObligationId);
  if (!Number.isSafeInteger(numericObligationId) || numericObligationId < 0)
    throw new DisputePacketError("INVALID_XLAYER_OBLIGATION_ID");
  const caseId = computeToleranceCaseId(
    BigInt(obligation.xLayerChainId),
    obligation.xLayerEscrow as `0x${string}`,
    BigInt(numericObligationId),
  );
  if (
    obligation.toleranceCaseId.toLowerCase() !== caseId.toLowerCase() ||
    bundle.obligation.caseId.toLowerCase() !== caseId.toLowerCase() ||
    context.caseId.toLowerCase() !== caseId.toLowerCase()
  )
    throw new DisputePacketError("CASE_ID_MISMATCH");
  if (
    bundle.obligation.applicationObligationId !== obligation.applicationId ||
    context.obligationId !== obligation.applicationId ||
    bundle.obligation.xLayerChainId !== obligation.xLayerChainId ||
    bundle.obligation.xLayerEscrow.toLowerCase() !==
      obligation.xLayerEscrow.toLowerCase() ||
    bundle.obligation.xLayerObligationId !== obligation.xLayerObligationId
  )
    throw new DisputePacketError("OBLIGATION_LINEAGE_MISMATCH");
  if (
    bundle.agreement.agreementHash !== obligation.agreementHash ||
    context.agreementHash !== obligation.agreementHash
  )
    throw new DisputePacketError("AGREEMENT_HASH_MISMATCH");
  if (
    bundle.policyHash !== obligation.policyHash ||
    context.policyHash !== obligation.policyHash
  )
    throw new DisputePacketError("POLICY_HASH_MISMATCH");
  if (
    !obligation.evidenceRoot ||
    inputs.evidenceRoot !== obligation.evidenceRoot ||
    context.evidenceRoot !== obligation.evidenceRoot ||
    context.evidenceBundleHash !== inputs.evidenceBundleHash
  )
    throw new DisputePacketError("EVIDENCE_LINEAGE_MISMATCH");

  validateAiEvaluation(context, evaluation);
  validateAiAgainstDeterministicChecks(context, evaluation);
  if (evaluation.evaluationContextHash !== inputs.evaluationContextHash)
    throw new DisputePacketError("EVALUATION_CONTEXT_MISMATCH");

  const relevantSources = allRelevantSources(bundle);
  const allowedHashes = new Set(
    context.allowedSourceBlocks.map((source) => source.sourceBlockHash),
  );
  if (
    relevantSources.some((source) => !allowedHashes.has(source.sourceBlockHash))
  )
    throw new DisputePacketError("SOURCE_OUTSIDE_CONTEXT");
  const sourceBlocks = relevantSources.map((source) => ({
    sourceId: source.sourceBlockHash,
    sourceBlockHash: source.sourceBlockHash,
    documentId: source.documentContentHash,
    page: source.pageNumber,
    blockOrder: source.blockOrder,
    content: source.normalizedText,
  }));
  const sourceIds = new Set(sourceBlocks.map((source) => source.sourceId));

  const disputedRequirements = bundle.requirements.map((requirement) => {
    const evaluated = evaluation.requirements.find(
      (entry) => entry.requirementId === requirement.id,
    );
    if (!evaluated) throw new DisputePacketError("MISSING_REQUIREMENT");
    const citationIds = [
      ...new Set(
        evaluated.claims.flatMap((claim) =>
          claim.citations.map((citation) => citation.sourceBlockHash),
        ),
      ),
    ];
    if (citationIds.some((sourceId) => !sourceIds.has(sourceId)))
      throw new DisputePacketError("CITATION_OUTSIDE_BUNDLE");
    return {
      requirementId: requirement.key,
      mandatory: requirement.required,
      text: requirement.acceptanceCriteria,
      sourceIds: citationIds.sort(),
    };
  });
  if (!disputedRequirements.some((requirement) => requirement.mandatory))
    throw new DisputePacketError("MANDATORY_REQUIREMENT_REQUIRED");

  const governingTerms = bundle.requirements.flatMap((requirement) => [
    ...requirement.baseGoverningSources.map((source) => ({
      requirementId: requirement.key,
      termId: source.sourceBlockHash,
      text: source.normalizedText,
      effective: requirement.effectiveGoverningSources.some(
        (entry) => entry.sourceBlockHash === source.sourceBlockHash,
      ),
    })),
    ...requirement.approvedAmendmentSources.map((entry) => ({
      requirementId: requirement.key,
      termId: entry.source.sourceBlockHash,
      text: entry.source.normalizedText,
      effective: requirement.effectiveGoverningSources.some(
        (source) => source.sourceBlockHash === entry.source.sourceBlockHash,
      ),
    })),
  ]);
  for (const requirement of bundle.requirements) {
    if (requirement.approvedAmendmentSources.length) {
      const highest = [...requirement.approvedAmendmentSources].sort(
        (left, right) =>
          right.precedence - left.precedence ||
          right.amendmentVersion - left.amendmentVersion,
      )[0]!;
      if (
        !requirement.effectiveGoverningSources.some(
          (source) => source.sourceBlockHash === highest.source.sourceBlockHash,
        )
      )
        throw new DisputePacketError("AMENDMENT_PRECEDENCE_MISMATCH");
    }
  }

  const packetWithoutHash = {
    schemaVersion: DISPUTE_PACKET_SCHEMA_VERSION,
    caseId,
    xLayerChainId: obligation.xLayerChainId,
    xLayerEscrow: obligation.xLayerEscrow,
    obligationId: numericObligationId,
    agreementHash: bytes32(obligation.agreementHash, "INVALID_AGREEMENT_HASH"),
    policyHash: bytes32(obligation.policyHash, "INVALID_POLICY_HASH"),
    evidenceRoot: bytes32(obligation.evidenceRoot, "INVALID_EVIDENCE_ROOT"),
    decisionRubric:
      "Release only when every mandatory accepted requirement is established.",
    burdenOfProof:
      "Supplier bears the burden of establishing release conditions.",
    disputedRequirements,
    governingTerms,
    approvedAmendments: bundle.approvedAmendments.map((amendment) => ({
      amendmentId: amendment.id,
      version: amendment.version,
      precedence: amendment.precedence,
      amendmentHash: amendment.amendmentHash,
      approved: true,
    })),
    sourceBlocks,
    deterministicCheckResults: context.deterministicChecks.map(
      (check, index) => ({
        checkId: `D-${index + 1}`,
        requirementId:
          bundle.requirements.find(
            (requirement) => requirement.id === check.requirementId,
          )?.key ?? check.requirementId,
        checkType: check.checkType,
        status: check.status,
        sourceIds: check.sourceBlockRefs
          .map((source) => source.sourceBlockHash)
          .sort(),
      }),
    ),
    buyerChallengeStatement: inputs.buyerChallengeStatement ?? "",
    supplierResponse: inputs.supplierResponse ?? "",
  } satisfies Omit<DisputePacketV1, "disputePacketHash">;
  const disputePacketHash = hashDisputePacketV1(
    packetWithoutHash as unknown as {
      readonly disputePacketHash?: never;
    } & Record<string, CanonicalJson>,
  );
  const packet = {
    ...packetWithoutHash,
    disputePacketHash,
  } satisfies DisputePacketV1;
  const canonicalJson = canonicalDisputePacketJson(
    packet as unknown as CanonicalJson,
  );
  validateDisputePacketV1(packet, inputs, canonicalJson);
  return { packet, canonicalJson, disputePacketHash };
}

export function validateDisputePacketV1(
  packet: DisputePacketV1,
  inputs: TrustedDisputePacketInputs,
  canonicalJson = canonicalDisputePacketJson(
    packet as unknown as CanonicalJson,
  ),
) {
  const expectedKeys = [
    "agreementHash",
    "approvedAmendments",
    "burdenOfProof",
    "buyerChallengeStatement",
    "caseId",
    "decisionRubric",
    "deterministicCheckResults",
    "disputePacketHash",
    "disputedRequirements",
    "evidenceRoot",
    "governingTerms",
    "obligationId",
    "policyHash",
    "schemaVersion",
    "sourceBlocks",
    "supplierResponse",
    "xLayerChainId",
    "xLayerEscrow",
  ];
  if (Object.keys(packet).sort().join("|") !== expectedKeys.sort().join("|"))
    throw new DisputePacketError("PACKET_SCHEMA_MISMATCH");
  if (packet.schemaVersion !== "1")
    throw new DisputePacketError("INVALID_SCHEMA_VERSION");
  if (!BYTES32.test(packet.caseId) || !BYTES32.test(packet.disputePacketHash))
    throw new DisputePacketError("MALFORMED_BYTES32");
  if (!ADDRESS.test(packet.xLayerEscrow))
    throw new DisputePacketError("MALFORMED_ESCROW");
  if (
    typeof packet.buyerChallengeStatement !== "string" ||
    typeof packet.supplierResponse !== "string"
  )
    throw new DisputePacketError("INVALID_PARTY_STATEMENT");
  const expectedObligationId = Number(inputs.obligation.xLayerObligationId);
  const expectedCaseId = computeToleranceCaseId(
    BigInt(inputs.obligation.xLayerChainId),
    inputs.obligation.xLayerEscrow as `0x${string}`,
    BigInt(expectedObligationId),
  );
  if (packet.caseId.toLowerCase() !== expectedCaseId.toLowerCase())
    throw new DisputePacketError("CASE_ID_MISMATCH");
  if (
    packet.xLayerChainId !== inputs.obligation.xLayerChainId ||
    packet.xLayerEscrow.toLowerCase() !==
      inputs.obligation.xLayerEscrow.toLowerCase() ||
    packet.obligationId !== expectedObligationId
  )
    throw new DisputePacketError("PROTOCOL_BINDING_MISMATCH");
  if (
    packet.agreementHash.toLowerCase() !==
      bytes32(inputs.obligation.agreementHash, "INVALID_AGREEMENT_HASH") ||
    packet.policyHash.toLowerCase() !==
      bytes32(inputs.obligation.policyHash, "INVALID_POLICY_HASH") ||
    packet.evidenceRoot.toLowerCase() !==
      bytes32(inputs.evidenceRoot, "INVALID_EVIDENCE_ROOT")
  )
    throw new DisputePacketError("PACKET_HASH_BINDING_MISMATCH");
  const expectedRequirementKeys = inputs.bundle.requirements.map(
    (requirement) => requirement.key,
  );
  const packetRequirementKeys = packet.disputedRequirements.map((entry) =>
    String(entry.requirementId),
  );
  if (
    new Set(packetRequirementKeys).size !== packetRequirementKeys.length ||
    packetRequirementKeys.length !== expectedRequirementKeys.length ||
    packetRequirementKeys.some((key) => !expectedRequirementKeys.includes(key))
  )
    throw new DisputePacketError("REQUIREMENT_SET_MISMATCH");
  const allowedSourceIds = new Set(
    allRelevantSources(inputs.bundle).map((source) => source.sourceBlockHash),
  );
  const expectedSources = new Map(
    allRelevantSources(inputs.bundle).map((source) => [
      source.sourceBlockHash,
      source,
    ]),
  );
  for (const source of packet.sourceBlocks) {
    const expected =
      typeof source.sourceId === "string"
        ? expectedSources.get(source.sourceId)
        : undefined;
    if (
      typeof source.sourceId !== "string" ||
      !expected ||
      source.sourceBlockHash !== expected.sourceBlockHash ||
      source.documentId !== expected.documentContentHash ||
      source.page !== expected.pageNumber ||
      source.blockOrder !== expected.blockOrder ||
      source.content !== expected.normalizedText
    )
      throw new DisputePacketError("SOURCE_OUTSIDE_BUNDLE");
  }
  for (const requirement of packet.disputedRequirements) {
    if (
      !Array.isArray(requirement.sourceIds) ||
      requirement.sourceIds.some(
        (sourceId) =>
          typeof sourceId !== "string" || !allowedSourceIds.has(sourceId),
      )
    )
      throw new DisputePacketError("CITATION_OUTSIDE_BUNDLE");
  }
  const { disputePacketHash, ...withoutHash } = packet;
  const expectedHash = hashDisputePacketV1(
    withoutHash as unknown as { readonly disputePacketHash?: never } & Record<
      string,
      CanonicalJson
    >,
  );
  if (disputePacketHash.toLowerCase() !== expectedHash.toLowerCase())
    throw new DisputePacketError("DISPUTE_PACKET_HASH_MISMATCH");
  if (
    new TextEncoder().encode(canonicalJson).byteLength >
    (inputs.maxPacketBytes ?? DEFAULT_DISPUTE_PACKET_MAX_BYTES)
  )
    throw new DisputePacketError("DISPUTE_PACKET_TOO_LARGE");
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return void value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.test(key))
        throw new DisputePacketError("FORBIDDEN_PACKET_FIELD");
      visit(child);
    }
  };
  visit(packet);
  return true;
}

export async function buildDisputePacketV1(
  actorId: string,
  obligationId: string,
) {
  const obligation = await prisma.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    include: { deal: true },
  });
  await guards.requireDealAccess(actorId, obligation.dealId);
  const contextSnapshot =
    await prisma.evaluationContextSnapshot.findFirstOrThrow({
      where: { obligationId },
      orderBy: { createdAt: "desc" },
      include: {
        evidenceBundle: true,
        aiEvaluationSnapshots: {
          include: { evaluationRun: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  const aiSnapshot = contextSnapshot.aiEvaluationSnapshots.find(
    (snapshot) => snapshot.evaluationRun.status === "VALIDATED",
  );
  if (!aiSnapshot) throw new DisputePacketError("VALIDATED_AI_REQUIRED");
  if (
    aiSnapshot.obligationId !== obligationId ||
    aiSnapshot.evaluationContextId !== contextSnapshot.id
  )
    throw new DisputePacketError("AI_LINEAGE_MISMATCH");
  const inputs: TrustedDisputePacketInputs = {
    obligation: {
      applicationId: obligation.id,
      xLayerChainId: obligation.xLayerChainId,
      xLayerEscrow: obligation.xLayerEscrow,
      xLayerObligationId: obligation.xLayerObligationId,
      toleranceCaseId: obligation.toleranceCaseId,
      agreementHash: obligation.agreementHash,
      policyHash: obligation.policyHash,
      evidenceRoot: obligation.evidenceRoot,
    },
    bundle: JSON.parse(
      contextSnapshot.evidenceBundle.canonicalJson,
    ) as EvidenceBundleV1,
    evidenceBundleHash: contextSnapshot.evidenceBundle.evidenceBundleHash,
    evidenceRoot: contextSnapshot.evidenceBundle.evidenceRoot,
    context: JSON.parse(
      contextSnapshot.canonicalJson,
    ) as DeterministicEvaluationContextV1,
    evaluationContextHash: contextSnapshot.evaluationContextHash,
    evaluation: aiSnapshot.evaluation as unknown as AiEvaluationV1,
    maxPacketBytes: configuredDisputePacketMaxBytes(),
  };
  const built = createDisputePacketV1(inputs);
  const snapshot = await prisma.disputePacketSnapshot.upsert({
    where: {
      aiEvaluationId_disputePacketHash: {
        aiEvaluationId: aiSnapshot.id,
        disputePacketHash: built.disputePacketHash,
      },
    },
    create: {
      obligationId,
      evidenceBundleId: contextSnapshot.evidenceBundleId,
      evaluationContextId: contextSnapshot.id,
      aiEvaluationId: aiSnapshot.id,
      schemaVersion: "1",
      caseId: built.packet.caseId,
      disputePacketHash: built.disputePacketHash,
      canonicalJson: built.canonicalJson,
    },
    update: {},
  });
  // This server-only return value permits downstream application authority
  // checks; it is not persisted into or added to DisputePacketV1.
  return { ...built, snapshot, evaluation: inputs.evaluation };
}
