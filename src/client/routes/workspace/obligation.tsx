import { useState } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

import { DetailDrawer } from "../../components/detail-drawer";
import { apiLoad, jsonBody, submit } from "../../lib/api";
import {
  CommercialActions,
  PendingCommercialAction,
} from "./commercial-actions";

type ObligationView = {
  id: string;
  dealId: string;
  xLayerObligationId: string;
  amount: string;
  localStatus: string;
  observedOnchainState: string | null;
  role: string | null;
  counterpartyWallet: string;
  actions: Array<
    | "CREATE_OBLIGATION"
    | "ACCEPT_OBLIGATION"
    | "APPROVE_TOKEN"
    | "FUND_OBLIGATION"
    | "COMMIT_EVIDENCE"
    | "CHALLENGE_OUTCOME"
    | "FINALIZE_UNCONTESTED"
    | "REFUND_EVIDENCE_TIMEOUT"
  >;
  adjudicationCaseId: string | null;
  packet: { disputePacketHash: string; canonicalJson: string } | null;
  pendingSubmission: {
    intentId: string;
    action: string;
    transactionHash: string;
  } | null;
  evaluation: Array<{
    requirementId: string;
    result: string;
    explanation: string;
    claims: Array<{ text?: string; citations?: string[] }>;
  }>;
  requirements: Array<{
    id: string;
    title: string;
    acceptanceCriteria: string;
    evidenceExpectations: string;
  }>;
  evidence: Array<{
    id: string;
    status: string;
    authorityLevel: string;
    acknowledged: boolean;
    documentFilename: string | null;
    provenance: {
      normalizedText: string;
      pageNumber: number | null;
      blockOrder: number;
    } | null;
  }>;
};

export function loader({ params }: LoaderFunctionArgs) {
  return apiLoad<ObligationView>(
    `/api/deals/${params.dealId}/obligations/${params.obligationId}`,
  );
}

async function acknowledge(evidenceId: string) {
  return submit<{ ok: boolean }>(
    `/api/evidence/${evidenceId}/acknowledgement`,
    jsonBody({}),
    "That evidence could not be acknowledged.",
  );
}

