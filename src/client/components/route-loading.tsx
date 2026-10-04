export default function RouteLoading() {
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
