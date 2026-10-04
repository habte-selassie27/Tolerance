import { Link } from "react-router";

export default function NotFoundRoute() {
  return (
    <main className="empty" style={{ padding: "4rem 1.5rem" }}>
      <h1>We could not find that page</h1>
      <p>
        The address may have changed, or the record may not be part of your
        authorized workspace.
      </p>
      <Link className="button" to="/">
        Return to Tolerance
      </Link>
    </main>
  );
}
