export const requirementStatuses = [
  "SATISFIED",
  "NOT_SATISFIED",
  "INSUFFICIENT_EVIDENCE",
  "CONTRADICTORY_EVIDENCE",
  "HUMAN_REVIEW_REQUIRED",
] as const;

export type RequirementStatus = (typeof requirementStatuses)[number];

export const obligationStates = [
  "DRAFT",
  "PENDING_ACCEPTANCE",
  "ACCEPTED",
  "FUNDED",
  "EVIDENCE_LOCKED",
  "VERDICT_PROPOSED",
  "DISPUTED",
  "SETTLED",
  "REFUNDED",
  "CANCELLED",
] as const;

export type ObligationState = (typeof obligationStates)[number];

const allowedTransitions: Readonly<
  Record<ObligationState, readonly ObligationState[]>
> = {
  DRAFT: ["PENDING_ACCEPTANCE", "CANCELLED"],
  PENDING_ACCEPTANCE: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["FUNDED", "CANCELLED"],
  FUNDED: ["EVIDENCE_LOCKED", "REFUNDED"],
  EVIDENCE_LOCKED: ["VERDICT_PROPOSED", "DISPUTED"],
  VERDICT_PROPOSED: ["SETTLED", "REFUNDED", "DISPUTED"],
  DISPUTED: ["SETTLED", "REFUNDED"],
  SETTLED: [],
  REFUNDED: [],
  CANCELLED: [],
};

export function canTransitionObligation(
  from: ObligationState,
  to: ObligationState,
): boolean {
  return allowedTransitions[from].includes(to);
}

export const outcomeKinds = [
  "RELEASE_AUTHORISED_AMOUNT",
  "REFUND_FULL",
  "RESOLVER_SPLIT",
] as const;
export type OutcomeKind = (typeof outcomeKinds)[number];

export function isAutomaticOutcome(kind: OutcomeKind): boolean {
  return kind !== "RESOLVER_SPLIT";
}
