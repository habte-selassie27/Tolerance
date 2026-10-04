import { Link } from "react-router";

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
