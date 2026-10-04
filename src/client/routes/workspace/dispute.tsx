import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

import { apiLoad, jsonBody, submit } from "../../lib/api";
import { WalletDispute } from "./wallet-dispute";

type DisputeView = {
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

export function loader({ params }: LoaderFunctionArgs) {
  return apiLoad<DisputeView>(`/api/disputes/${params.workflowId}`);
}

export default function DisputeRoute() {
  const workflow = useLoaderData<typeof loader>();
  const status = workflow.workflowStatus;
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Commercial dispute</p>
          <h1>{workflow.deal.title}</h1>
          <p>
            Obligation {workflow.obligation.xLayerObligationId} ·{" "}
            {humanWorkflowStatus(status)}
          </p>
        </div>
        <Link
          to={`/app/deals/${workflow.deal.id}/obligations/${workflow.obligation.id}`}
          className="button secondary"
        >
          Back to obligation
        </Link>
      </header>
      <div className="dispute-layout">
        <section
          className="timeline panel dispute-timeline"
          aria-label="Dispute lifecycle"
        >
          <p className="eyebrow">Lifecycle</p>
          <Timeline label="Packet prepared" complete />
          <Timeline
            label="Dispute entered on X Layer"
            complete={status !== "PACKET_READY"}
            active={
              status === "PACKET_READY" || status === "XLAYER_BINDING_PENDING"
            }
          />
          <Timeline
            label="X Layer confirmed"
            complete={notBefore(status, "XLAYER_DISPUTE_CONFIRMED")}
          />
          <Timeline
            label="Submitted to GenLayer"
            complete={notBefore(status, "GENLAYER_SUBMITTED")}
          />
          <Timeline
            label="Adjudication finalized"
            complete={Boolean(workflow.observation)}
          />
          <Timeline
            label="Independent settlement verification"
            active={
              status === "ATTESTATION_BLOCKED" ||
              status === "ATTESTATION_PENDING"
            }
            complete={status === "ATTESTATION_READY"}
          />
          <Timeline
            label="Settlement"
            active={
              status === "SETTLEMENT_PENDING" ||
              status === "SETTLEMENT_SUBMITTED"
            }
            complete={status === "SETTLED" || status === "REFUNDED"}
          />
        </section>
        <div className="dispute-center">
          {status === "PACKET_READY" && (
            <section className="panel">
              <h2>Enter dispute</h2>
              <p>
                You are entering this obligation into dispute. Tolerance will
                use the frozen packet committed to this workflow.
              </p>
              <WalletDispute
                workflowId={workflow.id}
                workflowVersion={workflow.workflowVersion}
                expectedParty={workflow.obligation.buyerWallet}
              />
            </section>
          )}
          {status === "XLAYER_BINDING_PENDING" && (
            <section className="notice">
              <h2>Waiting for X Layer confirmation</h2>
              <p>
                Tolerance will not submit to GenLayer until escrow confirms the
                exact dispute packet commitment.
              </p>
              {workflow.xLayerDisputeTxHash && (
                <code>{workflow.xLayerDisputeTxHash}</code>
              )}
              <p>Refresh safely; do not submit another dispute transaction.</p>
            </section>
          )}
          {status === "XLAYER_DISPUTE_CONFIRMED" && (
            <section className="notice success">
              <h2>Dispute recorded on X Layer</h2>
              <p>
                The exact packet commitment is confirmed. Submission for
                adjudication is the next authorized action.
              </p>
            </section>
          )}
          {[
            "GENLAYER_SUBMISSION_UNKNOWN",
            "SETTLEMENT_UNKNOWN",
            "REVIEW_REQUIRED",
          ].includes(status) && (
            <section className="notice" role="status">
              <h2>Status requires reconciliation</h2>
              <p>
                Tolerance will not repeat an external transaction automatically.
                Recheck the recorded workflow with an authorized operator.
              </p>
            </section>
          )}
          {workflow.lifecycle && (
            <section className="panel">
              <h2>GenLayer adjudication</h2>
              <p>{lifecycleCopy(workflow.lifecycle)}</p>
              <small>
                Lifecycle state is sanitized by Tolerance; validator internals
                are not exposed.
              </small>
            </section>
          )}
          {workflow.observation
            ? renderResultCopy(workflow.observation.verdict)
            : null}
          {status === "ATTESTATION_BLOCKED" && (
            <section className="notice">
              <h2>Resolution verified — settlement verification pending</h2>
              <p>
                Tolerance has verified the finalized adjudication result.
                Additional independent settlement verification is required
                before funds can move.
              </p>
              <details>
                <summary>Protocol details</summary>
                <p>ATTESTATION_BLOCKED</p>
              </details>
            </section>
          )}
          {workflow.settlementVerification && (
            <section className="panel">
              <h2>Independent settlement verification</h2>
              <p>
                {workflow.settlementVerification.signatureCount} /{" "}
                {workflow.settlementVerification.threshold} verified
              </p>
              <p>
                {workflow.settlementVerification.status.replaceAll("_", " ")}
              </p>
            </section>
          )}
          {workflow.settlement && (
            <section className="panel">
              <h2>Settlement</h2>
              <p>{workflow.settlement.status.replaceAll("_", " ")}</p>
              {workflow.settlement.transactionHash && (
                <code>{workflow.settlement.transactionHash}</code>
              )}
            </section>
          )}
        </div>
        <section className="panel dispute-state">
          <p className="eyebrow">Current state</p>
          <h2>Packet summary</h2>
          <p>The packet is immutable and tied to the X Layer commitment.</p>
          <details>
            <summary>Protocol details</summary>
            <dl>
              <dt>Case</dt>
              <dd>
                <code>{workflow.caseId}</code>
              </dd>
              <dt>Packet hash</dt>
              <dd>
                <code>{workflow.disputePacketHash}</code>
              </dd>
              <dt>Judge</dt>
              <dd>
                <code>{workflow.judgeAddress}</code>
              </dd>
            </dl>
          </details>
        </section>
      </div>
    </>
  );
}

