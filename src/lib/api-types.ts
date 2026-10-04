/**
 * The wire contract between the Express API and the browser.
 *
 * Every response shape the API produces is declared here exactly once and
 * consumed by both sides, so a handler and the loader that reads it cannot
 * drift apart. This module is intentionally dependency-free: it must stay
 * importable from the browser bundle as well as the server, so it may not
 * reach into `src/server`, Prisma, or any `server-only` module.
 */

/** The commercial actions a party may authorize on X Layer. */
export type CommercialAction =
  | "CREATE_OBLIGATION"
  | "ACCEPT_OBLIGATION"
  | "APPROVE_TOKEN"
  | "FUND_OBLIGATION"
  | "COMMIT_EVIDENCE"
  | "CHALLENGE_OUTCOME"
  | "FINALIZE_UNCONTESTED"
  | "REFUND_EVIDENCE_TIMEOUT";

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

export type AuthFormState = { ok?: boolean; message?: string };

export type SignInResponse = {
  ok: boolean;
  redirectTo: string | null;
};

export type SignUpResponse = {
  ok: boolean;
  redirectTo: string | null;
  message: string | null;
};

export type PasswordRecoveryResponse = { ok: boolean; message: string };

export type SignOutResponse = { ok: boolean; redirectTo: string };

/** A provider handshake the browser should follow. */
export type OAuthStartResponse = { ok: boolean; url: string };

export type SetEmailResponse = { ok: boolean; message: string };

/* -------------------------------------------------------------------------- */
/* Workspace shell and summary                                                */
/* -------------------------------------------------------------------------- */

export type WorkspaceShell = {
  organization: string;
  user: string;
  wallet: string | null;
  needsOnboarding: boolean;
  /**
   * False for accounts that have no confirmed address yet, such as a wallet
   * sign-in. Counterparty invitations are bound to an email, so the workspace
   * gates on this rather than letting such an account discover the gap later.
   */
  emailVerified: boolean;
};

export type WorkspaceMetrics = {
  deals: number;
  obligations: number;
  awaitingWallet: number;
  adjudications: number;
};

export type WorkspaceSummary =
  | { needsOnboarding: true }
  | {
      needsOnboarding: false;
      metrics: WorkspaceMetrics;
      workflows: Array<{
        id: string;
        workflowStatus: string | null;
        dealTitle: string;
      }>;
      events: Array<{ id: string; action: string; createdAt: string }>;
    };

export type CreateOrganizationResponse = {
  ok: boolean;
  organizationId: string;
  requestedNext: string | null;
};

/* -------------------------------------------------------------------------- */
/* Deals and obligations                                                       */
/* -------------------------------------------------------------------------- */

export type DealSummary = {
  id: string;
  reference: string;
  title: string;
  supplierOrganizationRef: string;
  agreementStatus: string | null;
  obligationCount: number;
  updatedAt: string;
};

export type DealsResponse =
  | { needsOnboarding: true; deals: [] }
  | { needsOnboarding: false; deals: DealSummary[] };

export type DealParticipant = {
  organizationId: string;
  organizationName: string;
  role: string;
};

export type RequirementView = {
  id: string;
  title: string;
  acceptanceCriteria: string;
  evidenceExpectations: string;
};

export type DealView = {
  id: string;
  reference: string;
  title: string;
  buyerOrganizationRef: string;
  supplierOrganizationRef: string;
  agreementStatus: string | null;
  participants: DealParticipant[];
  agreements: Array<{
    id: string;
    version: number;
    status: string;
    amendments: Array<{
      id: string;
      status: string;
      version: number;
      precedence: number;
    }>;
  }>;
  documents: Array<{
    id: string;
    originalFilename: string;
    documentType: string;
    status: string;
    contentHash: string;
    sourceBlockCount: number;
  }>;
  obligations: Array<{
    id: string;
    xLayerObligationId: string;
    localStatus: string;
    evidenceCount: number;
    adjudicationCaseId: string | null;
    requirements: RequirementView[];
  }>;
};

