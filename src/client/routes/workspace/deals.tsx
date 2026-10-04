import { Link, redirect, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs } from "react-router";

import { apiLoad, formString, jsonBody, submit } from "../../lib/api";

type DealsView =
  | { needsOnboarding: true; deals: [] }
  | {
      needsOnboarding: false;
      deals: Array<{
        id: string;
        reference: string;
        title: string;
        supplierOrganizationRef: string;
        agreementStatus: string | null;
        obligationCount: number;
        latestWorkflowStatus: string | null;
        updatedAt: string;
      }>;
    };

export async function loader() {
  const view = await apiLoad<DealsView>("/api/deals");
  if (view.needsOnboarding) throw redirect("/app/onboarding");
  return { deals: view.deals };
}

export async function action({ request }: ActionFunctionArgs) {
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

export default function DealsRoute() {
  const { deals } = useLoaderData<typeof loader>();
  const create = useFetcher<typeof action>();
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
