import { useState } from "react";

import { errorMessage, jsonBody, submit } from "../../lib/api";

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
