import { useState } from "react";
import type { ReactNode } from "react";
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

/**
 * Grades a candidate password against the same minimum the server enforces
 * (`validateSignupInput`), so the meter never promises a pass the API will
 * refuse. Anything weaker is capped at "Weak"; length, case and symbols then
 * raise it from there.
 */
function passwordStrength(value: string) {
  if (!value) return { score: 0, label: "Strength" };
  const meetsMinimum =
    value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
  if (!meetsMinimum) return { score: 1, label: "Weak" };
  let bonus = 0;
  if (value.length >= 12) bonus += 1;
  if (value.length >= 16) bonus += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) bonus += 1;
  if (/[^\w\s]/.test(value)) bonus += 1;
  const score = bonus >= 3 ? 4 : bonus >= 2 ? 3 : 2;
  const label = score === 4 ? "Strong" : score === 3 ? "Good" : "Fair";
  return { score, label };
}

function PasswordRule({
  met,
  children,
}: {
  met: boolean;
  children: ReactNode;
}) {
  return (
    <li className="password-rule" data-met={met}>
      <span className="password-rule-mark" aria-hidden="true" />
      {children}
    </li>
  );
}

export function AuthForm({
  mode,
  next,
}: {
  mode: keyof typeof submitLabel;
  next?: string;
}) {
  const fetcher = useFetcher<AuthFormState>();
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const state = fetcher.data;
  const pending = fetcher.state !== "idle";
  const signup = mode === "signup";
  const forgot = mode === "forgot";
  // Only the flows that mint a new credential need strength feedback.
  const setsPassword = signup || mode === "reset";
  const strength = passwordStrength(password);
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
          {setsPassword && (
            <span className="password-strength" aria-hidden="true">
              <span
                className="password-strength-bars"
                data-level={strength.score}
              >
                {[0, 1, 2, 3].map((index) => (
                  <i key={index} data-on={index < strength.score} />
                ))}
              </span>
              <span
                className="password-strength-label"
                data-level={strength.score}
              >
                {strength.label}
              </span>
            </span>
          )}
        </div>
      )}
      {mode === "login" && (
        <Link className="text-link auth-forgot" to="/forgot-password">
          Forgot password?
        </Link>
      )}
      {signup && (
        <label htmlFor="confirmPassword">
          Confirm password
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
      )}
      {signup && (
        <ul className="password-rules">
          <PasswordRule met={password.length >= 8}>
            At least 8 characters
          </PasswordRule>
          <PasswordRule met={/[A-Za-z]/.test(password) && /\d/.test(password)}>
            A letter and a number
          </PasswordRule>
          <PasswordRule met={password.length > 0 && password === confirmation}>
            Passwords match
          </PasswordRule>
        </ul>
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
      <button className="button auth-submit" disabled={pending} type="submit">
        {pending ? (
          <>
            <span className="auth-submit-spinner" aria-hidden="true" />
            Please wait…
          </>
        ) : (
          submitLabel[mode]
        )}
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
