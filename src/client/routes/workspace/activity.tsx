import { useLoaderData } from "react-router";

import { apiLoad } from "../../lib/api";

type ActivityView = {
  events: Array<{
    id: string;
    action: string;
    targetType: string;
    createdAt: string;
  }>;
};

export function loader() {
  return apiLoad<ActivityView>("/api/activity");
}

export default function ActivityRoute() {
  const { events } = useLoaderData<typeof loader>();
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Audit trail</p>
          <h1>Activity</h1>
          <p>
            A human-readable history of commercial evidence and protocol steps.
          </p>
        </div>
      </header>
      <section className="panel">
        <div className="table-toolbar">
          <strong>Chronological audit trail</strong>
          <span className="muted">Latest 100 events</span>
        </div>
        <ul className="activity-list">
          {events.length ? (
            events.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{humanEvent(event.action)}</strong>
                  <p>{humanObject(event.targetType)}</p>
                </div>
                <small>{new Date(event.createdAt).toLocaleString()}</small>
              </li>
            ))
          ) : (
            <li className="muted">No activity available.</li>
          )}
        </ul>
      </section>
    </>
  );
}

function humanEvent(value: string) {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function humanObject(value: string) {
  return value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}
