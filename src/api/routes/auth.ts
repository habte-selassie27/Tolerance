import type { EmailOtpType } from "@supabase/supabase-js";
import { Router } from "express";

import { validateSignupInput, validNewPassword } from "../../lib/auth-input";
import { createServerSupabaseClient } from "../../lib/supabase";
import { appOrigin, safeNextPath } from "../app";
import { ApiError } from "../errors";

export const authRouter: Router = Router();

function field(payload: unknown, name: string) {
  const value = (payload as Record<string, unknown> | null)?.[name];
  return typeof value === "string" ? value.trim() : "";
}

authRouter.post("/auth/signup", async (request, response) => {
  const name = field(request.body, "name");
  const email = field(request.body, "email").toLowerCase();
  const password = field(request.body, "password");
  const confirmation = field(request.body, "confirmPassword");
  const next = safeNextPath(field(request.body, "next"), "/app/onboarding");
  const validated = validateSignupInput({
    name,
    email,
    password,
    confirmPassword: confirmation,
  });
  if (!validated.ok) {
    response
      .status(400)
      .json({ code: "INVALID_INPUT", message: validated.message });
    return;
  }
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name },
      emailRedirectTo: `${appOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    response.status(400).json({
      code: "SIGNUP_REJECTED",
      message:
        "We could not create that account. If it already exists, sign in or recover your password.",
    });
    return;
  }
  response.json({
    ok: Boolean(data.session),
    redirectTo: data.session ? next : null,
    message: data.session
      ? null
      : "Check your email to confirm your account, then continue to your workspace.",
  });
});

authRouter.post("/auth/sign-in", async (request, response) => {
  const email = field(request.body, "email");
  const password = field(request.body, "password");
  if (!email || !password) {
    response.status(400).json({
      code: "INVALID_INPUT",
      message: "Enter your email and password.",
    });
    return;
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn("tolerance.auth.sign_in_failed", {
      code: error.code ?? "AUTH_ERROR",
      status: error.status ?? null,
    });
    response.status(401).json({
      code: "SIGN_IN_REJECTED",
      message: "We could not sign you in with those details.",
    });
    return;
  }
  response.json({
    ok: true,
    redirectTo: safeNextPath(field(request.body, "next"), "/app"),
  });
});

authRouter.post("/auth/forgot-password", async (request, response) => {
  const email = field(request.body, "email").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    response
      .status(400)
      .json({ code: "INVALID_INPUT", message: "Enter a valid email address." });
    return;
  }
  const supabase = createServerSupabaseClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appOrigin()}/auth/callback?next=/reset-password`,
  });
  response.json({
    ok: true,
    message: "If that account exists, a password reset link is on its way.",
  });
});

authRouter.post("/auth/reset-password", async (request, response) => {
  const password = field(request.body, "password");
  if (!validNewPassword(password)) {
    response.status(400).json({
      code: "INVALID_INPUT",
      message: "Use at least 8 characters with a letter and number.",
    });
    return;
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    response.status(400).json({
      code: "RESET_REJECTED",
      message: "This reset link is invalid or expired. Request a new one.",
    });
    return;
  }
  response.json({
    ok: true,
    message: "Password updated. You can now sign in.",
  });
});

authRouter.post("/auth/sign-out", async (_request, response) => {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();
  response.json({ ok: true, redirectTo: "/login" });
});

/**
 * Starts an OAuth handshake. The provider URL is built on the server so the
 * PKCE verifier and nonce land in the same cookie jar that `/auth/callback`
 * reads back; the browser only follows the returned URL.
 */
authRouter.post("/auth/oauth", async (request, response) => {
  const provider = field(request.body, "provider");
  if (provider !== "google") {
    throw new ApiError(
      400,
      "That sign-in provider is not enabled.",
      "UNSUPPORTED_PROVIDER",
    );
  }
  const next = safeNextPath(field(request.body, "next"), "/app");
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${appOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) {
    console.warn("termsmet.auth.oauth_unavailable", {
      provider,
      code: error?.code ?? "NO_URL",
    });
    throw new ApiError(
      503,
      "Google sign-in is unavailable right now. Use your email and password.",
      "PROVIDER_UNAVAILABLE",
    );
  }
  response.json({ ok: true, url: data.url });
});

authRouter.get("/auth/callback", async (request, response) => {
  const code = field(request.query, "code");
  const next = safeNextPath(field(request.query, "next"), "/app");
  if (code) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      response.redirect(303, next);
      return;
    }
  }
  response.redirect(303, "/login?message=confirmation-failed");
});

authRouter.get("/auth/confirm", async (request, response) => {
  const tokenHash = field(request.query, "token_hash");
  const type = field(request.query, "type") as EmailOtpType | null;
  if (tokenHash && type) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error) {
      response.redirect(303, "/app/onboarding");
      return;
    }
  }
  response.redirect(303, "/login?message=confirmation-failed");
});
