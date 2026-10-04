import "server-only";

import { prisma } from "../lib/prisma";

/** Approved commercial terms are append-only; a new version supersedes them. */
export function assertAgreementIsMutable(
  status: "DRAFT" | "APPROVED" | "SUPERSEDED",
) {
  if (status !== "DRAFT") {
    throw new Error("Agreement versions are immutable after approval.");
  }
}

export async function approveAgreementVersion(agreementId: string) {
  const agreement = await prisma.agreement.findUniqueOrThrow({
    where: { id: agreementId },
  });
  assertAgreementIsMutable(agreement.status);
  return prisma.agreement.update({
    where: { id: agreementId },
    data: { status: "APPROVED", effectiveAt: new Date() },
  });
}
