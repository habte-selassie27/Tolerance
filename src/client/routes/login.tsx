import { Link, redirect, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { AuthForm } from "../components/auth-form";
import { AuthShell } from "../components/auth-shell";
import { Brand } from "../components/brand";
import { formString, jsonBody, submit } from "../lib/api";

type SignInResult = {
  ok: boolean;
  redirectTo: string | null;
  message: string | null;
};

export function loader({ request }: LoaderFunctionArgs) {
  return { next: new URL(request.url).searchParams.get("next") ?? undefined };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = await submit<SignInResult>(
    "/api/auth/sign-in",
    jsonBody({
      email: formString(formData, "email"),
      password: formString(formData, "password"),
      next: formString(formData, "next"),
    }),
    "We could not sign you in with those details.",
  );
  if (!result.ok) return { message: result.message };
  if (result.data.redirectTo) throw redirect(result.data.redirectTo);
  return { ok: true, message: result.data.message };
}

export default function LoginRoute() {
  const { next } = useLoaderData<typeof loader>();
  return (
    <AuthShell>
      <section className="auth-card">
        <Brand />
        <p className="eyebrow">Commercial workspace</p>
        <h1>Welcome back</h1>
        <p>
          Access your authorized manufacturing dossiers and payment workflows.
        </p>
        <AuthForm mode="login" next={next} />
        <Link className="text-link" to="/forgot-password">
          Forgot password?
        </Link>
        <p className="auth-switch">
          New to Tolerance?{" "}
          <Link
            to={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
          >
            Create workspace
          </Link>
        </p>
      </section>
    </AuthShell>
  );
}
