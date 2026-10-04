import { Link } from "react-router";
import type { ActionFunctionArgs } from "react-router";

import { AuthForm } from "../components/auth-form";
import { AuthShell } from "../components/auth-shell";
import { Brand } from "../components/brand";
import { formString, jsonBody, submit } from "../lib/api";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = await submit<{ ok: boolean; message: string }>(
    "/api/auth/forgot-password",
    jsonBody({ email: formString(formData, "email") }),
    "We could not send a reset link for that address.",
  );
  return result.ok
    ? { ok: true, message: result.data.message }
    : { message: result.message };
}

export default function ForgotPasswordRoute() {
  return (
    <AuthShell>
      <section className="auth-card">
        <Brand />
        <h1>Reset your password</h1>
        <p>We’ll send a secure recovery link if the account exists.</p>
        <AuthForm mode="forgot" />
        <Link className="text-link" to="/login">
          Back to sign in
        </Link>
      </section>
    </AuthShell>
  );
}
