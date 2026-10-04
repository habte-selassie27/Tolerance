import { Link, redirect, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { apiLoad, formString, jsonBody, submit } from "../../lib/api";
import { WalletLinker } from "./wallet-linker";

export function loader({ request }: LoaderFunctionArgs) {
  const next = new URL(request.url).searchParams.get("next") ?? undefined;
  return apiLoad<{ needsOnboarding: boolean }>("/api/workspace").then(
    (shell) => {
      if (!shell.needsOnboarding) {
        throw redirect(
          next && next.startsWith("/") && !next.startsWith("//")
            ? next
            : "/app",
        );
      }
      return { next };
    },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = await submit<{
    ok: boolean;
    organizationId: string;
    requestedNext: string | null;
  }>(
    "/api/organizations",
    jsonBody({
      name: formString(formData, "name"),
      next: formString(formData, "next"),
    }),
    "Enter an organization name.",
  );
  if (!result.ok) return { error: result.message };
  const requestedNext = result.data.requestedNext;
  throw redirect(
    requestedNext &&
      requestedNext.startsWith("/") &&
      !requestedNext.startsWith("//")
      ? requestedNext
      : "/app/deals",
  );
}

export default function OnboardingRoute() {
  const { next } = useLoaderData<typeof loader>();
  const create = useFetcher<typeof action>();
  return (
    <section className="onboarding">
      <p className="eyebrow">First login</p>
      <h1>Create your Tolerance workspace</h1>
      <div className="onboarding-steps">
        <article className="panel">
          <span className="step-number">1</span>
          <h2>Organization</h2>
          <p>
            Your workspace keeps commercial dossiers and access boundaries
            together.
          </p>
          <create.Form method="post" className="create-deal">
            {next && <input type="hidden" name="next" value={next} />}
            <label>
              Organization name
              <input
                name="name"
                required
                minLength={2}
                placeholder="Acme Precision Ltd"
              />
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
              {create.state !== "idle" ? "Creating…" : "Create organization"}
            </button>
          </create.Form>
        </article>
        <article className="panel">
          <span className="step-number">2</span>
          <h2>Wallet (optional)</h2>
          <p>
            A verified, user-controlled wallet is required only when you
            authorize an on-chain commercial action.
          </p>
          <WalletLinker />
          <Link to="/app" className="text-link">
            Skip for now
          </Link>
        </article>
        <article className="panel">
          <span className="step-number">3</span>
          <h2>Start with a dossier</h2>
          <p>
            Create your first commercial deal, or explore the public synthetic
            demonstration first.
          </p>
          <div className="button-row">
            <Link className="button secondary" to="/demo">
              Explore demo
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
