import "server-only";

import { prisma } from "../lib/prisma";
import { guards } from "./auth";
import {
  type EvidenceBundleV1,
  type SourceBlockReferenceV1,
  EVIDENCE_BUNDLE_SCHEMA_VERSION,
  finalizeEvidenceBundleV1,
} from "./evidence-provenance";
import { resolveEffectiveGoverningSources } from "./provenance-services";

export class EvidenceBundleError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function buildEvidenceBundleV1(
  actorId: string,
  obligationId: string,
) {
  const obligation = await prisma.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    include: {
      deal: true,
      agreement: {
        include: {
          amendments: {
            where: { status: "APPROVED" },
            include: { document: true },
            orderBy: [{ precedence: "desc" }, { version: "desc" }],
          },
        },
      },
      requirements: {
        include: {
          evidenceLinks: { include: { evidence: true } },
        },
        orderBy: [
          { ordering: "asc" },
          { requirementKey: "asc" },
          { id: "asc" },
        ],
      },
      evidence: {
        include: {
          document: true,
          requirementLinks: { include: { requirement: true } },
          sourceLinks: {
            include: { sourceBlock: { include: { document: true } } },
          },
        },
        orderBy: [{ id: "asc" }],
      },
    },
  });
  await guards.requireDealAccess(actorId, obligation.dealId);
  assertBinding(obligation);

  const amendments = obligation.agreement.amendments.map((amendment) => {
    if (!amendment.document)
      throw new EvidenceBundleError("INVALID_SOURCEBLOCK_PROVENANCE");
    return {
      id: amendment.id,
      version: amendment.version,
      precedence: amendment.precedence,
      amendmentHash: amendment.amendmentHash,
      documentContentHash: amendment.document.contentHash,
    };
  });
  const approvedAmendmentByDocument = new Map(
    obligation.agreement.amendments
      .filter((amendment) => amendment.document)
      .map((amendment) => [amendment.documentId!, amendment]),
  );

  const requirements = [] as EvidenceBundleV1["requirements"];
  for (const requirement of obligation.requirements) {
    const resolved = await resolveEffectiveGoverningSources(requirement.id);
    if (!resolved.base.length && !resolved.amendments.length) {
      throw new EvidenceBundleError("REQUIREMENT_WITHOUT_GOVERNING_SOURCE");
    }
    const baseGoverningSources = resolved.base.map((link) =>
      sourceReference(link.sourceBlock, obligation.dealId),
    );
    const approvedAmendmentSources = resolved.amendments.map((link) => {
      const amendment = approvedAmendmentByDocument.get(
        link.sourceBlock.documentId,
      );
      if (!amendment)
        throw new EvidenceBundleError("INVALID_SOURCEBLOCK_PROVENANCE");
      return {
        amendmentId: amendment.id,
        amendmentVersion: amendment.version,
        precedence: amendment.precedence,
        source: sourceReference(link.sourceBlock, obligation.dealId),
      };
    });
    const effectiveGoverningSources = resolved.effective
      ? [sourceReference(resolved.effective.sourceBlock, obligation.dealId)]
      : [];
    if (!effectiveGoverningSources.length) {
      throw new EvidenceBundleError("REQUIREMENT_WITHOUT_GOVERNING_SOURCE");
    }
    if (
      requirement.required &&
      requirement.evidenceExpectations.trim() &&
      !requirement.evidenceLinks.length
    ) {
      throw new EvidenceBundleError("REQUIRED_EVIDENCE_MISSING");
    }
    requirements.push({
      id: requirement.id,
      key: requirement.requirementKey,
      title: requirement.title,
      description: requirement.description,
      acceptanceCriteria: requirement.acceptanceCriteria,
      evidenceExpectations: requirement.evidenceExpectations,
      required: requirement.required,
      ordering: requirement.ordering,
      baseGoverningSources: sortSourceReferences(baseGoverningSources),
      approvedAmendmentSources: approvedAmendmentSources.sort(
        (a, b) =>
          b.precedence - a.precedence ||
          b.amendmentVersion - a.amendmentVersion ||
          a.source.sourceBlockHash.localeCompare(b.source.sourceBlockHash),
      ),
      effectiveGoverningSources: sortSourceReferences(
        effectiveGoverningSources,
      ),
    });
  }

  const evidence = obligation.evidence.map((item) => {
    if (!item.document)
      throw new EvidenceBundleError("INVALID_SOURCEBLOCK_PROVENANCE");
    if (!item.sourceLinks.length)
      throw new EvidenceBundleError("INVALID_SOURCEBLOCK_PROVENANCE");
    const references = item.sourceLinks.map((link) =>
      sourceReference(link.sourceBlock, obligation.dealId),
    );
    const linkedRequirements = item.requirementLinks
      .map((link) => link.requirement)
      .sort(
        (a, b) =>
          a.ordering - b.ordering ||
          a.requirementKey.localeCompare(b.requirementKey) ||
          a.id.localeCompare(b.id),
      );
    return {
      id: item.id,
      contentHash: item.contentHash,
      document: {
        contentHash: item.document.contentHash,
        documentType: item.document.documentType,
      },
      requirementIds: linkedRequirements.map((requirement) => requirement.id),
      requirementKeys: linkedRequirements.map(
        (requirement) => requirement.requirementKey,
      ),
      sourceBlocks: sortSourceReferences(references),
    };
  });

  const bundle: EvidenceBundleV1 = {
    schemaVersion: EVIDENCE_BUNDLE_SCHEMA_VERSION,
    obligation: {
      applicationObligationId: obligation.id,
      xLayerChainId: obligation.xLayerChainId,
      xLayerEscrow: obligation.xLayerEscrow,
      xLayerObligationId: obligation.xLayerObligationId,
      caseId: obligation.toleranceCaseId,
    },
    agreement: {
      id: obligation.agreement.id,
      version: obligation.agreement.version,
      agreementHash: obligation.agreementHash,
    },
    policyHash: obligation.policyHash,
    requirements,
    approvedAmendments: amendments,
    evidence,
  };
  const finalized = finalizeEvidenceBundleV1(bundle);
  const snapshot = await prisma.evidenceBundleSnapshot.upsert({
    where: {
      obligationId_evidenceBundleHash: {
        obligationId,
        evidenceBundleHash: finalized.evidenceBundleHash,
      },
    },
    create: {
      obligationId,
      schemaVersion: EVIDENCE_BUNDLE_SCHEMA_VERSION,
      evidenceBundleHash: finalized.evidenceBundleHash,
      evidenceRoot: finalized.evidenceRoot,
      canonicalJson: finalized.canonicalJson,
    },
    update: {},
  });
  return { ...finalized, snapshot };
}

