import { useState } from "react";
import { Link, useLoaderData, useNavigate, useParams } from "react-router";
import type { LoaderFunctionArgs } from "react-router";

import { AuthShell } from "../components/auth";
import { Brand } from "../components/primitives";
import { apiLoad, errorMessage, jsonBody, submit } from "../lib/api";
import type { InvitationView } from "../../lib/api-types";

export function loader({ params }: LoaderFunctionArgs) {
  return apiLoad<InvitationView>(`/api/invitations/${params.token}`);
}

export default function InvitationRoute() {
  const { token } = useParams();
  const invitation = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const next = encodeURIComponent(`/invite/${token}`);
  if (!invitation.viewer.signedIn) {
    return (
      <AuthShell>
        <section className="auth-card invitation-card">
          <Brand href="/" />
          <p className="eyebrow">Counterparty invitation</p>
          <h1>Join {invitation.deal.title}</h1>
          <p>
            {invitation.invitingOrganizationName} invited the intended supplier
            organization to this private commercial dossier.
          </p>
          <dl>
            <dt>Reference</dt>
            <dd>{invitation.deal.reference}</dd>
            <dt>Role</dt>
            <dd>Supplier</dd>
            <dt>Expires</dt>
            <dd>{new Date(invitation.expiresAt).toLocaleDateString()}</dd>
          </dl>
          <div className="button-row">
            <Link className="button" to={`/login?next=${next}`}>
              Sign in to accept
            </Link>
            <Link className="button secondary" to={`/signup?next=${next}`}>
              Create workspace
            </Link>
          </div>
        </section>
      </AuthShell>
    );
  }
  if (!invitation.viewer.organizations.length) {
    return (
      <AuthShell>
        <section className="auth-card invitation-card">
          <Brand href="/" />
          <p className="eyebrow">Counterparty invitation</p>
          <h1>Join {invitation.deal.title}</h1>
          <p>Create your organization before accepting this invitation.</p>
          <Link className="button" to={`/app/onboarding?next=${next}`}>
            Continue onboarding
          </Link>
        </section>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <section className="auth-card invitation-card">
        <Brand href="/" />
        <p className="eyebrow">Counterparty invitation</p>
        <h1>Join {invitation.deal.title}</h1>
        <p>
          {invitation.invitingOrganizationName} invited the intended supplier
          organization to this private commercial dossier.
        </p>
        <dl>
          <dt>Reference</dt>
          <dd>{invitation.deal.reference}</dd>
          <dt>Role</dt>
          <dd>Supplier</dd>
          <dt>Expires</dt>
          <dd>{new Date(invitation.expiresAt).toLocaleDateString()}</dd>
        </dl>
        <InvitationAcceptance
          token={token ?? ""}
          organizations={invitation.viewer.organizations}
          onAccepted={(dealId) => navigate(`/app/deals/${dealId}`)}
        />
      </section>
    </AuthShell>
  );
}

function InvitationAcceptance({
  token,
  organizations,
  onAccepted,
}: {
  token: string;
  organizations: Array<{ id: string; name: string }>;
  onAccepted: (dealId: string) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="auth-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
          const data = new FormData(event.currentTarget);
          const result = await submit<{ dealId: string }>(
            "/api/invitations/accept",
            jsonBody({
              token: data.get("token"),
              organizationId: data.get("organizationId"),
            }),
            "This invitation could not be accepted.",
          );
          if (!result.ok) throw new Error(result.message);
          onAccepted(result.data.dealId);
        } catch (failure) {
          setError(
            errorMessage(
              failure,
              "This invitation could not be accepted. Refresh to check whether it was already used.",
            ),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <input type="hidden" name="token" value={token} />
      <label>
        Accept for organization
        <select name="organizationId" required>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
      </label>
      <button className="button" disabled={busy} type="submit">
        Accept deal relationship
      </button>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function ErrorBoundary() {
  return (
    <AuthShell>
      <section className="auth-card invitation-card">
        <Brand href="/" />
        <p className="eyebrow">Counterparty invitation</p>
        <h1>Invitation unavailable</h1>
        <p>
          This invitation may have expired, been revoked, or already been
          accepted. Ask the inviting organization for a current invitation.
        </p>
        <Link className="button secondary" to="/">
          Return to Tolerance
        </Link>
      </section>
    </AuthShell>
  );
}
