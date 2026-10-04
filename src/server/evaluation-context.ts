import "server-only";
import { createHash } from "node:crypto";
import {
  canonicalDisputePacketJson,
  type CanonicalJson,
} from "../../genlayer/schemas/dispute-packet";
import { prisma } from "../lib/prisma";
import { buildEvidenceBundleV1 } from "./evidence-bundle";
import type {
  EvidenceBundleV1,
  SourceBlockReferenceV1,
} from "./evidence-provenance";

export const EVALUATION_CONTEXT_SCHEMA_VERSION = "1";
export const EVALUATION_POLICY_V1 = {
  version: "deterministic-evaluation-policy-v1",
  supplierBurdenOfProof: true,
  citationsRequired: true,
  approvedAmendmentsSupersedeBase: true,
  requiredEvidenceMissing: "INSUFFICIENT_EVIDENCE",
  ambiguousEvidence: "INSUFFICIENT_EVIDENCE",
} as const;

export type RequirementLevelResult =
  "SATISFIED" | "NOT_SATISFIED" | "INSUFFICIENT_EVIDENCE" | "NOT_APPLICABLE";
export type CitationReferenceV1 = {
  sourceBlockHash: string;
  documentContentHash: string;
  pageNumber: number;
  blockOrder: number;
  documentType: string;
};
export type EvaluationClaimV1 = {
  claim: string;
  citations: CitationReferenceV1[];
};
export type AiRequirementEvaluationV1 = {
  requirementId: string;
  result: RequirementLevelResult;
  claims: EvaluationClaimV1[];
  explanation: string;
};
export type AiEvaluationV1 = {
  schemaVersion: "1";
  evaluationContextHash: string;
  requirements: AiRequirementEvaluationV1[];
};

export type DeterministicEvaluationContextV1 = {
  schemaVersion: "1";
  evidenceBundleHash: string;
  evidenceRoot: string;
  obligationId: string;
  caseId: string;
  agreementHash: string;
  policyHash: string;
  requirements: Array<
    EvidenceBundleV1["requirements"][number] & {
      evidence: EvidenceBundleV1["evidence"][number][];
    }
  >;
  approvedAmendments: EvidenceBundleV1["approvedAmendments"];
  allowedSourceBlocks: CitationReferenceV1[];
  deterministicChecks: Array<{
    checkType: "REQUIRED_EVIDENCE_PRESENT" | "REQUIRED_EVIDENCE_MISSING";
    requirementId: string;
    status: "PASS" | "FAIL";
    sourceBlockRefs: CitationReferenceV1[];
  }>;
  evaluationPolicy: typeof EVALUATION_POLICY_V1;
};

export class EvaluationValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function finalizeEvaluationContext(
  context: DeterministicEvaluationContextV1,
) {
  const canonicalJson = canonicalDisputePacketJson(
    context as unknown as CanonicalJson,
  );
  const evaluationContextHash = `sha256:${createHash("sha256").update(`ToleranceDeterministicEvaluationContextV1\n${canonicalJson}`, "utf8").digest("hex")}`;
  return { context, canonicalJson, evaluationContextHash };
}

export async function buildDeterministicEvaluationContext(
  actorId: string,
  obligationId: string,
) {
  const built = await buildEvidenceBundleV1(actorId, obligationId);
  const bundle = built.bundle;
  const evidenceByRequirement = new Map<string, EvidenceBundleV1["evidence"]>();
  for (const evidence of bundle.evidence)
    for (const id of evidence.requirementIds)
      evidenceByRequirement.set(id, [
        ...(evidenceByRequirement.get(id) ?? []),
        evidence,
      ]);
  const documentTypes = new Map(
    bundle.evidence.flatMap((e) =>
      e.sourceBlocks.map(
        (s) => [s.sourceBlockHash, e.document.documentType] as const,
      ),
    ),
  );
  const toCitation = (s: SourceBlockReferenceV1): CitationReferenceV1 => ({
    sourceBlockHash: s.sourceBlockHash,
    documentContentHash: s.documentContentHash,
    pageNumber: s.pageNumber,
    blockOrder: s.blockOrder,
    documentType: documentTypes.get(s.sourceBlockHash) ?? "GOVERNING_SOURCE",
  });
  const requirements = bundle.requirements.map((requirement) => ({
    ...requirement,
    evidence: evidenceByRequirement.get(requirement.id) ?? [],
  }));
  const allowedSourceBlocks = [
    ...new Map(
      requirements.flatMap((r) =>
        [
          ...r.baseGoverningSources,
          ...r.approvedAmendmentSources.map((a) => a.source),
          ...r.effectiveGoverningSources,
          ...r.evidence.flatMap((e) => e.sourceBlocks),
        ].map((s) => [s.sourceBlockHash, toCitation(s)]),
      ),
    ).values(),
  ].sort(
    (a, b) =>
      a.pageNumber - b.pageNumber ||
      a.blockOrder - b.blockOrder ||
      a.sourceBlockHash.localeCompare(b.sourceBlockHash),
  );
  const deterministicChecks = requirements.map((r) => ({
    checkType:
      r.required && r.evidenceExpectations.trim() && !r.evidence.length
        ? ("REQUIRED_EVIDENCE_MISSING" as const)
        : ("REQUIRED_EVIDENCE_PRESENT" as const),
    requirementId: r.id,
    status:
      r.required && r.evidenceExpectations.trim() && !r.evidence.length
        ? ("FAIL" as const)
        : ("PASS" as const),
    sourceBlockRefs: r.evidence.flatMap((e) => e.sourceBlocks).map(toCitation),
  }));
  const context: DeterministicEvaluationContextV1 = {
    schemaVersion: "1",
    evidenceBundleHash: built.evidenceBundleHash,
    evidenceRoot: built.evidenceRoot,
    obligationId: bundle.obligation.applicationObligationId,
    caseId: bundle.obligation.caseId,
    agreementHash: bundle.agreement.agreementHash,
    policyHash: bundle.policyHash,
    requirements,
    approvedAmendments: bundle.approvedAmendments,
    allowedSourceBlocks,
    deterministicChecks,
    evaluationPolicy: EVALUATION_POLICY_V1,
  };
  const finalized = finalizeEvaluationContext(context);
  const snapshot = await prisma.evaluationContextSnapshot.upsert({
    where: {
      evidenceBundleId_evaluationContextHash: {
        evidenceBundleId: built.snapshot.id,
        evaluationContextHash: finalized.evaluationContextHash,
      },
    },
    create: {
      obligationId,
      evidenceBundleId: built.snapshot.id,
      schemaVersion: "1",
      policyVersion: EVALUATION_POLICY_V1.version,
      evaluationContextHash: finalized.evaluationContextHash,
      canonicalJson: finalized.canonicalJson,
    },
    update: {},
  });
  return { ...finalized, snapshot };
}

