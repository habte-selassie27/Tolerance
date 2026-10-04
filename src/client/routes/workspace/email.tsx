import { Link, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs } from "react-router";

import { apiLoad, formString, jsonBody, submit } from "../../lib/api";

type EmailStepShell = {
  organization: string;
  user: string;
  emailVerified: boolean;
};

/**
 * Wallet sign-in has no address, and counterparty invitations are bound to
 * one. This step attaches and confirms an address before the account can reach
 * the rest of the workspace, so the invitation rule stays a single rule.
 */
export function emailLoader() {
  return apiLoad<EmailStepShell>("/api/workspace");
}

export async function emailAction({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = await submit<{ ok: boolean; message: string }>(
    "/api/auth/email",
    jsonBody({ email: formString(formData, "email") }),
    "We could not attach that address.",
  );
  if (!result.ok) return { error: result.message };
  return { ok: true, message: result.data.message };
}

export function EmailStepRoute() {
  const shell = useLoaderData<typeof emailLoader>();
  const attach = useFetcher<typeof emailAction>();
  const confirmed = attach.data?.ok === true;
  return (
    <section className="onboarding">
      <p className="eyebrow">One more step</p>
      <h1>Confirm an email address</h1>
      <p>
        You signed in with a wallet, so this account has no address yet.
        Counterparty invitations are sent to an email, and every commercial
        agreement needs a party we can reach.
      </p>
      <div className="onboarding-steps">
        <article className="panel">
          <span className="step-number">1</span>
          <h2>Your address</h2>
          <p>
            Signed in as <strong>{shell.user}</strong>. This stays separate from
            your wallet: the address is for reaching you, the wallet is for
            authorizing X Layer actions.
          </p>
          {confirmed ? (
            <p className="success-text" role="status">
              {attach.data?.message}
            </p>
          ) : (
            <attach.Form method="post" className="create-deal">
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                />
              </label>
              {attach.data?.error && (
                <p className="error-text" role="alert">
                  {attach.data.error}
                </p>
              )}
              <button
                className="button"
                disabled={attach.state !== "idle"}
                type="submit"
              >
                {attach.state !== "idle"
                  ? "Sending…"
                  : "Send confirmation link"}
              </button>
            </attach.Form>
          )}
        </article>
        <article className="panel">
          <span className="step-number">2</span>
          <h2>Then create your workspace</h2>
          <p>
            Once the address is confirmed you will return here and can set up
            your organization.
          </p>
          <Link to="/app" className="text-link">
            Back to the workspace
          </Link>
        </article>
      </div>
    </section>
  );
}
