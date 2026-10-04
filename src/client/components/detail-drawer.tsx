"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

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