export async function genlayerAction({ request, params }: LoaderFunctionArgs) {
  const formData = await request.formData();
  if (formData.get("intent") !== "submit-to-genlayer") {
    throw new Response("Unsupported dispute action.", { status: 400 });
  }
  const result = await submit<{ ok: boolean }>(
    `/api/disputes/${params.workflowId}/genlayer-submission`,
    jsonBody({}),
    "Tolerance could not request adjudication.",
  );
  if (!result.ok) return { error: result.message };
  return { ok: true };
}

function Timeline({
  label,
  complete,
  active,
}: {
  label: string;
  complete?: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`timeline-row ${complete ? "complete" : ""} ${active ? "active" : ""}`}
    >
      <span aria-hidden>{complete ? "✓" : active ? "●" : "○"}</span>
      <p>{label}</p>
    </div>
  );
}

const workflowOrder = [
  "XLAYER_DISPUTE_CONFIRMED",
  "GENLAYER_SUBMISSION_PENDING",
  "GENLAYER_SUBMITTED",
  "GENLAYER_FINALIZED",
  "ATTESTATION_BLOCKED",
  "ATTESTATION_PENDING",
  "ATTESTATION_READY",
  "SETTLEMENT_PENDING",
  "SETTLEMENT_SUBMITTED",
  "SETTLED",
  "REFUNDED",
];

function notBefore(status: string, target: string) {
  return workflowOrder.indexOf(status) >= workflowOrder.indexOf(target);
}

function lifecycleCopy(status: string) {
  return (
    (
      {
        PENDING: "Submission received",
        PROPOSING: "Validators are evaluating the dispute",
        COMMITTING: "Validators are evaluating the dispute",
        REVEALING: "Validators are evaluating the dispute",
        ACCEPTED: "Consensus reached; awaiting finality",
        FINALIZED: "Transaction finalized",
        UNDETERMINED: "Validators could not reach a conclusive protocol result",
      } as Record<string, string>
    )[status] ?? "Status requires reconciliation"
  );
}

function renderResultCopy(verdict: string) {
  const result = resultCopy(verdict);
  if (!result) return null;
  return (
    <section className="notice success">
      <p className="eyebrow">Verified resolution</p>
      <h2>{result.title}</h2>
      <p>{result.body}</p>
    </section>
  );
}

function resultCopy(verdict: string) {
  return (
    {
      RELEASE_FULL: {
        title: "Evidence supports release to supplier.",
        body: "The verified resolution supports release under the governing terms.",
      },
      REFUND_FULL: {
        title: "Resolution supports refund to buyer.",
        body: "The verified resolution supports refund under the governing terms.",
      },
      INSUFFICIENT_EVIDENCE: {
        title: "Supplier evidence did not establish the release conditions.",
        body: "This is a verified business result, distinct from a protocol-undetermined outcome.",
      },
    } as Record<string, { title: string; body: string }>
  )[verdict];
}

function humanWorkflowStatus(status: string) {
  return (
    (
      {
        PACKET_READY: "Dispute packet ready",
        XLAYER_BINDING_PENDING: "Waiting for X Layer confirmation",
        XLAYER_DISPUTE_CONFIRMED: "Dispute recorded on X Layer",
        GENLAYER_SUBMISSION_PENDING: "Preparing adjudication submission",
        GENLAYER_SUBMITTED: "Submitted for adjudication",
        GENLAYER_SUBMISSION_UNKNOWN: "Submission requires reconciliation",
        GENLAYER_FINALIZED: "Adjudication finalized",
        ATTESTATION_BLOCKED:
          "Resolution verified · settlement verification pending",
        ATTESTATION_PENDING: "Independent settlement verification",
        ATTESTATION_READY: "Settlement authorization ready",
        SETTLEMENT_PENDING: "Preparing settlement",
        SETTLEMENT_SUBMITTED: "Settlement submitted",
        SETTLEMENT_UNKNOWN: "Settlement requires reconciliation",
        SETTLED: "Settled",
        REFUNDED: "Refunded",
        REVIEW_REQUIRED: "Status requires review",
      } as Record<string, string>
    )[status] ?? "Workflow in progress"
  );
}
