import { describe, expect, it } from "vitest";
import {
  canonicalDisputePacketJson,
  hashDisputePacketV1,
} from "../genlayer/schemas/dispute-packet";

describe("DisputePacketV1 canonical JSON", () => {
  it("uses compact sorted UTF-8 JSON and a SHA-256 hash", () => {
    const packet = {
      z: "é",
      nested: { b: true, a: null },
      items: [2, "😀"],
    } as const;
    expect(canonicalDisputePacketJson(packet)).toBe(
      '{"items":[2,"😀"],"nested":{"a":null,"b":true},"z":"é"}',
    );
    expect(hashDisputePacketV1(packet)).toBe(
      "0x71b911eba064ef7919f70fe95ae950cd8ded10e108de2a4bc8fa18277c65dd9c",
    );
  });

  it("rejects non-reproducible numeric forms", () => {
    expect(() => canonicalDisputePacketJson({ amount: 0.1 })).toThrow();
    expect(() =>
      canonicalDisputePacketJson({ amount: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow();
  });
});
