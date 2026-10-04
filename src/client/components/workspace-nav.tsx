import { useState } from "react";
import { Link, useFetcher, useLocation } from "react-router";
import { Brand } from "./brand";

const links = [
  ["Home", "/app"],
  ["Deals", "/app/deals"],
  ["Obligations", "/app/deals"],
  ["Disputes", "/app/disputes"],
  ["Activity", "/app/activity"],
] as const;

export type WorkspaceShellData = {
  organization: string;
  user: string;
  wallet: string | null;
  needsOnboarding: boolean;
};

export function WorkspaceNav({
  organization,
  user,
  wallet,
  needsOnboarding,
}: WorkspaceShellData) {
  const { pathname } = useLocation();
  const signOut = useFetcher();
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <Brand href="/app" />
        <button
          className="mobile-menu"
          aria-expanded={open}
          aria-controls="workspace-navigation"
          aria-label={
            open ? "Close workspace navigation" : "Open workspace navigation"
          }
          type="button"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>
        <p className="eyebrow">Workspace</p>
        <nav id="workspace-navigation" aria-label="Primary navigation">
          {links.map(([label, href]) => {
            const active =
              href === "/app"
                ? pathname === href
                : label === "Obligations"
                  ? false
                  : pathname.startsWith(href);
            return (
              <Link
                className={active ? "active" : ""}
                key={label}
                to={href}
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <nav className="secondary-nav" aria-label="Secondary navigation">
          <Link to="/demo">Demo</Link>
          <Link
            className={pathname.startsWith("/app/account") ? "active" : ""}
            to="/app/account"
          >
            Account
          </Link>
        </nav>
        <div className="sidebar-account">
          <b>{organization}</b>
          <span>{user}</span>
          <span>
            {wallet
              ? `Verified wallet · ${wallet.slice(0, 6)}…${wallet.slice(-4)}`
              : "No wallet linked"}
          </span>
          {needsOnboarding && (
            <Link to="/app/onboarding">Complete onboarding</Link>
          )}
          <signOut.Form method="post" action="/app">
            <input type="hidden" name="intent" value="sign-out" />
            <button className="text-button light" type="submit">
              Sign out
            </button>
          </signOut.Form>
        </div>
        <div className="sidebar-note">
          Evidence first. Settlement remains independently verified.
        </div>
      </aside>
      {open && (
        <button
          className="nav-backdrop"
          type="button"
          aria-label="Close workspace navigation"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
