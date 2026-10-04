import "server-only";

import {
  EvidenceAuthorityLevel,
  EvidenceSourceMode,
  DocumentType,
  Prisma,
} from "@prisma/client";

import { prisma } from "../lib/prisma";
import { guards } from "./auth";
import type { AiEvaluationV1 } from "./evaluation-context";
import {
  canonicalUrlForPolicy,
  hashEvidenceAuthorityPolicyV1,
} from "../../genlayer/schemas/v2";

export const EVIDENCE_AUTHORITY_POLICY_VERSION = "1";

export class EvidenceAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * This intentionally measures source authority, not record integrity.
 * PREAGREED_EXTERNAL_SOURCE is a policy commitment only until a future judge
 * version independently retrieves and validates the source.
 */
export const effectiveAuthorityRank: Record<EvidenceAuthorityLevel, number> = {
  PARTY_UPLOADED: 0,
  PREAGREED_EXTERNAL_SOURCE: 0,
  SERVER_FETCH_VERIFIED: 0,
  COUNTERPARTY_ACKNOWLEDGED: 1,
  THIRD_PARTY_SIGNED: 2,
  ONCHAIN_VERIFIED: 3,
};

export function evidenceAuthoritySatisfies(
  actual: EvidenceAuthorityLevel,
  required: EvidenceAuthorityLevel,
) {
  return (
    effectiveAuthorityRank[actual] >= effectiveAuthorityRank[required] &&
    actual !== "PREAGREED_EXTERNAL_SOURCE" &&
    actual !== "SERVER_FETCH_VERIFIED"
  );
}

function defaultPolicy() {
  return {
    sourceMode: EvidenceSourceMode.PRIVATE_DOCUMENT,
    minimumAuthority: EvidenceAuthorityLevel.COUNTERPARTY_ACKNOWLEDGED,
    counterpartyAcknowledgementRequired: true,
    thirdPartySignatureRequired: false,
    validatorFetchIntended: false,
  };
}

export type EvidenceSourcePolicyInput = {
  requirementId: string;
  sourceMode: EvidenceSourceMode;
  minimumAuthority: EvidenceAuthorityLevel;
  allowedDomain?: string | null;
  exactUrl?: string | null;
  urlPattern?: string | null;
  expectedIssuer?: string | null;
  expectedDocumentType?: DocumentType | null;
  counterpartyAcknowledgementRequired?: boolean;
  thirdPartySignatureRequired?: boolean;
  validatorFetchIntended?: boolean;
  expectedContentHash?: string | null;
  expectedContentType?: string | null;
  extractionRule?: string | null;
};

function assertPolicyInput(input: EvidenceSourcePolicyInput) {
  if (input.minimumAuthority === "PARTY_UPLOADED")
    throw new EvidenceAuthorityError("PARTY_UPLOAD_NOT_DECISIVE");
  if (
    input.sourceMode === EvidenceSourceMode.EXTERNAL_URL &&
    !input.allowedDomain &&
    !input.exactUrl &&
    !input.urlPattern
  )
    throw new EvidenceAuthorityError("EXTERNAL_SOURCE_BINDING_REQUIRED");
  if (input.sourceMode === EvidenceSourceMode.EXTERNAL_URL) {
    if (!input.validatorFetchIntended)
      throw new EvidenceAuthorityError("VALIDATOR_FETCH_POLICY_REQUIRED");
    if (!input.exactUrl || !input.allowedDomain || !input.urlPattern)
      throw new EvidenceAuthorityError("EXTERNAL_SOURCE_EXACT_POLICY_REQUIRED");
    const canonical = canonicalUrlForPolicy(input.exactUrl);
    const url = new URL(canonical);
    if (url.hostname !== input.allowedDomain.toLowerCase())
      throw new EvidenceAuthorityError("SOURCE_HOST_MISMATCH");
    const allowedPath = input.urlPattern.startsWith("/")
      ? input.urlPattern
      : `/${input.urlPattern}`;
    if (!(
      url.pathname === allowedPath ||
      url.pathname.startsWith(`${allowedPath.replace(/\/$/, "")}/`)
    ))
      throw new EvidenceAuthorityError("SOURCE_PATH_MISMATCH");
    if (!input.expectedContentType || !input.extractionRule)
      throw new EvidenceAuthorityError("SOURCE_EXTRACTION_POLICY_REQUIRED");
  }
  if (
    input.thirdPartySignatureRequired &&
    input.minimumAuthority !== "THIRD_PARTY_SIGNED" &&
    input.minimumAuthority !== "ONCHAIN_VERIFIED"
  )
    throw new EvidenceAuthorityError("THIRD_PARTY_AUTHORITY_REQUIRED");
}

