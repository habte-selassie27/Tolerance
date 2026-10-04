import { describe, expect, it } from "vitest";
import {
  canTransitionObligation,
  isAutomaticOutcome,
} from "../packages/domain/src";

describe("Tolerance obligation terminology", () => {
  it("encodes the approved linear acceptance and funding progression", () => {
    expect(canTransitionObligation("DRAFT", "PENDING_ACCEPTANCE")).toBe(true);
    expect(canTransitionObligation("ACCEPTED", "FUNDED")).toBe(true);
    expect(canTransitionObligation("FUNDED", "SETTLED")).toBe(false);
  });

  it("keeps discretionary splits out of the automatic outcome path", () => {
    expect(isAutomaticOutcome("RELEASE_AUTHORISED_AMOUNT")).toBe(true);
    expect(isAutomaticOutcome("RESOLVER_SPLIT")).toBe(false);
  });
});