export default function ObligationRoute() {
  const obligation = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [pendingAcknowledgement, setPendingAcknowledgement] = useState<
    string | null
  >(null);
  const state = obligation.observedOnchainState;
  async function acknowledgeEvidence(evidenceId: string) {
    setPendingAcknowledgement(evidenceId);
    try {
      await acknowledge(evidenceId);
      revalidator.revalidate();
    } finally {
      setPendingAcknowledgement(null);
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Obligation {obligation.xLayerObligationId}</p>
          <h1>Release conditions</h1>
          <p>
            {obligation.amount} units · {obligation.localStatus}
          </p>
        </div>
        {obligation.adjudicationCaseId ? (
          <Link
            className="button"
            to={`/app/disputes/${obligation.adjudicationCaseId}`}
          >
            View dispute
          </Link>
        ) : (
          <Link
            className="button"
            to={`/app/disputes/new?obligation=${obligation.id}`}
          >
            Start dispute
          </Link>
        )}
      </header>
      <section className="metric-grid">
        <article>
          <span>Funding</span>
          <strong>{state ?? "Not observed"}</strong>
        </article>
        <article>
          <span>Evidence</span>
          <strong>{obligation.evidence.length}</strong>
        </article>
        <article>
          <span>Packet</span>
          <strong>{obligation.packet ? "Ready" : "Not ready"}</strong>
        </article>
      </section>
      <section className="lifecycle-rail" aria-label="Commercial lifecycle">
        {lifecycleSteps(state).map(([label, complete], index) => (
          <div
            key={String(label)}
            className={`lifecycle-step ${
              complete
                ? "complete"
                : index === obligation.actions.length
                  ? "active"
                  : ""
            }`}
          >
            {label}
          </div>
        ))}
      </section>
      <div className="obligation-layout">
        <div className="obligation-main">
          <section className="panel commercial-path">
            <div>
              <p className="eyebrow">Commercial path</p>
              <h2>Uncontested outcomes do not require GenLayer</h2>
              <p>
                After evidence is committed, an authorized outcome can open the
                frozen challenge window. If neither party challenges it, X Layer
                finalizes the proposed release or refund. GenLayer is reserved
                for contested interpretation.
              </p>
            </div>
            <ol className="path-steps">
              <li>Evidence evaluated</li>
              <li>Outcome proposed</li>
              <li>Challenge window</li>
              <li>No challenge: finalize on X Layer</li>
              <li>Challenge: contested adjudication</li>
            </ol>
            <details>
              <summary>Current lifecycle capability</summary>
              <p>
                Tolerance now prepares the frozen create, accept, exact token
                approval, funding, evidence commitment, challenge, timeout
                refund, and uncontested-finalization calls. The wallet signs;
                the server independently verifies finalized chain truth.
              </p>
            </details>
          </section>
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Evidence evaluation</p>
                <h2>Requirement review</h2>
              </div>
              <details>
                <summary>How this works</summary>
                <p>
                  AI evaluates evidence; Tolerance validates citations; GenLayer
                  adjudicates contested outcomes; X Layer controls settlement.
                </p>
              </details>
            </div>
            <div className="matrix">
              <div className="matrix-header" aria-hidden="true">
                <span>Requirement</span>
                <span>Governing term</span>
                <span>Evidence</span>
                <span>Evaluation</span>
                <span>Status</span>
              </div>
              {obligation.requirements.map((requirement) => {
                const assessed = obligation.evaluation.find(
                  (item) => item.requirementId === requirement.id,
                );
                return (
                  <article key={requirement.id}>
                    <h3>{requirement.title}</h3>
                    <p>
                      <b>Current governing term</b>{" "}
                      {requirement.acceptanceCriteria}
                    </p>
                    <p>
                      <b>Evidence expected</b>{" "}
                      {requirement.evidenceExpectations}
                    </p>
                    <p className="evaluation-copy">
                      <b>Evaluation</b>{" "}
                      {assessed?.explanation ??
                        "Awaiting validated evidence evaluation"}
                    </p>
                    <DetailDrawer
                      title={requirement.title}
                      triggerLabel={
                        assessed?.result?.replaceAll("_", " ") ??
                        "Awaiting evaluation"
                      }
                      tone={
                        assessed?.result === "SATISFIED"
                          ? "success"
                          : assessed?.result === "INSUFFICIENT_EVIDENCE"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      <section>
                        <p className="eyebrow">Current governing term</p>
                        <h3>{requirement.acceptanceCriteria}</h3>
                      </section>
                      <section>
                        <p className="eyebrow">Evidence expected</p>
                        <p>{requirement.evidenceExpectations}</p>
                      </section>
                      <section>
                        <p className="eyebrow">Evaluation explanation</p>
                        <p>
                          {assessed?.explanation ??
                            "No validated evaluation is available yet."}
                        </p>
                      </section>
                      <details>
                        <summary>Technical details</summary>
                        <code>{requirement.id}</code>
                      </details>
                    </DetailDrawer>
                    {assessed && (
                      <ul className="citation-list">
                        {assessed.claims
                          .flatMap((claim) => claim.citations ?? [])
                          .map((citation) => (
                            <li key={citation}>
                              <code>{citation}</code>
                            </li>
                          ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Evidence authority</p>
                <h2>Evidence and provenance</h2>
              </div>
              <p className="muted">
                Integrity proves the stored document. Authority records who
                stands behind the evidence.
              </p>
            </div>
            {obligation.evidence.map((evidence) => (
              <article className="document-row" key={evidence.id}>
                <div>
                  <strong>
                    {evidence.documentFilename ?? "Evidence record"}
                  </strong>
                  <p>
                    {evidence.status} ·{" "}
                    {evidence.acknowledged
                      ? "Counterparty acknowledged"
                      : evidence.authorityLevel === "THIRD_PARTY_SIGNED"
                        ? "Issuer verified"
                        : evidence.authorityLevel === "ONCHAIN_VERIFIED"
                          ? "On-chain verified"
                          : evidence.authorityLevel ===
                              "PREAGREED_EXTERNAL_SOURCE"
                            ? "Awaiting validator verification"
                            : "Party supplied"}
                  </p>
                </div>
                <span
                  className={`status ${
                    evidence.acknowledged ? "success" : "warning"
                  }`}
                >
                  {evidence.acknowledged
                    ? "Authority acknowledged"
                    : evidence.authorityLevel === "PREAGREED_EXTERNAL_SOURCE"
                      ? "Awaiting validator verification"
                      : "Authority pending"}
                </span>
                {!evidence.acknowledged && (
                  <button
                    className="button secondary"
                    disabled={pendingAcknowledgement === evidence.id}
                    type="button"
                    onClick={() => acknowledgeEvidence(evidence.id)}
                  >
                    {pendingAcknowledgement === evidence.id
                      ? "Acknowledging…"
                      : "Acknowledge exact document"}
                  </button>
                )}
                {evidence.provenance && (
                  <details>
                    <summary>View provenance</summary>
                    <p>{evidence.provenance.normalizedText}</p>
                    <small>
                      Page {evidence.provenance.pageNumber ?? "—"} · block{" "}
                      {evidence.provenance.blockOrder}
                    </small>
                    <p className="muted">
                      Integrity verified for this stored document. This does not
                      alone prove a third-party fact.
                    </p>
                  </details>
                )}
              </article>
            ))}
          </section>
          {obligation.packet && (
            <section className="panel">
              <h2>Dispute packet review</h2>
              <p>
                Review the governing terms, selected evidence, and validated
                evaluation before dispute entry.
              </p>
              <details>
                <summary>Protocol details</summary>
                <code>{obligation.packet.disputePacketHash}</code>
                <pre>{obligation.packet.canonicalJson}</pre>
              </details>
            </section>
          )}
        </div>
        <aside
          className="panel action-panel"
          aria-labelledby="commercial-actions-title"
        >
          <p className="eyebrow">Current party action</p>
          <h2 id="commercial-actions-title">Next X Layer action</h2>
          <p className="muted">
            Tolerance prepares and verifies the call. Your assigned wallet
            remains the signer.
          </p>
          {obligation.pendingSubmission ? (
            <PendingCommercialAction
              intentId={obligation.pendingSubmission.intentId}
              action={obligation.pendingSubmission.action}
              transactionHash={obligation.pendingSubmission.transactionHash}
            />
          ) : (
            <CommercialActions
              obligationId={obligation.id}
              actions={obligation.actions}
              counterparty={obligation.counterpartyWallet}
              amount={obligation.amount}
            />
          )}
        </aside>
      </div>
    </>
  );
}

function lifecycleSteps(state: string | null) {
  const atOrPast = (...states: string[]) => states.includes(state ?? "");
  return [
    ["Created", Boolean(state)],
    [
      "Accepted",
      atOrPast(
        "ACCEPTED",
        "FUNDED",
        "EVIDENCE_COMMITTED",
        "VERDICT_PROPOSED",
        "DISPUTED",
        "SETTLED",
        "REFUNDED",
      ),
    ],
    [
      "Funded",
      atOrPast(
        "FUNDED",
        "EVIDENCE_COMMITTED",
        "VERDICT_PROPOSED",
        "DISPUTED",
        "SETTLED",
        "REFUNDED",
      ),
    ],
    [
      "Evidence committed",
      atOrPast(
        "EVIDENCE_COMMITTED",
        "VERDICT_PROPOSED",
        "DISPUTED",
        "SETTLED",
        "REFUNDED",
      ),
    ],
    [
      "Outcome proposed",
      atOrPast("VERDICT_PROPOSED", "DISPUTED", "SETTLED", "REFUNDED"),
    ],
    ["Challenge window", state === "VERDICT_PROPOSED"],
    ["Settlement", state === "SETTLED" || state === "REFUNDED"],
  ] as Array<[string, boolean]>;
}
