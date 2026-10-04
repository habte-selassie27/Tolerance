import type { Request, RequestHandler } from "express";

import { ApiError } from "./errors";

/**
 * A fixed-window counter kept in process memory. It exists to blunt credential
 * and signature oracles; it is deliberately not a substitute for a shared
 * store, because a multi-instance deployment would give each instance its own
 * budget. Move this to Redis before scaling out.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function clientAddress(request: Request) {
  return request.ip ?? request.socket.remoteAddress ?? "unknown";
}

export function rateLimit(options: {
  name: string;
  limit: number;
  windowMs: number;
}): RequestHandler {
  return (request, _response, next) => {
    const now = Date.now();
    sweep(now);
    const key = `${options.name}:${clientAddress(request)}`;
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > options.limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      next(
        new ApiError(
          429,
          "Too many attempts. Wait a moment and try again.",
          "RATE_LIMITED",
          retryAfter,
        ),
      );
      return;
    }
    next();
  };
}

/** Exposed for tests, which need a clean budget between cases. */
export function resetRateLimits() {
  buckets.clear();
}