export type CreateDealResponse = { ok: boolean; dealId: string };

export type CreateInvitationResponse = {
  ok: boolean;
  invitationUrl: string;
};

export type RequirementEvaluation = {
  requirementId: string;
  result: string;
  explanation: string;
  claims: Array<{ text?: string; citations?: string[] }>;
};

export type EvidenceProvenance = {
  normalizedText: string;
  pageNumber: number | null;
  blockOrder: number;
};

export type EvidenceView = {
  id: string;
  status: string;
  authorityLevel: string;
  acknowledged: boolean;
  documentFilename: string | null;
  provenance: EvidenceProvenance | null;
};

export type ObligationView = {
  id: string;
  dealId: string;
  xLayerObligationId: string;
  amount: string;
  localStatus: string;
  observedOnchainState: string | null;
  role: string | null;
  counterpartyWallet: string;
  actions: CommercialAction[];
  adjudicationCaseId: string | null;
  packet: { disputePacketHash: string; canonicalJson: string } | null;
  pendingSubmission: {
    intentId: string;
    action: string;
    transactionHash: string;
  } | null;
  evaluation: RequirementEvaluation[];
  requirements: RequirementView[];
  evidence: EvidenceView[];
};

export type CreateObligationResponse = { ok: boolean; obligationId: string };

/** A frozen X Layer call the wallet is expected to sign. */
export type PreparedCommercialAction = {
  intentId: string;
  chainId: number;
  to: string;
  data: string;
  method: string;
  obligationId: string;
  expectedWallet: string | null;
  amount: string;
};

export type AcknowledgeEvidenceResponse = { ok: boolean };

/* -------------------------------------------------------------------------- */
/* Disputes                                                                   */
/* -------------------------------------------------------------------------- */

export type DisputeSummary = {
  id: string;
  xLayerObligationId: string;
  dealTitle: string;
  workflowStatus: string | null;
  lifecycle: string | null;
  updatedAt: string;
};

export type DisputesResponse = { disputes: DisputeSummary[] };

export type DisputeView = {
  id: string;
  workflowVersion: number;
  workflowStatus: string;
  lifecycle: string | null;
  caseId: string;
  disputePacketHash: string;
  judgeAddress: string;
  xLayerDisputeTxHash: string | null;
  deal: { id: string; title: string };
  obligation: {
    id: string;
    xLayerObligationId: string;
    buyerWallet: string;
  };
  observation: { verdict: string } | null;
  settlementVerification: {
    signatureCount: number;
    threshold: number;
    status: string;
  } | null;
  settlement: { status: string; transactionHash: string | null } | null;
};

export type StartDisputeResponse = {
  ok: boolean;
  workflowId: string;
  reused: boolean;
};

export type PreparedDisputeTransaction = {
  to: string;
  data: string;
};

export type PreparedDisputeResponse = {
  workflowVersion: number;
  transaction: PreparedDisputeTransaction;
};

/* -------------------------------------------------------------------------- */
/* Account, activity and invitations                                          */
/* -------------------------------------------------------------------------- */

export type AccountView = {
  displayName: string | null;
  email: string | null;
  organizations: Array<{ id: string; name: string; role: string }>;
  wallets: Array<{ id: string; address: string }>;
};

export type ActivityEvent = {
  id: string;
  action: string;
  targetType: string;
  createdAt: string;
};

export type ActivityResponse = { events: ActivityEvent[] };

export type WalletChallenge = { id: string; message: string };

export type InvitationView = {
  deal: { id: string; title: string; reference: string };
  invitingOrganizationName: string;
  expiresAt: string;
  viewer: {
    signedIn: boolean;
    organizations: Array<{ id: string; name: string }>;
  };
};

export type AcceptInvitationResponse = { ok: boolean; dealId: string };