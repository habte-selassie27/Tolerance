import "server-only";

export type OperationalEvent = {
  event: string;
  requestId?: string;
  workflowId?: string;
  dealId?: string;
  obligationId?: string;
  caseId?: string;
  packetHash?: string;
  transactionHash?: string;
  workflowStatus?: string;
  failureCode?: string;
};

/**
 * Structured, allow-listed operational logging. Never pass packet bodies,
 * evidence, credentials, provider payloads, or wallet material to this API.
 */
export function logOperationalEvent(event: OperationalEvent) {
  console.info(JSON.stringify({ component: "tolerance", ...event }));
}
