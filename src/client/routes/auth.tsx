import { useState } from "react";
import { Link, redirect, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { Brand } from "../components/primitives";
import { AuthShell } from "../components/auth";
import { SignInOptions } from "../components/sign-in-options";
import { formString, jsonBody, submit } from "../lib/api";

export type AuthFormState = { ok?: boolean; message?: string };

const submitLabel = {
  login: "Sign in",
  signup: "Create account",
  forgot: "Send reset link",
  reset: "Update password",
} as const;

export function AuthForm({
  mode,
  next,
}: {
  mode: keyof typeof submitLabel;
  next?: string;
}) {
  const fetcher = useFetcher<AuthFormState>();
  const [showPassword, setShowPassword] = useState(false);
  const state = fetcher.data;
  const pending = fetcher.state !== "idle";
  const signup = mode === "signup";
  const forgot = mode === "forgot";
  return (
    <fetcher.Form method="post" className="auth-form" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {signup && (
        <label htmlFor="name">
          Name
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
          />
        </label>
      )}
      {mode !== "reset" && (
        <label htmlFor="email">
          Email
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </label>
      )}
      {!forgot && (
        <div className="auth-field">
          <label htmlFor="password">
            {mode === "reset" ? "New password" : "Password"}
          </label>
          <span className="password-field">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={8}
            />
            <button
              className="text-button"
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
        </div>
      )}
      {signup && (
        <label htmlFor="confirmPassword">
          Confirm password
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
      )}
      {state?.message && (
        <p
          className={
            state.ok ? "form-message success-text" : "form-message error-text"
          }
          role="status"
        >
          {state.message}
        </p>
      )}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Please wait…" : submitLabel[mode]}
      </button>
    </fetcher.Form>
  );
}

type SignInResult = {
  ok: boolean;
  redirectTo: string | null;
  message: string | null;
};

export function loginLoader({ request }: LoaderFunctionArgs) {
  return { next: new URL(request.url).searchParams.get("next") ?? undefined };
}

export async function loginAction({ request }: ActionFunctionArgs) {
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

export function LoginRoute() {
  const { next } = useLoaderData<typeof loginLoader>();
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
        <SignInOptions next={next} />
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

type SignUpResult = {
  ok: boolean;
  redirectTo: string | null;
  message: string | null;
};

export function signupLoader({ request }: LoaderFunctionArgs) {
  return { next: new URL(request.url).searchParams.get("next") ?? undefined };
}

export async function signupAction({ request }: ActionFunctionArgs) {
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

export function SignupRoute() {
  const { next } = useLoaderData<typeof signupLoader>();
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

export async function forgotPasswordAction({ request }: ActionFunctionArgs) {
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

export function ForgotPasswordRoute() {
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

export async function resetPasswordAction({ request }: ActionFunctionArgs) {
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

export function ResetPasswordRoute() {
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
