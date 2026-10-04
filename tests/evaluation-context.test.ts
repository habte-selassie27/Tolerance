import { describe, expect, it } from "vitest";
import {
  finalizeEvaluationContext,
  validateAiEvaluation,
  validateEvaluationCitations,
  type DeterministicEvaluationContextV1,
} from "../src/server/evaluation-context";

const citation = {
  sourceBlockHash: `sha256:${"a".repeat(64)}`,
  documentContentHash: "sha256:doc",
  pageNumber: 1,
  blockOrder: 1,
  documentType: "INSPECTION_REPORT",
};
const context: DeterministicEvaluationContextV1 = {
  schemaVersion: "1",
  evidenceBundleHash: "sha256:bundle",
  evidenceRoot: "0xbundle",
  obligationId: "o",
  caseId: "c",
  agreementHash: "a",
  policyHash: "p",
  requirements: [
    {
      id: "r",
      key: "R-001",
      title: "R",
      description: "",
      acceptanceCriteria: "",
      evidenceExpectations: "inspection",
      required: true,
      ordering: 1,
      baseGoverningSources: [],
      approvedAmendmentSources: [],
      effectiveGoverningSources: [],
      evidence: [],
    },
  ],
  approvedAmendments: [],
  allowedSourceBlocks: [citation],
  deterministicChecks: [
    {
      checkType: "REQUIRED_EVIDENCE_PRESENT",
      requirementId: "r",
      status: "PASS",
      sourceBlockRefs: [citation],
    },
  ],
  evaluationPolicy: {
    version: "deterministic-evaluation-policy-v1",
    supplierBurdenOfProof: true,
    citationsRequired: true,
    approvedAmendmentsSupersedeBase: true,
    requiredEvidenceMissing: "INSUFFICIENT_EVIDENCE",
    ambiguousEvidence: "INSUFFICIENT_EVIDENCE",
  },
};
describe("deterministic evaluation context", () => {
  it("hashes deterministically and fails closed on invalid citations", () => {
    expect(finalizeEvaluationContext(context)).toEqual(
      finalizeEvaluationContext(context),
    );
    expect(() =>
      validateEvaluationCitations(context, [
        { ...citation, sourceBlockHash: `sha256:${"b".repeat(64)}` },
      ]),
    ).toThrow("CITATION_OUTSIDE_CONTEXT");
    expect(() => validateEvaluationCitations(context, [])).toThrow(
      "CITATION_REQUIRED",
    );
  });
  it("rejects adversarial AI evaluation output", () => {
    const hash = finalizeEvaluationContext(context).evaluationContextHash;
    const valid = {
      schemaVersion: "1" as const,
      evaluationContextHash: hash,
      requirements: [
        {
          requirementId: "r",
          result: "SATISFIED" as const,
          explanation: "cited",
          claims: [{ claim: "x", citations: [citation] }],
        },
      ],
    };
    expect(() => validateAiEvaluation(context, valid)).not.toThrow();
    expect(() =>
      validateAiEvaluation(context, {
        ...valid,
        evaluationContextHash: "sha256:wrong",
      }),
    ).toThrow("CONTEXT_HASH_MISMATCH");
    expect(() =>
      validateAiEvaluation(context, { ...valid, requirements: [] }),
    ).toThrow("MISSING_REQUIREMENT");
  });
});
