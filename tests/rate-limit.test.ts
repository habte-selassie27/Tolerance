import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";

import { ApiError } from "../src/api/errors";
import { rateLimit, resetRateLimits } from "../src/api/rate-limit";

function fakeRequest(ip: string, method = "POST"): Request {
  return { ip, method, headers: {} } as unknown as Request;
}

function run(handler: ReturnType<typeof rateLimit>, request: Request) {
  const errors: unknown[] = [];
  handler(
    request,
    {} as Response,
    ((error?: unknown) => {
      if (error) errors.push(error);
    }) as NextFunction,
  );
  return errors;
}

describe("auth rate limiting", () => {
  it("allows a request inside the budget and throttles past it", () => {
    resetRateLimits();
    const limiter = rateLimit({ name: "test", limit: 3, windowMs: 60_000 });
    const request = fakeRequest("10.0.0.1");

    expect(run(limiter, request)).toHaveLength(0); // 1
    expect(run(limiter, request)).toHaveLength(0); // 2
    expect(run(limiter, request)).toHaveLength(0); // 3

    const blocked = run(limiter, request);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toBeInstanceOf(ApiError);
    const error = blocked[0] as ApiError;
    expect(error.status).toBe(429);
    expect(error.code).toBe("RATE_LIMITED");
    // The caller is told when to come back.
    expect(error.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("budgets per client so one address cannot exhaust another's", () => {
    resetRateLimits();
    const limiter = rateLimit({ name: "test", limit: 1, windowMs: 60_000 });
    expect(run(limiter, fakeRequest("10.0.0.2"))).toHaveLength(0);
    expect(run(limiter, fakeRequest("10.0.0.2"))).toHaveLength(1);
    // A different client still has its full budget.
    expect(run(limiter, fakeRequest("10.0.0.3"))).toHaveLength(0);
  });

  it("keeps separate budgets per limiter name", () => {
    resetRateLimits();
    const challenge = rateLimit({
      name: "challenge",
      limit: 1,
      windowMs: 60_000,
    });
    const verify = rateLimit({ name: "verify", limit: 1, windowMs: 60_000 });
    expect(run(challenge, fakeRequest("10.0.0.4"))).toHaveLength(0);
    // The verify limiter must not inherit the challenge limiter's exhaustion.
    expect(run(verify, fakeRequest("10.0.0.4"))).toHaveLength(0);
  });

  it("refuses to describe the caller", () => {
    resetRateLimits();
    const limiter = rateLimit({ name: "test", limit: 1, windowMs: 60_000 });
    run(limiter, fakeRequest("10.0.0.5"));
    const error = run(limiter, fakeRequest("10.0.0.5"))[0] as ApiError;
    expect(error.message).not.toContain("10.0.0.5");
    expect(error.message).toBe(
      "Too many attempts. Wait a moment and try again.",
    );
  });
});
