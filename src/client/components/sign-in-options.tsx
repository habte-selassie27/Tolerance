import { useState } from "react";
import { useNavigate } from "react-router";

import type { OAuthStartResponse } from "../../lib/api-types";
import { errorMessage, jsonBody, submit } from "../lib/api";
import { createBrowserSupabaseClient } from "../lib/supabase-browser";

import type { EthereumWallet } from "@supabase/supabase-js";

/**
 * The alternative sign-in methods offered alongside email and password.
 *
 * Google completes its handshake on the server so the PKCE verifier stays in
 * the same cookie jar as `/auth/callback`; a wallet signature cannot be
 * proxied, because the challenge is issued to `window.ethereum` in this tab.
 */
export function SignInOptions({ next }: { next?: string }) {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"google" | "wallet" | null>(null);

  async function signInWithGoogle() {
    setBusy("google");
    setMessage("");
    const result = await submit<OAuthStartResponse>(
      "/api/auth/oauth",
      jsonBody({ provider: "google", next: next ?? "" }),
      "Google sign-in is unavailable right now.",
    );
    if (!result.ok) {
      setBusy(null);
      setMessage(result.message);
      return;
    }
    window.location.assign(result.data.url);
  }

  async function signInWithWallet() {
    setBusy("wallet");
    setMessage("");
    try {
      const injected = window.ethereum;
      if (!injected) {
        throw new Error(
          "No EVM wallet was found. Install a wallet extension to sign in.",
        );
      }
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithWeb3({
        chain: "ethereum",
        // The injected provider is structurally an EIP-1193 wallet; the declared
        // window type is the looser shape used elsewhere in the browser bundle.
        wallet: injected as unknown as EthereumWallet,
        statement: "Sign in to your Tolerance commercial workspace.",
      });
      if (error) throw new Error(error.message);
      navigate(next ?? "/app", { replace: true });
    } catch (failure) {
      setMessage(
        errorMessage(
          failure,
          "No EVM wallet could complete the sign-in challenge.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="auth-options">
      <span className="auth-divider">or continue with</span>
      <button
        className="button auth-option"
        disabled={busy !== null}
        type="button"
        onClick={signInWithGoogle}
      >
        <GoogleMark />
        {busy === "google" ? "Opening Google…" : "Continue with Google"}
      </button>
      <button
        className="button auth-option"
        disabled={busy !== null}
        type="button"
        onClick={signInWithWallet}
      >
        <WalletMark />
        {busy === "wallet" ? "Check your wallet…" : "Continue with wallet"}
      </button>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg
      className="auth-option-mark"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function WalletMark() {
  return (
    <svg
      className="auth-option-mark"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M2 4.5A2.5 2.5 0 0 1 4.5 2h9A2.5 2.5 0 0 1 16 4.5V6h-3a2 2 0 0 0 0 4h3v3.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 2 13.5v-9Zm11 3.5v2h2V8h-2Zm-8 1.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
      />
    </svg>
  );
}
