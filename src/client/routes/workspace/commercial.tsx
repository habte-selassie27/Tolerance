import { useState } from "react";
import {
  Link,
  redirect,
  useFetcher,
  useLoaderData,
  useRevalidator,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { DetailDrawer } from "../../components/primitives";
import {
  apiLoad,
  errorMessage,
  formString,
  jsonBody,
  submit,
} from "../../lib/api";
import { CommercialActions, PendingCommercialAction } from "./wallet";
import type {
  DealView,
  DealsResponse,
  ObligationView,
} from "../../../lib/api-types";

export function InvitationForm({ dealId }: { dealId: string }) {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="create-deal"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setLink("");
        setBusy(true);
        try {
          const data = new FormData(event.currentTarget);
          const result = await submit<{ invitationUrl: string }>(
            `/api/deals/${dealId}/invitations`,
            jsonBody({ email: data.get("email") }),
            "The invitation could not be created.",
          );
          if (!result.ok) throw new Error(result.message);
          setLink(result.data.invitationUrl);
        } catch (failure) {
          setError(
            errorMessage(failure, "The invitation could not be created."),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="dealId" value={dealId} />
      <label>
        Counterparty email
        <input type="email" name="email" required autoComplete="email" />
      </label>
      <button className="button secondary" disabled={busy} type="submit">
        {busy ? "Creating…" : "Create supplier invitation"}
      </button>
      {link && (
        <p role="status">
          Invitation ready.{" "}
          <a className="text-link" href={link}>
            Open secure invitation
          </a>
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export async function dealsLoader() {
  const view = await apiLoad<DealsResponse>("/api/deals");
  if (view.needsOnboarding) throw redirect("/app/onboarding");
  return { deals: view.deals };
}

export async function dealsAction({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = await submit<{ ok: boolean; dealId: string }>(
    "/api/deals",
    jsonBody({
      reference: formString(formData, "reference"),
      title: formString(formData, "title"),
      buyer: formString(formData, "buyer"),
      supplier: formString(formData, "supplier"),
    }),
    "Complete all deal details.",
  );
  if (!result.ok) return { error: result.message };
  throw redirect(`/app/deals/${result.data.dealId}`);
}

export function DealsRoute() {
  const { deals } = useLoaderData<typeof dealsLoader>();
  const create = useFetcher<typeof dealsAction>();
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Commercial dossiers</p>
          <h1>Deals</h1>
          <p>
            Terms, evidence, obligations, and dispute status stay connected.
          </p>
        </div>
      </header>
      <section className="deal-layout">
        <create.Form method="post" className="panel create-deal">
          <h2>New deal</h2>
          <label>
            Reference
            <input name="reference" required placeholder="PO-2026-014" />
          </label>
          <label>
            Title
            <input
              name="title"
              required
              placeholder="Precision component delivery"
            />
          </label>
          <label>
            Buyer organization
            <input name="buyer" required placeholder="Buyer name" />
          </label>
          <label>
            Supplier organization
            <input name="supplier" required placeholder="Supplier name" />
          </label>
          {create.data?.error && (
            <p className="error-text" role="alert">
              {create.data.error}
            </p>
          )}
          <button
            className="button"
            disabled={create.state !== "idle"}
            type="submit"
          >
            {create.state !== "idle" ? "Creating…" : "Create dossier"}
          </button>
        </create.Form>
        <div className="deal-list">
          <div className="table-toolbar">
            <strong>All commercial dossiers</strong>
            <span className="muted">{deals.length} total</span>
          </div>
          <div className="data-table-header" aria-hidden="true">
            <span>Deal</span>
            <span>Counterparty</span>
            <span>Role</span>
            <span>Obligations</span>
            <span>Commercial status</span>
            <span>Updated</span>
            <span></span>
          </div>
          {deals.length ? (
            deals.map((deal) => (
              <Link
                key={deal.id}
                to={`/app/deals/${deal.id}`}
                className="deal-row"
              >
                <div>
                  <p className="eyebrow">{deal.reference}</p>
                  <h2>{deal.title}</h2>
                </div>
                <span>{deal.supplierOrganizationRef}</span>
                <span className="muted">Buyer</span>
                <span>{deal.obligationCount}</span>
                <span className="status neutral">
                  {deal.agreementStatus === "APPROVED"
                    ? "Agreement active"
                    : "Setup"}
                </span>
                <div className="deal-meta">
                  <small>{new Date(deal.updatedAt).toLocaleDateString()}</small>
                  <span aria-hidden>›</span>
                </div>
              </Link>
            ))
          ) : (
            <div className="empty">
              <h2>No deals yet</h2>
              <p>
                Create your first dossier to organize evidence and release
                conditions.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function dealLoader({ params }: LoaderFunctionArgs) {
  return apiLoad<DealView>(`/api/deals/${params.dealId}`);
}

export async function dealAction({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = await submit<{ ok: boolean }>(
    `/api/deals/${params.dealId}/obligations`,
    jsonBody({ amount: formString(formData, "amount") }),
    "Enter an amount in the token's smallest unit.",
  );
  if (!result.ok) return { error: result.message };
  return { ok: true };
}

export function DealRoute() {
  const deal = useLoaderData<typeof dealLoader>();
  const createObligation = useFetcher<typeof dealAction>();
  const supplierAccepted = deal.participants.some(
    (participant) => participant.role === "SUPPLIER",
  );
  const agreementApproved = deal.agreementStatus === "APPROVED";
  const requirements = deal.obligations.flatMap(
    (obligation) => obligation.requirements,
  );
  return (
    <>
      <header className="page-heading dossier-header">
        <div>
          <p className="eyebrow">{deal.reference}</p>
          <h1>{deal.title}</h1>
          <p>
            {deal.buyerOrganizationRef} · {deal.supplierOrganizationRef}
          </p>
          <div className="dossier-facts">
            <span>
              Buyer<b>{deal.buyerOrganizationRef}</b>
            </span>
            <span>
              Supplier<b>{deal.supplierOrganizationRef}</b>
            </span>
            <span>
              Obligations<b>{deal.obligations.length}</b>
            </span>
            <span>
              Agreement
              <b>{agreementApproved ? "Approved" : "In preparation"}</b>
            </span>
          </div>
        </div>
      </header>
      <section className="panel counterparty-panel" id="overview">
        <div>
          <p className="eyebrow">Private counterparty access</p>
          <h2>Commercial organizations</h2>
          {deal.participants.map((participant) => (
            <p key={participant.organizationId}>
              <strong>{participant.organizationName}</strong> ·{" "}
              {participant.role.toLowerCase()}
            </p>
          ))}
          {!supplierAccepted && (
            <p className="muted">Supplier access has not been accepted.</p>
          )}
        </div>
        {!supplierAccepted && <InvitationForm dealId={deal.id} />}
      </section>
      <div className="tabs" role="navigation">
        <a href="#overview">Overview</a>
        <a href="#terms">Terms</a>
        <a href="#requirements">Requirements</a>
        <a href="#evidence">Evidence</a>
        <a href="#obligations">Obligations</a>
      </div>
      <section id="terms" className="panel">
        <h2>Terms and amendment lineage</h2>
        {deal.agreements.map((agreement) => (
          <article className="term-line" key={agreement.id}>
            <div>
              <strong>Agreement v{agreement.version}</strong>
              <p>{agreement.status}</p>
            </div>
            <div className="term-current">
              {agreement.amendments.map((amendment) => (
                <p key={amendment.id}>
                  <b>
                    {amendment.status === "APPROVED"
                      ? "Current approved amendment"
                      : "Historical amendment"}
                  </b>{" "}
                  · v{amendment.version} · precedence {amendment.precedence}
                </p>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section id="requirements" className="panel">
        <h2>Requirement matrix</h2>
        {requirements.length ? (
          <div className="matrix">
            <div className="matrix-header" aria-hidden="true">
              <span>Requirement</span>
              <span>Governing term</span>
              <span>Evidence</span>
              <span>Evaluation</span>
              <span>Status</span>
            </div>
            {requirements.map((requirement) => (
              <article key={requirement.id}>
                <h3>{requirement.title}</h3>
                <p>
                  <b>Governing term</b> {requirement.acceptanceCriteria}
                </p>
                <p>
                  <b>Evidence</b> {requirement.evidenceExpectations}
                </p>
                <p className="evaluation-copy">
                  <b>Evaluation</b> Citation review pending
                </p>
                <DetailDrawer
                  title={requirement.title}
                  triggerLabel="Awaiting review"
                >
                  <section>
                    <p className="eyebrow">Current governing term</p>
                    <h3>{requirement.acceptanceCriteria}</h3>
                    <p className="muted">
                      The approved agreement and amendment lineage determine
                      this term.
                    </p>
                  </section>
                  <section>
                    <p className="eyebrow">Evidence expected</p>
                    <p>{requirement.evidenceExpectations}</p>
                  </section>
                  <section>
                    <p className="eyebrow">Evaluation</p>
                    <p>Citation review is pending.</p>
                  </section>
                  <details>
                    <summary>Technical details</summary>
                    <code>{requirement.id}</code>
                  </details>
                </DetailDrawer>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">
            Requirements appear after terms are structured.
          </p>
        )}
      </section>
      <section id="evidence" className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Evidence workspace</p>
            <h2>Private documents and provenance</h2>
          </div>
          <span className="muted">{deal.documents.length} documents</span>
        </div>
        {deal.documents.length > 0 && (
          <div className="table-toolbar" aria-hidden="true">
            <span>Document</span>
            <span>Extraction and provenance</span>
          </div>
        )}
        {deal.documents.map((document) => (
          <article className="document-row" key={document.id}>
            <div>
              <strong>{document.originalFilename}</strong>
              <p>
                {document.documentType} · {document.status}
              </p>
            </div>
            <span>{document.documentType}</span>
            <span className="status info">
              {document.status.replaceAll("_", " ").toLowerCase()}
            </span>
            <div>
              <span>{document.sourceBlockCount} source excerpts</span>
              <details>
                <summary>Protocol details</summary>
                <p>Content hash: {document.contentHash}</p>
              </details>
            </div>
          </article>
        ))}
        {!deal.documents.length && (
          <div className="empty compact-empty">
            <h3>No evidence documents yet</h3>
            <p>
              Upload inspection evidence when the supplier dossier is ready.
            </p>
          </div>
        )}
      </section>
      <section id="obligations" className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Commercial milestones</p>
            <h2>Obligations</h2>
          </div>
        </div>
        {deal.obligations.map((obligation) => (
          <Link
            className="obligation-row"
            key={obligation.id}
            to={`/app/deals/${deal.id}/obligations/${obligation.id}`}
          >
            <strong>Obligation {obligation.xLayerObligationId}</strong>
            <span className="status neutral">
              {obligation.localStatus.toLowerCase()}
            </span>
            <small>
              {obligation.requirements.length} requirements ·{" "}
              {obligation.evidenceCount} evidence records
            </small>
            <span aria-hidden>›</span>
          </Link>
        ))}
        {supplierAccepted && agreementApproved && (
          <createObligation.Form
            method="post"
            className="create-deal obligation-create"
          >
            <label>
              Milestone amount in test-token smallest units
              <input
                name="amount"
                inputMode="numeric"
                pattern="[1-9][0-9]*"
                required
              />
            </label>
            {createObligation.data?.error && (
              <p className="error-text" role="alert">
                {createObligation.data.error}
              </p>
            )}
            <p className="muted">
              Parties, token, agreement, policy, network, and escrow are loaded
              by Tolerance. Both organizations must have verified wallets.
            </p>
            <button
              className="button secondary"
              disabled={createObligation.state !== "idle"}
              type="submit"
            >
              {createObligation.state !== "idle"
                ? "Preparing…"
                : "Prepare first milestone"}
            </button>
          </createObligation.Form>
        )}
      </section>
    </>
  );
}

export function obligationLoader({ params }: LoaderFunctionArgs) {
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

export function ObligationRoute() {
  const obligation = useLoaderData<typeof obligationLoader>();
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
