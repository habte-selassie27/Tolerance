export function appOrigin() {
  return (process.env.TOLERANCE_APP_ORIGIN ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

/** Only same-origin relative paths are accepted as post-authentication targets. */
export function safeNextPath(
  candidate: string | null | undefined,
  fallback: string,
) {
  const next = candidate ?? "";
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}
