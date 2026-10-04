import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateSignupInput } from "../src/lib/auth-input";

describe("product onboarding and public demo", () => {
  it("accepts a valid signup and rejects malformed or weak credentials", () => {
    expect(
      validateSignupInput({
        name: "Ada Buyer",
        email: "ada@example.com",
        password: "Tolerance9",
        confirmPassword: "Tolerance9",
      }).ok,
    ).toBe(true);
    expect(
      validateSignupInput({
        name: "A",
        email: "bad",
        password: "short",
        confirmPassword: "different",
      }).ok,
    ).toBe(false);
  });

  it("keeps the public demo synthetic, read-only, and outside the authenticated app", () => {
    const demo = readFileSync("src/client/routes/demo.tsx", "utf8");
    expect(demo).toContain("Synthetic read-only demo");
    expect(demo).toContain("not a live-chain transaction");
    expect(demo).not.toContain("use server");
    expect(demo).not.toContain("prisma");
  });

  it("renders the required landing thesis and onboarding calls to action", () => {
    const landing = readFileSync("src/client/routes/home.tsx", "utf8");
    for (const text of [
      "Create workspace",
      "View demo",
      "Lock the terms",
      "Resolve contested meaning",
      "controls the money",
    ])
      expect(landing).toContain(text);
  });

  it("keeps user wallets separate from the GenLayer worker identity", () => {
    const wallet = readFileSync("src/server/wallet-ownership.ts", "utf8");
    expect(wallet).toContain("recoverMessageAddress");
    expect(wallet).toContain(
      "This signature does not authorize a transaction or transfer funds.",
    );
    expect(wallet).not.toContain("privateKey");
  });
});
