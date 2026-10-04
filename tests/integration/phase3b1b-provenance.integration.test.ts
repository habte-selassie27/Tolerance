import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSupabaseAdminClient } from "../../src/lib/supabase/admin";
import {
  attachRequirementSourceBlock,
  createRequirement,
  linkEvidenceSourceBlock,
  linkEvidenceToRequirement,
  resolveEffectiveGoverningSources,
} from "../../src/server/provenance-services";
import {
  extractPrivatePdf,
  getDocumentSourceBlocks,
} from "../../src/server/pdf-extraction";
import { EVIDENCE_BUCKET } from "../../src/server/evidence-storage";
import { buildEvidenceBundleV1 } from "../../src/server/evidence-bundle";
import { buildDeterministicEvaluationContext } from "../../src/server/evaluation-context";
import { buildDisputePacketV1 } from "../../src/server/dispute-packet";
import {
  COMMERCIAL_OBLIGATION_ESCROW_DISPUTE_ABI,
  confirmXLayerDisputeBinding,
  createDisputeWorkflow,
  prepareXLayerEnterDispute,
  type XLayerDisputeVerifier,
} from "../../src/server/dispute-workflow";
import {
  GenLayerSubmissionError,
  pollGenLayerSubmissionStatus,
  submitGenLayerCase,
  type GenLayerCaseSubmitter,
} from "../../src/server/genlayer-submission";
import { observeGenLayerResolution } from "../../src/server/resolution-observation";
import { protocolConfig } from "../../src/config/protocol";
import { computeToleranceCaseId } from "../../genlayer/schemas/resolved-case";
import {
  createPublicClient,
  createWalletClient,
  decodeFunctionData,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { xLayerTestnet } from "../../packages/phase2d/xlayer";

if (process.env.RUN_PHASE3_INTEGRATION_TESTS !== "1") {
  throw new Error("Set RUN_PHASE3_INTEGRATION_TESTS=1 to run this live suite.");
}

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function ignoredEnv(name: string) {
  const line = readFileSync(".env.phase2d.local", "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1);
}

async function retryTransient<T>(
  operation: () => Promise<T>,
  isRetryable: (value: T) => boolean,
) {
  let result = await operation();
  for (let attempt = 0; attempt < 2 && isRetryable(result); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
    result = await operation();
  }
  return result;
}

const liveXLayer = process.env.RUN_PHASE3C23_LIVE_XLAYER === "1";
const liveBuyerKey = liveXLayer
  ? (ignoredEnv("XLAYER_BUYER_PRIVATE_KEY") as Hex | undefined)
  : undefined;
const liveSupplierKey = liveXLayer
  ? (ignoredEnv("XLAYER_SUPPLIER_PRIVATE_KEY") as Hex | undefined)
  : undefined;
if (liveXLayer && (!liveBuyerKey || !liveSupplierKey))
  throw new Error(
    "Missing ignored synthetic X Layer party wallet configuration.",
  );
const liveBuyer = liveBuyerKey ? privateKeyToAccount(liveBuyerKey) : undefined;
const liveSupplier = liveSupplierKey
  ? privateKeyToAccount(liveSupplierKey)
  : undefined;
const buyerWallet =
  liveBuyer?.address ?? "0x1111111111111111111111111111111111111111";
const supplierWallet =
  liveSupplier?.address ?? "0x2222222222222222222222222222222222222222";
const LIVE_ESCROW_ABI = parseAbi([
  "function obligationExists(uint256) view returns (bool)",
  "function createObligation(uint256,address,uint256,bytes32,bytes32,uint64,uint64)",
  "function acceptObligation(uint256)",
  "function fund(uint256)",
  "function commitEvidence(uint256,bytes32)",
  "function approve(address,uint256) returns (bool)",
]);

const db = new PrismaClient();
const runId = `phase3b1b-${randomUUID()}`;
const actorId = randomUUID();
const otherActorId = randomUUID();
const unauthenticatedActorId = randomUUID();
const xLayerObligationAId = String(9_100_000_000 + (Date.now() % 900_000_000));
const xLayerObligationBId = String(Number(xLayerObligationAId) + 1);

let organizationAId = "";
let organizationBId = "";
let dealAId = "";
let dealBId = "";
let agreementAId = "";
let obligationAId = "";
let obligationBId = "";
let requirementAId = "";
let requirementBId = "";
let evidenceAId = "";
let baseBlockId = "";
let approvedAmendmentBlockId = "";
let draftAmendmentBlockId = "";
let evidenceBlockId = "";
let unrelatedBlockId = "";
let uploadedStorageKey = "";
let confirmedWorkflowId = "";

const hash = (value: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

function integrationProgress(step: string) {
  if (process.env.PHASE3_INTEGRATION_DEBUG === "1")
    console.info(`[phase3-integration] ${step}`);
}

async function createPdfBytes() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([300, 300]);
  page.drawText("Synthetic integration evidence", {
    x: 32,
    y: 240,
    size: 16,
    font,
  });
  page.drawText("Material verified: 316L", { x: 32, y: 200, size: 12, font });
  return pdf.save();
}

async function createDocument(
  dealId: string,
  documentType: "AGREEMENT" | "AMENDMENT" | "INSPECTION_REPORT",
  contentHash: string,
  suffix: string,
) {
  return db.document.create({
    data: {
      dealId,
      uploadedById: actorId,
      documentType,
      originalFilename: `${suffix}.pdf`,
      mimeType: "application/pdf",
      byteSize: 1,
      contentHash,
      storageObjectKey: `integration/${runId}/${suffix}`,
      status: "EXTRACTED",
    },
  });
}

async function createBlock(documentId: string, text: string, order: number) {
  return db.sourceBlock.create({
    data: {
      documentId,
      pageNumber: 1,
      blockOrder: order,
      normalizedText: text,
      sourceLocator: `page:1:block:${order}`,
      contentHash: hash(`${documentId}:${order}:${text}`),
      extractionVersion: "integration-v1",
    },
  });
}

beforeAll(async () => {
  integrationProgress("creating synthetic users");
  const [userA, userB] = await Promise.all([
    db.user.create({
      data: {
        id: actorId,
        authSubject: actorId,
        email: `${runId}-a@example.test`,
      },
    }),
    db.user.create({
      data: {
        id: otherActorId,
        authSubject: otherActorId,
        email: `${runId}-b@example.test`,
      },
    }),
  ]);
  integrationProgress("creating synthetic organizations");
  const [orgA, orgB] = await Promise.all([
    db.organization.create({
      data: { name: `${runId} A`, slug: `${runId}-a` },
    }),
    db.organization.create({
      data: { name: `${runId} B`, slug: `${runId}-b` },
    }),
  ]);
  organizationAId = orgA.id;
  organizationBId = orgB.id;
  integrationProgress("creating organization memberships");
  await db.organizationMember.createMany({
    data: [
      { organizationId: orgA.id, userId: userA.id, role: "OWNER" },
      { organizationId: orgB.id, userId: userB.id, role: "OWNER" },
    ],
  });

  integrationProgress("creating synthetic deals");
  const [dealA, dealB] = await Promise.all([
    db.deal.create({
      data: {
        organizationId: orgA.id,
        reference: `${runId}-deal-a`,
        title: "Synthetic provenance deal A",
        buyerOrganizationRef: "Buyer A",
        supplierOrganizationRef: "Supplier A",
        createdById: userA.id,
      },
    }),
    db.deal.create({
      data: {
        organizationId: orgB.id,
        reference: `${runId}-deal-b`,
        title: "Synthetic provenance deal B",
        buyerOrganizationRef: "Buyer B",
        supplierOrganizationRef: "Supplier B",
        createdById: userB.id,
      },
    }),
  ]);
  dealAId = dealA.id;
  dealBId = dealB.id;

  integrationProgress("creating agreements");
  const agreementA = await db.agreement.create({
    data: {
      dealId: dealA.id,
      version: 1,
      status: "APPROVED",
      agreementHash: hash(`${runId}:agreement-a`),
      createdById: userA.id,
    },
  });
  agreementAId = agreementA.id;
  const agreementB = await db.agreement.create({
    data: {
      dealId: dealB.id,
      version: 1,
      status: "APPROVED",
      agreementHash: hash(`${runId}:agreement-b`),
      createdById: userB.id,
    },
  });

  integrationProgress("creating obligations");
  const [obligationA, obligationB] = await Promise.all([
    db.obligation.create({
      data: {
        dealId: dealA.id,
        agreementId: agreementA.id,
        createdById: userA.id,
        buyerWallet,
        supplierWallet,
        amount: 1,
        tokenAddress: "0x3333333333333333333333333333333333333333",
        tokenDecimals: 6,
        xLayerChainId: 1952,
        xLayerEscrow: "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
        xLayerObligationId: xLayerObligationAId,
        toleranceCaseId: computeToleranceCaseId(
          1952n,
          "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
          BigInt(xLayerObligationAId),
        ),
        agreementHash: agreementA.agreementHash,
        policyHash: hash(`${runId}:policy-a`),
      },
    }),
    db.obligation.create({
      data: {
        dealId: dealB.id,
        agreementId: agreementB.id,
        createdById: userB.id,
        buyerWallet: "0x5555555555555555555555555555555555555555",
        supplierWallet: "0x6666666666666666666666666666666666666666",
        amount: 1,
        tokenAddress: "0x7777777777777777777777777777777777777777",
        tokenDecimals: 6,
        xLayerChainId: 1952,
        xLayerEscrow: "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
        xLayerObligationId: xLayerObligationBId,
        toleranceCaseId: computeToleranceCaseId(
          1952n,
          "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
          BigInt(xLayerObligationBId),
        ),
        agreementHash: agreementB.agreementHash,
        policyHash: hash(`${runId}:policy-b`),
      },
    }),
  ]);
  obligationAId = obligationA.id;
  obligationBId = obligationB.id;

  integrationProgress("creating documents");
  const [
    agreementDocument,
    approvedDocument,
    draftDocument,
    evidenceDocument,
    otherDocument,
  ] = await Promise.all([
    createDocument(
      dealA.id,
      "AGREEMENT",
      hash(`${runId}:agreement-doc`),
      "agreement",
    ),
    createDocument(
      dealA.id,
      "AMENDMENT",
      hash(`${runId}:approved-amendment-doc`),
      "approved-amendment",
    ),
    createDocument(
      dealA.id,
      "AMENDMENT",
      hash(`${runId}:draft-amendment-doc`),
      "draft-amendment",
    ),
    createDocument(
      dealA.id,
      "INSPECTION_REPORT",
      hash(`${runId}:evidence-doc`),
      "inspection",
    ),
    db.document.create({
      data: {
        dealId: dealB.id,
        uploadedById: userB.id,
        documentType: "AGREEMENT",
        originalFilename: "other.pdf",
        mimeType: "application/pdf",
        byteSize: 1,
        contentHash: hash(`${runId}:other-doc`),
        storageObjectKey: `integration/${runId}/other`,
        status: "EXTRACTED",
      },
    }),
  ]);
  integrationProgress("creating source blocks");
  const [baseBlock, approvedBlock, draftBlock, evidenceBlock, otherBlock] =
    await Promise.all([
      createBlock(
        agreementDocument.id,
        "Diameter shall be 50.00 mm ±0.25 mm",
        1,
      ),
      createBlock(
        approvedDocument.id,
        "Diameter shall be 50.00 mm ±0.15 mm",
        1,
      ),
      createBlock(draftDocument.id, "Diameter shall be 50.00 mm ±0.10 mm", 1),
      createBlock(evidenceDocument.id, "Measured diameter: 50.10 mm", 1),
      createBlock(otherDocument.id, "Unrelated source", 1),
    ]);
  baseBlockId = baseBlock.id;
  approvedAmendmentBlockId = approvedBlock.id;
  draftAmendmentBlockId = draftBlock.id;
  evidenceBlockId = evidenceBlock.id;
  unrelatedBlockId = otherBlock.id;

  integrationProgress("creating amendments");
  await db.amendment.createMany({
    data: [
      {
        agreementId: agreementA.id,
        version: 1,
        amendmentHash: hash(`${runId}:approved-amendment`),
        documentId: approvedDocument.id,
        status: "APPROVED",
        precedence: 10,
      },
      {
        agreementId: agreementA.id,
        version: 2,
        amendmentHash: hash(`${runId}:draft-amendment`),
        documentId: draftDocument.id,
        status: "DRAFT",
        precedence: 20,
      },
    ],
  });

  integrationProgress("creating requirements and evidence");
  const requirementA = await createRequirement(actorId, {
    obligationId: obligationA.id,
    requirementKey: "R-001",
    title: "Diameter requirement",
    description: "Synthetic requirement",
    category: "DIMENSIONAL",
    governingSourceRef: "manual",
    acceptanceCriteria: "Diameter requirement",
    evidenceExpectations: "Inspection report",
    required: true,
    ordering: 1,
  });
  requirementAId = requirementA.id;
  const requirementB = await db.requirement.create({
    data: {
      obligationId: obligationB.id,
      requirementKey: "R-001",
      title: "Unrelated requirement",
      description: "Synthetic requirement",
      category: "DIMENSIONAL",
      governingSourceRef: "manual",
      acceptanceCriteria: "Unrelated",
      evidenceExpectations: "Unrelated",
      ordering: 1,
    },
  });
  requirementBId = requirementB.id;
  const evidence = await db.evidence.create({
    data: {
      obligationId: obligationA.id,
      documentId: evidenceDocument.id,
      contentHash: hash(`${runId}:evidence`),
      bundleHash: hash(`${runId}:bundle`),
    },
  });
  evidenceAId = evidence.id;
  integrationProgress("fixture setup complete");
}, 60_000);

afterAll(async () => {
  if (liveXLayer) {
    await db.$disconnect();
    return;
  }
  if (uploadedStorageKey) {
    await createSupabaseAdminClient()
      .storage.from(EVIDENCE_BUCKET)
      .remove([uploadedStorageKey]);
  }
  await db.auditEvent.deleteMany({
    where: { organizationId: { in: [organizationAId, organizationBId] } },
  });
  await db.amendment.deleteMany({ where: { agreementId: agreementAId } });
  await db.obligation.deleteMany({
    where: { id: { in: [obligationAId, obligationBId] } },
  });
  await db.document.deleteMany({
    where: { dealId: { in: [dealAId, dealBId] } },
  });
  await db.agreement.deleteMany({
    where: { dealId: { in: [dealAId, dealBId] } },
  });
  await db.deal.deleteMany({ where: { id: { in: [dealAId, dealBId] } } });
  await db.organization.deleteMany({
    where: { id: { in: [organizationAId, organizationBId] } },
  });
  await db.user.deleteMany({
    where: { authSubject: { in: [actorId, otherActorId] } },
  });
  await db.$disconnect();
}, 30_000);

describe.sequential(
  "Phase 3B1B real Supabase provenance",
  { timeout: 90_000 },
  () => {
    it("persists the positive provenance relationships across a database round trip", async () => {
      await attachRequirementSourceBlock(
        actorId,
        requirementAId,
        baseBlockId,
        0,
      );
      await linkEvidenceToRequirement(actorId, evidenceAId, requirementAId);
      await linkEvidenceSourceBlock(actorId, evidenceAId, evidenceBlockId);

      const persisted = await db.requirement.findUniqueOrThrow({
        where: { id: requirementAId },
        include: {
          governingSources: {
            include: { sourceBlock: { include: { document: true } } },
          },
          evidenceLinks: {
            include: { evidence: { include: { sourceLinks: true } } },
          },
        },
      });
      expect(persisted.governingSources).toHaveLength(1);
      expect(persisted.governingSources[0]?.sourceBlock.id).toBe(baseBlockId);
      expect(persisted.governingSources[0]?.sourceBlock.document.dealId).toBe(
        dealAId,
      );
      expect(persisted.evidenceLinks).toHaveLength(1);
      expect(
        persisted.evidenceLinks[0]?.evidence.sourceLinks[0]?.sourceBlockId,
      ).toBe(evidenceBlockId);
    });

    it("resolves approved amendment sources while preserving base and excluding draft", async () => {
      await attachRequirementSourceBlock(
        actorId,
        requirementAId,
        approvedAmendmentBlockId,
        10,
      );
      await attachRequirementSourceBlock(
        actorId,
        requirementAId,
        draftAmendmentBlockId,
        20,
      );
      const resolved = await resolveEffectiveGoverningSources(requirementAId);
      expect(resolved.base.map((link) => link.sourceBlockId)).toContain(
        baseBlockId,
      );
      expect(resolved.amendments.map((link) => link.sourceBlockId)).toEqual([
        approvedAmendmentBlockId,
      ]);
      expect(resolved.effective?.sourceBlockId).toBe(approvedAmendmentBlockId);
      expect(resolved.effective?.sourceBlock.normalizedText).toContain(
        "±0.15 mm",
      );
    });

    it("rejects the three critical cross-organization or cross-deal mappings", async () => {
      await expect(
        attachRequirementSourceBlock(actorId, requirementAId, unrelatedBlockId),
      ).rejects.toThrow("Invalid governing source");
      await expect(
        linkEvidenceToRequirement(actorId, evidenceAId, requirementBId),
      ).rejects.toThrow("Cross-obligation evidence mapping rejected");
      await expect(
        linkEvidenceSourceBlock(actorId, evidenceAId, unrelatedBlockId),
      ).rejects.toThrow("Cross-deal source mapping rejected");
    });

    it("rejects unauthenticated provenance mutations and protected reads", async () => {
      await expect(
        attachRequirementSourceBlock(
          unauthenticatedActorId,
          requirementAId,
          baseBlockId,
        ),
      ).rejects.toThrow();
      await expect(
        linkEvidenceToRequirement(
          unauthenticatedActorId,
          evidenceAId,
          requirementAId,
        ),
      ).rejects.toThrow();
      const governingDocumentId = (
        await db.sourceBlock.findUniqueOrThrow({ where: { id: baseBlockId } })
      ).documentId;
      await expect(
        getDocumentSourceBlocks(governingDocumentId, unauthenticatedActorId),
      ).rejects.toThrow();
    });

    it("is idempotent and records successful audit events without auditing rejected attempts", async () => {
      const auditBefore = await db.auditEvent.count({
        where: {
          organizationId: organizationAId,
          action: "REQUIREMENT_SOURCE_ATTACHED",
        },
      });

      await attachRequirementSourceBlock(
        actorId,
        requirementAId,
        baseBlockId,
        0,
      );
      await attachRequirementSourceBlock(
        actorId,
        requirementAId,
        baseBlockId,
        0,
      );
      expect(
        await db.requirementSourceBlock.count({
          where: { requirementId: requirementAId, sourceBlockId: baseBlockId },
        }),
      ).toBe(1);
      const auditAfterSuccess = await db.auditEvent.count({
        where: {
          organizationId: organizationAId,
          action: "REQUIREMENT_SOURCE_ATTACHED",
        },
      });
      expect(auditAfterSuccess).toBeGreaterThan(auditBefore);
      await expect(
        attachRequirementSourceBlock(
          unauthenticatedActorId,
          requirementAId,
          baseBlockId,
        ),
      ).rejects.toThrow();
      expect(
        await db.auditEvent.count({
          where: {
            organizationId: organizationAId,
            action: "REQUIREMENT_SOURCE_ATTACHED",
          },
        }),
      ).toBe(auditAfterSuccess);
    });

    it("builds and snapshots an EvidenceBundleV1 from persisted provenance", async () => {
      const first = await buildEvidenceBundleV1(actorId, obligationAId);
      const second = await buildEvidenceBundleV1(actorId, obligationAId);
      const [baseBlock, approvedBlock, inspectionBlock] = await Promise.all([
        db.sourceBlock.findUniqueOrThrow({ where: { id: baseBlockId } }),
        db.sourceBlock.findUniqueOrThrow({
          where: { id: approvedAmendmentBlockId },
        }),
        db.sourceBlock.findUniqueOrThrow({ where: { id: evidenceBlockId } }),
      ]);
      expect(first.canonicalJson).toBe(second.canonicalJson);
      expect(first.evidenceBundleHash).toBe(second.evidenceBundleHash);
      expect(first.evidenceRoot).toBe(second.evidenceRoot);
      expect(
        first.bundle.requirements[0]?.baseGoverningSources[0]?.sourceBlockHash,
      ).toBe(baseBlock.contentHash);
      expect(
        first.bundle.requirements[0]?.approvedAmendmentSources[0]?.source
          .sourceBlockHash,
      ).toBe(approvedBlock.contentHash);
      expect(first.bundle.evidence[0]?.sourceBlocks[0]?.sourceBlockHash).toBe(
        inspectionBlock.contentHash,
      );
      expect(
        await db.evidenceBundleSnapshot.count({
          where: { obligationId: obligationAId },
        }),
      ).toBe(1);
    }, 90_000);

    it("builds an idempotent deterministic evaluation context from the persisted bundle", async () => {
      const first = await buildDeterministicEvaluationContext(
        actorId,
        obligationAId,
      );
      const second = await buildDeterministicEvaluationContext(
        actorId,
        obligationAId,
      );
      expect(first.evaluationContextHash).toBe(second.evaluationContextHash);
      expect(first.snapshot.id).toBe(second.snapshot.id);
      expect(
        first.context.requirements[0]?.effectiveGoverningSources[0]
          ?.normalizedText,
      ).toContain("±0.15 mm");
      expect(
        first.context.requirements[0]?.baseGoverningSources[0]?.normalizedText,
      ).toContain("±0.25 mm");
    }, 90_000);

    it("persists an authorized, validated, idempotent DisputePacketV1 snapshot", async () => {
      const bundle = await buildEvidenceBundleV1(actorId, obligationAId);
      await db.obligation.update({
        where: { id: obligationAId },
        data: { evidenceRoot: bundle.evidenceRoot },
      });
      const context = await buildDeterministicEvaluationContext(
        actorId,
        obligationAId,
      );
      const requirement = context.context.requirements[0]!;
      const citation = context.context.allowedSourceBlocks.find((source) =>
        requirement.evidence.some((evidence) =>
          evidence.sourceBlocks.some(
            (block) => block.sourceBlockHash === source.sourceBlockHash,
          ),
        ),
      )!;
      const evaluation = {
        schemaVersion: "1" as const,
        evaluationContextHash: context.evaluationContextHash,
        requirements: [
          {
            requirementId: requirement.id,
            result: "SATISFIED" as const,
            explanation: "Synthetic persisted evaluation.",
            claims: [
              {
                claim: "The inspection report supplies the measurement.",
                citations: [citation],
              },
            ],
          },
        ],
      };
      const run = await db.aiEvaluationRun.create({
        data: {
          obligationId: obligationAId,
          evaluationContextId: context.snapshot.id,
          evaluationContextHash: context.evaluationContextHash,
          requestSchemaVersion: "1",
          provider: "synthetic",
          model: "fixture",
          idempotencyKey: `${runId}:packet`,
          status: "REJECTED",
          failureCode: "SYNTHETIC_REJECTION",
          completedAt: new Date(),
        },
      });
      await db.aiEvaluationSnapshot.create({
        data: {
          obligationId: obligationAId,
          evaluationContextId: context.snapshot.id,
          evaluationRunId: run.id,
          schemaVersion: "1",
          evaluationContextHash: context.evaluationContextHash,
          validatorVersion: "1",
          evaluation,
        },
      });
      await expect(
        buildDisputePacketV1(actorId, obligationAId),
      ).rejects.toThrow("VALIDATED_AI_REQUIRED");
      await db.aiEvaluationRun.update({
        where: { id: run.id },
        data: { status: "VALIDATED", failureCode: null },
      });

      const first = await buildDisputePacketV1(actorId, obligationAId);
      const second = await buildDisputePacketV1(actorId, obligationAId);
      expect(second.snapshot.id).toBe(first.snapshot.id);
      expect(second.canonicalJson).toBe(first.canonicalJson);
      expect(second.disputePacketHash).toBe(first.disputePacketHash);
      const persisted = await db.disputePacketSnapshot.findUniqueOrThrow({
        where: { id: first.snapshot.id },
      });
      expect(persisted.canonicalJson).toBe(first.canonicalJson);
      expect(persisted.disputePacketHash).toBe(first.disputePacketHash);
      expect(persisted.caseId).toBe(
        computeToleranceCaseId(
          1952n,
          "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
          BigInt(xLayerObligationAId),
        ),
      );
      await expect(
        buildDisputePacketV1(otherActorId, obligationAId),
      ).rejects.toThrow();

      await db.obligation.update({
        where: { id: obligationAId },
        data: { evidenceRoot: `0x${"9".repeat(64)}` },
      });
      await expect(
        buildDisputePacketV1(actorId, obligationAId),
      ).rejects.toThrow("EVIDENCE_LINEAGE_MISMATCH");
      await db.obligation.update({
        where: { id: obligationAId },
        data: { evidenceRoot: bundle.evidenceRoot },
      });
    }, 90_000);

    it("persists the authorized Phase 3C1 wallet-binding workflow idempotently", async () => {
      const evaluationRun = await db.aiEvaluationRun.findFirstOrThrow({
        where: { obligationId: obligationAId },
        orderBy: { createdAt: "desc" },
      });
      await db.aiEvaluationRun.update({
        where: { id: evaluationRun.id },
        data: { status: "REJECTED", failureCode: "SYNTHETIC_REJECTION" },
      });
      await expect(
        createDisputeWorkflow(actorId, obligationAId),
      ).rejects.toThrow("VALIDATED_AI_REQUIRED");
      await db.aiEvaluationRun.update({
        where: { id: evaluationRun.id },
        data: { status: "VALIDATED", failureCode: null },
      });

      const authoritativeObligation = await db.obligation.findUniqueOrThrow({
        where: { id: obligationAId },
      });
      await db.obligation.update({
        where: { id: obligationAId },
        data: { evidenceRoot: `0x${"9".repeat(64)}` },
      });
      await expect(
        createDisputeWorkflow(actorId, obligationAId),
      ).rejects.toThrow("EVIDENCE_LINEAGE_MISMATCH");
      await db.obligation.update({
        where: { id: obligationAId },
        data: { evidenceRoot: authoritativeObligation.evidenceRoot },
      });

      const created = await createDisputeWorkflow(actorId, obligationAId);
      const duplicate = await createDisputeWorkflow(actorId, obligationAId);
      expect(created.reused).toBe(false);
      expect(duplicate.reused).toBe(true);
      expect(duplicate.workflow.id).toBe(created.workflow.id);
      expect(created.workflow.workflowStatus).toBe("PACKET_READY");
      expect(created.workflow.workflowVersion).toBe(0);
      await expect(
        createDisputeWorkflow(otherActorId, obligationAId),
      ).rejects.toThrow();
      await expect(
        prepareXLayerEnterDispute(
          unauthenticatedActorId,
          created.workflow.id,
          0,
        ),
      ).rejects.toThrow();
      await expect(
        prepareXLayerEnterDispute(actorId, created.workflow.id, 99),
      ).rejects.toThrow("STALE_WORKFLOW_VERSION");

      const prepared = await prepareXLayerEnterDispute(
        actorId,
        created.workflow.id,
        0,
      );
      expect(prepared.workflow.workflowStatus).toBe("XLAYER_BINDING_PENDING");
      expect(prepared.workflow.workflowVersion).toBe(1);
      expect(prepared.transaction).not.toHaveProperty("account");
      expect(prepared.transaction).not.toHaveProperty("signature");
      expect(
        decodeFunctionData({
          abi: COMMERCIAL_OBLIGATION_ESCROW_DISPUTE_ABI,
          data: prepared.transaction.data,
        }),
      ).toEqual({
        functionName: "enterDispute",
        args: [
          BigInt(xLayerObligationAId),
          prepared.transaction.disputePacketHash,
        ],
      });

      const txHash = `0x${createHash("sha256")
        .update(`${runId}:xlayer-dispute`)
        .digest("hex")}` as const;
      const verifier: XLayerDisputeVerifier = {
        async observe(transactionHash) {
          return {
            chainId: 1952,
            transactionHash,
            finalized: true,
            succeeded: true,
            to: "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
            functionName: "enterDispute",
            obligationId: BigInt(xLayerObligationAId),
            disputePacketHash: prepared.transaction.disputePacketHash,
            event: {
              address: "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
              eventName: "DisputeEntered",
              obligationId: BigInt(xLayerObligationAId),
              initiator: buyerWallet,
              disputePacketHash: prepared.transaction.disputePacketHash,
            },
            obligationState: 5,
            onchainDisputePacketHash: prepared.transaction.disputePacketHash,
            blockNumber: 123456n,
          };
        },
      };
      await expect(
        confirmXLayerDisputeBinding(actorId, created.workflow.id, txHash, {
          async observe(transactionHash) {
            const exact = await verifier.observe(transactionHash);
            return {
              ...exact,
              to: "0x9999999999999999999999999999999999999999",
            };
          },
        }),
      ).rejects.toThrow("WRONG_XLAYER_ESCROW");
      expect(
        (
          await db.adjudicationCase.findUniqueOrThrow({
            where: { id: created.workflow.id },
          })
        ).failureCode,
      ).toBe("WRONG_XLAYER_ESCROW");
      const confirmed = await confirmXLayerDisputeBinding(
        actorId,
        created.workflow.id,
        txHash,
        verifier,
      );
      expect(confirmed.workflow.workflowStatus).toBe(
        "XLAYER_DISPUTE_CONFIRMED",
      );
      expect(confirmed.workflow.workflowVersion).toBe(2);
      confirmedWorkflowId = confirmed.workflow.id;
      const repeated = await confirmXLayerDisputeBinding(
        actorId,
        created.workflow.id,
        txHash,
        {
          async observe() {
            throw new Error("must not re-observe");
          },
        },
      );
      expect(repeated.reused).toBe(true);
      await expect(
        prepareXLayerEnterDispute(actorId, created.workflow.id, 2),
      ).rejects.toThrow("ILLEGAL_WORKFLOW_TRANSITION");

      const [persisted, protocolEvent, obligation, audits] = await Promise.all([
        db.adjudicationCase.findUniqueOrThrow({
          where: { id: created.workflow.id },
        }),
        db.protocolEvent.findUniqueOrThrow({
          where: {
            txHash_eventType: {
              txHash,
              eventType: "DISPUTE_ENTERED",
            },
          },
        }),
        db.obligation.findUniqueOrThrow({ where: { id: obligationAId } }),
        db.auditEvent.findMany({
          where: { targetId: created.workflow.id },
        }),
      ]);
      expect(persisted.workflowStatus).toBe("XLAYER_DISPUTE_CONFIRMED");
      expect(persisted.xLayerDisputeTxHash).toBe(txHash);
      expect(protocolEvent.observedState).toBe("DISPUTED");
      expect(obligation.observedOnchainState).toBe("DISPUTED");
      expect(obligation.disputePacketHash).toBe(
        created.workflow.disputePacketHash,
      );
      expect(audits.map((event) => event.action).sort()).toEqual([
        "DISPUTE_WORKFLOW_CREATED",
        "XLAYER_DISPUTE_CONFIRMATION_REJECTED",
        "XLAYER_DISPUTE_CONFIRMED",
        "XLAYER_DISPUTE_PREPARED",
      ]);
    }, 90_000);

    it("persists the Phase 3C2 submission intent, submission hash, polling, and safe unknown state", async () => {
      expect(confirmedWorkflowId).not.toBe("");
      const genLayerTxHash = `0x${createHash("sha256")
        .update(`${runId}:genlayer-submit`)
        .digest("hex")}`;
      const submitter: GenLayerCaseSubmitter = {
        async submitCase({ judge, canonicalPacket }) {
          expect(judge).toBe("0xFF1de4Ec0D3E26eC3BCa080Fd4587901dB48a56b");
          expect(canonicalPacket).toContain('"disputePacketHash"');
          return { transactionHash: genLayerTxHash };
        },
      };
      await expect(
        submitGenLayerCase(otherActorId, confirmedWorkflowId, submitter),
      ).rejects.toThrow();
      const first = await submitGenLayerCase(
        actorId,
        confirmedWorkflowId,
        submitter,
      );
      expect(first.reused).toBe(false);
      expect(first.workflow.workflowStatus).toBe("GENLAYER_SUBMITTED");
      expect(first.workflow.submissionState).toBe("SUBMITTED");
      expect(first.workflow.submissionTxHash).toBe(genLayerTxHash);
      const repeated = await submitGenLayerCase(actorId, confirmedWorkflowId, {
        async submitCase() {
          throw new Error("must not submit twice");
        },
      });
      expect(repeated.reused).toBe(true);
      const polled = await pollGenLayerSubmissionStatus(
        actorId,
        confirmedWorkflowId,
        {
          async getTransactionStatus() {
            return { status: "ACCEPTED", statusCode: 5 };
          },
        },
      );
      expect(polled.status).toBe("ACCEPTED");
      expect(polled.workflow.workflowStatus).toBe("GENLAYER_SUBMITTED");
      expect(polled.workflow.lifecycle).toBe("ACCEPTED");

      await db.adjudicationCase.update({
        where: { id: confirmedWorkflowId },
        data: {
          workflowStatus: "XLAYER_DISPUTE_CONFIRMED",
          submissionState: null,
          submissionTxHash: null,
          submissionRequestId: null,
          submissionDispatchAt: null,
          submissionSubmittedAt: null,
          failureCode: null,
        },
      });
      await expect(
        submitGenLayerCase(actorId, confirmedWorkflowId, {
          async submitCase() {
            throw new GenLayerSubmissionError(
              "PROCESS_DIED_AFTER_DISPATCH",
              true,
            );
          },
        }),
      ).rejects.toThrow("PROCESS_DIED_AFTER_DISPATCH");
      const unknown = await db.adjudicationCase.findUniqueOrThrow({
        where: { id: confirmedWorkflowId },
      });
      expect(unknown.workflowStatus).toBe("GENLAYER_SUBMISSION_UNKNOWN");
      expect(unknown.submissionState).toBe("UNKNOWN");
      const auditActions = await db.auditEvent.findMany({
        where: { targetId: confirmedWorkflowId },
        select: { action: true },
      });
      expect(auditActions.map((event) => event.action)).toContain(
        "GENLAYER_CASE_SUBMITTED",
      );
      expect(auditActions.map((event) => event.action)).toContain(
        "GENLAYER_SUBMISSION_UNKNOWN",
      );
    }, 90_000);

    it("persists only a finalized-state-verified ResolutionObservation and blocks attestation", async () => {
      const workflow = await db.adjudicationCase.findUniqueOrThrow({
        where: { id: confirmedWorkflowId },
        include: { obligation: true },
      });
      const txHash = `0x${createHash("sha256")
        .update(`${runId}:genlayer-finalized`)
        .digest("hex")}`;
      await db.adjudicationCase.update({
        where: { id: confirmedWorkflowId },
        data: {
          workflowStatus: "GENLAYER_SUBMITTED",
          submissionState: "SUBMITTED",
          submissionTxHash: txHash,
          failureCode: null,
        },
      });
      const finalizedCase = {
        resolved: true,
        schemaVersion: "1",
        caseId: workflow.caseId,
        xLayerChainId: String(workflow.obligation.xLayerChainId),
        xLayerEscrow: workflow.obligation.xLayerEscrow,
        obligationId: workflow.obligation.xLayerObligationId,
        agreementHash: workflow.obligation.agreementHash.replace(
          "sha256:",
          "0x",
        ),
        policyHash: workflow.obligation.policyHash.replace("sha256:", "0x"),
        evidenceRoot: workflow.obligation.evidenceRoot!.replace(
          "sha256:",
          "0x",
        ),
        disputePacketHash: workflow.disputePacketHash,
        verdict: "RELEASE_FULL",
      };
      const first = await observeGenLayerResolution(
        actorId,
        confirmedWorkflowId,
        {
          async getTransactionStatus() {
            return { status: "FINALIZED", statusCode: 8 };
          },
        },
        {
          async readCase({ judge, caseId }) {
            expect(judge).toBe(protocolConfig.genLayer.judge);
            expect(caseId).toBe(workflow.caseId);
            return JSON.stringify(finalizedCase);
          },
        },
      );
      expect(first.reused).toBe(false);
      expect(first.observation.verificationLevel).toBe(
        "FINALIZED_STATE_VERIFIED",
      );
      const repeated = await observeGenLayerResolution(
        actorId,
        confirmedWorkflowId,
        {
          async getTransactionStatus() {
            throw new Error("must not re-poll an immutable observation");
          },
        },
      );
      expect(repeated.reused).toBe(true);
      const persisted = await db.adjudicationCase.findUniqueOrThrow({
        where: { id: confirmedWorkflowId },
        include: { resolutionObservation: true },
      });
      expect(persisted.workflowStatus).toBe("ATTESTATION_BLOCKED");
      expect(persisted.lifecycle).toBe("FINALIZED");
      expect(persisted.failureCode).toBe(
        "ATTESTATION_INDEPENDENT_TX_PROVENANCE_UNAVAILABLE",
      );
      expect(persisted.resolutionObservation?.resultHash).toBe(
        persisted.finalizedResultHash,
      );
    }, 90_000);

    it("enforces durable C4/C5 signature uniqueness and settlement execution persistence", async () => {
      const observation = await db.resolutionObservation.findFirstOrThrow({
        where: { adjudicationCaseId: confirmedWorkflowId },
      });
      const round = await db.attestationRound.create({
        data: {
          adjudicationCaseId: confirmedWorkflowId,
          resolutionObservationId: observation.id,
          payloadVersion: `${runId}-persistence-only`,
          canonicalPayload: JSON.stringify({ synthetic: true }),
          digest: `0x${createHash("sha256")
            .update(`${runId}:attestation-round`)
            .digest("hex")}`,
          nonce: "1",
          expiry: new Date(Date.now() + 60_000),
          threshold: 2,
          allowedSigners: ["0x1111111111111111111111111111111111111111"],
          status: "BLOCKED",
        },
      });
      await db.attestationSignature.create({
        data: {
          roundId: round.id,
          signer: "0x1111111111111111111111111111111111111111",
          signature: `0x${"1".repeat(130)}`,
        },
      });
      await expect(
        db.attestationSignature.create({
          data: {
            roundId: round.id,
            signer: "0x1111111111111111111111111111111111111111",
            signature: `0x${"2".repeat(130)}`,
          },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
      const execution = await db.settlementExecution.create({
        data: { attestationRoundId: round.id, status: "INTENT_CREATED" },
      });
      const persisted = await db.attestationRound.findUniqueOrThrow({
        where: { id: round.id },
        include: { signatures: true, settlementExecution: true },
      });
      expect(persisted.signatures).toHaveLength(1);
      expect(persisted.settlementExecution?.id).toBe(execution.id);
      expect(persisted.settlementExecution?.status).toBe("INTENT_CREATED");
    }, 90_000);

    it.skipIf(!liveXLayer)(
      "creates a real synthetic party-wallet dispute and submits it through the production GenLayer adapter",
      async () => {
        const rpcUrl = ignoredEnv("XLAYER_RPC_URL");
        if (!rpcUrl)
          throw new Error("Missing ignored X Layer RPC configuration.");
        process.env.XLAYER_RPC_URL = rpcUrl;
        const publicClient = createPublicClient({
          chain: xLayerTestnet,
          transport: http(rpcUrl),
        });
        const buyerClient = createWalletClient({
          account: liveBuyer!,
          chain: xLayerTestnet,
          transport: http(rpcUrl),
        });
        const supplierClient = createWalletClient({
          account: liveSupplier!,
          chain: xLayerTestnet,
          transport: http(rpcUrl),
        });
        const appObligation = await db.obligation.findUniqueOrThrow({
          where: { id: obligationAId },
        });
        expect(appObligation.evidenceRoot).toBeTruthy();
        await db.adjudicationCase.delete({
          where: { caseId: appObligation.toleranceCaseId },
        });
        const obligationId = BigInt(appObligation.xLayerObligationId);
        expect(
          await publicClient.readContract({
            address: protocolConfig.xLayer.escrow as `0x${string}`,
            abi: LIVE_ESCROW_ABI,
            functionName: "obligationExists",
            args: [obligationId],
          }),
        ).toBe(false);
        const hash32 = (value: string) => value.replace("sha256:", "0x") as Hex;
        const wait = async (transactionHash: Hex) => {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: transactionHash,
            confirmations: 1,
            timeout: 120_000,
          });
          expect(receipt.status).toBe("success");
          const deadline = Date.now() + 120_000;
          while (true) {
            const finalized = await publicClient.getBlock({
              blockTag: "finalized",
            });
            if (finalized.number >= receipt.blockNumber) return;
            if (Date.now() >= deadline)
              throw new Error(
                "X Layer transaction did not reach finalized state",
              );
            await new Promise((resolve) => setTimeout(resolve, 3_000));
          }
        };
        await wait(
          await buyerClient.writeContract({
            address: protocolConfig.xLayer.escrow as `0x${string}`,
            abi: LIVE_ESCROW_ABI,
            functionName: "createObligation",
            args: [
              obligationId,
              liveSupplier!.address,
              1_000_000n,
              hash32(appObligation.agreementHash),
              hash32(appObligation.policyHash),
              60n,
              60n,
            ],
          }),
        );
        await wait(
          await supplierClient.writeContract({
            address: protocolConfig.xLayer.escrow as `0x${string}`,
            abi: LIVE_ESCROW_ABI,
            functionName: "acceptObligation",
            args: [obligationId],
          }),
        );
        await wait(
          await buyerClient.writeContract({
            address: protocolConfig.xLayer.settlementToken as `0x${string}`,
            abi: LIVE_ESCROW_ABI,
            functionName: "approve",
            args: [protocolConfig.xLayer.escrow as `0x${string}`, 1_000_000n],
          }),
        );
        await wait(
          await buyerClient.writeContract({
            address: protocolConfig.xLayer.escrow as `0x${string}`,
            abi: LIVE_ESCROW_ABI,
            functionName: "fund",
            args: [obligationId],
          }),
        );
        await wait(
          await supplierClient.writeContract({
            address: protocolConfig.xLayer.escrow as `0x${string}`,
            abi: LIVE_ESCROW_ABI,
            functionName: "commitEvidence",
            args: [obligationId, hash32(appObligation.evidenceRoot!)],
          }),
        );
        const workflow = await createDisputeWorkflow(actorId, obligationAId);
        const prepared = await prepareXLayerEnterDispute(
          actorId,
          workflow.workflow.id,
          workflow.workflow.workflowVersion,
        );
        const disputeTxHash = await buyerClient.sendTransaction({
          to: prepared.transaction.to,
          data: prepared.transaction.data,
          value: prepared.transaction.value,
        });
        await wait(disputeTxHash);
        const confirmed = await confirmXLayerDisputeBinding(
          actorId,
          workflow.workflow.id,
          disputeTxHash,
        );
        expect(confirmed.workflow.workflowStatus).toBe(
          "XLAYER_DISPUTE_CONFIRMED",
        );
        const submitted = await submitGenLayerCase(
          actorId,
          workflow.workflow.id,
        );
        expect(submitted.workflow.workflowStatus).toBe("GENLAYER_SUBMITTED");
        const poll = await pollGenLayerSubmissionStatus(
          actorId,
          workflow.workflow.id,
        );
        const traceResponse = await fetch(protocolConfig.genLayer.rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "gen_dbg_traceTransaction",
            params: [{ txId: submitted.workflow.submissionTxHash }],
          }),
        });
        const traceBody = (await traceResponse.json()) as { error?: unknown };
        console.info(
          JSON.stringify({
            phase3c23Live: {
              obligationId: obligationId.toString(),
              workflowId: workflow.workflow.id,
              xLayerDisputeTxHash: disputeTxHash,
              genLayerSubmissionTxHash: submitted.workflow.submissionTxHash,
              lifecycleStatus: poll.status,
              debugTrace: traceBody.error ? "DISABLED" : "AVAILABLE",
            },
          }),
        );
      },
      300_000,
    );

    it("distinguishes optional unmapped evidence from required missing evidence", async () => {
      const optional = await createRequirement(actorId, {
        obligationId: obligationAId,
        requirementKey: "R-OPTIONAL",
        title: "Optional synthetic requirement",
        description: "No evidence is required",
        category: "OPTIONAL",
        governingSourceRef: "manual",
        acceptanceCriteria: "Optional",
        evidenceExpectations: "",
        required: false,
        ordering: 2,
      });
      await attachRequirementSourceBlock(actorId, optional.id, baseBlockId);
      await expect(
        buildEvidenceBundleV1(actorId, obligationAId),
      ).resolves.toBeDefined();

      const missing = await createRequirement(actorId, {
        obligationId: obligationAId,
        requirementKey: "R-MISSING",
        title: "Required synthetic requirement",
        description: "Evidence deliberately absent",
        category: "REQUIRED",
        governingSourceRef: "manual",
        acceptanceCriteria: "Required",
        evidenceExpectations: "Mandatory inspection evidence",
        required: true,
        ordering: 3,
      });
      await attachRequirementSourceBlock(actorId, missing.id, baseBlockId);
      await expect(
        buildEvidenceBundleV1(actorId, obligationAId),
      ).rejects.toMatchObject({
        code: "REQUIRED_EVIDENCE_MISSING",
      });
    }, 90_000);

    it("smoke-tests authorized private PDF extraction, signed access, and protected reads", async () => {
      const bytes = await createPdfBytes();
      uploadedStorageKey = `integration/${runId}/extraction.pdf`;
      const upload = await createSupabaseAdminClient()
        .storage.from(EVIDENCE_BUCKET)
        .upload(uploadedStorageKey, bytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      expect(upload.error).toBeNull();
      const document = await db.document.create({
        data: {
          dealId: dealAId,
          uploadedById: actorId,
          documentType: "INSPECTION_REPORT",
          originalFilename: "synthetic-extraction.pdf",
          mimeType: "application/pdf",
          byteSize: bytes.byteLength,
          contentHash: hash(bytes),
          storageObjectKey: uploadedStorageKey,
          status: "READY_FOR_EXTRACTION",
        },
      });
      await extractPrivatePdf(document.id, actorId);
      const extracted = await db.document.findUniqueOrThrow({
        where: { id: document.id },
      });
      const blocks = await getDocumentSourceBlocks(document.id, actorId);
      expect(extracted.status).toBe("EXTRACTED");
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0]?.pageNumber).toBe(1);
      expect(blocks.map((block) => block.normalizedText).join(" ")).toContain(
        "316L",
      );
      await expect(
        getDocumentSourceBlocks(document.id, otherActorId),
      ).rejects.toThrow();
      await expect(
        getDocumentSourceBlocks(document.id, unauthenticatedActorId),
      ).rejects.toThrow();

      const adminStorage = createSupabaseAdminClient().storage;
      const bucket = (await adminStorage.listBuckets()).data?.find(
        (entry) => entry.name === EVIDENCE_BUCKET,
      );
      expect(bucket?.public).toBe(false);
      const signed = await retryTransient(
        () =>
          adminStorage
            .from(EVIDENCE_BUCKET)
            .createSignedUrl(uploadedStorageKey, 60),
        (result) => result.error?.message === "Gateway Timeout",
      );
      expect(signed.error).toBeNull();
      expect(signed.data?.signedUrl).toBeTruthy();
      const signedRead = await fetch(signed.data!.signedUrl);
      expect(signedRead.ok).toBe(true);

      const anonymousStorage = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      ).storage.from(EVIDENCE_BUCKET);
      const anonymousRead = await anonymousStorage.download(uploadedStorageKey);
      expect(anonymousRead.error).toBeTruthy();
    }, 90_000);
  },
);
