import { randomUUID } from "node:crypto";

import { EvidenceAuthorityLevel, EvidenceSourceMode } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma";
import {
  acknowledgeEvidenceAuthority,
  assertDecisiveEvidenceAuthority,
  setEvidenceSourcePolicy,
} from "../../src/server/evidence-authority";
import type { AiEvaluationV1 } from "../../src/server/evaluation-context";

const enabled = process.env.RUN_RC5_EVIDENCE_AUTHORITY_INTEGRATION === "1";
const integration = enabled ? describe : describe.skip;
const runId = `rc5-authority-${randomUUID()}`;

let buyerId = "";
let supplierId = "";
let outsiderId = "";
let buyerOrgId = "";
let supplierOrgId = "";
let outsiderOrgId = "";
let dealId = "";
let obligationId = "";
let requirementId = "";
let evidenceId = "";
let sourceBlockHash = "";

const evidenceDocumentHash = `sha256:${"a".repeat(64)}`;

function decisiveEvaluation(): AiEvaluationV1 {
  return {
    schemaVersion: "1",
    evaluationContextHash: `sha256:${"b".repeat(64)}`,
    requirements: [
      {
        requirementId,
        result: "SATISFIED",
        explanation: "Synthetic authority check",
        claims: [
          {
            claim: "Measurement supports the requirement.",
            citations: [
              {
                sourceBlockHash,
                documentContentHash: evidenceDocumentHash,
                pageNumber: 1,
                blockOrder: 1,
                documentType: "INSPECTION_REPORT",
              },
            ],
          },
        ],
      },
    ],
  };
}

