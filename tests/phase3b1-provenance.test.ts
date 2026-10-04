import { describe, expect, it } from "vitest";

import {
  type EvidenceBundleV1,
  canonicalEvidenceBundleJson,
  deriveEvidenceRoot,
  finalizeEvidenceBundleV1,
  hashSourceBlock,
  normalizeSourceText,
} from "../src/server/evidence-provenance";

function fixtureBundle(): EvidenceBundleV1 {
  const base = {
    sourceBlockHash: "sha256:base",
    documentContentHash: "sha256:agreement",
    pageNumber: 2,
    blockOrder: 1,
    sourceLocator: "page:2:block:1",
    extractorVersion: "pdfjs-native-text-v1",
    normalizedText: "Diameter shall be 50.00 mm ±0.25 mm",
  };
  const amendment = {
    sourceBlockHash: "sha256:amendment",
    documentContentHash: "sha256:amendment-document",
    pageNumber: 1,
    blockOrder: 1,
    sourceLocator: "page:1:block:1",
    extractorVersion: "pdfjs-native-text-v1",
    normalizedText: "Diameter shall be 50.00 mm ±0.15 mm",
  };
  return {
    schemaVersion: "1",
    obligation: {
      applicationObligationId: "obligation-1",
      xLayerChainId: 1952,
      xLayerEscrow: "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
      xLayerObligationId: "1001",
      caseId:
        "0x05e170b42e53ced76fb6fc7fdb07f31944a6d5df635a26249659b757a77374fa",
    },
    agreement: { id: "agreement-1", version: 1, agreementHash: "0xagreement" },
    policyHash: "0xpolicy",
    requirements: [
      {
        id: "requirement-1",
        key: "R-001",
        title: "Material",
        description: "Stainless steel grade",
        acceptanceCriteria: "Material shall be 316L",
        evidenceExpectations: "Inspection certificate",
        required: true,
        ordering: 1,
        baseGoverningSources: [base],
        approvedAmendmentSources: [],
        effectiveGoverningSources: [base],
      },
      {
        id: "requirement-2",
        key: "R-002",
        title: "Diameter",
        description: "Nominal diameter",
        acceptanceCriteria: "50.00 mm ±0.15 mm",
        evidenceExpectations: "Inspection certificate",
        required: true,
        ordering: 2,
        baseGoverningSources: [base],
        approvedAmendmentSources: [
          {
            amendmentId: "amendment-1",
            amendmentVersion: 1,
            precedence: 10,
            source: amendment,
          },
        ],
        effectiveGoverningSources: [amendment],
      },
    ],
    approvedAmendments: [
      {
        id: "amendment-1",
        version: 1,
        precedence: 10,
        amendmentHash: "0xamendment",
        documentContentHash: "sha256:amendment-document",
      },
    ],
    evidence: [
      {
        id: "evidence-1",
        contentHash: "sha256:inspection",
        document: {
          contentHash: "sha256:inspection-document",
          documentType: "INSPECTION_REPORT",
        },
        requirementIds: ["requirement-1", "requirement-2"],
        requirementKeys: ["R-001", "R-002"],
        sourceBlocks: [
          {
            sourceBlockHash: "sha256:inspection-block",
            documentContentHash: "sha256:inspection-document",
            pageNumber: 1,
            blockOrder: 2,
            sourceLocator: "page:1:block:2",
            extractorVersion: "pdfjs-native-text-v1",
            normalizedText: "Measured diameter: 50.10 mm",
          },
        ],
      },
    ],
  };
}

describe("EvidenceBundleV1", () => {
  it("normalizes and hashes source blocks deterministically", () => {
    const text = normalizeSourceText("R-001  95%\r\nTolerance");
    const hash = hashSourceBlock({
      documentContentHash: "sha256:doc",
      pageNumber: 2,
      blockOrder: 1,
      sourceLocator: "page:2:block:1",
      normalizedText: text,
      extractorVersion: "pdfjs-native-text-v1",
    });
    expect(text).toBe("R-001 95%\nTolerance");
    expect(hash).toMatch(/^sha256:/);
  });

  it("freezes canonical bytes, EvidenceBundleHashV1, and evidenceRoot", () => {
    const first = finalizeEvidenceBundleV1(fixtureBundle());
    const second = finalizeEvidenceBundleV1(fixtureBundle());
    expect(first.canonicalJson).toBe(
      canonicalEvidenceBundleJson(fixtureBundle()),
    );
    expect(first.canonicalJson).toMatch(/^\{"agreement":/);
    expect(first).toEqual(second);
    expect(first.evidenceBundleHash).toBe(
      "sha256:ee7c4bee5b5e306df42f7e8e064cd5fbe06b46e8832aea086faa07cff3beb665",
    );
    expect(first.evidenceRoot).toBe(
      "0xee7c4bee5b5e306df42f7e8e064cd5fbe06b46e8832aea086faa07cff3beb665",
    );
    expect(first.evidenceRoot).toBe(
      deriveEvidenceRoot(first.evidenceBundleHash),
    );
  });

  it("is independent of object insertion order but changes for material provenance", () => {
    const canonical = finalizeEvidenceBundleV1(fixtureBundle());
    const reordered = JSON.parse(
      JSON.stringify(fixtureBundle()),
    ) as EvidenceBundleV1;
    reordered.requirements = [...reordered.requirements]
      .reverse()
      .sort((a, b) => a.ordering - b.ordering);
    expect(finalizeEvidenceBundleV1(reordered).canonicalJson).toBe(
      canonical.canonicalJson,
    );

    const changed = fixtureBundle();
    changed.requirements[1]!.effectiveGoverningSources[0] = {
      ...changed.requirements[1]!.effectiveGoverningSources[0]!,
      normalizedText: "Diameter shall be 50.00 mm ±0.10 mm",
    };
    expect(finalizeEvidenceBundleV1(changed).evidenceRoot).not.toBe(
      canonical.evidenceRoot,
    );
  });
});
