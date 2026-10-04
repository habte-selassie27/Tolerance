import { describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../src/config/env";

describe("server environment", () => {
  it("fails closed when production origin is absent", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        TOLERANCE_ENVIRONMENT: "production",
      }),
    ).toThrow("TOLERANCE_APP_ORIGIN is required in production.");
  });

  it("accepts a valid production origin", () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: "production",
        TOLERANCE_ENVIRONMENT: "production",
        TOLERANCE_APP_ORIGIN: "https://tolerance.example",
      }),
    ).toMatchObject({ TOLERANCE_ENVIRONMENT: "production" });
  });
});
