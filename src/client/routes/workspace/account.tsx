import { useState } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";

import { apiLoad, jsonBody, submit } from "../../lib/api";
import { WalletLinker } from "./wallet-linker";

type AccountView = {
  displayName: string | null;
  email: string | null;
  organizations: Array<{ id: string; name: string; role: string }>;
  wallets: Array<{ id: string; address: string }>;
};

export function loader() {
  return apiLoad<AccountView>("/api/account");
}

export default function AccountRoute() {
  const account = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const signOut = useFetcher();
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function unlink(walletId: string) {
    setError("");
    setPendingWallet(walletId);
    try {
      const result = await submit<{ ok: boolean }>(
        `/api/wallets/${walletId}`,
        { method: "DELETE", ...jsonBody({}) },
        "That wallet could not be unlinked.",
      );
      if (!result.ok) setError(result.message);
      else revalidator.revalidate();
    } finally {
      setPendingWallet(null);
    }
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Profile and security</h1>
          <p>
            Your Tolerance identity stays separate from your externally
            controlled wallet.
          </p>
        </div>
      </header>
      <section className="settings-layout">
        <nav className="settings-nav" aria-label="Account settings">
          <a href="#profile">Profile</a>
          <a href="#organization">Organization</a>
          <a href="#wallet">Wallet</a>
          <a href="#security">Security</a>
        </nav>
        <div className="settings-grid">
          <article className="panel" id="profile">
            <h2>Profile</h2>
            <dl>
              <dt>Name</dt>
              <dd>{account.displayName ?? "Not provided"}</dd>
              <dt>Email</dt>
              <dd>{account.email}</dd>
            </dl>
          </article>
          <article className="panel" id="organization">
            <h2>Organization</h2>
            {account.organizations.map((organization) => (
              <p key={organization.id}>
                <strong>{organization.name}</strong>
                <br />
                <span className="muted">{organization.role.toLowerCase()}</span>
              </p>
            ))}
          </article>
          <article className="panel wallet-settings" id="wallet">
            <h2>Verified X Layer wallet</h2>
            {account.wallets.length ? (
              account.wallets.map((wallet) => (
                <div key={wallet.id} className="wallet-record">
                  <div>
                    <strong>{wallet.address}</strong>
                    <p className="status">Verified · X Layer Testnet</p>
                  </div>
                  <button
                    className="button secondary"
                    disabled={pendingWallet === wallet.id}
                    type="button"
                    onClick={() => unlink(wallet.id)}
                  >
                    {pendingWallet === wallet.id
                      ? "Unlinking…"
                      : "Unlink if unused"}
                  </button>
                </div>
              ))
            ) : (
              <p>
                No wallet linked. Browsing and evidence review do not require
                one.
              </p>
            )}
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <WalletLinker />
            <small>
              Historical wallets assigned to an obligation cannot be unlinked or
              replaced on that obligation.
            </small>
          </article>
          <article className="panel" id="security">
            <h2>Security</h2>
            <p>
              Wallet signatures prove ownership only. They never reveal a
              private key or authorize payment by themselves.
            </p>
            <signOut.Form method="post" action="/app">
              <input type="hidden" name="intent" value="sign-out" />
              <button
                className="button secondary"
                disabled={signOut.state !== "idle"}
                type="submit"
              >
                {signOut.state !== "idle" ? "Signing out…" : "Sign out"}
              </button>
            </signOut.Form>
          </article>
        </div>
      </section>
    </>
  );
}
