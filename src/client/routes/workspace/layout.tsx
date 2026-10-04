import { Suspense } from "react";
import { Outlet, redirect, useLoaderData, useLocation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { RouteLoading } from "../../components/feedback";
import { WorkspaceNav } from "../../components/workspace-nav";
import { apiLoad, ApiRequestError, jsonBody, submit } from "../../lib/api";
import type { WorkspaceShell } from "../../../lib/api-types";

/**
 * The session prefilter for the workspace. A missing session is the only case
 * that redirects; every child route reconciles organization membership itself.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { pathname, search } = new URL(request.url);
  try {
    const shell = await apiLoad<WorkspaceShell>("/api/workspace");
    // Wallet sign-in produces an account with no confirmed address. Gate the
    // whole workspace on confirming one, so the email-bound invitation rule
    // stays a single rule rather than a check scattered across routes.
    if (!shell.emailVerified && pathname !== "/app/email") {
      throw redirect("/app/email");
    }
    return shell;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      const next = `${pathname}${search}`;
      throw redirect(`/login?next=${encodeURIComponent(next)}`);
    }
    throw error;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  if (formData.get("intent") !== "sign-out") {
    throw new Response("Unsupported workspace action.", { status: 400 });
  }
  const result = await submit<{ ok: boolean; redirectTo: string }>(
    "/api/auth/sign-out",
    jsonBody({}),
    "We could not sign you out.",
  );
  if (!result.ok) return { error: result.message };
  throw redirect(result.data.redirectTo ?? "/login");
}

export default function WorkspaceLayout() {
  const shell = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  return (
    <div className="workspace-shell">
      <WorkspaceNav {...shell} />
      <header className="workspace-topbar">
        <span className="breadcrumb-label">Commercial workspace</span>
        <span className="network-indicator">Test networks</span>
      </header>
      <main className="workspace-main" key={pathname}>
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
