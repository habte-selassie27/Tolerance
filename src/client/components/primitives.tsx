import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { ReactNode } from "react";

export function Brand({
  href = "/",
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link className="tolerance-brand" to={href} aria-label="Tolerance home">
      <svg
        className="brand-mark"
        viewBox="0 0 40 40"
        role="img"
        aria-label="Tolerance precision alignment mark"
      >
        <path d="M5 9v22h8M35 9v22h-8" />
        <path d="M10 20h7m13 0h-7" />
        <circle cx="20" cy="20" r="3.5" />
      </svg>
      {!compact && <span>TOLERANCE</span>}
    </Link>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "success" | "warning" | "danger" | "neutral" | "info";
}) {
  return <span className={`status ${tone}`}>{children}</span>;
}

export function DetailDrawer({
  title,
  triggerLabel,
  tone = "neutral",
  children,
}: {
  title: string;
  triggerLabel: string;
  tone?: "neutral" | "success" | "warning" | "info";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <button
        className={`status ${tone}`}
        type="button"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      {open && (
        <div
          className="drawer-layer"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <aside
            className="detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">Evidence review</p>
                <h2 id="drawer-title">{title}</h2>
              </div>
              <button
                className="drawer-close"
                type="button"
                aria-label="Close detail panel"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </header>
            <div className="drawer-content">{children}</div>
          </aside>
        </div>
      )}
    </>
  );
}
