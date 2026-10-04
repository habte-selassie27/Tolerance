import { Link } from "react-router";
import { Brand } from "../components/brand";

export default function DemoPage() {
  return (
    <main className="demo-shell">
      <header className="demo-header">
        <Brand />
        <div>
          <span className="demo-badge">Synthetic read-only demo</span>
          <Link to="/signup">Create workspace</Link>
        </div>
      </header>
      <section className="demo-intro">
        <p className="eyebrow">316L precision component</p>
        <h1>Evidence, governing terms, and protocol lifecycle—connected.</h1>
        <p>
          This sanitized dossier demonstrates Tolerance without exposing a
          customer record or simulating a live transaction.
        </p>
      </section>
      <nav className="tabs" aria-label="Demo dossier sections">
        <a href="#terms">Terms</a>
        <a href="#evidence">Evidence</a>
        <a href="#evaluation">Evaluation</a>
        <a href="#lifecycle">Lifecycle</a>
      </nav>
      <section className="demo-grid">
        <article className="panel" id="terms">
          <p className="eyebrow">Governing requirement</p>
          <h2>Diameter tolerance</h2>
          <div className="governing-value">±0.15 mm</div>
          <p>
            <b>Approved amendment</b> · current effective term
          </p>
          <details>
            <summary>Amendment lineage</summary>
            <p>
              Supersedes the original ±0.25 mm tolerance. Both sources remain
              auditable.
            </p>
          </details>
        </article>
        <article className="panel" id="evidence">
          <p className="eyebrow">Inspection evidence</p>
          <h2>50.10 mm measured</h2>
          <p>Supplier inspection report · page 2</p>
          <blockquote>
            Measured diameter: 50.10 mm. Material: 316L stainless steel.
          </blockquote>
          <details>
            <summary>Source provenance</summary>
            <p>
              Curated synthetic SourceBlock with page and document provenance.
              No storage key or private PDF is exposed.
            </p>
          </details>
          <p className="muted">
            Private evidence can be counterparty acknowledged by exact document
            hash. A future public source is only labelled validator verified
            after GenLayer validators fetch it under a pre-agreed policy.
          </p>
        </article>
        <article className="panel" id="evaluation">
          <p className="eyebrow">Evidence evaluation</p>
          <h2 className="success-text">Satisfied</h2>
          <p>
            The measured diameter falls within 50.00 mm ±0.15 mm and the cited
            material grade is 316L.
          </p>
          <p className="muted">
            AI evaluates evidence; Tolerance validates citations. This is not
            final payment authority.
          </p>
        </article>
        <article className="panel" id="lifecycle">
          <p className="eyebrow">Contested lifecycle</p>
          <h2>From commitment to settlement</h2>
          <div className="timeline">
            <div className="timeline-row complete">
              <span>✓</span>
              <p>Evidence packet frozen</p>
            </div>
            <div className="timeline-row complete">
              <span>✓</span>
              <p>X Layer dispute commitment</p>
            </div>
            <div className="timeline-row complete">
              <span>✓</span>
              <p>GenLayer adjudication</p>
            </div>
            <div className="timeline-row active">
              <span>●</span>
              <p>Independent settlement verification</p>
            </div>
            <div className="timeline-row">
              <span>○</span>
              <p>X Layer settlement</p>
            </div>
          </div>
          <p className="demo-note">
            Illustrative synthetic state—not a live-chain transaction.
          </p>
        </article>
      </section>
      <section className="demo-cta">
        <h2>Ready to build a real dossier?</h2>
        <Link className="button" to="/signup">
          Create workspace
        </Link>
        <Link className="button secondary" to="/">
          Back to product
        </Link>
      </section>
    </main>
  );
}
