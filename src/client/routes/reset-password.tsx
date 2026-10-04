import { Link } from "react-router";
import type { ActionFunctionArgs } from "react-router";

import { AuthForm } from "../components/auth-form";
import { AuthShell } from "../components/auth-shell";
import { Brand } from "../components/brand";
import { formString, jsonBody, submit } from "../lib/api";

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const result = await submit<{ ok: boolean; message: string }>(
    "/api/auth/reset-password",
    jsonBody({ password: formString(formData, "password") }),
    "This reset link is invalid or expired. Request a new one.",
  );
  return result.ok
    ? { ok: true, message: result.data.message }
    : { message: result.message };
}

export default function ResetPasswordRoute() {
  return (
    <AuthShell>
      <section className="auth-card">
        <Brand />
        <h1>Choose a new password</h1>
        <AuthForm mode="reset" />
        <Link className="text-link" to="/login">
          Return to sign in
        </Link>
      </section>
    </AuthShell>
  );
}
