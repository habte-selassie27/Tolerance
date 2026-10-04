import { useRouteError } from "react-router";

export function RouteLoading() {
  return (
    <section
      className="workspace-skeleton"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading authorized workspace"
    >
      <div className="skeleton-line title" />
      <div className="skeleton-line copy" />
      <div className="skeleton-metrics">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="skeleton-block" key={index} />
        ))}
      </div>
      <div className="skeleton-content">
        <div className="skeleton-block" />
        <div className="skeleton-block" />
      </div>
    </section>
  );
}

export function RouteError() {
  const error = useRouteError();
  useEffectReport(error);
  return (
    <section className="empty" role="alert">
      <h1>We could not load this dossier</h1>
      <p>
        Your commercial record has not changed. Check your connection and try
        again.
      </p>
      <a className="button" href="/app">
        Try again
      </a>
    </section>
  );
}

/**
 * The workspace boundary must not render inside the workspace shell, so it
 * reports through a full navigation rather than a router reset.
 */
function useEffectReport(error: unknown) {
  if (typeof document === "undefined") return;
  console.error("Tolerance workspace render failed", {
    status:
      typeof error === "object" && error && "status" in error
        ? (error as { status?: number }).status
        : undefined,
  });
}
