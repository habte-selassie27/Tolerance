import { Link, redirect, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { AuthForm } from "../components/auth-form";
import { AuthShell } from "../components/auth-shell";
import { Brand } from "../components/brand";
import { formString, jsonBody, submit } from "../lib/api";

type SignUpResult = {
  ok: boolean;
  redirectTo: string | null;
  message: string | null;
};

export function loader({ request }: LoaderFunctionArgs) {
  return { next: new URL(request.url).searchParams.get("next") ?? undefined };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = await submit<SignUpResult>(
    "/api/auth/signup",
    jsonBody({
      name: formString(formData, "name"),
      email: formString(formData, "email"),
      password: formString(formData, "password"),
      confirmPassword: formString(formData, "confirmPassword"),
      next: formString(formData, "next"),
    }),
    "We could not create that account.",
  );
  if (!result.ok) return { message: result.message };
  if (result.data.redirectTo) throw redirect(result.data.redirectTo);
  return { ok: true, message: result.data.message };
}

export default function SignupRoute() {
  const { next } = useLoaderData<typeof loader>();
  return (
    <AuthShell>
      <section className="auth-card">
        <Brand />
        <p className="eyebrow">Start a commercial workspace</p>
        <h1>Create your workspace</h1>
        <p>
          Set up your Tolerance identity. A blockchain wallet is separate and
          optional until an on-chain action requires it.
        </p>
        <AuthForm mode="signup" next={next} />
        <p className="auth-switch">
          Already have an account?{" "}
          <Link
            to={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          >
            Sign in
          </Link>
        </p>
      </section>
    </AuthShell>
  );
}
