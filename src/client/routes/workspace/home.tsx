import { Link, useLoaderData } from "react-router";

import { StatusBadge } from "../../components/status-badge";
import { apiLoad } from "../../lib/api";

type WorkspaceSummary =
  | { needsOnboarding: true }
  | {
      needsOnboarding: false;
      metrics: {
        deals: number;
        obligations: number;
        awaitingWallet: number;
        adjudications: number;
      };
      workflows: Array<{
        id: string;
        workflowStatus: string | null;
        dealTitle: string;
      }>;
      events: Array<{ id: string; action: string; createdAt: string }>;
    };

export function loader() {
  return apiLoad<WorkspaceSummary>("/api/workspace/summary");
}

export default function WorkspaceHomeRoute() {
  const summary = useLoaderData<typeof loader>();
  if (summary.needsOnboarding) {
    return (
      <section className="empty">
        <h1>Create your commercial workspace</h1>
        <p>
          Set up an organization to begin a controlled manufacturing dossier. A
          wallet is optional until an on-chain action requires it.
        </p>
        <Link className="button" to="/app/onboarding">
          Start onboarding
        </Link>
        <Link className="button secondary" to="/demo">
          Explore synthetic demo
        </Link>
      </section>
    );
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>What needs attention</h1>
          <p>
            Commercial evidence, dispute progress, and settlement safeguards in
            one dossier.
          </p>
        </div>
        <Link className="button" to="/app/deals">
          Review workspace
        </Link>
      </header>
      <section className="metric-grid" aria-label="Workspace summary">
        <article>
          <span>Active deals</span>
          <strong>{summary.metrics.deals}</strong>
        </article>
        <article>
          <span>Open obligations</span>
          <strong>{summary.metrics.obligations}</strong>
        </article>
        <article>
          <span>Awaiting action</span>
          <strong>{summary.metrics.awaitingWallet}</strong>
        </article>
        <article>
          <span>Adjudications</span>
          <strong>{summary.metrics.adjudications}</strong>
        </article>
      </section>
      <section className="attention-layout">
        <div className="panel">
          <p className="eyebrow">Priority queue</p>
          <h2>Needs attention</h2>
          {summary.workflows.length ? (
            <ul className="activity-list">
              {summary.workflows.map((item) => (
                <li key={item.id}>
                  <Link to={`/app/disputes/${item.id}`}>{item.dealTitle}</Link>
                  <StatusBadge tone="info">
                    {humanStatus(item.workflowStatus)}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No active disputes require action.</p>
          )}
        </div>
        <div className="panel">
          <p className="eyebrow">Audit trail</p>
          <h2>Recent activity</h2>
          {summary.events.length ? (
            <ul className="activity-list">
              {summary.events.map((event) => (
                <li key={event.id}>
                  <span>{humanEvent(event.action)}</span>
                  <small>
                    {new Date(event.createdAt).toLocaleDateString()}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              Activity appears here as your dossier develops.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

function humanStatus(status: string | null) {
  return (
    status
      ?.replaceAll("_", " ")
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase()) ?? "Preparing"
  );
}

function humanEvent(action: string) {
  return action
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}
