import { Link } from "react-router";
import { Brand } from "../components/brand";

export default function Home() {
  return (
    <main className="public-site">
      <header className="public-nav">
        <Brand />
        <nav aria-label="Public navigation">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#security">Security</a>
        </nav>
        <div className="nav-actions">
          <Link to="/demo">View demo</Link>
          <Link to="/login">Sign in</Link>
          <Link className="button" to="/signup">
            Create workspace
          </Link>
        </div>
      </header>
      <section className="hero" id="product">
        <div className="hero-copy">
          <p className="eyebrow">
            Commercial assurance for custom manufacturing
          </p>
          <h1>Turn inspection evidence into verifiable milestone payments.</h1>
          <p>
            Tolerance reconciles agreed manufacturing requirements against
            locked evidence, resolves contested interpretation through GenLayer,
            and coordinates deterministic settlement on X Layer.
          </p>
          <div className="button-row">
            <Link className="button" to="/signup">
              Create workspace
            </Link>
            <Link className="button secondary" to="/demo">
              View demo
            </Link>
          </div>
          <small>X Layer Testnet · GenLayer Studionet</small>
        </div>
        <DossierPreview />
      </section>
      <section className="public-section" id="how">
        <p className="eyebrow">How it works</p>
        <h2>Terms, evidence, judgment, settlement.</h2>
        <div className="process-grid">
          {[
            [
              "01",
              "Lock the terms",
              "Agreement and approved amendments establish the current governing requirement.",
            ],
            [
              "02",
              "Inspect the evidence",
              "Page-aware extraction preserves provenance while citations are validated.",
            ],
            [
              "03",
              "Resolve contested meaning",
              "GenLayer validators independently adjudicate disputed evidence.",
            ],
            [
              "04",
              "Settle deterministically",
              "X Layer escrow executes only threshold-authorized outcomes.",
            ],
          ].map(([n, t, b]) => (
            <article key={n}>
              <span>{n}</span>
              <h3>{t}</h3>
              <p>{b}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="public-showcase" aria-labelledby="showcase-title">
        <div className="showcase-copy">
          <p className="eyebrow">One connected dossier</p>
          <h2 id="showcase-title">See the line from requirement to outcome.</h2>
          <p>
            Tolerance keeps each governing term beside its evidence, evaluation,
            and commercial state—so a decision can be inspected before it is
            acted on.
          </p>
          <Link className="button secondary" to="/demo">
            Inspect the demo dossier
          </Link>
        </div>
        <div className="showcase-table" aria-label="Example requirement matrix">
          <div className="showcase-row header">
            <span>Requirement</span>
            <span>Governing term</span>
            <span>Evidence</span>
            <span>Status</span>
          </div>
          <div className="showcase-row">
            <b>Diameter tolerance</b>
            <span>
              ±0.15 mm
              <br />
              <small>Approved amendment</small>
            </span>
            <span>
              50.10 mm
              <br />
              <small>Report · p.2</small>
            </span>
            <span className="status">Pass</span>
          </div>
          <div className="showcase-row">
            <b>Material grade</b>
            <span>316L stainless</span>
            <span>
              316L certificate
              <br />
              <small>Report · p.1</small>
            </span>
            <span className="status">Pass</span>
          </div>
          <div className="showcase-row">
            <b>Inspection certificate</b>
            <span>Certificate required</span>
            <span className="muted">Not submitted</span>
            <span className="status warning">Review</span>
          </div>
        </div>
      </section>
      <section className="branch-section" aria-labelledby="branch-title">
        <h2 id="branch-title">Only contested meaning needs adjudication.</h2>
        <div className="branch-path">
          <p className="eyebrow">Uncontested</p>
          <h3>Challenge window closes without objection</h3>
          <p>
            Evidence is evaluated, an outcome is proposed, and X Layer can
            finalize the authorized commercial result.
          </p>
        </div>
        <div className="branch-path contested">
          <p className="eyebrow">Contested</p>
          <h3>A party challenges the proposed outcome</h3>
          <p>
            The packet commitment is recorded on X Layer before GenLayer
            independently adjudicates the disputed evidence.
          </p>
        </div>
      </section>
      <div className="trust-wrap" id="security">
        <section className="trust-section">
          <div>
            <p className="eyebrow">Why Tolerance</p>
            <h2>No single AI or backend controls the payment.</h2>
          </div>
          <div className="trust-lines">
            <p>
              <b>AI</b> interprets evidence.
            </p>
            <p>
              <b>Tolerance</b> validates provenance.
            </p>
            <p>
              <b>GenLayer</b> decides contested meaning.
            </p>
            <p>
              <b>X Layer</b> controls the money.
            </p>
          </div>
          <p className="security-copy">
            Complete private documents remain offchain. Validators receive only
            the curated dispute packet needed for adjudication. Buyer and
            supplier wallets remain user-controlled.
          </p>
          <div
            className="trust-diagram"
            aria-label="Tolerance trust architecture"
          >
            <div className="trust-node">
              <b>Private evidence</b>
              <span>Documents stay offchain</span>
            </div>
            <div className="trust-node">
              <b>Tolerance</b>
              <span>Provenance + evaluation</span>
            </div>
            <div className="trust-node">
              <b>Contested?</b>
              <span>Challenge determines path</span>
            </div>
            <div className="trust-node">
              <b>GenLayer</b>
              <span>Contested meaning only</span>
            </div>
            <div className="trust-node">
              <b>X Layer</b>
              <span>Deterministic settlement</span>
            </div>
          </div>
        </section>
      </div>
      <section className="public-cta">
        <div>
          <p className="eyebrow">Explore Tolerance</p>
          <h2>Inspect the evidence trail yourself.</h2>
          <p className="muted">
            The public dossier is synthetic, sanitized, and read-only.
          </p>
        </div>
        <div className="button-row">
          <Link className="button" to="/signup">
            Create workspace
          </Link>
          <Link className="button secondary" to="/demo">
            View demo
          </Link>
        </div>
      </section>
      <footer className="public-footer">
        <Brand compact />
        <span>Evidence-to-payment assurance</span>
        <span>Test deployment: X Layer 1952 · GenLayer 61999</span>
      </footer>
    </main>
  );
}

function DossierPreview() {
  return (
    <div className="dossier-preview" aria-label="Example manufacturing dossier">
      <div className="preview-head">
        <span>INSPECTION DOSSIER</span>
        <b>TM-316L-014</b>
      </div>
      <div className="preview-row">
        <span>Requirement</span>
        <strong>Diameter tolerance</strong>
      </div>
      <div className="preview-row">
        <span>Governing term</span>
        <strong>±0.15 mm</strong>
        <small>Approved amendment · supersedes ±0.25 mm</small>
      </div>
      <div className="preview-row">
        <span>Evidence</span>
        <strong>50.10 mm</strong>
        <small>Inspection report · page 2</small>
      </div>
      <div className="preview-result">
        <span>Evidence evaluation</span>
        <b>● Satisfied</b>
      </div>
      <div className="preview-flow">
        <span>Verified resolution</span>
        <i>→</i>
        <span>Milestone settlement</span>
      </div>
    </div>
  );
}