function assertBinding(obligation: {
  agreementHash: string;
  policyHash: string;
  xLayerEscrow: string;
  xLayerObligationId: string;
  toleranceCaseId: string;
}) {
  if (
    !obligation.agreementHash ||
    !obligation.policyHash ||
    !obligation.xLayerEscrow ||
    !obligation.xLayerObligationId ||
    !obligation.toleranceCaseId
  ) {
    throw new EvidenceBundleError("OBLIGATION_BINDING_MISSING");
  }
}

function sourceReference(
  block: {
    pageNumber: number | null;
    blockOrder: number;
    normalizedText: string;
    sourceLocator: string;
    contentHash: string;
    extractionVersion: string;
    document: { dealId: string; contentHash: string; status: string };
  },
  dealId: string,
): SourceBlockReferenceV1 {
  if (
    block.document.dealId !== dealId ||
    block.document.status !== "EXTRACTED" ||
    block.pageNumber === null ||
    !block.contentHash ||
    !block.document.contentHash
  ) {
    throw new EvidenceBundleError("INVALID_SOURCEBLOCK_PROVENANCE");
  }
  return {
    sourceBlockHash: block.contentHash,
    documentContentHash: block.document.contentHash,
    pageNumber: block.pageNumber,
    blockOrder: block.blockOrder,
    sourceLocator: block.sourceLocator,
    extractorVersion: block.extractionVersion,
    normalizedText: block.normalizedText,
  };
}

function sortSourceReferences(references: SourceBlockReferenceV1[]) {
  return references.sort(
    (a, b) =>
      a.pageNumber - b.pageNumber ||
      a.blockOrder - b.blockOrder ||
      a.sourceBlockHash.localeCompare(b.sourceBlockHash),
  );
}
