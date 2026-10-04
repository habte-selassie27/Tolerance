import { Link, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { DetailDrawer } from "../../components/detail-drawer";
import { apiLoad, formString, jsonBody, submit } from "../../lib/api";
import { InvitationForm } from "./invitation-form";

type DealView = {
  id: string;
  reference: string;
  title: string;
  buyerOrganizationRef: string;
  supplierOrganizationRef: string;
  agreementStatus: string | null;
  participants: Array<{
    organizationId: string;
    organizationName: string;
    role: string;
  }>;
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
    requirements: Array<{
      id: string;
      title: string;
      acceptanceCriteria: string;
      evidenceExpectations: string;
    }>;
  }>;
};

export function loader({ params }: LoaderFunctionArgs) {
  return apiLoad<DealView>(`/api/deals/${params.dealId}`);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = await submit<{ ok: boolean }>(
    `/api/deals/${params.dealId}/obligations`,
    jsonBody({ amount: formString(formData, "amount") }),
    "Enter an amount in the token's smallest unit.",
  );
  if (!result.ok) return { error: result.message };
  return { ok: true };
}

export default function DealRoute() {
  const deal = useLoaderData<typeof loader>();
  const createObligation = useFetcher<typeof action>();
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
