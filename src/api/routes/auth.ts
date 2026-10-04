import type { EmailOtpType } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { validateSignupInput, validNewPassword } from "../../lib/auth-input";
import { createServerSupabaseClient } from "../../lib/supabase";
import {
  WALLET_SESSION_COOKIE,
  createWalletSignInChallenge,
  currentWalletSessionToken,
  revokeWalletSession,
  verifyWalletSignInChallenge,
} from "../../server/wallet-session";
import { appOrigin, safeNextPath } from "../app";
import { ApiError } from "../errors";
import { rateLimit } from "../rate-limit";
import { requireSession } from "../workspace";

const WALLET_NETWORK = "xlayer-testnet-1952";

const challengeSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  network: z
    .string()
    .regex(/^[a-z0-9-]{3,40}$/)
    .default(WALLET_NETWORK),
});

const verifySchema = z.object({
  challengeId: z.uuid(),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  next: z.string().max(200).optional(),
});

/**
 * Signing is an interactive prompt, so the budget allows a few retries for a
 * mis-wired wallet while still bounding automated signature oracles.
 */
const walletSignInLimiter = rateLimit({
  name: "wallet-sign-in",
  limit: 10,
  windowMs: 5 * 60_000,
});

/**
 * Credential endpoints get a tighter budget than the wallet flow because they
 * are guessable rather than interactive. Upstream Supabase also throttles, but
 * that is not a control this application owns, so the guard has to live here.
 */
const credentialLimiter = rateLimit({
  name: "credentials",
  limit: 8,
  windowMs: 5 * 60_000,
});

/** Recovery mail is a cheap way to enumerate and to spam a third party. */
const recoveryLimiter = rateLimit({
  name: "recovery",
  limit: 4,
  windowMs: 10 * 60_000,
});

export const authRouter: Router = Router();

function field(payload: unknown, name: string) {
  const value = (payload as Record<string, unknown> | null)?.[name];
  return typeof value === "string" ? value.trim() : "";
}

authRouter.post(
  "/auth/signup",
  credentialLimiter,
  async (request, response) => {
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
  },
);

authRouter.post(
  "/auth/sign-in",
  credentialLimiter,
  async (request, response) => {
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
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
  },
);

authRouter.post(
  "/auth/forgot-password",
  recoveryLimiter,
  async (request, response) => {
    const email = field(request.body, "email").toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      response.status(400).json({
        code: "INVALID_INPUT",
        message: "Enter a valid email address.",
      });
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
  },
);

authRouter.post(
  "/auth/reset-password",
  recoveryLimiter,
  async (request, response) => {
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
  },
);

authRouter.post("/auth/sign-out", async (_request, response) => {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();
  response.json({ ok: true, redirectTo: "/login" });
});

/**
 * Issues a wallet sign-in challenge. The caller proves control of the address
 * with this project's own challenge format, and the session that follows is
 * minted here rather than delegated to an identity provider.
 */
authRouter.post(
  "/auth/wallet/challenge",
  walletSignInLimiter,
  async (request, response) => {
    const input = challengeSchema.parse(request.body);
    const challenge = await createWalletSignInChallenge(
      input.address,
      input.network,
    );
    response.status(201).json({
      ok: true,
      challengeId: challenge.id,
      message: challenge.message,
      expiresAt: challenge.expiresAt.toISOString(),
    });
  },
);

/** Consumes a challenge and issues the first-party session cookie. */
authRouter.post(
  "/auth/wallet/verify",
  walletSignInLimiter,
  async (request, response) => {
    const input = verifySchema.parse(request.body);
    const result = await verifyWalletSignInChallenge({
      challengeId: input.challengeId,
      signature: input.signature,
    });
    response.cookie(WALLET_SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: result.expiresAt,
    });
    response.json({
      ok: true,
      redirectTo: input.next || "/app",
    });
  },
);

/** Revokes the caller's wallet session and clears the cookie. */
authRouter.delete("/auth/wallet/session", async (_request, response) => {
  await revokeWalletSession(currentWalletSessionToken());
  response.clearCookie(WALLET_SESSION_COOKIE, { path: "/" });
  response.json({ ok: true, redirectTo: "/login" });
});

/**
 * Attaches an address to an account that signed in without one, such as a
 * wallet sign-in. Counterparty invitations are bound to an email address, so
 * this is what makes such an account able to accept one.
 */
authRouter.post("/auth/email", requireSession, async (request, response) => {
  const email = field(request.body, "email").toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    response.status(400).json({
      code: "INVALID_INPUT",
      message: "Enter a valid email address.",
    });
    return;
  }
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    console.warn("tolerance.auth.email_update_failed", {
      code: error.code ?? "AUTH_ERROR",
    });
    // Deliberately does not distinguish an address that is already in use.
    response.status(400).json({
      code: "EMAIL_REJECTED",
      message:
        "We could not attach that address. If it already belongs to another account, sign in with it instead.",
    });
    return;
  }
  response.json({
    ok: true,
    message: "Check that inbox for a confirmation link, then continue.",
  });
});

/**
 * Starts an OAuth handshake. The provider URL is built on the server so the
 * PKCE verifier and nonce land in the same cookie jar that `/auth/callback`
 * reads back; the browser only follows the returned URL.
 */
authRouter.post("/auth/oauth", credentialLimiter, async (request, response) => {
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
      response.redirect(
        303,
        safeNextPath(field(request.query, "next"), "/app"),
      );
      return;
    }
  }
  response.redirect(303, "/login?message=confirmation-failed");
});