integration("RC5 real Supabase evidence authority", () => {
  beforeAll(async () => {
    const [buyer, supplier, outsider] = await Promise.all(
      ["buyer", "supplier", "outsider"].map((role) =>
        prisma.user.create({
          data: {
            authSubject: `${runId}-${role}`,
            email: `${runId}-${role}@example.test`,
          },
        }),
      ),
    );
    buyerId = buyer.id;
    supplierId = supplier.id;
    outsiderId = outsider.id;
    const [buyerOrg, supplierOrg, outsiderOrg] = await Promise.all(
      ["buyer", "supplier", "outsider"].map((role) =>
        prisma.organization.create({
          data: { name: `${runId} ${role}`, slug: `${runId}-${role}` },
        }),
      ),
    );
    buyerOrgId = buyerOrg.id;
    supplierOrgId = supplierOrg.id;
    outsiderOrgId = outsiderOrg.id;
    await prisma.organizationMember.createMany({
      data: [
        { organizationId: buyerOrgId, userId: buyerId, role: "OWNER" },
        { organizationId: supplierOrgId, userId: supplierId, role: "OWNER" },
        { organizationId: outsiderOrgId, userId: outsiderId, role: "OWNER" },
      ],
    });
    const deal = await prisma.deal.create({
      data: {
        organizationId: buyerOrgId,
        reference: runId,
        title: "Synthetic RC5 authority dossier",
        buyerOrganizationRef: "Buyer",
        supplierOrganizationRef: "Supplier",
        createdById: buyerId,
        participants: {
          create: [
            { organizationId: buyerOrgId, role: "BUYER" },
            { organizationId: supplierOrgId, role: "SUPPLIER" },
          ],
        },
      },
    });
    dealId = deal.id;
    const agreement = await prisma.agreement.create({
      data: {
        dealId,
        version: 1,
        status: "APPROVED",
        agreementHash: `0x${"1".repeat(64)}`,
        createdById: buyerId,
      },
    });
    const obligation = await prisma.obligation.create({
      data: {
        dealId,
        agreementId: agreement.id,
        createdById: buyerId,
        buyerWallet: "0x1111111111111111111111111111111111111111",
        supplierWallet: "0x2222222222222222222222222222222222222222",
        amount: 1,
        tokenAddress: "0x3333333333333333333333333333333333333333",
        tokenDecimals: 6,
        xLayerChainId: 1952,
        xLayerEscrow: "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
        xLayerObligationId: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
        toleranceCaseId: `0x${"2".repeat(64)}`,
        agreementHash: agreement.agreementHash,
        policyHash: `0x${"3".repeat(64)}`,
      },
    });
    obligationId = obligation.id;
    const requirement = await prisma.requirement.create({
      data: {
        obligationId,
        requirementKey: "R-AUTH-1",
        title: "Authoritative inspection evidence",
        description: "Synthetic",
        category: "QUALITY",
        governingSourceRef: "Synthetic",
        acceptanceCriteria: "Verified inspection measurement",
        evidenceExpectations: "Inspection report",
        required: true,
        ordering: 1,
      },
    });
    requirementId = requirement.id;
    const document = await prisma.document.create({
      data: {
        dealId,
        uploadedById: supplierId,
        documentType: "INSPECTION_REPORT",
        originalFilename: "synthetic-inspection.pdf",
        mimeType: "application/pdf",
        byteSize: 1,
        contentHash: evidenceDocumentHash,
        storageObjectKey: `integration/${runId}/inspection`,
        status: "EXTRACTED",
      },
    });
    const block = await prisma.sourceBlock.create({
      data: {
        documentId: document.id,
        pageNumber: 1,
        blockOrder: 1,
        normalizedText: "Measured diameter: 50.10 mm",
        sourceLocator: "page:1:block:1",
        contentHash: `sha256:${"c".repeat(64)}`,
        extractionVersion: "rc5-integration-v1",
      },
    });
    sourceBlockHash = block.contentHash;
    const evidence = await prisma.evidence.create({
      data: {
        obligationId,
        documentId: document.id,
        contentHash: evidenceDocumentHash,
        bundleHash: `sha256:${"d".repeat(64)}`,
        sourceLinks: { create: { sourceBlockId: block.id } },
        requirementLinks: { create: { requirementId } },
      },
    });
    evidenceId = evidence.id;
  }, 60_000);

  afterAll(async () => {
    if (dealId) {
      await prisma.auditEvent.deleteMany({
        where: { organizationId: { in: [buyerOrgId, supplierOrgId] } },
      });
      await prisma.obligation.deleteMany({ where: { dealId } });
      await prisma.document.deleteMany({ where: { dealId } });
      await prisma.agreement.deleteMany({ where: { dealId } });
      await prisma.deal.delete({ where: { id: dealId } });
    }
    await prisma.organization.deleteMany({
      where: { id: { in: [buyerOrgId, supplierOrgId, outsiderOrgId] } },
    });
    await prisma.$disconnect();
  });

  it("keeps a party upload non-decisive until the counterparty acknowledges its exact hash", async () => {
    await setEvidenceSourcePolicy(buyerId, obligationId, {
      requirementId,
      sourceMode: EvidenceSourceMode.PRIVATE_DOCUMENT,
      minimumAuthority: EvidenceAuthorityLevel.COUNTERPARTY_ACKNOWLEDGED,
      counterpartyAcknowledgementRequired: true,
    });
    await expect(
      assertDecisiveEvidenceAuthority(obligationId, decisiveEvaluation()),
    ).rejects.toMatchObject({ code: "EVIDENCE_AUTHORITY_INSUFFICIENT" });
    const acknowledgement = await acknowledgeEvidenceAuthority(
      buyerId,
      evidenceId,
    );
    expect(acknowledgement.documentContentHash).toBe(evidenceDocumentHash);
    await expect(
      assertDecisiveEvidenceAuthority(obligationId, decisiveEvaluation()),
    ).resolves.toBe(true);
  });

  it("rejects same-organization, unrelated, and replayed acknowledgement attempts", async () => {
    await expect(
      acknowledgeEvidenceAuthority(supplierId, evidenceId),
    ).rejects.toMatchObject({ code: "COUNTERPARTY_ACKNOWLEDGEMENT_REQUIRED" });
    await expect(
      acknowledgeEvidenceAuthority(outsiderId, evidenceId),
    ).rejects.toThrow();
    await expect(
      acknowledgeEvidenceAuthority(buyerId, evidenceId),
    ).rejects.toMatchObject({ code: "ACKNOWLEDGEMENT_ALREADY_EXISTS" });
  });

  it("does not let an acknowledgement follow a different document hash and freezes policy after binding", async () => {
    const document = await prisma.document.create({
      data: {
        dealId,
        uploadedById: supplierId,
        documentType: "INSPECTION_REPORT",
        originalFilename: "changed-inspection.pdf",
        mimeType: "application/pdf",
        byteSize: 1,
        contentHash: `sha256:${"e".repeat(64)}`,
        storageObjectKey: `integration/${runId}/changed`,
        status: "EXTRACTED",
      },
    });
    const evidence = await prisma.evidence.create({
      data: {
        obligationId,
        documentId: document.id,
        contentHash: document.contentHash,
        bundleHash: `sha256:${"f".repeat(64)}`,
      },
    });
    expect(
      await prisma.evidenceAuthorityAcknowledgement.count({
        where: { evidenceId: evidence.id },
      }),
    ).toBe(0);
    await prisma.obligation.update({
      where: { id: obligationId },
      data: { observedOnchainState: "CREATED" },
    });
    await expect(
      setEvidenceSourcePolicy(buyerId, obligationId, {
        requirementId,
        sourceMode: EvidenceSourceMode.PRIVATE_DOCUMENT,
        minimumAuthority: EvidenceAuthorityLevel.THIRD_PARTY_SIGNED,
      }),
    ).rejects.toMatchObject({ code: "EVIDENCE_SOURCE_POLICY_FROZEN" });
  });
});