export function validateEvaluationCitations(
  context: DeterministicEvaluationContextV1,
  citations: CitationReferenceV1[],
  required = true,
) {
  if (required && !citations.length)
    throw new EvaluationValidationError("CITATION_REQUIRED");
  const allowed = new Map(
    context.allowedSourceBlocks.map((citation) => [
      citation.sourceBlockHash,
      citation,
    ]),
  );
  const seen = new Set<string>();
  for (const citation of citations) {
    if (
      !citation ||
      typeof citation.sourceBlockHash !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(citation.sourceBlockHash)
    )
      throw new EvaluationValidationError("MALFORMED_CITATION");
    const expected = allowed.get(citation.sourceBlockHash);
    if (
      !expected ||
      expected.sourceBlockHash !== citation.sourceBlockHash ||
      expected.documentContentHash !== citation.documentContentHash ||
      expected.pageNumber !== citation.pageNumber ||
      expected.blockOrder !== citation.blockOrder ||
      expected.documentType !== citation.documentType
    )
      throw new EvaluationValidationError("CITATION_OUTSIDE_CONTEXT");
    if (seen.has(citation.sourceBlockHash))
      throw new EvaluationValidationError("DUPLICATE_CITATION");
    seen.add(citation.sourceBlockHash);
  }
}

export function validateAiEvaluation(
  context: DeterministicEvaluationContextV1,
  value: AiEvaluationV1,
) {
  if (
    !value ||
    value.schemaVersion !== "1" ||
    !value.evaluationContextHash ||
    !Array.isArray(value.requirements)
  )
    throw new EvaluationValidationError("INVALID_AI_SCHEMA");
  const expected = finalizeEvaluationContext(context).evaluationContextHash;
  if (value.evaluationContextHash !== expected)
    throw new EvaluationValidationError("CONTEXT_HASH_MISMATCH");
  const ids = new Set(context.requirements.map((r) => r.id));
  const seen = new Set<string>();
  if (value.requirements.length !== ids.size)
    throw new EvaluationValidationError("MISSING_REQUIREMENT");
  for (const result of value.requirements) {
    if (!ids.has(result.requirementId) || seen.has(result.requirementId))
      throw new EvaluationValidationError("UNKNOWN_OR_DUPLICATE_REQUIREMENT");
    if (
      !(
        [
          "SATISFIED",
          "NOT_SATISFIED",
          "INSUFFICIENT_EVIDENCE",
          "NOT_APPLICABLE",
        ] as string[]
      ).includes(result.result)
    )
      throw new EvaluationValidationError("UNSUPPORTED_REQUIREMENT_RESULT");
    if (
      !result ||
      typeof result.requirementId !== "string" ||
      typeof result.explanation !== "string" ||
      !result.explanation.trim() ||
      !Array.isArray(result.claims) ||
      !result.claims.length
    )
      throw new EvaluationValidationError("CLAIM_REQUIRED");
    for (const claim of result.claims) {
      if (!claim || typeof claim.claim !== "string" || !claim.claim.trim())
        throw new EvaluationValidationError("INVALID_CLAIM");
      validateEvaluationCitations(context, claim.citations);
    }
    seen.add(result.requirementId);
  }
}

export function validateAiAgainstDeterministicChecks(
  context: DeterministicEvaluationContextV1,
  value: AiEvaluationV1,
) {
  const byRequirement = new Map(
    value.requirements.map((requirement) => [
      requirement.requirementId,
      requirement,
    ]),
  );
  for (const check of context.deterministicChecks) {
    if (check.status !== "FAIL") continue;
    const result = byRequirement.get(check.requirementId);
    if (result?.result === "SATISFIED")
      throw new EvaluationValidationError("DETERMINISTIC_CONTRADICTION");
  }
}
