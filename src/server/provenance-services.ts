import "server-only";
import { prisma } from "../lib/prisma";
import { guards } from "./auth";

export async function createRequirement(
  actorId: string,
  input: {
    obligationId: string;
    requirementKey: string;
    title: string;
    description: string;
    category: string;
    governingSourceRef: string;
    acceptanceCriteria: string;
    evidenceExpectations: string;
    required: boolean;
    ordering: number;
  },
) {
  const obligation = await prisma.obligation.findUniqueOrThrow({
    where: { id: input.obligationId },
    include: { deal: true },
  });
  const access = await guards.requireDealAccess(actorId, obligation.dealId);
  const requirement = await prisma.requirement.create({ data: input });
  await audit(
    actorId,
    access.organizationId,
    "REQUIREMENT_CREATED",
    "Requirement",
    requirement.id,
  );
  return requirement;
}
export async function attachRequirementSourceBlock(
  actorId: string,
  requirementId: string,
  sourceBlockId: string,
  precedence = 0,
) {
  const req = await prisma.requirement.findUniqueOrThrow({
    where: { id: requirementId },
    include: { obligation: { include: { deal: true } } },
  });
  const block = await prisma.sourceBlock.findUniqueOrThrow({
    where: { id: sourceBlockId },
    include: { document: true },
  });
  const access = await guards.requireDealAccess(actorId, req.obligation.dealId);
  if (
    block.document.dealId !== req.obligation.dealId ||
    block.document.status !== "EXTRACTED"
  )
    throw new Error("Invalid governing source");
  const link = await prisma.requirementSourceBlock.upsert({
    where: { requirementId_sourceBlockId: { requirementId, sourceBlockId } },
    create: { requirementId, sourceBlockId, precedence },
    update: { precedence },
  });
  await audit(
    actorId,
    access.organizationId,
    "REQUIREMENT_SOURCE_ATTACHED",
    "RequirementSourceBlock",
    `${requirementId}:${sourceBlockId}`,
  );
  return link;
}
export async function linkEvidenceToRequirement(
  actorId: string,
  evidenceId: string,
  requirementId: string,
) {
  const [e, r] = await Promise.all([
    prisma.evidence.findUniqueOrThrow({
      where: { id: evidenceId },
      include: { obligation: { include: { deal: true } } },
    }),
    prisma.requirement.findUniqueOrThrow({
      where: { id: requirementId },
      include: { obligation: true },
    }),
  ]);
  const access = await guards.requireDealAccess(actorId, e.obligation.dealId);
  if (e.obligationId !== r.obligationId)
    throw new Error("Cross-obligation evidence mapping rejected");
  const link = await prisma.evidenceRequirement.upsert({
    where: { evidenceId_requirementId: { evidenceId, requirementId } },
    create: { evidenceId, requirementId },
    update: {},
  });
  await audit(
    actorId,
    access.organizationId,
    "EVIDENCE_REQUIREMENT_LINKED",
    "EvidenceRequirement",
    `${evidenceId}:${requirementId}`,
  );
  return link;
}
export async function linkEvidenceSourceBlock(
  actorId: string,
  evidenceId: string,
  sourceBlockId: string,
) {
  const evidence = await prisma.evidence.findUniqueOrThrow({
    where: { id: evidenceId },
    include: { obligation: { include: { deal: true } } },
  });
  const block = await prisma.sourceBlock.findUniqueOrThrow({
    where: { id: sourceBlockId },
    include: { document: true },
  });
  const access = await guards.requireDealAccess(
    actorId,
    evidence.obligation.dealId,
  );
  if (block.document.dealId !== evidence.obligation.dealId)
    throw new Error("Cross-deal source mapping rejected");
  const link = await prisma.evidenceSourceBlock.upsert({
    where: { evidenceId_sourceBlockId: { evidenceId, sourceBlockId } },
    create: { evidenceId, sourceBlockId },
    update: {},
  });
  await audit(
    actorId,
    access.organizationId,
    "EVIDENCE_SOURCE_ATTACHED",
    "EvidenceSourceBlock",
    `${evidenceId}:${sourceBlockId}`,
  );
  return link;
}

export async function resolveEffectiveGoverningSources(requirementId: string) {
  const requirement = await prisma.requirement.findUniqueOrThrow({
    where: { id: requirementId },
    include: {
      obligation: {
        include: {
          agreement: {
            include: {
              amendments: {
                include: { document: true },
                orderBy: [{ precedence: "desc" }, { version: "desc" }],
              },
            },
          },
        },
      },
      governingSources: {
        include: { sourceBlock: { include: { document: true } } },
        orderBy: { precedence: "asc" },
      },
    },
  });
  const amendmentDocumentIds = new Set(
    requirement.obligation.agreement.amendments
      .map((a) => a.documentId)
      .filter(Boolean),
  );
  const approvedDocumentIds = new Set(
    requirement.obligation.agreement.amendments
      .filter((a) => a.status === "APPROVED")
      .map((a) => a.documentId)
      .filter(Boolean),
  );
  const amendments = requirement.governingSources.filter((link) =>
    approvedDocumentIds.has(link.sourceBlock.documentId),
  );
  const base = requirement.governingSources.filter(
    (link) => !amendmentDocumentIds.has(link.sourceBlock.documentId),
  );
  return {
    requirement,
    base,
    amendments,
    effective: amendments[0] ?? base.at(-1) ?? null,
  };
}

async function audit(
  actorId: string,
  organizationId: string,
  action: string,
  targetType: string,
  targetId: string,
) {
  return prisma.auditEvent.create({
    data: {
      actorId,
      organizationId,
      action,
      targetType,
      targetId,
      metadata: {},
    },
  });
}
