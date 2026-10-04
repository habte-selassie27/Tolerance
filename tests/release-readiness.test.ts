import { describe, expect, it } from "vitest";

import {
  assertAutomaticAttestationDisabled,
  parseServerEnvironment,
} from "../src/config/env";
import {
  configuredDisputePacketMaxBytes,
  DisputePacketError,
} from "../src/server/dispute-packet";

describe("release readiness safeguards", () => {
  it("requires an origin in production and preserves the attestation fail-closed gate", () => {
    expect(() =>
      parseServerEnvironment({
        NODE_ENV: "production",
        TOLERANCE_ENVIRONMENT: "production",
        AUTOMATIC_ATTESTATION_ENABLED: "false",
      }),
    ).toThrow();
    expect(
      parseServerEnvironment({
        NODE_ENV: "production",
        TOLERANCE_ENVIRONMENT: "production",
        TOLERANCE_APP_ORIGIN: "https://staging.example.test",
        AUTOMATIC_ATTESTATION_ENABLED: "false",
      }).TOLERANCE_APP_ORIGIN,
    ).toBe("https://staging.example.test");
    expect(() =>
      assertAutomaticAttestationDisabled({
        AUTOMATIC_ATTESTATION_ENABLED: "true",
      }),
    ).toThrow("intentionally unavailable");
  });

  it("keeps packet-size protection configurable but bounded", () => {
    expect(configuredDisputePacketMaxBytes("120000")).toBe(120000);
    expect(() => configuredDisputePacketMaxBytes("120001")).toThrow(
      DisputePacketError,
    );
  });
});