export async function setEvidenceSourcePolicy(
  actorId: string,
  obligationId: string,
  input: EvidenceSourcePolicyInput,
) {
  assertPolicyInput(input);
  const canonicalSourceUrl = input.exactUrl
    ? canonicalUrlForPolicy(input.exactUrl)
    : null;
  const sourcePolicyHash =
    input.sourceMode === EvidenceSourceMode.EXTERNAL_URL && canonicalSourceUrl
      ? hashEvidenceAuthorityPolicyV1({
          retrievalMode: "GET_TEXT",
          allowedHost: input.allowedDomain!.toLowerCase(),
          allowedPath: input.urlPattern!,
          expectedIssuer: input.expectedIssuer ?? undefined,
          expectedContentHash: input.expectedContentHash as
            `0x${string}` | undefined,
          expectedContentType: input.expectedContentType!,
          extractionRule: input.extractionRule!,
        })
      : null;
  const obligation = await prisma.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    include: { deal: true, requirements: { select: { id: true } } },
  });
  const access = await guards.requireDealAccess(actorId, obligation.dealId);
  if (
    !obligation.requirements.some(
      (requirement) => requirement.id === input.requirementId,
    )
  )
    throw new EvidenceAuthorityError("REQUIREMENT_OBLIGATION_MISMATCH");
  if (obligation.observedOnchainState)
    throw new EvidenceAuthorityError("EVIDENCE_SOURCE_POLICY_FROZEN");

  const existing = await prisma.evidenceSourcePolicy.findUnique({
    where: { requirementId: input.requirementId },
  });
  if (existing?.frozenAt)
    throw new EvidenceAuthorityError("EVIDENCE_SOURCE_POLICY_FROZEN");
  const policy = await prisma.evidenceSourcePolicy.upsert({
    where: {
      requirementId: input.requirementId,
    },
    create: {
      obligationId,
      requirementId: input.requirementId,
      policyVersion: EVIDENCE_AUTHORITY_POLICY_VERSION,
      sourceMode: input.sourceMode,
      minimumAuthority: input.minimumAuthority,
      allowedDomain: input.allowedDomain ?? null,
      exactUrl: input.exactUrl ?? null,
      urlPattern: input.urlPattern ?? null,
      expectedIssuer: input.expectedIssuer ?? null,
      expectedDocumentType: input.expectedDocumentType ?? null,
      counterpartyAcknowledgementRequired:
        input.counterpartyAcknowledgementRequired ?? false,
      thirdPartySignatureRequired: input.thirdPartySignatureRequired ?? false,
      validatorFetchIntended: input.validatorFetchIntended ?? false,
      sourcePolicyHash,
      canonicalSourceUrl,
      expectedContentHash: input.expectedContentHash ?? null,
      expectedContentType: input.expectedContentType ?? null,
      extractionRule: input.extractionRule ?? null,
    },
    update: {
      sourceMode: input.sourceMode,
      minimumAuthority: input.minimumAuthority,
      allowedDomain: input.allowedDomain ?? null,
      exactUrl: input.exactUrl ?? null,
      urlPattern: input.urlPattern ?? null,
      expectedIssuer: input.expectedIssuer ?? null,
      expectedDocumentType: input.expectedDocumentType ?? null,
      counterpartyAcknowledgementRequired:
        input.counterpartyAcknowledgementRequired ?? false,
      thirdPartySignatureRequired: input.thirdPartySignatureRequired ?? false,
      validatorFetchIntended: input.validatorFetchIntended ?? false,
      sourcePolicyHash,
      canonicalSourceUrl,
      expectedContentHash: input.expectedContentHash ?? null,
      expectedContentType: input.expectedContentType ?? null,
      extractionRule: input.extractionRule ?? null,
    },
  });
  await prisma.auditEvent.create({
    data: {
      actorId,
      organizationId: access.organizationId,
      action: "EVIDENCE_SOURCE_POLICY_SET",
      targetType: "EvidenceSourcePolicy",
      targetId: policy.id,
      metadata: { obligationId, requirementId: input.requirementId },
    },
  });
  return policy;
}

/** Freeze every mandatory-requirement policy after on-chain creation. Missing
 * policies receive the conservative private-document acknowledgement default. */
export async function freezeEvidenceSourcePoliciesForObligation(
  obligationId: string,
  database: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const obligation = await database.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    include: {
      requirements: { where: { required: true }, select: { id: true } },
    },
  });
  const frozenAt = new Date();
  for (const requirement of obligation.requirements) {
    await database.evidenceSourcePolicy.upsert({
      where: {
        requirementId: requirement.id,
      },
      create: {
        obligationId,
        requirementId: requirement.id,
        policyVersion: EVIDENCE_AUTHORITY_POLICY_VERSION,
        ...defaultPolicy(),
        frozenAt,
      },
      update: { frozenAt },
    });
  }
}

function participantOrganizations(input: {
  organizationId: string;
  participants: Array<{ organizationId: string }>;
}) {
  return [
    ...new Set([
      input.organizationId,
      ...input.participants.map((item) => item.organizationId),
    ]),
  ];
}

