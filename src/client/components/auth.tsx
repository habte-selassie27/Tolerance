import { Link } from "react-router";
import type { ReactNode } from "react";

import { Brand } from "./primitives";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <aside
        className="auth-brand-panel"
        aria-label="Tolerance product context"
      >
        <Brand />
        <div className="auth-brand-story">
          <p className="eyebrow">Precision commercial assurance</p>
          <h2>Turn inspection evidence into verifiable milestone payments.</h2>
          <p>
            Connect governing terms, locked evidence, challengeable judgment,
            and deterministic settlement in one controlled workspace.
          </p>
          <div className="auth-mini-dossier">
            <p className="auth-dossier-head">
              <span>Inspection dossier · 316L-4471</span>
              <span className="auth-dossier-chip">Verified</span>
            </p>
            <div className="auth-gauge" aria-hidden="true">
              <span className="auth-gauge-track">
                <span className="auth-gauge-zone" />
                <span className="auth-gauge-marker" />
              </span>
              <span className="auth-gauge-scale">
                <span>49.70</span>
                <span>50.00 nominal</span>
                <span>50.30</span>
              </span>
            </div>
            <div className="auth-mini-rows">
              <div className="auth-mini-row">
                <span>Requirement</span>
                <b>Diameter tolerance</b>
              </div>
              <div className="auth-mini-row">
                <span>Current term</span>
                <b>±0.15 mm</b>
              </div>
              <div className="auth-mini-row">
                <span>Evidence</span>
                <b>50.10 mm · page 2</b>
              </div>
              <div className="auth-mini-row">
                <span>Evaluation</span>
                <b>Satisfied</b>
              </div>
            </div>
          </div>
        </div>
        <div className="auth-network">X Layer Testnet · GenLayer Studionet</div>
      </aside>
      <section className="auth-form-panel">
        <Link className="back-link" to="/">
          ← Back to Tolerance
        </Link>
        {children}
      </section>
    </main>
  );
}
