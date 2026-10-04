import { describe, expect, it } from "vitest";

import {
  buildJudgeV2SyntheticProof,
  parseJudgeV2CaseCliOutput,
} from "../src/server/judge-v2-synthetic-proof";
import { packetTransportMetadata } from "../src/server/genlayer-submission";

const sourceUrl =
  "https://raw.githubusercontent.com/ometere123/tolerance/0123456789abcdef0123456789abcdef01234567/genlayer/fixtures/rc5b2-5-synthetic-evidence.json";

describe("isolated JudgeV2 synthetic proof", () => {
  it("freezes a source reference before constructing an exact V2 packet", () => {
    const proof = buildJudgeV2SyntheticProof({ sourceUrl });
    const packet = JSON.parse(proof.canonicalPacket) as {
      publicSources: Array<Record<string, unknown>>;
      xLayerEscrow: string;
      obligationId: number;
    };
    expect(packet.xLayerEscrow).toBe(
      "0x0000000000000000000000000000000000000001",
    );
    expect(packet.obligationId).toBe(5_025_001);
    expect(packet.publicSources).toHaveLength(1);
    expect(packet.publicSources[0]).toMatchObject({
      canonicalUrl: sourceUrl,
      allowedHost: "raw.githubusercontent.com",
      retrievalMode: "GET_JSON",
      extractionRule: "JSON_FIELD:measurementMm",
    });
    expect(packet.publicSources[0]).not.toHaveProperty("content");
    expect(packet.publicSources[0]).not.toHaveProperty("fetchedContent");
    expect(packet.publicSources[0]).not.toHaveProperty("measurementMm");
    expect(packetTransportMetadata(proof.canonicalPacket)).toEqual(
      proof.metadata,
    );
  });

  it("uses a separate case and policy for the deterministic hash mismatch proof", () => {
    const proof = buildJudgeV2SyntheticProof({
      sourceUrl,
      failureMode: "EXPECTED_CONTENT_HASH_MISMATCH",
    });
    const packet = JSON.parse(proof.canonicalPacket) as {
      obligationId: number;
      publicSources: Array<{ expectedContentHash?: string }>;
    };
    expect(packet.obligationId).toBe(5_025_002);
    expect(packet.publicSources[0].expectedContentHash).toBe(
      `0x${"ff".repeat(32)}`,
    );
  });

  it("rejects a non-HTTPS source before a durable intent can be created", () => {
    expect(() =>
      buildJudgeV2SyntheticProof({
        sourceUrl: "http://raw.githubusercontent.com/unsafe.json",
      }),
    ).toThrow("SOURCE_URL_INVALID");
  });

  it("parses only the bounded get_case result from CLI output", () => {
    expect(
      parseJudgeV2CaseCliOutput(
        'Result:\n{"resolved":true,"verdict":"INSUFFICIENT_EVIDENCE"}\n[genlayer-js] deprecation',
      ),
    ).toEqual({ resolved: true, verdict: "INSUFFICIENT_EVIDENCE" });
    expect(
      parseJudgeV2CaseCliOutput("Result:\n\n[genlayer-js] deprecation"),
    ).toBe("");
  });
});