export async function acknowledgeEvidenceAuthority(
  actorId: string,
  evidenceId: string,
) {
  const evidence = await prisma.evidence.findUniqueOrThrow({
    where: { id: evidenceId },
    include: {
      document: true,
      obligation: { include: { deal: { include: { participants: true } } } },
    },
  });
  if (!evidence.document)
    throw new EvidenceAuthorityError("EVIDENCE_DOCUMENT_REQUIRED");
  if (evidence.contentHash !== evidence.document.contentHash)
    throw new EvidenceAuthorityError("EVIDENCE_DOCUMENT_HASH_MISMATCH");
  const access = await guards.requireDealAccess(
    actorId,
    evidence.obligation.dealId,
  );
  const organizationIds = participantOrganizations(evidence.obligation.deal);
  if (!organizationIds.includes(access.organizationId))
    throw new EvidenceAuthorityError(
      "ACKNOWLEDGING_ORGANIZATION_NOT_PARTICIPANT",
    );
  const uploaderOrganizations = await prisma.organizationMember.findMany({
    where: {
      userId: evidence.document.uploadedById,
      organizationId: { in: organizationIds },
    },
    select: { organizationId: true },
  });
  const uploaderOrgIds = [
    ...new Set(uploaderOrganizations.map((item) => item.organizationId)),
  ];
  if (uploaderOrgIds.length !== 1)
    throw new EvidenceAuthorityError("EVIDENCE_ORIGIN_ORGANIZATION_AMBIGUOUS");
  if (uploaderOrgIds[0] === access.organizationId)
    throw new EvidenceAuthorityError("COUNTERPARTY_ACKNOWLEDGEMENT_REQUIRED");
  const existing = await prisma.evidenceAuthorityAcknowledgement.findUnique({
    where: {
      evidenceId_acknowledgingOrganizationId: {
        evidenceId,
        acknowledgingOrganizationId: access.organizationId,
      },
    },
    select: { id: true },
  });
  if (existing)
    throw new EvidenceAuthorityError("ACKNOWLEDGEMENT_ALREADY_EXISTS");

  try {
    const acknowledgement = await prisma.$transaction(async (tx) => {
      const created = await tx.evidenceAuthorityAcknowledgement.create({
        data: {
          obligationId: evidence.obligationId,
          evidenceId,
          documentContentHash: evidence.document!.contentHash,
          acknowledgingOrganizationId: access.organizationId,
          acknowledgingUserId: actorId,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId,
          organizationId: access.organizationId,
          action: "EVIDENCE_AUTHORITY_ACKNOWLEDGED",
          targetType: "Evidence",
          targetId: evidenceId,
          metadata: {
            obligationId: evidence.obligationId,
            documentContentHash: evidence.document!.contentHash,
          },
        },
      });
      return created;
    });
    return acknowledgement;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new EvidenceAuthorityError("ACKNOWLEDGEMENT_ALREADY_EXISTS");
    throw error;
  }
}

function evaluatedRequirements(evaluation: AiEvaluationV1) {
  return evaluation.requirements.filter(
    (requirement) =>
      requirement.result === "SATISFIED" ||
      requirement.result === "NOT_SATISFIED",
  );
}

export async function assertDecisiveEvidenceAuthority(
  obligationId: string,
  evaluation: AiEvaluationV1,
) {
  const obligation = await prisma.obligation.findUniqueOrThrow({
    where: { id: obligationId },
    include: {
      requirements: { include: { evidenceSourcePolicy: true } },
      evidence: {
        include: {
          document: true,
          sourceLinks: { include: { sourceBlock: true } },
          acknowledgements: true,
        },
      },
    },
  });
  const mandatory = new Map(
    obligation.requirements
      .filter((item) => item.required)
      .map((item) => [item.id, item]),
  );
  const evidenceBySourceHash = new Map<string, typeof obligation.evidence>();
  for (const evidence of obligation.evidence) {
    for (const link of evidence.sourceLinks) {
      const linked =
        evidenceBySourceHash.get(link.sourceBlock.contentHash) ?? [];
      linked.push(evidence);
      evidenceBySourceHash.set(link.sourceBlock.contentHash, linked);
    }
  }

  const insufficient: string[] = [];
  for (const finding of evaluatedRequirements(evaluation)) {
    const requirement = mandatory.get(finding.requirementId);
    if (!requirement) continue;
    const policy = requirement.evidenceSourcePolicy ?? defaultPolicy();
    const citedHashes = [
      ...new Set(
        finding.claims.flatMap((claim) =>
          claim.citations.map((citation) => citation.sourceBlockHash),
        ),
      ),
    ];
    const authoritySatisfied = citedHashes.some((sourceHash) =>
      (evidenceBySourceHash.get(sourceHash) ?? []).some((evidence) => {
        const acknowledged = evidence.acknowledgements.some(
          (acknowledgement) =>
            acknowledgement.documentContentHash ===
            evidence.document?.contentHash,
        );
        const actual = acknowledged
          ? EvidenceAuthorityLevel.COUNTERPARTY_ACKNOWLEDGED
          : evidence.authorityLevel;
        return evidenceAuthoritySatisfies(actual, policy.minimumAuthority);
      }),
    );
    if (!authoritySatisfied) insufficient.push(requirement.requirementKey);
  }
  if (insufficient.length)
    throw new EvidenceAuthorityError("EVIDENCE_AUTHORITY_INSUFFICIENT");
  return true;
}
