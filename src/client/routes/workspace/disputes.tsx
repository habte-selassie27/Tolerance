import { Link, useLoaderData } from "react-router";

import { apiLoad } from "../../lib/api";

type DisputesView = {
  disputes: Array<{
    id: string;
    xLayerObligationId: string;
    dealTitle: string;
    workflowStatus: string | null;
    lifecycle: string | null;
    updatedAt: string;
  }>;
};

export function loader() {
  return apiLoad<DisputesView>("/api/disputes");
}

export default function DisputesRoute() {
  const { disputes } = useLoaderData<typeof loader>();
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Protocol lifecycle</p>
          <h1>Disputes</h1>
          <p>
            Every external action remains tied to the frozen commercial dossier.
          </p>
        </div>
      </header>
      <section className="panel">
        {disputes.length ? (
          <div className="deal-list">
            {disputes.map((row) => (
              <Link
                to={`/app/disputes/${row.id}`}
                className="deal-row"
                key={row.id}
              >
                <div>
                  <p className="eyebrow">Obligation {row.xLayerObligationId}</p>
                  <h2>{row.dealTitle}</h2>
                  <p>{human(row.workflowStatus)}</p>
                </div>
                <div className="deal-meta">
                  <span>{row.lifecycle ?? "Not submitted"}</span>
                  <small>{new Date(row.updatedAt).toLocaleDateString()}</small>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">
            <h2>No disputes</h2>
            <p>
              Disputes appear here once a validated packet enters the workflow.
            </p>
          </div>
        )}
      </section>
    </>
  );
}

function human(status: string | null) {
  return (
    status
      ?.replaceAll("_", " ")
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase()) ?? "Packet ready"
  );
}
