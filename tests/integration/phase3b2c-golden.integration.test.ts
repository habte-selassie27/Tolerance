import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDisputePacketV1 } from "../../src/server/dispute-packet";
import { phase3b2cFixture } from "../fixtures/phase3b2c";

if (process.env.RUN_PHASE3_INTEGRATION_TESTS !== "1")
  throw new Error("Set RUN_PHASE3_INTEGRATION_TESTS=1 to run this suite.");

const fixturePath = resolve(
  process.cwd(),
  "genlayer/tests/fixtures/phase3b2c-application-packets.json",
);

function buildGolden() {
  return {
    schemaVersion: "1",
    cases: [
      ["release", "RELEASE_FULL", "SATISFIED"],
      ["insufficient", "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE"],
      ["refund", "REFUND_FULL", "NOT_SATISFIED"],
      ["injection", "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE"],
    ].map(([kind, verdict, status]) => {
      const built = createDisputePacketV1(
        phase3b2cFixture(
          kind as "release" | "insufficient" | "refund" | "injection",
        ),
      );
      return {
        name: kind,
        canonicalJson: built.canonicalJson,
        disputePacketHash: built.disputePacketHash,
        expectedVerdict: verdict,
        adjudication: {
          verdict,
          requirements: [
            {
              requirement_id: "R-002",
              status,
              source_ids:
                status === "INSUFFICIENT_EVIDENCE"
                  ? []
                  : built.packet.sourceBlocks
                      .filter((source) =>
                        String(source.content).includes("Measured diameter"),
                      )
                      .map((source) => source.sourceId),
              material: true,
            },
          ],
          reasoning: "Synthetic bounded Direct Mode adjudication.",
        },
      };
    }),
  };
}

describe("Phase 3B2C frozen application packet fixture", () => {
  it("matches the production TypeScript builder byte-for-byte", () => {
    const expected = `${JSON.stringify(buildGolden(), null, 2)}\n`;
    if (process.env.UPDATE_PHASE3B2C_GOLDENS === "1")
      writeFileSync(fixturePath, expected, "utf8");
    expect(readFileSync(fixturePath, "utf8")).toBe(expected);
  });
});
