import { useState } from "react";
import { useFetcher } from "react-router";

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
