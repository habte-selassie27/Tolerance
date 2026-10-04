import "server-only";

import { createHash } from "node:crypto";

import {
  canonicalDisputePacketJson,
  type CanonicalJson,
} from "../../genlayer/schemas/dispute-packet";

export const EXTRACTOR_VERSION = "pdfjs-native-text-v1";
export const EVIDENCE_BUNDLE_SCHEMA_VERSION = "1";
const EVIDENCE_BUNDLE_DOMAIN = "ToleranceEvidenceBundleV1\n";

export type SourceBlockReferenceV1 = {
  sourceBlockHash: string;
  documentContentHash: string;
  pageNumber: number;
  blockOrder: number;
  sourceLocator: string;
  extractorVersion: string;
  normalizedText: string;
};

export type EvidenceBundleV1 = {
  schemaVersion: typeof EVIDENCE_BUNDLE_SCHEMA_VERSION;
  obligation: {
    applicationObligationId: string;
    xLayerChainId: number;
    xLayerEscrow: string;
    xLayerObligationId: string;
    caseId: string;
  };
  agreement: { id: string; version: number; agreementHash: string };
  policyHash: string;
  requirements: Array<{
    id: string;
    key: string;
    title: string;
    description: string;
    acceptanceCriteria: string;
    evidenceExpectations: string;
    required: boolean;
    ordering: number;
    baseGoverningSources: SourceBlockReferenceV1[];
    approvedAmendmentSources: Array<{
      amendmentId: string;
      amendmentVersion: number;
      precedence: number;
      source: SourceBlockReferenceV1;
    }>;
    effectiveGoverningSources: SourceBlockReferenceV1[];
  }>;
  approvedAmendments: Array<{
    id: string;
    version: number;
    precedence: number;
    amendmentHash: string;
    documentContentHash: string;
  }>;
  evidence: Array<{
    id: string;
    contentHash: string;
    document: { contentHash: string; documentType: string };
    requirementIds: string[];
    requirementKeys: string[];
    sourceBlocks: SourceBlockReferenceV1[];
  }>;
};

export function normalizeSourceText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

export function hashSourceBlock(input: {
  documentContentHash: string;
  pageNumber: number;
  blockOrder: number;
  sourceLocator: string;
  normalizedText: string;
  extractorVersion: string;
}) {
  return `sha256:${createHash("sha256")
    .update(
      [
        "ToleranceSourceBlockV1",
        input.documentContentHash,
        String(input.pageNumber),
        String(input.blockOrder),
        input.sourceLocator,
        input.extractorVersion,
        input.normalizedText,
      ].join("\n"),
      "utf8",
    )
    .digest("hex")}`;
}

/** Serializes only the explicit EvidenceBundleV1 data shape with frozen packet-compatible JSON rules. */
export function canonicalEvidenceBundleJson(bundle: EvidenceBundleV1): string {
  return canonicalDisputePacketJson(bundle as unknown as CanonicalJson);
}

/** SHA-256 of UTF-8 `ToleranceEvidenceBundleV1\\n` followed by canonical EvidenceBundleV1 JSON. */
export function hashEvidenceBundleV1(canonicalJson: string): string {
  return `sha256:${createHash("sha256")
    .update(`${EVIDENCE_BUNDLE_DOMAIN}${canonicalJson}`, "utf8")
    .digest("hex")}`;
}

/** The Phase 3B1B-2 protocol mapping: evidenceRoot is the bundle SHA-256 rendered as bytes32 hex. */
export function deriveEvidenceRoot(evidenceBundleHash: string): string {
  const match = /^sha256:([0-9a-f]{64})$/.exec(evidenceBundleHash);
  if (!match) throw new Error("Invalid EvidenceBundleV1 hash");
  return `0x${match[1]}`;
}

export function finalizeEvidenceBundleV1(bundle: EvidenceBundleV1) {
  const canonicalJson = canonicalEvidenceBundleJson(bundle);
  const evidenceBundleHash = hashEvidenceBundleV1(canonicalJson);
  return {
    bundle,
    canonicalJson,
    evidenceBundleHash,
    evidenceRoot: deriveEvidenceRoot(evidenceBundleHash),
  };
}

/** Compatibility helper retained for pre-3B1B-2 deterministic provenance tests. */
export function buildEvidenceBundleV1(input: {
  obligationId: string;
  caseId: string;
  agreementHash: string;
  policyHash: string;
  requirements: unknown[];
  evidence: unknown[];
  amendments?: unknown[];
}) {
  const bundle = {
    schemaVersion: EVIDENCE_BUNDLE_SCHEMA_VERSION,
    obligation: {
      applicationObligationId: input.obligationId,
      xLayerChainId: 0,
      xLayerEscrow: "",
      xLayerObligationId: "",
      caseId: input.caseId,
    },
    agreement: { id: "", version: 0, agreementHash: input.agreementHash },
    policyHash: input.policyHash,
    requirements: input.requirements,
    evidence: input.evidence,
    approvedAmendments: input.amendments ?? [],
  } as unknown as EvidenceBundleV1;
  return finalizeEvidenceBundleV1(bundle);
}
